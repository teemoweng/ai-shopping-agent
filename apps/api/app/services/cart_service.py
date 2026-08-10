from datetime import UTC, datetime
from uuid import uuid4

from app.domain.contracts import (
    CartItemResponse,
    CartPreviewRequest,
    CartPreviewResponse,
    CompareRequest,
    CompareResponse,
    GuideAction,
    GuideStatus,
    GuideViewKind,
    WorkflowState,
)
from app.domain.events import ProcessedGuideRequest
from app.repositories.fixture_repository import FixtureRepository
from app.repositories.session_repository import SessionRepository
from app.services.guide_conversation import (
    append_assistant,
    attach_conversation,
    request_digest,
)


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
        with self.sessions.transaction():
            session = self.sessions.get(session_id)
            digest = request_digest(request)
            if request.request_id is not None:
                processed = session.processed_guide_requests.get(request.request_id)
                if processed is not None:
                    if (
                        processed.request_kind == "COMPARE"
                        and processed.payload_digest == digest
                        and processed.comparison is not None
                    ):
                        return processed.comparison.model_copy(deep=True)
                    raise CartConflict("MESSAGE_ID_REUSED")
            if (
                request.expected_conversation_revision is not None
                and request.expected_conversation_revision
                != session.conversation_revision
            ):
                raise CartConflict("STALE_CONVERSATION")
            current_snapshot = session.latest_response
            if (
                current_snapshot is None
                or GuideAction.REQUEST_COMPARISON
                not in current_snapshot.allowed_actions
            ):
                raise CartConflict("ACTION_NOT_ALLOWED")
            if not set(request.product_ids) <= set(
                session.recommended_product_ids
            ):
                raise CartConflict("PRODUCT_NOT_RECOMMENDED")

            products = [
                self.fixtures.get_product(product_id)
                for product_id in request.product_ids
            ]
            response = CompareResponse(
                session_id=session.id,
                state=WorkflowState.COMPARE,
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
                simulated=True,
            )
            snapshot_text = (
                f"已生成 {len(request.product_ids)} 款商品的结构化比较。"
                if current_snapshot.locale == "zh-CN"
                else (
                    "A structured comparison of "
                    f"{len(request.product_ids)} products is ready."
                )
            )
            comparison_snapshot = current_snapshot.model_copy(
                update={
                    "state": WorkflowState.COMPARE,
                    "text": snapshot_text,
                    "guide_status": GuideStatus.ACTIVE,
                    "guide_view_kind": GuideViewKind.COMPARISON_READY,
                    "allowed_actions": [
                        GuideAction.SEND_MESSAGE,
                        GuideAction.OPEN_PRODUCT,
                        GuideAction.RETURN_TO_FEED,
                    ],
                    "comparison": response,
                },
                deep=True,
            )
            comparison_snapshot = append_assistant(session, comparison_snapshot)
            session.conversation_revision += 1
            comparison_snapshot = attach_conversation(
                session,
                comparison_snapshot,
            )
            session.state = WorkflowState.COMPARE
            if request.request_id is not None:
                session.processed_guide_requests[request.request_id] = (
                    ProcessedGuideRequest(
                        request_kind="COMPARE",
                        payload_digest=digest,
                        result_conversation_revision=(session.conversation_revision),
                        comparison=response.model_copy(deep=True),
                    )
                )
            self.sessions.save_snapshot(session, comparison_snapshot)
            self.sessions.append_event(
                session,
                "comparison_presented",
                session.state,
                {"product_ids": request.product_ids},
            )
            return response

    def preview(
        self,
        session_id: str,
        request: CartPreviewRequest,
    ) -> CartPreviewResponse:
        with self.sessions.transaction():
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

            previous_state = session.state
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
            try:
                self.sessions.append_event(
                    session,
                    "cart_preview",
                    session.state,
                    {
                        "sku_id": response.sku_id,
                        "quantity": response.quantity,
                        "simulated": True,
                    },
                )
            except Exception:
                self.previews.pop(token, None)
                session.state = previous_state
                self.sessions.save(session)
                raise
            return response

    def add(self, session_id: str, token: str) -> CartItemResponse:
        with self.sessions.transaction():
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

            previous_state = session.state
            session.consumed_confirmation_tokens.add(token)
            session.state = WorkflowState.FEEDBACK_AND_MEMORY
            self.sessions.save(session)
            response = CartItemResponse(
                cart_id=f"cart_{uuid4()}",
                cart_item_id=f"item_{uuid4()}",
                session_id=session.id,
                state=session.state,
                sku_id=preview.sku_id,
                quantity=preview.quantity,
                unit_price_usd=preview.unit_price_usd,
                simulated=True,
            )
            try:
                self.sessions.append_event(
                    session,
                    "cart_add",
                    session.state,
                    {
                        "sku_id": response.sku_id,
                        "quantity": response.quantity,
                        "simulated": True,
                    },
                )
            except Exception:
                session.consumed_confirmation_tokens.discard(token)
                session.state = previous_state
                self.sessions.save(session)
                raise
            return response
