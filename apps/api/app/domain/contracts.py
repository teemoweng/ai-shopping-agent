from __future__ import annotations

from datetime import UTC, datetime
from enum import StrEnum
from itertools import pairwise
from typing import Annotated, Literal

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    HttpUrl,
    field_validator,
    model_validator,
)
from pydantic.json_schema import GetJsonSchemaHandler, JsonSchemaValue
from pydantic_core import CoreSchema


class EntryPoint(StrEnum):
    CONTENT = "content"
    SEARCH = "search"


class QueryIntent(StrEnum):
    EXPLORATORY = "exploratory"
    EXACT = "exact"


class WorkflowState(StrEnum):
    ENTRY_INGEST = "ENTRY_INGEST"
    UNDERSTAND = "UNDERSTAND"
    CLARIFY = "CLARIFY"
    VERIFY_CURRENT_PRODUCT = "VERIFY_CURRENT_PRODUCT"
    FILTER_AND_RETRIEVE = "FILTER_AND_RETRIEVE"
    PRESENT_RECOMMENDATION = "PRESENT_RECOMMENDATION"
    COMPARE = "COMPARE"
    SKU_AND_CART_CONFIRM = "SKU_AND_CART_CONFIRM"
    FEEDBACK_AND_MEMORY = "FEEDBACK_AND_MEMORY"


class GuideAction(StrEnum):
    SEND_MESSAGE = "SEND_MESSAGE"
    CONFIRM_CONTEXT = "CONFIRM_CONTEXT"
    ANSWER_CLARIFICATION = "ANSWER_CLARIFICATION"
    SKIP_CLARIFICATION = "SKIP_CLARIFICATION"
    UPDATE_CONSTRAINTS = "UPDATE_CONSTRAINTS"
    RELAX_CONSTRAINT = "RELAX_CONSTRAINT"
    CONTINUE_WITH_KNOWN = "CONTINUE_WITH_KNOWN"
    REQUEST_COMPARISON = "REQUEST_COMPARISON"
    OPEN_PRODUCT = "OPEN_PRODUCT"
    RETRY_GUIDE_OPERATION = "RETRY_GUIDE_OPERATION"
    RETURN_TO_FEED = "RETURN_TO_FEED"


class GuideStatus(StrEnum):
    ACTIVE = "ACTIVE"
    WAITING_USER = "WAITING_USER"
    SAFE_EXIT = "SAFE_EXIT"
    FAILED = "FAILED"


class GuideViewKind(StrEnum):
    OPENING_CONTEXT = "OPENING_CONTEXT"
    ANSWER_READY = "ANSWER_READY"
    CONTEXT_CONFIRMATION = "CONTEXT_CONFIRMATION"
    WAITING_CLARIFICATION = "WAITING_CLARIFICATION"
    VERIFYING_FACTS = "VERIFYING_FACTS"
    DECISION_READY = "DECISION_READY"
    NO_MATCH = "NO_MATCH"
    INSUFFICIENT_EVIDENCE = "INSUFFICIENT_EVIDENCE"
    COMPARISON_READY = "COMPARISON_READY"
    SAFE_BOUNDARY = "SAFE_BOUNDARY"
    RECOVERY_REQUIRED = "RECOVERY_REQUIRED"
    FATAL_ERROR = "FATAL_ERROR"


class CommerceStep(StrEnum):
    PDP_READY = "PDP_READY"
    CHECKING_FACTS = "CHECKING_FACTS"
    AWAITING_CONFIRMATION = "AWAITING_CONFIRMATION"
    FACTS_CHANGED = "FACTS_CHANGED"
    COMMITTING = "COMMITTING"
    COMMIT_STATUS_UNKNOWN = "COMMIT_STATUS_UNKNOWN"
    SUCCEEDED = "SUCCEEDED"
    FAILED = "FAILED"
    CANCELLED = "CANCELLED"


class CommerceAction(StrEnum):
    SELECT_SKU = "SELECT_SKU"
    SET_QUANTITY = "SET_QUANTITY"
    PREVIEW_CART = "PREVIEW_CART"
    ACCEPT_UPDATED_FACTS = "ACCEPT_UPDATED_FACTS"
    CONFIRM_ADD_TO_CART = "CONFIRM_ADD_TO_CART"
    CANCEL_CONFIRMATION = "CANCEL_CONFIRMATION"
    RESELECT_SKU = "RESELECT_SKU"
    RETRY_COMMERCE_OPERATION = "RETRY_COMMERCE_OPERATION"
    RECONCILE_COMMIT = "RECONCILE_COMMIT"
    RETURN_TO_PRODUCT = "RETURN_TO_PRODUCT"
    CONTINUE_BROWSING = "CONTINUE_BROWSING"


