from __future__ import annotations

from uuid import uuid4

from fastapi.testclient import TestClient

from app.api.routes.guide import service as guide_service
from app.main import app

client = TestClient(app)


def preview_payload(**updates: object) -> dict[str, object]:
    payload: dict[str, object] = {
        "purchase_origin": "FEED",
        "product_id": "cloud-veil-mineral",
        "sku_id": "cloud-veil-30",
        "quantity": 1,
        "expected_transaction_revision": 0,
    }
    payload.update(updates)
    return payload


def create_ai_purchase_context(message_id: str) -> tuple[str, int]:
    opened = client.post(
        "/api/v1/guide/sessions",
        json={
            "entry_point": "content",
            "content_context_id": "morning-routine-uv-001",
            "locale": "zh-CN",
        },
    )
    assert opened.status_code == 201
    session_id = opened.json()["session_id"]
    decided = client.post(
        f"/api/v1/guide/sessions/{session_id}/messages",
        json={
            "message_id": message_id,
            "text": "预算30美元以内、无香精、自然妆效",
        },
    )
    assert decided.status_code == 200
    return session_id, decided.json()["guide_revision"]


def test_ai_preview_rejects_correct_revision_with_unauthorized_product() -> None:
    session_id, guide_revision = create_ai_purchase_context(
        f"api_commerce_product_scope_{uuid4()}"
    )

    response = client.post(
        "/api/v1/commerce/cart/preview",
        json=preview_payload(
            purchase_origin="AI",
            guide_session_id=session_id,
            source_guide_revision=guide_revision,
            product_id="jeju-sport-sun-gel",
            sku_id="jeju-sport-50",
        ),
    )

    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "PRODUCT_NOT_RECOMMENDED"


def test_ai_preview_rejects_correct_revision_with_unauthorized_product_sku() -> None:
    session_id, guide_revision = create_ai_purchase_context(
        f"api_commerce_sku_scope_{uuid4()}"
    )
    session = guide_service.sessions.get(session_id)
    snapshot = session.latest_response
    assert snapshot is not None
    session.latest_response = snapshot.model_copy(
        update={
            "recommendations": [
                card.model_copy(update={"eligible_sku_ids": ["seoul-shade-30"]})
                if card.product_id == "seoul-shade-daily-fluid"
                else card
                for card in snapshot.recommendations
            ]
        }
    )
    guide_service.sessions.save(session)

    response = client.post(
        "/api/v1/commerce/cart/preview",
        json=preview_payload(
            purchase_origin="AI",
            guide_session_id=session_id,
            source_guide_revision=guide_revision,
            product_id="seoul-shade-daily-fluid",
            sku_id="seoul-shade-50",
        ),
    )

    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "SKU_NOT_RECOMMENDED"


def test_price_change_returns_structured_diff_then_accepts_fresh_token() -> None:
    preview = client.post(
        "/api/v1/commerce/cart/preview",
        json=preview_payload(demo_scenario="PRICE_CHANGED"),
    )

    assert preview.status_code == 201
    changed = preview.json()
    assert changed["commerce_view_kind"] == "FACTS_CHANGED"
    assert changed["operation_status"] == "ACTIVE"
    assert changed["transaction_revision"] == 1
    assert changed["facts_version"].endswith("-demo-price-changed")
    assert changed["facts_diff"][0] == {
        "field": "unit_price_usd",
        "previous_value": 17.0,
        "current_value": 18.0,
    }
    assert "confirmation_token" not in changed

    accepted = client.post(
        f"/api/v1/commerce/operations/{changed['operation_id']}/accept-facts",
        json={"expected_transaction_revision": changed["transaction_revision"]},
    )

    assert accepted.status_code == 200
    body = accepted.json()
    assert body["commerce_view_kind"] == "AWAITING_CONFIRMATION"
    assert body["transaction_revision"] == 2
    assert body["confirmation_token"].startswith("cft_")
    assert body["facts_diff"] == []


