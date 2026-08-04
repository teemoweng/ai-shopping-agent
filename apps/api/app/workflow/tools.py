from dataclasses import dataclass

from app.domain.contracts import HardConstraints, SoftPreferences
from app.repositories.fixture_repository import FixtureRepository
from app.workflow.filtering import FilterResult, filter_and_rank
from app.workflow.retrieval import EvidenceHit, retrieve_evidence


@dataclass(frozen=True)
class ShoppingTools:
    fixtures: FixtureRepository

    def get_content_context(self, context_id: str):
        return self.fixtures.get_content_context(context_id)

    def get_product(self, product_id: str):
        return self.fixtures.get_product(product_id)

    def search_eligible_products(
        self,
        hard: HardConstraints,
        soft: SoftPreferences,
    ) -> FilterResult:
        return filter_and_rank(self.fixtures.products.values(), hard, soft)

    def retrieve_evidence(self, query: str) -> tuple[EvidenceHit, ...]:
        return retrieve_evidence(query, self.fixtures.list_evidence())
