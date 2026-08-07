import type { components } from "@shopping-guide/contracts/src/api";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ComparisonTable } from "@/components/comparison-table";
import { RecommendationCard } from "@/components/recommendation-card";
import {
  validateCommerceOperationResponse,
  validateGuideTurnResponse,
} from "@/lib/decision-contracts";

type GuideTurn = components["schemas"]["GuideTurnResponse"];
type EvidenceReference = components["schemas"]["EvidenceReference"];
type CompareResponse = components["schemas"]["CompareResponse"];

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

const clarificationTurn: GuideTurn = {
  session_id: "ses_guide_1",
  trace_id: "trace_guide_1",
  state: "CLARIFY",
  kind: "clarification",
  text: "主要是日常通勤，还是需要 40/80 分钟防水？",
  context,
  quick_replies: ["日常通勤", "40 分钟", "80 分钟", "跳过"],
  locale: "zh-CN",
  guide_status: "WAITING_USER",
  guide_view_kind: "WAITING_CLARIFICATION",
  guide_revision: 1,
  facts_snapshot_at: "2026-08-05T00:00:00Z",
  allowed_actions: [
    "ANSWER_CLARIFICATION",
    "SKIP_CLARIFICATION",
    "UPDATE_CONSTRAINTS",
    "RETURN_TO_FEED",
  ],
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
  allowed_actions: [
    "SELECT_SKU",
    "SET_QUANTITY",
    "CONFIRM_ADD_TO_CART",
    "CANCEL_CONFIRMATION",
    "RETURN_TO_PRODUCT",
  ],
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
  confirmation_token: "confirm_synthetic_first",
  confirmation_expires_at: "2026-08-05T00:05:00Z",
  simulated: true,
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

const recommendation: components["schemas"]["RecommendationCard"] = {
  product_id: "seoul-shade-daily-fluid",
  brand: "Mirae Lab",
  name: "Seoul Shade Daily Fluid",
  verdict: "SUITABLE",
  starting_price_usd: 14,
  fit_reasons: ["natural finish"],
  tradeoffs: ["No labeled water resistance"],
  evidence_ids: ["fda-sunscreen-basics"],
  eligible_sku_ids: ["seoul-shade-30", "seoul-shade-50"],
};

const publicEvidence: EvidenceReference = {
  evidence_id: "fda-sunscreen-basics",
  source_kind: "public_rule",
  status: "SUPPORTED",
  synthetic: false,
  title: "FDA sunscreen labeling guide",
  summary: "Broad-spectrum labeling and directions work together.",
  url: "https://www.fda.gov/drugs/sunscreen-guide",
};

afterEach(cleanup);

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

  it("rejects missing Guide truth fields instead of rendering a partial answer", () => {
    for (const malformed of [
      { ...clarificationTurn, state: undefined },
      { ...clarificationTurn, text: "" },
      { ...clarificationTurn, context: undefined },
      { ...clarificationTurn, facts_snapshot_at: undefined },
    ]) {
      expect(validateGuideTurnResponse(malformed)).toBeNull();
    }
  });

  it("keeps unknown commerce commits reconciliation-only", () => {
    expect(
      validateCommerceOperationResponse({
        ...awaitingCommerceOperation,
        commerce_view_kind: "COMMIT_STATUS_UNKNOWN",
        operation_status: "RECONCILIATION_REQUIRED",
        allowed_actions: ["RECONCILE_COMMIT", "RETURN_TO_PRODUCT"],
        confirmation_token: null,
        confirmation_expires_at: null,
        error_code: "COMMIT_STATUS_UNKNOWN",
      }),
    ).not.toBeNull();
    expect(
      validateCommerceOperationResponse({
        ...awaitingCommerceOperation,
        commerce_view_kind: "COMMIT_STATUS_UNKNOWN",
        operation_status: "RECONCILIATION_REQUIRED",
        allowed_actions: ["RETRY_COMMERCE_OPERATION"],
      }),
    ).toBeNull();
  });

  it("rejects unknown Commerce actions and post-success secret material", () => {
    expect(
      validateCommerceOperationResponse({
        ...awaitingCommerceOperation,
        allowed_actions: ["CONFIRM_ADD_TO_CART", "UNKNOWN_COMMERCE_ACTION"],
      }),
    ).toBeNull();
    expect(
      validateCommerceOperationResponse({
        ...awaitingCommerceOperation,
        commerce_view_kind: "SUCCEEDED",
        operation_status: "SUCCEEDED",
        allowed_actions: ["RETURN_TO_PRODUCT", "CONTINUE_BROWSING"],
        confirmation_token: null,
        confirmation_expires_at: "2026-08-05T00:05:00Z",
      }),
    ).toBeNull();
  });

  it("rejects malformed previous values in a server fact diff", () => {
    expect(
      validateCommerceOperationResponse({
        ...awaitingCommerceOperation,
        commerce_view_kind: "FACTS_CHANGED",
        allowed_actions: [
          "ACCEPT_UPDATED_FACTS",
          "RESELECT_SKU",
          "CANCEL_CONFIRMATION",
          "RETURN_TO_PRODUCT",
        ],
        confirmation_token: null,
        confirmation_expires_at: null,
        error_code: "FACTS_CHANGED",
        facts_diff: [
          {
            field: "unit_price_usd",
            previous_value: "nineteen dollars",
            current_value: 19,
          },
        ],
      }),
    ).toBeNull();
  });

  it("requires the canonical PDP_READY and FAILED action pairs", () => {
    for (const valid of [
      {
        ...awaitingCommerceOperation,
        commerce_view_kind: "PDP_READY",
        operation_status: "ACTIVE",
        allowed_actions: ["PREVIEW_CART", "RETURN_TO_PRODUCT"],
        confirmation_token: null,
        confirmation_expires_at: null,
      },
      {
        ...awaitingCommerceOperation,
        commerce_view_kind: "FAILED",
        operation_status: "FAILED",
        allowed_actions: ["RETRY_COMMERCE_OPERATION", "RETURN_TO_PRODUCT"],
        confirmation_token: null,
        confirmation_expires_at: null,
        error_code: "TEMPORARY_FAILURE",
      },
    ]) {
      expect(validateCommerceOperationResponse(valid)).not.toBeNull();
    }
    expect(
      validateCommerceOperationResponse({
        ...awaitingCommerceOperation,
        commerce_view_kind: "PDP_READY",
        operation_status: "ACTIVE",
        allowed_actions: ["RETURN_TO_PRODUCT"],
        confirmation_token: null,
        confirmation_expires_at: null,
      }),
    ).toBeNull();
    expect(
      validateCommerceOperationResponse({
        ...awaitingCommerceOperation,
        commerce_view_kind: "FAILED",
        operation_status: "FAILED",
        allowed_actions: ["RETURN_TO_PRODUCT"],
        confirmation_token: null,
        confirmation_expires_at: null,
      }),
    ).toBeNull();
  });
});

