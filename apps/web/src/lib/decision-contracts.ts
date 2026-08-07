import type { components } from "@shopping-guide/contracts/src/api";

type CompareResponse = components["schemas"]["CompareResponse"];
type CartItemResponse = components["schemas"]["CartItemResponse"];
type GuideTurnResponse = components["schemas"]["GuideTurnResponse"];
type GuideKind = GuideTurnResponse["kind"];
type GuideAction = components["schemas"]["GuideAction"];
type GuideViewKind = components["schemas"]["GuideViewKind"];
type CommerceOperationResponse =
  components["schemas"]["CommerceOperationResponse"];
type CommerceAction = components["schemas"]["CommerceAction"];
type CommerceStep = components["schemas"]["CommerceStep"];
type CommerceOperationStatus =
  components["schemas"]["CommerceOperationStatus"];
type CommerceFactsResponse = components["schemas"]["CommerceFactsResponse"];
type ProductDetailResponse = components["schemas"]["ProductDetailResponse"];
type ContentContextSummary = components["schemas"]["ContentContextSummary"];
type GuideStatus = components["schemas"]["GuideStatus"];
type WorkflowState = components["schemas"]["WorkflowState"];
type EvidenceStatus = components["schemas"]["EvidenceStatus"];

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

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function isFinitePositiveNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function isTimestamp(value: unknown): value is string {
  return isNonBlankString(value) && Number.isFinite(Date.parse(value));
}

function hasOwn(value: Record<string, unknown>, key: string) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function isNonBlankStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isNonBlankString);
}

export function validateProductDetailResponse(
  value: unknown,
  expectedProductId: string,
): ProductDetailResponse | null {
  if (
    !isRecord(value) ||
    !isRecord(value.product) ||
    !isRecord(value.freshness) ||
    value.synthetic_disclosure !== true ||
    !isFiniteNonNegativeNumber(value.starting_price_usd)
  ) {
    return null;
  }

  const product = value.product;
  const freshness = value.freshness;
  const observedAt = Date.parse(String(product.observed_at));
  const expiresAt = Date.parse(String(product.expires_at));
  const skinTypes = new Set(["dry", "combination", "oily", "sensitive"]);
  if (
    product.id !== expectedProductId ||
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(expectedProductId) ||
    product.synthetic !== true ||
    !isNonBlankString(product.brand) ||
    !isNonBlankString(product.name) ||
    !isNonBlankString(product.display_name_zh) ||
    !isNonBlankString(product.description_zh) ||
    !isPositiveInteger(product.spf) ||
    product.spf < 15 ||
    product.spf > 100 ||
    typeof product.broad_spectrum !== "boolean" ||
    typeof product.fragrance_free !== "boolean" ||
    (product.water_resistance_minutes !== null &&
      product.water_resistance_minutes !== 40 &&
      product.water_resistance_minutes !== 80) ||
    !["dewy", "natural", "matte"].includes(String(product.finish)) ||
    !Array.isArray(product.skin_types) ||
    !product.skin_types.every((item) => skinTypes.has(String(item))) ||
    !["low", "medium", "high"].includes(String(product.white_cast_risk)) ||
    !["mineral", "organic", "hybrid"].includes(String(product.active_filter_type)) ||
    !isNonBlankStringArray(product.ingredient_highlights) ||
    !isFinitePositiveNumber(product.list_price_usd) ||
    !hasOwn(product, "promotion") ||
    (product.promotion !== null && !isNonBlankString(product.promotion)) ||
    !isNonBlankString(product.store_name) ||
    !isNonBlankString(product.facts_version) ||
    !isTimestamp(product.observed_at) ||
    !isTimestamp(product.expires_at) ||
    observedAt >= expiresAt ||
    freshness.facts_version !== product.facts_version ||
    freshness.observed_at !== product.observed_at ||
    freshness.expires_at !== product.expires_at
  ) {
    return null;
  }

  const media = product.media;
  if (
    !isRecord(media) ||
    (media.kind !== "image" && media.kind !== "video") ||
    !isNonBlankString(media.src) ||
    !hasOwn(media, "poster_src") ||
    (media.poster_src !== null && !isNonBlankString(media.poster_src)) ||
    !isNonBlankString(media.alt_zh) ||
    !isNonBlankString(media.license_ref)
  ) {
    return null;
  }

  const shipping = product.shipping;
  if (
    !isRecord(shipping) ||
    shipping.market !== "US" ||
    !isFiniteNonNegativeNumber(shipping.fee_usd) ||
    !isNonNegativeInteger(shipping.eta_min_days) ||
    !isNonNegativeInteger(shipping.eta_max_days) ||
    shipping.eta_min_days > shipping.eta_max_days ||
    !isNonBlankString(shipping.return_summary_zh)
  ) {
    return null;
  }

  if (!Array.isArray(product.skus) || product.skus.length === 0) return null;
  const skuIds = new Set<string>();
  let minimumPrice = Number.POSITIVE_INFINITY;
  let minimumInStockPrice = Number.POSITIVE_INFINITY;
  for (const sku of product.skus) {
    if (
      !isRecord(sku) ||
      !isNonBlankString(sku.id) ||
      skuIds.has(sku.id) ||
      !isPositiveInteger(sku.size_ml) ||
      !isFinitePositiveNumber(sku.price_usd) ||
      typeof sku.in_stock !== "boolean" ||
      !isNonNegativeInteger(sku.inventory_units) ||
      (sku.in_stock && sku.inventory_units === 0) ||
      !isNonBlankString(sku.label) ||
      !isNonBlankString(sku.image_src)
    ) {
      return null;
    }
    skuIds.add(sku.id);
    minimumPrice = Math.min(minimumPrice, sku.price_usd);
    if (sku.in_stock && sku.inventory_units > 0) {
      minimumInStockPrice = Math.min(minimumInStockPrice, sku.price_usd);
    }
  }
  const expectedStartingPrice = Number.isFinite(minimumInStockPrice)
    ? minimumInStockPrice
    : minimumPrice;
  if (
    Math.round(value.starting_price_usd * 100) !==
    Math.round(expectedStartingPrice * 100)
  ) {
    return null;
  }
  return value as ProductDetailResponse;
}

