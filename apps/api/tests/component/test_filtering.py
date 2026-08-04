from pathlib import Path

from app.domain.contracts import HardConstraints, SoftPreferences
from app.repositories.fixture_repository import FixtureRepository
from app.workflow.filtering import filter_and_rank, parse_preferences

FIXTURE_ROOT = Path(__file__).parents[4] / "data" / "fixtures"


def test_parser_extracts_supported_hard_and_soft_preferences() -> None:
    parsed = parse_preferences(
        "Under $20, fragrance-free, matte if possible, and I need 40 minutes water resistance"
    )
    assert parsed.hard == HardConstraints(
        max_price_usd=20,
        fragrance_free=True,
        water_resistance_minutes=40,
        in_stock=True,
    )
    assert parsed.soft.finish == "matte"


def test_hard_filter_runs_before_soft_ranking() -> None:
    products = FixtureRepository.load(FIXTURE_ROOT).products.values()
    result = filter_and_rank(
        products,
        HardConstraints(max_price_usd=20, fragrance_free=True, water_resistance_minutes=40),
        SoftPreferences(finish="dewy"),
    )
    assert [candidate.product.id for candidate in result.eligible] == ["cloud-veil-mineral"]
    assert "seoul-shade-daily-fluid" in result.exclusions
    assert "water resistance below 40 minutes" in result.exclusions["seoul-shade-daily-fluid"]


def test_impossible_constraints_return_explicit_zero_match() -> None:
    products = FixtureRepository.load(FIXTURE_ROOT).products.values()
    result = filter_and_rank(
        products,
        HardConstraints(max_price_usd=15, fragrance_free=True, water_resistance_minutes=80),
        SoftPreferences(),
    )
    assert result.eligible == ()
    assert len(result.exclusions) == 3
