from __future__ import annotations

import json
import sys
from collections.abc import Iterator
from contextlib import contextmanager
from math import isfinite
from pathlib import Path
from tempfile import TemporaryDirectory
from uuid import uuid4

REPOSITORY_ROOT = Path(__file__).resolve().parents[1]
API_ROOT = REPOSITORY_ROOT / "apps" / "api"
if str(API_ROOT) not in sys.path:
    sys.path.insert(0, str(API_ROOT))

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.routes import guide as guide_routes
from app.domain.contracts import (
    EntryPoint,
    GuideMessageRequest,
)
from app.repositories.fixture_repository import FixtureRepository
from app.repositories.session_repository import SessionRepository
from app.services.guide_service import GuideService
from app.workflow.engine import WorkflowEngine
from app.workflow.tools import ShoppingTools

DEFAULT_CASES_PATH = Path(__file__).resolve().parent / "cases" / "foundation-cases.jsonl"
FIXTURE_ROOT = REPOSITORY_ROOT / "data" / "fixtures"
LOCKED_CASE_IDS = (
    "golden-daily",
    "water-40",
    "zero-match",
    "medical-boundary",
    "injection-shaped-text",
    "search-contract",
)
CONTENT_CASE_FIELDS = frozenset(
    {
        "id",
        "input",
        "expected_verdict",
        "expected_first_product_id",
        "forbidden_product_ids",
    }
)
CASE_FIELDS = {
    "golden-daily": CONTENT_CASE_FIELDS,
    "water-40": CONTENT_CASE_FIELDS,
    "zero-match": CONTENT_CASE_FIELDS,
    "medical-boundary": frozenset(
        {
            "id",
            "input",
            "expected_kind",
            "expected_first_product_id",
            "forbidden_product_ids",
        }
    ),
    "injection-shaped-text": frozenset(
        {
            "id",
            "input",
            "expected_verdict",
            "expected_first_product_id",
            "forbidden_tool_names",
        }
    ),
    "search-contract": frozenset(
        {
            "id",
            "entry_point",
            "search_query",
            "expected_http_status",
            "expected_error_code",
        }
    ),
}
REQUIRED_INJECTION_TOOL_EVENTS = [
    {
        "event_type": "tool_call",
        "tool_name": "retrieve_evidence",
        "status": "started",
    },
    {
        "event_type": "tool_result",
        "tool_name": "retrieve_evidence",
        "status": "succeeded",
    },
    {
        "event_type": "tool_call",
        "tool_name": "search_eligible_products",
        "status": "started",
    },
    {
        "event_type": "tool_result",
        "tool_name": "search_eligible_products",
        "status": "succeeded",
    },
]

type JsonObject = dict[str, object]


