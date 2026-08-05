import type { components } from "@shopping-guide/contracts/src/api";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ComparisonTable } from "@/components/comparison-table";
import { GuideSheet } from "@/components/guide-sheet";
import { ApiError } from "@/lib/api-client";
import {
  validateCommerceOperationResponse,
  validateGuideTurnResponse,
} from "@/lib/decision-contracts";

const api = vi.hoisted(() => ({
  addCartItem: vi.fn(),
  compareProducts: vi.fn(),
  createGuideSession: vi.fn(),
  previewCart: vi.fn(),
  sendGuideMessage: vi.fn(),
}));

vi.mock("@/lib/api-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api-client")>()),
  ...api,
}));

type GuideTurn = components["schemas"]["GuideTurnResponse"];
type CompareResponse = components["schemas"]["CompareResponse"];
type CartPreviewResponse = components["schemas"]["CartPreviewResponse"];
type CartItemResponse = components["schemas"]["CartItemResponse"];

const context: components["schemas"]["ContentContextSummary"] = {
  id: "morning-routine-uv-001",
  anchor_product_id: "seoul-shade-daily-fluid",
  anchor_product_name: "Seoul Shade Daily Fluid",
  creator_handle: "@routine.notes",
  caption: "A lightweight SPF step for a humid commute",
  claims: [
    {
      claim_id: "claim-supported",
      evidence_id: "fda-sunscreen-basics",
      status: "SUPPORTED",
      text: "Broad-spectrum sunscreen is relevant for daily UV protection.",
    },
  ],
};

const publicEvidence: components["schemas"]["EvidenceReference"] = {
  evidence_id: "fda-sunscreen-basics",
  source_kind: "public_rule",
  status: "SUPPORTED",
  synthetic: false,
  title: "FDA sunscreen labeling guide",
  summary: "Broad-spectrum labeling and directions work together.",
  url: "https://www.fda.gov/drugs/sunscreen-guide",
};

const firstConfirmation = ["confirm", "synthetic", "first"].join("_");
const refreshedConfirmation = ["confirm", "synthetic", "refreshed"].join(
  "_",
);
const secondSkuConfirmation = ["confirm", "synthetic", "second", "sku"].join(
  "_",
);

const clarificationTurn: GuideTurn = {
  session_id: "ses_guide_1",
  trace_id: "trace_guide_1",
  state: "CLARIFY",
  kind: "clarification",
  text: "Is water resistance a must, or is this mainly for a daily commute?",
  context,
  quick_replies: ["Daily commute"],
  locale: "en-US",
  guide_status: "WAITING_USER",
  guide_view_kind: "WAITING_CLARIFICATION",
  guide_revision: 1,
  facts_snapshot_at: "2026-08-05T00:00:00Z",
  allowed_actions: ["ANSWER_CLARIFICATION", "RETURN_TO_FEED"],
  degraded: false,
};

const awaitingCommerceOperation: components["schemas"]["CommerceOperationResponse"] = {
  operation_id: "op_test",
  purchase_origin: "FEED",
  product_id: "seoul-shade-daily-fluid",
  sku_id: "seoul-shade-50",
  quantity: 1,
  transaction_revision: 1,
  facts_version: "facts_test",
  commerce_view_kind: "AWAITING_CONFIRMATION",
  operation_status: "ACTIVE",
  allowed_actions: ["CONFIRM_ADD_TO_CART", "RETURN_TO_PRODUCT"],
  facts: {
    product_id: "seoul-shade-daily-fluid",
    sku_id: "seoul-shade-50",
    quantity: 1,
    unit_price_usd: 19,
    subtotal_usd: 19,
    inventory_units: 12,
    in_stock: true,
    facts_version: "facts_test",
    observed_at: "2026-08-05T00:00:00Z",
  },
  facts_diff: [],
  confirmation_token: firstConfirmation,
  confirmation_expires_at: "2026-08-05T00:05:00Z",
  simulated: true,
};

