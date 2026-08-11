import pytest
from fastapi.testclient import TestClient

from app.main import app, create_app

client = TestClient(app)


def preflight(
    origin: str,
    *,
    method: str = "POST",
    headers: str = "Content-Type",
):
    return client.options(
        "/api/v1/guide/sessions",
        headers={
            "Origin": origin,
            "Access-Control-Request-Method": method,
            "Access-Control-Request-Headers": headers,
        },
    )


@pytest.mark.parametrize(
    "origin",
    ["http://127.0.0.1:3000", "http://localhost:3000"],
)
def test_preflight_allows_local_prototype_origins(origin: str) -> None:
    response = preflight(origin)

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == origin
    assert response.headers["access-control-allow-methods"] == "GET, POST"
    allowed_headers = {
        header.strip().lower()
        for header in response.headers["access-control-allow-headers"].split(",")
    }
    assert "content-type" in allowed_headers
    assert "authorization" not in allowed_headers
    assert "access-control-allow-credentials" not in response.headers


def test_preflight_rejects_untrusted_origin() -> None:
    response = preflight("https://malicious.example")

    assert response.status_code == 400
    assert "access-control-allow-origin" not in response.headers
    assert "access-control-allow-credentials" not in response.headers


def test_preflight_rejects_put_method() -> None:
    response = preflight("http://127.0.0.1:3000", method="PUT")

    assert response.status_code == 400
    assert response.headers["access-control-allow-origin"] == "http://127.0.0.1:3000"
    assert response.headers["access-control-allow-methods"] == "GET, POST"
    assert "access-control-allow-credentials" not in response.headers


def test_preflight_rejects_authorization_header() -> None:
    response = preflight("http://127.0.0.1:3000", headers="Authorization")

    assert response.status_code == 400
    assert response.headers["access-control-allow-origin"] == "http://127.0.0.1:3000"
    allowed_headers = {
        header.strip().lower()
        for header in response.headers["access-control-allow-headers"].split(",")
    }
    assert "authorization" not in allowed_headers
    assert "access-control-allow-credentials" not in response.headers


def test_preflight_allows_only_the_configured_production_origin() -> None:
    production_client = TestClient(create_app(("https://shopping.example",)))
    allowed = production_client.options(
        "/api/v1/guide/sessions",
        headers={
            "Origin": "https://shopping.example",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "Content-Type",
        },
    )
    local = production_client.options(
        "/api/v1/guide/sessions",
        headers={
            "Origin": "http://127.0.0.1:3000",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "Content-Type",
        },
    )

    assert allowed.status_code == 200
    assert allowed.headers["access-control-allow-origin"] == "https://shopping.example"
    assert local.status_code == 400
    assert "access-control-allow-origin" not in local.headers
