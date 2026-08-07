from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest

from app.domain.contracts import (
    CommerceAcceptFactsRequest,
    CommerceAddRequest,
    CommercePreviewRequest,
    EntryPoint,
    GuideMessageRequest,
)
from app.repositories.fixture_repository import FixtureRepository
from app.repositories.session_repository import SessionRepository
from app.workflow.engine import WorkflowEngine
from app.workflow.tools import ShoppingTools

FIXTURE_ROOT = Path(__file__).parents[4] / "data" / "fixtures"


class FakeClock:
    def __init__(self) -> None:
        self.current = datetime(2026, 8, 5, 12, 0, tzinfo=UTC)

    def now(self) -> datetime:
        return self.current

    def advance(self, delta: timedelta) -> None:
        self.current += delta


def build_service(tmp_path: Path):
    from app.repositories.commerce_repository import CommerceRepository
    from app.services.commerce_service import CommerceService

    fixtures = FixtureRepository.load(FIXTURE_ROOT)
    sessions = SessionRepository(tmp_path / "trace.jsonl")
    clock = FakeClock()
    repository = CommerceRepository()
    service = CommerceService(fixtures, sessions, repository, clock)
    return service, repository, sessions, clock


def build_ai_provenance(service, sessions):
    session = sessions.create(
        EntryPoint.CONTENT,
        "morning-routine-uv-001",
        None,
        locale="zh-CN",
    )
    guide_engine = WorkflowEngine(ShoppingTools(service.fixtures), sessions)
    guide_engine.open_session(session)
    response = guide_engine.handle_message(
        session,
        GuideMessageRequest(
            message_id="commerce_provenance",
            text="预算30美元以内、无香精、自然妆效",
        ),
    )
    sessions.save_snapshot(session, response)
    return session


def feed_preview_request(**updates: object) -> CommercePreviewRequest:
    values: dict[str, object] = {
        "purchase_origin": "FEED",
        "product_id": "seoul-shade-daily-fluid",
        "sku_id": "seoul-shade-30",
        "quantity": 1,
        "expected_transaction_revision": 0,
    }
    values.update(updates)
    return CommercePreviewRequest.model_validate(values)


def test_direct_feed_preview_rechecks_structured_facts_without_guide(
    tmp_path: Path,
) -> None:
    service, _, _, clock = build_service(tmp_path)

    response = service.preview(feed_preview_request())

    assert response.purchase_origin == "FEED"
    assert response.guide_session_id is None
    assert response.source_guide_revision is None
    assert response.transaction_revision == 1
    assert response.commerce_view_kind == "AWAITING_CONFIRMATION"
    assert response.operation_status == "ACTIVE"
    assert response.facts.facts_version == "catalog-2026-08-05-seoul-v1"
    assert response.facts.unit_price_usd == 14.0
    assert response.facts.inventory_units == 18
    assert response.confirmation_token.startswith("cft_")
    assert response.confirmation_expires_at == clock.now() + timedelta(minutes=5)
    assert response.allowed_actions == [
        "SELECT_SKU",
        "SET_QUANTITY",
        "CONFIRM_ADD_TO_CART",
        "CANCEL_CONFIRMATION",
        "RETURN_TO_PRODUCT",
    ]


def test_valid_ai_provenance_is_bound_to_live_guide_revision(tmp_path: Path) -> None:
    service, _, sessions, _ = build_service(tmp_path)
    session = build_ai_provenance(service, sessions)

    response = service.preview(
        CommercePreviewRequest(
            purchase_origin="AI",
            guide_session_id=session.id,
            source_guide_revision=session.guide_revision,
            product_id="seoul-shade-daily-fluid",
            sku_id="seoul-shade-30",
        )
    )

    assert response.guide_session_id == session.id
    assert response.source_guide_revision == session.guide_revision
    assert response.commerce_view_kind == "AWAITING_CONFIRMATION"


def test_stale_ai_provenance_is_rejected(tmp_path: Path) -> None:
    from app.services.commerce_service import CommerceConflict

    service, _, sessions, _ = build_service(tmp_path)
    session = build_ai_provenance(service, sessions)

    with pytest.raises(CommerceConflict, match="STALE_GUIDE_REVISION"):
        service.preview(
            CommercePreviewRequest(
                purchase_origin="AI",
                guide_session_id=session.id,
                source_guide_revision=session.guide_revision - 1,
                product_id="seoul-shade-daily-fluid",
                sku_id="seoul-shade-30",
            )
        )