function hasOnlyKnownActions<T extends string>(
  actions: unknown,
  known: ReadonlySet<T>,
): actions is T[] {
  return (
    Array.isArray(actions) &&
    actions.every((action): action is T => typeof action === "string" && known.has(action as T)) &&
    new Set(actions).size === actions.length
  );
}

const guideActions = new Set<GuideAction>([
  "CONFIRM_CONTEXT",
  "ANSWER_CLARIFICATION",
  "SKIP_CLARIFICATION",
  "UPDATE_CONSTRAINTS",
  "RELAX_CONSTRAINT",
  "CONTINUE_WITH_KNOWN",
  "REQUEST_COMPARISON",
  "OPEN_PRODUCT",
  "RETRY_GUIDE_OPERATION",
  "RETURN_TO_FEED",
]);

const guideActionsByView: Record<GuideViewKind, readonly GuideAction[]> = {
  OPENING_CONTEXT: ["RETURN_TO_FEED"],
  CONTEXT_CONFIRMATION: ["CONFIRM_CONTEXT", "RETURN_TO_FEED"],
  WAITING_CLARIFICATION: [
    "ANSWER_CLARIFICATION",
    "SKIP_CLARIFICATION",
    "UPDATE_CONSTRAINTS",
    "RETURN_TO_FEED",
  ],
  VERIFYING_FACTS: ["RETURN_TO_FEED"],
  DECISION_READY: [
    "UPDATE_CONSTRAINTS",
    "REQUEST_COMPARISON",
    "OPEN_PRODUCT",
    "RETURN_TO_FEED",
  ],
  NO_MATCH: ["RELAX_CONSTRAINT", "RETURN_TO_FEED"],
  INSUFFICIENT_EVIDENCE: [
    "OPEN_PRODUCT",
    "CONTINUE_WITH_KNOWN",
    "RETURN_TO_FEED",
  ],
  COMPARISON_READY: ["OPEN_PRODUCT", "RETURN_TO_FEED"],
  SAFE_BOUNDARY: ["RETURN_TO_FEED"],
  RECOVERY_REQUIRED: ["RETRY_GUIDE_OPERATION", "RETURN_TO_FEED"],
  FATAL_ERROR: ["RETURN_TO_FEED"],
};

