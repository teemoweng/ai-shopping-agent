import json
from concurrent.futures import ThreadPoolExecutor
from contextlib import contextmanager
from datetime import UTC, datetime
from pathlib import Path
from threading import Event

import pytest

from app.domain import contracts
from app.domain.contracts import (
    CartPreviewRequest,
    CompareRequest,
    CreateGuideSessionRequest,
    EntryPoint,
    GuideAction,
    GuideMessageRequest,
    GuideStatus,
    GuideViewKind,
    RecommendationCard,
    WorkflowState,
)
from app.repositories.fixture_repository import FixtureRepository
from app.repositories.session_repository import SessionRepository
from app.services.cart_service import CartConflict, CartService
from app.services.guide_conversation import request_digest
from app.services.guide_service import GuideConflict, GuideService
from app.workflow import agent
from app.workflow import engine as engine_module
from app.workflow.engine import WorkflowEngine
from app.workflow.tools import ShoppingTools

FIXTURE_ROOT = Path(__file__).parents[4] / "data" / "fixtures"


def build_services(tmp_path):
    fixtures = FixtureRepository.load(FIXTURE_ROOT)
    sessions = SessionRepository(tmp_path / "trace.jsonl")
    engine = WorkflowEngine(ShoppingTools(fixtures), sessions)
    return engine, CartService(fixtures, sessions), sessions


def test_request_digest_uses_canonical_unicode_json() -> None:
    first = {"text": "适合油皮吗？", "nested": {"b": 2, "a": 1}}
    reordered = {"nested": {"a": 1, "b": 2}, "text": "适合油皮吗？"}

    assert request_digest(first) == (
        "64970d026fc7193bd87e3e05dd435969c78db8e5bd0630af3deaecded1e8aab9"
    )
    assert request_digest(reordered) == request_digest(first)


def test_every_guide_view_has_explicit_server_actions() -> None:
    expected = {
        "OPENING_CONTEXT": ["SEND_MESSAGE", "RETURN_TO_FEED"],
        "ANSWER_READY": ["SEND_MESSAGE", "RETURN_TO_FEED"],
        "CONTEXT_CONFIRMATION": [
            "SEND_MESSAGE",
            "CONFIRM_CONTEXT",
            "RETURN_TO_FEED",
        ],
        "WAITING_CLARIFICATION": [
            "SEND_MESSAGE",
            "ANSWER_CLARIFICATION",
            "SKIP_CLARIFICATION",
            "UPDATE_CONSTRAINTS",
            "RETURN_TO_FEED",
        ],
        "VERIFYING_FACTS": ["RETURN_TO_FEED"],
        "DECISION_READY": [
            "SEND_MESSAGE",
            "UPDATE_CONSTRAINTS",
            "REQUEST_COMPARISON",
            "OPEN_PRODUCT",
            "RETURN_TO_FEED",
        ],
        "NO_MATCH": ["SEND_MESSAGE", "RELAX_CONSTRAINT", "RETURN_TO_FEED"],
        "INSUFFICIENT_EVIDENCE": [
            "SEND_MESSAGE",
            "OPEN_PRODUCT",
            "CONTINUE_WITH_KNOWN",
            "RETURN_TO_FEED",
        ],
        "COMPARISON_READY": [
            "SEND_MESSAGE",
            "OPEN_PRODUCT",
            "RETURN_TO_FEED",
        ],
        "SAFE_BOUNDARY": ["RETURN_TO_FEED"],
        "RECOVERY_REQUIRED": ["RETRY_GUIDE_OPERATION", "RETURN_TO_FEED"],
        "FATAL_ERROR": ["RETURN_TO_FEED"],
    }
    assert {
        view_kind.value: [
            action.value for action in agent.allowed_actions_for(view_kind)
        ]
        for view_kind in GuideViewKind
    } == expected


def _opening_transcript_message() -> contracts.GuideTranscriptMessage:
    return contracts.GuideTranscriptMessage(
        id="gmsg_1",
        sequence=1,
        role=contracts.GuideTranscriptRole.ASSISTANT,
        kind=contracts.GuideTranscriptKind.OPENING,
        text="我看到你在看 Seoul Shade。你最想确认什么？",
        quick_replies=["适合油皮吗？", "会不会泛白？", "和防水款比比"],
    )


def _opening_turn(
    transcript: list[contracts.GuideTranscriptMessage],
) -> contracts.GuideTurnResponse:
    opening = _opening_transcript_message()
    return contracts.GuideTurnResponse(
        session_id="ses_1",
        trace_id="trc_1",
        locale="zh-CN",
        state=WorkflowState.UNDERSTAND,
        kind="opening",
        text=opening.text,
        context={
            "id": "context_1",
            "anchor_product_id": "seoul-shade-daily-fluid",
            "anchor_product_name": "Seoul Shade Daily Fluid",
            "creator_handle": "@creator",
            "caption": "caption",
            "claims": [],
        },
        guide_status=GuideStatus.WAITING_USER,
        guide_view_kind=GuideViewKind.OPENING_CONTEXT,
        guide_revision=1,
        facts_snapshot_at=datetime.now(UTC),
        allowed_actions=[GuideAction.SEND_MESSAGE, GuideAction.RETURN_TO_FEED],
        conversation_revision=1,
        transcript=transcript,
    )


def _user_transcript_message() -> contracts.GuideTranscriptMessage:
    return contracts.GuideTranscriptMessage(
        id="gmsg_2",
        sequence=2,
        role=contracts.GuideTranscriptRole.USER,
        kind=contracts.GuideTranscriptKind.USER_TEXT,
        text="适合油皮吗？",
    )


