import json
from collections.abc import Mapping
from math import isfinite
from pathlib import Path

import pytest

from app.domain.contracts import (
    CartPreviewRequest,
    EntryPoint,
    GuideMessageRequest,
)
from app.repositories.fixture_repository import FixtureRepository
from app.repositories.session_repository import SessionRepository
from app.services.cart_service import CartService
from app.workflow.engine import WorkflowEngine
from app.workflow.tools import ShoppingTools

FIXTURE_ROOT = Path(__file__).parents[4] / "data" / "fixtures"
GOLDEN_INPUT = "Under $20, fragrance-free, natural finish, daily commute"
TOOL_PAYLOAD_KEYS = {
    "tool_name",
    "argument_summary",
    "result_ids",
    "duration_ms",
    "status",
}
FORBIDDEN_TRACE_KEYS = {
    "text",
    "message",
    "raw_message",
    "chain_of_thought",
    "private_reasoning",
    "reasoning",
    "confirmation_token",
    "api_key",
    "secret",
}


def _contains_forbidden_key(value: object) -> bool:
    if isinstance(value, dict):
        return bool(FORBIDDEN_TRACE_KEYS & value.keys()) or any(
            _contains_forbidden_key(item) for item in value.values()
        )
    if isinstance(value, list):
        return any(_contains_forbidden_key(item) for item in value)
    return False


def _assert_ordered_subsequence(
    events: list[tuple[str, str | None]],
    expected: list[tuple[str, str | None]],
) -> None:
    cursor = 0
    for event in events:
        if cursor < len(expected) and event == expected[cursor]:
            cursor += 1
    assert cursor == len(expected), (
        f"missing ordered trace events: {expected[cursor:]}; observed: {events}"
    )


def test_golden_path_records_redacted_tool_and_cart_boundaries(tmp_path) -> None:
    fixtures = FixtureRepository.load(FIXTURE_ROOT)
    trace_path = tmp_path / "trace.jsonl"
    sessions = SessionRepository(trace_path)
    engine = WorkflowEngine(ShoppingTools(fixtures), sessions)
    cart = CartService(fixtures, sessions)
    session = sessions.create(
        EntryPoint.CONTENT,
        "morning-routine-uv-001",
        None,
    )

    engine.open_session(session)
    turn = engine.handle_message(
        session,
        GuideMessageRequest(message_id="trace_golden", text=GOLDEN_INPUT),
    )
    preview = cart.preview(
        session.id,
        CartPreviewRequest(
            sku_id=turn.recommendations[0].eligible_sku_ids[0],
            quantity=1,
        ),
    )
    cart.add(session.id, preview.confirmation_token)

    events = sessions.events_for_trace(session.trace_id)
    observable = [
        (
            event.event_type,
            (
                event.payload.get("tool_name")
                if event.event_type in {"tool_call", "tool_result"}
                else None
            ),
        )
        for event in events
    ]
    _assert_ordered_subsequence(
        observable,
        [
            ("state_transition", None),
            ("tool_call", "search_eligible_products"),
            ("tool_result", "search_eligible_products"),
            ("cart_preview", None),
            ("cart_add", None),
        ],
    )

    tool_events = [
        event for event in events if event.event_type in {"tool_call", "tool_result"}
    ]
    assert {
        (event.event_type, event.payload["tool_name"]) for event in tool_events
    } == {
        ("tool_call", "retrieve_evidence"),
        ("tool_result", "retrieve_evidence"),
        ("tool_call", "search_eligible_products"),
        ("tool_result", "search_eligible_products"),
    }
    for event in tool_events:
        assert set(event.payload) == TOOL_PAYLOAD_KEYS
        assert isinstance(event.payload["argument_summary"], Mapping)
        assert isinstance(event.payload["result_ids"], tuple)
        assert isinstance(event.payload["duration_ms"], int | float)
        assert event.payload["duration_ms"] >= 0
        assert isfinite(event.payload["duration_ms"])
        assert event.payload["status"] in {"started", "succeeded", "failed"}
        if event.event_type == "tool_call":
            assert event.payload["status"] == "started"
            assert event.payload["result_ids"] == ()
        else:
            assert event.payload["status"] == "succeeded"
            allowed_result_ids = (
                set(fixtures.evidence_documents)
                if event.payload["tool_name"] == "retrieve_evidence"
                else set(fixtures.products)
            )
            assert set(event.payload["result_ids"]) <= allowed_result_ids

    cart_events = {
        event.event_type: event
        for event in events
        if event.event_type in {"cart_preview", "cart_add"}
    }
    assert {
        name: event.model_dump(mode="json")["payload"]
        for name, event in cart_events.items()
    } == {
        "cart_preview": {
            "sku_id": preview.sku_id,
            "quantity": 1,
            "simulated": True,
        },
        "cart_add": {
            "sku_id": preview.sku_id,
            "quantity": 1,
            "simulated": True,
        },
    }

    serialized_events = [event.model_dump(mode="json") for event in events]
    assert not any(
        _contains_forbidden_key(record["payload"]) for record in serialized_events
    )
    assert GOLDEN_INPUT not in json.dumps(serialized_events)
    assert preview.confirmation_token not in json.dumps(serialized_events)

    persisted_events = [
        json.loads(line) for line in trace_path.read_text(encoding="utf-8").splitlines()
    ]
    assert persisted_events == serialized_events


