from fastapi.testclient import TestClient

from app.api.routes.guide import service
from app.main import app

client = TestClient(app)


def create_content_session() -> dict:
    response = client.post(
        "/api/v1/guide/sessions",
        json={"entry_point": "content", "content_context_id": "morning-routine-uv-001"},
    )
    assert response.status_code == 201
    return response.json()


def test_create_content_session_returns_inherited_context() -> None:
    body = create_content_session()
    assert body["session_id"].startswith("ses_")
    assert body["state"] == "CLARIFY"
    assert body["context"]["anchor_product_id"] == "seoul-shade-daily-fluid"


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