def test_guide_turn_transcript_contract_requires_ordered_matching_messages() -> None:
    opening = _opening_transcript_message()
    valid_recommendation = RecommendationCard(
        product_id="seoul-shade-daily-fluid",
        brand="Seoul Shade",
        name="Daily Fluid",
        verdict="SUITABLE",
        fit_reasons=["fragrance-free"],
        tradeoffs=["natural finish"],
        eligible_sku_ids=["seoul-shade-50"],
        starting_price_usd=14,
        evidence_ids=["fda-sunscreen-basics"],
    )

    with pytest.raises(ValueError):
        contracts.GuideTranscriptMessage(
            id="gmsg_bad",
            sequence=2,
            role="USER",
            kind="USER_TEXT",
            text="适合油皮吗？",
            recommendations=[valid_recommendation],
        )

    response = _opening_turn([opening])

    assert response.conversation_revision == 1
    assert response.transcript == [opening]

    user_message = _user_transcript_message()
    with pytest.raises(ValueError):
        contracts.GuideTurnResponse.model_validate(
            response.model_dump()
            | {
                "transcript": [
                    opening,
                    user_message,
                    opening.model_copy(update={"sequence": 3}),
                ]
            }
        )
    with pytest.raises(ValueError):
        contracts.GuideTurnResponse.model_validate(
            response.model_dump()
            | {
                "transcript": [
                    opening,
                    user_message,
                    opening.model_copy(update={"id": "gmsg_3", "sequence": 1}),
                ]
            }
        )
    with pytest.raises(ValueError):
        contracts.GuideTurnResponse.model_validate(
            response.model_dump() | {"guide_view_kind": GuideViewKind.ANSWER_READY}
        )


def test_guide_turn_rejects_a_user_only_transcript() -> None:
    user_message = _user_transcript_message().model_copy(update={"sequence": 1})

    with pytest.raises(ValueError):
        _opening_turn([user_message])


def test_guide_turn_rejects_a_trailing_user_message() -> None:
    with pytest.raises(ValueError):
        _opening_turn([_opening_transcript_message(), _user_transcript_message()])


@pytest.mark.parametrize("failure_mode", ["blank", "exception"])
def test_invalid_primary_copy_uses_verified_decision_fallback_without_retry(
    tmp_path,
    monkeypatch,
    failure_mode: str,
) -> None:
    engine, _, sessions = build_services(tmp_path)
    session = sessions.create(
        EntryPoint.CONTENT,
        "morning-routine-uv-001",
        None,
        locale="zh-CN",
    )
    engine.open_session(session)

    def failed_renderer(locale: str, *, evidence_is_insufficient: bool) -> str:
        if failure_mode == "exception":
            raise RuntimeError("injected presentation failure")
        return ""

    monkeypatch.setattr(engine_module, "recommendation_text", failed_renderer)

    turn = engine.handle_message(
        session,
        GuideMessageRequest(message_id="msg_fallback", text="预算30美元以内"),
    )

    assert turn.guide_view_kind == "DECISION_READY"
    assert turn.degraded is True
    assert turn.text.strip()
    assert turn.recommendations
    assert "RETRY_GUIDE_OPERATION" not in turn.allowed_actions


@pytest.mark.parametrize(
    "text",
    [
        "请诊断这个问题",
        "怎么治疗皮疹",
        "用了以后过敏",
        "起了荨麻疹",
        "脸部肿胀",
        "呼吸困难",
        "会有药物相互作用吗",
    ],
)
def test_chinese_health_requests_enter_safe_boundary_without_raw_trace(
    tmp_path,
    text: str,
) -> None:
    engine, _, sessions = build_services(tmp_path)
    session = sessions.create(
        EntryPoint.CONTENT,
        "morning-routine-uv-001",
        None,
        locale="zh-CN",
    )

    turn = engine.handle_message(
        session,
        GuideMessageRequest(message_id="msg_health", text=text),
    )

    assert turn.guide_view_kind == "SAFE_BOUNDARY"
    assert turn.guide_status == "SAFE_EXIT"
    assert turn.allowed_actions == ["RETURN_TO_FEED"]
    assert turn.recommendations == []
    trace_text = (tmp_path / "trace.jsonl").read_text(encoding="utf-8")
    assert text not in trace_text
    assert all(
        "text" not in event["payload"]
        for event in map(json.loads, trace_text.splitlines())
    )


@pytest.mark.parametrize("text", ["荨麻疹", "脸部肿胀", "呼吸困难", "严重过敏"])
def test_chinese_urgent_symptoms_keep_distinct_emergency_wording(
    tmp_path,
    text: str,
) -> None:
    engine, _, sessions = build_services(tmp_path)
    session = sessions.create(
        EntryPoint.CONTENT,
        "morning-routine-uv-001",
        None,
        locale="zh-CN",
    )

    turn = engine.handle_message(
        session,
        GuideMessageRequest(message_id="msg_urgent", text=text),
    )

    assert "立即寻求紧急医疗帮助" in turn.text


@pytest.mark.parametrize(
    (
        "text",
        "expected_view",
        "expected_tool_events",
        "expected_recommendation_count",
        "expected_guide_delta",
    ),
    [
        ("油皮能用吗？", GuideViewKind.WAITING_CLARIFICATION, 0, 0, 1),
        ("适合油皮日常通勤吗？", GuideViewKind.DECISION_READY, 4, 3, 1),
        ("适合油皮，户外出汗或玩水吗？", GuideViewKind.DECISION_READY, 4, 2, 1),
        ("会泛白嘛？", GuideViewKind.ANSWER_READY, 0, 0, 0),
        ("泛不泛白？", GuideViewKind.ANSWER_READY, 0, 0, 0),
        ("防水吗？", GuideViewKind.ANSWER_READY, 0, 0, 0),
        ("不要比较，帮我选一款", GuideViewKind.DECISION_READY, 4, 3, 1),
        ("和防水款比一下", GuideViewKind.DECISION_READY, 4, 2, 1),
    ],
)
def test_chinese_intent_and_slot_routing_is_progressive_and_revision_safe(
    tmp_path,
    text: str,
    expected_view: GuideViewKind,
    expected_tool_events: int,
    expected_recommendation_count: int,
    expected_guide_delta: int,
) -> None:
    engine, _, sessions = build_services(tmp_path)
    service = GuideService(engine, sessions)
    opening = service.create(
        CreateGuideSessionRequest(
            entry_point=EntryPoint.CONTENT,
            content_context_id="morning-routine-uv-001",
            locale="zh-CN",
        )
    )
    session = sessions.get(opening.session_id)

    turn = service.message(
        session.id,
        GuideMessageRequest(
            message_id=f"intent-{expected_view.value}-{expected_guide_delta}",
            text=text,
            expected_conversation_revision=opening.conversation_revision,
        ),
    )

    tool_events = [
        event
        for event in sessions.events_for_trace(session.trace_id)
        if event.event_type in {"tool_call", "tool_result"}
    ]
    assert turn.guide_view_kind is expected_view
    assert len(tool_events) == expected_tool_events
    assert len(turn.recommendations) == expected_recommendation_count
    assert turn.guide_revision == opening.guide_revision + expected_guide_delta
    assert turn.conversation_revision == opening.conversation_revision + 1
    if "油皮" in text:
        assert session.soft_preferences.skin_type == "oily"
    if text == "适合油皮，户外出汗或玩水吗？":
        assert all(
            engine.tools.get_product(card.product_id).water_resistance_minutes
            is not None
            for card in turn.recommendations
        )
    if expected_view is GuideViewKind.WAITING_CLARIFICATION:
        assert turn.quick_replies == ["日常通勤", "户外出汗或玩水"]
    if expected_view is GuideViewKind.ANSWER_READY:
        assert turn.allowed_actions == ["SEND_MESSAGE", "RETURN_TO_FEED"]
    if "泛白" in text:
        assert "低泛白风险" in turn.text
        assert "所有肤色" in turn.text
    if text == "防水吗？":
        assert "未标注 40 或 80 分钟防水" in turn.text