const guideStatuses = new Set<GuideStatus>([
  "ACTIVE",
  "WAITING_USER",
  "SAFE_EXIT",
  "FAILED",
]);

const workflowStates = new Set<WorkflowState>([
  "ENTRY_INGEST",
  "UNDERSTAND",
  "CLARIFY",
  "VERIFY_CURRENT_PRODUCT",
  "FILTER_AND_RETRIEVE",
  "PRESENT_RECOMMENDATION",
  "COMPARE",
  "SKU_AND_CART_CONFIRM",
  "FEEDBACK_AND_MEMORY",
]);

const guideKinds = new Set<GuideKind>([
  "opening",
  "clarification",
  "recommendation",
  "no_match",
  "safety_boundary",
] as const);

const evidenceStatuses = new Set<EvidenceStatus>([
  "SUPPORTED",
  "CONFLICTING",
  "INSUFFICIENT_EVIDENCE",
  "SUBJECTIVE_MIXED",
]);

const commerceActions = new Set<CommerceAction>([
  "SELECT_SKU",
  "SET_QUANTITY",
  "PREVIEW_CART",
  "ACCEPT_UPDATED_FACTS",
  "CONFIRM_ADD_TO_CART",
  "CANCEL_CONFIRMATION",
  "RESELECT_SKU",
  "RETRY_COMMERCE_OPERATION",
  "RECONCILE_COMMIT",
  "RETURN_TO_PRODUCT",
  "CONTINUE_BROWSING",
]);

const commerceActionsByView: Record<CommerceStep, readonly CommerceAction[]> = {
  PDP_READY: ["PREVIEW_CART", "RETURN_TO_PRODUCT"],
  CHECKING_FACTS: ["RETURN_TO_PRODUCT"],
  AWAITING_CONFIRMATION: [
    "SELECT_SKU",
    "SET_QUANTITY",
    "CONFIRM_ADD_TO_CART",
    "CANCEL_CONFIRMATION",
    "RETURN_TO_PRODUCT",
  ],
  FACTS_CHANGED: [
    "ACCEPT_UPDATED_FACTS",
    "RESELECT_SKU",
    "CANCEL_CONFIRMATION",
    "RETURN_TO_PRODUCT",
  ],
  COMMITTING: ["RETURN_TO_PRODUCT"],
  COMMIT_STATUS_UNKNOWN: ["RECONCILE_COMMIT", "RETURN_TO_PRODUCT"],
  SUCCEEDED: ["RETURN_TO_PRODUCT", "CONTINUE_BROWSING"],
  FAILED: ["RETRY_COMMERCE_OPERATION", "RETURN_TO_PRODUCT"],
  CANCELLED: ["RETURN_TO_PRODUCT"],
};

const commerceStatusByView: Record<CommerceStep, CommerceOperationStatus> = {
  PDP_READY: "ACTIVE",
  CHECKING_FACTS: "ACTIVE",
  AWAITING_CONFIRMATION: "ACTIVE",
  FACTS_CHANGED: "ACTIVE",
  COMMITTING: "ACTIVE",
  COMMIT_STATUS_UNKNOWN: "RECONCILIATION_REQUIRED",
  SUCCEEDED: "SUCCEEDED",
  FAILED: "FAILED",
  CANCELLED: "CANCELLED",
};

const guideViewKinds = new Set<GuideViewKind>(Object.keys(guideActionsByView) as GuideViewKind[]);
const commerceSteps = new Set<CommerceStep>(Object.keys(commerceActionsByView) as CommerceStep[]);

