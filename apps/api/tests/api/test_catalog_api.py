from fastapi.testclient import TestClient

from app.api.routes.catalog import get_catalog_service
from app.dependencies import catalog
from app.main import app
from app.repositories.fixture_repository import FixtureRepository
from app.services.catalog_service import CatalogService

client = TestClient(app)


def test_feed_returns_ordered_items_with_commerce_fields_only_when_available() -> None:
    response = client.get("/api/v1/catalog/feed")

    assert response.status_code == 200
    body = response.json()
    assert body["feed_tabs"]
    assert body["bottom_nav_variant"]
    assert [item["id"] for item in body["items"]] == [
        "feed-uv-morning-001",
        "feed-city-style-002",
    ]

    shoppable_item, normal_item = body["items"]
    assert shoppable_item["commerce_status"] == "available"
    assert shoppable_item["anchor_product_id"] == "seoul-shade-daily-fluid"
    assert shoppable_item["anchor_product"] == {
        "id": "seoul-shade-daily-fluid",
        "brand": "Mirae Lab",
        "name": "Seoul Shade Daily Fluid",
        "display_name_zh": "首尔轻透通勤防晒乳",
        "starting_price_usd": 14.0,
        "image_src": "/demo/product-seoul-shade.svg",
    }
    assert normal_item["commerce_status"] == "none"
    assert normal_item["anchor_product_id"] is None
    assert normal_item["anchor_product"] is None


def test_product_detail_returns_current_catalog_facts_and_synthetic_disclosure() -> None:
    response = client.get("/api/v1/catalog/products/seoul-shade-daily-fluid")

    assert response.status_code == 200
    body = response.json()
    assert body["product"]["id"] == "seoul-shade-daily-fluid"
    assert body["product"]["skus"][0]["id"] == "seoul-shade-30"
    assert body["starting_price_usd"] == 14.0
    assert body["freshness"] == {
        "facts_version": "catalog-2026-08-05-seoul-v1",
        "observed_at": "2026-08-05T09:00:00Z",
        "expires_at": "2026-08-12T09:00:00Z",
    }
    assert body["synthetic_disclosure"] is True


def test_product_detail_returns_real_fallback_price_when_every_sku_is_out_of_stock() -> None:
    product = catalog.fixtures.get_product("seoul-shade-daily-fluid")
    unavailable = product.model_copy(
        update={
            "skus": tuple(
                sku.model_copy(update={"in_stock": False, "inventory_units": 0})
                for sku in product.skus
            )
        }
    )
    fixtures = FixtureRepository(
        products={**catalog.fixtures.products, product.id: unavailable},
        content_contexts=catalog.fixtures.content_contexts,
        evidence_documents=catalog.fixtures.evidence_documents,
        feed_items=catalog.fixtures.feed_items,
    )
    app.dependency_overrides[get_catalog_service] = lambda: CatalogService(fixtures)
    try:
        response = client.get(f"/api/v1/catalog/products/{product.id}")
    finally:
        app.dependency_overrides.pop(get_catalog_service, None)

    assert response.status_code == 200
    body = response.json()
    assert body["starting_price_usd"] == 14.0
    assert all(sku["in_stock"] is False for sku in body["product"]["skus"])
    assert all(sku["inventory_units"] == 0 for sku in body["product"]["skus"])


def test_unknown_product_returns_stable_not_found_error() -> None:
    response = client.get("/api/v1/catalog/products/unknown-product")

    assert response.status_code == 404
    assert response.json()["detail"] == {"code": "PRODUCT_NOT_FOUND"}
