import type { components } from "@shopping-guide/contracts/src/api";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DemoShell } from "@/components/demo-shell";
import { PdpScreen } from "@/components/pdp-screen";
import { ApiError } from "@/lib/api-client";

const api = vi.hoisted(() => ({
  acceptUpdatedFacts: vi.fn(),
  confirmCommerce: vi.fn(),
  createGuideSession: vi.fn(),
  getCommerceOperation: vi.fn(),
  getFeed: vi.fn(),
  getGuideSession: vi.fn(),
  getProduct: vi.fn(),
  previewCommerce: vi.fn(),
  reconcileCommerce: vi.fn(),
  sendGuideMessage: vi.fn(),
}));

vi.mock("@/lib/api-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api-client")>()),
  ...api,
}));

type FeedResponse = components["schemas"]["FeedResponse"];
type ProductDetail = components["schemas"]["ProductDetailResponse"];
type CommerceOperation = components["schemas"]["CommerceOperationResponse"];
type GuideTurn = components["schemas"]["GuideTurnResponse"];

const PRODUCT: ProductDetail = {
  freshness: {
    facts_version: "catalog-2026-08-05-seoul-v1",
    observed_at: "2026-08-05T09:00:00Z",
    expires_at: "2099-08-12T09:00:00Z",
  },
  starting_price_usd: 14,
  synthetic_disclosure: true,
  product: {
    id: "seoul-shade-daily-fluid",
    brand: "Mirae Lab",
    name: "Seoul Shade Daily Fluid",
    display_name_zh: "首尔轻透通勤防晒乳",
    description_zh: "适合潮湿通勤场景的轻薄 SPF 50 广谱防晒，妆前使用感为自然妆效。",
    synthetic: true,
    spf: 50,
    broad_spectrum: true,
    fragrance_free: true,
    water_resistance_minutes: null,
    finish: "natural",
    skin_types: ["combination", "oily", "sensitive"],
    white_cast_risk: "low",
    active_filter_type: "organic",
    ingredient_highlights: ["centella asiatica", "panthenol"],
    media: {
      kind: "image",
      src: "/demo/product-seoul-shade.svg",
      poster_src: null,
      alt_zh: "Seoul Shade Daily Fluid 合成商品包装图",
      license_ref: "自有合成 SVG 资产",
    },
    shipping: {
      market: "US",
      fee_usd: 3.99,
      eta_min_days: 4,
      eta_max_days: 7,
      return_summary_zh: "签收后 30 天内可申请退货；商品需保持未开封状态。",
    },
    list_price_usd: 22,
    promotion: null,
    store_name: "Mirae Lab 官方合成店",
    facts_version: "catalog-2026-08-05-seoul-v1",
    observed_at: "2026-08-05T09:00:00Z",
    expires_at: "2099-08-12T09:00:00Z",
    skus: [
      {
        id: "seoul-shade-30",
        size_ml: 30,
        price_usd: 14,
        in_stock: true,
        inventory_units: 18,
        label: "30 mL 便携装",
        image_src: "/demo/product-seoul-shade.svg",
      },
      {
        id: "seoul-shade-50",
        size_ml: 50,
        price_usd: 19,
        in_stock: true,
        inventory_units: 7,
        label: "50 mL 正装",
        image_src: "/demo/product-seoul-shade.svg",
      },
    ],
  },
};

const FEED: FeedResponse = {
  feed_tabs: ["For You", "Following"],
  bottom_nav_variant: "shopping-agent",
  items: [
    {
      id: "feed-uv-morning-001",
      synthetic: true,
      creator_handle: "@routine.notes",
      creator_display_name: "Routine Notes",
      caption_zh: "潮湿通勤前的轻薄防晒步骤。",
      media: {
        kind: "video",
        src: "/demo/feed-commerce.mp4",
        poster_src: "/demo/feed-commerce-poster.jpg",
        alt_zh: "创作者展示合成防晒商品的视频",
        license_ref: "Pexels License",
      },
      engagement: { likes: 24800, comments: 642, favorites: 3100, shares: 488 },
      content_context_id: "morning-routine-uv-001",
      anchor_product_id: PRODUCT.product.id,
      commerce_status: "available",
      anchor_product: {
        id: PRODUCT.product.id,
        brand: PRODUCT.product.brand,
        name: PRODUCT.product.name,
        display_name_zh: PRODUCT.product.display_name_zh,
        starting_price_usd: PRODUCT.starting_price_usd,
        image_src: PRODUCT.product.media.src,
      },
    },
  ],
};