def test_guide_revision_changes_only_for_decision_inputs(tmp_path) -> None:
    engine, cart, sessions = build_services(tmp_path)
    session = sessions.create(
        EntryPoint.CONTENT,
        "morning-routine-uv-001",
        None,
        locale="zh-CN",
    )
    engine.open_session(session)

    first = engine.handle_message(
        session,
        GuideMessageRequest(
            message_id="msg_1",
            text="预算30美元以内、无香精、自然妆效",
        ),
    )
    repeated = engine.handle_message(
        session,
        GuideMessageRequest(
            message_id="msg_2",
            text="预算30美元以内、无香精、自然妆效",
        ),
    )
    changed = engine.handle_message(
        session,
        GuideMessageRequest(
            message_id="msg_3",
            text="预算30美元以内、无香精、哑光妆效",
        ),
    )

    assert first.guide_revision == 2
    assert repeated.guide_revision == first.guide_revision
    assert changed.guide_revision == first.guide_revision + 1

    sessions.save_snapshot(session, changed)
    revision_before_decision_actions = session.guide_revision
    cart.compare(
        session.id,
        request=CompareRequest(
            product_ids=["cloud-veil-mineral", "seoul-shade-daily-fluid"]
        ),
    )
    assert session.guide_revision == revision_before_decision_actions
    cart.preview(
        session.id,
        request=CartPreviewRequest(sku_id="cloud-veil-50", quantity=1),
    )
    assert session.guide_revision == revision_before_decision_actions


def test_first_recommendation_authority_advances_revision_without_preferences(
    tmp_path,
) -> None:
    engine, _, sessions = build_services(tmp_path)
    session = sessions.create(
        EntryPoint.CONTENT,
        "morning-routine-uv-001",
        None,
        locale="zh-CN",
    )
    opening = engine.open_session(session)

    decision = engine.handle_message(
        session,
        GuideMessageRequest(
            message_id="authority_created_without_preferences",
            text="不要比较，帮我选一款",
        ),
    )

    assert session.hard_constraints.model_fields_set == set()
    assert session.soft_preferences.model_fields_set == set()
    assert session.eligible_sku_ids_by_product
    assert decision.guide_revision == opening.guide_revision + 1


def test_replacing_product_scoped_authority_advances_revision_once(
    tmp_path,
) -> None:
    engine, _, sessions = build_services(tmp_path)
    session = sessions.create(
        EntryPoint.CONTENT,
        "morning-routine-uv-001",
        None,
        locale="zh-CN",
    )
    engine.open_session(session)
    first = engine.handle_message(
        session,
        GuideMessageRequest(
            message_id="authority_initial_set",
            text="不要比较，帮我选一款",
        ),
    )
    inputs_before = (
        session.hard_constraints.model_copy(deep=True),
        session.soft_preferences.model_copy(deep=True),
    )
    authority_before = {
        product_id: list(sku_ids)
        for product_id, sku_ids in session.eligible_sku_ids_by_product.items()
    }

    replaced = engine.handle_message(
        session,
        GuideMessageRequest(
            message_id="authority_replace_without_preferences",
            text="和防水款比比",
        ),
    )

    assert (
        session.hard_constraints,
        session.soft_preferences,
    ) == inputs_before
    assert session.eligible_sku_ids_by_product != authority_before
    assert replaced.guide_revision == first.guide_revision + 1


def test_chinese_recommendation_copy_is_localized_distinct_and_authority_safe(
    tmp_path,
) -> None:
    engine, _, sessions = build_services(tmp_path)
    service = GuideService(engine, sessions)
    opening = service.create(
        CreateGuideSessionRequest(
            entry_point=EntryPoint.CONTENT,
            content_context_id="morning-routine-uv-001",
            locale="zh-CN",
        )
    )

    decision = service.message(
        opening.session_id,
        GuideMessageRequest(
            message_id="localized_recommendation_copy",
            text="预算20美元以内、无香精、自然妆效、日常通勤",
            expected_conversation_revision=opening.conversation_revision,
        ),
    )
    card = next(
        item
        for item in decision.recommendations
        if item.product_id == "seoul-shade-daily-fluid"
    )

    assert card.fit_reasons[0] == "自然妆效符合偏好"
    assert card.tradeoffs[0] == "未标注防水，出汗或玩水场景需换防水款"
    assert card.fit_reasons[0] != card.tradeoffs[0]
    assert "natural finish" not in " ".join(
        [*card.fit_reasons, *card.tradeoffs]
    ).lower()
    assert card.evidence_ids == [
        "fda-sunscreen-basics",
        "fda-water-resistance-labeling",
    ]
    assert card.eligible_sku_ids == ["seoul-shade-30", "seoul-shade-50"]


