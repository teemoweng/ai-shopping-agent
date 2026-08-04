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
from app.workflow.agent import clarification_question, is_medical_boundary
from app.workflow.filtering import parse_preferences
from app.workflow.tools import ShoppingTools


class WorkflowEngine:
    def __init__(self, tools: ShoppingTools, sessions: SessionRepository) -> None:
        self.tools = tools
        self.sessions = sessions

    def _context(self, session: GuideSession) -> ContentContextSummary:
        context = self.tools.get_content_context(session.content_context_id or "")
        return ContentContextSummary(
            id=context.id,
            anchor_product_id=context.anchor_product_id,
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
            self.sessions.append_event(
                session,
                "safety_boundary",
                session.state,
                {"message_id": request.message_id, "code": "MEDICAL_DIAGNOSIS"},
            )
            return GuideTurnResponse(
                session_id=session.id,
                trace_id=session.trace_id,
                state=session.state,
                kind="safety_boundary",
                text=(
                    "I can compare labeled sunscreen facts, but I can't diagnose "
                    "or treat a rash. Stop using a product that is causing burning "
                    "and seek a qualified medical professional."
                ),
                context=self._context(session),
            )

        parsed = parse_preferences(request.text)
        session.hard_constraints = parsed.hard
        session.soft_preferences = parsed.soft
        self._transition(session, WorkflowState.VERIFY_CURRENT_PRODUCT)
        evidence_hits = self.tools.retrieve_evidence(
            request.text + " broad spectrum water resistant"
        )
        self._transition(session, WorkflowState.FILTER_AND_RETRIEVE)
        result = self.tools.search_eligible_products(parsed.hard, parsed.soft)
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
                context=self._context(session),
                verdict=Verdict.NOT_RECOMMENDED,
                evidence=evidence,
            )

        cards = []
        for candidate in result.eligible[:3]:
            product = candidate.product
            cards.append(
                RecommendationCard(
                    product_id=product.id,
                    brand=product.brand,
                    name=product.name,
                    verdict=(
                        Verdict.SUITABLE
                        if candidate is result.eligible[0]
                        else Verdict.CONDITIONAL
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
                    evidence_ids=[item.evidence_id for item in evidence],
                )
            )
        session.recommended_product_ids = [card.product_id for card in cards]
        session.eligible_sku_ids_by_product = {
            card.product_id: list(card.eligible_sku_ids) for card in cards
        }
        self.sessions.save(session)
        return GuideTurnResponse(
            session_id=session.id,
            trace_id=session.trace_id,
            state=session.state,
            kind="recommendation",
            text=(
                "These options pass your must-haves. The first is the closest fit; "
                "review the tradeoffs before choosing a size."
            ),
            context=self._context(session),
            verdict=Verdict.SUITABLE,
            recommendations=cards,
            evidence=evidence,
        )