class CommerceOperationStatus(StrEnum):
    ACTIVE = "ACTIVE"
    RECONCILIATION_REQUIRED = "RECONCILIATION_REQUIRED"
    SUCCEEDED = "SUCCEEDED"
    FAILED = "FAILED"
    CANCELLED = "CANCELLED"


class Verdict(StrEnum):
    SUITABLE = "SUITABLE"
    CONDITIONAL = "CONDITIONAL"
    NOT_RECOMMENDED = "NOT_RECOMMENDED"
    INSUFFICIENT_EVIDENCE = "INSUFFICIENT_EVIDENCE"


class EvidenceStatus(StrEnum):
    SUPPORTED = "SUPPORTED"
    CONFLICTING = "CONFLICTING"
    INSUFFICIENT_EVIDENCE = "INSUFFICIENT_EVIDENCE"
    SUBJECTIVE_MIXED = "SUBJECTIVE_MIXED"


class HardConstraints(BaseModel):
    max_price_usd: Annotated[float | None, Field(gt=0)] = None
    fragrance_free: bool | None = None
    water_resistance_minutes: Literal[40, 80] | None = None
    in_stock: bool = True


class SoftPreferences(BaseModel):
    finish: Literal["dewy", "natural", "matte"] | None = None
    skin_type: Literal["dry", "combination", "oily", "sensitive"] | None = None
    white_cast_concern: Literal["low", "medium", "high"] | None = None


class CreateGuideSessionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    entry_point: EntryPoint
    content_context_id: str | None = None
    search_query: Annotated[str | None, Field(min_length=2, max_length=200)] = None
    locale: Literal["en-US", "zh-CN"] = "en-US"

    @classmethod
    def __get_pydantic_json_schema__(
        cls,
        core_schema: CoreSchema,
        handler: GetJsonSchemaHandler,
    ) -> JsonSchemaValue:
        return {
            "title": cls.__name__,
            "oneOf": [
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
                        "search_query": {
                            "maxLength": 200,
                            "minLength": 2,
                            "type": "string",
                        },
                    },
                    "required": ["entry_point", "search_query"],
                    "type": "object",
                },
            ],
        }

    @model_validator(mode="after")
    def validate_entry_payload(self) -> CreateGuideSessionRequest:
        if self.entry_point is EntryPoint.CONTENT and not self.content_context_id:
            raise ValueError("content_context_id is required for content entry")
        if self.entry_point is EntryPoint.CONTENT and self.search_query is not None:
            raise ValueError("search_query is not allowed for content entry")
        if self.entry_point is EntryPoint.SEARCH and not self.search_query:
            raise ValueError("search_query is required for search entry")
        if self.entry_point is EntryPoint.SEARCH and self.content_context_id is not None:
            raise ValueError("content_context_id is not allowed for search entry")
        return self


class GuideMessageRequest(BaseModel):
    message_id: Annotated[str, Field(min_length=1, max_length=80)]
    text: Annotated[str, Field(min_length=1, max_length=500)]
    expected_conversation_revision: Annotated[int | None, Field(ge=1)] = None


class CompareRequest(BaseModel):
    product_ids: Annotated[list[str], Field(min_length=2, max_length=3)]
    request_id: Annotated[str | None, Field(min_length=1, max_length=80)] = None
    expected_conversation_revision: Annotated[int | None, Field(ge=1)] = None

    @model_validator(mode="after")
    def require_distinct_products(self) -> CompareRequest:
        if len(set(self.product_ids)) != len(self.product_ids):
            raise ValueError("product_ids must be distinct")
        return self


class CartPreviewRequest(BaseModel):
    sku_id: str
    quantity: Annotated[int, Field(ge=1, le=5)] = 1


class AddCartItemRequest(BaseModel):
    confirmation_token: str


class CommercePreviewRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    purchase_origin: Literal["FEED", "AI"]
    guide_session_id: str | None = None
    source_guide_revision: int | None = None
    product_id: str
    sku_id: str
    quantity: Annotated[int, Field(ge=1, le=5)] = 1
    previous_operation_id: str | None = None
    expected_transaction_revision: Annotated[int, Field(ge=0)] = 0
    demo_scenario: Literal["NORMAL", "PRICE_CHANGED", "OUT_OF_STOCK"] = (
        "NORMAL"
    )

    @model_validator(mode="after")
    def validate_purchase_origin(self) -> CommercePreviewRequest:
        has_session = self.guide_session_id is not None
        has_revision = self.source_guide_revision is not None
        if self.purchase_origin == "FEED" and (has_session or has_revision):
            raise ValueError("FEED purchase origin forbids Guide provenance")
        if self.purchase_origin == "AI" and not (has_session and has_revision):
            raise ValueError("AI purchase origin requires complete Guide provenance")
        is_followup = self.expected_transaction_revision > 0
        if is_followup and self.previous_operation_id is None:
            raise ValueError(
                "follow-up preview requires previous_operation_id"
            )
        if not is_followup and self.previous_operation_id is not None:
            raise ValueError(
                "initial preview forbids previous_operation_id"
            )
        return self


class CommerceAddRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    confirmation_token: str
    idempotency_key: str
    expected_transaction_revision: int
    demo_scenario: Literal["NORMAL", "COMMIT_STATUS_UNKNOWN"] = "NORMAL"


class CommerceAcceptFactsRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    expected_transaction_revision: Annotated[int, Field(ge=1)]


class CommerceFactsResponse(BaseModel):
    product_id: str
    sku_id: str
    quantity: int
    unit_price_usd: float
    subtotal_usd: float
    inventory_units: int
    in_stock: bool
    facts_version: str
    observed_at: datetime


class CommerceFactDiff(BaseModel):
    field: str
    previous_value: str | float | int | bool | None
    current_value: str | float | int | bool | None


class CommerceReceiptResponse(BaseModel):
    receipt_id: str
    cart_id: str
    cart_item_id: str
    operation_id: str
    idempotency_key: str
    product_id: str
    sku_id: str
    quantity: int
    unit_price_usd: float
    subtotal_usd: float
    facts_version: str
    committed_at: datetime
    simulated: Literal[True]
    order_created: Literal[False]
    payment_created: Literal[False]


class CommerceOperationResponse(BaseModel):
    operation_id: str
    purchase_origin: Literal["FEED", "AI"]
    guide_session_id: str | None = None
    source_guide_revision: int | None = None
    product_id: str
    sku_id: str
    quantity: int
    transaction_revision: Annotated[int, Field(ge=1)]
    facts_version: str
    commerce_view_kind: CommerceStep
    operation_status: CommerceOperationStatus
    allowed_actions: list[CommerceAction]
    facts: CommerceFactsResponse
    facts_diff: list[CommerceFactDiff] = Field(default_factory=list)
    confirmation_token: str | None = None
    confirmation_expires_at: datetime | None = None
    receipt: CommerceReceiptResponse | None = None
    error_code: str | None = None
    simulated: Literal[True]


class ComparisonRows(BaseModel):
    model_config = ConfigDict(extra="forbid")

    starting_price_usd: list[Annotated[float, Field(ge=0)]]
    fragrance_free: list[bool]
    water_resistance_minutes: list[Literal[40, 80] | None]
    finish: list[Literal["dewy", "natural", "matte"]]
    white_cast_risk: list[Literal["low", "medium", "high"]]


class CompareResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    session_id: Annotated[str, Field(min_length=1)]
    state: Literal[WorkflowState.COMPARE]
    product_ids: Annotated[list[str], Field(min_length=2, max_length=3)]
    rows: ComparisonRows
    simulated: Literal[True]

    @model_validator(mode="after")
    def validate_comparison_shape(self) -> CompareResponse:
        if len(set(self.product_ids)) != len(self.product_ids):
            raise ValueError("comparison product_ids must be distinct")
        column_count = len(self.product_ids)
        if any(
            len(row) != column_count
            for row in (
                self.rows.starting_price_usd,
                self.rows.fragrance_free,
                self.rows.water_resistance_minutes,
                self.rows.finish,
                self.rows.white_cast_risk,
            )
        ):
            raise ValueError("comparison rows must match product_ids")
        return self


class CartPreviewResponse(BaseModel):
    session_id: str
    state: WorkflowState
    sku_id: str
    quantity: int
    unit_price_usd: float
    subtotal_usd: float
    inventory_units: int
    confirmation_token: str
    created_at: datetime
    simulated: Literal[True]


class CartItemResponse(BaseModel):
    cart_id: str
    cart_item_id: str
    session_id: str
    state: WorkflowState
    sku_id: str
    quantity: int
    unit_price_usd: float
    simulated: Literal[True]


class CatalogMediaResponse(BaseModel):
    kind: Literal["video", "image"]
    src: str
    poster_src: str | None
    alt_zh: str
    license_ref: str


class CatalogEngagementResponse(BaseModel):
    likes: int
    comments: int
    favorites: int
    shares: int


class CatalogSkuResponse(BaseModel):
    id: str
    size_ml: int
    price_usd: float
    in_stock: bool
    inventory_units: int
    label: str
    image_src: str


