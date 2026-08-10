import json
from pathlib import Path

import pytest
from pydantic import ValidationError

from app.domain import events
from app.domain.contracts import EntryPoint, WorkflowState
from app.repositories.session_repository import SessionRepository


class _MutablePayloadValue:
    pass


def test_session_ids_and_initial_state_are_stable(tmp_path) -> None:
    repository = SessionRepository(trace_path=tmp_path / "trace.jsonl")
    session = repository.create(EntryPoint.CONTENT, "morning-routine-uv-001", None)
    assert session.id.startswith("ses_")
    assert session.trace_id.startswith("trc_")
    assert session.state is WorkflowState.ENTRY_INGEST


def test_session_initializes_conversation_state_and_rolls_it_back(tmp_path) -> None:
    repository = SessionRepository(trace_path=tmp_path / "trace.jsonl")
    session = repository.create(EntryPoint.CONTENT, "morning-routine-uv-001", None)

    assert session.conversation_revision == 1
    assert session.transcript == []
    assert session.processed_guide_requests == {}

    with (
        pytest.raises(RuntimeError, match="conversation failure"),
        repository.transaction(),
    ):
        session.conversation_revision = 2
        session.processed_guide_requests["request_1"] = events.ProcessedGuideRequest(
            request_kind="MESSAGE",
            payload_digest="digest",
            result_conversation_revision=2,
        )
        repository.save(session)
        raise RuntimeError("conversation failure")

    restored = repository.get(session.id)
    assert restored.conversation_revision == 1
    assert restored.processed_guide_requests == {}


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


@pytest.mark.parametrize(
    "sensitive_key",
    ["raw_message", "message_text", "client_message_id", "conversation_transcript"],
)
def test_trace_event_rejects_conversation_content_and_identifiers(
    tmp_path,
    sensitive_key: str,
) -> None:
    trace_path = tmp_path / "trace.jsonl"
    repository = SessionRepository(trace_path=trace_path)
    session = repository.create(EntryPoint.CONTENT, "morning-routine-uv-001", None)

    with pytest.raises(ValidationError):
        repository.append_event(
            session,
            event_type="state_transition",
            state=WorkflowState.UNDERSTAND,
            payload={sensitive_key: "must-not-persist"},
        )

    assert not trace_path.exists()


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


def test_trace_write_failure_does_not_publish_in_memory_event(
    tmp_path,
    monkeypatch,
) -> None:
    trace_path = tmp_path / "trace.jsonl"
    repository = SessionRepository(trace_path=trace_path)
    session = repository.create(EntryPoint.CONTENT, "morning-routine-uv-001", None)
    original_open = Path.open

    def fail_trace_open(path: Path, *args, **kwargs):
        if path == trace_path:
            raise OSError("injected trace persistence failure")
        return original_open(path, *args, **kwargs)

    monkeypatch.setattr(Path, "open", fail_trace_open)

    with pytest.raises(OSError, match="injected trace persistence failure"):
        repository.append_event(
            session,
            event_type="state_transition",
            state=WorkflowState.UNDERSTAND,
            payload={"from": "ENTRY_INGEST", "to": "UNDERSTAND"},
        )

    assert repository.events_for_trace(session.trace_id) == ()
    assert not trace_path.exists()


def test_transaction_failure_restores_session_events_and_absent_trace(tmp_path) -> None:
    trace_path = tmp_path / "trace.jsonl"
    repository = SessionRepository(trace_path=trace_path)
    session = repository.create(EntryPoint.CONTENT, "morning-routine-uv-001", None)
    before_session = session.model_dump_json()

    with (
        pytest.raises(RuntimeError, match="injected transaction failure"),
        repository.transaction(),
    ):
        session.state = WorkflowState.UNDERSTAND
        session.guide_revision += 1
        repository.save(session)
        repository.append_event(
            session,
            event_type="state_transition",
            state=WorkflowState.UNDERSTAND,
            payload={"from": "ENTRY_INGEST", "to": "UNDERSTAND"},
        )
        raise RuntimeError("injected transaction failure")

    assert repository.get(session.id).model_dump_json() == before_session
    assert repository.events_for_trace(session.trace_id) == ()
    assert not trace_path.exists()


