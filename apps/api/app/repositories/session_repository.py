from __future__ import annotations

from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path
from threading import RLock
from typing import Literal
from uuid import uuid4

from app.domain.contracts import EntryPoint, GuideTurnResponse, WorkflowState
from app.domain.events import GuideSession, TraceEvent


class SessionRepository:
    def __init__(self, trace_path: Path) -> None:
        self._sessions: dict[str, GuideSession] = {}
        self._events: list[TraceEvent] = []
        self._trace_path = trace_path
        self._lock = RLock()

    @contextmanager
    def transaction(self) -> Iterator[None]:
        """Keep one in-memory session transition and its trace writes atomic."""
        with self._lock:
            yield

    def create(
        self,
        entry_point: EntryPoint,
        content_context_id: str | None,
        search_query: str | None,
        locale: Literal["en-US", "zh-CN"] = "en-US",
    ) -> GuideSession:
        with self._lock:
            session = GuideSession(
                id=f"ses_{uuid4()}",
                trace_id=f"trc_{uuid4()}",
                entry_point=entry_point,
                content_context_id=content_context_id,
                search_query=search_query,
                locale=locale,
            )
            self._sessions[session.id] = session
            return session

    def get(self, session_id: str) -> GuideSession:
        with self._lock:
            return self._sessions[session_id]

    def save(self, session: GuideSession) -> GuideSession:
        with self._lock:
            self._sessions[session.id] = session
            return session

    def save_snapshot(
        self,
        session: GuideSession,
        response: GuideTurnResponse,
    ) -> GuideTurnResponse:
        with self._lock:
            snapshot = response.model_copy(deep=True)
            session.latest_response = snapshot
            self.save(session)
            return snapshot.model_copy(deep=True)

    def get_snapshot(self, session_id: str) -> GuideTurnResponse:
        with self._lock:
            snapshot = self.get(session_id).latest_response
            if snapshot is None:
                raise KeyError(session_id)
            return snapshot.model_copy(deep=True)

    def append_event(
        self,
        session: GuideSession,
        event_type: str,
        state: WorkflowState,
        payload: dict[str, object],
    ) -> TraceEvent:
        with self._lock:
            event = TraceEvent(
                event_id=f"evt_{uuid4()}",
                trace_id=session.trace_id,
                session_id=session.id,
                event_type=event_type,
                state=state,
                payload=payload,
            )
            self._trace_path.parent.mkdir(parents=True, exist_ok=True)
            with self._trace_path.open("a", encoding="utf-8") as stream:
                stream.write(event.model_dump_json() + "\n")
            self._events.append(event)
            return event

    def events_for_trace(self, trace_id: str) -> tuple[TraceEvent, ...]:
        with self._lock:
            return tuple(event for event in self._events if event.trace_id == trace_id)