function hasValidGuideContext(value: unknown): value is ContentContextSummary {
  return (
    isRecord(value) &&
    isNonBlankString(value.id) &&
    isNonBlankString(value.anchor_product_id) &&
    isNonBlankString(value.anchor_product_name) &&
    isNonBlankString(value.creator_handle) &&
    isNonBlankString(value.caption) &&
    Array.isArray(value.claims) &&
    value.claims.every(
      (claim) =>
        isRecord(claim) &&
        isNonBlankString(claim.claim_id) &&
        isNonBlankString(claim.text) &&
        isNonBlankString(claim.evidence_id) &&
        evidenceStatuses.has(claim.status as EvidenceStatus),
    )
  );
}

export function validateGuideTurnResponse(value: unknown): GuideTurnResponse | null {
  if (
    !isRecord(value) ||
    !isNonBlankString(value.session_id) ||
    !isNonBlankString(value.trace_id) ||
    (value.locale !== "en-US" && value.locale !== "zh-CN") ||
    !guideStatuses.has(value.guide_status as GuideStatus) ||
    !workflowStates.has(value.state as WorkflowState) ||
    !guideKinds.has(value.kind as GuideKind) ||
    !isNonBlankString(value.text) ||
    !isPositiveInteger(value.guide_revision) ||
    !isTimestamp(value.facts_snapshot_at) ||
    !hasValidGuideContext(value.context) ||
    !guideViewKinds.has(value.guide_view_kind as GuideViewKind) ||
    !hasOnlyKnownActions(value.allowed_actions, guideActions)
  ) {
    return null;
  }

  const allowedForView = guideActionsByView[value.guide_view_kind as GuideViewKind];
  if (!value.allowed_actions.every((action) => allowedForView.includes(action))) {
    return null;
  }
  const isComparisonReady = value.guide_view_kind === "COMPARISON_READY";
  if (isComparisonReady) {
    if (
      value.state !== "COMPARE" ||
      value.allowed_actions.length !== 2 ||
      value.allowed_actions[0] !== "OPEN_PRODUCT" ||
      value.allowed_actions[1] !== "RETURN_TO_FEED" ||
      !isRecord(value.comparison) ||
      !Array.isArray(value.comparison.product_ids) ||
      validateComparisonResponse(
        value.comparison,
        value.session_id,
        value.comparison.product_ids as string[],
      ) === null
    ) {
      return null;
    }
  } else if (value.comparison !== undefined && value.comparison !== null) {
    return null;
  }
  return value as GuideTurnResponse;
}

function hasValidCommerceFacts(value: unknown): value is CommerceFactsResponse {
  return (
    isRecord(value) &&
    isNonBlankString(value.product_id) &&
    isNonBlankString(value.sku_id) &&
    isPositiveInteger(value.quantity) &&
    value.quantity <= 5 &&
    isFiniteNonNegativeNumber(value.unit_price_usd) &&
    isFiniteNonNegativeNumber(value.subtotal_usd) &&
    typeof value.inventory_units === "number" &&
    Number.isInteger(value.inventory_units) &&
    value.inventory_units >= 0 &&
    typeof value.in_stock === "boolean" &&
    isNonBlankString(value.facts_version) &&
    isTimestamp(value.observed_at) &&
    Math.round(value.subtotal_usd * 100) ===
      Math.round(value.unit_price_usd * value.quantity * 100) &&
    (!value.in_stock || value.inventory_units >= value.quantity)
  );
}

export interface CommerceValidationOptions {
  confirmationSecretPolicy?: "required" | "optional" | "forbidden";
  expected?: {
    operationId?: string;
    purchaseOrigin?: "FEED" | "AI";
    guideSessionId?: string | null;
    sourceGuideRevision?: number | null;
    productId?: string;
    skuId?: string;
    quantity?: number;
    transactionRevisions?: readonly number[];
    idempotencyKey?: string;
  };
}

function hasNoValue(value: Record<string, unknown>, key: string) {
  return !hasOwn(value, key) || value[key] === undefined || value[key] === null;
}

function hasExactActions(
  actual: CommerceAction[],
  expected: readonly CommerceAction[],
) {
  return (
    actual.length === expected.length &&
    expected.every((action) => actual.includes(action))
  );
}

