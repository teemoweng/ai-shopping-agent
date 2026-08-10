from fastapi.testclient import TestClient

from app.api.routes.guide import service
from app.domain.contracts import GuideMessageRequest
from app.main import app

client = TestClient(app)


def create_content_session(locale: str | None = None) -> dict:
    payload = {
        "entry_point": "content",
        "content_context_id": "morning-routine-uv-001",
    }
    if locale is not None:
        payload["locale"] = locale
    response = client.post(
        "/api/v1/guide/sessions",
        json=payload,
    )
    assert response.status_code == 201
    return response.json()


def test_create_content_session_returns_inherited_context() -> None:
    body = create_content_session()
    assert body["session_id"].startswith("ses_")
    assert body["state"] == "UNDERSTAND"
    assert body["kind"] == "opening"
    assert body["guide_view_kind"] == "OPENING_CONTEXT"
    assert body["context"]["anchor_product_id"] == "seoul-shade-daily-fluid"
    assert body["context"]["anchor_product_name"] == "Seoul Shade Daily Fluid"
    assert body["conversation_revision"] == 1
    assert len(body["transcript"]) == 1
    assert body["transcript"][0]["id"].startswith("gmsg_")
    assert body["transcript"][0]["sequence"] == 1
    assert body["transcript"][0]["role"] == "ASSISTANT"


def test_message_advances_session_to_recommendation() -> None:
    session = create_content_session()
    response = client.post(
        f"/api/v1/guide/sessions/{session['session_id']}/messages",
        json={
            "message_id": "api_msg_1",
            "text": "Under $20, fragrance-free, natural finish, daily commute",
        },
    )
    assert response.status_code == 200
    assert response.json()["recommendations"][0]["product_id"] == "seoul-shade-daily-fluid"


def test_message_replay_returns_the_canonical_recoverable_transcript() -> None:
    created = create_content_session(locale="zh-CN")
    request = {
        "message_id": "stable-client-id",
        "text": "适合油皮吗？",
        "expected_conversation_revision": created["conversation_revision"],
    }

    first = client.post(
        f"/api/v1/guide/sessions/{created['session_id']}/messages",
        json=request,
    )
    replayed = client.post(
        f"/api/v1/guide/sessions/{created['session_id']}/messages",
        json=request,
    )
    restored = client.get(f"/api/v1/guide/sessions/{created['session_id']}")

    assert first.status_code == replayed.status_code == restored.status_code == 200
    assert first.json()["conversation_revision"] == 2
    assert replayed.json()["transcript"] == restored.json()["transcript"]
    assert len(restored.json()["transcript"]) == 3
    assert [message["sequence"] for message in restored.json()["transcript"]] == [
        1,
        2,
        3,
    ]
    assert len(
        {message["id"] for message in restored.json()["transcript"]}
    ) == len(restored.json()["transcript"])


def test_reused_message_id_with_different_payload_does_not_mutate_session() -> None:
    created = create_content_session(locale="zh-CN")
    session_id = created["session_id"]
    first = client.post(
        f"/api/v1/guide/sessions/{session_id}/messages",
        json={
            "message_id": "reused-client-id",
            "text": "适合油皮吗？",
            "expected_conversation_revision": created["conversation_revision"],
        },
    )
    assert first.status_code == 200
    session = service.sessions.get(session_id)
    before_session = session.model_copy(deep=True)
    before_snapshot = client.get(f"/api/v1/guide/sessions/{session_id}").json()
    before_events = service.sessions.events_for_trace(session.trace_id)
    trace_path = service.sessions._trace_path
    before_trace = trace_path.read_bytes()

    reused = client.post(
        f"/api/v1/guide/sessions/{session_id}/messages",
        json={
            "message_id": "reused-client-id",
            "text": "会不会泛白？",
            "expected_conversation_revision": created["conversation_revision"],
        },
    )

    assert reused.status_code == 409
    assert reused.json()["detail"]["code"] == "MESSAGE_ID_REUSED"
    assert service.sessions.get(session_id) == before_session
    assert client.get(f"/api/v1/guide/sessions/{session_id}").json() == before_snapshot
    assert service.sessions.events_for_trace(session.trace_id) == before_events
    assert trace_path.read_bytes() == before_trace


def test_stale_conversation_revision_does_not_mutate_session() -> None:
    created = create_content_session(locale="zh-CN")
    session_id = created["session_id"]
    first = client.post(
        f"/api/v1/guide/sessions/{session_id}/messages",
        json={
            "message_id": "fresh-client-id",
            "text": "适合油皮吗？",
            "expected_conversation_revision": created["conversation_revision"],
        },
    )
    assert first.status_code == 200
    session = service.sessions.get(session_id)
    before_session = session.model_copy(deep=True)
    before_snapshot = client.get(f"/api/v1/guide/sessions/{session_id}").json()
    before_events = service.sessions.events_for_trace(session.trace_id)
    trace_path = service.sessions._trace_path
    before_trace = trace_path.read_bytes()

    stale = client.post(
        f"/api/v1/guide/sessions/{session_id}/messages",
        json={
            "message_id": "stale-client-id",
            "text": "会不会泛白？",
            "expected_conversation_revision": created["conversation_revision"],
        },
    )

    assert stale.status_code == 409
    assert stale.json()["detail"]["code"] == "STALE_CONVERSATION"
    assert service.sessions.get(session_id) == before_session
    assert client.get(f"/api/v1/guide/sessions/{session_id}").json() == before_snapshot
    assert service.sessions.events_for_trace(session.trace_id) == before_events
    assert trace_path.read_bytes() == before_trace


