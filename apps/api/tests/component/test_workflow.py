from pathlib import Path

from app.domain.contracts import (
    EntryPoint,
    EvidenceStatus,
    GuideMessageRequest,
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
