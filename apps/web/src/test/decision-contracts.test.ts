import { afterEach, describe, expect, it, vi } from "vitest";

import { validateGuideTurnResponse } from "@/lib/decision-contracts";
import {
  addCartItem,
  compareProducts,
  previewCart,
  sendGuideMessage,
} from "@/lib/api-client";

const context = {
  id: "morning-routine-uv-001",
  anchor_product_id: "seoul-shade-daily-fluid",
  anchor_product_name: "Seoul Shade Daily Fluid",
  creator_handle: "@synthetic_creator",
  caption: "Synthetic sunscreen demo",
  claims: [],
};

const openingMessage = {
  id: "gmsg_opening",
  sequence: 1,
  role: "ASSISTANT",
  kind: "OPENING",
  text: "我看到你在看 Seoul Shade。你最想确认什么？",
  created_at: "2026-08-10T00:00:00Z",
  redacted: false,
  quick_replies: ["适合油皮吗？", "会不会泛白？", "和防水款比比"],
  recommendations: [],
  evidence: [],
};

const openingTurn = {
  session_id: "ses_contract",
  trace_id: "trc_contract",
  locale: "zh-CN",
  state: "UNDERSTAND",
  kind: "opening",
  text: openingMessage.text,
  context,
  guide_status: "ACTIVE",
  guide_view_kind: "OPENING_CONTEXT",
  guide_revision: 1,
  conversation_revision: 1,
  facts_snapshot_at: "2026-08-10T00:00:00Z",
  allowed_actions: ["SEND_MESSAGE", "RETURN_TO_FEED"],
  degraded: false,
  recommendations: [],
  evidence: [],
  quick_replies: openingMessage.quick_replies,
  transcript: [openingMessage],
};

const userMessage = {
  id: "gmsg_user",
  sequence: 2,
  role: "USER",
  kind: "USER_TEXT",
  text: "会不会泛白？",
  created_at: "2026-08-10T00:00:01Z",
  redacted: false,
  quick_replies: [],
  recommendations: [],
  evidence: [],
};

const answerMessage = {
  id: "gmsg_answer",
  sequence: 3,
  role: "ASSISTANT",
  kind: "ANSWER",
  text: "现有资料不能保证所有肤色都完全不泛白。",
  created_at: "2026-08-10T00:00:02Z",
  redacted: false,
  quick_replies: [],
  recommendations: [],
  evidence: [],
};

const answerTurn = {
  ...openingTurn,
  state: "VERIFY_CURRENT_PRODUCT",
  kind: "answer",
  text: answerMessage.text,
  guide_view_kind: "ANSWER_READY",
  conversation_revision: 2,
  quick_replies: [],
  transcript: [openingMessage, userMessage, answerMessage],
};

