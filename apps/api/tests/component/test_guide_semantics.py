import json
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from threading import Event

import pytest

from app.domain.contracts import (
    CartPreviewRequest,
    CompareRequest,
    CreateGuideSessionRequest,
    EntryPoint,
    GuideAction,
    GuideMessageRequest,
    GuideStatus,
    GuideViewKind,
)
from app.repositories.fixture_repository import FixtureRepository
from app.repositories.session_repository import SessionRepository
from app.services.cart_service import CartService
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


def test_every_guide_view_has_explicit_server_actions() -> None:
    expected = {
        "OPENING_CONTEXT": ["RETURN_TO_FEED"],
        "CONTEXT_CONFIRMATION": ["CONFIRM_CONTEXT", "RETURN_TO_FEED"],
        "WAITING_CLARIFICATION": [
            "ANSWER_CLARIFICATION",
            "SKIP_CLARIFICATION",
            "UPDATE_CONSTRAINTS",
            "RETURN_TO_FEED",
        ],
        "VERIFYING_FACTS": ["RETURN_TO_FEED"],
        "DECISION_READY": [
            "UPDATE_CONSTRAINTS",
            "REQUEST_COMPARISON",
            "OPEN_PRODUCT",
            "RETURN_TO_FEED",
        ],
        "NO_MATCH": ["RELAX_CONSTRAINT", "RETURN_TO_FEED"],
        "INSUFFICIENT_EVIDENCE": [
            "OPEN_PRODUCT",
            "CONTINUE_WITH_KNOWN",
            "RETURN_TO_FEED",
        ],
        "COMPARISON_READY": ["OPEN_PRODUCT", "RETURN_TO_FEED"],
        "SAFE_BOUNDARY": ["RETURN_TO_FEED"],
        "RECOVERY_REQUIRED": ["RETRY_GUIDE_OPERATION", "RETURN_TO_FEED"],
        "FATAL_ERROR": ["RETURN_TO_FEED"],
    }
    assert {
        view_kind.value: [action.value for action in agent.allowed_actions_for(view_kind)]
        for view_kind in GuideViewKind
    } == expected


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

    turn.text = "被调用方篡改"

    assert service.get(turn.session_id).text == verified_text


@pytest.mark.parametrize(
    "terminal_view",
    [
        GuideViewKind.COMPARISON_READY,
        GuideViewKind.SAFE_BOUNDARY,
        GuideViewKind.FATAL_ERROR,
    ],
)
def test_message_rejects_terminal_snapshot_without_mutating_session_or_trace(
    tmp_path,
    terminal_view: GuideViewKind,
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
    session = sessions.get(opening.session_id)

    if terminal_view is GuideViewKind.COMPARISON_READY:
        service.message(
            session.id,
            GuideMessageRequest(
                message_id="terminal_setup_recommendation",
                text="预算30美元以内、无香精、自然妆效",
            ),
        )
        cart.compare(
            session.id,
            CompareRequest(
                product_ids=[
                    "seoul-shade-daily-fluid",
                    "cloud-veil-mineral",
                ]
            ),
        )
    elif terminal_view is GuideViewKind.SAFE_BOUNDARY:
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
    compare_finished = Event()
    original_handle_message = engine.handle_message

    def paused_handle_message(session, request):
        entered_message_engine.set()
        assert release_message_engine.wait(timeout=2)
        return original_handle_message(session, request)

    monkeypatch.setattr(engine, "handle_message", paused_handle_message)

    with ThreadPoolExecutor(max_workers=2) as executor:
        message_future = executor.submit(
            service.message,
            opening.session_id,
            GuideMessageRequest(
                message_id="concurrent_message",
                text="继续按这些条件推荐",
            ),
        )
        assert entered_message_engine.wait(timeout=2)

        def run_compare():
            try:
                return cart.compare(
                    opening.session_id,
                    CompareRequest(product_ids=product_ids),
                )
            finally:
                compare_finished.set()

        compare_future = executor.submit(run_compare)
        compare_finished_before_release = compare_finished.wait(timeout=0.1)
        release_message_engine.set()
        message_future.result(timeout=2)
        compare_future.result(timeout=2)

    final_snapshot = sessions.get_snapshot(opening.session_id)
    final_events = sessions.events_for_trace(final_snapshot.trace_id)
    assert compare_finished_before_release is False
    assert final_snapshot.state == "COMPARE"
    assert final_snapshot.guide_view_kind == "COMPARISON_READY"
    assert final_snapshot.comparison is not None
    assert final_snapshot.comparison.product_ids == product_ids
    assert final_events[-1].event_type == "comparison_presented"


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