const GUIDE_DECISION: GuideTurn = {
  session_id: "ses_pdp_ai",
  trace_id: "trace_pdp_ai",
  state: "PRESENT_RECOMMENDATION",
  kind: "recommendation",
  text: "当前商品满足日常通勤条件，进入商品页后仍会复核交易事实。",
  context: {
    id: "morning-routine-uv-001",
    anchor_product_id: PRODUCT.product.id,
    anchor_product_name: PRODUCT.product.name,
    creator_handle: "@routine.notes",
    caption: "潮湿通勤前的轻薄防晒步骤。",
    claims: [],
  },
  quick_replies: [],
  locale: "zh-CN",
  guide_status: "ACTIVE",
  guide_view_kind: "DECISION_READY",
  guide_revision: 4,
  facts_snapshot_at: "2026-08-05T09:00:00Z",
  allowed_actions: ["OPEN_PRODUCT", "RETURN_TO_FEED"],
  degraded: false,
  verdict: "SUITABLE",
  recommendations: [
    {
      product_id: PRODUCT.product.id,
      brand: PRODUCT.product.brand,
      name: PRODUCT.product.name,
      verdict: "SUITABLE",
      starting_price_usd: 14,
      fit_reasons: ["适合日常通勤"],
      tradeoffs: ["没有标注防水时长"],
      evidence_ids: ["ev_public"],
      eligible_sku_ids: ["seoul-shade-30", "seoul-shade-50"],
    },
  ],
  evidence: [
    {
      evidence_id: "ev_public",
      title: "公开规则快照",
      url: "https://www.fda.gov/drugs/sunscreen-guide",
      source_kind: "public_rule",
      synthetic: false,
      status: "SUPPORTED",
      summary: "Broad-spectrum sunscreen fact snapshot.",
    },
  ],
};

function awaitingConfirmation(
  overrides: Partial<CommerceOperation> = {},
): CommerceOperation {
  return {
    operation_id: "cop_direct_1",
    purchase_origin: "FEED",
    product_id: PRODUCT.product.id,
    sku_id: "seoul-shade-50",
    quantity: 2,
    transaction_revision: 1,
    facts_version: PRODUCT.product.facts_version,
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
      product_id: PRODUCT.product.id,
      sku_id: "seoul-shade-50",
      quantity: 2,
      unit_price_usd: 19,
      subtotal_usd: 38,
      inventory_units: 7,
      in_stock: true,
      facts_version: PRODUCT.product.facts_version,
      observed_at: PRODUCT.product.observed_at,
    },
    facts_diff: [],
    confirmation_token: "cft_private_direct",
    confirmation_expires_at: "2099-08-05T09:05:00Z",
    simulated: true,
    ...overrides,
  };
}

function succeededOperation(idempotencyKey: string): CommerceOperation {
  const awaiting = awaitingConfirmation({
    sku_id: "seoul-shade-30",
    quantity: 1,
    facts: {
      ...awaitingConfirmation().facts,
      sku_id: "seoul-shade-30",
      quantity: 1,
      unit_price_usd: 14,
      subtotal_usd: 14,
      inventory_units: 17,
    },
  });
  return {
    ...awaiting,
    commerce_view_kind: "SUCCEEDED",
    operation_status: "SUCCEEDED",
    allowed_actions: ["RETURN_TO_PRODUCT", "CONTINUE_BROWSING"],
    confirmation_token: undefined,
    confirmation_expires_at: undefined,
    receipt: {
      receipt_id: "rcp_direct_1",
      cart_id: "cart_simulated",
      cart_item_id: "item_direct_1",
      operation_id: awaiting.operation_id,
      idempotency_key: idempotencyKey,
      product_id: awaiting.product_id,
      sku_id: awaiting.sku_id,
      quantity: awaiting.quantity,
      unit_price_usd: awaiting.facts.unit_price_usd,
      subtotal_usd: awaiting.facts.subtotal_usd,
      facts_version: awaiting.facts_version,
      committed_at: "2026-08-05T09:01:00Z",
      simulated: true,
      order_created: false,
      payment_created: false,
    },
  };
}

function changedFactsOperation(
  inStock = true,
): CommerceOperation {
  const awaiting = awaitingConfirmation({
    sku_id: "seoul-shade-30",
    quantity: 1,
  });
  return {
    ...awaiting,
    facts_version: "catalog-2026-08-05-seoul-v2",
    commerce_view_kind: "FACTS_CHANGED",
    allowed_actions: inStock
      ? [
          "ACCEPT_UPDATED_FACTS",
          "RESELECT_SKU",
          "CANCEL_CONFIRMATION",
          "RETURN_TO_PRODUCT",
        ]
      : ["RESELECT_SKU", "RETURN_TO_PRODUCT"],
    facts: {
      ...awaiting.facts,
      sku_id: "seoul-shade-30",
      quantity: 1,
      unit_price_usd: 15,
      subtotal_usd: 15,
      inventory_units: inStock ? 16 : 0,
      in_stock: inStock,
      facts_version: "catalog-2026-08-05-seoul-v2",
    },
    facts_diff: [
      { field: "unit_price_usd", previous_value: 14, current_value: 15 },
      {
        field: "inventory_units",
        previous_value: 18,
        current_value: inStock ? 16 : 0,
      },
      ...(inStock
        ? []
        : [{ field: "in_stock", previous_value: true, current_value: false }]),
      {
        field: "facts_version",
        previous_value: PRODUCT.product.facts_version,
        current_value: "catalog-2026-08-05-seoul-v2",
      },
    ],
    confirmation_token: undefined,
    confirmation_expires_at: undefined,
    error_code: inStock ? "FACTS_CHANGED" : "OUT_OF_STOCK",
  };
}

