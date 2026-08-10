import json
import re
from collections.abc import Mapping
from copy import deepcopy
from datetime import datetime
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
COMMITTED_TRACE_SAMPLE = (
    Path(__file__).parents[4]
    / "artifacts"
    / "traces"
    / "samples"
    / "foundation-golden.jsonl"
)
GOLDEN_INPUT = "Under $20, fragrance-free, natural finish, daily commute"
TOOL_PAYLOAD_KEYS = {
    "tool_name",
    "argument_summary",
    "result_ids",
    "duration_ms",
    "status",
}
FORBIDDEN_TRACE_KEYS = {
    "account_id",
    "actor_id",
    "text",
    "message",
    "raw_message",
    "message_text",
    "conversation_transcript",
    "raw_text",
    "input",
    "raw_input",
    "user_input",
    "input_text",
    "prompt",
    "query",
    "chain_of_thought",
    "private_reasoning",
    "reasoning",
    "confirmation_token",
    "confirm_token",
    "api_key",
    "secret",
    "caller_id",
    "caller_identifier",
    "caller_user_id",
    "caller_account_id",
    "message_id",
    "message_identifier",
    "raw_message_id",
    "user_message_id",
    "request_message_id",
    "client_message_id",
    "user_id",
    "customer_id",
    "email",
    "phone_number",
}
TRACE_RECORD_KEYS = {
    "event_id",
    "trace_id",
    "session_id",
    "event_type",
    "state",
    "timestamp",
    "payload",
}
EXPECTED_EVENT_SEQUENCE = [
    ("state_transition", "UNDERSTAND"),
    ("state_transition", "CLARIFY"),
    ("state_transition", "VERIFY_CURRENT_PRODUCT"),
    ("tool_call", "VERIFY_CURRENT_PRODUCT"),
    ("tool_result", "VERIFY_CURRENT_PRODUCT"),
    ("state_transition", "FILTER_AND_RETRIEVE"),
    ("tool_call", "FILTER_AND_RETRIEVE"),
    ("tool_result", "FILTER_AND_RETRIEVE"),
    ("state_transition", "PRESENT_RECOMMENDATION"),
    ("cart_preview", "SKU_AND_CART_CONFIRM"),
    ("cart_add", "FEEDBACK_AND_MEMORY"),
]
EXPECTED_TRANSITION_PAYLOADS = {
    0: {"from": "ENTRY_INGEST", "to": "UNDERSTAND"},
    1: {"from": "UNDERSTAND", "to": "CLARIFY"},
    2: {"from": "CLARIFY", "to": "VERIFY_CURRENT_PRODUCT"},
    5: {"from": "VERIFY_CURRENT_PRODUCT", "to": "FILTER_AND_RETRIEVE"},
    8: {"from": "FILTER_AND_RETRIEVE", "to": "PRESENT_RECOMMENDATION"},
}
EXPECTED_TOOL_EVENTS = {
    3: {
        "event_type": "tool_call",
        "tool_name": "retrieve_evidence",
        "argument_summary": {
            "content_context_available": True,
            "includes_public_rule_terms": True,
        },
        "result_ids": [],
        "status": "started",
    },
    4: {
        "event_type": "tool_result",
        "tool_name": "retrieve_evidence",
        "argument_summary": {
            "content_context_available": True,
            "includes_public_rule_terms": True,
        },
        "result_ids": [
            "fda-sunscreen-basics",
            "fda-water-resistance-labeling",
            "synthetic-review-finish-aggregate",
        ],
        "status": "succeeded",
    },
    6: {
        "event_type": "tool_call",
        "tool_name": "search_eligible_products",
        "argument_summary": {
            "hard_constraint_fields": [
                "fragrance_free",
                "in_stock",
                "max_price_usd",
            ],
            "soft_preference_fields": ["finish"],
            "in_stock_required": True,
        },
        "result_ids": [],
        "status": "started",
    },
    7: {
        "event_type": "tool_result",
        "tool_name": "search_eligible_products",
        "argument_summary": {
            "hard_constraint_fields": [
                "fragrance_free",
                "in_stock",
                "max_price_usd",
            ],
            "soft_preference_fields": ["finish"],
            "in_stock_required": True,
        },
        "result_ids": ["seoul-shade-daily-fluid", "cloud-veil-mineral"],
        "status": "succeeded",
    },
}
EXPECTED_CART_EVENTS = {
    9: (
        "cart_preview",
        {"sku_id": "seoul-shade-50", "quantity": 1, "simulated": True},
    ),
    10: (
        "cart_add",
        {"sku_id": "seoul-shade-50", "quantity": 1, "simulated": True},
    ),
}
TRACE_ID_PATTERN = re.compile(
    r"^(?:evt|trc|ses)_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-"
    r"[0-9a-f]{4}-[0-9a-f]{12}$"
)
CONFIRMATION_TOKEN_PATTERN = re.compile(
    r"(?i)(?:\bconfirmation[_-]?token\b|"
    r"\bconfirm_[a-z0-9][a-z0-9._:-]{7,}\b)"
)


