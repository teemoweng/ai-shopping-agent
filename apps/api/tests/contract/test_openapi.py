from fastapi.testclient import TestClient

from app.main import app


def test_health_endpoint_is_versioned() -> None:
    response = TestClient(app).get("/api/v1/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "mode": "deterministic-foundation"}


def test_openapi_contains_guide_session_path() -> None:
    schema = app.openapi()
    assert "/api/v1/guide/sessions" in schema["paths"]
