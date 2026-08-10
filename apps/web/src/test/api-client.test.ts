import { afterEach, describe, expect, it, vi } from "vitest";

import type { components } from "@shopping-guide/contracts/src/api";

import {
  ApiError,
  addCartItem,
  acceptUpdatedFacts,
  compareProducts,
  confirmCommerce,
  createGuideSession,
  getCommerceOperation,
  getFeed,
  getGuideSession,
  getProduct,
  previewCommerce,
  previewCart,
  reconcileCommerce,
  sendGuideMessage,
} from "@/lib/api-client";
import { formatUsd } from "@/lib/formatters";

const syntheticConfirmation = ["confirm", "test"].join("_");

const guideTurn = {
  session_id: "ses_test",
  state: "CLARIFY",
  kind: "clarification",
  text: "What matters most for your sunscreen?",
  context: {
    id: "morning-routine-uv-001",
    creator_handle: "@synthetic_creator",
    caption: "Synthetic sunscreen demo",
    anchor_product_id: "seoul-shade-daily-fluid",
    anchor_product_name: "Seoul Shade Daily Fluid",
    claims: [],
  },
  evidence: [],
  quick_replies: [],
  recommendations: [],
  trace_id: "trc_test",
  verdict: null,
  locale: "en-US",
  guide_status: "WAITING_USER",
  guide_view_kind: "WAITING_CLARIFICATION",
  guide_revision: 1,
  conversation_revision: 1,
  facts_snapshot_at: "2026-08-05T00:00:00Z",
  allowed_actions: [
    "SEND_MESSAGE",
    "ANSWER_CLARIFICATION",
    "SKIP_CLARIFICATION",
    "UPDATE_CONSTRAINTS",
    "RETURN_TO_FEED",
  ],
  degraded: false,
  transcript: [
    {
      id: "gmsg_question",
      sequence: 1,
      role: "ASSISTANT",
      kind: "QUESTION",
      text: "What matters most for your sunscreen?",
      created_at: "2026-08-05T00:00:00Z",
      redacted: false,
      quick_replies: [],
      recommendations: [],
      evidence: [],
    },
  ],
} satisfies components["schemas"]["GuideTurnResponse"];

const compareResponse = {
  session_id: "ses_test",
  state: "COMPARE",
  product_ids: ["product_one", "product_two"],
  rows: {
    starting_price_usd: [19, 24],
    fragrance_free: [true, false],
    water_resistance_minutes: [null, 40],
    finish: ["natural", "matte"],
    white_cast_risk: ["low", "medium"],
  },
  simulated: true,
} satisfies components["schemas"]["CompareResponse"];

const cartPreview = {
  session_id: "ses_test",
  state: "SKU_AND_CART_CONFIRM",
  sku_id: "sku_one",
  quantity: 1,
  unit_price_usd: 19,
  subtotal_usd: 19,
  inventory_units: 12,
  confirmation_token: syntheticConfirmation,
  created_at: "2026-08-05T00:00:00Z",
  simulated: true,
} satisfies components["schemas"]["CartPreviewResponse"];

const cartItem = {
  session_id: "ses_test",
  state: "FEEDBACK_AND_MEMORY",
  cart_id: "cart_test",
  cart_item_id: "item_test",
  sku_id: "sku_one",
  quantity: 1,
  unit_price_usd: 19,
  simulated: true,
} satisfies components["schemas"]["CartItemResponse"];

const productDetail = {
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
    description_zh: "适合潮湿通勤场景的轻薄 SPF 50 广谱防晒。",
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
      return_summary_zh: "签收后 30 天内可申请退货。",
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
} satisfies components["schemas"]["ProductDetailResponse"];

const commerceOperation = {
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
  confirmation_token: syntheticConfirmation,
  confirmation_expires_at: "2099-08-05T00:05:00Z",
  simulated: true,
} satisfies components["schemas"]["CommerceOperationResponse"];

