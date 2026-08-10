from app.domain.contracts import (
    CreateGuideSessionRequest,
    EntryPoint,
    GuideAction,
    GuideMessageRequest,
    GuideTranscriptRole,
    GuideTurnResponse,
)
from app.domain.events import ProcessedGuideRequest
from app.repositories.session_repository import SessionRepository
from app.services.guide_conversation import (
    MAX_USER_TURNS,
    append_exchange,
    attach_conversation,
    opening_message,
    request_digest,
)
from app.workflow.agent import is_medical_boundary
from app.workflow.engine import WorkflowEngine

_MESSAGE_CAPABLE_ACTIONS = frozenset(
    {
        GuideAction.SEND_MESSAGE,
        GuideAction.CONFIRM_CONTEXT,
        GuideAction.ANSWER_CLARIFICATION,
        GuideAction.SKIP_CLARIFICATION,
        GuideAction.UPDATE_CONSTRAINTS,
        GuideAction.RELAX_CONSTRAINT,
        GuideAction.CONTINUE_WITH_KNOWN,
    }
)


class GuideConflict(Exception):
    def __init__(self, code: str) -> None:
        self.code = code
        super().__init__(code)


class GuideService:
    def __init__(self, engine: WorkflowEngine, sessions: SessionRepository) -> None:
        self.engine = engine
        self.sessions = sessions

    def create(self, request: CreateGuideSessionRequest) -> GuideTurnResponse:
        if request.entry_point is EntryPoint.SEARCH:
            raise NotImplementedError("SEARCH_EXECUTION_NOT_AVAILABLE")
        with self.sessions.transaction():
            self.engine.tools.get_content_context(request.content_context_id or "")
            session = self.sessions.create(
                request.entry_point,
                request.content_context_id,
                request.search_query,
                locale=request.locale,
            )
            response = self.engine.open_session(session)
            session.transcript.append(opening_message(response))
            response = attach_conversation(session, response)
            return self.sessions.save_snapshot(session, response)

    def message(
        self,
        session_id: str,
        request: GuideMessageRequest,
    ) -> GuideTurnResponse:
        with self.sessions.transaction():
            session = self.sessions.get(session_id)
            digest = request_digest(request)
            processed = session.processed_guide_requests.get(request.message_id)
            if processed is not None:
                if (
                    processed.request_kind == "MESSAGE"
                    and processed.payload_digest == digest
                ):
                    return attach_conversation(
                        session,
                        self.sessions.get_snapshot(session_id),
                    )
                raise GuideConflict("MESSAGE_ID_REUSED")
            if (
                request.expected_conversation_revision is not None
                and request.expected_conversation_revision
                != session.conversation_revision
            ):
                raise GuideConflict("STALE_CONVERSATION")
            user_turn_count = sum(
                message.role is GuideTranscriptRole.USER
                for message in session.transcript
            )
            if user_turn_count >= MAX_USER_TURNS:
                raise GuideConflict("CONVERSATION_LIMIT_REACHED")
            snapshot = session.latest_response
            if snapshot is None or _MESSAGE_CAPABLE_ACTIONS.isdisjoint(
                snapshot.allowed_actions
            ):
                raise GuideConflict("ACTION_NOT_ALLOWED")
            response = self.engine.handle_message(session, request)
            response = append_exchange(
                session,
                request,
                response,
                redact_user=is_medical_boundary(request),
            )
            session.processed_guide_requests[request.message_id] = (
                ProcessedGuideRequest(
                    request_kind="MESSAGE",
                    payload_digest=digest,
                    result_conversation_revision=session.conversation_revision,
                )
            )
            return self.sessions.save_snapshot(session, response)

    def get(self, session_id: str) -> GuideTurnResponse:
        return self.sessions.get_snapshot(session_id)