class CatalogShippingResponse(BaseModel):
    market: Literal["US"]
    fee_usd: float
    eta_min_days: int
    eta_max_days: int
    return_summary_zh: str


class CatalogProductResponse(BaseModel):
    id: str
    brand: str
    name: str
    synthetic: Literal[True]
    spf: int
    broad_spectrum: bool
    fragrance_free: bool
    water_resistance_minutes: Literal[40, 80] | None
    finish: Literal["dewy", "natural", "matte"]
    skin_types: list[Literal["dry", "combination", "oily", "sensitive"]]
    white_cast_risk: Literal["low", "medium", "high"]
    active_filter_type: Literal["mineral", "organic", "hybrid"]
    ingredient_highlights: list[str]
    skus: list[CatalogSkuResponse]
    display_name_zh: str
    description_zh: str
    media: CatalogMediaResponse
    shipping: CatalogShippingResponse
    list_price_usd: float
    promotion: str | None
    store_name: str
    facts_version: str
    observed_at: datetime
    expires_at: datetime


class CatalogProductSummary(BaseModel):
    id: str
    brand: str
    name: str
    display_name_zh: str
    starting_price_usd: float
    image_src: str


class CatalogFeedItemResponse(BaseModel):
    id: str
    synthetic: Literal[True]
    creator_handle: str
    creator_display_name: str
    caption_zh: str
    media: CatalogMediaResponse
    engagement: CatalogEngagementResponse
    content_context_id: str | None
    anchor_product_id: str | None
    commerce_status: Literal["none", "available", "unavailable"]
    anchor_product: CatalogProductSummary | None


class FeedResponse(BaseModel):
    feed_tabs: list[str]
    bottom_nav_variant: str
    items: list[CatalogFeedItemResponse]


class CatalogFreshnessResponse(BaseModel):
    facts_version: str
    observed_at: datetime
    expires_at: datetime


class ProductDetailResponse(BaseModel):
    product: CatalogProductResponse
    starting_price_usd: float
    freshness: CatalogFreshnessResponse
    synthetic_disclosure: Literal[True]


class ClaimVerification(BaseModel):
    claim_id: str
    text: str
    status: EvidenceStatus
    evidence_id: str


class ContentContextSummary(BaseModel):
    id: str
    anchor_product_id: str
    anchor_product_name: str
    creator_handle: str
    caption: str
    claims: list[ClaimVerification]


class EvidenceReference(BaseModel):
    evidence_id: str
    title: str
    url: HttpUrl
    source_kind: Literal["public_rule", "synthetic_review_aggregate"]
    synthetic: bool
    status: EvidenceStatus
    summary: str


class RecommendationCard(BaseModel):
    product_id: str
    brand: str
    name: str
    verdict: Verdict
    fit_reasons: list[str]
    tradeoffs: list[str]
    eligible_sku_ids: list[str]
    starting_price_usd: float
    evidence_ids: list[str]

    @model_validator(mode="after")
    def require_evidence_for_positive_verdict(self) -> RecommendationCard:
        if (
            not self.evidence_ids
            and self.verdict is not Verdict.INSUFFICIENT_EVIDENCE
        ):
            raise ValueError(
                "recommendation evidence is required unless verdict is "
                "INSUFFICIENT_EVIDENCE"
            )
        return self


class GuideTranscriptRole(StrEnum):
    USER = "USER"
    ASSISTANT = "ASSISTANT"


class GuideTranscriptKind(StrEnum):
    OPENING = "OPENING"
    USER_TEXT = "USER_TEXT"
    QUESTION = "QUESTION"
    ANSWER = "ANSWER"
    RECOMMENDATION = "RECOMMENDATION"
    COMPARISON = "COMPARISON"
    NO_MATCH = "NO_MATCH"
    SAFETY = "SAFETY"
    RECOVERY = "RECOVERY"


