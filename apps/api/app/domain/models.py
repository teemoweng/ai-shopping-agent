from datetime import date
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, HttpUrl

from app.domain.contracts import EvidenceStatus


class Sku(BaseModel):
    model_config = ConfigDict(frozen=True)

    id: str
    size_ml: Annotated[int, Field(gt=0)]
    price_usd: Annotated[float, Field(gt=0)]
    in_stock: bool
    inventory_units: Annotated[int, Field(ge=0)]


class Product(BaseModel):
    model_config = ConfigDict(frozen=True)

    id: str
    brand: str
    name: str
    synthetic: Literal[True]
    spf: Annotated[int, Field(ge=15, le=100)]
    broad_spectrum: bool
    fragrance_free: bool
    water_resistance_minutes: Literal[40, 80] | None
    finish: Literal["dewy", "natural", "matte"]
    skin_types: tuple[Literal["dry", "combination", "oily", "sensitive"], ...]
    white_cast_risk: Literal["low", "medium", "high"]
    active_filter_type: Literal["mineral", "organic", "hybrid"]
    ingredient_highlights: tuple[str, ...]
    skus: tuple[Sku, ...]


class ContentClaim(BaseModel):
    model_config = ConfigDict(frozen=True)

    id: str
    text: str
    evidence_status: EvidenceStatus
    evidence_id: str


class ContentContext(BaseModel):
    model_config = ConfigDict(frozen=True)

    id: str
    synthetic: Literal[True]
    creator_handle: str
    caption: str
    anchor_product_id: str
    transcript_excerpt: str
    claims: tuple[ContentClaim, ...]


class EvidenceDocument(BaseModel):
    model_config = ConfigDict(frozen=True)

    id: str
    authority: str
    source_kind: Literal["public_rule", "synthetic_review_aggregate"]
    synthetic: bool
    title: str
    url: HttpUrl
    accessed_on: date
    jurisdiction: Literal["US"]
    topics: tuple[str, ...]
    summary: str
