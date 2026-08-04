from datetime import UTC, datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from app.domain.contracts import (
    EntryPoint,
    HardConstraints,
    QueryIntent,
    SoftPreferences,
    WorkflowState,
)


class GuideSession(BaseModel):
    id: str
    trace_id: str
    entry_point: EntryPoint
    content_context_id: str | None
    search_query: str | None
    query_intent: QueryIntent | None = None
    state: WorkflowState = WorkflowState.ENTRY_INGEST
    hard_constraints: HardConstraints = Field(default_factory=HardConstraints)
    soft_preferences: SoftPreferences = Field(default_factory=SoftPreferences)
    recommended_product_ids: list[str] = Field(default_factory=list)
    eligible_sku_ids_by_product: dict[str, list[str]] = Field(default_factory=dict)
    consumed_confirmation_tokens: set[str] = Field(default_factory=set)


class TraceEvent(BaseModel):
    model_config = ConfigDict(frozen=True)

    event_id: str
    trace_id: str
    session_id: str
    event_type: str
    state: WorkflowState
    timestamp: datetime = Field(default_factory=lambda: datetime.now(UTC))
    payload: dict[str, Any]
