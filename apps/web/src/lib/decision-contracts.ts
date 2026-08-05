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

function isTimestamp(value: unknown): value is string {
  return isNonBlankString(value) && Number.isFinite(Date.parse(value));
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
  return value as GuideTurnResponse;
}

function hasValidCommerceFacts(value: unknown): value is CommerceFactsResponse {
  return (
    isRecord(value) &&
    isNonBlankString(value.product_id) &&
    isNonBlankString(value.sku_id) &&
    isPositiveInteger(value.quantity) &&
    isFiniteNonNegativeNumber(value.unit_price_usd) &&
    isFiniteNonNegativeNumber(value.subtotal_usd) &&
    typeof value.inventory_units === "number" &&
    Number.isInteger(value.inventory_units) &&
    value.inventory_units >= 0 &&
    typeof value.in_stock === "boolean" &&
    isNonBlankString(value.facts_version) &&
    isTimestamp(value.observed_at)
  );
}

export function validateCommerceOperationResponse(
  value: unknown,
): CommerceOperationResponse | null {
  if (
    !isRecord(value) ||
    !isNonBlankString(value.operation_id) ||
    (value.purchase_origin !== "FEED" && value.purchase_origin !== "AI") ||
    !isNonBlankString(value.product_id) ||
    !isNonBlankString(value.sku_id) ||
    !isPositiveInteger(value.quantity) ||
    !isPositiveInteger(value.transaction_revision) ||
    !isNonBlankString(value.facts_version) ||
    value.simulated !== true ||
    !commerceSteps.has(value.commerce_view_kind as CommerceStep) ||
    !hasOnlyKnownActions(value.allowed_actions, commerceActions) ||
    !hasValidCommerceFacts(value.facts)
  ) {
    return null;
  }

  const step = value.commerce_view_kind as CommerceStep;
  const status = value.operation_status as CommerceOperationStatus;
  const allowedForView = commerceActionsByView[step];
  if (
    status !== commerceStatusByView[step] ||
    !value.allowed_actions.every((action) => allowedForView.includes(action)) ||
    value.facts.product_id !== value.product_id ||
    value.facts.sku_id !== value.sku_id ||
    value.facts.quantity !== value.quantity ||
    value.facts.facts_version !== value.facts_version
  ) {
    return null;
  }

  if (step === "COMMIT_STATUS_UNKNOWN") {
    if (
      !value.allowed_actions.includes("RECONCILE_COMMIT") ||
      value.allowed_actions.some(
        (action) => action !== "RECONCILE_COMMIT" && action !== "RETURN_TO_PRODUCT",
      )
    ) {
      return null;
    }
  }

  if (
    step === "SUCCEEDED" &&
    value.confirmation_token !== undefined &&
    value.confirmation_token !== null
  ) {
    return null;
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
