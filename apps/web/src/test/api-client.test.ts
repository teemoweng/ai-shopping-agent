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
  facts_snapshot_at: "2026-08-05T00:00:00Z",
  allowed_actions: ["ANSWER_CLARIFICATION", "RETURN_TO_FEED"],
  degraded: false,
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
  confirmation_token: syntheticConfirmation,
  confirmation_expires_at: "2026-08-05T00:05:00Z",
  simulated: true,
} satisfies components["schemas"]["CommerceOperationResponse"];

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

    mockJson({}, 200);
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
    const fetchMock = mockJson(guideTurn);

    await sendGuideMessage("ses_test", "msg_test", "Daily commute");

    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:8000/api/v1/guide/sessions/ses_test/messages",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message_id: "msg_test", text: "Daily commute" }),
      },
    );
  });

  it("posts the exact comparison contract", async () => {
    const fetchMock = mockJson(compareResponse);

    await compareProducts("ses_test", ["product_one", "product_two"]);

    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:8000/api/v1/guide/sessions/ses_test/compare",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product_ids: ["product_one", "product_two"] }),
      },
    );
  });

  it("rejects a malformed comparison success payload at the client boundary", async () => {
    mockJson({
      ...compareResponse,
      rows: { ...compareResponse.rows, finish: ["natural"] },
    });

    await expect(compareProducts("ses_test", ["product_one", "product_two"])).rejects.toMatchObject({
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

    mockJson(commerceOperation);
    await acceptUpdatedFacts("op_test", 1);
    expect(fetch).toHaveBeenLastCalledWith(
      "http://127.0.0.1:8000/api/v1/commerce/operations/op_test/accept-facts",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expected_transaction_revision: 1 }),
      },
    );

    mockJson(commerceOperation, 201);
    await confirmCommerce("op_test", addRequest);
    expect(fetch).toHaveBeenLastCalledWith(
      "http://127.0.0.1:8000/api/v1/commerce/operations/op_test/items",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(addRequest),
      },
    );

    mockJson(commerceOperation);
    await getCommerceOperation("op_test");
    expect(fetch).toHaveBeenLastCalledWith(
      "http://127.0.0.1:8000/api/v1/commerce/operations/op_test",
      { method: "GET", headers: { "Content-Type": "application/json" } },
    );

    mockJson(commerceOperation);
    await reconcileCommerce("idem_test");
    expect(fetch).toHaveBeenLastCalledWith(
      "http://127.0.0.1:8000/api/v1/commerce/operations/by-idempotency/idem_test",
      { method: "GET", headers: { "Content-Type": "application/json" } },
    );
  });

  it("preserves the server's stable error code", async () => {
    mockJson({ detail: { code: "SESSION_NOT_FOUND" } }, 404);

    const request = sendGuideMessage("ses_missing", "msg_test", "Daily commute");

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
