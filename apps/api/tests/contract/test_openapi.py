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


def test_openapi_contains_independent_commerce_paths() -> None:
    paths = app.openapi()["paths"]
    assert {
        "/api/v1/commerce/cart/preview",
        "/api/v1/commerce/operations/{operation_id}/accept-facts",
        "/api/v1/commerce/operations/{operation_id}/items",
        "/api/v1/commerce/operations/{operation_id}",
        "/api/v1/commerce/operations/by-idempotency/{idempotency_key}",
    } <= set(paths)


def test_openapi_exposes_locked_commerce_request_scenarios() -> None:
    schemas = app.openapi()["components"]["schemas"]
    preview = schemas["CommercePreviewRequest"]
    add = schemas["CommerceAddRequest"]

    assert preview["required"] == [
        "purchase_origin",
        "product_id",
        "sku_id",
    ]
    assert preview["properties"]["purchase_origin"]["enum"] == ["FEED", "AI"]
    assert preview["properties"]["previous_operation_id"] == {
        "anyOf": [{"type": "string"}, {"type": "null"}],
        "title": "Previous Operation Id",
    }
    assert preview["properties"]["demo_scenario"]["enum"] == [
        "NORMAL",
        "PRICE_CHANGED",
        "OUT_OF_STOCK",
    ]
    assert add["required"] == [
        "confirmation_token",
        "idempotency_key",
        "expected_transaction_revision",
    ]
    assert add["properties"]["demo_scenario"]["enum"] == [
        "NORMAL",
        "COMMIT_STATUS_UNKNOWN",
    ]
