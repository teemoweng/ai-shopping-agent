from fastapi import APIRouter, HTTPException, status

from app.dependencies import engine, sessions
from app.domain.contracts import (
    CreateGuideSessionRequest,
    GuideMessageRequest,
    GuideTurnResponse,
)
from app.services.guide_service import GuideService

router = APIRouter(prefix="/guide", tags=["guide"])
service = GuideService(engine, sessions)


@router.post(
    "/sessions",
    response_model=GuideTurnResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_session(request: CreateGuideSessionRequest) -> GuideTurnResponse:
    try:
        return service.create(request)
    except NotImplementedError as error:
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail={
                "code": str(error),
                "message": "Search entry is contract-only in this foundation slice.",
            },
        ) from error
    except KeyError as error:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "code": "CONTENT_CONTEXT_NOT_FOUND",
                "message": "Content context does not exist.",
            },
        ) from error


@router.post("/sessions/{session_id}/messages", response_model=GuideTurnResponse)
def post_message(
    session_id: str,
    request: GuideMessageRequest,
) -> GuideTurnResponse:
    try:
        return service.message(session_id, request)
    except KeyError as error:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "code": "SESSION_NOT_FOUND",
                "message": "Guide session does not exist.",
            },
        ) from error