function unknownOperation(): CommerceOperation {
  return {
    ...awaitingConfirmation({
      sku_id: "seoul-shade-30",
      quantity: 1,
      facts: {
        ...awaitingConfirmation().facts,
        sku_id: "seoul-shade-30",
        quantity: 1,
        unit_price_usd: 14,
        subtotal_usd: 14,
        inventory_units: 17,
      },
    }),
    commerce_view_kind: "COMMIT_STATUS_UNKNOWN",
    operation_status: "RECONCILIATION_REQUIRED",
    allowed_actions: ["RECONCILE_COMMIT", "RETURN_TO_PRODUCT"],
    confirmation_token: undefined,
    confirmation_expires_at: undefined,
    error_code: "COMMIT_STATUS_UNKNOWN",
  };
}

beforeEach(() => {
  for (const fn of Object.values(api)) fn.mockReset();
  api.getFeed.mockResolvedValue(FEED);
  api.getProduct.mockResolvedValue(PRODUCT);
  api.createGuideSession.mockImplementation(() => new Promise(() => undefined));
  api.getGuideSession.mockImplementation(() => new Promise(() => undefined));
  api.previewCommerce.mockResolvedValue(
    awaitingConfirmation({
      sku_id: "seoul-shade-30",
      quantity: 1,
      facts: {
        ...awaitingConfirmation().facts,
        sku_id: "seoul-shade-30",
        quantity: 1,
        unit_price_usd: 14,
        subtotal_usd: 14,
        inventory_units: 18,
      },
    }),
  );
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("PDP transaction flow", () => {
  it("loads live catalog facts and starts a direct Feed preview without Guide provenance", async () => {
    const user = userEvent.setup();
    render(<DemoShell />);

    await user.click(
      await screen.findByRole("button", { name: /查看商品 Seoul Shade Daily Fluid/ }),
    );
    const pdp = await screen.findByRole("region", { name: "商品详情" });
    expect(within(pdp).getByRole("heading", { name: PRODUCT.product.name })).toBeVisible();
    expect(within(pdp).getByText(PRODUCT.product.display_name_zh)).toBeVisible();
    expect(within(pdp).queryByText(/AI 建议商品/)).toBeNull();

    await user.click(within(pdp).getByRole("radio", { name: /50 mL 正装/ }));
    await user.click(within(pdp).getByRole("button", { name: "增加数量" }));
    await user.click(within(pdp).getByRole("button", { name: "模拟加入购物车" }));

    expect(api.previewCommerce).toHaveBeenCalledWith({
      purchase_origin: "FEED",
      product_id: PRODUCT.product.id,
      sku_id: "seoul-shade-50",
      quantity: 2,
      expected_transaction_revision: 0,
      demo_scenario: "NORMAL",
    });
  });

  it("revalidates an exact live Guide revision before showing and sending AI provenance", async () => {
    const user = userEvent.setup();
    api.createGuideSession.mockResolvedValue(GUIDE_DECISION);
    api.getGuideSession.mockResolvedValue(GUIDE_DECISION);
    api.previewCommerce.mockResolvedValue(
      awaitingConfirmation({
        purchase_origin: "AI",
        guide_session_id: GUIDE_DECISION.session_id,
        source_guide_revision: GUIDE_DECISION.guide_revision,
        sku_id: "seoul-shade-30",
        quantity: 1,
        facts: {
          ...awaitingConfirmation().facts,
          sku_id: "seoul-shade-30",
          quantity: 1,
          unit_price_usd: 14,
          subtotal_usd: 14,
          inventory_units: 18,
        },
      }),
    );
    render(<DemoShell />);

    await user.click(
      await screen.findByRole("button", { name: /问 AI：Seoul Shade Daily Fluid/ }),
    );
    const recommendation = await screen.findByRole("article", {
      name: "Seoul Shade Daily Fluid 商品建议",
    });
    await user.click(within(recommendation).getByRole("button", { name: "查看商品" }));

    const pdp = await screen.findByRole("region", { name: "商品详情" });
    expect(await within(pdp).findByText("AI 建议商品 · 当前款")).toBeVisible();
    expect(api.getGuideSession).toHaveBeenCalledWith(GUIDE_DECISION.session_id);

    await user.click(within(pdp).getByRole("button", { name: "模拟加入购物车" }));
    expect(api.previewCommerce).toHaveBeenCalledWith({
      purchase_origin: "AI",
      guide_session_id: GUIDE_DECISION.session_id,
      source_guide_revision: GUIDE_DECISION.guide_revision,
      product_id: PRODUCT.product.id,
      sku_id: "seoul-shade-30",
      quantity: 1,
      expected_transaction_revision: 0,
      demo_scenario: "NORMAL",
    });
  });

  it("downgrades a stale Guide revision to an unattributed Feed purchase", async () => {
    const user = userEvent.setup();
    api.createGuideSession.mockResolvedValue(GUIDE_DECISION);
    api.getGuideSession.mockResolvedValue({
      ...GUIDE_DECISION,
      guide_revision: GUIDE_DECISION.guide_revision + 1,
    });
    render(<DemoShell />);

    await user.click(
      await screen.findByRole("button", { name: /问 AI：Seoul Shade Daily Fluid/ }),
    );
    const recommendation = await screen.findByRole("article", {
      name: "Seoul Shade Daily Fluid 商品建议",
    });
    await user.click(within(recommendation).getByRole("button", { name: "查看商品" }));

    const pdp = await screen.findByRole("region", { name: "商品详情" });
    expect(
      await within(pdp).findByText("导购结果已更新，本次按商品页事实直接复核"),
    ).toBeVisible();
    expect(within(pdp).queryByText(/AI 建议商品/)).toBeNull();

    await user.click(within(pdp).getByRole("button", { name: "模拟加入购物车" }));
    expect(api.previewCommerce).toHaveBeenCalledWith({
      purchase_origin: "FEED",
      product_id: PRODUCT.product.id,
      sku_id: "seoul-shade-30",
      quantity: 1,
      expected_transaction_revision: 0,
      demo_scenario: "NORMAL",
    });
  });

  it("shows server-rechecked facts and treats confirmation cancel as local only", async () => {
    const user = userEvent.setup();
    api.previewCommerce.mockResolvedValue(
      awaitingConfirmation({
        sku_id: "seoul-shade-30",
        quantity: 1,
        facts: {
          ...awaitingConfirmation().facts,
          sku_id: "seoul-shade-30",
          quantity: 1,
          unit_price_usd: 14,
          subtotal_usd: 14,
          inventory_units: 18,
        },
      }),
    );
    render(<DemoShell />);

    await user.click(
      await screen.findByRole("button", { name: /查看商品 Seoul Shade Daily Fluid/ }),
    );
    await user.click(
      await screen.findByRole("button", { name: "模拟加入购物车" }),
    );

    const drawer = await screen.findByRole("dialog", { name: "复核模拟加购" });
    expect(drawer).toHaveTextContent("$14.00");
    expect(drawer).toHaveTextContent("18 件");
    expect(drawer).toHaveTextContent("数量 1");
    expect(document.body).not.toHaveTextContent("cft_private_direct");

    await user.click(within(drawer).getByRole("button", { name: "取消" }));
    expect(screen.queryByRole("dialog", { name: "复核模拟加购" })).toBeNull();
    expect(api.confirmCommerce).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "模拟加入购物车" })).toBeVisible();
  });

  it("confirms once with a client-held idempotency key and shows a deduplicated simulated receipt", async () => {
    const user = userEvent.setup();
    let resolveConfirmation!: (operation: CommerceOperation) => void;
    api.previewCommerce.mockResolvedValue(
      awaitingConfirmation({
        sku_id: "seoul-shade-30",
        quantity: 1,
        facts: {
          ...awaitingConfirmation().facts,
          sku_id: "seoul-shade-30",
          quantity: 1,
          unit_price_usd: 14,
          subtotal_usd: 14,
          inventory_units: 18,
        },
      }),
    );
    api.confirmCommerce.mockImplementation(
      () =>
        new Promise<CommerceOperation>((resolve) => {
          resolveConfirmation = resolve;
        }),
    );
    render(<DemoShell />);

    await user.click(
      await screen.findByRole("button", { name: /查看商品 Seoul Shade Daily Fluid/ }),
    );
    await user.click(await screen.findByRole("button", { name: "模拟加入购物车" }));
    const drawer = await screen.findByRole("dialog", { name: "复核模拟加购" });
    const confirm = within(drawer).getByRole("button", { name: "确认模拟加购" });
    await user.dblClick(confirm);

    expect(api.confirmCommerce).toHaveBeenCalledTimes(1);
    const [operationId, request] = api.confirmCommerce.mock.calls[0] as [
      string,
      components["schemas"]["CommerceAddRequest"],
    ];
    expect(operationId).toBe("cop_direct_1");
    expect(request).toMatchObject({
      confirmation_token: "cft_private_direct",
      expected_transaction_revision: 1,
      demo_scenario: "NORMAL",
    });
    expect(request.idempotency_key).toMatch(/^idem_/);
    expect(document.body).not.toHaveTextContent("cft_private_direct");

    resolveConfirmation(succeededOperation(request.idempotency_key));
    const receipt = await screen.findByRole("dialog", { name: "模拟加购回执" });
    expect(receipt).toHaveTextContent("模拟加购成功");
    expect(receipt).toHaveTextContent("未创建订单或支付");
    const receiptButtons = within(receipt).getAllByRole("button");
    expect(receiptButtons.map((button) => button.textContent)).toEqual([
      "返回商品",
      "继续浏览",
    ]);
    await user.click(receiptButtons[0]);
    expect(screen.getByRole("button", { name: "购物车，1 件" })).toBeVisible();
    expect(document.body).not.toHaveTextContent(request.idempotency_key);
  });

  it("preserves the exact operation lineage when selection changes after local cancel", async () => {
    const user = userEvent.setup();
    api.previewCommerce
      .mockResolvedValueOnce(
        awaitingConfirmation({
          sku_id: "seoul-shade-30",
          quantity: 1,
          facts: {
            ...awaitingConfirmation().facts,
            sku_id: "seoul-shade-30",
            quantity: 1,
            unit_price_usd: 14,
            subtotal_usd: 14,
            inventory_units: 18,
          },
        }),
      )
      .mockResolvedValueOnce(
        awaitingConfirmation({
          operation_id: "cop_direct_2",
          transaction_revision: 2,
          sku_id: "seoul-shade-50",
          quantity: 2,
        }),
      );
    render(<DemoShell />);

    await user.click(
      await screen.findByRole("button", { name: /查看商品 Seoul Shade Daily Fluid/ }),
    );
    await user.click(await screen.findByRole("button", { name: "模拟加入购物车" }));
    await user.click(
      within(await screen.findByRole("dialog", { name: "复核模拟加购" })).getByRole(
        "button",
        { name: "取消" },
      ),
    );

    const pdp = screen.getByRole("region", { name: "商品详情" });
    await user.click(within(pdp).getByRole("radio", { name: /50 mL 正装/ }));
    await user.click(within(pdp).getByRole("button", { name: "增加数量" }));
    await user.click(within(pdp).getByRole("button", { name: "模拟加入购物车" }));

    expect(api.previewCommerce).toHaveBeenLastCalledWith({
      purchase_origin: "FEED",
      product_id: PRODUCT.product.id,
      sku_id: "seoul-shade-50",
      quantity: 2,
      previous_operation_id: "cop_direct_1",
      expected_transaction_revision: 1,
      demo_scenario: "NORMAL",
    });
  });

  it("requires explicit acceptance of changed facts before issuing a fresh confirmation secret", async () => {
    const user = userEvent.setup();
    api.previewCommerce.mockResolvedValue(changedFactsOperation());
    api.acceptUpdatedFacts.mockResolvedValue(
      awaitingConfirmation({
        transaction_revision: 2,
        facts_version: "catalog-2026-08-05-seoul-v2",
        sku_id: "seoul-shade-30",
        quantity: 1,
        facts: changedFactsOperation().facts,
        confirmation_token: "cft_fresh_after_accept",
      }),
    );
    render(<DemoShell />);

    await user.click(
      await screen.findByRole("button", { name: /查看商品 Seoul Shade Daily Fluid/ }),
    );
    await user.click(await screen.findByRole("button", { name: "模拟加入购物车" }));

    const drawer = await screen.findByRole("dialog", { name: "商品事实已更新" });
    expect(drawer).toHaveTextContent("$14.00");
    expect(drawer).toHaveTextContent("$15.00");
    expect(within(drawer).queryByRole("button", { name: "确认模拟加购" })).toBeNull();
    await user.click(
      within(drawer).getByRole("button", { name: "接受新事实并继续" }),
    );

    expect(api.acceptUpdatedFacts).toHaveBeenCalledWith("cop_direct_1", 1);
    expect(
      await screen.findByRole("button", { name: "确认模拟加购" }),
    ).toBeVisible();
    expect(document.body).not.toHaveTextContent("cft_fresh_after_accept");
  });

  it("offers only local SKU reselection when the server reports out of stock", async () => {
    const user = userEvent.setup();
    api.previewCommerce.mockResolvedValue(changedFactsOperation(false));
    render(<DemoShell />);

    await user.click(
      await screen.findByRole("button", { name: /查看商品 Seoul Shade Daily Fluid/ }),
    );
    await user.click(await screen.findByRole("button", { name: "模拟加入购物车" }));
    const drawer = await screen.findByRole("dialog", { name: "当前规格已缺货" });
    expect(within(drawer).getAllByRole("button").map((button) => button.textContent)).toEqual([
      "重新选择规格",
    ]);

    await user.click(within(drawer).getByRole("button", { name: "重新选择规格" }));
    expect(screen.queryByRole("dialog", { name: "当前规格已缺货" })).toBeNull();
    expect(api.acceptUpdatedFacts).not.toHaveBeenCalled();
    expect(api.confirmCommerce).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(
      screen.getByRole("group", { name: "选择规格" }),
    );
  });

  it("never retries confirmation after an unknown network result and reconciles with the same key", async () => {
    const user = userEvent.setup();
    api.previewCommerce.mockResolvedValue(
      awaitingConfirmation({
        sku_id: "seoul-shade-30",
        quantity: 1,
        facts: {
          ...awaitingConfirmation().facts,
          sku_id: "seoul-shade-30",
          quantity: 1,
          unit_price_usd: 14,
          subtotal_usd: 14,
          inventory_units: 18,
        },
      }),
    );
    api.confirmCommerce.mockRejectedValue(new TypeError("connection closed"));
    api.reconcileCommerce.mockImplementation((idempotencyKey: string) =>
      Promise.resolve(succeededOperation(idempotencyKey)),
    );
    render(<DemoShell />);

    await user.click(
      await screen.findByRole("button", { name: /查看商品 Seoul Shade Daily Fluid/ }),
    );
    await user.click(await screen.findByRole("button", { name: "模拟加入购物车" }));
    await user.click(
      within(await screen.findByRole("dialog", { name: "复核模拟加购" })).getByRole(
        "button",
        { name: "确认模拟加购" },
      ),
    );

    const unknown = await screen.findByRole("dialog", { name: "加购结果待对账" });
    expect(within(unknown).queryByRole("button", { name: "确认模拟加购" })).toBeNull();
    const submittedKey = (
      api.confirmCommerce.mock.calls[0]?.[1] as components["schemas"]["CommerceAddRequest"]
    ).idempotency_key;
    await user.click(within(unknown).getByRole("button", { name: "查询加购结果" }));

    expect(api.confirmCommerce).toHaveBeenCalledTimes(1);
    expect(api.reconcileCommerce).toHaveBeenCalledWith(submittedKey);
    expect(await screen.findByRole("dialog", { name: "模拟加购回执" })).toBeVisible();
  });

  it("renders an explicit unavailable state when every SKU is unavailable", async () => {
    const user = userEvent.setup();
    const unavailable: ProductDetail = {
      ...PRODUCT,
      product: {
        ...PRODUCT.product,
        skus: PRODUCT.product.skus.map((sku) => ({
          ...sku,
          in_stock: false,
          inventory_units: 0,
        })),
      },
    };
    api.getProduct.mockResolvedValueOnce(PRODUCT).mockResolvedValueOnce(unavailable);
    render(<DemoShell />);

    await user.click(
      await screen.findByRole("button", { name: /查看商品 Seoul Shade Daily Fluid/ }),
    );
    const pdp = await screen.findByRole("region", { name: "商品详情" });
    expect(within(pdp).getByRole("heading", { name: PRODUCT.product.name })).toBeVisible();
    expect(within(pdp).getByRole("status")).toHaveTextContent("当前暂无可售规格");
    expect(within(pdp).queryByText("正在核实商品详情…")).toBeNull();
    expect(within(pdp).queryByRole("button", { name: "模拟加入购物车" })).toBeNull();
  });

  it("hides dynamic price and stock and blocks transaction when catalog facts are expired", async () => {
    const user = userEvent.setup();
    const expired: ProductDetail = {
      ...PRODUCT,
      freshness: {
        ...PRODUCT.freshness,
        observed_at: "2020-08-05T09:00:00Z",
        expires_at: "2020-08-12T09:00:00Z",
      },
      product: {
        ...PRODUCT.product,
        observed_at: "2020-08-05T09:00:00Z",
        expires_at: "2020-08-12T09:00:00Z",
      },
    };
    api.getProduct.mockResolvedValueOnce(PRODUCT).mockResolvedValueOnce(expired);
    render(<DemoShell />);

    await user.click(
      await screen.findByRole("button", { name: /查看商品 Seoul Shade Daily Fluid/ }),
    );
    const pdp = await screen.findByRole("region", { name: "商品详情" });
    expect(within(pdp).getAllByText("商品事实已过期")[0]).toBeVisible();
    expect(within(pdp).queryByText("$14.00")).toBeNull();
    expect(within(pdp).queryByText("18 件 · 当前可选")).toBeNull();
    expect(within(pdp).getByRole("button", { name: "商品事实已过期" })).toBeDisabled();

    await user.click(within(pdp).getByRole("button", { name: "商品事实已过期" }));
    expect(api.previewCommerce).not.toHaveBeenCalled();
  });

  it("continues from an AI receipt to the saved Feed media without reopening Guide", async () => {
    const user = userEvent.setup();
    api.createGuideSession.mockResolvedValue(GUIDE_DECISION);
    api.getGuideSession.mockResolvedValue(GUIDE_DECISION);
    api.previewCommerce.mockResolvedValue(
      awaitingConfirmation({
        purchase_origin: "AI",
        guide_session_id: GUIDE_DECISION.session_id,
        source_guide_revision: GUIDE_DECISION.guide_revision,
        sku_id: "seoul-shade-30",
        quantity: 1,
        facts: {
          ...awaitingConfirmation().facts,
          sku_id: "seoul-shade-30",
          quantity: 1,
          unit_price_usd: 14,
          subtotal_usd: 14,
          inventory_units: 18,
        },
      }),
    );
    api.confirmCommerce.mockImplementation(
      (_operationId: string, request: components["schemas"]["CommerceAddRequest"]) => {
        const success = succeededOperation(request.idempotency_key);
        return Promise.resolve({
          ...success,
          purchase_origin: "AI" as const,
          guide_session_id: GUIDE_DECISION.session_id,
          source_guide_revision: GUIDE_DECISION.guide_revision,
        });
      },
    );
    render(<DemoShell />);
    const originalVideo = (await screen.findAllByTestId("feed-video"))[0] as HTMLVideoElement;
    originalVideo.currentTime = 7.5;
    originalVideo.muted = false;

    await user.click(
      screen.getByRole("button", { name: /问 AI：Seoul Shade Daily Fluid/ }),
    );
    const recommendation = await screen.findByRole("article", {
      name: "Seoul Shade Daily Fluid 商品建议",
    });
    await user.click(within(recommendation).getByRole("button", { name: "查看商品" }));
    await user.click(await screen.findByRole("button", { name: "模拟加入购物车" }));
    await user.click(
      within(await screen.findByRole("dialog", { name: "复核模拟加购" })).getByRole(
        "button",
        { name: "确认模拟加购" },
      ),
    );
    await user.click(
      within(await screen.findByRole("dialog", { name: "模拟加购回执" })).getByRole(
        "button",
        { name: "继续浏览" },
      ),
    );

    expect(screen.queryByRole("dialog", { name: "AI 导购（概念）" })).toBeNull();
    const restoredVideo = (await screen.findAllByTestId("feed-video"))[0] as HTMLVideoElement;
    expect(Math.abs(restoredVideo.currentTime - 7.5)).toBeLessThanOrEqual(0.25);
    expect(restoredVideo.muted).toBe(false);
  });

  it("ignores a slow stale product response after the PDP target changes", async () => {
    let resolveFirst!: (detail: ProductDetail) => void;
    let resolveSecond!: (detail: ProductDetail) => void;
    api.getProduct
      .mockImplementationOnce(
        () => new Promise<ProductDetail>((resolve) => (resolveFirst = resolve)),
      )
      .mockImplementationOnce(
        () => new Promise<ProductDetail>((resolve) => (resolveSecond = resolve)),
      );
    const secondProduct: ProductDetail = {
      ...PRODUCT,
      product: {
        ...PRODUCT.product,
        id: "cloud-veil-mineral",
        name: "Cloud Veil Mineral SPF",
        display_name_zh: "云感矿物防晒",
      },
    };
    const props = {
      entrySource: "feed" as const,
      productRole: "current" as const,
      onBack: vi.fn(),
      onNotice: vi.fn(),
      onCommerceOperation: vi.fn(),
      overlay: "none" as const,
      onCloseOverlay: vi.fn(),
      onContinueBrowsing: vi.fn(),
      cartCount: 0,
    };
    const view = render(<PdpScreen {...props} productId={PRODUCT.product.id} />);
    view.rerender(<PdpScreen {...props} productId={secondProduct.product.id} />);

    resolveSecond(secondProduct);
    expect(
      await screen.findByRole("heading", { name: secondProduct.product.name }),
    ).toBeVisible();
    resolveFirst(PRODUCT);
    await waitFor(() =>
      expect(screen.queryByRole("heading", { name: PRODUCT.product.name })).toBeNull(),
    );
  });

  it("replaces the old confirmation when confirm itself returns changed facts", async () => {
    const user = userEvent.setup();
    api.previewCommerce.mockResolvedValue(
      awaitingConfirmation({
        sku_id: "seoul-shade-30",
        quantity: 1,
        facts: {
          ...awaitingConfirmation().facts,
          sku_id: "seoul-shade-30",
          quantity: 1,
          unit_price_usd: 14,
          subtotal_usd: 14,
          inventory_units: 18,
        },
      }),
    );
    api.confirmCommerce.mockResolvedValue(
      changedFactsOperation(),
    );
    render(<DemoShell />);

    await user.click(
      await screen.findByRole("button", { name: /查看商品 Seoul Shade Daily Fluid/ }),
    );
    await user.click(await screen.findByRole("button", { name: "模拟加入购物车" }));
    await user.click(
      within(await screen.findByRole("dialog", { name: "复核模拟加购" })).getByRole(
        "button",
        { name: "确认模拟加购" },
      ),
    );

    const changed = await screen.findByRole("dialog", { name: "商品事实已更新" });
    expect(within(changed).queryByRole("button", { name: "确认模拟加购" })).toBeNull();
    expect(within(changed).getByRole("button", { name: "接受新事实并继续" })).toBeVisible();
  });

  it.each([
    ["server operation", () => Promise.resolve(unknownOperation())],
    [
      "explicit 409",
      () => Promise.reject(new ApiError(409, "COMMIT_STATUS_UNKNOWN")),
    ],
  ])("keeps %s confirmation outcomes reconciliation-only", async (_label, outcome) => {
    const user = userEvent.setup();
    api.previewCommerce.mockResolvedValue(
      awaitingConfirmation({
        sku_id: "seoul-shade-30",
        quantity: 1,
        facts: {
          ...awaitingConfirmation().facts,
          sku_id: "seoul-shade-30",
          quantity: 1,
          unit_price_usd: 14,
          subtotal_usd: 14,
          inventory_units: 18,
        },
      }),
    );
    api.confirmCommerce.mockImplementation(outcome);
    api.reconcileCommerce.mockImplementation((key: string) =>
      Promise.resolve(succeededOperation(key)),
    );
    render(<DemoShell />);

    await user.click(
      await screen.findByRole("button", { name: /查看商品 Seoul Shade Daily Fluid/ }),
    );
    await user.click(await screen.findByRole("button", { name: "模拟加入购物车" }));
    await user.click(
      within(await screen.findByRole("dialog", { name: "复核模拟加购" })).getByRole(
        "button",
        { name: "确认模拟加购" },
      ),
    );
    const unknown = await screen.findByRole("dialog", { name: "加购结果待对账" });
    expect(within(unknown).queryByRole("button", { name: "确认模拟加购" })).toBeNull();
    await user.click(within(unknown).getByRole("button", { name: "查询加购结果" }));
    expect(api.confirmCommerce).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole("dialog", { name: "模拟加购回执" })).toBeVisible();
  });

  it("renders null promotion without an invented placeholder", async () => {
    const user = userEvent.setup();
    render(<DemoShell />);
    await user.click(
      await screen.findByRole("button", { name: /查看商品 Seoul Shade Daily Fluid/ }),
    );
    const pdp = await screen.findByRole("region", { name: "商品详情" });
    expect(within(pdp).queryByText(/暂无优惠|优惠待定/)).toBeNull();
  });

  it("traps drawer focus, supports Escape, restores focus and body scroll, and inerts the PDP", async () => {
    const user = userEvent.setup();
    render(<DemoShell />);
    await user.click(
      await screen.findByRole("button", { name: /查看商品 Seoul Shade Daily Fluid/ }),
    );
    const cta = await screen.findByRole("button", { name: "模拟加入购物车" });
    cta.focus();
    await user.click(cta);
    const drawer = await screen.findByRole("dialog", { name: "复核模拟加购" });
    const cancel = within(drawer).getByRole("button", { name: "取消" });
    const confirm = within(drawer).getByRole("button", { name: "确认模拟加购" });
    expect(document.body.style.overflow).toBe("hidden");
    expect(screen.getByLabelText("TikTok Shop-inspired Concept Prototype", { selector: "section" })).toHaveAttribute("inert");
    expect(cancel).toHaveFocus();
    confirm.focus();
    await user.keyboard("{Tab}");
    expect(cancel).toHaveFocus();
    await user.keyboard("{Shift>}{Tab}{/Shift}");
    expect(confirm).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "复核模拟加购" })).toBeNull();
    expect(document.body.style.overflow).toBe("");
    expect(cta).toHaveFocus();
  });

  it("routes every non-executable PDP shell control to a Concept Boundary notice", async () => {
    const user = userEvent.setup();
    render(<DemoShell />);
    await user.click(
      await screen.findByRole("button", { name: /查看商品 Seoul Shade Daily Fluid/ }),
    );
    const controls = [
      ["搜索", "搜索功能不在本次概念原型范围内"],
      ["分享", "分享功能不在本次概念原型范围内"],
      ["购物车，0 件", "购物车列表不在本次概念原型范围内"],
      ["更多", "更多功能不在本次概念原型范围内"],
      ["店铺", "店铺页面不在本次概念原型范围内"],
      ["聊天", "商家聊天不在本次概念原型范围内"],
    ] as const;
    for (const [name, message] of controls) {
      await user.click(screen.getByRole("button", { name }));
      expect(screen.getByText(message)).toBeVisible();
      await user.click(screen.getByRole("button", { name: "关闭提示" }));
    }
  });

  it("does not increment the cart badge when the same receipt is replayed", async () => {
    const user = userEvent.setup();
    const receiptId = "rcp_direct_1";
    api.confirmCommerce.mockImplementation(
      (operationId: string, request: components["schemas"]["CommerceAddRequest"]) => {
        const success = succeededOperation(request.idempotency_key);
        return Promise.resolve({
          ...success,
          operation_id: operationId,
          transaction_revision: operationId === "cop_direct_2" ? 2 : 1,
          receipt: { ...success.receipt!, receipt_id: receiptId, operation_id: operationId },
        });
      },
    );
    render(<DemoShell />);
    await user.click(
      await screen.findByRole("button", { name: /查看商品 Seoul Shade Daily Fluid/ }),
    );
    await user.click(await screen.findByRole("button", { name: "模拟加入购物车" }));
    await user.click(await screen.findByRole("button", { name: "确认模拟加购" }));
    await user.click(await screen.findByRole("button", { name: "返回商品" }));
    expect(screen.getByRole("button", { name: "购物车，1 件" })).toBeVisible();

    api.previewCommerce.mockResolvedValue(
      awaitingConfirmation({
        operation_id: "cop_direct_2",
        transaction_revision: 2,
        sku_id: "seoul-shade-30",
        quantity: 1,
        facts: {
          ...awaitingConfirmation().facts,
          sku_id: "seoul-shade-30",
          quantity: 1,
          unit_price_usd: 14,
          subtotal_usd: 14,
          inventory_units: 18,
        },
      }),
    );
    await user.click(screen.getByRole("button", { name: "模拟加入购物车" }));
    await user.click(await screen.findByRole("button", { name: "确认模拟加购" }));
    await user.click(await screen.findByRole("button", { name: "返回商品" }));
    expect(screen.getByRole("button", { name: "购物车，1 件" })).toBeVisible();
  });
});