def test_ai_preview_rejects_product_outside_current_authoritative_open_set(
    tmp_path: Path,
) -> None:
    from app.services.commerce_service import CommerceConflict

    service, _, sessions, _ = build_service(tmp_path)
    session = build_ai_provenance(service, sessions)

    with pytest.raises(CommerceConflict, match="PRODUCT_NOT_RECOMMENDED"):
        service.preview(
            CommercePreviewRequest(
                purchase_origin="AI",
                guide_session_id=session.id,
                source_guide_revision=session.guide_revision,
                product_id="jeju-sport-sun-gel",
                sku_id="jeju-sport-50",
            )
        )


def test_ai_preview_uses_product_scoped_skus_from_authoritative_snapshot(
    tmp_path: Path,
) -> None:
    from app.services.commerce_service import CommerceConflict

    service, _, sessions, _ = build_service(tmp_path)
    session = build_ai_provenance(service, sessions)
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
    sessions.save(session)

    with pytest.raises(CommerceConflict, match="SKU_NOT_RECOMMENDED"):
        service.preview(
            CommercePreviewRequest(
                purchase_origin="AI",
                guide_session_id=session.id,
                source_guide_revision=session.guide_revision,
                product_id="seoul-shade-daily-fluid",
                sku_id="seoul-shade-50",
            )
        )


def test_preview_rejects_sku_from_another_product(tmp_path: Path) -> None:
    from app.services.commerce_service import CommerceConflict

    service, _, _, _ = build_service(tmp_path)

    with pytest.raises(CommerceConflict, match="SKU_PRODUCT_MISMATCH"):
        service.preview(feed_preview_request(sku_id="cloud-veil-30"))


def test_confirmation_token_expires_at_exactly_five_minutes(tmp_path: Path) -> None:
    from app.services.commerce_service import CommerceConflict

    service, _, _, clock = build_service(tmp_path)
    preview = service.preview(feed_preview_request())
    clock.advance(timedelta(minutes=5))

    with pytest.raises(CommerceConflict, match="TOKEN_EXPIRED"):
        service.add_item(
            preview.operation_id,
            CommerceAddRequest(
                confirmation_token=preview.confirmation_token,
                idempotency_key="idem_expired",
                expected_transaction_revision=preview.transaction_revision,
            ),
        )


def test_confirmation_token_is_bound_to_revision_facts_sku_quantity_and_price(
    tmp_path: Path,
) -> None:
    from app.services.commerce_service import CommerceConflict

    service, repository, _, _ = build_service(tmp_path)
    preview = service.preview(feed_preview_request())
    token = repository.get_token(preview.confirmation_token)
    token.unit_price_usd += 1
    repository.save_token(token)

    with pytest.raises(CommerceConflict, match="TOKEN_INVALIDATED"):
        service.add_item(
            preview.operation_id,
            CommerceAddRequest(
                confirmation_token=preview.confirmation_token,
                idempotency_key="idem_tampered_binding",
                expected_transaction_revision=preview.transaction_revision,
            ),
        )
    assert repository.cart_count == 0


@pytest.mark.parametrize(
    ("selection_update", "expected_sku", "expected_quantity"),
    [
        ({"quantity": 2}, "seoul-shade-30", 2),
        ({"sku_id": "seoul-shade-50"}, "seoul-shade-50", 1),
    ],
)
def test_selection_change_advances_transaction_not_guide_revision(
    tmp_path: Path,
    selection_update: dict[str, object],
    expected_sku: str,
    expected_quantity: int,
) -> None:
    from app.services.commerce_service import CommerceConflict

    service, _, sessions, _ = build_service(tmp_path)
    session = build_ai_provenance(service, sessions)
    original_guide_revision = session.guide_revision
    first = service.preview(
        CommercePreviewRequest(
            purchase_origin="AI",
            guide_session_id=session.id,
            source_guide_revision=original_guide_revision,
            product_id="seoul-shade-daily-fluid",
            sku_id="seoul-shade-30",
        )
    )
    next_values: dict[str, object] = {
        "purchase_origin": "AI",
        "guide_session_id": session.id,
        "source_guide_revision": original_guide_revision,
        "product_id": "seoul-shade-daily-fluid",
        "sku_id": "seoul-shade-30",
        "previous_operation_id": first.operation_id,
        "expected_transaction_revision": first.transaction_revision,
    }
    next_values.update(selection_update)

    changed = service.preview(CommercePreviewRequest.model_validate(next_values))

    assert changed.transaction_revision == first.transaction_revision + 1
    assert changed.source_guide_revision == original_guide_revision
    assert sessions.get(session.id).guide_revision == original_guide_revision
    assert changed.sku_id == expected_sku
    assert changed.quantity == expected_quantity
    with pytest.raises(CommerceConflict, match="TOKEN_INVALIDATED"):
        service.add_item(
            first.operation_id,
            CommerceAddRequest(
                confirmation_token=first.confirmation_token,
                idempotency_key="idem_superseded",
                expected_transaction_revision=first.transaction_revision,
            ),
        )


