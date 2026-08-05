from __future__ import annotations

from datetime import datetime
from enum import StrEnum
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, HttpUrl, model_validator
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


class CompareRequest(BaseModel):
    product_ids: Annotated[list[str], Field(min_length=2, max_length=3)]

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


class CompareResponse(BaseModel):
    session_id: str
    state: WorkflowState
    product_ids: list[str]
    rows: dict[str, list[str | int | float | bool | None]]
    simulated: Literal[True]


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


class GuideTurnResponse(BaseModel):
    session_id: str
    trace_id: str
    locale: Literal["en-US", "zh-CN"]
    state: WorkflowState
    kind: Literal[
        "opening",
        "clarification",
        "recommendation",
        "no_match",
        "safety_boundary",
    ]
    text: str
    context: ContentContextSummary
    guide_status: GuideStatus
    guide_view_kind: GuideViewKind
    guide_revision: Annotated[int, Field(ge=1)]
    facts_snapshot_at: datetime
    allowed_actions: list[GuideAction]
    degraded: bool = False
    verdict: Verdict | None = None
    recommendations: list[RecommendationCard] = Field(default_factory=list)
    evidence: list[EvidenceReference] = Field(default_factory=list)
    quick_replies: list[str] = Field(default_factory=list)
