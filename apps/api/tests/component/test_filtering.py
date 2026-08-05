from pathlib import Path

import pytest

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


@pytest.mark.parametrize(
    ("text", "field", "expected"),
    [
        ("预算30美元以内", "max_price_usd", 30.0),
        ("$30以内", "max_price_usd", 30.0),
        ("无香", "fragrance_free", True),
        ("无香精", "fragrance_free", True),
        ("40分钟防水", "water_resistance_minutes", 40),
        ("80分钟防水", "water_resistance_minutes", 80),
    ],
)
def test_parser_extracts_chinese_hard_constraints(
    text: str,
    field: str,
    expected: object,
) -> None:
    parsed = parse_preferences(text)
    assert getattr(parsed.hard, field) == expected


@pytest.mark.parametrize(
    ("text", "field", "expected"),
    [
        ("水润妆效", "finish", "dewy"),
        ("自然妆效", "finish", "natural"),
        ("哑光妆效", "finish", "matte"),
        ("干皮", "skin_type", "dry"),
        ("混合皮", "skin_type", "combination"),
        ("油皮", "skin_type", "oily"),
        ("敏感肌", "skin_type", "sensitive"),
        ("油敏皮", "skin_type", "sensitive"),
        ("不泛白", "white_cast_concern", "high"),
        ("白膜", "white_cast_concern", "high"),
        ("泛白", "white_cast_concern", "high"),
    ],
)
def test_parser_extracts_chinese_ranking_preferences(
    text: str,
    field: str,
    expected: object,
) -> None:
    parsed = parse_preferences(text)
    assert getattr(parsed.soft, field) == expected


def test_parser_extracts_mixed_chinese_preferences() -> None:
    parsed = parse_preferences("油敏皮、深肤色、预算30美元以内、自然妆效")
    assert parsed == type(parsed)(
        hard=HardConstraints(max_price_usd=30),
        soft=SoftPreferences(
            finish="natural",
            skin_type="sensitive",
            white_cast_concern="high",
        ),
    )


def test_parser_marks_only_preferences_mentioned_in_partial_update() -> None:
    parsed = parse_preferences("改成哑光")
    assert parsed.hard.model_fields_set == set()
    assert parsed.soft.model_fields_set == {"finish"}


def test_parser_marks_explicit_budget_removal_as_an_update() -> None:
    parsed = parse_preferences("预算不限")
    assert parsed.hard.model_fields_set == {"max_price_usd"}
    assert parsed.hard.max_price_usd is None
    assert parsed.soft.model_fields_set == set()


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
