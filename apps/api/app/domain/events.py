from collections.abc import Mapping
from datetime import UTC, datetime
from typing import Any, NoReturn

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.domain.contracts import (
    EntryPoint,
    HardConstraints,
    QueryIntent,
    SoftPreferences,
    WorkflowState,
)

_FORBIDDEN_TRACE_PAYLOAD_KEYS = frozenset({"chain_of_thought"})


class _FrozenDict(dict[str, Any]):
    def _immutable(self, *args: object, **kwargs: object) -> NoReturn:
        raise TypeError("trace payload is immutable")

    __setitem__ = _immutable
    __delitem__ = _immutable
    __ior__ = _immutable
    clear = _immutable
    pop = _immutable
    popitem = _immutable
    setdefault = _immutable
    update = _immutable


class _FrozenList(list[Any]):
    def _immutable(self, *args: object, **kwargs: object) -> NoReturn:
        raise TypeError("trace payload is immutable")

    __setitem__ = _immutable
    __delitem__ = _immutable
    __iadd__ = _immutable
    __imul__ = _immutable
    append = _immutable
    clear = _immutable
    extend = _immutable
    insert = _immutable
    pop = _immutable
    remove = _immutable
    reverse = _immutable
    sort = _immutable


def _freeze_trace_payload(value: Any) -> Any:
    if isinstance(value, Mapping):
        if any(
            isinstance(key, str) and key in _FORBIDDEN_TRACE_PAYLOAD_KEYS for key in value
        ):
            raise ValueError("trace payload must not contain chain_of_thought")
        return _FrozenDict({key: _freeze_trace_payload(item) for key, item in value.items()})
    if isinstance(value, (list, tuple)):
        return _FrozenList(_freeze_trace_payload(item) for item in value)
    return value


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

    @field_validator("payload")
    @classmethod
    def validate_and_freeze_payload(cls, payload: dict[str, Any]) -> dict[str, Any]:
        return _freeze_trace_payload(payload)
