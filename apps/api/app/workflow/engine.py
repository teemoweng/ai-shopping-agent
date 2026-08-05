from datetime import datetime
from math import isfinite
from time import perf_counter

from app.domain.contracts import (
    ClaimVerification,
    ContentContextSummary,
    EvidenceReference,
    EvidenceStatus,
    GuideMessageRequest,
    GuideStatus,
    GuideTurnResponse,
    GuideViewKind,
    RecommendationCard,
    Verdict,
    WorkflowState,
)
from app.domain.events import GuideSession
from app.repositories.session_repository import SessionRepository
from app.workflow.agent import (
    allowed_actions_for,
    clarification_question,
    clarification_quick_replies,
    fallback_recommendation_text,
    is_medical_boundary,
    is_urgent_medical_boundary,
    no_match_text,
    recommendation_text,
    safety_boundary_text,
)
from app.workflow.filtering import parse_preferences
from app.workflow.tools import ShoppingTools


class WorkflowEngine:
    def __init__(self, tools: ShoppingTools, sessions: SessionRepository) -> None:
        self.tools = tools
        self.sessions = sessions

    def _context(self, session: GuideSession) -> ContentContextSummary:
        context = self.tools.get_content_context(session.content_context_id or "")
        anchor_product = self.tools.get_product(context.anchor_product_id)
        return ContentContextSummary(
            id=context.id,
            anchor_product_id=context.anchor_product_id,
            anchor_product_name=anchor_product.name,
            creator_handle=context.creator_handle,
            caption=context.caption,
            claims=[
                ClaimVerification(
                    claim_id=claim.id,
                    text=claim.text,
                    status=claim.evidence_status,
                    evidence_id=claim.evidence_id,
                )
                for claim in context.claims
            ],
        )

    def _facts_snapshot_at(self, session: GuideSession) -> datetime:
        context = self.tools.get_content_context(session.content_context_id or "")
        return self.tools.get_product(context.anchor_product_id).observed_at

    @staticmethod
    def _verified_recommendation_text(
        locale: str,
        *,
        evidence_is_insufficient: bool,
    ) -> tuple[str, bool]:
        try:
            primary_text = recommendation_text(
                locale,
                evidence_is_insufficient=evidence_is_insufficient,
            )
        except Exception:  # noqa: BLE001 - deterministic fallback is the boundary
            primary_text = ""
        if primary_text.strip():
            return primary_text, False
        fallback_text = fallback_recommendation_text(
            locale,
            evidence_is_insufficient=evidence_is_insufficient,
        )
        if not fallback_text.strip():
            raise ValueError("verified Guide fallback text must be nonempty")
        return fallback_text, True

    def _transition(self, session: GuideSession, state: WorkflowState) -> None:
        previous = session.state
        session.state = state
        self.sessions.save(session)
        self.sessions.append_event(
            session,
            "state_transition",
            state,
            {"from": previous.value, "to": state.value},
        )

    def _append_tool_event(
        self,
        session: GuideSession,
        event_type: str,
        *,
        tool_name: str,
        argument_summary: dict[str, object],
        result_ids: list[str],
        duration_ms: float,
        status: str,
    ) -> None:
        self.sessions.append_event(
            session,
            event_type,
            session.state,
            {
                "tool_name": tool_name,
                "argument_summary": argument_summary,
                "result_ids": result_ids,
                "duration_ms": duration_ms,
                "status": status,
            },
        )

    def _append_failed_tool_event(
        self,
        session: GuideSession,
        *,
        tool_name: str,
        argument_summary: dict[str, object],
        started_at: float,
    ) -> None:
        try:
            self._append_tool_event(
                session,
                "tool_result",
                tool_name=tool_name,
                argument_summary=argument_summary,
                result_ids=[],
                duration_ms=self._elapsed_ms(started_at),
                status="failed",
            )
        except Exception:  # noqa: BLE001 - preserve the original tool failure
            # Observability must not replace the original business/tool failure.
            return

    @staticmethod
    def _elapsed_ms(started_at: float) -> float:
        elapsed_ms = round((perf_counter() - started_at) * 1000, 3)
        return elapsed_ms if isfinite(elapsed_ms) and elapsed_ms >= 0 else 0.0

    @staticmethod
    def _applicable_evidence_ids(
        product_id: str,
        context: ContentContextSummary,
        evidence: list[EvidenceReference],
    ) -> list[str]:
        claim_evidence_ids = {claim.evidence_id for claim in context.claims}
        return [
            item.evidence_id
            for item in evidence
            if item.source_kind == "public_rule"
            or (
                item.source_kind == "synthetic_review_aggregate"
                and product_id == context.anchor_product_id
                and item.evidence_id in claim_evidence_ids
            )
        ]

    def open_session(self, session: GuideSession) -> GuideTurnResponse:
        self._transition(session, WorkflowState.UNDERSTAND)
        self._transition(session, WorkflowState.CLARIFY)
        return GuideTurnResponse(
            session_id=session.id,
            trace_id=session.trace_id,
            locale=session.locale,
            state=session.state,
            kind="clarification",
            text=clarification_question(session.locale),
            context=self._context(session),
            guide_status=GuideStatus.WAITING_USER,
            guide_view_kind=GuideViewKind.WAITING_CLARIFICATION,
            guide_revision=session.guide_revision,
            facts_snapshot_at=self._facts_snapshot_at(session),
            allowed_actions=allowed_actions_for(
                GuideViewKind.WAITING_CLARIFICATION
            ),
            quick_replies=clarification_quick_replies(session.locale),
        )

    def handle_message(
        self,
        session: GuideSession,
        request: GuideMessageRequest,
    ) -> GuideTurnResponse:
        if is_medical_boundary(request):
            urgent = is_urgent_medical_boundary(request)
            self.sessions.append_event(
                session,
                "safety_boundary",
                session.state,
                {
                    "code": (
                        "URGENT_MEDICAL_SYMPTOM" if urgent else "MEDICAL_DIAGNOSIS"
                    ),
                },
            )
            return GuideTurnResponse(
                session_id=session.id,
                trace_id=session.trace_id,
                locale=session.locale,
                state=session.state,
                kind="safety_boundary",
                text=safety_boundary_text(session.locale, urgent=urgent),
                context=self._context(session),
                guide_status=GuideStatus.SAFE_EXIT,
                guide_view_kind=GuideViewKind.SAFE_BOUNDARY,
                guide_revision=session.guide_revision,
                facts_snapshot_at=self._facts_snapshot_at(session),
                allowed_actions=allowed_actions_for(GuideViewKind.SAFE_BOUNDARY),
            )

        parsed = parse_preferences(request.text)
        merged_hard = session.hard_constraints.model_copy(
            update={
                field: getattr(parsed.hard, field)
                for field in parsed.hard.model_fields_set
            }
        )
        merged_soft = session.soft_preferences.model_copy(
            update={
                field: getattr(parsed.soft, field)
                for field in parsed.soft.model_fields_set
            }
        )
        if (
            session.hard_constraints != merged_hard
            or session.soft_preferences != merged_soft
        ):
            session.hard_constraints = merged_hard
            session.soft_preferences = merged_soft
            session.guide_revision += 1
            self.sessions.save(session)
        self._transition(session, WorkflowState.VERIFY_CURRENT_PRODUCT)
        evidence_argument_summary: dict[str, object] = {
            "content_context_available": session.content_context_id is not None,
            "includes_public_rule_terms": True,
        }
        self._append_tool_event(
            session,
            "tool_call",
            tool_name="retrieve_evidence",
            argument_summary=evidence_argument_summary,
            result_ids=[],
            duration_ms=0.0,
            status="started",
        )
        evidence_started_at = perf_counter()
        try:
            evidence_hits = self.tools.retrieve_evidence(
                request.text + " broad spectrum water resistant"
            )
        except Exception:
            self._append_failed_tool_event(
                session,
                tool_name="retrieve_evidence",
                argument_summary=evidence_argument_summary,
                started_at=evidence_started_at,
            )
            raise
        self._append_tool_event(
            session,
            "tool_result",
            tool_name="retrieve_evidence",
            argument_summary=evidence_argument_summary,
            result_ids=[hit.document.id for hit in evidence_hits],
            duration_ms=self._elapsed_ms(evidence_started_at),
            status="succeeded",
        )
        self._transition(session, WorkflowState.FILTER_AND_RETRIEVE)
        search_argument_summary: dict[str, object] = {
            "hard_constraint_fields": sorted(
                field
                for field, value in session.hard_constraints.model_dump().items()
                if value is not None
            ),
            "soft_preference_fields": sorted(
                field
                for field, value in session.soft_preferences.model_dump().items()
                if value is not None
            ),
            "in_stock_required": session.hard_constraints.in_stock,
        }
        self._append_tool_event(
            session,
            "tool_call",
            tool_name="search_eligible_products",
            argument_summary=search_argument_summary,
            result_ids=[],
            duration_ms=0.0,
            status="started",
        )
        search_started_at = perf_counter()
        try:
            result = self.tools.search_eligible_products(
                session.hard_constraints,
                session.soft_preferences,
            )
        except Exception:
            self._append_failed_tool_event(
                session,
                tool_name="search_eligible_products",
                argument_summary=search_argument_summary,
                started_at=search_started_at,
            )
            raise
        self._append_tool_event(
            session,
            "tool_result",
            tool_name="search_eligible_products",
            argument_summary=search_argument_summary,
            result_ids=[candidate.product.id for candidate in result.eligible],
            duration_ms=self._elapsed_ms(search_started_at),
            status="succeeded",
        )
        self._transition(session, WorkflowState.PRESENT_RECOMMENDATION)
        evidence = [
            EvidenceReference(
                evidence_id=hit.document.id,
                title=hit.document.title,
                url=hit.document.url,
                source_kind=hit.document.source_kind,
                synthetic=hit.document.synthetic,
                status=(
                    EvidenceStatus.SUBJECTIVE_MIXED
                    if hit.document.synthetic
                    else EvidenceStatus.SUPPORTED
                ),
                summary=hit.document.summary,
            )
            for hit in evidence_hits
        ]
        context = self._context(session)
        if not result.eligible:
            return GuideTurnResponse(
                session_id=session.id,
                trace_id=session.trace_id,
                locale=session.locale,
                state=session.state,
                kind="no_match",
                text=no_match_text(session.locale),
                context=context,
                guide_status=GuideStatus.WAITING_USER,
                guide_view_kind=GuideViewKind.NO_MATCH,
                guide_revision=session.guide_revision,
                facts_snapshot_at=self._facts_snapshot_at(session),
                allowed_actions=allowed_actions_for(GuideViewKind.NO_MATCH),
                verdict=Verdict.NOT_RECOMMENDED,
                evidence=evidence,
            )

        cards = []
        for candidate in result.eligible[:3]:
            product = candidate.product
            evidence_ids = self._applicable_evidence_ids(
                product.id,
                context,
                evidence,
            )
            cards.append(
                RecommendationCard(
                    product_id=product.id,
                    brand=product.brand,
                    name=product.name,
                    verdict=(
                        Verdict.INSUFFICIENT_EVIDENCE
                        if not evidence_ids
                        else (
                            Verdict.SUITABLE
                            if candidate is result.eligible[0]
                            else Verdict.CONDITIONAL
                        )
                    ),
                    fit_reasons=list(candidate.reasons)
                    or ["meets every stated hard constraint"],
                    tradeoffs=[
                        f"{product.finish} finish",
                        f"{product.white_cast_risk} white-cast risk",
                    ],
                    eligible_sku_ids=[sku.id for sku in candidate.eligible_skus],
                    starting_price_usd=min(
                        sku.price_usd for sku in candidate.eligible_skus
                    ),
                    evidence_ids=evidence_ids,
                )
            )
        session.recommended_product_ids = [card.product_id for card in cards]
        session.eligible_sku_ids_by_product = {
            card.product_id: list(card.eligible_sku_ids) for card in cards
        }
        self.sessions.save(session)
        evidence_is_insufficient = not any(card.evidence_ids for card in cards)
        guide_view_kind = (
            GuideViewKind.INSUFFICIENT_EVIDENCE
            if evidence_is_insufficient
            else GuideViewKind.DECISION_READY
        )
        response_text, degraded = self._verified_recommendation_text(
            session.locale,
            evidence_is_insufficient=evidence_is_insufficient,
        )
        return GuideTurnResponse(
            session_id=session.id,
            trace_id=session.trace_id,
            locale=session.locale,
            state=session.state,
            kind="recommendation",
            text=response_text,
            context=context,
            guide_status=(
                GuideStatus.WAITING_USER
                if evidence_is_insufficient
                else GuideStatus.ACTIVE
            ),
            guide_view_kind=guide_view_kind,
            guide_revision=session.guide_revision,
            facts_snapshot_at=self._facts_snapshot_at(session),
            allowed_actions=allowed_actions_for(guide_view_kind),
            degraded=degraded,
            verdict=(
                Verdict.INSUFFICIENT_EVIDENCE
                if evidence_is_insufficient
                else Verdict.SUITABLE
            ),
            recommendations=cards,
            evidence=evidence,
        )
