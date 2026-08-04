from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from threading import Event, Lock

from fastapi.testclient import TestClient

from app.api.routes.cart import service
from app.dependencies import fixtures
from app.domain.contracts import WorkflowState
from app.main import app

client = TestClient(app)


def inject_trace_persistence_failure(monkeypatch):
    trace_path = service.sessions._trace_path
    original_open = Path.open

    def fail_trace_open(path: Path, *args, **kwargs):
        if path == trace_path:
            raise OSError("injected trace persistence failure")
        return original_open(path, *args, **kwargs)

    monkeypatch.setattr(Path, "open", fail_trace_open)
    return original_open


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
    assert response.json()["simulated"] is True
    assert response.json()["state"] == "COMPARE"
    assert response.json()["rows"]["water_resistance_minutes"] == [None, 40]


def test_compare_rejects_duplicate_product_ids() -> None:
    session_id = recommended_session()
    response = client.post(
        f"/api/v1/guide/sessions/{session_id}/compare",
        json={
            "product_ids": [
                "seoul-shade-daily-fluid",
                "seoul-shade-daily-fluid",
            ]
        },
    )
    assert response.status_code == 422


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


def test_concurrent_confirmation_has_exactly_one_success(monkeypatch) -> None:
    session_id = recommended_session()
    token = client.post(
        f"/api/v1/guide/sessions/{session_id}/cart/preview",
        json={"sku_id": "seoul-shade-30", "quantity": 1},
    ).json()["confirmation_token"]
    endpoint = f"/api/v1/guide/sessions/{session_id}/cart/items"
    repository_type = type(service.fixtures)
    original_get_sku = repository_type.get_sku
    first_recheck_started = Event()
    second_recheck_started = Event()
    release_first_recheck = Event()
    call_count_lock = Lock()
    call_count = 0

    def coordinated_get_sku(repository, sku_id: str):
        nonlocal call_count
        with call_count_lock:
            call_count += 1
            position = call_count
        if position == 1:
            first_recheck_started.set()
            assert release_first_recheck.wait(timeout=5)
        else:
            second_recheck_started.set()
        return original_get_sku(repository, sku_id)

    monkeypatch.setattr(repository_type, "get_sku", coordinated_get_sku)

    def add_once():
        return TestClient(app).post(
            endpoint,
            json={"confirmation_token": token},
        )

    with ThreadPoolExecutor(max_workers=2) as executor:
        first = executor.submit(add_once)
        assert first_recheck_started.wait(timeout=5)
        second = executor.submit(add_once)
        second_recheck_started.wait(timeout=1)
        release_first_recheck.set()
        responses = [first.result(timeout=5), second.result(timeout=5)]

    assert sorted(response.status_code for response in responses) == [201, 409]
    conflicts = [response for response in responses if response.status_code == 409]
    assert conflicts[0].json()["detail"]["code"] == "TOKEN_ALREADY_USED"


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
    session = service.sessions.get(session_id)
    assert token not in session.consumed_confirmation_tokens
    assert all(
        event.event_type != "cart_add"
        for event in service.sessions.events_for_trace(session.trace_id)
    )


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
    session = service.sessions.get(session_id)
    assert token not in session.consumed_confirmation_tokens
    assert all(
        event.event_type != "cart_add"
        for event in service.sessions.events_for_trace(session.trace_id)
    )


def test_unknown_session_has_stable_not_found_error() -> None:
    response = client.post(
        "/api/v1/guide/sessions/ses_missing/cart/preview",
        json={"sku_id": "seoul-shade-30", "quantity": 1},
    )
    assert response.status_code == 404
    assert response.json()["detail"]["code"] == "SESSION_NOT_FOUND"


def test_decision_events_reconstruct_simulated_cart_states() -> None:
    session_id = recommended_session()
    compared = client.post(
        f"/api/v1/guide/sessions/{session_id}/compare",
        json={
            "product_ids": [
                "seoul-shade-daily-fluid",
                "cloud-veil-mineral",
            ]
        },
    )
    previewed = client.post(
        f"/api/v1/guide/sessions/{session_id}/cart/preview",
        json={"sku_id": "seoul-shade-50", "quantity": 1},
    )
    added = client.post(
        f"/api/v1/guide/sessions/{session_id}/cart/items",
        json={"confirmation_token": previewed.json()["confirmation_token"]},
    )
    assert [compared.status_code, previewed.status_code, added.status_code] == [
        200,
        200,
        201,
    ]

    session = service.sessions.get(session_id)
    event_types = {
        "comparison_presented",
        "cart_preview",
        "cart_add",
    }
    events = [
        event
        for event in service.sessions.events_for_trace(session.trace_id)
        if event.event_type in event_types
    ]
    assert [(event.event_type, event.state) for event in events] == [
        ("comparison_presented", WorkflowState.COMPARE),
        ("cart_preview", WorkflowState.SKU_AND_CART_CONFIRM),
        ("cart_add", WorkflowState.FEEDBACK_AND_MEMORY),
    ]
    assert [event.model_dump(mode="json")["payload"] for event in events] == [
        {
            "product_ids": [
                "seoul-shade-daily-fluid",
                "cloud-veil-mineral",
            ],
            "simulated": True,
        },
        {"sku_id": "seoul-shade-50", "quantity": 1, "simulated": True},
        {"sku_id": "seoul-shade-50", "quantity": 1, "simulated": True},
    ]


