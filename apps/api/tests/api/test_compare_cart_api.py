from fastapi.testclient import TestClient

from app.dependencies import fixtures
from app.main import app

client = TestClient(app)


def recommended_session(
    message: str = "Under $25, fragrance-free, daily commute",
) -> str:
    session = client.post(
        "/api/v1/guide/sessions",
        json={
            "entry_point": "content",
            "content_context_id": "morning-routine-uv-001",
        },
    ).json()
    client.post(
        f"/api/v1/guide/sessions/{session['session_id']}/messages",
        json={"message_id": "cart_setup", "text": message},
    )
    return session["session_id"]


def test_compare_returns_structured_decision_rows() -> None:
    session_id = recommended_session()
    response = client.post(
        f"/api/v1/guide/sessions/{session_id}/compare",
        json={
            "product_ids": [
                "seoul-shade-daily-fluid",
                "cloud-veil-mineral",
            ]
        },
    )
    assert response.status_code == 200
    assert response.json()["state"] == "COMPARE"
    assert response.json()["rows"]["water_resistance_minutes"] == [None, 40]


def test_preview_then_confirm_adds_one_simulated_item() -> None:
    session_id = recommended_session()
    preview = client.post(
        f"/api/v1/guide/sessions/{session_id}/cart/preview",
        json={"sku_id": "seoul-shade-50", "quantity": 1},
    )
    assert preview.status_code == 200
    assert preview.json()["unit_price_usd"] == 19.0
    assert preview.json()["simulated"] is True
    token = preview.json()["confirmation_token"]
    added = client.post(
        f"/api/v1/guide/sessions/{session_id}/cart/items",
        json={"confirmation_token": token},
    )
    assert added.status_code == 201
    assert added.json()["sku_id"] == "seoul-shade-50"
    assert added.json()["simulated"] is True


def test_confirmation_token_cannot_be_replayed() -> None:
    session_id = recommended_session()
    token = client.post(
        f"/api/v1/guide/sessions/{session_id}/cart/preview",
        json={"sku_id": "seoul-shade-30", "quantity": 1},
    ).json()["confirmation_token"]
    endpoint = f"/api/v1/guide/sessions/{session_id}/cart/items"
    assert client.post(endpoint, json={"confirmation_token": token}).status_code == 201
    replay = client.post(endpoint, json={"confirmation_token": token})
    assert replay.status_code == 409
    assert replay.json()["detail"]["code"] == "TOKEN_ALREADY_USED"


def test_filtered_out_sku_cannot_be_previewed() -> None:
    session_id = recommended_session("Under $15, fragrance-free, daily commute")
    response = client.post(
        f"/api/v1/guide/sessions/{session_id}/cart/preview",
        json={"sku_id": "seoul-shade-50", "quantity": 1},
    )
    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "SKU_NOT_RECOMMENDED"


def test_add_rechecks_stock_after_preview(monkeypatch) -> None:
    session_id = recommended_session()
    token = client.post(
        f"/api/v1/guide/sessions/{session_id}/cart/preview",
        json={"sku_id": "seoul-shade-50", "quantity": 1},
    ).json()["confirmation_token"]
    repository_type = type(fixtures)
    original_get_sku = repository_type.get_sku

    def out_of_stock(repository, sku_id: str):
        sku = original_get_sku(repository, sku_id)
        return sku.model_copy(update={"in_stock": False, "inventory_units": 0})

    monkeypatch.setattr(repository_type, "get_sku", out_of_stock)
    response = client.post(
        f"/api/v1/guide/sessions/{session_id}/cart/items",
        json={"confirmation_token": token},
    )
    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "INSUFFICIENT_STOCK"


def test_add_rejects_price_changed_after_preview(monkeypatch) -> None:
    session_id = recommended_session()
    token = client.post(
        f"/api/v1/guide/sessions/{session_id}/cart/preview",
        json={"sku_id": "seoul-shade-50", "quantity": 1},
    ).json()["confirmation_token"]
    repository_type = type(fixtures)
    original_get_sku = repository_type.get_sku

    def changed_price(repository, sku_id: str):
        sku = original_get_sku(repository, sku_id)
        return sku.model_copy(update={"price_usd": sku.price_usd + 1})

    monkeypatch.setattr(repository_type, "get_sku", changed_price)
    response = client.post(
        f"/api/v1/guide/sessions/{session_id}/cart/items",
        json={"confirmation_token": token},
    )
    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "PRICE_CHANGED"


def test_unknown_session_has_stable_not_found_error() -> None:
    response = client.post(
        "/api/v1/guide/sessions/ses_missing/cart/preview",
        json={"sku_id": "seoul-shade-30", "quantity": 1},
    )
    assert response.status_code == 404
    assert response.json()["detail"]["code"] == "SESSION_NOT_FOUND"
