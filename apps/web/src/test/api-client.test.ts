import { afterEach, describe, expect, it, vi } from "vitest";

import type { components } from "@shopping-guide/contracts/src/api";

import {
  ApiError,
  addCartItem,
  compareProducts,
  createGuideSession,
  previewCart,
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
} satisfies components["schemas"]["GuideTurnResponse"];

const compareResponse = {
  session_id: "ses_test",
  state: "COMPARE",
  product_ids: ["product_one", "product_two"],
  rows: { price_usd: [19, 24] },
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
