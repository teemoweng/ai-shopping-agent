from pathlib import Path

import pytest
from pydantic import ValidationError

from app.domain.contracts import (
    EntryPoint,
    EvidenceStatus,
    GuideAction,
    GuideMessageRequest,
    GuideViewKind,
    RecommendationCard,
    Verdict,
    WorkflowState,
)
from app.repositories.fixture_repository import FixtureRepository
from app.repositories.session_repository import SessionRepository
from app.workflow.engine import WorkflowEngine
from app.workflow.tools import ShoppingTools

FIXTURE_ROOT = Path(__file__).parents[4] / "data" / "fixtures"


def build_engine(tmp_path) -> tuple[WorkflowEngine, SessionRepository]:
    fixtures = FixtureRepository.load(FIXTURE_ROOT)
    sessions = SessionRepository(tmp_path / "trace.jsonl")
    return WorkflowEngine(ShoppingTools(fixtures), sessions), sessions


def build_engine_without_matching_evidence(
    tmp_path,
) -> tuple[WorkflowEngine, SessionRepository]:
    fixtures = FixtureRepository.load(FIXTURE_ROOT)
    unrelated_evidence = {
        evidence_id: document.model_copy(
            update={
                "title": "Archived cosmetic source",
                "topics": ("cosmetics",),
                "summary": "An unrelated archived source.",
            }
        )
        for evidence_id, document in fixtures.evidence_documents.items()
    }
    fixtures = FixtureRepository(
        products=fixtures.products,
        content_contexts=fixtures.content_contexts,
        evidence_documents=unrelated_evidence,
    )
    sessions = SessionRepository(tmp_path / "trace.jsonl")
    return WorkflowEngine(ShoppingTools(fixtures), sessions), sessions


def test_content_entry_opens_with_one_high_information_question(tmp_path) -> None:
    engine, sessions = build_engine(tmp_path)
    session = sessions.create(
        EntryPoint.CONTENT,
        "morning-routine-uv-001",
        None,
        locale="zh-CN",
    )
    turn = engine.open_session(session)
    assert turn.state is WorkflowState.UNDERSTAND
    assert turn.kind == "opening"
    assert turn.guide_view_kind is GuideViewKind.OPENING_CONTEXT
    assert turn.text == "我看到你在看 Seoul Shade。你最想确认什么？"
    assert turn.quick_replies == ["适合油皮吗？", "会不会泛白？", "和防水款比比"]
    assert turn.allowed_actions == [
        GuideAction.SEND_MESSAGE,
        GuideAction.RETURN_TO_FEED,
    ]
    assert turn.context.anchor_product_id == "seoul-shade-daily-fluid"
    assert turn.context.anchor_product_name == "Seoul Shade Daily Fluid"
    assert {claim.status for claim in turn.context.claims} == {
        EvidenceStatus.SUPPORTED,
        EvidenceStatus.CONFLICTING,
        EvidenceStatus.INSUFFICIENT_EVIDENCE,
        EvidenceStatus.SUBJECTIVE_MIXED,
    }
    events = sessions.events_for_trace(session.trace_id)
    assert [
        event.payload["to"]
        for event in events
        if event.event_type == "state_transition"
    ] == ["UNDERSTAND"]
    assert not any(event.event_type.startswith("tool_") for event in events)


def test_chinese_questions_progress_from_fit_to_decision_or_short_answer(
    tmp_path,
) -> None:
    engine, sessions = build_engine(tmp_path)
    session = sessions.create(
        EntryPoint.CONTENT,
        "morning-routine-uv-001",
        None,
        locale="zh-CN",
    )
    opening = engine.open_session(session)

    fit = engine.handle_message(
        session,
        GuideMessageRequest(message_id="fit", text="适合油皮吗？"),
    )

    assert fit.guide_view_kind is GuideViewKind.WAITING_CLARIFICATION
    assert fit.quick_replies == ["日常通勤", "户外出汗或玩水"]
    assert fit.text.count("？") <= 1
    assert fit.recommendations == []
    assert session.soft_preferences.skin_type == "oily"
    assert fit.guide_revision == opening.guide_revision + 1

    decision = engine.handle_message(
        session,
        GuideMessageRequest(message_id="commute", text="日常通勤"),
    )

    assert decision.guide_view_kind is GuideViewKind.DECISION_READY
    assert decision.recommendations

    fresh_session = sessions.create(
        EntryPoint.CONTENT,
        "morning-routine-uv-001",
        None,
        locale="zh-CN",
    )
    fresh_opening = engine.open_session(fresh_session)
    claim = engine.handle_message(
        fresh_session,
        GuideMessageRequest(message_id="cast", text="会不会泛白？"),
    )

    assert claim.guide_view_kind is GuideViewKind.ANSWER_READY
    assert claim.recommendations == []
    assert "低泛白风险" in claim.text
    assert "所有肤色" in claim.text
    assert claim.guide_revision == fresh_opening.guide_revision
    claim_events = sessions.events_for_trace(fresh_session.trace_id)
    assert not any(event.event_type.startswith("tool_") for event in claim_events)


