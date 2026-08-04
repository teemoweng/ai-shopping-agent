from __future__ import annotations

import re
from collections.abc import Iterable
from dataclasses import dataclass

from app.domain.contracts import HardConstraints, SoftPreferences
from app.domain.models import Product, Sku


@dataclass(frozen=True)
class ParsedPreferences:
    hard: HardConstraints
    soft: SoftPreferences


@dataclass(frozen=True)
class RankedCandidate:
    product: Product
    eligible_skus: tuple[Sku, ...]
    score: int
    reasons: tuple[str, ...]


@dataclass(frozen=True)
class FilterResult:
    eligible: tuple[RankedCandidate, ...]
    exclusions: dict[str, tuple[str, ...]]


def parse_preferences(text: str) -> ParsedPreferences:
    normalized = text.lower()
    price_match = re.search(r"(?:under|below|max|\$)\s*\$?(\d+(?:\.\d+)?)", normalized)
    max_price = float(price_match.group(1)) if price_match else None
    fragrance_free = True if any(
        phrase in normalized for phrase in ("fragrance-free", "fragrance free", "no fragrance")
    ) else None
    water_match = re.search(r"(40|80)\s*(?:minute|min)", normalized)
    water_minutes = int(water_match.group(1)) if water_match else None
    finish = next((value for value in ("dewy", "natural", "matte") if value in normalized), None)
    skin_type = next(
        (value for value in ("dry", "combination", "oily", "sensitive") if value in normalized),
        None,
    )
    white_cast = "high" if "no white cast" in normalized or "white cast" in normalized else None
    return ParsedPreferences(
        hard=HardConstraints(
            max_price_usd=max_price,
            fragrance_free=fragrance_free,
            water_resistance_minutes=water_minutes,
            in_stock=True,
        ),
        soft=SoftPreferences(
            finish=finish,
            skin_type=skin_type,
            white_cast_concern=white_cast,
        ),
    )


def _eligible_skus(product: Product, constraints: HardConstraints) -> tuple[Sku, ...]:
    return tuple(
        sku
        for sku in product.skus
        if (not constraints.in_stock or sku.in_stock)
        and (constraints.max_price_usd is None or sku.price_usd <= constraints.max_price_usd)
    )


def filter_and_rank(
    products: Iterable[Product],
    hard: HardConstraints,
    soft: SoftPreferences,
) -> FilterResult:
    candidates: list[RankedCandidate] = []
    exclusions: dict[str, tuple[str, ...]] = {}
    for product in products:
        reasons: list[str] = []
        eligible_skus = _eligible_skus(product, hard)
        if not eligible_skus:
            reasons.append("no in-stock SKU within price limit")
        if hard.fragrance_free is True and not product.fragrance_free:
            reasons.append("contains fragrance")
        if (
            hard.water_resistance_minutes is not None
            and (product.water_resistance_minutes or 0) < hard.water_resistance_minutes
        ):
            reasons.append(f"water resistance below {hard.water_resistance_minutes} minutes")
        if reasons:
            exclusions[product.id] = tuple(reasons)
            continue

        score = 0
        matches: list[str] = []
        if soft.finish and product.finish == soft.finish:
            score += 3
            matches.append(f"{soft.finish} finish")
        if soft.skin_type and soft.skin_type in product.skin_types:
            score += 2
            matches.append(f"listed for {soft.skin_type} skin")
        if soft.white_cast_concern == "high" and product.white_cast_risk == "low":
            score += 2
            matches.append("lower white-cast risk")
        candidates.append(RankedCandidate(product, eligible_skus, score, tuple(matches)))

    candidates.sort(
        key=lambda item: (
            -item.score,
            min(sku.price_usd for sku in item.eligible_skus),
            item.product.id,
        )
    )
    return FilterResult(tuple(candidates), exclusions)