def test_transaction_failure_restores_original_session_reference_after_replacement(
    tmp_path,
) -> None:
    repository = SessionRepository(trace_path=tmp_path / "trace.jsonl")
    session = repository.create(EntryPoint.CONTENT, "morning-routine-uv-001", None)
    expected_original = session.model_copy(deep=True)
    replacement = session.model_copy(deep=True)

    with (
        pytest.raises(RuntimeError, match="injected replacement failure"),
        repository.transaction(),
    ):
        original = repository.get(session.id)
        repository.save(replacement)

        original.state = WorkflowState.UNDERSTAND
        original.hard_constraints.max_price_usd = 25
        original.recommended_product_ids.append("seoul-shade-daily-fluid")
        replacement.state = WorkflowState.CLARIFY
        replacement.soft_preferences.finish = "matte"
        created = repository.create(
            EntryPoint.CONTENT,
            "morning-routine-uv-001",
            None,
        )
        raise RuntimeError("injected replacement failure")

    assert repository.get(session.id) is original
    assert original == expected_original
    assert repository.get(session.id) is not replacement
    with pytest.raises(KeyError, match=created.id):
        repository.get(created.id)


def test_nested_transaction_is_reentrant_without_an_inner_savepoint(tmp_path) -> None:
    repository = SessionRepository(trace_path=tmp_path / "trace.jsonl")
    session = repository.create(EntryPoint.CONTENT, "morning-routine-uv-001", None)

    with repository.transaction():
        session.state = WorkflowState.UNDERSTAND
        repository.save(session)
        try:
            with repository.transaction():
                session.state = WorkflowState.CLARIFY
                repository.save(session)
                raise RuntimeError("caught by outer operation")
        except RuntimeError:
            pass
        assert repository.get(session.id).state is WorkflowState.CLARIFY

    assert repository.get(session.id).state is WorkflowState.CLARIFY


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
    assert isinstance(event.payload["candidate_ids"], tuple)
    with pytest.raises(AttributeError):
        event.payload["candidate_ids"].append("sku-3")

    persisted_payload = json.loads(trace_path.read_text().splitlines()[0])["payload"]
    assert json.loads(event.model_dump_json())["payload"] == expected_payload
    stored_event = repository.events_for_trace(session.trace_id)[0]
    assert json.loads(stored_event.model_dump_json())["payload"] == persisted_payload
    assert persisted_payload == expected_payload


def test_trace_payload_rejects_base_class_mutator_dispatch(tmp_path) -> None:
    repository = SessionRepository(trace_path=tmp_path / "trace.jsonl")
    session = repository.create(EntryPoint.CONTENT, "morning-routine-uv-001", None)
    event = repository.append_event(
        session,
        event_type="state_transition",
        state=WorkflowState.UNDERSTAND,
        payload={"nested": {"state": "UNDERSTAND"}, "candidate_ids": ["sku-1"]},
    )

    with pytest.raises(TypeError):
        dict.__setitem__(event.payload, "new_key", "new_value")
    with pytest.raises(TypeError):
        dict.__setitem__(event.payload["nested"], "state", "CLARIFY")
    with pytest.raises(TypeError):
        list.append(event.payload["candidate_ids"], "sku-2")


@pytest.mark.parametrize(
    "payload",
    [
        {"tags": {"sensitive"}},
        {"tool": _MutablePayloadValue()},
    ],
)
def test_trace_payload_rejects_non_json_mutable_values(
    tmp_path, payload: dict[str, object]
) -> None:
    trace_path = tmp_path / "trace.jsonl"
    repository = SessionRepository(trace_path=trace_path)
    session = repository.create(EntryPoint.CONTENT, "morning-routine-uv-001", None)

    with pytest.raises(ValidationError):
        repository.append_event(
            session,
            event_type="state_transition",
            state=WorkflowState.UNDERSTAND,
            payload=payload,
        )

    assert not trace_path.exists()