it("hides unverified comparison price while rendering the four verified dimensions", async () => {
  const user = userEvent.setup();
  const onOpenProduct = vi.fn();
  render(
    <ComparisonTable
      comparison={comparison}
      productNames={{
        "seoul-shade-daily-fluid": "Seoul Shade Daily Fluid",
        "cloud-veil-mineral": "Cloud Veil Mineral SPF",
      }}
      anchorProductId="seoul-shade-daily-fluid"
      onOpenProduct={onOpenProduct}
    />,
  );

  const table = screen.getByRole("table", { name: "商品对比" });
  const rows = within(table).getAllByRole("row");
  expect(rows).toHaveLength(5);
  expect(
    within(rows[0])
      .getAllByRole("columnheader")
      .map((cell) => cell.textContent),
  ).toEqual(["对比维度", "Seoul Shade Daily Fluid", "Cloud Veil Mineral SPF"]);
  expect(within(table).queryByText(/起售价|\$14|\$17/)).not.toBeInTheDocument();
  expect(within(rows[1]).getAllByRole("cell").map((cell) => cell.textContent)).toEqual([
    "是",
    "否",
  ]);
  expect(within(rows[2]).getAllByRole("cell").map((cell) => cell.textContent)).toEqual([
    "未标注防水",
    "40 分钟",
  ]);
  expect(screen.getByText(/价格与库存请进入商品页重新核验/)).toBeVisible();

  await user.click(screen.getByRole("button", { name: "查看 Cloud Veil Mineral SPF" }));
  expect(onOpenProduct).toHaveBeenCalledWith("cloud-veil-mineral", "alternative");
});

