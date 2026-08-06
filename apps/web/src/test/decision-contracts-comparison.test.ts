import { describe, expect, it } from "vitest";

import { validateGuideTurnResponse } from "@/lib/decision-contracts";

const comparison = {
  session_id: "ses_comparison",
  state: "COMPARE",
  product_ids: ["seoul-shade-daily-fluid", "cloud-veil-mineral"],
  rows: {
    starting_price_usd: [14, 17],
    fragrance_free: [true, true],
    water_resistance_minutes: [null, 40],
    finish: ["natural", "matte"],
    white_cast_risk: ["low", "medium"],
  },
  simulated: true,
};

const comparisonReadyTurn = {
  session_id: "ses_comparison",
  trace_id: "trc_comparison",
  locale: "zh-CN",
  state: "COMPARE",
  kind: "recommendation",
  text: "已生成 2 款商品的结构化比较。",
  context: {
    id: "morning-routine-uv-001",
    anchor_product_id: "seoul-shade-daily-fluid",
    anchor_product_name: "Seoul Shade Daily Fluid",
    creator_handle: "@synthetic_creator",
    caption: "Synthetic sunscreen demo",
    claims: [],
  },
  guide_status: "ACTIVE",
  guide_view_kind: "COMPARISON_READY",
  guide_revision: 2,
  facts_snapshot_at: "2026-08-05T12:00:00Z",
  allowed_actions: ["OPEN_PRODUCT", "RETURN_TO_FEED"],
  degraded: false,
  verdict: "SUITABLE",
  recommendations: [],
  evidence: [],
  quick_replies: [],
  comparison,
};

describe("Guide comparison snapshot validation", () => {
  it("accepts a typed two-product COMPARISON_READY snapshot", () => {
    expect(validateGuideTurnResponse(comparisonReadyTurn)).toEqual(
      comparisonReadyTurn,
    );
  });

  it("rejects COMPARISON_READY without its comparison payload", () => {
    const missingComparison: Record<string, unknown> = {
      ...comparisonReadyTurn,
    };
    delete missingComparison.comparison;

    expect(validateGuideTurnResponse(missingComparison)).toBeNull();
  });

  it("rejects COMPARISON_READY with malformed comparison rows", () => {
    expect(
      validateGuideTurnResponse({
        ...comparisonReadyTurn,
        comparison: {
          ...comparison,
          rows: {
            ...comparison.rows,
            starting_price_usd: [14],
          },
        },
      }),
    ).toBeNull();
  });

  it("requires the exact COMPARISON_READY action set", () => {
    expect(
      validateGuideTurnResponse({
        ...comparisonReadyTurn,
        allowed_actions: ["OPEN_PRODUCT"],
      }),
    ).toBeNull();
  });

  it("rejects a COMPARISON_READY payload whose parent workflow is still CLARIFY", () => {
    expect(
      validateGuideTurnResponse({
        ...comparisonReadyTurn,
        state: "CLARIFY",
      }),
    ).toBeNull();
  });
});