def test_partial_update_preserves_existing_constraints_and_repeats_stably(
    tmp_path,
) -> None:
    engine, _, sessions = build_services(tmp_path)
    session = sessions.create(
        EntryPoint.CONTENT,
        "morning-routine-uv-001",
        None,
        locale="zh-CN",
    )
    engine.open_session(session)
    initial = engine.handle_message(
        session,
        GuideMessageRequest(
            message_id="msg_partial_initial",
            text="预算30美元以内、无香精、自然妆效",
        ),
    )

    changed = engine.handle_message(
        session,
        GuideMessageRequest(message_id="msg_partial_change", text="改成哑光"),
    )

    assert session.hard_constraints.max_price_usd == 30
    assert session.hard_constraints.fragrance_free is True
    assert session.soft_preferences.finish == "matte"
    assert changed.guide_revision == initial.guide_revision + 1
    assert "jeju-sport-sun-gel" not in {
        card.product_id for card in changed.recommendations
    }

    repeated = engine.handle_message(
        session,
        GuideMessageRequest(message_id="msg_partial_repeat", text="改成哑光"),
    )
    assert repeated.guide_revision == changed.guide_revision


def test_non_preference_message_does_not_clear_constraints_or_increment_revision(
    tmp_path,
) -> None:
    engine, _, sessions = build_services(tmp_path)
    session = sessions.create(
        EntryPoint.CONTENT,
        "morning-routine-uv-001",
        None,
        locale="zh-CN",
    )
    engine.open_session(session)
    initial = engine.handle_message(
        session,
        GuideMessageRequest(
            message_id="msg_non_pref_initial",
            text="预算30美元以内、无香精、自然妆效",
        ),
    )

    follow_up = engine.handle_message(
        session,
        GuideMessageRequest(
            message_id="msg_non_pref_followup",
            text="视频里的说法可信吗？",
        ),
    )

    assert session.hard_constraints.max_price_usd == 30
    assert session.hard_constraints.fragrance_free is True
    assert session.soft_preferences.finish == "natural"
    assert follow_up.guide_revision == initial.guide_revision


def test_current_read_only_anchor_is_comparable_but_not_commerce_authority(
    tmp_path,
) -> None:
    engine, cart, sessions = build_services(tmp_path)
    service = GuideService(engine, sessions)
    opening = service.create(
        CreateGuideSessionRequest(
            entry_point=EntryPoint.CONTENT,
            content_context_id="morning-routine-uv-001",
            locale="zh-CN",
        )
    )
    decision = service.message(
        opening.session_id,
        GuideMessageRequest(
            message_id="component_read_only_compare_setup",
            text="户外出汗或玩水，和防水款比比",
            expected_conversation_revision=opening.conversation_revision,
        ),
    )
    anchor = next(
        card
        for card in decision.recommendations
        if card.product_id == "seoul-shade-daily-fluid"
    )
    eligible = next(
        card for card in decision.recommendations if card.eligible_sku_ids
    )
    session = sessions.get(opening.session_id)

    comparison = cart.compare(
        opening.session_id,
        CompareRequest(
            request_id="component_read_only_compare",
            expected_conversation_revision=decision.conversation_revision,
            product_ids=[anchor.product_id, eligible.product_id],
        ),
    )

    assert anchor.eligible_sku_ids == []
    assert comparison.product_ids == [anchor.product_id, eligible.product_id]
    assert anchor.product_id not in session.recommended_product_ids
    assert anchor.product_id not in session.eligible_sku_ids_by_product
    with pytest.raises(CartConflict, match="SKU_NOT_RECOMMENDED"):
        cart.preview(
            opening.session_id,
            CartPreviewRequest(sku_id="seoul-shade-30", quantity=1),
        )


@pytest.mark.parametrize("compare_first", [False, True], ids=["recommendation", "comparison"])
def test_explanation_reuses_current_decision_without_reranking_or_expanding_authority(
    tmp_path,
    compare_first: bool,
) -> None:
    engine, cart, sessions = build_services(tmp_path)
    service = GuideService(engine, sessions)
    opening = service.create(
        CreateGuideSessionRequest(
            entry_point=EntryPoint.CONTENT,
            content_context_id="morning-routine-uv-001",
            locale="zh-CN",
        )
    )
    decision = service.message(
        opening.session_id,
        GuideMessageRequest(
            message_id="explanation_setup",
            text="预算30美元以内、自然妆效",
            expected_conversation_revision=opening.conversation_revision,
        ),
    )
    if compare_first:
        cart.compare(
            opening.session_id,
            CompareRequest(
                request_id="explanation_compare_setup",
                expected_conversation_revision=decision.conversation_revision,
                product_ids=[
                    item.product_id for item in decision.recommendations[:2]
                ],
            ),
        )

    before = service.get(opening.session_id)
    session = sessions.get(opening.session_id)
    recommended_before = list(session.recommended_product_ids)
    eligible_skus_before = {
        product_id: list(sku_ids)
        for product_id, sku_ids in session.eligible_sku_ids_by_product.items()
    }
    events_before = sessions.events_for_trace(session.trace_id)

    explained = service.message(
        opening.session_id,
        GuideMessageRequest(
            message_id=f"explain_current_{compare_first}",
            text="为什么？",
            expected_conversation_revision=before.conversation_revision,
        ),
    )

    assert explained.guide_view_kind is before.guide_view_kind
    assert explained.state is before.state
    assert explained.guide_revision == before.guide_revision
    assert explained.conversation_revision == before.conversation_revision + 1
    assert explained.allowed_actions == before.allowed_actions
    assert explained.recommendations == before.recommendations
    assert explained.comparison == before.comparison
    assert explained.facts_snapshot_at == before.facts_snapshot_at
    assert session.recommended_product_ids == recommended_before
    assert session.eligible_sku_ids_by_product == eligible_skus_before
    assert sessions.events_for_trace(session.trace_id) == events_before
    expected_kind = "COMPARISON" if compare_first else "RECOMMENDATION"
    assert explained.transcript[-1].kind == expected_kind
    if compare_first:
        compared_product_ids = set(before.comparison.product_ids)
        compared_names = {
            card.name
            for card in before.recommendations
            if card.product_id in compared_product_ids
        }
        assert len(compared_names) == 2
        assert all(name in explained.text for name in compared_names)
    else:
        primary = next(
            card for card in before.recommendations if card.eligible_sku_ids
        )
        assert primary.fit_reasons[0] in explained.text
        assert primary.tradeoffs[0] in explained.text