def test_invalid_selection_does_not_invalidate_previous_confirmation(
    tmp_path: Path,
) -> None:
    from app.services.commerce_service import CommerceConflict

    service, repository, _, _ = build_service(tmp_path)
    first = service.preview(feed_preview_request())

    with pytest.raises(CommerceConflict, match="SKU_PRODUCT_MISMATCH"):
        service.preview(
            feed_preview_request(
                sku_id="cloud-veil-30",
                previous_operation_id=first.operation_id,
                expected_transaction_revision=first.transaction_revision,
            )
        )

    assert repository.get_token(first.confirmation_token).invalidated_at is None
    added = service.add_item(
        first.operation_id,
        CommerceAddRequest(
            confirmation_token=first.confirmation_token,
            idempotency_key="idem_after_invalid_selection",
            expected_transaction_revision=first.transaction_revision,
        ),
    )
    assert added.commerce_view_kind == "SUCCEEDED"


def test_concurrent_selection_updates_allow_one_revision_winner(
    tmp_path: Path,
) -> None:
    from app.services.commerce_service import CommerceConflict

    service, _, _, _ = build_service(tmp_path)
    first = service.preview(feed_preview_request())

    def update_quantity(quantity: int):
        try:
            return service.preview(
                feed_preview_request(
                    quantity=quantity,
                    previous_operation_id=first.operation_id,
                    expected_transaction_revision=first.transaction_revision,
                )
            )
        except CommerceConflict as error:
            return error

    with ThreadPoolExecutor(max_workers=2) as executor:
        results = list(executor.map(update_quantity, [2, 3]))

    successes = [result for result in results if not isinstance(result, Exception)]
    conflicts = [result for result in results if isinstance(result, CommerceConflict)]
    assert len(successes) == 1
    assert successes[0].transaction_revision == 2
    assert [error.code for error in conflicts] == ["TRANSACTION_REVISION_CONFLICT"]


def test_updating_one_feed_chain_does_not_cancel_an_independent_chain(
    tmp_path: Path,
) -> None:
    service, repository, _, _ = build_service(tmp_path)
    chain_a = service.preview(feed_preview_request())
    chain_b = service.preview(feed_preview_request())

    updated_a = service.preview(
        feed_preview_request(
            quantity=2,
            previous_operation_id=chain_a.operation_id,
            expected_transaction_revision=chain_a.transaction_revision,
        )
    )

    assert updated_a.transaction_revision == 2
    assert repository.get_token(chain_a.confirmation_token).invalidated_at is not None
    assert repository.get_token(chain_b.confirmation_token).invalidated_at is None
    committed_b = service.add_item(
        chain_b.operation_id,
        CommerceAddRequest(
            confirmation_token=chain_b.confirmation_token,
            idempotency_key="idem_independent_chain_b",
            expected_transaction_revision=chain_b.transaction_revision,
        ),
    )
    assert committed_b.commerce_view_kind == "SUCCEEDED"