describe("server semantic guards", () => {
  it("rejects unknown Guide actions and illegal Guide view/action combinations", () => {
    expect(
      validateGuideTurnResponse({
        ...clarificationTurn,
        allowed_actions: ["UNKNOWN_GUIDE_ACTION"],
      }),
    ).toBeNull();
    expect(
      validateGuideTurnResponse({
        ...clarificationTurn,
        guide_view_kind: "SAFE_BOUNDARY",
        allowed_actions: ["REQUEST_COMPARISON"],
      }),
    ).toBeNull();
  });

  it("rejects unknown Commerce actions, illegal state actions, and missing facts", () => {
    expect(
      validateCommerceOperationResponse({
        ...awaitingCommerceOperation,
        allowed_actions: ["UNKNOWN_COMMERCE_ACTION"],
      }),
    ).toBeNull();
    expect(
      validateCommerceOperationResponse({
        ...awaitingCommerceOperation,
        commerce_view_kind: "COMMIT_STATUS_UNKNOWN",
        operation_status: "RECONCILIATION_REQUIRED",
        allowed_actions: ["RETRY_COMMERCE_OPERATION"],
      }),
    ).toBeNull();
    expect(
      validateCommerceOperationResponse({
        ...awaitingCommerceOperation,
        facts: undefined,
      }),
    ).toBeNull();
  });

  it("allows reconciliation as the only unknown-commit business action and rejects success secrets", () => {
    expect(
      validateCommerceOperationResponse({
        ...awaitingCommerceOperation,
        commerce_view_kind: "COMMIT_STATUS_UNKNOWN",
        operation_status: "RECONCILIATION_REQUIRED",
        allowed_actions: ["RECONCILE_COMMIT", "RETURN_TO_PRODUCT"],
        confirmation_token: null,
        confirmation_expires_at: null,
      }),
    ).not.toBeNull();
    expect(
      validateCommerceOperationResponse({
        ...awaitingCommerceOperation,
        commerce_view_kind: "SUCCEEDED",
        operation_status: "SUCCEEDED",
        allowed_actions: ["RETURN_TO_PRODUCT", "CONTINUE_BROWSING"],
        confirmation_token: firstConfirmation,
      }),
    ).toBeNull();
  });

  it("accepts the only authoritative preview and retry combinations", () => {
    expect(
      validateCommerceOperationResponse({
        ...awaitingCommerceOperation,
        commerce_view_kind: "PDP_READY",
        operation_status: "ACTIVE",
        allowed_actions: ["PREVIEW_CART", "RETURN_TO_PRODUCT"],
        confirmation_token: null,
        confirmation_expires_at: null,
      }),
    ).not.toBeNull();
    expect(
      validateCommerceOperationResponse({
        ...awaitingCommerceOperation,
        commerce_view_kind: "FAILED",
        operation_status: "FAILED",
        allowed_actions: ["RETRY_COMMERCE_OPERATION", "RETURN_TO_PRODUCT"],
        confirmation_token: null,
        confirmation_expires_at: null,
      }),
    ).not.toBeNull();
  });

  it.each([
    ["guide_status", { ...clarificationTurn, guide_status: undefined }],
    ["state", { ...clarificationTurn, state: undefined }],
    ["kind", { ...clarificationTurn, kind: undefined }],
    ["text", { ...clarificationTurn, text: "" }],
    ["context", { ...clarificationTurn, context: undefined }],
  ])("rejects a Guide response without required %s", (_field, malformed) => {
    expect(validateGuideTurnResponse(malformed)).toBeNull();
  });

  it.each([
    "id",
    "anchor_product_id",
    "anchor_product_name",
    "creator_handle",
    "caption",
    "claims",
  ] as const)("rejects a Guide response without context.%s", (field) => {
    expect(
      validateGuideTurnResponse({
        ...clarificationTurn,
        context: { ...context, [field]: undefined },
      }),
    ).toBeNull();
  });
});

const recommendationTurn: GuideTurn = {
  ...clarificationTurn,
  state: "PRESENT_RECOMMENDATION",
  kind: "recommendation",
  verdict: "SUITABLE",
  text: "These options pass your must-haves. Review the tradeoffs before choosing a size.",
  quick_replies: [],
  evidence: [publicEvidence],
  recommendations: [
    {
      product_id: "seoul-shade-daily-fluid",
      brand: "Mirae Lab",
      name: "Seoul Shade Daily Fluid",
      verdict: "SUITABLE",
      starting_price_usd: 14,
      fit_reasons: ["natural finish", "listed for sensitive skin"],
      tradeoffs: ["No labeled water resistance"],
      evidence_ids: ["fda-sunscreen-basics"],
      eligible_sku_ids: ["seoul-shade-30", "seoul-shade-50"],
    },
    {
      product_id: "cloud-veil-mineral",
      brand: "Han River Skin",
      name: "Cloud Veil Mineral SPF",
      verdict: "CONDITIONAL",
      starting_price_usd: 17,
      fit_reasons: ["fragrance-free"],
      tradeoffs: ["Medium white-cast risk"],
      evidence_ids: ["fda-sunscreen-basics"],
      eligible_sku_ids: ["cloud-veil-30"],
    },
    {
      product_id: "jeju-sport-sun-gel",
      brand: "Hallasan Works",
      name: "Jeju Sport Sun Gel",
      verdict: "CONDITIONAL",
      starting_price_usd: 22,
      fit_reasons: ["80 minute water resistance"],
      tradeoffs: ["Contains fragrance"],
      evidence_ids: ["fda-sunscreen-basics"],
      eligible_sku_ids: ["jeju-sport-50"],
    },
    {
      product_id: "busan-soft-sun-milk",
      brand: "South Sea Lab",
      name: "Busan Soft Sun Milk",
      verdict: "INSUFFICIENT_EVIDENCE",
      starting_price_usd: 16,
      fit_reasons: ["light texture"],
      tradeoffs: ["Evidence limited"],
      evidence_ids: [],
      eligible_sku_ids: ["busan-soft-40"],
    },
  ],
};

const comparison: CompareResponse = {
  session_id: "ses_guide_1",
  state: "COMPARE",
  product_ids: ["seoul-shade-daily-fluid", "cloud-veil-mineral"],
  rows: {
    starting_price_usd: [14, 17],
    fragrance_free: [true, false],
    water_resistance_minutes: [null, 40],
    finish: ["natural", "matte"],
    white_cast_risk: ["low", "medium"],
  },
  simulated: true,
};