function commerceSuccess(
  idempotencyKey: string,
  transactionRevision = 1,
): components["schemas"]["CommerceOperationResponse"] {
  return {
    ...commerceOperation,
    transaction_revision: transactionRevision,
    commerce_view_kind: "SUCCEEDED",
    operation_status: "SUCCEEDED",
    allowed_actions: ["RETURN_TO_PRODUCT", "CONTINUE_BROWSING"],
    confirmation_token: undefined,
    confirmation_expires_at: undefined,
    receipt: {
      receipt_id: "rcp_test",
      cart_id: "cart_simulated",
      cart_item_id: "item_test",
      operation_id: commerceOperation.operation_id,
      idempotency_key: idempotencyKey,
      product_id: commerceOperation.product_id,
      sku_id: commerceOperation.sku_id,
      quantity: commerceOperation.quantity,
      unit_price_usd: commerceOperation.facts.unit_price_usd,
      subtotal_usd: commerceOperation.facts.subtotal_usd,
      facts_version: commerceOperation.facts_version,
      committed_at: "2026-08-05T00:01:00Z",
      simulated: true,
      order_created: false,
      payment_created: false,
    },
  };
}

function commerceExpectation(
  operation: components["schemas"]["CommerceOperationResponse"] = commerceOperation,
) {
  return {
    transactionRevision: operation.transaction_revision,
    purchaseOrigin: operation.purchase_origin,
    guideSessionId: operation.guide_session_id ?? null,
    sourceGuideRevision: operation.source_guide_revision ?? null,
    productId: operation.product_id,
    skuId: operation.sku_id,
    quantity: operation.quantity,
    factsVersion: operation.facts.facts_version,
    unitPriceUsd: operation.facts.unit_price_usd,
    subtotalUsd: operation.facts.subtotal_usd,
  } as const;
}

function commerceFactsChanged(
  transactionRevision = 2,
): components["schemas"]["CommerceOperationResponse"] {
  return {
    ...commerceOperation,
    transaction_revision: transactionRevision,
    facts_version: "facts_updated",
    commerce_view_kind: "FACTS_CHANGED",
    operation_status: "ACTIVE",
    allowed_actions: [
      "ACCEPT_UPDATED_FACTS",
      "RESELECT_SKU",
      "CANCEL_CONFIRMATION",
      "RETURN_TO_PRODUCT",
    ],
    facts: {
      ...commerceOperation.facts,
      unit_price_usd: 20,
      subtotal_usd: 20,
      facts_version: "facts_updated",
    },
    facts_diff: [
      {
        field: "unit_price_usd",
        previous_value: 19,
        current_value: 20,
      },
      {
        field: "facts_version",
        previous_value: "facts_test",
        current_value: "facts_updated",
      },
    ],
    error_code: "FACTS_CHANGED",
    confirmation_token: undefined,
    confirmation_expires_at: undefined,
  };
}

function commerceUnknown(
  transactionRevision = 1,
): components["schemas"]["CommerceOperationResponse"] {
  return {
    ...commerceOperation,
    transaction_revision: transactionRevision,
    commerce_view_kind: "COMMIT_STATUS_UNKNOWN",
    operation_status: "RECONCILIATION_REQUIRED",
    allowed_actions: ["RECONCILE_COMMIT", "RETURN_TO_PRODUCT"],
    facts_diff: [],
    error_code: "COMMIT_STATUS_UNKNOWN",
    confirmation_token: undefined,
    confirmation_expires_at: undefined,
  };
}

