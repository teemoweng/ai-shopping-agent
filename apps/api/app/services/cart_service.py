from datetime import UTC, datetime
from uuid import uuid4

from app.domain.contracts import (
    CartItemResponse,
    CartPreviewRequest,
    CartPreviewResponse,
    CompareRequest,
    CompareResponse,
    WorkflowState,
)
from app.repositories.fixture_repository import FixtureRepository
from app.repositories.session_repository import SessionRepository


class CartConflict(Exception):
    pass


class CartService:
    def __init__(
        self,
        fixtures: FixtureRepository,
        sessions: SessionRepository,
    ) -> None:
        self.fixtures = fixtures
        self.sessions = sessions
        self.previews: dict[str, CartPreviewResponse] = {}

    def compare(self, session_id: str, request: CompareRequest) -> CompareResponse:
        session = self.sessions.get(session_id)
        if not set(request.product_ids) <= set(session.recommended_product_ids):
            raise CartConflict("PRODUCT_NOT_RECOMMENDED")

        products = [
            self.fixtures.get_product(product_id)
            for product_id in request.product_ids
        ]
        session.state = WorkflowState.COMPARE
        self.sessions.save(session)
        return CompareResponse(
            session_id=session.id,
            state=session.state,
            product_ids=request.product_ids,
            rows={
                "starting_price_usd": [
                    min(sku.price_usd for sku in product.skus if sku.in_stock)
                    for product in products
                ],
                "fragrance_free": [
                    product.fragrance_free for product in products
                ],
                "water_resistance_minutes": [
                    product.water_resistance_minutes for product in products
                ],
                "finish": [product.finish for product in products],
                "white_cast_risk": [
                    product.white_cast_risk for product in products
                ],
            },
        )

    def preview(
        self,
        session_id: str,
        request: CartPreviewRequest,
    ) -> CartPreviewResponse:
        session = self.sessions.get(session_id)
        eligible_sku_ids = {
            sku_id
            for sku_ids in session.eligible_sku_ids_by_product.values()
            for sku_id in sku_ids
        }
        if request.sku_id not in eligible_sku_ids:
            raise CartConflict("SKU_NOT_RECOMMENDED")

        sku = self.fixtures.get_sku(request.sku_id)
        if not sku.in_stock or sku.inventory_units < request.quantity:
            raise CartConflict("INSUFFICIENT_STOCK")

        session.state = WorkflowState.SKU_AND_CART_CONFIRM
        self.sessions.save(session)
        token = f"confirm_{uuid4()}"
        response = CartPreviewResponse(
            session_id=session.id,
            state=session.state,
            sku_id=sku.id,
            quantity=request.quantity,
            unit_price_usd=sku.price_usd,
            subtotal_usd=round(sku.price_usd * request.quantity, 2),
            inventory_units=sku.inventory_units,
            confirmation_token=token,
            created_at=datetime.now(UTC),
            simulated=True,
        )
        self.previews[token] = response
        return response

    def add(self, session_id: str, token: str) -> CartItemResponse:
        session = self.sessions.get(session_id)
        if token in session.consumed_confirmation_tokens:
            raise CartConflict("TOKEN_ALREADY_USED")

        preview = self.previews.get(token)
        if preview is None or preview.session_id != session_id:
            raise CartConflict("INVALID_CONFIRMATION_TOKEN")

        current_sku = self.fixtures.get_sku(preview.sku_id)
        if (
            not current_sku.in_stock
            or current_sku.inventory_units < preview.quantity
        ):
            raise CartConflict("INSUFFICIENT_STOCK")
        if current_sku.price_usd != preview.unit_price_usd:
            raise CartConflict("PRICE_CHANGED")

        session.consumed_confirmation_tokens.add(token)
        session.state = WorkflowState.FEEDBACK_AND_MEMORY
        self.sessions.save(session)
        return CartItemResponse(
            cart_id=f"cart_{uuid4()}",
            cart_item_id=f"item_{uuid4()}",
            session_id=session.id,
            state=session.state,
            sku_id=preview.sku_id,
            quantity=preview.quantity,
            unit_price_usd=preview.unit_price_usd,
            simulated=True,
        )