def test_explanation_without_current_decision_uses_lightweight_honest_fallback(
    tmp_path,
) -> None:
    engine, _, sessions = build_services(tmp_path)
    service = GuideService(engine, sessions)
    opening = service.create(
        CreateGuideSessionRequest(
            entry_point=EntryPoint.CONTENT,
            content_context_id="morning-routine-uv-001",
            locale="zh-CN",
        )
    )
    session = sessions.get(opening.session_id)
    events_before = sessions.events_for_trace(session.trace_id)

    explained = service.message(
        opening.session_id,
        GuideMessageRequest(
            message_id="explain_without_decision",
            text="为什么？",
            expected_conversation_revision=opening.conversation_revision,
        ),
    )

    assert explained.guide_view_kind is GuideViewKind.ANSWER_READY
    assert explained.guide_revision == opening.guide_revision
    assert explained.conversation_revision == opening.conversation_revision + 1
    assert explained.recommendations == []
    assert explained.comparison is None
    assert explained.allowed_actions == ["SEND_MESSAGE", "RETURN_TO_FEED"]
    assert session.recommended_product_ids == []
    assert session.eligible_sku_ids_by_product == {}
    assert sessions.events_for_trace(session.trace_id) == events_before


def test_explicit_removal_clears_only_the_named_preference(tmp_path) -> None:
    engine, _, sessions = build_services(tmp_path)
    session = sessions.create(
        EntryPoint.CONTENT,
        "morning-routine-uv-001",
        None,
        locale="zh-CN",
    )
    engine.open_session(session)
    initial = engine.handle_message(
        session,
        GuideMessageRequest(
            message_id="msg_remove_initial",
            text="预算30美元以内、无香精、哑光妆效",
        ),
    )

    removed = engine.handle_message(
        session,
        GuideMessageRequest(message_id="msg_remove_budget", text="预算不限"),
    )

    assert session.hard_constraints.max_price_usd is None
    assert session.hard_constraints.fragrance_free is True
    assert session.soft_preferences.finish == "matte"
    assert removed.guide_revision == initial.guide_revision + 1


def test_returned_turn_cannot_mutate_stored_verified_snapshot(tmp_path) -> None:
    engine, _, sessions = build_services(tmp_path)
    service = GuideService(engine, sessions)
    turn = service.create(
        CreateGuideSessionRequest(
            entry_point=EntryPoint.CONTENT,
            content_context_id="morning-routine-uv-001",
            locale="zh-CN",
        )
    )
    verified_text = turn.text
    verified_transcript_text = turn.transcript[0].text

    turn.text = "被调用方篡改"
    turn.transcript[0].text = "被调用方篡改 transcript"

    assert service.get(turn.session_id).text == verified_text
    assert service.get(turn.session_id).transcript[0].text == verified_transcript_text


def test_message_tool_failure_restores_repository_and_authoritative_snapshot(
    tmp_path,
    monkeypatch,
) -> None:
    engine, _, sessions = build_services(tmp_path)
    service = GuideService(engine, sessions)
    opening = service.create(
        CreateGuideSessionRequest(
            entry_point=EntryPoint.CONTENT,
            content_context_id="morning-routine-uv-001",
            locale="zh-CN",
        )
    )
    unrelated = service.create(
        CreateGuideSessionRequest(
            entry_point=EntryPoint.CONTENT,
            content_context_id="morning-routine-uv-001",
            locale="en-US",
        )
    )
    session_ids = (opening.session_id, unrelated.session_id)
    before_sessions = {
        session_id: sessions.get(session_id).model_dump_json()
        for session_id in session_ids
    }
    before_events = [event.model_dump_json() for event in sessions._events]
    trace_path = tmp_path / "trace.jsonl"
    before_trace_exists = trace_path.exists()
    before_trace = trace_path.read_bytes()
    before_trace_length = trace_path.stat().st_size
    before_snapshot = service.get(opening.session_id)
    before_conversation_revision = sessions.get(
        opening.session_id
    ).conversation_revision
    before_transcript = list(sessions.get(opening.session_id).transcript)
    before_processed_requests = dict(
        sessions.get(opening.session_id).processed_guide_requests
    )
    original_handle_message = engine.handle_message

    def mutate_then_fail_a_tool(session, request):
        original_handle_message(session, request)
        assert session.state != before_snapshot.state
        assert session.guide_revision > before_snapshot.guide_revision
        assert session.hard_constraints.max_price_usd == 30
        assert session.soft_preferences.finish == "natural"
        assert session.recommended_product_ids
        assert len(sessions._events) > len(before_events)
        assert trace_path.stat().st_size > before_trace_length
        return engine.tools.get_product("missing-product-after-engine-mutation")

    monkeypatch.setattr(engine, "handle_message", mutate_then_fail_a_tool)

    with pytest.raises(KeyError, match="missing-product-after-engine-mutation"):
        service.message(
            opening.session_id,
            GuideMessageRequest(
                message_id="rollback_after_mutation",
                text="预算30美元以内、无香精、自然妆效",
            ),
        )

    assert {
        session_id: sessions.get(session_id).model_dump_json()
        for session_id in session_ids
    } == before_sessions
    assert [event.model_dump_json() for event in sessions._events] == before_events
    assert trace_path.exists() is before_trace_exists
    assert trace_path.stat().st_size == before_trace_length
    assert trace_path.read_bytes() == before_trace
    assert service.get(opening.session_id) == before_snapshot
    restored = sessions.get(opening.session_id)
    assert restored.conversation_revision == before_conversation_revision
    assert restored.transcript == before_transcript
    assert restored.processed_guide_requests == before_processed_requests


