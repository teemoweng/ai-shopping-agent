from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Protocol
from uuid import uuid4

from app.domain.contracts import (
    CommerceAcceptFactsRequest,
    CommerceAction,
    CommerceAddRequest,
    CommerceFactDiff,
    CommerceFactsResponse,
    CommerceOperationResponse,
    CommerceOperationStatus,
    CommercePreviewRequest,
    CommerceReceiptResponse,
    CommerceStep,
)
from app.domain.events import (
    CommerceConfirmationToken,
    CommerceOperation,
    CommerceReceipt,
)
from app.repositories.commerce_repository import CommerceRepository
from app.repositories.fixture_repository import FixtureRepository
from app.repositories.session_repository import SessionRepository


class Clock(Protocol):
    def now(self) -> datetime: ...


class SystemClock:
    def now(self) -> datetime:
        return datetime.now(UTC)


class CommerceConflict(Exception):
    def __init__(self, code: str) -> None:
        self.code = code
        super().__init__(code)


class CommerceService:
    token_ttl = timedelta(minutes=5)

    def __init__(
        self,
        fixtures: FixtureRepository,
        sessions: SessionRepository,
        repository: CommerceRepository,
        clock: Clock,
    ) -> None:
        self.fixtures = fixtures
        self.sessions = sessions
        self.repository = repository
        self.clock = clock

    def preview(self, request: CommercePreviewRequest) -> CommerceOperationResponse:
        now = self.clock.now()
        with self.repository.transaction():
            self._validate_provenance(request)
            previous = None
            if request.expected_transaction_revision:
                previous = self.repository.find_operation_for_revision(
                    purchase_origin=request.purchase_origin,
                    guide_session_id=request.guide_session_id,
                    product_id=request.product_id,
                    transaction_revision=request.expected_transaction_revision,
                )
                if previous is None:
                    raise CommerceConflict("TRANSACTION_REVISION_CONFLICT")
            product = self.fixtures.get_product(request.product_id)
            sku = next(
                (item for item in product.skus if item.id == request.sku_id),
                None,
            )
            if sku is None:
                raise CommerceConflict("SKU_PRODUCT_MISMATCH")

            previous_facts = self._facts(product, sku, request.quantity)
            previous_facts = self._apply_inventory(previous_facts, sku.inventory_units)
            facts = self._scenario_facts(previous_facts, request.demo_scenario)
            facts_diff = self._fact_diff(previous_facts, facts)
            is_changed = bool(facts_diff)
            out_of_stock = not facts.in_stock
            operation = CommerceOperation(
                id=f"cop_{uuid4()}",
                purchase_origin=request.purchase_origin,
                guide_session_id=request.guide_session_id,
                source_guide_revision=request.source_guide_revision,
                product_id=request.product_id,
                sku_id=request.sku_id,
                quantity=request.quantity,
                transaction_revision=request.expected_transaction_revision + 1,
                facts=facts,
                commerce_view_kind=(
                    CommerceStep.FACTS_CHANGED
                    if is_changed or out_of_stock
                    else CommerceStep.AWAITING_CONFIRMATION
                ),
                operation_status=CommerceOperationStatus.ACTIVE,
                facts_diff=facts_diff,
                demo_scenario=request.demo_scenario,
                error_code=(
                    "OUT_OF_STOCK"
                    if out_of_stock
                    else "FACTS_CHANGED" if is_changed else None
                ),
                created_at=now,
                updated_at=now,
            )
            if previous is not None:
                self.repository.invalidate_tokens_for_operation(previous.id, now)
                previous.commerce_view_kind = CommerceStep.CANCELLED
                previous.operation_status = CommerceOperationStatus.CANCELLED
                previous.error_code = "SELECTION_CHANGED"
                previous.updated_at = now
                self.repository.save_operation(previous)
            self.repository.save_operation(operation)
            token = (
                None
                if operation.commerce_view_kind is CommerceStep.FACTS_CHANGED
                else self._issue_token(operation, now)
            )
            return self._response(operation, token)

    def accept_facts(
        self,
        operation_id: str,
        request: CommerceAcceptFactsRequest,
    ) -> CommerceOperationResponse:
        now = self.clock.now()
        with self.repository.transaction():
            operation = self.repository.get_operation(operation_id)
            if operation.transaction_revision != request.expected_transaction_revision:
                raise CommerceConflict("TRANSACTION_REVISION_CONFLICT")
            if operation.commerce_view_kind is not CommerceStep.FACTS_CHANGED:
                raise CommerceConflict("FACTS_ACCEPTANCE_NOT_AVAILABLE")
            if not operation.facts.in_stock:
                raise CommerceConflict("OUT_OF_STOCK")
            operation.transaction_revision += 1
            operation.commerce_view_kind = CommerceStep.AWAITING_CONFIRMATION
            operation.facts_diff = []
            operation.error_code = None
            operation.updated_at = now
            self.repository.save_operation(operation)
            return self._response(operation, self._issue_token(operation, now))

    def add_item(
        self,
        operation_id: str,
        request: CommerceAddRequest,
    ) -> CommerceOperationResponse:
        with self.repository.transaction():
            operation = self.repository.get_operation(operation_id)
            try:
                existing = self.repository.get_receipt_by_idempotency_key(
                    request.idempotency_key
                )
            except KeyError:
                existing = None
            if existing is not None:
                if existing.operation_id != operation.id:
                    raise CommerceConflict("IDEMPOTENCY_KEY_REUSED")
                operation.receipt_id = existing.receipt_id
                operation.commerce_view_kind = CommerceStep.SUCCEEDED
                operation.operation_status = CommerceOperationStatus.SUCCEEDED
                operation.error_code = None
                operation.updated_at = self.clock.now()
                self.repository.save_operation(operation)
                return self._response(operation, receipt=existing)
            try:
                token = self.repository.get_token(request.confirmation_token)
            except KeyError as error:
                raise CommerceConflict("INVALID_CONFIRMATION_TOKEN") from error
            if token.operation_id != operation.id:
                raise CommerceConflict("INVALID_CONFIRMATION_TOKEN")
            if token.invalidated_at is not None:
                raise CommerceConflict("TOKEN_INVALIDATED")
            if token.consumed_at is not None:
                raise CommerceConflict("TOKEN_ALREADY_USED")
            if not self._token_matches_operation(token, operation):
                token.invalidated_at = self.clock.now()
                self.repository.save_token(token)
                raise CommerceConflict("TOKEN_INVALIDATED")
            if operation.transaction_revision != request.expected_transaction_revision:
                raise CommerceConflict("TRANSACTION_REVISION_CONFLICT")
            if self.clock.now() >= token.expires_at:
                token.invalidated_at = self.clock.now()
                self.repository.save_token(token)
                raise CommerceConflict("TOKEN_EXPIRED")
            current = self._current_facts(operation)
            facts_diff = self._fact_diff(operation.facts, current)
            if facts_diff:
                now = self.clock.now()
                token.invalidated_at = now
                self.repository.save_token(token)
                operation.transaction_revision += 1
                operation.facts = current
                operation.facts_diff = facts_diff
                operation.commerce_view_kind = CommerceStep.FACTS_CHANGED
                operation.error_code = (
                    "OUT_OF_STOCK" if not current.in_stock else "FACTS_CHANGED"
                )
                operation.updated_at = now
                self.repository.save_operation(operation)
                return self._response(operation)
            if not current.in_stock:
                raise CommerceConflict("OUT_OF_STOCK")
            now = self.clock.now()
            try:
                self.repository.decrement_inventory(
                    current.sku_id,
                    default=current.inventory_units,
                    quantity=current.quantity,
                )
            except ValueError as error:
                raise CommerceConflict("OUT_OF_STOCK") from error
            token.consumed_at = now
            self.repository.save_token(token)
            receipt = CommerceReceipt(
                receipt_id=f"rcp_{uuid4()}",
                cart_id="cart_simulated",
                cart_item_id=f"item_{uuid4()}",
                operation_id=operation.id,
                idempotency_key=request.idempotency_key,
                product_id=operation.product_id,
                sku_id=operation.sku_id,
                quantity=operation.quantity,
                unit_price_usd=operation.facts.unit_price_usd,
                subtotal_usd=operation.facts.subtotal_usd,
                facts_version=operation.facts.facts_version,
                committed_at=now,
                simulated=True,
                order_created=False,
                payment_created=False,
            )
            receipt = self.repository.save_receipt(receipt)
            operation.receipt_id = receipt.receipt_id
            operation.updated_at = now
            if request.demo_scenario == "COMMIT_STATUS_UNKNOWN":
                operation.commerce_view_kind = CommerceStep.COMMIT_STATUS_UNKNOWN
                operation.operation_status = CommerceOperationStatus.ACTIVE
                operation.error_code = "COMMIT_STATUS_UNKNOWN"
                self.repository.save_operation(operation)
                return self._response(operation)
            operation.commerce_view_kind = CommerceStep.SUCCEEDED
            operation.operation_status = CommerceOperationStatus.SUCCEEDED
            operation.error_code = None
            self.repository.save_operation(operation)
            return self._response(operation, receipt=receipt)

    def get_operation(self, operation_id: str) -> CommerceOperationResponse:
        with self.repository.transaction():
            operation = self.repository.get_operation(operation_id)
            receipt = (
                self.repository.get_receipt(operation.receipt_id)
                if operation.receipt_id is not None
                and operation.commerce_view_kind is CommerceStep.SUCCEEDED
                else None
            )
            return self._response(operation, receipt=receipt)

    def get_by_idempotency_key(self, key: str) -> CommerceOperationResponse:
        with self.repository.transaction():
            receipt = self.repository.get_receipt_by_idempotency_key(key)
            operation = self.repository.get_operation(receipt.operation_id)
            operation.receipt_id = receipt.receipt_id
            operation.commerce_view_kind = CommerceStep.SUCCEEDED
            operation.operation_status = CommerceOperationStatus.SUCCEEDED
            operation.error_code = None
            operation.updated_at = self.clock.now()
            self.repository.save_operation(operation)
            return self._response(operation, receipt=receipt)

    def _validate_provenance(self, request: CommercePreviewRequest) -> None:
        if request.purchase_origin == "FEED":
            return
        try:
            session = self.sessions.get(request.guide_session_id or "")
        except KeyError as error:
            raise CommerceConflict("GUIDE_SESSION_NOT_FOUND") from error
        if session.guide_revision != request.source_guide_revision:
            raise CommerceConflict("STALE_GUIDE_REVISION")

    @staticmethod
    def _allowed_actions(operation: CommerceOperation) -> list[CommerceAction]:
        if operation.commerce_view_kind is CommerceStep.AWAITING_CONFIRMATION:
            return [
                CommerceAction.SELECT_SKU,
                CommerceAction.SET_QUANTITY,
                CommerceAction.CONFIRM_ADD_TO_CART,
                CommerceAction.CANCEL_CONFIRMATION,
                CommerceAction.RETURN_TO_PRODUCT,
            ]
        if operation.commerce_view_kind is CommerceStep.FACTS_CHANGED:
            if not operation.facts.in_stock:
                return [
                    CommerceAction.RESELECT_SKU,
                    CommerceAction.RETURN_TO_PRODUCT,
                ]
            return [
                CommerceAction.ACCEPT_UPDATED_FACTS,
                CommerceAction.RESELECT_SKU,
                CommerceAction.CANCEL_CONFIRMATION,
                CommerceAction.RETURN_TO_PRODUCT,
            ]
        if operation.commerce_view_kind is CommerceStep.COMMIT_STATUS_UNKNOWN:
            return [
                CommerceAction.RETRY_COMMERCE_OPERATION,
                CommerceAction.RETURN_TO_PRODUCT,
            ]
        if operation.commerce_view_kind is CommerceStep.SUCCEEDED:
            return [
                CommerceAction.RETURN_TO_PRODUCT,
                CommerceAction.CONTINUE_BROWSING,
            ]
        return [CommerceAction.RETURN_TO_PRODUCT]

    def _issue_token(
        self,
        operation: CommerceOperation,
        now: datetime,
    ) -> CommerceConfirmationToken:
        token = CommerceConfirmationToken(
            token=f"cft_{uuid4()}",
            operation_id=operation.id,
            transaction_revision=operation.transaction_revision,
            facts_version=operation.facts.facts_version,
            sku_id=operation.facts.sku_id,
            quantity=operation.facts.quantity,
            unit_price_usd=operation.facts.unit_price_usd,
            expires_at=now + self.token_ttl,
        )
        return self.repository.save_token(token)

    @staticmethod
    def _token_matches_operation(
        token: CommerceConfirmationToken,
        operation: CommerceOperation,
    ) -> bool:
        return (
            token.transaction_revision == operation.transaction_revision
            and token.facts_version == operation.facts.facts_version
            and token.sku_id == operation.sku_id
            and token.quantity == operation.quantity
            and token.unit_price_usd == operation.facts.unit_price_usd
        )

    @staticmethod
    def _facts(product, sku, quantity: int) -> CommerceFactsResponse:
        return CommerceFactsResponse(
            product_id=product.id,
            sku_id=sku.id,
            quantity=quantity,
            unit_price_usd=sku.price_usd,
            subtotal_usd=round(sku.price_usd * quantity, 2),
            inventory_units=sku.inventory_units,
            in_stock=sku.in_stock and sku.inventory_units >= quantity,
            facts_version=product.facts_version,
            observed_at=product.observed_at,
        )

    @staticmethod
    def _scenario_facts(
        facts: CommerceFactsResponse,
        scenario: str,
    ) -> CommerceFactsResponse:
        if scenario == "PRICE_CHANGED":
            price = round(facts.unit_price_usd + 1, 2)
            return facts.model_copy(
                update={
                    "unit_price_usd": price,
                    "subtotal_usd": round(price * facts.quantity, 2),
                    "facts_version": f"{facts.facts_version}-demo-price-changed",
                }
            )
        if scenario == "OUT_OF_STOCK":
            return facts.model_copy(
                update={
                    "inventory_units": 0,
                    "in_stock": False,
                    "facts_version": f"{facts.facts_version}-demo-out-of-stock",
                }
            )
        return facts

    def _current_facts(self, operation: CommerceOperation) -> CommerceFactsResponse:
        product = self.fixtures.get_product(operation.product_id)
        sku = next(
            (item for item in product.skus if item.id == operation.sku_id),
            None,
        )
        if sku is None:
            raise CommerceConflict("SKU_PRODUCT_MISMATCH")
        facts = self._facts(product, sku, operation.quantity)
        facts = self._apply_inventory(facts, sku.inventory_units)
        return self._scenario_facts(facts, operation.demo_scenario)

    def _apply_inventory(
        self,
        facts: CommerceFactsResponse,
        default_inventory: int,
    ) -> CommerceFactsResponse:
        inventory = self.repository.inventory_units(
            facts.sku_id,
            default=default_inventory,
        )
        return facts.model_copy(
            update={
                "inventory_units": inventory,
                "in_stock": inventory >= facts.quantity,
            }
        )

    @staticmethod
    def _fact_diff(
        previous: CommerceFactsResponse,
        current: CommerceFactsResponse,
    ) -> list[CommerceFactDiff]:
        fields = (
            "unit_price_usd",
            "inventory_units",
            "in_stock",
            "facts_version",
        )
        return [
            CommerceFactDiff(
                field=field,
                previous_value=getattr(previous, field),
                current_value=getattr(current, field),
            )
            for field in fields
            if getattr(previous, field) != getattr(current, field)
        ]

    def _response(
        self,
        operation: CommerceOperation,
        token: CommerceConfirmationToken | None = None,
        receipt: CommerceReceiptResponse | None = None,
    ) -> CommerceOperationResponse:
        return CommerceOperationResponse(
            operation_id=operation.id,
            purchase_origin=operation.purchase_origin,
            guide_session_id=operation.guide_session_id,
            source_guide_revision=operation.source_guide_revision,
            product_id=operation.product_id,
            sku_id=operation.sku_id,
            quantity=operation.quantity,
            transaction_revision=operation.transaction_revision,
            facts_version=operation.facts.facts_version,
            commerce_view_kind=operation.commerce_view_kind,
            operation_status=operation.operation_status,
            allowed_actions=self._allowed_actions(operation),
            facts=operation.facts,
            facts_diff=operation.facts_diff,
            confirmation_token=token.token if token is not None else None,
            confirmation_expires_at=token.expires_at if token is not None else None,
            receipt=receipt,
            error_code=operation.error_code,
            simulated=True,
        )