def test_price_changed_preview_returns_diff_and_acceptance_issues_fresh_token(
    tmp_path: Path,
) -> None:
    service, _, _, _ = build_service(tmp_path)

    changed = service.preview(
        feed_preview_request(demo_scenario="PRICE_CHANGED")
    )

    assert changed.commerce_view_kind == "FACTS_CHANGED"
    assert changed.confirmation_token is None
    assert changed.error_code == "FACTS_CHANGED"
    assert [item.model_dump() for item in changed.facts_diff] == [
        {
            "field": "unit_price_usd",
            "previous_value": 14.0,
            "current_value": 15.0,
        },
        {
            "field": "facts_version",
            "previous_value": "catalog-2026-08-05-seoul-v1",
            "current_value": "catalog-2026-08-05-seoul-v1-demo-price-changed",
        },
    ]
    assert changed.allowed_actions == [
        "ACCEPT_UPDATED_FACTS",
        "RESELECT_SKU",
        "CANCEL_CONFIRMATION",
        "RETURN_TO_PRODUCT",
    ]

    accepted = service.accept_facts(
        changed.operation_id,
        CommerceAcceptFactsRequest(
            expected_transaction_revision=changed.transaction_revision
        ),
    )

    assert accepted.transaction_revision == changed.transaction_revision + 1
    assert accepted.commerce_view_kind == "AWAITING_CONFIRMATION"
    assert accepted.facts.unit_price_usd == 15.0
    assert accepted.confirmation_token.startswith("cft_")
    assert accepted.confirmation_token != changed.confirmation_token
    assert accepted.facts_diff == []


def test_out_of_stock_preview_only_allows_sku_reselection(tmp_path: Path) -> None:
    service, _, _, _ = build_service(tmp_path)

    response = service.preview(feed_preview_request(demo_scenario="OUT_OF_STOCK"))

    assert response.commerce_view_kind == "FACTS_CHANGED"
    assert response.error_code == "OUT_OF_STOCK"
    assert response.facts.in_stock is False
    assert response.facts.inventory_units == 0
    assert response.confirmation_token is None
    assert response.allowed_actions == ["RESELECT_SKU", "RETURN_TO_PRODUCT"]


def test_explicitly_unavailable_sku_never_receives_confirmation_token(
    tmp_path: Path,
    monkeypatch,
) -> None:
    service, _, _, _ = build_service(tmp_path)
    original_get_product = type(service.fixtures).get_product

    def unavailable_product(fixtures, product_id: str):
        product = original_get_product(fixtures, product_id)
        skus = tuple(
            sku.model_copy(update={"in_stock": False, "inventory_units": 9})
            if sku.id == "seoul-shade-30"
            else sku
            for sku in product.skus
        )
        return product.model_copy(update={"skus": skus})

    monkeypatch.setattr(type(service.fixtures), "get_product", unavailable_product)

    response = service.preview(feed_preview_request())

    assert response.facts.inventory_units == 9
    assert response.facts.in_stock is False
    assert response.commerce_view_kind == "FACTS_CHANGED"
    assert response.error_code == "OUT_OF_STOCK"
    assert response.confirmation_token is None
    assert response.allowed_actions == ["RESELECT_SKU", "RETURN_TO_PRODUCT"]


def test_commit_recheck_invalidates_token_when_structured_facts_change(
    tmp_path: Path,
    monkeypatch,
) -> None:
    service, repository, _, _ = build_service(tmp_path)
    preview = service.preview(feed_preview_request())
    original_get_product = type(service.fixtures).get_product

    def changed_product(fixtures, product_id: str):
        product = original_get_product(fixtures, product_id)
        changed_skus = tuple(
            sku.model_copy(update={"price_usd": 15.0})
            if sku.id == "seoul-shade-30"
            else sku
            for sku in product.skus
        )
        return product.model_copy(
            update={
                "skus": changed_skus,
                "facts_version": "catalog-2026-08-05-seoul-v2",
            }
        )

    monkeypatch.setattr(type(service.fixtures), "get_product", changed_product)

    changed = service.add_item(
        preview.operation_id,
        CommerceAddRequest(
            confirmation_token=preview.confirmation_token,
            idempotency_key="idem_changed",
            expected_transaction_revision=preview.transaction_revision,
        ),
    )

    assert changed.commerce_view_kind == "FACTS_CHANGED"
    assert changed.transaction_revision == preview.transaction_revision + 1
    assert changed.confirmation_token is None
    assert changed.facts.unit_price_usd == 15.0
    assert {item.field for item in changed.facts_diff} == {
        "unit_price_usd",
        "facts_version",
    }
    token = repository.get_token(preview.confirmation_token)
    assert token.invalidated_at is not None


