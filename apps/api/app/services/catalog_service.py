from app.domain.contracts import (
    CatalogEngagementResponse,
    CatalogFeedItemResponse,
    CatalogFreshnessResponse,
    CatalogMediaResponse,
    CatalogProductResponse,
    CatalogProductSummary,
    CatalogShippingResponse,
    CatalogSkuResponse,
    FeedResponse,
    ProductDetailResponse,
)
from app.domain.models import FeedItem, Product
from app.repositories.fixture_repository import FixtureRepository


class CatalogService:
    feed_tabs = ("For You", "Following")
    bottom_nav_variant = "shopping-agent"

    def __init__(self, fixtures: FixtureRepository) -> None:
        self.fixtures = fixtures

    def feed(self) -> FeedResponse:
        return FeedResponse(
            feed_tabs=list(self.feed_tabs),
            bottom_nav_variant=self.bottom_nav_variant,
            items=[
                self._feed_item_response(item)
                for item in self.fixtures.feed_items.values()
            ],
        )

    def product_detail(self, product_id: str) -> ProductDetailResponse:
        product = self.fixtures.get_product(product_id)
        return ProductDetailResponse(
            product=self._product_response(product),
            starting_price_usd=self._starting_price(product),
            freshness=CatalogFreshnessResponse(
                facts_version=product.facts_version,
                observed_at=product.observed_at,
                expires_at=product.expires_at,
            ),
            synthetic_disclosure=product.synthetic,
        )

    def _feed_item_response(self, item: FeedItem) -> CatalogFeedItemResponse:
        anchor_product = (
            self.fixtures.get_product(item.anchor_product_id)
            if item.anchor_product_id is not None
            else None
        )
        return CatalogFeedItemResponse(
            id=item.id,
            synthetic=item.synthetic,
            creator_handle=item.creator_handle,
            creator_display_name=item.creator_display_name,
            caption_zh=item.caption_zh,
            media=CatalogMediaResponse.model_validate(item.media.model_dump()),
            engagement=CatalogEngagementResponse.model_validate(
                item.engagement.model_dump()
            ),
            content_context_id=item.content_context_id,
            anchor_product_id=item.anchor_product_id,
            commerce_status=item.commerce_status,
            anchor_product=(
                CatalogProductSummary(
                    id=anchor_product.id,
                    brand=anchor_product.brand,
                    name=anchor_product.name,
                    display_name_zh=anchor_product.display_name_zh,
                    starting_price_usd=self._starting_price(anchor_product),
                    image_src=anchor_product.media.src,
                )
                if anchor_product is not None
                else None
            ),
        )

    def _product_response(self, product: Product) -> CatalogProductResponse:
        return CatalogProductResponse(
            id=product.id,
            brand=product.brand,
            name=product.name,
            synthetic=product.synthetic,
            spf=product.spf,
            broad_spectrum=product.broad_spectrum,
            fragrance_free=product.fragrance_free,
            water_resistance_minutes=product.water_resistance_minutes,
            finish=product.finish,
            skin_types=list(product.skin_types),
            white_cast_risk=product.white_cast_risk,
            active_filter_type=product.active_filter_type,
            ingredient_highlights=list(product.ingredient_highlights),
            skus=[
                CatalogSkuResponse.model_validate(sku.model_dump())
                for sku in product.skus
            ],
            display_name_zh=product.display_name_zh,
            description_zh=product.description_zh,
            media=CatalogMediaResponse.model_validate(product.media.model_dump()),
            shipping=CatalogShippingResponse.model_validate(
                product.shipping.model_dump()
            ),
            list_price_usd=product.list_price_usd,
            promotion=product.promotion,
            store_name=product.store_name,
            facts_version=product.facts_version,
            observed_at=product.observed_at,
            expires_at=product.expires_at,
        )

    @staticmethod
    def _starting_price(product: Product) -> float:
        return min(sku.price_usd for sku in product.skus if sku.in_stock)