function mockJson(payload: unknown, status = 200) {
  return vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(JSON.stringify(payload), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

function mockAbortedBody(status: number) {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('{"detail":'));
      controller.error(new Error("body stream aborted"));
    },
  });

  return vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(body, {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

afterEach(() => vi.restoreAllMocks());

describe("shopping guide client", () => {
  it("posts the exact content-entry contract", async () => {
    const fetchMock = mockJson(guideTurn, 201);

    await createGuideSession("morning-routine-uv-001");

    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:8000/api/v1/guide/sessions",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entry_point: "content",
          content_context_id: "morning-routine-uv-001",
        }),
      },
    );
  });

  it("posts the explicit locale for a redesigned guide session", async () => {
    const fetchMock = mockJson(guideTurn, 201);

    await createGuideSession("morning-routine-uv-001", "zh-CN");

    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:8000/api/v1/guide/sessions",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entry_point: "content",
          content_context_id: "morning-routine-uv-001",
          locale: "zh-CN",
        }),
      },
    );
  });

  it("gets the exact redesigned catalog and guide snapshot paths", async () => {
    const fetchMock = mockJson({ feed_tabs: [], bottom_nav_variant: "demo", items: [] });
    await getFeed();
    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:8000/api/v1/catalog/feed",
      { method: "GET", headers: { "Content-Type": "application/json" } },
    );

    mockJson(productDetail, 200);
    await getProduct("seoul-shade-daily-fluid");
    expect(fetch).toHaveBeenLastCalledWith(
      "http://127.0.0.1:8000/api/v1/catalog/products/seoul-shade-daily-fluid",
      { method: "GET", headers: { "Content-Type": "application/json" } },
    );

    mockJson(guideTurn);
    await getGuideSession("ses_test");
    expect(fetch).toHaveBeenLastCalledWith(
      "http://127.0.0.1:8000/api/v1/guide/sessions/ses_test",
      { method: "GET", headers: { "Content-Type": "application/json" } },
    );
  });

  it("posts the exact guide-message contract", async () => {
    const fetchMock = mockJson({ ...guideTurn, session_id: "ses/test value" });

    await sendGuideMessage("ses/test value", "msg_test", "Daily commute", 1);

    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:8000/api/v1/guide/sessions/ses%2Ftest%20value/messages",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message_id: "msg_test",
          text: "Daily commute",
          expected_conversation_revision: 1,
        }),
      },
    );
  });

  it("posts the exact comparison contract", async () => {
    const fetchMock = mockJson({ ...compareResponse, session_id: "ses/test value" });

    await compareProducts(
      "ses/test value",
      "cmp_test",
      ["product_one", "product_two"],
      1,
    );

    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:8000/api/v1/guide/sessions/ses%2Ftest%20value/compare",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          request_id: "cmp_test",
          product_ids: ["product_one", "product_two"],
          expected_conversation_revision: 1,
        }),
      },
    );
  });

  it("rejects a malformed comparison success payload at the client boundary", async () => {
    mockJson({
      ...compareResponse,
      rows: { ...compareResponse.rows, finish: ["natural"] },
    });

    await expect(
      compareProducts(
        "ses_test",
        "cmp_test",
        ["product_one", "product_two"],
        1,
      ),
    ).rejects.toMatchObject({
      status: 200,
      code: "INVALID_API_RESPONSE",
      message: "INVALID_API_RESPONSE",
    });
  });

  it("posts the exact one-item cart-preview contract", async () => {
    const fetchMock = mockJson(cartPreview);

    await previewCart("ses_test", "sku_one");

    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:8000/api/v1/guide/sessions/ses_test/cart/preview",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sku_id: "sku_one", quantity: 1 }),
      },
    );
  });

  it("posts the exact confirmed-cart contract", async () => {
    const fetchMock = mockJson(cartItem, 201);

    await addCartItem("ses_test", syntheticConfirmation);

    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:8000/api/v1/guide/sessions/ses_test/cart/items",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmation_token: syntheticConfirmation }),
      },
    );
  });

  it("uses the exact independent commerce contracts", async () => {
    const previewRequest: components["schemas"]["CommercePreviewRequest"] = {
      purchase_origin: "FEED",
      product_id: "seoul-shade-daily-fluid",
      sku_id: "seoul-shade-50",
      quantity: 1,
      expected_transaction_revision: 0,
      demo_scenario: "NORMAL",
    };
    const addRequest: components["schemas"]["CommerceAddRequest"] = {
      confirmation_token: syntheticConfirmation,
      idempotency_key: "idem_test",
      expected_transaction_revision: 1,
      demo_scenario: "NORMAL",
    };

    mockJson(commerceOperation, 201);
    await previewCommerce(previewRequest);
    expect(fetch).toHaveBeenLastCalledWith(
      "http://127.0.0.1:8000/api/v1/commerce/cart/preview",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(previewRequest),
      },
    );

    mockJson({ ...commerceOperation, transaction_revision: 2 });
    await acceptUpdatedFacts("op_test", 1, commerceExpectation(commerceOperation));
    expect(fetch).toHaveBeenLastCalledWith(
      "http://127.0.0.1:8000/api/v1/commerce/operations/op_test/accept-facts",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expected_transaction_revision: 1 }),
      },
    );

    mockJson(commerceSuccess("idem_test"), 201);
    await confirmCommerce(
      "op_test",
      addRequest,
      commerceExpectation(commerceOperation),
    );
    expect(fetch).toHaveBeenLastCalledWith(
      "http://127.0.0.1:8000/api/v1/commerce/operations/op_test/items",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(addRequest),
      },
    );

    mockJson(commerceSuccess("idem_test"));
    await getCommerceOperation("op_test");
    expect(fetch).toHaveBeenLastCalledWith(
      "http://127.0.0.1:8000/api/v1/commerce/operations/op_test",
      { method: "GET", headers: { "Content-Type": "application/json" } },
    );

    mockJson(commerceSuccess("idem_test"));
    await reconcileCommerce("idem_test", commerceExpectation(commerceOperation));
    expect(fetch).toHaveBeenLastCalledWith(
      "http://127.0.0.1:8000/api/v1/commerce/operations/by-idempotency/idem_test",
      { method: "GET", headers: { "Content-Type": "application/json" } },
    );
  });

  it("enforces endpoint-specific commerce states and revision transitions", async () => {
    const previewRequest: components["schemas"]["CommercePreviewRequest"] = {
      purchase_origin: "FEED",
      product_id: commerceOperation.product_id,
      sku_id: commerceOperation.sku_id,
      quantity: commerceOperation.quantity,
      expected_transaction_revision: 0,
      demo_scenario: "NORMAL",
    };
    const addRequest: components["schemas"]["CommerceAddRequest"] = {
      confirmation_token: syntheticConfirmation,
      idempotency_key: "idem_state_matrix",
      expected_transaction_revision: 1,
      demo_scenario: "NORMAL",
    };
    const expected = commerceExpectation(commerceOperation);

    mockJson(commerceSuccess("idem_preview_wrong_state"), 201);
    await expect(previewCommerce(previewRequest)).rejects.toMatchObject({
      status: 201,
      code: "INVALID_API_RESPONSE",
    });

    mockJson(commerceFactsChanged(2));
    await expect(acceptUpdatedFacts("op_test", 1, expected)).rejects.toMatchObject({
      status: 200,
      code: "INVALID_API_RESPONSE",
    });

    mockJson(commerceSuccess(addRequest.idempotency_key, 2), 201);
    await expect(confirmCommerce("op_test", addRequest, expected)).rejects.toMatchObject({
      status: 201,
      code: "INVALID_API_RESPONSE",
    });

    mockJson(commerceFactsChanged(1), 201);
    await expect(confirmCommerce("op_test", addRequest, expected)).rejects.toMatchObject({
      status: 201,
      code: "INVALID_API_RESPONSE",
    });

    mockJson(commerceUnknown());
    await expect(
      reconcileCommerce("idem_state_matrix", expected),
    ).rejects.toMatchObject({
      status: 200,
      code: "INVALID_API_RESPONSE",
    });
  });

  it("binds reconciliation success to the original revision and facts fingerprint", async () => {
    const expected = commerceExpectation(commerceOperation);
    const mismatched = commerceSuccess("idem_reconcile_fingerprint", 2);
    mismatched.facts_version = "facts_other";
    mismatched.facts = {
      ...mismatched.facts,
      facts_version: "facts_other",
      unit_price_usd: 21,
      subtotal_usd: 21,
    };
    mismatched.receipt = {
      ...mismatched.receipt!,
      facts_version: "facts_other",
      unit_price_usd: 21,
      subtotal_usd: 21,
    };
    mockJson(mismatched);

    await expect(
      reconcileCommerce("idem_reconcile_fingerprint", expected),
    ).rejects.toMatchObject({
      status: 200,
      code: "INVALID_API_RESPONSE",
    });
  });

  it("binds confirm success and unknown results to the confirmed facts fingerprint", async () => {
    const addRequest: components["schemas"]["CommerceAddRequest"] = {
      confirmation_token: syntheticConfirmation,
      idempotency_key: "idem_fingerprint",
      expected_transaction_revision: 1,
      demo_scenario: "NORMAL",
    };
    const expected = commerceExpectation(commerceOperation);
    const mismatchedSuccess = commerceSuccess(addRequest.idempotency_key);
    mismatchedSuccess.facts_version = "facts_other";
    mismatchedSuccess.facts = {
      ...mismatchedSuccess.facts,
      facts_version: "facts_other",
      unit_price_usd: 21,
      subtotal_usd: 21,
    };
    mismatchedSuccess.receipt = {
      ...mismatchedSuccess.receipt!,
      facts_version: "facts_other",
      unit_price_usd: 21,
      subtotal_usd: 21,
    };
    mockJson(mismatchedSuccess, 201);

    await expect(confirmCommerce("op_test", addRequest, expected)).rejects.toMatchObject({
      status: 201,
      code: "INVALID_API_RESPONSE",
    });

    const mismatchedUnknown = commerceUnknown();
    mismatchedUnknown.facts_version = "facts_other";
    mismatchedUnknown.facts = {
      ...mismatchedUnknown.facts,
      facts_version: "facts_other",
    };
    mockJson(mismatchedUnknown, 201);
    await expect(confirmCommerce("op_test", addRequest, expected)).rejects.toMatchObject({
      status: 201,
      code: "INVALID_API_RESPONSE",
    });
  });

  it("binds accepted facts to the complete operation identity", async () => {
    const changed = commerceFactsChanged(1);
    const accepted = {
      ...changed,
      transaction_revision: 2,
      purchase_origin: "AI" as const,
      guide_session_id: "ses_other",
      source_guide_revision: 4,
      commerce_view_kind: "AWAITING_CONFIRMATION" as const,
      operation_status: "ACTIVE" as const,
      allowed_actions: commerceOperation.allowed_actions,
      facts_diff: [],
      error_code: undefined,
      confirmation_token: syntheticConfirmation,
      confirmation_expires_at: "2099-08-05T00:05:00Z",
    };
    mockJson(accepted);

    await expect(
      acceptUpdatedFacts("op_test", 1, commerceExpectation(changed)),
    ).rejects.toMatchObject({
      status: 200,
      code: "INVALID_API_RESPONSE",
    });
  });

  it("preserves the server's stable error code", async () => {
    mockJson({ detail: { code: "SESSION_NOT_FOUND" } }, 404);

    const request = sendGuideMessage(
      "ses_missing",
      "msg_test",
      "Daily commute",
      1,
    );

    await expect(request).rejects.toBeInstanceOf(ApiError);
    await expect(request).rejects.toMatchObject({
      status: 404,
      code: "SESSION_NOT_FOUND",
      message: "SESSION_NOT_FOUND",
    });
  });

  it("preserves a commerce reconciliation error code", async () => {
    mockJson({ detail: { code: "COMMIT_STATUS_UNKNOWN" } }, 409);

    await expect(getCommerceOperation("op_unknown")).rejects.toMatchObject({
      status: 409,
      code: "COMMIT_STATUS_UNKNOWN",
      message: "COMMIT_STATUS_UNKNOWN",
    });
  });

  it("rejects semantically invalid Guide and Commerce success payloads", async () => {
    mockJson({ ...guideTurn, allowed_actions: ["UNKNOWN_GUIDE_ACTION"] });
    await expect(getGuideSession("ses_test")).rejects.toMatchObject({
      status: 200,
      code: "INVALID_API_RESPONSE",
    });

    mockJson({
      ...guideTurn,
      guide_view_kind: "SAFE_BOUNDARY",
      allowed_actions: ["ANSWER_CLARIFICATION"],
    });
    await expect(createGuideSession("morning-routine-uv-001")).rejects.toMatchObject({
      status: 200,
      code: "INVALID_API_RESPONSE",
    });

    mockJson({ ...commerceOperation, facts: undefined });
    await expect(getCommerceOperation("op_test")).rejects.toMatchObject({
      status: 200,
      code: "INVALID_API_RESPONSE",
    });
  });

  it("rejects malformed or mismatched ProductDetail success payloads", async () => {
    for (const malformed of [
      { ...productDetail, product: { ...productDetail.product, id: "wrong-product" } },
      {
        ...productDetail,
        freshness: { ...productDetail.freshness, facts_version: "wrong-version" },
      },
      {
        ...productDetail,
        starting_price_usd: 999,
      },
      {
        ...productDetail,
        product: {
          ...productDetail.product,
          skus: [
            ...productDetail.product.skus,
            { ...productDetail.product.skus[0], id: productDetail.product.skus[1].id },
          ],
        },
      },
      {
        ...productDetail,
        product: { ...productDetail.product, spf: 101 },
      },
      {
        ...productDetail,
        product: {
          ...productDetail.product,
          skus: [
            { ...productDetail.product.skus[0], size_ml: 30.5 },
            productDetail.product.skus[1],
          ],
        },
      },
    ]) {
      mockJson(malformed);
      await expect(getProduct(productDetail.product.id)).rejects.toMatchObject({
        status: 200,
        code: "INVALID_API_RESPONSE",
      });
    }
  });

  it("requires confirmation secrets from preview but permits secret-free operation reads", async () => {
    const secretFree = {
      ...commerceOperation,
      confirmation_token: undefined,
      confirmation_expires_at: undefined,
    };
    const previewRequest: components["schemas"]["CommercePreviewRequest"] = {
      purchase_origin: "FEED",
      product_id: commerceOperation.product_id,
      sku_id: commerceOperation.sku_id,
      quantity: 1,
      expected_transaction_revision: 0,
      demo_scenario: "NORMAL",
    };

    mockJson(secretFree, 201);
    await expect(previewCommerce(previewRequest)).rejects.toMatchObject({
      status: 201,
      code: "INVALID_API_RESPONSE",
    });

    mockJson(secretFree);
    await expect(getCommerceOperation(commerceOperation.operation_id)).resolves.toMatchObject({
      commerce_view_kind: "AWAITING_CONFIRMATION",
    });

    mockJson(commerceOperation);
    await expect(getCommerceOperation(commerceOperation.operation_id)).rejects.toMatchObject({
      status: 200,
      code: "INVALID_API_RESPONSE",
    });
  });

  it("rejects a commerce response that does not match the submitted product selection", async () => {
    const request: components["schemas"]["CommercePreviewRequest"] = {
      purchase_origin: "FEED",
      product_id: commerceOperation.product_id,
      sku_id: commerceOperation.sku_id,
      quantity: 1,
      expected_transaction_revision: 0,
      demo_scenario: "NORMAL",
    };
    mockJson({ ...commerceOperation, sku_id: "wrong-sku", facts: { ...commerceOperation.facts, sku_id: "wrong-sku" } }, 201);

    await expect(previewCommerce(request)).rejects.toMatchObject({
      status: 201,
      code: "INVALID_API_RESPONSE",
    });
  });

  it("rejects a success receipt that does not echo the submitted idempotency key", async () => {
    const addRequest: components["schemas"]["CommerceAddRequest"] = {
      confirmation_token: syntheticConfirmation,
      idempotency_key: "idem_submitted",
      expected_transaction_revision: 1,
      demo_scenario: "NORMAL",
    };
    mockJson({
      ...commerceOperation,
      commerce_view_kind: "SUCCEEDED",
      operation_status: "SUCCEEDED",
      allowed_actions: ["RETURN_TO_PRODUCT", "CONTINUE_BROWSING"],
      confirmation_token: undefined,
      confirmation_expires_at: undefined,
      receipt: {
        receipt_id: "rcp_test",
        cart_id: "cart_simulated",
        cart_item_id: "item_test",
        operation_id: commerceOperation.operation_id,
        idempotency_key: "idem_wrong",
        product_id: commerceOperation.product_id,
        sku_id: commerceOperation.sku_id,
        quantity: commerceOperation.quantity,
        unit_price_usd: commerceOperation.facts.unit_price_usd,
        subtotal_usd: commerceOperation.facts.subtotal_usd,
        facts_version: commerceOperation.facts_version,
        committed_at: "2026-08-05T00:01:00Z",
        simulated: true,
        order_created: false,
        payment_created: false,
      },
    }, 201);

    await expect(
      confirmCommerce(
        commerceOperation.operation_id,
        addRequest,
        commerceExpectation(commerceOperation),
      ),
    ).rejects.toMatchObject({
      status: 201,
      code: "INVALID_API_RESPONSE",
    });
  });

  it("uses a stable fallback for an unstructured API error", async () => {
    mockJson({ detail: "Service unavailable" }, 503);

    await expect(createGuideSession("morning-routine-uv-001")).rejects.toMatchObject({
      status: 503,
      code: "UNKNOWN_API_ERROR",
      message: "UNKNOWN_API_ERROR",
    });
  });

  it("normalizes a plain-text HTTP error", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("Bad Gateway", {
        status: 502,
        headers: { "Content-Type": "text/plain" },
      }),
    );

    const error = await createGuideSession("morning-routine-uv-001").catch(
      (reason: unknown) => reason,
    );

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 502,
      code: "UNKNOWN_API_ERROR",
      message: "UNKNOWN_API_ERROR",
    });
  });

  it("normalizes a JSON null HTTP error", async () => {
    mockJson(null, 500);

    const error = await createGuideSession("morning-routine-uv-001").catch(
      (reason: unknown) => reason,
    );

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 500,
      code: "UNKNOWN_API_ERROR",
      message: "UNKNOWN_API_ERROR",
    });
  });

  it("ignores a non-string backend error code", async () => {
    mockJson({ detail: { code: 404 } }, 404);

    await expect(createGuideSession("morning-routine-uv-001")).rejects.toMatchObject({
      status: 404,
      code: "UNKNOWN_API_ERROR",
      message: "UNKNOWN_API_ERROR",
    });
  });

  it("rejects an empty successful response as an invalid API response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 200 }));

    await expect(createGuideSession("morning-routine-uv-001")).rejects.toMatchObject({
      status: 200,
      code: "INVALID_API_RESPONSE",
      message: "INVALID_API_RESPONSE",
    });
  });

  it("normalizes an aborted error-response body", async () => {
    mockAbortedBody(502);

    const error = await createGuideSession("morning-routine-uv-001").catch(
      (reason: unknown) => reason,
    );

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 502,
      code: "UNKNOWN_API_ERROR",
      message: "UNKNOWN_API_ERROR",
    });
  });

  it("normalizes an aborted successful-response body", async () => {
    mockAbortedBody(200);

    const error = await createGuideSession("morning-routine-uv-001").catch(
      (reason: unknown) => reason,
    );

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 200,
      code: "INVALID_API_RESPONSE",
      message: "INVALID_API_RESPONSE",
    });
  });
});

describe("formatUsd", () => {
  it("formats US prices consistently", () => {
    expect(formatUsd(19)).toBe("$19.00");
  });
});