def test_create_rolls_back_opening_session_and_trace_on_failure(
    tmp_path,
    monkeypatch,
) -> None:
    engine, _, sessions = build_services(tmp_path)
    service = GuideService(engine, sessions)
    trace_path = tmp_path / "trace.jsonl"
    original_open_session = engine.open_session

    def mutate_then_fail_opening(session):
        original_open_session(session)
        assert session.id in sessions._sessions
        assert sessions.events_for_trace(session.trace_id)
        raise RuntimeError("injected opening failure")

    monkeypatch.setattr(engine, "open_session", mutate_then_fail_opening)

    with pytest.raises(RuntimeError, match="injected opening failure"):
        service.create(
            CreateGuideSessionRequest(
                entry_point=EntryPoint.CONTENT,
                content_context_id="morning-routine-uv-001",
                locale="zh-CN",
            )
        )

    assert sessions._sessions == {}
    assert sessions._events == []
    assert not trace_path.exists()


def test_safe_message_redacts_only_the_user_transcript_text(tmp_path) -> None:
    engine, _, sessions = build_services(tmp_path)
    service = GuideService(engine, sessions)
    opening = service.create(
        CreateGuideSessionRequest(
            entry_point=EntryPoint.CONTENT,
            content_context_id="morning-routine-uv-001",
            locale="zh-CN",
        )
    )
    raw_health_text = "脸部肿胀并且呼吸困难"

    response = service.message(
        opening.session_id,
        GuideMessageRequest(
            message_id="redacted-health-message",
            text=raw_health_text,
            expected_conversation_revision=opening.conversation_revision,
        ),
    )

    assert response.guide_view_kind is GuideViewKind.SAFE_BOUNDARY
    assert response.conversation_revision == 2
    assert len(response.transcript) == 3
    assert response.transcript[1].role == "USER"
    assert response.transcript[1].text == "已隐藏一条健康相关描述"
    assert response.transcript[1].redacted is True
    assert response.transcript[2].kind == "SAFETY"
    assert raw_health_text not in response.model_dump_json()


def test_thirteenth_user_turn_is_rejected_without_state_mutation(tmp_path) -> None:
    engine, _, sessions = build_services(tmp_path)
    service = GuideService(engine, sessions)
    response = service.create(
        CreateGuideSessionRequest(
            entry_point=EntryPoint.CONTENT,
            content_context_id="morning-routine-uv-001",
            locale="zh-CN",
        )
    )

    for turn_number in range(1, 13):
        response = service.message(
            response.session_id,
            GuideMessageRequest(
                message_id=f"bounded-turn-{turn_number}",
                text="日常通勤、预算30美元以内",
                expected_conversation_revision=response.conversation_revision,
            ),
        )

    session = sessions.get(response.session_id)
    before_session = session.model_copy(deep=True)
    before_events = sessions.events_for_trace(session.trace_id)
    trace_path = tmp_path / "trace.jsonl"
    before_trace = trace_path.read_bytes()

    with pytest.raises(GuideConflict) as exc_info:
        service.message(
            response.session_id,
            GuideMessageRequest(
                message_id="bounded-turn-13",
                text="继续推荐",
                expected_conversation_revision=response.conversation_revision,
            ),
        )

    assert exc_info.value.code == "CONVERSATION_LIMIT_REACHED"
    assert sessions.get(response.session_id) == before_session
    assert sessions.events_for_trace(session.trace_id) == before_events
    assert trace_path.read_bytes() == before_trace


@pytest.mark.parametrize("same_message_id", [False, True])
def test_concurrent_messages_commit_once_for_one_revision(
    tmp_path,
    monkeypatch,
    same_message_id: bool,
) -> None:
    engine, _, sessions = build_services(tmp_path)
    service = GuideService(engine, sessions)
    opening = service.create(
        CreateGuideSessionRequest(
            entry_point=EntryPoint.CONTENT,
            content_context_id="morning-routine-uv-001",
            locale="zh-CN",
        )
    )
    entered_engine = Event()
    release_engine = Event()
    engine_calls = 0
    original_handle_message = engine.handle_message

    def paused_handle_message(session, request):
        nonlocal engine_calls
        engine_calls += 1
        entered_engine.set()
        assert release_engine.wait(timeout=5)
        return original_handle_message(session, request)

    monkeypatch.setattr(engine, "handle_message", paused_handle_message)
    first_request = GuideMessageRequest(
        message_id="concurrent-stable-id",
        text="适合油皮吗？",
        expected_conversation_revision=opening.conversation_revision,
    )
    second_request = first_request.model_copy(
        update={
            "message_id": (
                first_request.message_id
                if same_message_id
                else "concurrent-different-id"
            )
        }
    )

    with ThreadPoolExecutor(max_workers=2) as executor:
        first_future = executor.submit(
            service.message,
            opening.session_id,
            first_request,
        )
        assert entered_engine.wait(timeout=5)
        second_future = executor.submit(
            service.message,
            opening.session_id,
            second_request,
        )
        release_engine.set()
        first = first_future.result(timeout=5)
        if same_message_id:
            second = second_future.result(timeout=5)
            assert second == first
        else:
            with pytest.raises(GuideConflict) as exc_info:
                second_future.result(timeout=5)
            assert exc_info.value.code == "STALE_CONVERSATION"

    restored = service.get(opening.session_id)
    assert engine_calls == 1
    assert restored.conversation_revision == 2
    assert len(restored.transcript) == 3


