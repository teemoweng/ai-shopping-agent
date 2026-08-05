import json
from pathlib import Path

import pytest

from app.domain.contracts import (
    CartPreviewRequest,
    CompareRequest,
    CreateGuideSessionRequest,
    EntryPoint,
    GuideMessageRequest,
    GuideViewKind,
)
from app.repositories.fixture_repository import FixtureRepository
from app.repositories.session_repository import SessionRepository
from app.services.cart_service import CartService
from app.services.guide_service import GuideService
from app.workflow import agent
from app.workflow.engine import WorkflowEngine
from app.workflow.tools import ShoppingTools

FIXTURE_ROOT = Path(__file__).parents[4] / "data" / "fixtures"


def build_services(tmp_path):
    fixtures = FixtureRepository.load(FIXTURE_ROOT)
    sessions = SessionRepository(tmp_path / "trace.jsonl")
    engine = WorkflowEngine(ShoppingTools(fixtures), sessions)
    return engine, CartService(fixtures, sessions), sessions


def test_every_guide_view_has_explicit_server_actions() -> None:
    expected = {
        "OPENING_CONTEXT": ["RETURN_TO_FEED"],
        "CONTEXT_CONFIRMATION": ["CONFIRM_CONTEXT", "RETURN_TO_FEED"],
        "WAITING_CLARIFICATION": [
            "ANSWER_CLARIFICATION",
            "SKIP_CLARIFICATION",
            "UPDATE_CONSTRAINTS",
            "RETURN_TO_FEED",
        ],
        "VERIFYING_FACTS": ["RETURN_TO_FEED"],
        "DECISION_READY": [
            "UPDATE_CONSTRAINTS",
            "REQUEST_COMPARISON",
            "OPEN_PRODUCT",
            "RETURN_TO_FEED",
        ],
        "NO_MATCH": ["RELAX_CONSTRAINT", "RETURN_TO_FEED"],
        "INSUFFICIENT_EVIDENCE": [
            "OPEN_PRODUCT",
            "CONTINUE_WITH_KNOWN",
            "RETURN_TO_FEED",
        ],
        "COMPARISON_READY": ["OPEN_PRODUCT", "RETURN_TO_FEED"],
        "SAFE_BOUNDARY": ["RETURN_TO_FEED"],
        "RECOVERY_REQUIRED": ["RETRY_GUIDE_OPERATION", "RETURN_TO_FEED"],
        "FATAL_ERROR": ["RETURN_TO_FEED"],
    }
    assert {
        view_kind.value: [action.value for action in agent.allowed_actions_for(view_kind)]
        for view_kind in GuideViewKind
    } == expected


@pytest.mark.parametrize(
    "text",
    [
        "请诊断这个问题",
        "怎么治疗皮疹",
        "用了以后过敏",
        "起了荨麻疹",
        "脸部肿胀",
        "呼吸困难",
        "会有药物相互作用吗",
    ],
)
def test_chinese_health_requests_enter_safe_boundary_without_raw_trace(
    tmp_path,
    text: str,
) -> None:
    engine, _, sessions = build_services(tmp_path)
    session = sessions.create(
        EntryPoint.CONTENT,
        "morning-routine-uv-001",
        None,
        locale="zh-CN",
    )

    turn = engine.handle_message(
        session,
        GuideMessageRequest(message_id="msg_health", text=text),
    )

    assert turn.guide_view_kind == "SAFE_BOUNDARY"
    assert turn.guide_status == "SAFE_EXIT"
    assert turn.allowed_actions == ["RETURN_TO_FEED"]
    assert turn.recommendations == []
    trace_text = (tmp_path / "trace.jsonl").read_text(encoding="utf-8")
    assert text not in trace_text
    assert all(
        "text" not in event["payload"]
        for event in map(json.loads, trace_text.splitlines())
    )


@pytest.mark.parametrize("text", ["荨麻疹", "脸部肿胀", "呼吸困难", "严重过敏"])
def test_chinese_urgent_symptoms_keep_distinct_emergency_wording(
    tmp_path,
    text: str,
) -> None:
    engine, _, sessions = build_services(tmp_path)
    session = sessions.create(
        EntryPoint.CONTENT,
        "morning-routine-uv-001",
        None,
        locale="zh-CN",
    )

    turn = engine.handle_message(
        session,
        GuideMessageRequest(message_id="msg_urgent", text=text),
    )

    assert "立即寻求紧急医疗帮助" in turn.text


def test_guide_revision_changes_only_for_decision_inputs(tmp_path) -> None:
    engine, cart, sessions = build_services(tmp_path)
    session = sessions.create(
        EntryPoint.CONTENT,
        "morning-routine-uv-001",
        None,
        locale="zh-CN",
    )
    engine.open_session(session)

    first = engine.handle_message(
        session,
        GuideMessageRequest(
            message_id="msg_1",
            text="预算30美元以内、无香精、自然妆效",
        ),
    )
    repeated = engine.handle_message(
        session,
        GuideMessageRequest(
            message_id="msg_2",
            text="预算30美元以内、无香精、自然妆效",
        ),
    )
    changed = engine.handle_message(
        session,
        GuideMessageRequest(
            message_id="msg_3",
            text="预算30美元以内、无香精、哑光妆效",
        ),
    )

    assert first.guide_revision == 2
    assert repeated.guide_revision == first.guide_revision
    assert changed.guide_revision == first.guide_revision + 1

    revision_before_decision_actions = session.guide_revision
    cart.compare(
        session.id,
        request=CompareRequest(
            product_ids=["cloud-veil-mineral", "seoul-shade-daily-fluid"]
        ),
    )
    assert session.guide_revision == revision_before_decision_actions
    cart.preview(
        session.id,
        request=CartPreviewRequest(sku_id="cloud-veil-50", quantity=1),
    )
    assert session.guide_revision == revision_before_decision_actions


def test_returned_turn_cannot_mutate_stored_verified_snapshot(tmp_path) -> None:
    engine, _, sessions = build_services(tmp_path)
    service = GuideService(engine, sessions)
    turn = service.create(
        CreateGuideSessionRequest(
            entry_point=EntryPoint.CONTENT,
            content_context_id="morning-routine-uv-001",
            locale="zh-CN",
        )
    )
    verified_text = turn.text

    turn.text = "被调用方篡改"

    assert service.get(turn.session_id).text == verified_text
