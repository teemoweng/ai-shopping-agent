from __future__ import annotations

import hashlib
import json
from copy import deepcopy
from uuid import uuid4

from pydantic import BaseModel

from app.domain.contracts import (
    GuideMessageRequest,
    GuideTranscriptKind,
    GuideTranscriptMessage,
    GuideTranscriptRole,
    GuideTurnResponse,
    GuideViewKind,
)
from app.domain.events import GuideSession

MAX_USER_TURNS = 12
_REDACTED_HEALTH_TEXT = "已隐藏一条健康相关描述"

_TRANSCRIPT_KIND_BY_VIEW = {
    GuideViewKind.OPENING_CONTEXT: GuideTranscriptKind.OPENING,
    GuideViewKind.CONTEXT_CONFIRMATION: GuideTranscriptKind.QUESTION,
    GuideViewKind.WAITING_CLARIFICATION: GuideTranscriptKind.QUESTION,
    GuideViewKind.ANSWER_READY: GuideTranscriptKind.ANSWER,
    GuideViewKind.DECISION_READY: GuideTranscriptKind.RECOMMENDATION,
    GuideViewKind.INSUFFICIENT_EVIDENCE: GuideTranscriptKind.RECOMMENDATION,
    GuideViewKind.COMPARISON_READY: GuideTranscriptKind.COMPARISON,
    GuideViewKind.NO_MATCH: GuideTranscriptKind.NO_MATCH,
    GuideViewKind.SAFE_BOUNDARY: GuideTranscriptKind.SAFETY,
    GuideViewKind.RECOVERY_REQUIRED: GuideTranscriptKind.RECOVERY,
}


def request_digest(payload: object) -> str:
    if isinstance(payload, BaseModel):
        payload = payload.model_dump(mode="json")
    canonical_json = json.dumps(
        payload,
        ensure_ascii=False,
        allow_nan=False,
        separators=(",", ":"),
        sort_keys=True,
    )
    return hashlib.sha256(canonical_json.encode("utf-8")).hexdigest()


def _message_id() -> str:
    return f"gmsg_{uuid4()}"


def _next_sequence(session: GuideSession) -> int:
    if not session.transcript:
        return 1
    return session.transcript[-1].sequence + 1


def _assistant_message(
    response: GuideTurnResponse,
    *,
    sequence: int,
) -> GuideTranscriptMessage:
    try:
        kind = _TRANSCRIPT_KIND_BY_VIEW[response.guide_view_kind]
    except KeyError as error:
        raise ValueError(
            f"guide view {response.guide_view_kind} cannot be committed to transcript"
        ) from error
    return GuideTranscriptMessage(
        id=_message_id(),
        sequence=sequence,
        role=GuideTranscriptRole.ASSISTANT,
        kind=kind,
        text=response.text,
        quick_replies=deepcopy(response.quick_replies),
        verdict=response.verdict,
        recommendations=[item.model_copy(deep=True) for item in response.recommendations],
        evidence=[item.model_copy(deep=True) for item in response.evidence],
        comparison=(
            response.comparison.model_copy(deep=True)
            if response.comparison is not None
            else None
        ),
    )


def opening_message(response: GuideTurnResponse) -> GuideTranscriptMessage:
    return _assistant_message(response, sequence=1)


def append_assistant(
    session: GuideSession,
    response: GuideTurnResponse,
) -> GuideTurnResponse:
    session.transcript.append(
        _assistant_message(response, sequence=_next_sequence(session))
    )
    return attach_conversation(session, response)


def append_exchange(
    session: GuideSession,
    request: GuideMessageRequest,
    response: GuideTurnResponse,
    *,
    redact_user: bool,
) -> GuideTurnResponse:
    user_sequence = _next_sequence(session)
    user_message = GuideTranscriptMessage(
        id=_message_id(),
        sequence=user_sequence,
        role=GuideTranscriptRole.USER,
        kind=GuideTranscriptKind.USER_TEXT,
        text=_REDACTED_HEALTH_TEXT if redact_user else request.text,
        redacted=redact_user,
    )
    session.transcript.append(user_message)
    session.conversation_revision += 1
    return append_assistant(session, response)


def attach_conversation(
    session: GuideSession,
    response: GuideTurnResponse,
) -> GuideTurnResponse:
    payload = response.model_dump()
    payload["conversation_revision"] = session.conversation_revision
    payload["transcript"] = [
        message.model_copy(deep=True) for message in session.transcript
    ]
    return GuideTurnResponse.model_validate(payload)
