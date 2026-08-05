from __future__ import annotations

from collections.abc import Iterator
from contextlib import contextmanager
from datetime import datetime
from threading import RLock

from app.domain.contracts import CommerceOperationStatus
from app.domain.events import (
    CommerceConfirmationToken,
    CommerceOperation,
    CommerceReceipt,
)


class CommerceRepository:
    """Thread-safe in-memory storage for the simulated commerce boundary."""

    def __init__(self) -> None:
        self._operations: dict[str, CommerceOperation] = {}
        self._tokens: dict[str, CommerceConfirmationToken] = {}
        self._receipts: dict[str, CommerceReceipt] = {}
        self._receipts_by_idempotency_key: dict[str, CommerceReceipt] = {}
        self._inventory_units: dict[str, int] = {}
        self._lock = RLock()

    @contextmanager
    def transaction(self) -> Iterator[None]:
        with self._lock:
            yield

    def save_operation(self, operation: CommerceOperation) -> CommerceOperation:
        with self._lock:
            self._operations[operation.id] = operation
            return operation

    def get_operation(self, operation_id: str) -> CommerceOperation:
        with self._lock:
            return self._operations[operation_id]

    def save_token(
        self,
        token: CommerceConfirmationToken,
    ) -> CommerceConfirmationToken:
        with self._lock:
            self._tokens[token.token] = token
            return token

    def get_token(self, token: str) -> CommerceConfirmationToken:
        with self._lock:
            return self._tokens[token]

    def find_operation_for_revision(
        self,
        *,
        purchase_origin: str,
        guide_session_id: str | None,
        product_id: str,
        transaction_revision: int,
    ) -> CommerceOperation | None:
        with self._lock:
            matches = [
                operation
                for operation in self._operations.values()
                if operation.purchase_origin == purchase_origin
                and operation.guide_session_id == guide_session_id
                and operation.product_id == product_id
                and operation.transaction_revision == transaction_revision
                and operation.operation_status is CommerceOperationStatus.ACTIVE
            ]
            return matches[-1] if matches else None

    def invalidate_tokens_for_operation(
        self,
        operation_id: str,
        invalidated_at: datetime,
    ) -> None:
        with self._lock:
            for token in self._tokens.values():
                if token.operation_id == operation_id and token.consumed_at is None:
                    token.invalidated_at = invalidated_at

    def save_receipt(self, receipt: CommerceReceipt) -> CommerceReceipt:
        with self._lock:
            existing = self._receipts_by_idempotency_key.get(receipt.idempotency_key)
            if existing is not None:
                return existing
            self._receipts[receipt.receipt_id] = receipt
            self._receipts_by_idempotency_key[receipt.idempotency_key] = receipt
            return receipt

    def get_receipt(self, receipt_id: str) -> CommerceReceipt:
        with self._lock:
            return self._receipts[receipt_id]

    def get_receipt_by_idempotency_key(self, key: str) -> CommerceReceipt:
        with self._lock:
            return self._receipts_by_idempotency_key[key]

    def inventory_units(self, sku_id: str, *, default: int) -> int:
        with self._lock:
            return self._inventory_units.get(sku_id, default)

    def decrement_inventory(self, sku_id: str, *, default: int, quantity: int) -> int:
        with self._lock:
            current = self._inventory_units.get(sku_id, default)
            if current < quantity:
                raise ValueError("insufficient inventory")
            remaining = current - quantity
            self._inventory_units[sku_id] = remaining
            return remaining

    @property
    def cart_count(self) -> int:
        with self._lock:
            return len(self._receipts)
