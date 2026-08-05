from fastapi.testclient import TestClient

from app.main import app


def test_health_endpoint_is_versioned() -> None:
    response = TestClient(app).get("/api/v1/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "mode": "deterministic-foundation"}


def test_openapi_contains_guide_session_path() -> None:
    schema = app.openapi()
    assert "/api/v1/guide/sessions" in schema["paths"]


def test_openapi_contains_complete_vertical_slice() -> None:
    paths = app.openapi()["paths"]
    assert {
        "/api/v1/guide/sessions",
        "/api/v1/guide/sessions/{session_id}/messages",
        "/api/v1/guide/sessions/{session_id}/compare",
        "/api/v1/guide/sessions/{session_id}/cart/preview",
        "/api/v1/guide/sessions/{session_id}/cart/items",
    } <= set(paths)


def test_openapi_contains_catalog_paths() -> None:
    paths = app.openapi()["paths"]
    assert {
        "/api/v1/catalog/feed",
        "/api/v1/catalog/products/{product_id}",
    } <= set(paths)