@pytest.mark.parametrize(
    "terminal_view",
    [
        GuideViewKind.SAFE_BOUNDARY,
        GuideViewKind.FATAL_ERROR,
    ],
)
def test_message_rejects_non_conversational_snapshot_without_mutating_state(
    tmp_path,
    terminal_view: GuideViewKind,
) -> None:
    engine, _, sessions = build_services(tmp_path)
    service = GuideService(engine, sessions)
    opening = service.create(
        CreateGuideSessionRequest(
            entry_point=EntryPoint.CONTENT,
            content_context_id="morning-routine-uv-001",
            locale="zh-CN",
        )
    )
    session = sessions.get(opening.session_id)

    if terminal_view is GuideViewKind.SAFE_BOUNDARY:
        service.message(
            session.id,
            GuideMessageRequest(
                message_id="terminal_setup_safety",
                text="脸部肿胀并且呼吸困难",
            ),
        )
    else:
        fatal_snapshot = sessions.get_snapshot(session.id).model_copy(
            update={
                "guide_status": GuideStatus.FAILED,
                "guide_view_kind": GuideViewKind.FATAL_ERROR,
                "allowed_actions": [GuideAction.RETURN_TO_FEED],
                "text": "导购当前无法恢复，请返回 Feed。",
                "quick_replies": [],
            },
            deep=True,
        )
        sessions.save_snapshot(session, fatal_snapshot)

    assert sessions.get_snapshot(session.id).guide_view_kind is terminal_view
    before_session = session.model_copy(deep=True)
    before_events = sessions.events_for_trace(session.trace_id)
    trace_path = tmp_path / "trace.jsonl"
    before_trace = trace_path.read_bytes()

    with pytest.raises(GuideConflict) as exc_info:
        service.message(
            session.id,
            GuideMessageRequest(
                message_id=f"blocked_after_{terminal_view.value.lower()}",
                text="改成哑光妆效",
            ),
        )

    assert exc_info.value.code == "ACTION_NOT_ALLOWED"
    assert sessions.get(session.id) == before_session
    assert sessions.get_snapshot(session.id) == before_session.latest_response
    assert sessions.events_for_trace(session.trace_id) == before_events
    assert trace_path.read_bytes() == before_trace


@pytest.mark.parametrize(
    ("second_request_id", "expected_second_outcome"),
    [
        ("barrier_compare", "replay"),
        ("barrier_compare_other", "stale"),
    ],
    ids=["same-request-replays", "different-request-is-stale"],
)
def test_concurrent_compares_commit_exactly_once_for_one_revision(
    tmp_path,
    monkeypatch,
    second_request_id: str,
    expected_second_outcome: str,
) -> None:
    engine, cart, sessions = build_services(tmp_path)
    service = GuideService(engine, sessions)
    opening = service.create(
        CreateGuideSessionRequest(
            entry_point=EntryPoint.CONTENT,
            content_context_id="morning-routine-uv-001",
            locale="zh-CN",
        )
    )
    decision = service.message(
        opening.session_id,
        GuideMessageRequest(
            message_id="barrier_compare_setup",
            text="预算30美元以内、无香精、自然妆效",
            expected_conversation_revision=opening.conversation_revision,
        ),
    )
    product_ids = [item.product_id for item in decision.recommendations[:2]]
    first_request = CompareRequest(
        request_id="barrier_compare",
        expected_conversation_revision=decision.conversation_revision,
        product_ids=product_ids,
    )
    second_request = first_request.model_copy(
        update={"request_id": second_request_id}
    )
    session = sessions.get(opening.session_id)
    before_events = sessions.events_for_trace(session.trace_id)
    trace_path = tmp_path / "trace.jsonl"

    first_lookup_entered = Event()
    release_first_lookup = Event()
    second_transaction_attempted = Event()
    transaction_calls = 0
    product_lookups = 0
    repository_type = type(cart.fixtures)
    original_get_product = repository_type.get_product
    original_transaction = sessions.transaction

    def paused_get_product(repository, product_id: str):
        nonlocal product_lookups
        product_lookups += 1
        if product_lookups == 1:
            first_lookup_entered.set()
            assert release_first_lookup.wait(timeout=5)
        return original_get_product(repository, product_id)

    @contextmanager
    def observed_transaction():
        nonlocal transaction_calls
        transaction_calls += 1
        if transaction_calls == 2:
            second_transaction_attempted.set()
        with original_transaction():
            yield

    monkeypatch.setattr(repository_type, "get_product", paused_get_product)
    monkeypatch.setattr(sessions, "transaction", observed_transaction)

    with ThreadPoolExecutor(max_workers=2) as executor:
        first_future = executor.submit(
            cart.compare,
            opening.session_id,
            first_request,
        )
        assert first_lookup_entered.wait(timeout=5)
        second_future = executor.submit(
            cart.compare,
            opening.session_id,
            second_request,
        )
        assert second_transaction_attempted.wait(timeout=5)
        release_first_lookup.set()
        first = first_future.result(timeout=5)
        if expected_second_outcome == "replay":
            assert second_future.result(timeout=5) == first
        else:
            with pytest.raises(CartConflict, match="STALE_CONVERSATION"):
                second_future.result(timeout=5)

    final = sessions.get_snapshot(opening.session_id)
    new_events = sessions.events_for_trace(session.trace_id)[len(before_events) :]
    assert product_lookups == 2
    assert final.conversation_revision == decision.conversation_revision + 1
    assert [item.kind for item in final.transcript].count("COMPARISON") == 1
    assert [event.event_type for event in new_events].count(
        "comparison_presented"
    ) == 1
    assert {
        request_id
        for request_id, processed in session.processed_guide_requests.items()
        if processed.request_kind == "COMPARE"
    } == {"barrier_compare"}
    trace_bytes = trace_path.read_bytes()
    assert b"barrier_compare" not in trace_bytes
    assert b"barrier_compare_other" not in trace_bytes


