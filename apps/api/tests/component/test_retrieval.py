from pathlib import Path

from app.repositories.fixture_repository import FixtureRepository
from app.workflow.retrieval import retrieve_evidence

FIXTURE_ROOT = Path(__file__).parents[4] / "data" / "fixtures"


def test_water_resistance_query_returns_labeling_evidence_first() -> None:
    documents = FixtureRepository.load(FIXTURE_ROOT).list_evidence()
    hits = retrieve_evidence("Is this waterproof for an 80 minute swim?", documents)
    assert hits[0].document.id == "fda-water-resistance-labeling"
    assert hits[0].matched_terms >= {"80", "waterproof"}


def test_retrieval_is_stable_for_identical_input() -> None:
    documents = FixtureRepository.load(FIXTURE_ROOT).list_evidence()
    first = retrieve_evidence("broad spectrum SPF directions", documents)
    second = retrieve_evidence("broad spectrum SPF directions", documents)
    assert [hit.document.id for hit in first] == [hit.document.id for hit in second]
