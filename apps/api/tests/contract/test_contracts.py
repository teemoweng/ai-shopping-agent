import pytest
from pydantic import ValidationError

from app.domain import contracts
from app.domain.contracts import (
    CreateGuideSessionRequest,
    EntryPoint,
    EvidenceStatus,
    QueryIntent,
    WorkflowState,
)


def test_content_entry_requires_content_context_id() -> None:
    with pytest.raises(ValidationError):
        CreateGuideSessionRequest(entry_point=EntryPoint.CONTENT)


def test_search_entry_preserves_query_contract() -> None:
    request = CreateGuideSessionRequest(
        entry_point=EntryPoint.SEARCH,
        search_query="light sunscreen for humid weather",
    )
    assert request.content_context_id is None
    assert request.search_query == "light sunscreen for humid weather"


def test_guide_session_locale_defaults_to_english_and_accepts_chinese() -> None:
    default_request = CreateGuideSessionRequest(
        entry_point=EntryPoint.CONTENT,
        content_context_id="morning-routine-uv-001",
    )
    chinese_request = CreateGuideSessionRequest(
        entry_point=EntryPoint.CONTENT,
        content_context_id="morning-routine-uv-001",
        locale="zh-CN",
    )
    assert default_request.locale == "en-US"
    assert chinese_request.locale == "zh-CN"


def test_content_entry_rejects_search_payload() -> None:
    with pytest.raises(ValidationError):
        CreateGuideSessionRequest(
            entry_point=EntryPoint.CONTENT,
            content_context_id="morning-routine-uv-001",
            search_query="light sunscreen",
        )


def test_search_entry_rejects_content_payload() -> None:
    with pytest.raises(ValidationError):
        CreateGuideSessionRequest(
            entry_point=EntryPoint.SEARCH,
            content_context_id="morning-routine-uv-001",
            search_query="light sunscreen",
        )


def test_guide_session_rejects_unknown_fields() -> None:
    with pytest.raises(ValidationError):
        CreateGuideSessionRequest(
            entry_point=EntryPoint.CONTENT,
            content_context_id="morning-routine-uv-001",
            unexpected="must not be ignored",
        )


def test_guide_session_schema_declares_discriminated_entry_branches() -> None:
    schema = CreateGuideSessionRequest.model_json_schema()
    assert schema["oneOf"] == [
        {
            "additionalProperties": False,
            "properties": {
                "content_context_id": {"minLength": 1, "type": "string"},
                "entry_point": {"const": "content", "type": "string"},
                "locale": {
                    "default": "en-US",
                    "enum": ["en-US", "zh-CN"],
                    "type": "string",
                },
            },
            "required": ["entry_point", "content_context_id"],
            "type": "object",
        },
        {
            "additionalProperties": False,
            "properties": {
                "entry_point": {"const": "search", "type": "string"},
                "locale": {
                    "default": "en-US",
                    "enum": ["en-US", "zh-CN"],
                    "type": "string",
                },
                "search_query": {"maxLength": 200, "minLength": 2, "type": "string"},
            },
            "required": ["entry_point", "search_query"],
            "type": "object",
        },
    ]


def test_workflow_state_values_are_stable() -> None:
    assert [state.value for state in WorkflowState] == [
        "ENTRY_INGEST",
        "UNDERSTAND",
        "CLARIFY",
        "VERIFY_CURRENT_PRODUCT",
        "FILTER_AND_RETRIEVE",
        "PRESENT_RECOMMENDATION",
        "COMPARE",
        "SKU_AND_CART_CONFIRM",
        "FEEDBACK_AND_MEMORY",
    ]


def test_claim_statuses_and_derived_query_intents_are_stable() -> None:
    assert {status.value for status in EvidenceStatus} == {
        "SUPPORTED",
        "CONFLICTING",
        "INSUFFICIENT_EVIDENCE",
        "SUBJECTIVE_MIXED",
    }
    assert [intent.value for intent in QueryIntent] == ["exploratory", "exact"]


def test_guide_action_values_are_complete_and_stable() -> None:
    assert [action.value for action in contracts.GuideAction] == [
        "SEND_MESSAGE",
        "CONFIRM_CONTEXT",
        "ANSWER_CLARIFICATION",
        "SKIP_CLARIFICATION",
        "UPDATE_CONSTRAINTS",
        "RELAX_CONSTRAINT",
        "CONTINUE_WITH_KNOWN",
        "REQUEST_COMPARISON",
        "OPEN_PRODUCT",
        "RETRY_GUIDE_OPERATION",
        "RETURN_TO_FEED",
    ]


def test_guide_status_values_are_complete_and_stable() -> None:
    assert [status.value for status in contracts.GuideStatus] == [
        "ACTIVE",
        "WAITING_USER",
        "SAFE_EXIT",
        "FAILED",
    ]


def test_guide_view_kind_values_are_complete_and_stable() -> None:
    assert [kind.value for kind in contracts.GuideViewKind] == [
        "OPENING_CONTEXT",
        "ANSWER_READY",
        "CONTEXT_CONFIRMATION",
        "WAITING_CLARIFICATION",
        "VERIFYING_FACTS",
        "DECISION_READY",
        "NO_MATCH",
        "INSUFFICIENT_EVIDENCE",
        "COMPARISON_READY",
        "SAFE_BOUNDARY",
        "RECOVERY_REQUIRED",
        "FATAL_ERROR",
    ]


