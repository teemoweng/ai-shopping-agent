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


@pytest.mark.parametrize(
    "payload",
    [
        {"chain_of_thought": "private reasoning"},
        {"tool": {"chain_of_thought": "private reasoning"}},
    ],
)
def test_trace_event_rejects_private_reasoning_without_writing_a_row(
    tmp_path, payload: dict[str, object]
) -> None:
    trace_path = tmp_path / "trace.jsonl"
    repository = SessionRepository(trace_path=trace_path)
    session = repository.create(EntryPoint.CONTENT, "morning-routine-uv-001", None)

    with pytest.raises(ValidationError, match="chain_of_thought"):
        repository.append_event(
            session,
            event_type="state_transition",
            state=WorkflowState.UNDERSTAND,
            payload=payload,
        )

    assert not trace_path.exists()


def test_trace_payload_is_deeply_immutable_and_matches_persisted_event(tmp_path) -> None:
    trace_path = tmp_path / "trace.jsonl"
    repository = SessionRepository(trace_path=trace_path)
    session = repository.create(EntryPoint.CONTENT, "morning-routine-uv-001", None)
    expected_payload = {
        "transition": {"from": "ENTRY_INGEST", "to": "UNDERSTAND"},
        "candidate_ids": ["sku-1", "sku-2"],
    }
    event = repository.append_event(
        session,
        event_type="state_transition",
        state=WorkflowState.UNDERSTAND,
        payload=expected_payload,
    )

    with pytest.raises(TypeError):
        event.payload["new_key"] = "new_value"
    with pytest.raises(TypeError):
        event.payload["transition"]["from"] = "CLARIFY"
    with pytest.raises(TypeError):
        event.payload["candidate_ids"].append("sku-3")

    persisted_payload = json.loads(trace_path.read_text().splitlines()[0])["payload"]
    assert repository.events_for_trace(session.trace_id)[0].payload == persisted_payload
    assert persisted_payload == expected_payload