const firstPreview: CartPreviewResponse = {
  session_id: "ses_guide_1",
  state: "SKU_AND_CART_CONFIRM",
  sku_id: "seoul-shade-50",
  quantity: 1,
  unit_price_usd: 19,
  subtotal_usd: 19,
  inventory_units: 7,
  confirmation_token: firstConfirmation,
  created_at: "2026-08-05T00:00:00Z",
  simulated: true,
};

const refreshedPreview: CartPreviewResponse = {
  ...firstPreview,
  confirmation_token: refreshedConfirmation,
  created_at: "2026-08-05T00:01:00Z",
  inventory_units: 6,
};

const cartItem: CartItemResponse = {
  cart_id: "cart_simulated_1",
  cart_item_id: "item_simulated_1",
  session_id: "ses_guide_1",
  state: "FEEDBACK_AND_MEMORY",
  sku_id: "seoul-shade-50",
  quantity: 1,
  unit_price_usd: 19,
  simulated: true,
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function rapidDoubleClick(button: HTMLElement) {
  let nestedClickSent = false;
  button.addEventListener(
    "click",
    () => {
      if (!nestedClickSent) {
        nestedClickSent = true;
        button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      }
    },
    { capture: true },
  );
  fireEvent.click(button);
}

async function reachRecommendations() {
  const user = userEvent.setup();
  render(<GuideSheet open onClose={vi.fn()} />);
  await screen.findByText(clarificationTurn.text);
  await user.click(screen.getByRole("button", { name: "Daily commute" }));
  await screen.findByText("Closest fit");
  return user;
}

async function chooseComparison(user: ReturnType<typeof userEvent.setup>) {
  await user.click(
    screen.getByRole("checkbox", {
      name: "Compare Seoul Shade Daily Fluid",
    }),
  );
  await user.click(
    screen.getByRole("checkbox", {
      name: "Compare Cloud Veil Mineral SPF",
    }),
  );
}

async function previewSeoulShade(user: ReturnType<typeof userEvent.setup>) {
  await user.selectOptions(
    screen.getByRole("combobox", {
      name: "Size for Seoul Shade Daily Fluid",
    }),
    "seoul-shade-50",
  );
  await user.click(
    screen.getByRole("button", { name: "Preview simulated add" }),
  );
  return screen.findByRole("region", { name: "Simulated cart preview" });
}

function expectSecretAbsent(secret: string) {
  expect(document.body.textContent).not.toContain(secret);
  expect(document.body.innerHTML).not.toContain(secret);
  const accessibilityValues = Array.from(
    document.querySelectorAll("[aria-label], [aria-labelledby], [title], [alt]"),
  ).flatMap((element) =>
    ["aria-label", "aria-labelledby", "title", "alt"]
      .map((attribute) => element.getAttribute(attribute))
      .filter((value): value is string => value !== null),
  );
  expect(accessibilityValues.join(" ")).not.toContain(secret);
}

beforeEach(() => {
  for (const client of [
    api.addCartItem,
    api.compareProducts,
    api.createGuideSession,
    api.previewCart,
    api.sendGuideMessage,
  ]) {
    client.mockReset();
  }
  api.createGuideSession.mockResolvedValue(clarificationTurn);
  api.sendGuideMessage.mockResolvedValue(recommendationTurn);
  api.compareProducts.mockResolvedValue(comparison);
  api.previewCart.mockResolvedValue(firstPreview);
  api.addCartItem.mockResolvedValue(cartItem);
});

afterEach(() => {
  cleanup();
  document.body.style.overflow = "";
});

it("renders only the five fixed comparison facts with deterministic formatting", () => {
  render(<ComparisonTable comparison={comparison} />);

  const table = screen.getByRole("table", { name: "Product comparison" });
  const rows = within(table).getAllByRole("row");
  expect(rows).toHaveLength(6);
  expect(
    within(rows[0])
      .getAllByRole("columnheader")
      .map((cell) => cell.textContent),
  ).toEqual([
    "Product fact",
    "seoul-shade-daily-fluid",
    "cloud-veil-mineral",
  ]);
  expect(within(rows[1]).getByRole("rowheader")).toHaveTextContent(
    "Starting price",
  );
  expect(
    within(rows[1])
      .getAllByRole("cell")
      .map((cell) => cell.textContent),
  ).toEqual([
    "$14.00",
    "$17.00",
  ]);
  expect(
    within(rows[2])
      .getAllByRole("cell")
      .map((cell) => cell.textContent),
  ).toEqual(["Yes", "No"]);
  expect(
    within(rows[3])
      .getAllByRole("cell")
      .map((cell) => cell.textContent),
  ).toEqual([
    "Not labeled water resistant",
    "40 min",
  ]);
  expect(
    within(rows[4])
      .getAllByRole("cell")
      .map((cell) => cell.textContent),
  ).toEqual([
    "natural",
    "matte",
  ]);
  expect(
    within(rows[5])
      .getAllByRole("cell")
      .map((cell) => cell.textContent),
  ).toEqual([
    "low",
    "medium",
  ]);
});

it("hands the Task 14 substring product-name locator from context to recommendation", async () => {
  const user = userEvent.setup();
  render(<GuideSheet open onClose={vi.fn()} />);
  await screen.findByText(clarificationTurn.text);
  const guide = screen.getByRole("dialog", { name: "AI shopping guide" });
  const beforeSubmit = within(guide).queryAllByText(
    "Seoul Shade Daily Fluid",
    { exact: false },
  );
  expect(beforeSubmit).toHaveLength(1);
  expect(beforeSubmit[0]).toBeVisible();

  await user.click(screen.getByRole("button", { name: "Daily commute" }));
  await screen.findByText("Closest fit");

  const afterRecommendation = within(guide).queryAllByText(
    "Seoul Shade Daily Fluid",
    { exact: false },
  );
  expect(afterRecommendation).toHaveLength(1);
  expect(afterRecommendation[0]).toBe(
    within(guide).getByRole("heading", { name: "Seoul Shade Daily Fluid" }),
  );
  expect(within(guide).getByText("Video anchor")).toBeVisible();
});

describe.each([
  ["an empty result", []],
  [
    "only non-anchor results",
    recommendationTurn.recommendations?.filter(
      (recommendation) => recommendation.product_id === "cloud-veil-mineral",
    ) ?? [],
  ],
])("keeps inherited anchor text for %s", (_case, recommendations) => {
  it("does not remove the only visible product-name match", async () => {
    api.sendGuideMessage.mockResolvedValueOnce({
      ...recommendationTurn,
      recommendations,
    });
    const user = userEvent.setup();
    render(<GuideSheet open onClose={vi.fn()} />);
    await screen.findByText(clarificationTurn.text);
    await user.click(screen.getByRole("button", { name: "Daily commute" }));
    await screen.findByText(recommendationTurn.text);

    const guide = screen.getByRole("dialog", { name: "AI shopping guide" });
    expect(
      within(guide).queryAllByText("Seoul Shade Daily Fluid", {
        exact: false,
      }),
    ).toHaveLength(1);
    expect(within(guide).queryByText("Video anchor")).not.toBeInTheDocument();
  });
});

it("enforces two to three selected products and synchronously blocks duplicate comparisons", async () => {
  const pending = deferred<CompareResponse>();
  api.compareProducts.mockReturnValue(pending.promise);
  const user = await reachRecommendations();

  expect(screen.getByRole("button", { name: "Compare 0" })).toBeDisabled();
  await user.click(
    screen.getByRole("checkbox", {
      name: "Compare Seoul Shade Daily Fluid",
    }),
  );
  expect(screen.getByRole("button", { name: "Compare 1" })).toBeDisabled();
  await user.click(
    screen.getByRole("checkbox", {
      name: "Compare Cloud Veil Mineral SPF",
    }),
  );

  const compareButton = screen.getByRole("button", { name: "Compare 2" });
  expect(compareButton).toBeEnabled();
  rapidDoubleClick(compareButton);

  expect(compareButton).toBeDisabled();
  expect(api.compareProducts).toHaveBeenCalledOnce();
  expect(api.compareProducts).toHaveBeenCalledWith("ses_guide_1", [
    "seoul-shade-daily-fluid",
    "cloud-veil-mineral",
  ]);

  await act(async () => pending.resolve(comparison));
  expect(
    await screen.findByRole("table", { name: "Product comparison" }),
  ).toBeVisible();

  await user.click(
    screen.getByRole("checkbox", { name: "Compare Jeju Sport Sun Gel" }),
  );
  expect(screen.getByRole("button", { name: "Compare 3" })).toBeEnabled();
  expect(
    screen.getByRole("checkbox", { name: "Compare Busan Soft Sun Milk" }),
  ).toBeDisabled();
});

it("renders a valid three-product comparison in the requested order", async () => {
  const threeProductComparison: CompareResponse = {
    ...comparison,
    product_ids: [
      "seoul-shade-daily-fluid",
      "cloud-veil-mineral",
      "jeju-sport-sun-gel",
    ],
    rows: {
      starting_price_usd: [14, 17, 22],
      fragrance_free: [true, false, false],
      water_resistance_minutes: [null, 40, 80],
      finish: ["natural", "matte", "dewy"],
      white_cast_risk: ["low", "medium", "low"],
    },
  };
  api.compareProducts.mockResolvedValueOnce(threeProductComparison);
  const user = await reachRecommendations();
  await chooseComparison(user);
  await user.click(
    screen.getByRole("checkbox", { name: "Compare Jeju Sport Sun Gel" }),
  );
  await user.click(screen.getByRole("button", { name: "Compare 3" }));

  const table = await screen.findByRole("table", { name: "Product comparison" });
  expect(
    within(table)
      .getAllByRole("columnheader")
      .map((cell) => cell.textContent),
  ).toEqual([
    "Product fact",
    "seoul-shade-daily-fluid",
    "cloud-veil-mineral",
    "jeju-sport-sun-gel",
  ]);
  expect(api.compareProducts).toHaveBeenCalledWith("ses_guide_1", [
    "seoul-shade-daily-fluid",
    "cloud-veil-mineral",
    "jeju-sport-sun-gel",
  ]);
});

describe.each([
  ["a null payload", null],
  [
    "a short row",
    {
      ...comparison,
      rows: { ...comparison.rows, finish: ["natural"] },
    },
  ],
  [
    "a wrong value type",
    {
      ...comparison,
      rows: { ...comparison.rows, fragrance_free: [true, "no"] },
    },
  ],
  [
    "a missing fixed row",
    {
      ...comparison,
      rows: {
        starting_price_usd: [14, 17],
        fragrance_free: [true, false],
        water_resistance_minutes: [null, 40],
        finish: ["natural", "matte"],
      },
    },
  ],
  [
    "an extra row",
    {
      ...comparison,
      rows: { ...comparison.rows, future_fact: ["x", "y"] },
    },
  ],
  [
    "reordered product IDs",
    {
      ...comparison,
      product_ids: ["cloud-veil-mineral", "seoul-shade-daily-fluid"],
    },
  ],
  [
    "too many product IDs",
    {
      ...comparison,
      product_ids: [
        "seoul-shade-daily-fluid",
        "cloud-veil-mineral",
        "jeju-sport-sun-gel",
        "busan-soft-sun-milk",
      ],
      rows: {
        starting_price_usd: [14, 17, 22, 16],
        fragrance_free: [true, false, false, true],
        water_resistance_minutes: [null, 40, 80, null],
        finish: ["natural", "matte", "dewy", "natural"],
        white_cast_risk: ["low", "medium", "low", "low"],
      },
    },
  ],
  [
    "a mismatched product ID",
    {
      ...comparison,
      product_ids: ["seoul-shade-daily-fluid", "jeju-sport-sun-gel"],
    },
  ],
  [
    "duplicate product IDs",
    {
      ...comparison,
      product_ids: ["seoul-shade-daily-fluid", "seoul-shade-daily-fluid"],
    },
  ],
])("rejects a malformed comparison response with %s", (_case, malformedResponse) => {
  it("preserves selections and exposes a stable retry", async () => {
    api.compareProducts.mockResolvedValueOnce(malformedResponse);
    const user = await reachRecommendations();
    await chooseComparison(user);
    await user.click(screen.getByRole("button", { name: "Compare 2" }));

    expect(
      await screen.findByText(
        "Comparison data was incomplete. Keep your selections and try comparing again.",
      ),
    ).toBeVisible();
    expect(
      screen.queryByRole("table", { name: "Product comparison" }),
    ).not.toBeInTheDocument();
    const retry = screen.getByRole("button", { name: "Compare 2" });
    expect(retry).toBeEnabled();
    await user.click(retry);
    expect(api.compareProducts).toHaveBeenCalledTimes(2);
    expect(
      await screen.findByRole("table", { name: "Product comparison" }),
    ).toBeVisible();
  });
});

it("previews exact facts and renders a grounded decision receipt only after resolved confirmation", async () => {
  const previewPending = deferred<CartPreviewResponse>();
  const addPending = deferred<CartItemResponse>();
  api.previewCart.mockReturnValue(previewPending.promise);
  api.addCartItem.mockReturnValue(addPending.promise);
  const user = await reachRecommendations();

  await user.selectOptions(
    screen.getByRole("combobox", {
      name: "Size for Seoul Shade Daily Fluid",
    }),
    "seoul-shade-50",
  );
  const previewButton = screen.getByRole("button", {
    name: "Preview simulated add",
  });
  rapidDoubleClick(previewButton);

  expect(previewButton).toBeDisabled();
  expect(api.previewCart).toHaveBeenCalledOnce();
  expect(api.previewCart).toHaveBeenCalledWith(
    "ses_guide_1",
    "seoul-shade-50",
  );
  expect(api.addCartItem).not.toHaveBeenCalled();

  await act(async () => previewPending.resolve(firstPreview));
  const receipt = await screen.findByRole("region", {
    name: "Simulated cart preview",
  });
  expect(within(receipt).getAllByText("$19.00")).toHaveLength(2);
  expect(within(receipt).getByText("7 units available")).toBeVisible();
  expect(within(receipt).getByText("Quantity 1")).toBeVisible();
  expect(within(receipt).getByText("Simulated")).toBeVisible();
  expect(
    within(receipt).getByText(
      "This is a prototype—no order or payment will be created",
    ),
  ).toBeVisible();
  expectSecretAbsent(firstPreview.confirmation_token);
  expect(api.addCartItem).not.toHaveBeenCalled();

  const confirmButton = within(receipt).getByRole("button", {
    name: "Confirm simulated add",
  });
  rapidDoubleClick(confirmButton);

  expect(confirmButton).toBeDisabled();
  expect(api.addCartItem).toHaveBeenCalledOnce();
  expect(api.addCartItem).toHaveBeenCalledWith(
    "ses_guide_1",
    firstPreview.confirmation_token,
  );
  expect(screen.queryByText("Added to simulated cart")).not.toBeInTheDocument();

  await act(async () => addPending.resolve(cartItem));
  const decisionReceipt = await screen.findByRole("region", {
    name: "Simulated cart decision receipt",
  });
  expect(
    within(decisionReceipt).getByText(
      "@routine.notes · Seoul Shade Daily Fluid",
    ),
  ).toBeVisible();
  expect(
    within(decisionReceipt).getByText("Seoul Shade Daily Fluid · Suitable"),
  ).toBeVisible();
  expect(
    within(decisionReceipt).getByText(
      "1 public source · FDA sunscreen labeling guide",
    ),
  ).toBeVisible();
  expect(within(decisionReceipt).getByText("Added to simulated cart")).toBeVisible();
  expect(within(decisionReceipt).getByText("seoul-shade-50")).toBeVisible();
  expect(within(decisionReceipt).getAllByText("$19.00")).toHaveLength(2);
  expect(within(decisionReceipt).getByText("7 units at preview")).toBeVisible();
  expect(within(decisionReceipt).getByText("Quantity 1")).toBeVisible();
  expect(within(decisionReceipt).getByText("item_simulated_1")).toBeVisible();
  expect(
    within(decisionReceipt).getByText(/no order or payment was created/i),
  ).toBeVisible();
  expectSecretAbsent(firstPreview.confirmation_token);
});

describe.each([
  ["an empty object", {}],
  ["a missing item ID", { ...cartItem, cart_item_id: undefined }],
  ["a blank item ID", { ...cartItem, cart_item_id: "   " }],
  ["the wrong session", { ...cartItem, session_id: "ses_other" }],
  ["the wrong SKU", { ...cartItem, sku_id: "seoul-shade-30" }],
  ["the wrong quantity", { ...cartItem, quantity: 2 }],
  ["the wrong price", { ...cartItem, unit_price_usd: 18 }],
])("rejects a malformed successful cart response with %s", (_case, malformedResponse) => {
  it("never renders success and allows a fresh preview", async () => {
    api.addCartItem.mockResolvedValueOnce(malformedResponse);
    const user = await reachRecommendations();
    await previewSeoulShade(user);
    await user.click(
      screen.getByRole("button", { name: "Confirm simulated add" }),
    );

    expect(
      await screen.findByText(
        "The simulated cart response was incomplete. Preview again before retrying.",
      ),
    ).toBeVisible();
    expect(screen.queryByText("Added to simulated cart")).not.toBeInTheDocument();
    const retry = screen.getByRole("button", { name: "Preview again" });
    expect(retry).toBeEnabled();
    expect(screen.getByText("Closest fit")).toBeVisible();
    expectSecretAbsent(firstPreview.confirmation_token);
    await user.click(retry);
    expect(api.previewCart).toHaveBeenCalledTimes(2);
    expect(
      await screen.findByRole("region", { name: "Simulated cart preview" }),
    ).toBeVisible();
    expect(
      screen.queryByText(
        "The simulated cart response was incomplete. Preview again before retrying.",
      ),
    ).not.toBeInTheDocument();
  });
});

it("replaces only superseded cart state when the SKU changes", async () => {
  const user = await reachRecommendations();
  await chooseComparison(user);
  await user.click(screen.getByRole("button", { name: "Compare 2" }));
  await screen.findByRole("table", { name: "Product comparison" });
  await previewSeoulShade(user);
  await user.click(screen.getByRole("button", { name: "Confirm simulated add" }));
  await screen.findByText("Added to simulated cart");

  await user.selectOptions(
    screen.getByRole("combobox", {
      name: "Size for Seoul Shade Daily Fluid",
    }),
    "seoul-shade-30",
  );

  expect(screen.getByRole("table", { name: "Product comparison" })).toBeVisible();
  expect(screen.queryByText("Added to simulated cart")).not.toBeInTheDocument();
  expect(
    screen.queryByRole("region", { name: "Simulated cart preview" }),
  ).not.toBeInTheDocument();
  expect(screen.getByText("Closest fit")).toBeVisible();
  expect(screen.getByRole("link", { name: /FDA sunscreen labeling guide/ })).toBeVisible();
});

it("ignores a stale confirmation after a new SKU preview replaces it", async () => {
  const pendingAdd = deferred<CartItemResponse>();
  const nextPreview: CartPreviewResponse = {
    ...firstPreview,
    sku_id: "seoul-shade-30",
    unit_price_usd: 14,
    subtotal_usd: 14,
    confirmation_token: secondSkuConfirmation,
  };
  api.addCartItem.mockReturnValueOnce(pendingAdd.promise);
  api.previewCart
    .mockResolvedValueOnce(firstPreview)
    .mockResolvedValueOnce(nextPreview);
  const user = await reachRecommendations();
  await previewSeoulShade(user);
  await user.click(screen.getByRole("button", { name: "Confirm simulated add" }));

  await user.selectOptions(
    screen.getByRole("combobox", {
      name: "Size for Seoul Shade Daily Fluid",
    }),
    "seoul-shade-30",
  );
  await user.click(
    screen.getByRole("button", { name: "Preview simulated add" }),
  );
  const nextReceipt = await screen.findByRole("region", {
    name: "Simulated cart preview",
  });
  expect(within(nextReceipt).getByText("seoul-shade-30")).toBeVisible();

  await act(async () => pendingAdd.resolve(cartItem));

  expect(screen.queryByText("Added to simulated cart")).not.toBeInTheDocument();
  expect(within(nextReceipt).getByText("seoul-shade-30")).toBeVisible();
  expect(within(nextReceipt).getAllByText("$14.00")).toHaveLength(2);
  expectSecretAbsent(firstPreview.confirmation_token);
  expectSecretAbsent(nextPreview.confirmation_token);
});

it("ignores a stale confirmation across a close and reopen cycle", async () => {
  const pendingAdd = deferred<CartItemResponse>();
  api.addCartItem.mockReturnValueOnce(pendingAdd.promise);
  const user = userEvent.setup();
  const { rerender } = render(<GuideSheet open onClose={vi.fn()} />);
  await screen.findByText(clarificationTurn.text);
  await user.click(screen.getByRole("button", { name: "Daily commute" }));
  await screen.findByText("Closest fit");
  await previewSeoulShade(user);
  await user.click(screen.getByRole("button", { name: "Confirm simulated add" }));

  rerender(<GuideSheet open={false} onClose={vi.fn()} />);
  expect(
    screen.queryByRole("dialog", { name: "AI shopping guide" }),
  ).not.toBeInTheDocument();
  rerender(<GuideSheet open onClose={vi.fn()} />);
  await screen.findByText(clarificationTurn.text);
  await user.click(screen.getByRole("button", { name: "Daily commute" }));
  await screen.findByText("Closest fit");
  const reopenedReceipt = await previewSeoulShade(user);

  await act(async () => pendingAdd.resolve(cartItem));

  expect(screen.queryByText("Added to simulated cart")).not.toBeInTheDocument();
  expect(reopenedReceipt).toBeVisible();
  expect(
    within(reopenedReceipt).getByRole("button", { name: "Confirm simulated add" }),
  ).toBeEnabled();
});

it("settles a pending confirmation harmlessly after unmount", async () => {
  const pendingAdd = deferred<CartItemResponse>();
  api.addCartItem.mockReturnValueOnce(pendingAdd.promise);
  const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
  const user = userEvent.setup();
  const view = render(<GuideSheet open onClose={vi.fn()} />);
  await screen.findByText(clarificationTurn.text);
  await user.click(screen.getByRole("button", { name: "Daily commute" }));
  await screen.findByText("Closest fit");
  await previewSeoulShade(user);
  await user.click(screen.getByRole("button", { name: "Confirm simulated add" }));

  view.unmount();
  await act(async () => pendingAdd.resolve(cartItem));

  expect(consoleError).not.toHaveBeenCalled();
  expect(screen.queryByText("Added to simulated cart")).not.toBeInTheDocument();
  consoleError.mockRestore();
});

it("disables cart controls when no recommendation has an eligible SKU", async () => {
  api.sendGuideMessage.mockResolvedValueOnce({
    ...recommendationTurn,
    recommendations: recommendationTurn.recommendations?.map(
      (recommendation) => ({ ...recommendation, eligible_sku_ids: [] }),
    ),
  });
  await reachRecommendations();

  const size = screen.getByRole("combobox", {
    name: "Size for Seoul Shade Daily Fluid",
  });
  expect(size).toBeDisabled();
  expect(size).toHaveValue("");
  expect(within(size).getByRole("option", { name: "No eligible SKU" })).toBeVisible();
  expect(
    screen.getByRole("button", { name: "Preview simulated add" }),
  ).toBeDisabled();
  expect(api.previewCart).not.toHaveBeenCalled();
  expect(screen.queryByText("Added to simulated cart")).not.toBeInTheDocument();
});

describe.each([
  ["PRICE_CHANGED", "The price changed. Preview again to review the latest price."],
  [
    "INSUFFICIENT_STOCK",
    "Stock changed. Choose another size or preview again.",
  ],
  [
    "INVALID_CONFIRMATION_TOKEN",
    "This confirmation is no longer valid. Preview again.",
  ],
] as const)("confirmation recovery for %s", (code, guidance) => {
  it("preserves the decision frame and never invents success", async () => {
    api.addCartItem.mockRejectedValue(new ApiError(409, code));
    const user = await reachRecommendations();
    await previewSeoulShade(user);
    await user.click(
      screen.getByRole("button", { name: "Confirm simulated add" }),
    );

    expect(await screen.findByText(guidance)).toBeVisible();
    expect(screen.getByRole("button", { name: "Preview again" })).toBeVisible();
    expect(screen.queryByText("Added to simulated cart")).not.toBeInTheDocument();
    expect(screen.getByText("Closest fit")).toBeVisible();
    expect(
      screen.getByRole("link", { name: /FDA sunscreen labeling guide/ }),
    ).toBeVisible();
    expectSecretAbsent(firstPreview.confirmation_token);
  });
});

it("maps a used confirmation exactly and Preview again obtains a fresh token", async () => {
  api.addCartItem.mockRejectedValueOnce(
    new ApiError(409, "TOKEN_ALREADY_USED"),
  );
  api.previewCart
    .mockResolvedValueOnce(firstPreview)
    .mockResolvedValueOnce(refreshedPreview);
  const user = await reachRecommendations();
  await previewSeoulShade(user);
  await user.click(screen.getByRole("button", { name: "Confirm simulated add" }));

  expect(
    await screen.findByText("This confirmation was already used"),
  ).toBeVisible();
  expect(screen.getByText("Closest fit")).toBeVisible();
  expect(
    screen.getByRole("link", { name: /FDA sunscreen labeling guide/ }),
  ).toBeVisible();

  await user.click(screen.getByRole("button", { name: "Preview again" }));
  expect(api.previewCart).toHaveBeenCalledTimes(2);
  expect(api.previewCart).toHaveBeenLastCalledWith(
    "ses_guide_1",
    "seoul-shade-50",
  );
  expect(await screen.findByText("6 units available")).toBeVisible();
  expectSecretAbsent(firstPreview.confirmation_token);
  expectSecretAbsent(refreshedPreview.confirmation_token);

  await user.click(screen.getByRole("button", { name: "Confirm simulated add" }));
  expect(api.addCartItem).toHaveBeenLastCalledWith(
    "ses_guide_1",
    refreshedPreview.confirmation_token,
  );
});

it("keeps selections and recommendations when comparison fails and permits a retry", async () => {
  api.compareProducts
    .mockRejectedValueOnce(new ApiError(503, "UNKNOWN_API_ERROR"))
    .mockResolvedValueOnce(comparison);
  const user = await reachRecommendations();
  await chooseComparison(user);
  await user.click(screen.getByRole("button", { name: "Compare 2" }));

  expect(
    await screen.findByText(
      "Comparison could not be loaded. Keep your selections and try comparing again.",
    ),
  ).toBeVisible();
  expect(screen.getByText("Closest fit")).toBeVisible();
  expect(
    screen.getByRole("link", { name: /FDA sunscreen labeling guide/ }),
  ).toBeVisible();
  const retry = screen.getByRole("button", { name: "Compare 2" });
  expect(retry).toBeEnabled();
  await user.click(retry);
  expect(
    await screen.findByRole("table", { name: "Product comparison" }),
  ).toBeVisible();
});

it("keeps the selected SKU when preview fails and permits a retry", async () => {
  api.previewCart
    .mockRejectedValueOnce(new ApiError(503, "UNKNOWN_API_ERROR"))
    .mockResolvedValueOnce(firstPreview);
  const user = await reachRecommendations();
  await user.selectOptions(
    screen.getByRole("combobox", {
      name: "Size for Seoul Shade Daily Fluid",
    }),
    "seoul-shade-50",
  );
  await user.click(
    screen.getByRole("button", { name: "Preview simulated add" }),
  );

  expect(
    await screen.findByText(
      "Current price and stock could not be checked. Keep this size selected and try previewing again.",
    ),
  ).toBeVisible();
  expect(
    screen.getByRole("combobox", {
      name: "Size for Seoul Shade Daily Fluid",
    }),
  ).toHaveValue("seoul-shade-50");
  expect(screen.getByText("Closest fit")).toBeVisible();
  await user.click(
    screen.getByRole("button", { name: "Preview simulated add" }),
  );
  expect(
    await screen.findByRole("region", { name: "Simulated cart preview" }),
  ).toBeVisible();
});

it("directs an out-of-stock preview toward another eligible size", async () => {
  api.previewCart.mockRejectedValue(
    new ApiError(409, "INSUFFICIENT_STOCK"),
  );
  const user = await reachRecommendations();
  await user.selectOptions(
    screen.getByRole("combobox", {
      name: "Size for Seoul Shade Daily Fluid",
    }),
    "seoul-shade-50",
  );
  await user.click(
    screen.getByRole("button", { name: "Preview simulated add" }),
  );

  expect(
    await screen.findByText(
      "This size no longer has enough stock. Choose another size and preview again.",
    ),
  ).toBeVisible();
  expect(screen.queryByText("Added to simulated cart")).not.toBeInTheDocument();
  expect(screen.getByText("Closest fit")).toBeVisible();
});

it("ignores a stale comparison after a new guide turn resets decision artifacts", async () => {
  const pendingComparison = deferred<CompareResponse>();
  api.compareProducts.mockReturnValue(pendingComparison.promise);
  const user = await reachRecommendations();
  await chooseComparison(user);
  await user.click(screen.getByRole("button", { name: "Compare 2" }));

  await user.type(screen.getByLabelText("Your must-haves"), "Now prioritize matte");
  await user.click(screen.getByRole("button", { name: "Find my match" }));
  await screen.findByText("Closest fit");
  await act(async () => pendingComparison.resolve(comparison));

  expect(api.sendGuideMessage).toHaveBeenLastCalledWith(
    "ses_guide_1",
    expect.stringMatching(/^msg_/),
    "Now prioritize matte",
  );
  expect(screen.getByRole("button", { name: "Compare 0" })).toBeDisabled();
  expect(
    screen.queryByRole("table", { name: "Product comparison" }),
  ).not.toBeInTheDocument();
});

it("does not let a stale preview update a closed sheet", async () => {
  const pendingPreview = deferred<CartPreviewResponse>();
  api.previewCart.mockReturnValue(pendingPreview.promise);
  const user = userEvent.setup();
  const { rerender } = render(<GuideSheet open onClose={vi.fn()} />);
  await screen.findByText(clarificationTurn.text);
  await user.click(screen.getByRole("button", { name: "Daily commute" }));
  await screen.findByText("Closest fit");
  await user.selectOptions(
    screen.getByRole("combobox", {
      name: "Size for Seoul Shade Daily Fluid",
    }),
    "seoul-shade-50",
  );
  await user.click(
    screen.getByRole("button", { name: "Preview simulated add" }),
  );

  rerender(<GuideSheet open={false} onClose={vi.fn()} />);
  await act(async () => pendingPreview.resolve(firstPreview));

  expect(
    screen.queryByRole("region", { name: "Simulated cart preview" }),
  ).not.toBeInTheDocument();
});