def test_idempotency_returns_same_receipt_and_mutates_cart_once(
    tmp_path: Path,
) -> None:
    from app.services.commerce_service import CommerceConflict

    service, repository, _, _ = build_service(tmp_path)
    preview = service.preview(feed_preview_request())
    request = CommerceAddRequest(
        confirmation_token=preview.confirmation_token,
        idempotency_key="idem_single_receipt",
        expected_transaction_revision=preview.transaction_revision,
    )

    first = service.add_item(preview.operation_id, request)
    repeated = service.add_item(preview.operation_id, request)

    assert first == repeated
    assert first.commerce_view_kind == "SUCCEEDED"
    assert first.operation_status == "SUCCEEDED"
    assert first.receipt is not None
    assert first.receipt.receipt_id == repeated.receipt.receipt_id
    assert first.confirmation_token is None
    assert repository.cart_count == 1
    assert repository.inventory_units("seoul-shade-30", default=18) == 17

    with pytest.raises(CommerceConflict, match="TOKEN_ALREADY_USED"):
        service.add_item(
            preview.operation_id,
            request.model_copy(update={"idempotency_key": "idem_different"}),
        )
    assert repository.cart_count == 1
    assert repository.inventory_units("seoul-shade-30", default=18) == 17


def test_concurrent_same_idempotency_key_commits_exactly_once(tmp_path: Path) -> None:
    service, repository, _, _ = build_service(tmp_path)
    preview = service.preview(feed_preview_request())
    request = CommerceAddRequest(
        confirmation_token=preview.confirmation_token,
        idempotency_key="idem_concurrent",
        expected_transaction_revision=preview.transaction_revision,
    )

    with ThreadPoolExecutor(max_workers=8) as executor:
        responses = list(
            executor.map(
                lambda _: service.add_item(preview.operation_id, request),
                range(8),
            )
        )

    assert {response.receipt.receipt_id for response in responses} == {
        responses[0].receipt.receipt_id
    }
    assert repository.cart_count == 1
    assert repository.inventory_units("seoul-shade-30", default=18) == 17


def test_unknown_commit_result_reconciles_to_single_success_receipt(
    tmp_path: Path,
) -> None:
    service, repository, _, _ = build_service(tmp_path)
    preview = service.preview(feed_preview_request())

    uncertain = service.add_item(
        preview.operation_id,
        CommerceAddRequest(
            confirmation_token=preview.confirmation_token,
            idempotency_key="idem_unknown",
            expected_transaction_revision=preview.transaction_revision,
            demo_scenario="COMMIT_STATUS_UNKNOWN",
        ),
    )

    assert uncertain.commerce_view_kind == "COMMIT_STATUS_UNKNOWN"
    assert uncertain.operation_status == "RECONCILIATION_REQUIRED"
    assert uncertain.error_code == "COMMIT_STATUS_UNKNOWN"
    assert uncertain.receipt is None
    assert uncertain.confirmation_token is None
    assert uncertain.allowed_actions == [
        "RECONCILE_COMMIT",
        "RETURN_TO_PRODUCT",
    ]
    assert service.get_operation(preview.operation_id) == uncertain
    assert repository.cart_count == 1
    assert repository.inventory_units("seoul-shade-30", default=18) == 17

    from app.services.commerce_service import CommerceConflict

    with pytest.raises(CommerceConflict, match="COMMIT_STATUS_UNKNOWN"):
        service.preview(
            feed_preview_request(
                quantity=2,
                previous_operation_id=preview.operation_id,
                expected_transaction_revision=preview.transaction_revision,
            )
        )
    with pytest.raises(CommerceConflict, match="COMMIT_STATUS_UNKNOWN"):
        service.accept_facts(
            preview.operation_id,
            CommerceAcceptFactsRequest(
                expected_transaction_revision=preview.transaction_revision
            ),
        )
    for retry_key in ("idem_unknown", "idem_unknown_second_write"):
        with pytest.raises(CommerceConflict, match="COMMIT_STATUS_UNKNOWN"):
            service.add_item(
                preview.operation_id,
                CommerceAddRequest(
                    confirmation_token=preview.confirmation_token,
                    idempotency_key=retry_key,
                    expected_transaction_revision=preview.transaction_revision,
                ),
            )
    assert repository.cart_count == 1
    assert repository.inventory_units("seoul-shade-30", default=18) == 17

    reconciled = service.get_by_idempotency_key("idem_unknown")

    assert reconciled.commerce_view_kind == "SUCCEEDED"
    assert reconciled.operation_status == "SUCCEEDED"
    assert reconciled.receipt is not None
    assert reconciled.receipt.idempotency_key == "idem_unknown"
    assert repository.cart_count == 1
    assert repository.inventory_units("seoul-shade-30", default=18) == 17