def test_message_request_accepts_an_optional_conversation_revision() -> None:
    request = GuideMessageRequest(
        message_id="api_msg_revision",
        text="适合油皮吗？",
        expected_conversation_revision=1,
    )

    assert request.expected_conversation_revision == 1


def test_unknown_session_is_404() -> None:
    response = client.post(
        "/api/v1/guide/sessions/ses_missing/messages",
        json={"message_id": "api_msg_2", "text": "daily commute"},
    )
    assert response.status_code == 404
    assert response.json()["detail"]["code"] == "SESSION_NOT_FOUND"


def test_unknown_content_context_returns_404_without_session_or_trace() -> None:
    session_count = len(service.sessions._sessions)
    event_count = len(service.sessions._events)

    response = TestClient(app, raise_server_exceptions=False).post(
        "/api/v1/guide/sessions",
        json={"entry_point": "content", "content_context_id": "missing-context"},
    )

    assert response.status_code == 404
    assert response.json()["detail"]["code"] == "CONTENT_CONTEXT_NOT_FOUND"
    assert len(service.sessions._sessions) == session_count
    assert len(service.sessions._events) == event_count


def test_search_contract_is_accepted_but_execution_is_explicitly_unavailable() -> None:
    response = client.post(
        "/api/v1/guide/sessions",
        json={"entry_point": "search", "search_query": "light sunscreen"},
    )
    assert response.status_code == 501
    assert response.json()["detail"]["code"] == "SEARCH_EXECUTION_NOT_AVAILABLE"


def test_chinese_session_returns_the_approved_lightweight_opening() -> None:
    body = create_content_session(locale="zh-CN")
    assert body["locale"] == "zh-CN"
    assert body["guide_status"] == "WAITING_USER"
    assert body["guide_view_kind"] == "OPENING_CONTEXT"
    assert body["guide_revision"] == 1
    assert body["facts_snapshot_at"] is not None
    assert body["text"] == "我看到你在看 Seoul Shade。你最想确认什么？"
    assert body["quick_replies"] == ["适合油皮吗？", "会不会泛白？", "和防水款比比"]
    assert body["allowed_actions"] == ["SEND_MESSAGE", "RETURN_TO_FEED"]


def test_chinese_fit_clarification_short_answer_and_decision_are_progressive() -> None:
    fit_session = create_content_session(locale="zh-CN")
    fit = client.post(
        f"/api/v1/guide/sessions/{fit_session['session_id']}/messages",
        json={
            "message_id": "api_msg_fit",
            "text": "适合油皮吗？",
            "expected_conversation_revision": fit_session["conversation_revision"],
        },
    )
    assert fit.status_code == 200
    fit_body = fit.json()
    assert fit_body["guide_view_kind"] == "WAITING_CLARIFICATION"
    assert fit_body["quick_replies"] == ["日常通勤", "户外出汗或玩水"]
    assert fit_body["text"].count("？") <= 1
    assert fit_body["recommendations"] == []

    decision = client.post(
        f"/api/v1/guide/sessions/{fit_session['session_id']}/messages",
        json={
            "message_id": "api_msg_commute",
            "text": "日常通勤",
            "expected_conversation_revision": fit_body["conversation_revision"],
        },
    )
    assert decision.status_code == 200
    assert decision.json()["guide_view_kind"] == "DECISION_READY"
    assert decision.json()["recommendations"]

    claim_session = create_content_session(locale="zh-CN")
    claim = client.post(
        f"/api/v1/guide/sessions/{claim_session['session_id']}/messages",
        json={
            "message_id": "api_msg_cast",
            "text": "会不会泛白？",
            "expected_conversation_revision": claim_session[
                "conversation_revision"
            ],
        },
    )
    assert claim.status_code == 200
    claim_body = claim.json()
    assert claim_body["guide_view_kind"] == "ANSWER_READY"
    assert claim_body["recommendations"] == []
    assert "低泛白风险" in claim_body["text"]
    assert "所有肤色" in claim_body["text"]
    assert claim_body["guide_revision"] == claim_session["guide_revision"]


def test_chinese_message_returns_decision_ready_recommendation() -> None:
    session = create_content_session(locale="zh-CN")
    response = client.post(
        f"/api/v1/guide/sessions/{session['session_id']}/messages",
        json={
            "message_id": "api_msg_zh",
            "text": "油敏皮、深肤色、预算30美元以内、自然妆效",
        },
    )
    body = response.json()
    assert response.status_code == 200
    assert body["guide_status"] == "ACTIVE"
    assert body["guide_view_kind"] == "DECISION_READY"
    assert body["degraded"] is False
    assert "满足你明确条件" in body["text"]
    assert body["recommendations"]
    assert body["allowed_actions"] == [
        "SEND_MESSAGE",
        "UPDATE_CONSTRAINTS",
        "REQUEST_COMPARISON",
        "OPEN_PRODUCT",
        "RETURN_TO_FEED",
    ]


