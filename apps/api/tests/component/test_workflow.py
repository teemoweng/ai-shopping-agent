from pathlib import Path

import pytest
from pydantic import ValidationError

from app.domain.contracts import (
    EntryPoint,
    EvidenceStatus,
    GuideMessageRequest,
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
    session = sessions.create(EntryPoint.CONTENT, "morning-routine-uv-001", None)
    turn = engine.open_session(session)
    assert turn.state is WorkflowState.CLARIFY
    assert turn.kind == "clarification"
    assert turn.text.count("?") == 1
    assert turn.context.anchor_product_id == "seoul-shade-daily-fluid"
    assert {claim.status for claim in turn.context.claims} == {
        EvidenceStatus.SUPPORTED,
        EvidenceStatus.CONFLICTING,
        EvidenceStatus.INSUFFICIENT_EVIDENCE,
        EvidenceStatus.SUBJECTIVE_MIXED,
    }


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
