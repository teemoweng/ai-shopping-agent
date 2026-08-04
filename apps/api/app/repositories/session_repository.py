from __future__ import annotations

from pathlib import Path
from uuid import uuid4

from app.domain.contracts import EntryPoint, WorkflowState
from app.domain.events import GuideSession, TraceEvent


class SessionRepository:
    def __init__(self, trace_path: Path) -> None:
        self._sessions: dict[str, GuideSession] = {}
        self._events: list[TraceEvent] = []
        self._trace_path = trace_path

    def create(
        self,
        entry_point: EntryPoint,
        content_context_id: str | None,
        search_query: str | None,
    ) -> GuideSession:
        session = GuideSession(
            id=f"ses_{uuid4()}",
            trace_id=f"trc_{uuid4()}",
            entry_point=entry_point,
            content_context_id=content_context_id,
            search_query=search_query,
        )
        self._sessions[session.id] = session
        return session

    def get(self, session_id: str) -> GuideSession:
        return self._sessions[session_id]

    def save(self, session: GuideSession) -> GuideSession:
        self._sessions[session.id] = session
        return session

    def append_event(
        self,
        session: GuideSession,
        event_type: str,
        state: WorkflowState,
        payload: dict[str, object],
    ) -> TraceEvent:
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
        return tuple(event for event in self._events if event.trace_id == trace_id)
