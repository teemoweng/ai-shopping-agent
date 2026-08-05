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
    hard_updates: dict[str, object] = {}
    soft_updates: dict[str, object] = {}
    price_match = re.search(
        r"(?:under|below|max|\$|预算\s*)\s*\$?(\d+(?:\.\d+)?)",
        normalized,
    )
    if price_match:
        hard_updates["max_price_usd"] = float(price_match.group(1))
    elif any(
        phrase in normalized
        for phrase in ("预算不限", "取消预算", "no budget", "remove budget")
    ):
        hard_updates["max_price_usd"] = None

    fragrance_removal = any(
        phrase in normalized
        for phrase in (
            "香精不限",
            "香味不限",
            "取消无香",
            "fragrance doesn't matter",
            "no fragrance preference",
        )
    )
    fragrance_free = any(
        phrase in normalized
        for phrase in (
            "fragrance-free",
            "fragrance free",
            "no fragrance",
            "无香精",
            "无香",
        )
    )
    if fragrance_removal:
        hard_updates["fragrance_free"] = None
    elif fragrance_free:
        hard_updates["fragrance_free"] = True

    water_match = re.search(r"(40|80)\s*(?:minute|min|分钟)", normalized)
    if water_match:
        hard_updates["water_resistance_minutes"] = int(water_match.group(1))
    elif any(
        phrase in normalized
        for phrase in (
            "日常通勤",
            "不需要防水",
            "防水不限",
            "取消防水",
            "water resistance not required",
            "no water resistance",
        )
    ):
        hard_updates["water_resistance_minutes"] = None

    finish = next(
        (
            value
            for value, phrases in (
                ("dewy", ("dewy", "水润")),
                ("natural", ("natural", "自然")),
                ("matte", ("matte", "哑光")),
            )
            if any(phrase in normalized for phrase in phrases)
        ),
        None,
    )
    if any(
        phrase in normalized
        for phrase in ("妆效不限", "取消妆效", "no finish preference")
    ):
        soft_updates["finish"] = None
    elif finish is not None:
        soft_updates["finish"] = finish

    skin_type = next(
        (
            value
            for value, phrases in (
                ("sensitive", ("sensitive", "油敏皮", "敏感肌")),
                ("combination", ("combination", "混合皮")),
                ("oily", ("oily", "油皮")),
                ("dry", ("dry", "干皮")),
            )
            if any(phrase in normalized for phrase in phrases)
        ),
        None,
    )
    if any(
        phrase in normalized
        for phrase in ("肤质不限", "取消肤质", "no skin type preference")
    ):
        soft_updates["skin_type"] = None
    elif skin_type is not None:
        soft_updates["skin_type"] = skin_type

    white_cast_removal = any(
        phrase in normalized
        for phrase in (
            "不在意泛白",
            "泛白不限",
            "取消泛白要求",
            "no white cast preference",
        )
    )
    white_cast_concern = any(
        phrase in normalized
        for phrase in (
            "no white cast",
            "white cast",
            "不泛白",
            "白膜",
            "泛白",
            "深肤色",
        )
    )
    if white_cast_removal:
        soft_updates["white_cast_concern"] = None
    elif white_cast_concern:
        soft_updates["white_cast_concern"] = "high"

    return ParsedPreferences(
        hard=HardConstraints.model_validate(hard_updates),
        soft=SoftPreferences.model_validate(soft_updates),
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
            price_eligible_skus = tuple(
                sku
                for sku in product.skus
                if hard.max_price_usd is None or sku.price_usd <= hard.max_price_usd
            )
            in_stock_skus = tuple(sku for sku in product.skus if sku.in_stock)
            if hard.max_price_usd is not None and not price_eligible_skus:
                reasons.append("no SKU within price limit")
            elif hard.in_stock and not in_stock_skus:
                reasons.append("no in-stock SKU")
            else:
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