class GuideTranscriptMessage(BaseModel):
    id: Annotated[str, Field(min_length=1)]
    sequence: Annotated[int, Field(gt=0)]
    role: GuideTranscriptRole
    kind: GuideTranscriptKind
    text: Annotated[str, Field(min_length=1)]
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    redacted: bool = False
    quick_replies: list[Annotated[str, Field(min_length=1)]] = Field(
        default_factory=list
    )
    verdict: Verdict | None = None
    recommendations: list[RecommendationCard] = Field(default_factory=list)
    evidence: list[EvidenceReference] = Field(default_factory=list)
    comparison: CompareResponse | None = None

    @field_validator("text")
    @classmethod
    def reject_blank_text(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("transcript text must not be blank")
        return value

    @model_validator(mode="after")
    def validate_role_and_attachments(self) -> GuideTranscriptMessage:
        has_attachments = any(
            (
                self.quick_replies,
                self.verdict is not None,
                self.recommendations,
                self.evidence,
                self.comparison is not None,
            )
        )
        if self.role is GuideTranscriptRole.USER:
            if self.kind is not GuideTranscriptKind.USER_TEXT:
                raise ValueError("USER transcript messages must use USER_TEXT")
            if has_attachments:
                raise ValueError("USER transcript messages must not carry attachments")
        elif self.kind is GuideTranscriptKind.USER_TEXT:
            raise ValueError("ASSISTANT transcript messages must not use USER_TEXT")

        is_comparison = self.kind is GuideTranscriptKind.COMPARISON
        if is_comparison and self.comparison is None:
            raise ValueError("COMPARISON transcript messages require comparison")
        if not is_comparison and self.comparison is not None:
            raise ValueError("comparison is only valid for COMPARISON messages")
        return self


class GuideTurnResponse(BaseModel):
    session_id: str
    trace_id: str
    locale: Literal["en-US", "zh-CN"]
    state: WorkflowState
    kind: Literal[
        "opening",
        "clarification",
        "answer",
        "recommendation",
        "no_match",
        "safety_boundary",
    ]
    text: str
    context: ContentContextSummary
    guide_status: GuideStatus
    guide_view_kind: GuideViewKind
    guide_revision: Annotated[int, Field(ge=1)]
    conversation_revision: Annotated[int, Field(ge=1)] = 1
    facts_snapshot_at: datetime
    allowed_actions: list[GuideAction]
    degraded: bool = False
    verdict: Verdict | None = None
    recommendations: list[RecommendationCard] = Field(default_factory=list)
    evidence: list[EvidenceReference] = Field(default_factory=list)
    quick_replies: list[str] = Field(default_factory=list)
    comparison: CompareResponse | None = None
    transcript: list[GuideTranscriptMessage] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_comparison_view(self) -> GuideTurnResponse:
        if self.transcript:
            transcript_ids = [message.id for message in self.transcript]
            transcript_sequences = [message.sequence for message in self.transcript]
            if len(set(transcript_ids)) != len(transcript_ids):
                raise ValueError("transcript message ids must be unique")
            if any(
                current <= previous
                for previous, current in pairwise(transcript_sequences)
            ):
                raise ValueError("transcript sequences must strictly increase")
            last_assistant = next(
                (
                    message
                    for message in reversed(self.transcript)
                    if message.role is GuideTranscriptRole.ASSISTANT
                ),
                None,
            )
            if last_assistant is not None:
                compatible_views = {
                    GuideTranscriptKind.OPENING: {GuideViewKind.OPENING_CONTEXT},
                    GuideTranscriptKind.QUESTION: {
                        GuideViewKind.CONTEXT_CONFIRMATION,
                        GuideViewKind.WAITING_CLARIFICATION,
                    },
                    GuideTranscriptKind.ANSWER: {GuideViewKind.ANSWER_READY},
                    GuideTranscriptKind.RECOMMENDATION: {
                        GuideViewKind.DECISION_READY,
                        GuideViewKind.INSUFFICIENT_EVIDENCE,
                    },
                    GuideTranscriptKind.COMPARISON: {
                        GuideViewKind.COMPARISON_READY
                    },
                    GuideTranscriptKind.NO_MATCH: {GuideViewKind.NO_MATCH},
                    GuideTranscriptKind.SAFETY: {GuideViewKind.SAFE_BOUNDARY},
                    GuideTranscriptKind.RECOVERY: {
                        GuideViewKind.RECOVERY_REQUIRED
                    },
                }
                if self.guide_view_kind not in compatible_views[last_assistant.kind]:
                    raise ValueError(
                        "last assistant transcript message must match guide view"
                    )
        is_comparison = self.guide_view_kind is GuideViewKind.COMPARISON_READY
        if is_comparison and self.comparison is None:
            raise ValueError("COMPARISON_READY requires comparison")
        if not is_comparison and self.comparison is not None:
            raise ValueError("comparison is only valid for COMPARISON_READY")
        if not is_comparison:
            return self
        if self.state is not WorkflowState.COMPARE:
            raise ValueError("COMPARISON_READY requires COMPARE state")
        if self.comparison is None or self.comparison.session_id != self.session_id:
            raise ValueError("comparison must belong to the Guide session")
        if self.allowed_actions != [
            GuideAction.OPEN_PRODUCT,
            GuideAction.RETURN_TO_FEED,
        ]:
            raise ValueError("COMPARISON_READY requires exact terminal actions")
        return self
