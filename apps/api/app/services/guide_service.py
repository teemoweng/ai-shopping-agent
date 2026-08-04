from app.domain.contracts import (
    CreateGuideSessionRequest,
    EntryPoint,
    GuideMessageRequest,
    GuideTurnResponse,
)
from app.repositories.session_repository import SessionRepository
from app.workflow.engine import WorkflowEngine


class GuideService:
    def __init__(self, engine: WorkflowEngine, sessions: SessionRepository) -> None:
        self.engine = engine
        self.sessions = sessions

    def create(self, request: CreateGuideSessionRequest) -> GuideTurnResponse:
        if request.entry_point is EntryPoint.SEARCH:
            raise NotImplementedError("SEARCH_EXECUTION_NOT_AVAILABLE")
        self.engine.tools.get_content_context(request.content_context_id or "")
        session = self.sessions.create(
            request.entry_point,
            request.content_context_id,
            request.search_query,
        )
        return self.engine.open_session(session)

    def message(
        self,
        session_id: str,
        request: GuideMessageRequest,
    ) -> GuideTurnResponse:
        session = self.sessions.get(session_id)
        return self.engine.handle_message(session, request)