def test_failed_preview_does_not_fabricate_success_event() -> None:
    session_id = recommended_session("Under $15, fragrance-free, daily commute")
    session = service.sessions.get(session_id)
    before = service.sessions.events_for_trace(session.trace_id)
    response = client.post(
        f"/api/v1/guide/sessions/{session_id}/cart/preview",
        json={"sku_id": "seoul-shade-50", "quantity": 1},
    )
    after = service.sessions.events_for_trace(session.trace_id)

    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "SKU_NOT_RECOMMENDED"
    assert not any(
        event.event_type == "cart_preview" for event in after[len(before) :]
    )
    assert session.state is WorkflowState.PRESENT_RECOMMENDATION


def test_compare_trace_failure_rolls_back_state_and_allows_retry(monkeypatch) -> None:
    session_id = recommended_session()
    session = service.sessions.get(session_id)
    prior_state = session.state
    prior_event_count = len(service.sessions.events_for_trace(session.trace_id))
    prior_previews = dict(service.previews)
    original_open = inject_trace_persistence_failure(monkeypatch)
    endpoint = f"/api/v1/guide/sessions/{session_id}/compare"
    payload = {
        "product_ids": [
            "seoul-shade-daily-fluid",
            "cloud-veil-mineral",
        ]
    }

    failed = TestClient(app, raise_server_exceptions=False).post(
        endpoint,
        json=payload,
    )

    assert failed.status_code == 500
    assert session.state is prior_state
    assert len(service.sessions.events_for_trace(session.trace_id)) == prior_event_count
    assert service.previews == prior_previews

    monkeypatch.setattr(Path, "open", original_open)
    retried = client.post(endpoint, json=payload)
    assert retried.status_code == 200
    assert session.state is WorkflowState.COMPARE
    assert len(service.sessions.events_for_trace(session.trace_id)) == (
        prior_event_count + 1
    )


def test_preview_trace_failure_rolls_back_state_and_preview(monkeypatch) -> None:
    session_id = recommended_session()
    session = service.sessions.get(session_id)
    prior_state = session.state
    prior_event_count = len(service.sessions.events_for_trace(session.trace_id))
    prior_preview_tokens = set(service.previews)
    original_open = inject_trace_persistence_failure(monkeypatch)
    endpoint = f"/api/v1/guide/sessions/{session_id}/cart/preview"
    payload = {"sku_id": "seoul-shade-50", "quantity": 1}

    failed = TestClient(app, raise_server_exceptions=False).post(
        endpoint,
        json=payload,
    )

    assert failed.status_code == 500
    assert session.state is prior_state
    assert len(service.sessions.events_for_trace(session.trace_id)) == prior_event_count
    assert set(service.previews) == prior_preview_tokens

    monkeypatch.setattr(Path, "open", original_open)
    retried = client.post(endpoint, json=payload)
    assert retried.status_code == 200
    assert session.state is WorkflowState.SKU_AND_CART_CONFIRM
    assert retried.json()["confirmation_token"] in service.previews
    assert len(service.sessions.events_for_trace(session.trace_id)) == (
        prior_event_count + 1
    )


def test_add_trace_failure_rolls_back_and_same_token_succeeds_once(
    monkeypatch,
) -> None:
    session_id = recommended_session()
    preview = client.post(
        f"/api/v1/guide/sessions/{session_id}/cart/preview",
        json={"sku_id": "seoul-shade-50", "quantity": 1},
    )
    token = preview.json()["confirmation_token"]
    session = service.sessions.get(session_id)
    prior_state = session.state
    prior_event_count = len(service.sessions.events_for_trace(session.trace_id))
    prior_preview = service.previews[token]
    original_open = inject_trace_persistence_failure(monkeypatch)
    endpoint = f"/api/v1/guide/sessions/{session_id}/cart/items"
    payload = {"confirmation_token": token}

    failed = TestClient(app, raise_server_exceptions=False).post(
        endpoint,
        json=payload,
    )

    assert failed.status_code == 500
    assert session.state is prior_state
    assert token not in session.consumed_confirmation_tokens
    assert service.previews[token] == prior_preview
    assert len(service.sessions.events_for_trace(session.trace_id)) == prior_event_count

    monkeypatch.setattr(Path, "open", original_open)
    retried = client.post(endpoint, json=payload)
    replay = client.post(endpoint, json=payload)
    assert retried.status_code == 201
    assert replay.status_code == 409
    assert replay.json()["detail"]["code"] == "TOKEN_ALREADY_USED"
    assert token in session.consumed_confirmation_tokens
    assert len(service.sessions.events_for_trace(session.trace_id)) == (
        prior_event_count + 1
    )