def test_compare_terminal_snapshot_cannot_be_overwritten_by_concurrent_message(
    tmp_path,
    monkeypatch,
) -> None:
    engine, cart, sessions = build_services(tmp_path)
    service = GuideService(engine, sessions)
    opening = service.create(
        CreateGuideSessionRequest(
            entry_point=EntryPoint.CONTENT,
            content_context_id="morning-routine-uv-001",
            locale="zh-CN",
        )
    )
    decision = service.message(
        opening.session_id,
        GuideMessageRequest(
            message_id="concurrent_setup_recommendation",
            text="预算30美元以内、无香精、自然妆效",
        ),
    )
    product_ids = [item.product_id for item in decision.recommendations[:2]]
    assert len(product_ids) == 2

    entered_message_engine = Event()
    release_message_engine = Event()
    compare_started = Event()
    compare_lock_attempted = Event()
    compare_lock_acquired = Event()
    original_handle_message = engine.handle_message
    original_transaction = sessions.transaction

    def paused_handle_message(session, request):
        entered_message_engine.set()
        assert release_message_engine.wait(timeout=5)
        return original_handle_message(session, request)

    @contextmanager
    def observed_transaction():
        is_compare_attempt = entered_message_engine.is_set()
        if is_compare_attempt:
            compare_lock_attempted.set()
        with original_transaction():
            if is_compare_attempt:
                compare_lock_acquired.set()
            yield

    monkeypatch.setattr(engine, "handle_message", paused_handle_message)
    monkeypatch.setattr(sessions, "transaction", observed_transaction)

    with ThreadPoolExecutor(max_workers=2) as executor:
        message_future = executor.submit(
            service.message,
            opening.session_id,
            GuideMessageRequest(
                message_id="concurrent_message",
                text="继续按这些条件推荐",
            ),
        )
        assert entered_message_engine.wait(timeout=5)

        def run_compare():
            compare_started.set()
            return cart.compare(
                opening.session_id,
                CompareRequest(product_ids=product_ids),
            )

        compare_future = executor.submit(run_compare)
        assert compare_started.wait(timeout=5)
        assert compare_lock_attempted.wait(timeout=5)
        assert not compare_lock_acquired.is_set()
        release_message_engine.set()
        message_future.result(timeout=5)
        compare_future.result(timeout=5)

    final_snapshot = sessions.get_snapshot(opening.session_id)
    final_events = sessions.events_for_trace(final_snapshot.trace_id)
    assert compare_lock_acquired.is_set()
    assert final_snapshot.state == "COMPARE"
    assert final_snapshot.guide_view_kind == "COMPARISON_READY"
    assert final_snapshot.comparison is not None
    assert final_snapshot.comparison.product_ids == product_ids
    assert final_events[-1].event_type == "comparison_presented"


def test_concurrent_message_waits_for_compare_then_continues_conversation(
    tmp_path,
    monkeypatch,
) -> None:
    engine, cart, sessions = build_services(tmp_path)
    service = GuideService(engine, sessions)
    opening = service.create(
        CreateGuideSessionRequest(
            entry_point=EntryPoint.CONTENT,
            content_context_id="morning-routine-uv-001",
            locale="zh-CN",
        )
    )
    decision = service.message(
        opening.session_id,
        GuideMessageRequest(
            message_id="reverse_concurrent_setup",
            text="预算30美元以内、无香精、自然妆效",
        ),
    )
    product_ids = [item.product_id for item in decision.recommendations[:2]]
    assert len(product_ids) == 2
    before_event_count = len(sessions._events)

    compare_holds_transaction = Event()
    release_compare = Event()
    message_lock_attempted = Event()
    message_lock_acquired = Event()
    events_when_message_acquired: list[list[str]] = []
    trace_when_message_acquired: list[bytes] = []
    trace_path = tmp_path / "trace.jsonl"
    repository_type = type(cart.fixtures)
    original_get_product = repository_type.get_product
    original_transaction = sessions.transaction
    first_product_lookup = True

    def paused_get_product(repository, product_id: str):
        nonlocal first_product_lookup
        if first_product_lookup:
            first_product_lookup = False
            compare_holds_transaction.set()
            assert release_compare.wait(timeout=5)
        return original_get_product(repository, product_id)

    @contextmanager
    def observed_transaction():
        is_message_attempt = compare_holds_transaction.is_set()
        if is_message_attempt:
            message_lock_attempted.set()
        with original_transaction():
            if is_message_attempt:
                message_lock_acquired.set()
                events_when_message_acquired.append(
                    [event.model_dump_json() for event in sessions._events]
                )
                trace_when_message_acquired.append(trace_path.read_bytes())
            yield

    monkeypatch.setattr(repository_type, "get_product", paused_get_product)
    monkeypatch.setattr(sessions, "transaction", observed_transaction)

    with ThreadPoolExecutor(max_workers=2) as executor:
        compare_future = executor.submit(
            cart.compare,
            opening.session_id,
            CompareRequest(product_ids=product_ids),
        )
        assert compare_holds_transaction.wait(timeout=5)
        message_future = executor.submit(
            service.message,
            opening.session_id,
            GuideMessageRequest(
                message_id="reverse_concurrent_message",
                text="改成哑光妆效",
            ),
        )
        assert message_lock_attempted.wait(timeout=5)
        assert not message_lock_acquired.is_set()
        release_compare.set()
        compare_future.result(timeout=5)
        continued = message_future.result(timeout=5)

    assert message_lock_acquired.is_set()
    final_snapshot = sessions.get_snapshot(opening.session_id)
    assert continued == final_snapshot
    assert final_snapshot.guide_view_kind is GuideViewKind.DECISION_READY
    assert final_snapshot.comparison is None
    assert final_snapshot.transcript[-3].kind == "COMPARISON"
    assert final_snapshot.transcript[-2].kind == "USER_TEXT"
    assert final_snapshot.guide_revision > decision.guide_revision
    assert len(sessions._events) > before_event_count + 1
    assert (
        events_when_message_acquired[0][-1]
        == sessions._events[before_event_count].model_dump_json()
    )
    assert trace_when_message_acquired[0] in trace_path.read_bytes()


@pytest.mark.parametrize(
    "message_action",
    [
        GuideAction.CONFIRM_CONTEXT,
        GuideAction.ANSWER_CLARIFICATION,
        GuideAction.SKIP_CLARIFICATION,
        GuideAction.UPDATE_CONSTRAINTS,
        GuideAction.RELAX_CONSTRAINT,
        GuideAction.CONTINUE_WITH_KNOWN,
    ],
)
def test_message_allows_each_message_capable_action(
    tmp_path,
    message_action: GuideAction,
) -> None:
    engine, _, sessions = build_services(tmp_path)
    service = GuideService(engine, sessions)
    opening = service.create(
        CreateGuideSessionRequest(
            entry_point=EntryPoint.CONTENT,
            content_context_id="morning-routine-uv-001",
            locale="zh-CN",
        )
    )
    session = sessions.get(opening.session_id)
    sessions.save_snapshot(
        session,
        sessions.get_snapshot(session.id).model_copy(
            update={"allowed_actions": [message_action]},
            deep=True,
        ),
    )

    turn = service.message(
        session.id,
        GuideMessageRequest(
            message_id=f"allowed_{message_action.value.lower()}",
            text="日常通勤、预算30美元以内",
        ),
    )

    assert turn.guide_view_kind is GuideViewKind.DECISION_READY
    assert turn.guide_revision > opening.guide_revision
