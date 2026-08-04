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


def test_price_limit_alone_excludes_an_otherwise_eligible_product() -> None:
    product = FixtureRepository.load(FIXTURE_ROOT).get_product("cloud-veil-mineral")
    price_limited_product = product.model_copy(
        update={
            "id": "price-limited-product",
            "skus": tuple(
                sku.model_copy(update={"in_stock": True, "price_usd": 21})
                for sku in product.skus
            ),
        }
    )

    result = filter_and_rank(
        [price_limited_product],
        HardConstraints(max_price_usd=20),
        SoftPreferences(),
    )

    assert result.eligible == ()
    assert result.exclusions == {"price-limited-product": ("no SKU within price limit",)}


def test_stock_requirement_alone_excludes_an_otherwise_eligible_product() -> None:
    product = FixtureRepository.load(FIXTURE_ROOT).get_product("cloud-veil-mineral")
    out_of_stock_product = product.model_copy(
        update={
            "id": "out-of-stock-product",
            "skus": tuple(
                sku.model_copy(update={"in_stock": False, "price_usd": 20})
                for sku in product.skus
            ),
        }
    )

    result = filter_and_rank(
        [out_of_stock_product],
        HardConstraints(max_price_usd=20, in_stock=True),
        SoftPreferences(),
    )

    assert result.eligible == ()
    assert result.exclusions == {"out-of-stock-product": ("no in-stock SKU",)}