def test_out_of_stock_returns_reselect_sku_without_confirmation_secret() -> None:
    response = client.post(
        "/api/v1/commerce/cart/preview",
        json=preview_payload(demo_scenario="OUT_OF_STOCK"),
    )

    assert response.status_code == 201
    body = response.json()
    assert body["commerce_view_kind"] == "FACTS_CHANGED"
    assert body["error_code"] == "OUT_OF_STOCK"
    assert body["allowed_actions"] == ["RESELECT_SKU", "RETURN_TO_PRODUCT"]
    assert "confirmation_token" not in body


def test_success_is_idempotent_and_never_returns_confirmation_secret() -> None:
    preview = client.post(
        "/api/v1/commerce/cart/preview",
        json=preview_payload(sku_id="cloud-veil-50"),
    ).json()
    idempotency_key = f"idem_{uuid4()}"
    request = {
        "confirmation_token": preview["confirmation_token"],
        "idempotency_key": idempotency_key,
        "expected_transaction_revision": preview["transaction_revision"],
    }
    endpoint = f"/api/v1/commerce/operations/{preview['operation_id']}/items"

    first = client.post(endpoint, json=request)
    repeated = client.post(endpoint, json=request)

    assert first.status_code == 201
    assert repeated.status_code == 201
    assert first.json() == repeated.json()
    assert first.json()["commerce_view_kind"] == "SUCCEEDED"
    assert first.json()["receipt"]["idempotency_key"] == idempotency_key
    assert "confirmation_token" not in first.json()
    assert "confirmation_expires_at" not in first.json()


def test_unknown_commit_result_reconciles_by_idempotency_key() -> None:
    preview = client.post(
        "/api/v1/commerce/cart/preview",
        json=preview_payload(sku_id="cloud-veil-50"),
    ).json()
    idempotency_key = f"idem_unknown_{uuid4()}"

    uncertain = client.post(
        f"/api/v1/commerce/operations/{preview['operation_id']}/items",
        json={
            "confirmation_token": preview["confirmation_token"],
            "idempotency_key": idempotency_key,
            "expected_transaction_revision": preview["transaction_revision"],
            "demo_scenario": "COMMIT_STATUS_UNKNOWN",
        },
    )

    assert uncertain.status_code == 201
    assert uncertain.json()["commerce_view_kind"] == "COMMIT_STATUS_UNKNOWN"
    assert uncertain.json()["operation_status"] == "RECONCILIATION_REQUIRED"
    assert uncertain.json()["allowed_actions"] == [
        "RECONCILE_COMMIT",
        "RETURN_TO_PRODUCT",
    ]
    assert "receipt" not in uncertain.json()
    pending = client.get(
        f"/api/v1/commerce/operations/{preview['operation_id']}"
    )
    assert pending.json() == uncertain.json()

    blocked_write = client.post(
        f"/api/v1/commerce/operations/{preview['operation_id']}/items",
        json={
            "confirmation_token": preview["confirmation_token"],
            "idempotency_key": idempotency_key,
            "expected_transaction_revision": preview["transaction_revision"],
        },
    )
    assert blocked_write.status_code == 409
    assert blocked_write.json()["detail"]["code"] == "COMMIT_STATUS_UNKNOWN"

    reconciled = client.get(
        f"/api/v1/commerce/operations/by-idempotency/{idempotency_key}"
    )

    assert reconciled.status_code == 200
    assert reconciled.json()["commerce_view_kind"] == "SUCCEEDED"
    assert reconciled.json()["receipt"]["idempotency_key"] == idempotency_key
    assert "confirmation_token" not in reconciled.json()


def test_unknown_operation_and_idempotency_key_have_stable_errors() -> None:
    missing_operation = client.get("/api/v1/commerce/operations/cop_missing")
    missing_idempotency = client.get(
        "/api/v1/commerce/operations/by-idempotency/idem_missing"
    )

    assert missing_operation.status_code == 404
    assert missing_operation.json()["detail"]["code"] == (
        "COMMERCE_OPERATION_NOT_FOUND"
    )
    assert missing_idempotency.status_code == 404
    assert missing_idempotency.json()["detail"]["code"] == (
        "IDEMPOTENCY_KEY_NOT_FOUND"
    )