def test_safety_boundary_trace_omits_user_controlled_identifiers_and_text(
    tmp_path,
) -> None:
    fixtures = FixtureRepository.load(FIXTURE_ROOT)
    trace_path = tmp_path / "safety-trace.jsonl"
    sessions = SessionRepository(trace_path)
    engine = WorkflowEngine(ShoppingTools(fixtures), sessions)
    session = sessions.create(
        EntryPoint.CONTENT,
        "morning-routine-uv-001",
        None,
    )
    caller_controlled_id = "secret=customer@example.com"
    caller_controlled_text = "Diagnose this burning rash and treat it"

    turn = engine.handle_message(
        session,
        GuideMessageRequest(
            message_id=caller_controlled_id,
            text=caller_controlled_text,
        ),
    )

    assert turn.kind == "safety_boundary"
    safety_event = sessions.events_for_trace(session.trace_id)[0]
    assert safety_event.event_type == "safety_boundary"
    assert safety_event.model_dump(mode="json")["payload"] == {
        "code": "MEDICAL_DIAGNOSIS"
    }
    persisted = trace_path.read_text(encoding="utf-8")
    assert caller_controlled_id not in persisted
    assert caller_controlled_text not in persisted


def test_failed_tool_result_is_observable_without_exception_content(
    tmp_path,
    monkeypatch,
) -> None:
    fixtures = FixtureRepository.load(FIXTURE_ROOT)
    trace_path = tmp_path / "failed-tool-trace.jsonl"
    sessions = SessionRepository(trace_path)
    engine = WorkflowEngine(ShoppingTools(fixtures), sessions)
    session = sessions.create(
        EntryPoint.CONTENT,
        "morning-routine-uv-001",
        None,
    )
    exception_content = "secret=do-not-persist-this"

    def fail_search(*_args, **_kwargs):
        raise RuntimeError(exception_content)

    monkeypatch.setattr(ShoppingTools, "search_eligible_products", fail_search)
    engine.open_session(session)

    with pytest.raises(RuntimeError, match="do-not-persist"):
        engine.handle_message(
            session,
            GuideMessageRequest(message_id="failed_tool", text=GOLDEN_INPUT),
        )

    failed_event = next(
        event
        for event in sessions.events_for_trace(session.trace_id)
        if event.event_type == "tool_result"
        and event.payload["tool_name"] == "search_eligible_products"
    )
    assert set(failed_event.payload) == TOOL_PAYLOAD_KEYS
    assert failed_event.payload["status"] == "failed"
    assert failed_event.payload["result_ids"] == ()
    assert failed_event.payload["duration_ms"] >= 0
    assert isfinite(failed_event.payload["duration_ms"])
    assert exception_content not in trace_path.read_text(encoding="utf-8")


@pytest.mark.parametrize(
    "tool_method",
    ["retrieve_evidence", "search_eligible_products"],
)
def test_original_tool_error_survives_failed_result_trace_write(
    tmp_path,
    monkeypatch,
    tool_method: str,
) -> None:
    fixtures = FixtureRepository.load(FIXTURE_ROOT)
    trace_path = tmp_path / f"{tool_method}-dual-failure.jsonl"
    sessions = SessionRepository(trace_path)
    engine = WorkflowEngine(ShoppingTools(fixtures), sessions)
    session = sessions.create(
        EntryPoint.CONTENT,
        "morning-routine-uv-001",
        None,
    )
    original_tool_error = RuntimeError(f"original {tool_method} failure")
    trace_error_text = "secondary trace persistence failure"

    def fail_tool(*_args, **_kwargs):
        raise original_tool_error

    monkeypatch.setattr(ShoppingTools, tool_method, fail_tool)
    engine.open_session(session)
    original_append_event = sessions.append_event

    def fail_failed_result_event(session_, event_type, state, payload):
        if event_type == "tool_result" and payload.get("status") == "failed":
            raise OSError(trace_error_text)
        return original_append_event(session_, event_type, state, payload)

    monkeypatch.setattr(sessions, "append_event", fail_failed_result_event)

    with pytest.raises(RuntimeError) as caught:
        engine.handle_message(
            session,
            GuideMessageRequest(
                message_id=f"dual_failure_{tool_method}",
                text=GOLDEN_INPUT,
            ),
        )

    assert caught.value is original_tool_error
    assert str(caught.value) == f"original {tool_method} failure"
    persisted = trace_path.read_text(encoding="utf-8")
    assert str(original_tool_error) not in persisted
    assert trace_error_text not in persisted