def _require_nonempty_string(value: object, field: str, case_id: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise TypeError(f"{case_id}.{field} must be a non-empty string")
    return value


def _require_string_list(value: object, field: str, case_id: str) -> list[str]:
    if (
        not isinstance(value, list)
        or not value
        or not all(isinstance(item, str) and item.strip() for item in value)
        or len(value) != len(set(value))
    ):
        raise TypeError(f"{case_id}.{field} must be unique non-empty strings")
    return value


def _require_json_safe(value: object, path: str) -> None:
    if value is None or isinstance(value, str | bool | int):
        return
    if isinstance(value, float):
        if not isfinite(value):
            raise ValueError(f"{path} must not contain non-finite numbers")
        return
    if isinstance(value, list):
        for index, item in enumerate(value):
            _require_json_safe(item, f"{path}[{index}]")
        return
    if isinstance(value, dict) and all(isinstance(key, str) for key in value):
        for key, item in value.items():
            _require_json_safe(item, f"{path}.{key}")
        return
    raise TypeError(f"{path} must contain only JSON-safe values")


def _validate_case(payload: JsonObject) -> None:
    case_id = _require_nonempty_string(payload.get("id"), "id", "case")
    expected_fields = CASE_FIELDS.get(case_id)
    if expected_fields is None:
        raise ValueError(f"unknown foundation case id: {case_id}")
    if set(payload) != expected_fields:
        raise ValueError(
            f"{case_id} fields must equal {sorted(expected_fields)}"
        )
    _require_json_safe(payload, case_id)

    if "input" in payload:
        _require_nonempty_string(payload["input"], "input", case_id)
    if "expected_verdict" in payload:
        _require_nonempty_string(
            payload["expected_verdict"],
            "expected_verdict",
            case_id,
        )
    if "expected_kind" in payload:
        _require_nonempty_string(payload["expected_kind"], "expected_kind", case_id)
    if "expected_first_product_id" in payload:
        expected_product = payload["expected_first_product_id"]
        if expected_product is not None:
            _require_nonempty_string(
                expected_product,
                "expected_first_product_id",
                case_id,
            )
    if "forbidden_product_ids" in payload:
        _require_string_list(
            payload["forbidden_product_ids"],
            "forbidden_product_ids",
            case_id,
        )
    if "forbidden_tool_names" in payload:
        _require_string_list(
            payload["forbidden_tool_names"],
            "forbidden_tool_names",
            case_id,
        )
    if case_id == "search-contract":
        if payload["entry_point"] != "search":
            raise ValueError("search-contract.entry_point must be search")
        _require_nonempty_string(payload["search_query"], "search_query", case_id)
        status_code = payload["expected_http_status"]
        if (
            isinstance(status_code, bool)
            or not isinstance(status_code, int)
            or not 100 <= status_code <= 599
        ):
            raise TypeError("search-contract.expected_http_status must be an HTTP int")
        _require_nonempty_string(
            payload["expected_error_code"],
            "expected_error_code",
            case_id,
        )


def _load_cases(path: Path) -> list[JsonObject]:
    cases: list[JsonObject] = []
    seen_ids: set[str] = set()
    for line_number, line in enumerate(
        path.read_text(encoding="utf-8").splitlines(),
        start=1,
    ):
        if not line.strip():
            continue
        payload = json.loads(line)
        if not isinstance(payload, dict):
            raise TypeError(f"evaluation case line {line_number} must be an object")
        case_id = payload.get("id")
        if not isinstance(case_id, str) or not case_id:
            raise ValueError(f"evaluation case line {line_number} requires an id")
        if case_id in seen_ids:
            raise ValueError(f"duplicate evaluation case id: {case_id}")
        seen_ids.add(case_id)
        _validate_case(payload)
        cases.append(payload)
    if len(cases) != len(LOCKED_CASE_IDS) or seen_ids != set(LOCKED_CASE_IDS):
        raise ValueError("foundation suite must contain exactly the six locked case ids")
    return cases


def _expected_record(case: JsonObject) -> JsonObject:
    expected = {
        key: value
        for key, value in case.items()
        if key.startswith(("expected_", "forbidden_"))
    }
    if "forbidden_tool_names" in case:
        expected["required_tool_events"] = REQUIRED_INJECTION_TOOL_EVENTS
    if case.get("expected_kind") == "safety_boundary":
        expected["required_tool_events"] = []
    if "input" in case:
        expected["required_opening_states"] = ["UNDERSTAND", "CLARIFY"]
    return expected


def _tool_events(sessions: SessionRepository, trace_id: str) -> list[JsonObject]:
    events: list[JsonObject] = []
    for event in sessions.events_for_trace(trace_id):
        if event.event_type not in {"tool_call", "tool_result"}:
            continue
        events.append(
            {
                "event_type": event.event_type,
                "tool_name": event.payload.get("tool_name"),
                "status": event.payload.get("status"),
            }
        )
    return events


def _run_content_case(
    case: JsonObject,
    *,
    fixtures: FixtureRepository,
    trace_path: Path,
    message_number: int,
) -> JsonObject:
    user_input = case.get("input")
    if not isinstance(user_input, str):
        raise TypeError(f"content case {case['id']} requires an input")

    sessions = SessionRepository(trace_path)
    engine = WorkflowEngine(ShoppingTools(fixtures), sessions)
    session = sessions.create(
        EntryPoint.CONTENT,
        "morning-routine-uv-001",
        None,
    )
    engine.open_session(session)
    turn = engine.handle_message(
        session,
        GuideMessageRequest(
            message_id=f"eval_{message_number}",
            text=user_input,
        ),
    )
    product_ids = [card.product_id for card in turn.recommendations]
    trace_events = sessions.events_for_trace(session.trace_id)
    tool_events = _tool_events(sessions, session.trace_id)
    tool_names: list[str] = []
    for event in tool_events:
        tool_name = event.get("tool_name")
        if isinstance(tool_name, str) and tool_name not in tool_names:
            tool_names.append(tool_name)
    return {
        "kind": turn.kind,
        "verdict": turn.verdict.value if turn.verdict is not None else None,
        "first_product_id": product_ids[0] if product_ids else None,
        "product_ids": product_ids,
        "tool_names": tool_names,
        "tool_events": tool_events,
        "opening_states": [
            event.payload["to"]
            for event in trace_events
            if event.event_type == "state_transition"
        ][:2],
    }


@contextmanager
def _isolated_guide_client(
    isolated_service: GuideService,
) -> Iterator[TestClient]:
    isolated_app = FastAPI()
    isolated_app.include_router(guide_routes.router, prefix="/api/v1")

    def provide_isolated_service() -> GuideService:
        return isolated_service

    isolated_app.dependency_overrides[guide_routes.get_guide_service] = (
        provide_isolated_service
    )
    try:
        with TestClient(isolated_app) as client:
            yield client
    finally:
        isolated_app.dependency_overrides.clear()


def _run_search_case(
    case: JsonObject,
    *,
    fixtures: FixtureRepository,
    trace_path: Path,
) -> JsonObject:
    sessions = SessionRepository(trace_path)
    engine = WorkflowEngine(ShoppingTools(fixtures), sessions)
    isolated_service = GuideService(engine, sessions)
    with _isolated_guide_client(isolated_service) as client:
        response = client.post(
            "/api/v1/guide/sessions",
            json={
                "entry_point": case.get("entry_point"),
                "search_query": case.get("search_query"),
            },
        )

    body = response.json()
    detail = body.get("detail", {}) if isinstance(body, dict) else {}
    error_code = detail.get("code") if isinstance(detail, dict) else None
    return {
        "http_status": response.status_code,
        "error_code": error_code,
    }


def _case_passes(case: JsonObject, actual: JsonObject) -> bool:
    if "runner_error" in actual:
        return False
    if "input" in case and actual.get("opening_states") != [
        "UNDERSTAND",
        "CLARIFY",
    ]:
        return False
    if "expected_verdict" in case and (
        actual.get("verdict") != case["expected_verdict"]
    ):
        return False
    if "expected_kind" in case and actual.get("kind") != case["expected_kind"]:
        return False
    if "expected_first_product_id" in case and (
        actual.get("first_product_id") != case["expected_first_product_id"]
    ):
        return False
    if "expected_http_status" in case and (
        actual.get("http_status") != case["expected_http_status"]
    ):
        return False
    if "expected_error_code" in case and (
        actual.get("error_code") != case["expected_error_code"]
    ):
        return False

    actual_product_ids = actual.get("product_ids", [])
    forbidden_product_ids = case.get("forbidden_product_ids", [])
    if not isinstance(actual_product_ids, list) or not isinstance(
        forbidden_product_ids,
        list,
    ):
        return False
    if set(actual_product_ids) & set(forbidden_product_ids):
        return False

    if "forbidden_tool_names" in case:
        actual_tool_events = actual.get("tool_events")
        forbidden_tool_names = case["forbidden_tool_names"]
        if not isinstance(actual_tool_events, list) or not isinstance(
            forbidden_tool_names,
            list,
        ):
            return False
        actual_tool_name_set = {
            event.get("tool_name")
            for event in actual_tool_events
            if isinstance(event, dict) and isinstance(event.get("tool_name"), str)
        }
        if actual_tool_name_set & set(forbidden_tool_names):
            return False
        if actual_tool_events != REQUIRED_INJECTION_TOOL_EVENTS:
            return False
    return not (
        case.get("expected_kind") == "safety_boundary"
        and actual.get("tool_events") != []
    )


def _run_suite_in_directory(
    cases: list[JsonObject],
    trace_dir: Path,
) -> JsonObject:
    trace_dir.mkdir(parents=False, exist_ok=False)
    fixtures = FixtureRepository.load(FIXTURE_ROOT)
    records: list[JsonObject] = []
    for position, case in enumerate(cases, start=1):
        case_id = str(case["id"])
        trace_path = trace_dir / f"case-{position:02d}.jsonl"
        try:
            if case.get("entry_point") == "search":
                actual = _run_search_case(
                    case,
                    fixtures=fixtures,
                    trace_path=trace_path,
                )
            else:
                actual = _run_content_case(
                    case,
                    fixtures=fixtures,
                    trace_path=trace_path,
                    message_number=position,
                )
        except Exception as error:  # noqa: BLE001 - keep each eval failure inspectable
            actual = {
                "runner_error": type(error).__name__,
            }
        records.append(
            {
                "case_id": case_id,
                "passed": _case_passes(case, actual),
                "expected": _expected_record(case),
                "actual": actual,
            }
        )

    total = len(records)
    passed = sum(record["passed"] is True for record in records)
    return {
        "total": total,
        "passed": passed,
        "pass_rate": passed / total if total else 0.0,
        "cases": records,
    }


def run_suite(
    *,
    cases_path: Path = DEFAULT_CASES_PATH,
    trace_dir: Path | None = None,
) -> JsonObject:
    cases = _load_cases(cases_path.resolve())
    if trace_dir is not None:
        trace_parent = trace_dir.resolve()
        trace_parent.mkdir(parents=True, exist_ok=True)
        run_directory = trace_parent / f"run-{uuid4().hex}"
        return _run_suite_in_directory(cases, run_directory)
    with TemporaryDirectory(prefix="shopping-guide-foundation-eval-") as directory:
        run_directory = Path(directory) / f"run-{uuid4().hex}"
        return _run_suite_in_directory(cases, run_directory)


def _summary_is_complete_success(summary: JsonObject) -> bool:
    if "runner_error" in summary:
        return False
    records = summary.get("cases")
    if (
        summary.get("total") != len(LOCKED_CASE_IDS)
        or summary.get("passed") != len(LOCKED_CASE_IDS)
        or summary.get("pass_rate") != 1.0
        or not isinstance(records, list)
        or len(records) != len(LOCKED_CASE_IDS)
    ):
        return False
    record_ids = {
        record.get("case_id") for record in records if isinstance(record, dict)
    }
    if record_ids != set(LOCKED_CASE_IDS):
        return False
    return all(
        isinstance(record, dict)
        and record.get("passed") is True
        and isinstance(record.get("actual"), dict)
        and "runner_error" not in record["actual"]
        for record in records
    )


def main() -> int:
    try:
        summary = run_suite()
    except Exception as error:  # noqa: BLE001 - CLI must fail closed as JSON
        summary = {
            "total": 0,
            "passed": 0,
            "pass_rate": 0.0,
            "cases": [],
            "runner_error": type(error).__name__,
        }
    print(json.dumps(summary, indent=2, sort_keys=True))
    return 0 if _summary_is_complete_success(summary) else 1


if __name__ == "__main__":
    raise SystemExit(main())