def _contains_forbidden_key(value: object) -> bool:
    if isinstance(value, dict):
        return any(
            _normalize_trace_key(key) in FORBIDDEN_TRACE_KEYS for key in value
        ) or any(
            _contains_forbidden_key(item) for item in value.values()
        )
    if isinstance(value, list):
        return any(_contains_forbidden_key(item) for item in value)
    return False


def _normalize_trace_key(key: str) -> str:
    with_word_boundaries = re.sub(r"(?<=[a-z0-9])(?=[A-Z])", "_", key)
    return re.sub(r"[^a-z0-9]+", "_", with_word_boundaries.casefold()).strip("_")


def _normalized_trace_text(value: str) -> str:
    return " ".join(value.casefold().split())


def _assert_recursively_private(value: object, location: str = "record") -> None:
    if isinstance(value, dict):
        for key, item in value.items():
            assert isinstance(key, str), f"{location} contains a non-string key"
            normalized_key = _normalize_trace_key(key)
            assert normalized_key not in FORBIDDEN_TRACE_KEYS, (
                f"{location}.{key} is a forbidden trace key"
            )
            _assert_recursively_private(item, f"{location}.{key}")
        return
    if isinstance(value, list):
        for index, item in enumerate(value):
            _assert_recursively_private(item, f"{location}[{index}]")
        return
    if isinstance(value, str):
        normalized_value = _normalized_trace_text(value)
        assert _normalized_trace_text(GOLDEN_INPUT) not in normalized_value, (
            f"{location} contains raw user input"
        )
        assert not CONFIRMATION_TOKEN_PATTERN.search(value), (
            f"{location} contains a confirmation token pattern"
        )


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


def _load_committed_trace_records() -> list[dict[str, object]]:
    return [
        json.loads(line)
        for line in COMMITTED_TRACE_SAMPLE.read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]


def _validate_committed_trace_records(records: list[dict[str, object]]) -> None:
    assert len(records) == 11, "golden trace must contain exactly 11 records"
    assert all(isinstance(record, dict) for record in records)
    for index, record in enumerate(records):
        _assert_recursively_private(record, f"records[{index}]")
        assert set(record) == TRACE_RECORD_KEYS
        assert isinstance(record["event_id"], str)
        assert isinstance(record["trace_id"], str)
        assert isinstance(record["session_id"], str)
        assert TRACE_ID_PATTERN.fullmatch(record["event_id"])
        assert TRACE_ID_PATTERN.fullmatch(record["trace_id"])
        assert TRACE_ID_PATTERN.fullmatch(record["session_id"])
        assert isinstance(record["event_type"], str)
        assert isinstance(record["state"], str)
        assert isinstance(record["timestamp"], str)
        assert isinstance(record["payload"], dict)

    assert len({record["event_id"] for record in records}) == len(records)
    assert len({record["trace_id"] for record in records}) == 1
    assert len({record["session_id"] for record in records}) == 1

    timestamps = [datetime.fromisoformat(record["timestamp"]) for record in records]
    assert all(timestamp.tzinfo is not None for timestamp in timestamps)
    assert timestamps == sorted(timestamps), "golden trace timestamps must be ordered"

    observed_sequence = [
        (record["event_type"], record["state"]) for record in records
    ]
    assert observed_sequence == EXPECTED_EVENT_SEQUENCE, (
        "golden trace must match the complete 11-event sequence"
    )

    for index, expected_payload in EXPECTED_TRANSITION_PAYLOADS.items():
        assert records[index]["payload"] == expected_payload, (
            f"transition record {index} must preserve its exact from/to pair"
        )

    for index, expected in EXPECTED_TOOL_EVENTS.items():
        record = records[index]
        payload = record["payload"]
        assert record["event_type"] == expected["event_type"]
        assert set(payload) == TOOL_PAYLOAD_KEYS
        assert payload["tool_name"] == expected["tool_name"]
        assert payload["argument_summary"] == expected["argument_summary"]
        assert payload["result_ids"] == expected["result_ids"]
        assert payload["status"] == expected["status"]
        duration_ms = payload["duration_ms"]
        assert type(duration_ms) in {int, float}
        assert isfinite(duration_ms) and duration_ms >= 0
        if record["event_type"] == "tool_call":
            assert duration_ms == 0
            assert payload["result_ids"] == []
            assert payload["status"] == "started"
        else:
            assert payload["result_ids"]
            assert payload["status"] == "succeeded"

    for index, (expected_event_type, expected_payload) in EXPECTED_CART_EVENTS.items():
        record = records[index]
        assert record["event_type"] == expected_event_type
        assert record["payload"] == expected_payload


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