function hasValidFactsDiff(
  value: Record<string, unknown>,
  facts: CommerceFactsResponse,
) {
  if (!Array.isArray(value.facts_diff)) return false;
  const allowed = new Set([
    "unit_price_usd",
    "inventory_units",
    "in_stock",
    "facts_version",
  ]);
  const seen = new Set<string>();
  for (const diff of value.facts_diff) {
    if (
      !isRecord(diff) ||
      !isNonBlankString(diff.field) ||
      !allowed.has(diff.field) ||
      seen.has(diff.field) ||
      Object.is(diff.previous_value, diff.current_value)
    ) {
      return false;
    }
    seen.add(diff.field);
    const current = facts[diff.field as keyof CommerceFactsResponse];
    if (!Object.is(diff.current_value, current)) return false;
    const pair = [diff.previous_value, diff.current_value];
    if (
      (diff.field === "unit_price_usd" &&
        !pair.every(isFiniteNonNegativeNumber)) ||
      (diff.field === "inventory_units" && !pair.every(isNonNegativeInteger)) ||
      (diff.field === "in_stock" &&
        !pair.every((item) => typeof item === "boolean")) ||
      (diff.field === "facts_version" && !pair.every(isNonBlankString))
    ) {
      return false;
    }
  }
  return true;
}

function hasValidReceipt(
  receipt: unknown,
  operation: Record<string, unknown>,
  facts: CommerceFactsResponse,
  expectedIdempotencyKey?: string,
) {
  if (
    !isRecord(receipt) ||
    !isNonBlankString(receipt.receipt_id) ||
    !isNonBlankString(receipt.cart_id) ||
    !isNonBlankString(receipt.cart_item_id) ||
    receipt.operation_id !== operation.operation_id ||
    !isNonBlankString(receipt.idempotency_key) ||
    (expectedIdempotencyKey !== undefined &&
      receipt.idempotency_key !== expectedIdempotencyKey) ||
    receipt.product_id !== operation.product_id ||
    receipt.sku_id !== operation.sku_id ||
    receipt.quantity !== operation.quantity ||
    receipt.unit_price_usd !== facts.unit_price_usd ||
    receipt.subtotal_usd !== facts.subtotal_usd ||
    receipt.facts_version !== operation.facts_version ||
    !isTimestamp(receipt.committed_at) ||
    receipt.simulated !== true ||
    receipt.order_created !== false ||
    receipt.payment_created !== false
  ) {
    return false;
  }
  return true;
}