const comparison = {
  session_id: "ses_contract",
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

const comparisonMessage = {
  ...answerMessage,
  id: "gmsg_comparison",
  sequence: 4,
  kind: "COMPARISON",
  text: "两款商品的结构化比较已生成。",
  comparison,
};

const comparisonTurn = {
  ...openingTurn,
  state: "COMPARE",
  kind: "recommendation",
  text: comparisonMessage.text,
  guide_view_kind: "COMPARISON_READY",
  conversation_revision: 3,
  allowed_actions: ["SEND_MESSAGE", "OPEN_PRODUCT", "RETURN_TO_FEED"],
  comparison,
  transcript: [openingMessage, userMessage, answerMessage, comparisonMessage],
};

describe("Guide transcript runtime validation", () => {
  it("accepts an opening transcript with the exact OPENING_CONTEXT actions", () => {
    expect(validateGuideTurnResponse(openingTurn)).toEqual(openingTurn);
  });

  it("accepts an ANSWER transcript with the exact ANSWER_READY actions", () => {
    expect(validateGuideTurnResponse(answerTurn)).toEqual(answerTurn);
  });

  it("rejects duplicate transcript message IDs", () => {
    expect(
      validateGuideTurnResponse({
        ...answerTurn,
        transcript: [
          openingMessage,
          { ...userMessage, id: openingMessage.id },
          answerMessage,
        ],
      }),
    ).toBeNull();
  });

  it("rejects duplicate transcript sequences", () => {
    expect(
      validateGuideTurnResponse({
        ...answerTurn,
        transcript: [
          openingMessage,
          { ...userMessage, sequence: 1 },
          answerMessage,
        ],
      }),
    ).toBeNull();
  });

  it("rejects non-increasing transcript sequences", () => {
    expect(
      validateGuideTurnResponse({
        ...answerTurn,
        transcript: [
          openingMessage,
          { ...userMessage, sequence: 3 },
          { ...answerMessage, sequence: 2 },
        ],
      }),
    ).toBeNull();
  });

  it("rejects USER transcript attachments", () => {
    expect(
      validateGuideTurnResponse({
        ...answerTurn,
        transcript: [
          openingMessage,
          { ...userMessage, quick_replies: ["不该出现"] },
          answerMessage,
        ],
      }),
    ).toBeNull();
  });

  it("rejects a USER message whose kind is not USER_TEXT", () => {
    expect(
      validateGuideTurnResponse({
        ...answerTurn,
        transcript: [
          openingMessage,
          { ...userMessage, kind: "ANSWER" },
          answerMessage,
        ],
      }),
    ).toBeNull();
  });

  it("rejects an ASSISTANT message whose kind is USER_TEXT", () => {
    expect(
      validateGuideTurnResponse({
        ...answerTurn,
        transcript: [
          openingMessage,
          userMessage,
          { ...answerMessage, kind: "USER_TEXT" },
        ],
      }),
    ).toBeNull();
  });

  it("rejects blank transcript text", () => {
    expect(
      validateGuideTurnResponse({
        ...answerTurn,
        transcript: [openingMessage, userMessage, { ...answerMessage, text: "  " }],
      }),
    ).toBeNull();
  });

  it("rejects invalid transcript timestamps", () => {
    expect(
      validateGuideTurnResponse({
        ...answerTurn,
        transcript: [
          openingMessage,
          userMessage,
          { ...answerMessage, created_at: "not-a-timestamp" },
        ],
      }),
    ).toBeNull();
  });

  it("rejects non-boolean redaction metadata", () => {
    expect(
      validateGuideTurnResponse({
        ...answerTurn,
        transcript: [
          openingMessage,
          { ...userMessage, redacted: "false" },
          answerMessage,
        ],
      }),
    ).toBeNull();
  });

  it("accepts only the exact health placeholder as a redacted USER message", () => {
    expect(
      validateGuideTurnResponse({
        ...answerTurn,
        transcript: [
          openingMessage,
          {
            ...userMessage,
            text: "已隐藏一条健康相关描述",
            redacted: true,
          },
          answerMessage,
        ],
      }),
    ).not.toBeNull();
  });

  it("rejects raw USER text marked as redacted", () => {
    expect(
      validateGuideTurnResponse({
        ...answerTurn,
        transcript: [
          openingMessage,
          { ...userMessage, redacted: true },
          answerMessage,
        ],
      }),
    ).toBeNull();
  });

  it("rejects the health placeholder when redacted is false", () => {
    expect(
      validateGuideTurnResponse({
        ...answerTurn,
        transcript: [
          openingMessage,
          { ...userMessage, text: "已隐藏一条健康相关描述" },
          answerMessage,
        ],
      }),
    ).toBeNull();
  });

  it("rejects redacted assistant messages", () => {
    expect(
      validateGuideTurnResponse({
        ...answerTurn,
        transcript: [
          openingMessage,
          userMessage,
          { ...answerMessage, redacted: true },
        ],
      }),
    ).toBeNull();
  });

  it.each([
    "2026-08-10",
    "2026-08-10T00:00:00",
    "2026-02-30T00:00:00Z",
    "2026-08-10T24:00:00Z",
  ])("rejects a non-RFC3339 transcript timestamp: %s", (createdAt) => {
    expect(
      validateGuideTurnResponse({
        ...answerTurn,
        transcript: [
          openingMessage,
          userMessage,
          { ...answerMessage, created_at: createdAt },
        ],
      }),
    ).toBeNull();
  });

  it("accepts a real RFC3339 timestamp with an explicit offset", () => {
    expect(
      validateGuideTurnResponse({
        ...answerTurn,
        transcript: [
          openingMessage,
          userMessage,
          { ...answerMessage, created_at: "2026-08-10T08:30:45.123+08:00" },
        ],
      }),
    ).not.toBeNull();
  });

  it("rejects COMPARISON transcript messages without a comparison", () => {
    const missingComparison = { ...comparisonMessage };
    delete (missingComparison as Partial<typeof comparisonMessage>).comparison;
    expect(
      validateGuideTurnResponse({
        ...comparisonTurn,
        transcript: [openingMessage, userMessage, answerMessage, missingComparison],
      }),
    ).toBeNull();
  });

  it("rejects comparison attachments on non-COMPARISON transcript messages", () => {
    expect(
      validateGuideTurnResponse({
        ...answerTurn,
        transcript: [
          openingMessage,
          userMessage,
          { ...answerMessage, comparison },
        ],
      }),
    ).toBeNull();
  });

  it("rejects transcript comparisons owned by a different session", () => {
    expect(
      validateGuideTurnResponse({
        ...comparisonTurn,
        transcript: [
          openingMessage,
          userMessage,
          answerMessage,
          {
            ...comparisonMessage,
            comparison: { ...comparison, session_id: "ses_other" },
          },
        ],
      }),
    ).toBeNull();
  });

  it("rejects a top-level comparison that differs from the transcript attachment", () => {
    expect(
      validateGuideTurnResponse({
        ...comparisonTurn,
        comparison: {
          ...comparison,
          product_ids: ["cloud-veil-mineral", "seoul-shade-daily-fluid"],
          rows: {
            ...comparison.rows,
            starting_price_usd: [17, 14],
            fragrance_free: [true, true],
            water_resistance_minutes: [40, null],
            finish: ["matte", "natural"],
            white_cast_risk: ["medium", "low"],
          },
        },
      }),
    ).toBeNull();
  });

  it("rejects unknown Guide actions", () => {
    expect(
      validateGuideTurnResponse({
        ...openingTurn,
        allowed_actions: ["SEND_MESSAGE", "DELETE_SESSION", "RETURN_TO_FEED"],
      }),
    ).toBeNull();
  });

  it("rejects unknown Guide view kinds", () => {
    expect(
      validateGuideTurnResponse({
        ...openingTurn,
        guide_view_kind: "CHAT_READY",
      }),
    ).toBeNull();
  });

  it("rejects action subsets instead of accepting partial view authority", () => {
    expect(
      validateGuideTurnResponse({
        ...openingTurn,
        allowed_actions: ["RETURN_TO_FEED"],
      }),
    ).toBeNull();
  });

  it("rejects a conversation revision older than accepted transcript work", () => {
    expect(
      validateGuideTurnResponse({
        ...answerTurn,
        conversation_revision: 1,
      }),
    ).toBeNull();
  });

  it("accepts a comparison owned by both the turn and its last transcript message", () => {
    expect(validateGuideTurnResponse(comparisonTurn)).toEqual(comparisonTurn);
  });
});

describe("Guide API client reliability fields", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function responseWith(payload: unknown) {
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify(payload),
    } as Response;
  }

  it("encodes the session path and sends one message ID with its expected revision", async () => {
    const responseTurn = {
      ...openingTurn,
      session_id: "session/with space",
    };
    const fetchMock = vi.fn().mockResolvedValue(responseWith(responseTurn));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      sendGuideMessage("session/with space", "msg_stable", "会泛白吗？", 4),
    ).resolves.toEqual(responseTurn);

    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:8000/api/v1/guide/sessions/session%2Fwith%20space/messages",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          message_id: "msg_stable",
          text: "会泛白吗？",
          expected_conversation_revision: 4,
        }),
      }),
    );
  });

  it("encodes the session path and sends one compare request ID with its expected revision", async () => {
    const responseComparison = {
      ...comparison,
      session_id: "session/with space",
    };
    const fetchMock = vi.fn().mockResolvedValue(responseWith(responseComparison));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      compareProducts(
        "session/with space",
        "cmp_stable",
        comparison.product_ids,
        5,
      ),
    ).resolves.toEqual(responseComparison);

    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:8000/api/v1/guide/sessions/session%2Fwith%20space/compare",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          request_id: "cmp_stable",
          product_ids: comparison.product_ids,
          expected_conversation_revision: 5,
        }),
      }),
    );
  });

  it("encodes legacy cart session path segments too", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(responseWith({ preview: true }))
      .mockResolvedValueOnce(responseWith({ item: true }));
    vi.stubGlobal("fetch", fetchMock);

    await previewCart("session/with space", "sku_1");
    await addCartItem("session/with space", "confirmation_1");

    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "http://127.0.0.1:8000/api/v1/guide/sessions/session%2Fwith%20space/cart/preview",
      "http://127.0.0.1:8000/api/v1/guide/sessions/session%2Fwith%20space/cart/items",
    ]);
  });
});