def test_explicit_comparison_intent_prepares_anchor_and_water_resistant_candidate(
    tmp_path,
) -> None:
    engine, sessions = build_engine(tmp_path)
    session = sessions.create(
        EntryPoint.CONTENT,
        "morning-routine-uv-001",
        None,
        locale="zh-CN",
    )
    engine.open_session(session)

    turn = engine.handle_message(
        session,
        GuideMessageRequest(message_id="compare", text="和防水款比比"),
    )

    product_ids = {card.product_id for card in turn.recommendations}
    assert turn.guide_view_kind is GuideViewKind.DECISION_READY
    assert "seoul-shade-daily-fluid" in product_ids
    assert product_ids & {"cloud-veil-mineral", "jeju-sport-sun-gel"}


def test_outdoor_clarification_requires_a_water_resistant_decision(tmp_path) -> None:
    engine, sessions = build_engine(tmp_path)
    session = sessions.create(
        EntryPoint.CONTENT,
        "morning-routine-uv-001",
        None,
        locale="zh-CN",
    )
    engine.open_session(session)
    engine.handle_message(
        session,
        GuideMessageRequest(message_id="fit-outdoor", text="适合油皮吗？"),
    )

    turn = engine.handle_message(
        session,
        GuideMessageRequest(message_id="outdoor", text="户外出汗或玩水"),
    )

    assert turn.guide_view_kind is GuideViewKind.DECISION_READY
    assert turn.recommendations
    assert all(
        card.product_id != "seoul-shade-daily-fluid"
        for card in turn.recommendations
    )
    assert session.hard_constraints.water_resistance_minutes == 40


def test_context_product_name_is_resolved_from_product_facts(tmp_path) -> None:
    fixtures = FixtureRepository.load(FIXTURE_ROOT)
    products = dict(fixtures.products)
    products["seoul-shade-daily-fluid"] = products[
        "seoul-shade-daily-fluid"
    ].model_copy(update={"name": "Fixture-resolved display name"})
    fixtures = FixtureRepository(
        products=products,
        content_contexts=fixtures.content_contexts,
        evidence_documents=fixtures.evidence_documents,
    )
    sessions = SessionRepository(tmp_path / "trace.jsonl")
    engine = WorkflowEngine(ShoppingTools(fixtures), sessions)
    session = sessions.create(EntryPoint.CONTENT, "morning-routine-uv-001", None)

    turn = engine.open_session(session)

    assert turn.context.anchor_product_name == "Fixture-resolved display name"


def test_constraints_produce_grounded_recommendations(tmp_path) -> None:
    engine, sessions = build_engine(tmp_path)
    session = sessions.create(EntryPoint.CONTENT, "morning-routine-uv-001", None)
    engine.open_session(session)
    turn = engine.handle_message(
        session,
        GuideMessageRequest(
            message_id="msg_1",
            text="Under $20, fragrance-free, natural finish, daily commute",
        ),
    )
    assert turn.state is WorkflowState.PRESENT_RECOMMENDATION
    assert turn.verdict is Verdict.SUITABLE
    assert turn.recommendations[0].product_id == "seoul-shade-daily-fluid"
    assert turn.recommendations[0].eligible_sku_ids == [
        "seoul-shade-30",
        "seoul-shade-50",
    ]
    assert session.eligible_sku_ids_by_product["seoul-shade-daily-fluid"] == [
        "seoul-shade-30",
        "seoul-shade-50",
    ]
    assert turn.evidence[0].url.host == "www.fda.gov"


def test_conflicting_constraints_are_not_relaxed(tmp_path) -> None:
    engine, sessions = build_engine(tmp_path)
    session = sessions.create(EntryPoint.CONTENT, "morning-routine-uv-001", None)
    engine.open_session(session)
    turn = engine.handle_message(
        session,
        GuideMessageRequest(
            message_id="msg_2",
            text="Under $15, fragrance-free, 80 minute water resistance",
        ),
    )
    assert turn.verdict is Verdict.NOT_RECOMMENDED
    assert turn.recommendations == []
    assert "I won't silently relax" in turn.text