def test_committed_trace_sample_is_redacted() -> None:
    _validate_committed_trace_records(_load_committed_trace_records())


def test_committed_trace_validator_rejects_swapped_first_transitions() -> None:
    records = deepcopy(_load_committed_trace_records())
    records[0], records[1] = records[1], records[0]

    with pytest.raises(AssertionError):
        _validate_committed_trace_records(records)


@pytest.mark.parametrize(
    "identifier_key",
    [
        "caller_id",
        "callerId",
        "caller-identifier",
        "message_id",
        "messageId",
        "message-identifier",
        "user_message_id",
        "rawMessageId",
    ],
)
def test_committed_trace_validator_rejects_nested_caller_and_message_identifiers(
    identifier_key: str,
) -> None:
    records = deepcopy(_load_committed_trace_records())
    argument_summary = records[3]["payload"]["argument_summary"]
    argument_summary["metadata"] = {identifier_key: "caller-controlled-value"}

    with pytest.raises(AssertionError):
        _validate_committed_trace_records(records)


@pytest.mark.parametrize(
    "sensitive_key",
    ["raw_message", "message_text", "client_message_id", "conversation_transcript"],
)
def test_committed_trace_validator_rejects_conversation_sensitive_keys(
    sensitive_key: str,
) -> None:
    records = deepcopy(_load_committed_trace_records())
    records[3]["payload"]["argument_summary"][sensitive_key] = "must-not-persist"

    with pytest.raises(AssertionError):
        _validate_committed_trace_records(records)


def test_committed_trace_validator_rejects_raw_user_input_in_arguments() -> None:
    records = deepcopy(_load_committed_trace_records())
    argument_summary = records[3]["payload"]["argument_summary"]
    argument_summary["content_context_available"] = GOLDEN_INPUT

    with pytest.raises(AssertionError):
        _validate_committed_trace_records(records)


def test_committed_trace_validator_rejects_started_tool_result() -> None:
    records = deepcopy(_load_committed_trace_records())
    records[4]["payload"]["status"] = "started"

    with pytest.raises(AssertionError):
        _validate_committed_trace_records(records)


def test_committed_trace_validator_rejects_extra_twelfth_record() -> None:
    records = deepcopy(_load_committed_trace_records())
    extra_record = deepcopy(records[-1])
    extra_record["event_id"] = "evt_00000000-0000-4000-8000-000000000000"
    records.append(extra_record)

    with pytest.raises(AssertionError):
        _validate_committed_trace_records(records)


def test_committed_trace_validator_rejects_nested_confirmation_token_value() -> None:
    records = deepcopy(_load_committed_trace_records())
    argument_summary = records[3]["payload"]["argument_summary"]
    argument_summary["content_context_available"] = (
        "confirm_00000000-0000-4000-8000-000000000000"
    )

    with pytest.raises(AssertionError):
        _validate_committed_trace_records(records)


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