export function validateCommerceOperationResponse(
  value: unknown,
  options: CommerceValidationOptions = {},
): CommerceOperationResponse | null {
  if (
    !isRecord(value) ||
    !isNonBlankString(value.operation_id) ||
    (value.purchase_origin !== "FEED" && value.purchase_origin !== "AI") ||
    !isNonBlankString(value.product_id) ||
    !isNonBlankString(value.sku_id) ||
    !isPositiveInteger(value.quantity) ||
    value.quantity > 5 ||
    !isPositiveInteger(value.transaction_revision) ||
    !isNonBlankString(value.facts_version) ||
    value.simulated !== true ||
    !commerceSteps.has(value.commerce_view_kind as CommerceStep) ||
    !hasOnlyKnownActions(value.allowed_actions, commerceActions) ||
    !hasValidCommerceFacts(value.facts) ||
    !hasValidFactsDiff(value, value.facts)
  ) {
    return null;
  }

  const step = value.commerce_view_kind as CommerceStep;
  const status = value.operation_status as CommerceOperationStatus;
  const allowedForView =
    step === "FACTS_CHANGED" && !value.facts.in_stock
      ? (["RESELECT_SKU", "RETURN_TO_PRODUCT"] as const)
      : commerceActionsByView[step];
  if (
    status !== commerceStatusByView[step] ||
    !hasExactActions(value.allowed_actions, allowedForView) ||
    value.facts.product_id !== value.product_id ||
    value.facts.sku_id !== value.sku_id ||
    value.facts.quantity !== value.quantity ||
    value.facts.facts_version !== value.facts_version
  ) {
    return null;
  }

  const expected = options.expected;
  if (
    (expected?.operationId !== undefined && value.operation_id !== expected.operationId) ||
    (expected?.purchaseOrigin !== undefined &&
      value.purchase_origin !== expected.purchaseOrigin) ||
    (expected?.productId !== undefined && value.product_id !== expected.productId) ||
    (expected?.skuId !== undefined && value.sku_id !== expected.skuId) ||
    (expected?.quantity !== undefined && value.quantity !== expected.quantity) ||
    (expected?.transactionRevisions !== undefined &&
      !expected.transactionRevisions.includes(value.transaction_revision))
  ) {
    return null;
  }

  if (value.purchase_origin === "FEED") {
    if (!hasNoValue(value, "guide_session_id") || !hasNoValue(value, "source_guide_revision")) {
      return null;
    }
  } else if (
    !isNonBlankString(value.guide_session_id) ||
    !isPositiveInteger(value.source_guide_revision)
  ) {
    return null;
  }
  if (
    (expected?.guideSessionId !== undefined &&
      (value.guide_session_id ?? null) !== expected.guideSessionId) ||
    (expected?.sourceGuideRevision !== undefined &&
      (value.source_guide_revision ?? null) !== expected.sourceGuideRevision)
  ) {
    return null;
  }

  const secretPolicy = options.confirmationSecretPolicy ?? "optional";
  const hasToken = isNonBlankString(value.confirmation_token);
  const hasExpiry = isTimestamp(value.confirmation_expires_at);
  if (step === "AWAITING_CONFIRMATION") {
    if (
      (secretPolicy === "required" && (!hasToken || !hasExpiry)) ||
      (secretPolicy === "forbidden" && (hasToken || hasExpiry)) ||
      (secretPolicy === "optional" && hasToken !== hasExpiry) ||
      (hasExpiry && Date.parse(value.confirmation_expires_at as string) <= Date.parse(value.facts.observed_at))
    ) {
      return null;
    }
  } else if (!hasNoValue(value, "confirmation_token") || !hasNoValue(value, "confirmation_expires_at")) {
    return null;
  }

  const diffLength = (value.facts_diff as unknown[]).length;
  const hasError = isNonBlankString(value.error_code);
  const hasReceipt = !hasNoValue(value, "receipt");
  switch (step) {
    case "FACTS_CHANGED": {
      const expectedActions = value.facts.in_stock
        ? commerceActionsByView.FACTS_CHANGED
        : (["RESELECT_SKU", "RETURN_TO_PRODUCT"] as const);
      if (
        !hasExactActions(value.allowed_actions, expectedActions) ||
        value.error_code !== (value.facts.in_stock ? "FACTS_CHANGED" : "OUT_OF_STOCK") ||
        (value.facts.in_stock && diffLength === 0) ||
        hasReceipt
      ) {
        return null;
      }
      break;
    }
    case "COMMIT_STATUS_UNKNOWN":
      if (value.error_code !== "COMMIT_STATUS_UNKNOWN" || diffLength !== 0 || hasReceipt) {
        return null;
      }
      break;
    case "SUCCEEDED":
      if (
        hasError ||
        diffLength !== 0 ||
        !hasValidReceipt(
          value.receipt,
          value,
          value.facts,
          expected?.idempotencyKey,
        )
      ) {
        return null;
      }
      break;
    case "FAILED":
      if (!hasError || diffLength !== 0 || hasReceipt) return null;
      break;
    case "CANCELLED":
      if (value.error_code !== "SELECTION_CHANGED" || hasReceipt) return null;
      break;
    default:
      if (hasError || diffLength !== 0 || hasReceipt) return null;
  }

  return value as CommerceOperationResponse;
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
      (item): item is 40 | 80 | null =>
        item === null || item === 40 || item === 80,
    ) ||
    !isExactArray(
      finish,
      columnCount,
      (item): item is "dewy" | "natural" | "matte" =>
        item === "dewy" || item === "natural" || item === "matte",
    ) ||
    !isExactArray(
      whiteCastRisk,
      columnCount,
      (item): item is "low" | "medium" | "high" =>
        item === "low" || item === "medium" || item === "high",
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