def test_medical_diagnosis_request_stays_out_of_scope(tmp_path) -> None:
    engine, sessions = build_engine(tmp_path)
    session = sessions.create(EntryPoint.CONTENT, "morning-routine-uv-001", None)
    turn = engine.handle_message(
        session,
        GuideMessageRequest(
            message_id="msg_3",
            text="Diagnose this burning rash and treat it",
        ),
    )
    assert turn.kind == "safety_boundary"
    assert turn.recommendations == []
    assert "medical professional" in turn.text


@pytest.mark.parametrize(
    "text",
    [
        "Can sunscreen cure acne?",
        "Could this melanoma spot be caused by sunscreen?",
        "Will this prevent skin cancer?",
        "My sunscreen allergy is getting worse",
        "I am having a severe allergic reaction",
        "I have hives after applying it",
        "My face has swelling after this sunscreen",
        "I have difficulty breathing after applying it",
        "I have trouble breathing after applying it",
        "Could this cause anaphylaxis?",
        "Will this interact with my medication?",
        "Does sunscreen have a drug interaction?",
    ],
)
def test_medical_boundary_terms_never_produce_recommendations(
    tmp_path,
    text: str,
) -> None:
    engine, sessions = build_engine(tmp_path)
    session = sessions.create(EntryPoint.CONTENT, "morning-routine-uv-001", None)
    turn = engine.handle_message(
        session,
        GuideMessageRequest(message_id="msg_medical", text=text),
    )
    assert turn.kind == "safety_boundary"
    assert turn.recommendations == []


@pytest.mark.parametrize(
    "text",
    [
        "I am having a severe allergic reaction",
        "I have hives after applying it",
        "My face has swelling after this sunscreen",
        "I have difficulty breathing after applying it",
        "I have trouble breathing after applying it",
        "Could this cause anaphylaxis?",
    ],
)
def test_urgent_symptoms_give_an_emergency_next_step(tmp_path, text: str) -> None:
    engine, sessions = build_engine(tmp_path)
    session = sessions.create(EntryPoint.CONTENT, "morning-routine-uv-001", None)
    turn = engine.handle_message(
        session,
        GuideMessageRequest(message_id="msg_urgent", text=text),
    )
    assert turn.kind == "safety_boundary"
    assert turn.recommendations == []
    assert "emergency medical help now" in turn.text


def test_synthetic_evidence_only_applies_to_the_content_anchor(tmp_path) -> None:
    engine, sessions = build_engine(tmp_path)
    session = sessions.create(EntryPoint.CONTENT, "morning-routine-uv-001", None)
    turn = engine.handle_message(
        session,
        GuideMessageRequest(
            message_id="msg_evidence_scope",
            text="Under $20, fragrance-free, natural finish, daily commute",
        ),
    )
    cards = {card.product_id: card for card in turn.recommendations}
    synthetic_evidence_id = "synthetic-review-finish-aggregate"
    assert synthetic_evidence_id in cards["seoul-shade-daily-fluid"].evidence_ids
    assert synthetic_evidence_id not in cards["cloud-veil-mineral"].evidence_ids


def test_empty_retrieval_marks_cards_and_turn_as_insufficient_evidence(
    tmp_path,
) -> None:
    engine, sessions = build_engine_without_matching_evidence(tmp_path)
    session = sessions.create(EntryPoint.CONTENT, "morning-routine-uv-001", None)
    turn = engine.handle_message(
        session,
        GuideMessageRequest(
            message_id="msg_empty_evidence",
            text="Under $20, fragrance-free, natural finish, daily commute",
        ),
    )
    assert turn.recommendations
    assert turn.evidence == []
    assert turn.verdict is Verdict.INSUFFICIENT_EVIDENCE
    assert "insufficient evidence" in turn.text.lower()
    assert all(
        card.verdict is Verdict.INSUFFICIENT_EVIDENCE
        and card.evidence_ids == []
        for card in turn.recommendations
    )


def test_recommendation_card_rejects_positive_verdict_without_evidence() -> None:
    with pytest.raises(ValidationError, match="evidence"):
        RecommendationCard(
            product_id="product-1",
            brand="Brand",
            name="Product",
            verdict=Verdict.SUITABLE,
            fit_reasons=["fits"],
            tradeoffs=["tradeoff"],
            eligible_sku_ids=["sku-1"],
            starting_price_usd=10.0,
            evidence_ids=[],
        )
