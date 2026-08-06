from __future__ import annotations

from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import dataclass
from pathlib import Path
from threading import RLock, local
from typing import Literal
from uuid import uuid4

from app.domain.contracts import EntryPoint, GuideTurnResponse, WorkflowState
from app.domain.events import GuideSession, TraceEvent


@dataclass(frozen=True)
class _RepositorySnapshot:
    sessions: dict[str, GuideSession]
    events: list[TraceEvent]
    trace_existed: bool
    trace_length: int


class SessionRepository:
    def __init__(self, trace_path: Path) -> None:
        self._sessions: dict[str, GuideSession] = {}
        self._events: list[TraceEvent] = []
        self._trace_path = trace_path
        self._lock = RLock()
        self._transaction_state = local()

    @contextmanager
    def transaction(self) -> Iterator[None]:
        """Make the outermost in-memory transition and trace writes atomic."""
        with self._lock:
            depth = getattr(self._transaction_state, "depth", 0)
            is_outermost = depth == 0
            snapshot = self._capture_snapshot() if is_outermost else None
            self._transaction_state.depth = depth + 1
            try:
                yield
            except BaseException as error:
                if snapshot is not None:
                    try:
                        self._restore_snapshot(snapshot)
                    except BaseException as rollback_error:
                        raise error from rollback_error
                raise
            finally:
                self._transaction_state.depth = depth

    def _capture_snapshot(self) -> _RepositorySnapshot:
        trace_existed = self._trace_path.exists()
        return _RepositorySnapshot(
            sessions={
                session_id: session.model_copy(deep=True)
                for session_id, session in self._sessions.items()
            },
            events=[
                TraceEvent.model_validate_json(event.model_dump_json())
                for event in self._events
            ],
            trace_existed=trace_existed,
            trace_length=self._trace_path.stat().st_size if trace_existed else 0,
        )

    @staticmethod
    def _restore_session(target: GuideSession, snapshot: GuideSession) -> None:
        restored = snapshot.model_copy(deep=True)
        for field_name in GuideSession.model_fields:
            setattr(target, field_name, getattr(restored, field_name))
        target.__pydantic_fields_set__ = set(restored.__pydantic_fields_set__)

    def _restore_snapshot(self, snapshot: _RepositorySnapshot) -> None:
        current_sessions = self._sessions
        restored_sessions: dict[str, GuideSession] = {}
        for session_id, saved_session in snapshot.sessions.items():
            current_session = current_sessions.get(session_id)
            if current_session is None:
                current_session = saved_session.model_copy(deep=True)
            else:
                self._restore_session(current_session, saved_session)
            restored_sessions[session_id] = current_session
        self._sessions = restored_sessions
        self._events = [
            TraceEvent.model_validate_json(event.model_dump_json())
            for event in snapshot.events
        ]
        if snapshot.trace_existed:
            if self._trace_path.stat().st_size != snapshot.trace_length:
                with self._trace_path.open("r+b") as stream:
                    stream.truncate(snapshot.trace_length)
        else:
            self._trace_path.unlink(missing_ok=True)

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
