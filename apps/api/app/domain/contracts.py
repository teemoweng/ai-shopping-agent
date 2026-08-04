from __future__ import annotations

from enum import StrEnum
from typing import Annotated, Literal

from pydantic import BaseModel, Field, model_validator
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
    entry_point: EntryPoint
    content_context_id: str | None = None
    search_query: Annotated[str | None, Field(min_length=2, max_length=200)] = None

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
                    },
                    "required": ["entry_point", "content_context_id"],
                    "type": "object",
                },
                {
                    "additionalProperties": False,
                    "properties": {
                        "entry_point": {"const": "search", "type": "string"},
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


class CartPreviewRequest(BaseModel):
    sku_id: str
    quantity: Annotated[int, Field(ge=1, le=5)] = 1


class AddCartItemRequest(BaseModel):
    confirmation_token: str
