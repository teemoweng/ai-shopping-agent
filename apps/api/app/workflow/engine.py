from math import isfinite
from time import perf_counter

from app.domain.contracts import (
    ClaimVerification,
    ContentContextSummary,
    EvidenceReference,
    EvidenceStatus,
    GuideMessageRequest,
    GuideTurnResponse,
    RecommendationCard,
    Verdict,
    WorkflowState,
)
from app.domain.events import GuideSession
from app.repositories.session_repository import SessionRepository
from app.workflow.agent import (
    clarification_question,
    is_medical_boundary,
    is_urgent_medical_boundary,
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
            state=session.state,
            kind="clarification",
            text=clarification_question(),
            context=self._context(session),
            quick_replies=[
                "Daily commute",
                "40 min water resistance",
                "80 min water resistance",
            ],
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
                state=session.state,
                kind="safety_boundary",
                text=(
                    "I can't diagnose a reaction. Hives, facial swelling, difficulty "
                    "breathing, or possible anaphylaxis can be an emergency. Stop "
                    "using the product and seek emergency medical help now; call "
                    "local emergency services."
                    if urgent
                    else "I can compare labeled sunscreen facts, but I can't "
                    "diagnose, treat, or claim sunscreen cures a disease. Stop "
                    "using a product that is causing a reaction and seek a qualified "
                    "medical professional."
                ),
                context=self._context(session),
            )

        parsed = parse_preferences(request.text)
        session.hard_constraints = parsed.hard
        session.soft_preferences = parsed.soft
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
            self._append_tool_event(
                session,
                "tool_result",
                tool_name="retrieve_evidence",
                argument_summary=evidence_argument_summary,
                result_ids=[],
                duration_ms=self._elapsed_ms(evidence_started_at),
                status="failed",
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
                for field, value in parsed.hard.model_dump().items()
                if value is not None
            ),
            "soft_preference_fields": sorted(
                field
                for field, value in parsed.soft.model_dump().items()
                if value is not None
            ),
            "in_stock_required": parsed.hard.in_stock,
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
            result = self.tools.search_eligible_products(parsed.hard, parsed.soft)
        except Exception:
            self._append_tool_event(
                session,
                "tool_result",
                tool_name="search_eligible_products",
                argument_summary=search_argument_summary,
                result_ids=[],
                duration_ms=self._elapsed_ms(search_started_at),
                status="failed",
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
                state=session.state,
                kind="no_match",
                text=(
                    "No product meets every stated must-have. I won't silently "
                    "relax a hard constraint; change one requirement to continue."
                ),
                context=context,
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
        return GuideTurnResponse(
            session_id=session.id,
            trace_id=session.trace_id,
            state=session.state,
            kind="recommendation",
            text=(
                "These products pass your stated constraints, but there is "
                "insufficient evidence to recommend one."
                if evidence_is_insufficient
                else "These options pass your must-haves. The first is the closest "
                "fit; review the tradeoffs before choosing a size."
            ),
            context=context,
            verdict=(
                Verdict.INSUFFICIENT_EVIDENCE
                if evidence_is_insufficient
                else Verdict.SUITABLE
            ),
            recommendations=cards,
            evidence=evidence,
        )
