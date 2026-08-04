import json

import pytest
from pydantic import ValidationError

from app.domain.contracts import EntryPoint, WorkflowState
from app.repositories.session_repository import SessionRepository


def test_session_ids_and_initial_state_are_stable(tmp_path) -> None:
    repository = SessionRepository(trace_path=tmp_path / "trace.jsonl")
    session = repository.create(EntryPoint.CONTENT, "morning-routine-uv-001", None)
    assert session.id.startswith("ses_")
    assert session.trace_id.startswith("trc_")
    assert session.state is WorkflowState.ENTRY_INGEST


def test_trace_event_is_written_without_private_reasoning(tmp_path) -> None:
    trace_path = tmp_path / "trace.jsonl"
    repository = SessionRepository(trace_path=trace_path)
    session = repository.create(EntryPoint.CONTENT, "morning-routine-uv-001", None)
    repository.append_event(
        session,
        event_type="state_transition",
        state=WorkflowState.UNDERSTAND,
        payload={"from": "ENTRY_INGEST", "to": "UNDERSTAND"},
    )
    row = json.loads(trace_path.read_text().splitlines()[0])
    assert row["trace_id"] == session.trace_id
    assert "chain_of_thought" not in row
    assert row["payload"] == {"from": "ENTRY_INGEST", "to": "UNDERSTAND"}


def test_trace_event_is_immutable_after_append(tmp_path) -> None:
    repository = SessionRepository(trace_path=tmp_path / "trace.jsonl")
    session = repository.create(EntryPoint.CONTENT, "morning-routine-uv-001", None)
    event = repository.append_event(
        session,
        event_type="state_transition",
        state=WorkflowState.UNDERSTAND,
        payload={"from": "ENTRY_INGEST", "to": "UNDERSTAND"},
    )

    with pytest.raises(ValidationError):
        event.state = WorkflowState.CLARIFY
