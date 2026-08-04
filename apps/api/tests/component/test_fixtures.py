import json
from pathlib import Path
from shutil import copytree

import pytest

from app.repositories.fixture_repository import FixtureRepository

FIXTURE_ROOT = Path(__file__).parents[4] / "data" / "fixtures"


def test_fixture_bundle_has_vertical_slice_coverage() -> None:
    repository = FixtureRepository.load(FIXTURE_ROOT)
    assert len(repository.products) == 3
    assert sum(len(product.skus) for product in repository.products.values()) == 6
    assert len(repository.content_contexts) == 1
    assert len(repository.evidence_documents) >= 3


def test_all_business_records_are_explicitly_synthetic() -> None:
    repository = FixtureRepository.load(FIXTURE_ROOT)
    assert all(product.synthetic for product in repository.products.values())
    assert all(context.synthetic for context in repository.content_contexts.values())


def test_context_references_existing_product_and_evidence() -> None:
    repository = FixtureRepository.load(FIXTURE_ROOT)
    context = repository.get_content_context("morning-routine-uv-001")
    assert repository.get_product(context.anchor_product_id).id == "seoul-shade-daily-fluid"
    evidence_ids = set(repository.evidence_documents)
    assert {claim.evidence_id for claim in context.claims} <= evidence_ids


def test_fixture_exercises_every_claim_evidence_state() -> None:
    repository = FixtureRepository.load(FIXTURE_ROOT)
    context = repository.get_content_context("morning-routine-uv-001")
    assert {claim.evidence_status.value for claim in context.claims} == {
        "SUPPORTED",
        "CONFLICTING",
        "INSUFFICIENT_EVIDENCE",
        "SUBJECTIVE_MIXED",
    }


def test_sku_ids_are_unique_and_price_is_positive() -> None:
    repository = FixtureRepository.load(FIXTURE_ROOT)
    skus = [sku for product in repository.products.values() for sku in product.skus]
    assert len({sku.id for sku in skus}) == len(skus)
    assert all(sku.price_usd > 0 for sku in skus)


@pytest.mark.parametrize(
    ("filename", "error_message"),
    [
        ("products.json", "duplicate product id"),
        ("content-contexts.json", "duplicate content context id"),
        ("evidence.json", "duplicate evidence id"),
    ],
)
def test_fixture_repository_rejects_duplicate_top_level_ids(
    tmp_path: Path, filename: str, error_message: str
) -> None:
    fixture_root = copytree(FIXTURE_ROOT, tmp_path / "fixtures")
    fixture_path = fixture_root / filename
    records = json.loads(fixture_path.read_text())
    records.append(records[0])
    fixture_path.write_text(json.dumps(records))

    with pytest.raises(ValueError, match=error_message):
        FixtureRepository.load(fixture_root)
