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

import { CartConfirmation } from "@/components/cart-confirmation";
import { ComparisonTable } from "@/components/comparison-table";
import { GuideSheet } from "@/components/guide-sheet";

const api = vi.hoisted(() => {
  class ApiError extends Error {
    constructor(
      public status: number,
      public code: string,
    ) {
      super(code);
    }
  }

  return {
    ApiError,
    addCartItem: vi.fn(),
    compareProducts: vi.fn(),
    createGuideSession: vi.fn(),
    previewCart: vi.fn(),
    sendGuideMessage: vi.fn(),
  };
});

vi.mock("@/lib/api-client", () => api);

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

const clarificationTurn: GuideTurn = {
  session_id: "ses_guide_1",
  trace_id: "trace_guide_1",
  state: "CLARIFY",
  kind: "clarification",
  text: "Is water resistance a must, or is this mainly for a daily commute?",
  context,
  quick_replies: ["Daily commute"],
};

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
    ignored_future_fact: ["must", "not render"],
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
  confirmation_token: "confirm_secret_first",
  created_at: "2026-08-05T00:00:00Z",
  simulated: true,
};

const refreshedPreview: CartPreviewResponse = {
  ...firstPreview,
  confirmation_token: "confirm_secret_refreshed",
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
  expect(within(table).queryByText("ignored_future_fact")).not.toBeInTheDocument();
  expect(within(table).queryByText("must")).not.toBeInTheDocument();
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

it("previews exact facts, keeps the token secret, and adds only after resolved confirmation", async () => {
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
  expect(document.body).not.toHaveTextContent(firstPreview.confirmation_token);
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
  expect(await screen.findByText("Added to simulated cart")).toBeVisible();
  expect(screen.getByText("item_simulated_1")).toBeVisible();
  expect(screen.getByText(/no order or payment was created/i)).toBeVisible();
  expect(document.body).not.toHaveTextContent(firstPreview.confirmation_token);
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
    api.addCartItem.mockRejectedValue(new api.ApiError(409, code));
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
    expect(document.body).not.toHaveTextContent(firstPreview.confirmation_token);
  });
});

it("maps a used confirmation exactly and Preview again obtains a fresh token", async () => {
  api.addCartItem.mockRejectedValueOnce(
    new api.ApiError(409, "TOKEN_ALREADY_USED"),
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
  expect(document.body).not.toHaveTextContent(firstPreview.confirmation_token);
  expect(document.body).not.toHaveTextContent(refreshedPreview.confirmation_token);

  await user.click(screen.getByRole("button", { name: "Confirm simulated add" }));
  expect(api.addCartItem).toHaveBeenLastCalledWith(
    "ses_guide_1",
    refreshedPreview.confirmation_token,
  );
});

it("keeps selections and recommendations when comparison fails and permits a retry", async () => {
  api.compareProducts
    .mockRejectedValueOnce(new api.ApiError(503, "UNKNOWN_API_ERROR"))
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
    .mockRejectedValueOnce(new api.ApiError(503, "UNKNOWN_API_ERROR"))
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
    new api.ApiError(409, "INSUFFICIENT_STOCK"),
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

it("CartConfirmation never renders success without a CartItemResponse", () => {
  render(
    <CartConfirmation
      preview={firstPreview}
      pending={false}
      errorCode={null}
      onConfirm={vi.fn()}
    />,
  );

  expect(screen.queryByText("Added to simulated cart")).not.toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Confirm simulated add" }),
  ).toBeVisible();
  expect(document.body).not.toHaveTextContent(firstPreview.confirmation_token);
});
