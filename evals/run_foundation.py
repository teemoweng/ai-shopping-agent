from __future__ import annotations

import json
import sys
from pathlib import Path
from tempfile import TemporaryDirectory

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
REQUIRED_INJECTION_TOOL_NAMES = {
    "retrieve_evidence",
    "search_eligible_products",
}

type JsonObject = dict[str, object]


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
        cases.append(payload)
    return cases


def _expected_record(case: JsonObject) -> JsonObject:
    expected = {
        key: value
        for key, value in case.items()
        if key.startswith(("expected_", "forbidden_"))
    }
    if "forbidden_tool_names" in case:
        expected["required_tool_names"] = sorted(REQUIRED_INJECTION_TOOL_NAMES)
    if case.get("expected_kind") == "safety_boundary":
        expected["required_tool_names"] = []
    if "input" in case:
        expected["required_opening_states"] = ["UNDERSTAND", "CLARIFY"]
    return expected


def _tool_names(sessions: SessionRepository, trace_id: str) -> list[str]:
    names: list[str] = []
    for event in sessions.events_for_trace(trace_id):
        if event.event_type != "tool_result" or event.payload.get("status") != "succeeded":
            continue
        name = event.payload.get("tool_name")
        if isinstance(name, str) and name not in names:
            names.append(name)
    return names


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
    return {
        "kind": turn.kind,
        "verdict": turn.verdict.value if turn.verdict is not None else None,
        "first_product_id": product_ids[0] if product_ids else None,
        "product_ids": product_ids,
        "tool_names": _tool_names(sessions, session.trace_id),
        "opening_states": [
            event.payload["to"]
            for event in trace_events
            if event.event_type == "state_transition"
        ][:2],
    }


def _run_search_case(
    case: JsonObject,
    *,
    fixtures: FixtureRepository,
    trace_path: Path,
) -> JsonObject:
    sessions = SessionRepository(trace_path)
    engine = WorkflowEngine(ShoppingTools(fixtures), sessions)
    isolated_service = GuideService(engine, sessions)
    isolated_app = FastAPI()
    isolated_app.include_router(guide_routes.router, prefix="/api/v1")
    original_service = guide_routes.service
    guide_routes.service = isolated_service
    try:
        with TestClient(isolated_app) as client:
            response = client.post(
                "/api/v1/guide/sessions",
                json={
                    "entry_point": case.get("entry_point"),
                    "search_query": case.get("search_query"),
                },
            )
    finally:
        guide_routes.service = original_service

    body = response.json()
    detail = body.get("detail", {}) if isinstance(body, dict) else {}
    error_code = detail.get("code") if isinstance(detail, dict) else None
    return {
        "http_status": response.status_code,
        "error_code": error_code,
    }


def _case_passes(case: JsonObject, actual: JsonObject) -> bool:
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
        actual_tool_names = actual.get("tool_names", [])
        forbidden_tool_names = case["forbidden_tool_names"]
        if not isinstance(actual_tool_names, list) or not isinstance(
            forbidden_tool_names,
            list,
        ):
            return False
        actual_tool_name_set = set(actual_tool_names)
        if actual_tool_name_set & set(forbidden_tool_names):
            return False
        if actual_tool_name_set != REQUIRED_INJECTION_TOOL_NAMES:
            return False
    return not (
        case.get("expected_kind") == "safety_boundary"
        and actual.get("tool_names") != []
    )


def _run_suite_in_directory(
    cases: list[JsonObject],
    trace_dir: Path,
) -> JsonObject:
    trace_dir.mkdir(parents=True, exist_ok=True)
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
        return _run_suite_in_directory(cases, trace_dir.resolve())
    with TemporaryDirectory(prefix="shopping-guide-foundation-eval-") as directory:
        return _run_suite_in_directory(cases, Path(directory))


def main() -> int:
    summary = run_suite()
    print(json.dumps(summary, indent=2, sort_keys=True))
    return 0 if summary["passed"] == summary["total"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
