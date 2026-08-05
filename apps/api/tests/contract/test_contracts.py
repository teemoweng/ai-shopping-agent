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
