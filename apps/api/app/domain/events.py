from collections.abc import Mapping, Sequence
from datetime import UTC, datetime
from types import MappingProxyType
from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_serializer, field_validator

from app.domain.contracts import (
    CommerceFactDiff,
    CommerceFactsResponse,
    CommerceOperationStatus,
    CommerceReceiptResponse,
    CommerceStep,
    CompareResponse,
    EntryPoint,
    GuideTranscriptMessage,
    GuideTurnResponse,
    HardConstraints,
    QueryIntent,
    SoftPreferences,
    WorkflowState,
)

_FORBIDDEN_TRACE_PAYLOAD_KEYS = frozenset(
    {
        "chain_of_thought",
        "raw_message",
        "message_text",
        "client_message_id",
        "conversation_transcript",
    }
)
type JsonPrimitive = str | int | float | bool | None
type FrozenJsonValue = (
    JsonPrimitive | Mapping[str, "FrozenJsonValue"] | tuple["FrozenJsonValue", ...]
)


def _freeze_trace_payload(value: object) -> FrozenJsonValue:
    if isinstance(value, Mapping):
        if not all(isinstance(key, str) for key in value):
            raise ValueError("trace payload keys must be strings")
        if any(
            isinstance(key, str) and key in _FORBIDDEN_TRACE_PAYLOAD_KEYS for key in value
        ):
            raise ValueError("trace payload must not contain chain_of_thought")
        return MappingProxyType(
            {key: _freeze_trace_payload(item) for key, item in value.items()}
        )
    if isinstance(value, Sequence) and not isinstance(value, (str, bytes, bytearray)):
        return tuple(_freeze_trace_payload(item) for item in value)
    if value is None or isinstance(value, str | int | float | bool):
        return value
    raise ValueError("trace payload values must be JSON primitives, mappings, or sequences")


def _thaw_trace_payload(value: FrozenJsonValue) -> object:
    if isinstance(value, Mapping):
        return {key: _thaw_trace_payload(item) for key, item in value.items()}
    if isinstance(value, tuple):
        return [_thaw_trace_payload(item) for item in value]
    return value


class ProcessedGuideRequest(BaseModel):
    request_kind: Literal["MESSAGE", "COMPARE"]
    payload_digest: str
    result_conversation_revision: Annotated[int, Field(ge=1)]
    comparison: CompareResponse | None = None


class GuideSession(BaseModel):
    id: str
    trace_id: str
    entry_point: EntryPoint
    content_context_id: str | None
    search_query: str | None
    locale: Literal["en-US", "zh-CN"] = "en-US"
    query_intent: QueryIntent | None = None
    state: WorkflowState = WorkflowState.ENTRY_INGEST
    hard_constraints: HardConstraints = Field(default_factory=HardConstraints)
    soft_preferences: SoftPreferences = Field(default_factory=SoftPreferences)
    recommended_product_ids: list[str] = Field(default_factory=list)
    eligible_sku_ids_by_product: dict[str, list[str]] = Field(default_factory=dict)
    consumed_confirmation_tokens: set[str] = Field(default_factory=set)
    guide_revision: int = Field(default=1, ge=1)
    conversation_revision: int = Field(default=1, ge=1)
    transcript: list[GuideTranscriptMessage] = Field(default_factory=list)
    processed_guide_requests: dict[str, ProcessedGuideRequest] = Field(
        default_factory=dict
    )
    latest_response: GuideTurnResponse | None = None


class CommerceOperation(BaseModel):
    id: str
    purchase_origin: Literal["FEED", "AI"]
    guide_session_id: str | None = None
    source_guide_revision: int | None = None
    product_id: str
    sku_id: str
    quantity: int
    transaction_revision: int
    facts: CommerceFactsResponse
    commerce_view_kind: CommerceStep
    operation_status: CommerceOperationStatus
    facts_diff: list[CommerceFactDiff] = Field(default_factory=list)
    demo_scenario: Literal["NORMAL", "PRICE_CHANGED", "OUT_OF_STOCK"] = "NORMAL"
    error_code: str | None = None
    receipt_id: str | None = None
    created_at: datetime
    updated_at: datetime


class CommerceConfirmationToken(BaseModel):
    token: str
    operation_id: str
    transaction_revision: int
    facts_version: str
    sku_id: str
    quantity: int
    unit_price_usd: float
    expires_at: datetime
    consumed_at: datetime | None = None
    invalidated_at: datetime | None = None


class CommerceReceipt(CommerceReceiptResponse):
    pass


class TraceEvent(BaseModel):
    model_config = ConfigDict(frozen=True)

    event_id: str
    trace_id: str
    session_id: str
    event_type: str
    state: WorkflowState
    timestamp: datetime = Field(default_factory=lambda: datetime.now(UTC))
    payload: Mapping[str, Any]

    @field_validator("payload")
    @classmethod
    def validate_and_freeze_payload(cls, payload: Mapping[str, Any]) -> Mapping[str, Any]:
        frozen_payload = _freeze_trace_payload(payload)
        if not isinstance(frozen_payload, Mapping):
            raise TypeError("trace payload must be a JSON object")
        return frozen_payload

    @field_serializer("payload")
    def serialize_payload(self, payload: Mapping[str, Any]) -> object:
        return _thaw_trace_payload(payload)