it("keeps disabled recommendation and comparison actions inert even if the DOM is tampered with", () => {
  const onOpenProduct = vi.fn();
  const onCompareChange = vi.fn();
  const { rerender } = render(
    <RecommendationCard
      recommendation={recommendation}
      index={0}
      role="current"
      evidence={[publicEvidence]}
      comparisonEnabled
      selectedForCompare={false}
      disabled
      onCompareChange={onCompareChange}
      onOpenProduct={onOpenProduct}
    />,
  );

  const checkbox = screen.getByRole("checkbox", {
    name: "比较 Seoul Shade Daily Fluid",
  });
  const open = screen.getByRole("button", { name: "查看商品" });
  expect(checkbox).toBeDisabled();
  expect(open).toBeDisabled();
  checkbox.removeAttribute("disabled");
  open.removeAttribute("disabled");
  fireEvent.click(checkbox);
  fireEvent.click(open);
  expect(onCompareChange).not.toHaveBeenCalled();
  expect(onOpenProduct).not.toHaveBeenCalled();

  rerender(
    <ComparisonTable
      comparison={comparison}
      productNames={{
        "seoul-shade-daily-fluid": "Seoul Shade Daily Fluid",
        "cloud-veil-mineral": "Cloud Veil Mineral SPF",
      }}
      anchorProductId="seoul-shade-daily-fluid"
      disabled
      onOpenProduct={onOpenProduct}
    />,
  );
  const comparisonOpen = screen.getByRole("button", {
    name: "查看 Cloud Veil Mineral SPF",
  });
  expect(comparisonOpen).toBeDisabled();
  comparisonOpen.removeAttribute("disabled");
  fireEvent.click(comparisonOpen);
  expect(onOpenProduct).not.toHaveBeenCalled();
});

it("keeps RecommendationCard decision-only and routes current product to PDP", async () => {
  const user = userEvent.setup();
  const onOpenProduct = vi.fn();
  const onCompareChange = vi.fn();
  render(
    <RecommendationCard
      recommendation={recommendation}
      index={0}
      role="current"
      evidence={[publicEvidence]}
      comparisonEnabled
      selectedForCompare={false}
      onCompareChange={onCompareChange}
      onOpenProduct={onOpenProduct}
    />,
  );

  const card = screen.getByRole("article", {
    name: "Seoul Shade Daily Fluid 商品建议",
  });
  expect(within(card).queryByRole("combobox")).not.toBeInTheDocument();
  expect(within(card).queryByText("$14.00")).not.toBeInTheDocument();
  expect(card.textContent).not.toContain("seoul-shade-30");
  await user.click(within(card).getByRole("checkbox", { name: "比较 Seoul Shade Daily Fluid" }));
  expect(onCompareChange).toHaveBeenCalledWith(
    "seoul-shade-daily-fluid",
    true,
  );
  await user.click(within(card).getByRole("button", { name: "查看商品" }));
  expect(onOpenProduct).toHaveBeenCalledWith(
    "seoul-shade-daily-fluid",
    "current",
  );
});