def comparison_ready_turn(**updates: object) -> dict[str, object]:
    turn: dict[str, object] = {
        "session_id": "ses_comparison",
        "trace_id": "trc_comparison",
        "locale": "zh-CN",
        "state": "COMPARE",
        "kind": "recommendation",
        "text": "已生成 2 款商品的结构化比较。",
        "context": {
            "id": "morning-routine-uv-001",
            "anchor_product_id": "seoul-shade-daily-fluid",
            "anchor_product_name": "Seoul Shade Daily Fluid",
            "creator_handle": "@synthetic_creator",
            "caption": "Synthetic sunscreen demo",
            "claims": [],
        },
        "guide_status": "ACTIVE",
        "guide_view_kind": "COMPARISON_READY",
        "guide_revision": 2,
        "facts_snapshot_at": "2026-08-05T12:00:00Z",
        "allowed_actions": ["OPEN_PRODUCT", "RETURN_TO_FEED"],
        "recommendations": [],
        "evidence": [],
        "quick_replies": [],
    }
    turn.update(updates)
    return turn


@pytest.mark.parametrize(
    "comparison",
    [
        None,
        {
            "session_id": "ses_comparison",
            "state": "COMPARE",
            "product_ids": [
                "seoul-shade-daily-fluid",
                "cloud-veil-mineral",
            ],
            "rows": {
                "starting_price_usd": [14.0],
                "fragrance_free": [True, True],
                "water_resistance_minutes": [None, 40],
                "finish": ["natural", "matte"],
                "white_cast_risk": ["low", "medium"],
            },
            "simulated": True,
        },
    ],
    ids=["missing", "row-count-mismatch"],
)
def test_comparison_ready_turn_rejects_missing_or_malformed_comparison(
    comparison: object,
) -> None:
    payload = comparison_ready_turn()
    if comparison is not None:
        payload["comparison"] = comparison

    with pytest.raises(ValidationError):
        contracts.GuideTurnResponse.model_validate(payload)


def test_comparison_ready_turn_requires_exact_terminal_actions() -> None:
    with pytest.raises(ValidationError):
        contracts.GuideTurnResponse.model_validate(
            comparison_ready_turn(
                allowed_actions=["OPEN_PRODUCT"],
                comparison={
                    "session_id": "ses_comparison",
                    "state": "COMPARE",
                    "product_ids": [
                        "seoul-shade-daily-fluid",
                        "cloud-veil-mineral",
                    ],
                    "rows": {
                        "starting_price_usd": [14.0, 17.0],
                        "fragrance_free": [True, True],
                        "water_resistance_minutes": [None, 40],
                        "finish": ["natural", "matte"],
                        "white_cast_risk": ["low", "medium"],
                    },
                    "simulated": True,
                },
            )
        )


def test_feed_commerce_preview_forbids_guide_provenance() -> None:
    with pytest.raises(ValidationError):
        contracts.CommercePreviewRequest(
            purchase_origin="FEED",
            guide_session_id="ses_guide",
            source_guide_revision=2,
            product_id="seoul-shade-daily-fluid",
            sku_id="seoul-shade-30",
        )


@pytest.mark.parametrize(
    ("guide_session_id", "source_guide_revision"),
    [(None, None), ("ses_guide", None), (None, 2)],
)
def test_ai_commerce_preview_requires_complete_guide_provenance(
    guide_session_id: str | None,
    source_guide_revision: int | None,
) -> None:
    with pytest.raises(ValidationError):
        contracts.CommercePreviewRequest(
            purchase_origin="AI",
            guide_session_id=guide_session_id,
            source_guide_revision=source_guide_revision,
            product_id="seoul-shade-daily-fluid",
            sku_id="seoul-shade-30",
        )


def test_commerce_contract_enums_are_complete_and_stable() -> None:
    assert [step.value for step in contracts.CommerceStep] == [
        "PDP_READY",
        "CHECKING_FACTS",
        "AWAITING_CONFIRMATION",
        "FACTS_CHANGED",
        "COMMITTING",
        "COMMIT_STATUS_UNKNOWN",
        "SUCCEEDED",
        "FAILED",
        "CANCELLED",
    ]
    assert [action.value for action in contracts.CommerceAction] == [
        "SELECT_SKU",
        "SET_QUANTITY",
        "PREVIEW_CART",
        "ACCEPT_UPDATED_FACTS",
        "CONFIRM_ADD_TO_CART",
        "CANCEL_CONFIRMATION",
        "RESELECT_SKU",
        "RETRY_COMMERCE_OPERATION",
        "RECONCILE_COMMIT",
        "RETURN_TO_PRODUCT",
        "CONTINUE_BROWSING",
    ]
    assert [status.value for status in contracts.CommerceOperationStatus] == [
        "ACTIVE",
        "RECONCILIATION_REQUIRED",
        "SUCCEEDED",
        "FAILED",
        "CANCELLED",
    ]


def test_initial_commerce_preview_omits_previous_operation() -> None:
    request = contracts.CommercePreviewRequest(
        purchase_origin="FEED",
        product_id="seoul-shade-daily-fluid",
        sku_id="seoul-shade-30",
    )
    assert request.expected_transaction_revision == 0
    assert request.previous_operation_id is None


def test_followup_commerce_preview_requires_exact_previous_operation() -> None:
    with pytest.raises(ValidationError):
        contracts.CommercePreviewRequest(
            purchase_origin="FEED",
            product_id="seoul-shade-daily-fluid",
            sku_id="seoul-shade-50",
            expected_transaction_revision=1,
        )


def test_initial_commerce_preview_forbids_previous_operation() -> None:
    with pytest.raises(ValidationError):
        contracts.CommercePreviewRequest(
            purchase_origin="FEED",
            product_id="seoul-shade-daily-fluid",
            sku_id="seoul-shade-30",
            previous_operation_id="cop_previous",
        )
