import type { components } from "@shopping-guide/contracts/src/api";

type CompareResponse = components["schemas"]["CompareResponse"];
type CartItemResponse = components["schemas"]["CartItemResponse"];

const comparisonRowKeys = [
  "starting_price_usd",
  "fragrance_free",
  "water_resistance_minutes",
  "finish",
  "white_cast_risk",
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonBlankString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isFiniteNonNegativeNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isExactArray<T>(
  value: unknown,
  length: number,
  predicate: (item: unknown) => item is T,
): value is T[] {
  return Array.isArray(value) && value.length === length && value.every(predicate);
}

export function validateComparisonResponse(
  value: unknown,
  expectedSessionId: string,
  expectedProductIds: readonly string[],
): CompareResponse | null {
  if (
    !isRecord(value) ||
    value.session_id !== expectedSessionId ||
    value.state !== "COMPARE" ||
    value.simulated !== true ||
    !Array.isArray(value.product_ids) ||
    value.product_ids.length < 2 ||
    value.product_ids.length > 3 ||
    value.product_ids.length !== expectedProductIds.length ||
    !value.product_ids.every(
      (productId, index) =>
        isNonBlankString(productId) && productId === expectedProductIds[index],
    ) ||
    new Set(value.product_ids).size !== value.product_ids.length ||
    !isRecord(value.rows)
  ) {
    return null;
  }

  const rowKeys = Object.keys(value.rows);
  if (
    rowKeys.length !== comparisonRowKeys.length ||
    !comparisonRowKeys.every((key) => rowKeys.includes(key))
  ) {
    return null;
  }

  const columnCount = value.product_ids.length;
  const startingPrices = value.rows.starting_price_usd;
  const fragranceFree = value.rows.fragrance_free;
  const waterResistance = value.rows.water_resistance_minutes;
  const finish = value.rows.finish;
  const whiteCastRisk = value.rows.white_cast_risk;
  if (
    !isExactArray(startingPrices, columnCount, isFiniteNonNegativeNumber) ||
    !isExactArray(
      fragranceFree,
      columnCount,
      (item): item is boolean => typeof item === "boolean",
    ) ||
    !isExactArray(
      waterResistance,
      columnCount,
      (item): item is number | null =>
        item === null || isFiniteNonNegativeNumber(item),
    ) ||
    !isExactArray(
      finish,
      columnCount,
      (item): item is string => typeof item === "string",
    ) ||
    !isExactArray(
      whiteCastRisk,
      columnCount,
      (item): item is string => typeof item === "string",
    )
  ) {
    return null;
  }

  return {
    session_id: value.session_id,
    state: "COMPARE",
    product_ids: [...value.product_ids],
    rows: {
      starting_price_usd: [...startingPrices],
      fragrance_free: [...fragranceFree],
      water_resistance_minutes: [...waterResistance],
      finish: [...finish],
      white_cast_risk: [...whiteCastRisk],
    },
    simulated: true,
  };
}

export function isCartItemResponse(value: unknown): value is CartItemResponse {
  return (
    isRecord(value) &&
    isNonBlankString(value.cart_id) &&
    isNonBlankString(value.cart_item_id) &&
    isNonBlankString(value.session_id) &&
    value.state === "FEEDBACK_AND_MEMORY" &&
    isNonBlankString(value.sku_id) &&
    typeof value.quantity === "number" &&
    Number.isInteger(value.quantity) &&
    value.quantity > 0 &&
    isFiniteNonNegativeNumber(value.unit_price_usd) &&
    value.simulated === true
  );
}

export function validateCartItemResponse(
  value: unknown,
  expected: {
    sessionId: string;
    skuId: string;
    quantity: number;
    unitPriceUsd: number;
  },
): CartItemResponse | null {
  if (
    !isCartItemResponse(value) ||
    value.session_id !== expected.sessionId ||
    value.sku_id !== expected.skuId ||
    value.quantity !== expected.quantity ||
    value.unit_price_usd !== expected.unitPriceUsd
  ) {
    return null;
  }
  return value;
}