def test_chinese_no_match_has_only_recovery_actions() -> None:
    session = create_content_session(locale="zh-CN")
    response = client.post(
        f"/api/v1/guide/sessions/{session['session_id']}/messages",
        json={
            "message_id": "api_msg_no_match",
            "text": "预算15美元以内、无香精、80分钟防水",
        },
    )
    body = response.json()
    assert body["guide_view_kind"] == "NO_MATCH"
    assert body["allowed_actions"] == [
        "SEND_MESSAGE",
        "RELAX_CONSTRAINT",
        "RETURN_TO_FEED",
    ]
    assert body["recommendations"] == []
    assert "不会悄悄放宽" in body["text"]


def test_chinese_insufficient_evidence_has_no_comparison_action(monkeypatch) -> None:
    monkeypatch.setattr(
        type(service.engine.tools),
        "retrieve_evidence",
        lambda self, query: [],
    )
    session = create_content_session(locale="zh-CN")
    response = client.post(
        f"/api/v1/guide/sessions/{session['session_id']}/messages",
        json={"message_id": "api_msg_no_evidence", "text": "预算30美元以内"},
    )
    body = response.json()
    assert body["guide_view_kind"] == "INSUFFICIENT_EVIDENCE"
    assert body["allowed_actions"] == [
        "SEND_MESSAGE",
        "OPEN_PRODUCT",
        "CONTINUE_WITH_KNOWN",
        "RETURN_TO_FEED",
    ]
    assert "证据不足" in body["text"]
    assert "REQUEST_COMPARISON" not in body["allowed_actions"]


def test_chinese_safe_boundary_has_no_product_actions() -> None:
    session = create_content_session(locale="zh-CN")
    response = client.post(
        f"/api/v1/guide/sessions/{session['session_id']}/messages",
        json={"message_id": "api_msg_safe", "text": "脸部肿胀并且呼吸困难"},
    )
    body = response.json()
    assert body["guide_view_kind"] == "SAFE_BOUNDARY"
    assert body["guide_status"] == "SAFE_EXIT"
    assert body["recommendations"] == []
    assert body["allowed_actions"] == ["RETURN_TO_FEED"]


def test_latest_verified_snapshot_survives_reopen() -> None:
    session = create_content_session(locale="zh-CN")
    message = client.post(
        f"/api/v1/guide/sessions/{session['session_id']}/messages",
        json={"message_id": "api_msg_snapshot", "text": "预算30美元以内、自然妆效"},
    )
    reopened = client.get(f"/api/v1/guide/sessions/{session['session_id']}")
    assert reopened.status_code == 200
    assert reopened.json() == message.json()


def test_unknown_snapshot_session_has_stable_not_found() -> None:
    response = client.get("/api/v1/guide/sessions/ses_missing")
    assert response.status_code == 404
    assert response.json()["detail"]["code"] == "SESSION_NOT_FOUND"


def test_message_rejects_comparison_ready_without_mutating_snapshot_or_trace() -> None:
    created = create_content_session(locale="zh-CN")
    session_id = created["session_id"]
    recommended = client.post(
        f"/api/v1/guide/sessions/{session_id}/messages",
        json={
            "message_id": "terminal_api_setup",
            "text": "预算30美元以内、无香精、自然妆效",
        },
    )
    assert recommended.status_code == 200
    compared = client.post(
        f"/api/v1/guide/sessions/{session_id}/compare",
        json={
            "product_ids": [
                "seoul-shade-daily-fluid",
                "cloud-veil-mineral",
            ]
        },
    )
    assert compared.status_code == 200

    before_snapshot = client.get(f"/api/v1/guide/sessions/{session_id}").json()
    assert before_snapshot["guide_view_kind"] == "COMPARISON_READY"
    assert before_snapshot["transcript"][-1]["role"] == "ASSISTANT"
    assert before_snapshot["transcript"][-1]["kind"] == "COMPARISON"
    session = service.sessions.get(session_id)
    before_session = session.model_copy(deep=True)
    before_events = service.sessions.events_for_trace(session.trace_id)
    trace_path = service.sessions._trace_path
    before_trace = trace_path.read_bytes()

    rejected = client.post(
        f"/api/v1/guide/sessions/{session_id}/messages",
        json={"message_id": "terminal_api_blocked", "text": "改成哑光妆效"},
    )

    assert rejected.status_code == 409
    assert rejected.json()["detail"]["code"] == "ACTION_NOT_ALLOWED"
    assert client.get(f"/api/v1/guide/sessions/{session_id}").json() == before_snapshot
    assert service.sessions.get(session_id) == before_session
    assert service.sessions.events_for_trace(session.trace_id) == before_events
    assert trace_path.read_bytes() == before_trace
