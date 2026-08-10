import type { components } from "@shopping-guide/contracts/src/api";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GuideSheet, claimStatusLabel } from "@/components/guide-sheet";
import { ApiError } from "@/lib/api-client";

const api = vi.hoisted(() => ({
  compareProducts: vi.fn(),
  createGuideSession: vi.fn(),
  getGuideSession: vi.fn(),
  sendGuideMessage: vi.fn(),
}));

vi.mock("@/lib/api-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api-client")>()),
  ...api,
}));

type GuideTurn = components["schemas"]["GuideTurnResponse"];
type GuideAction = components["schemas"]["GuideAction"];
type GuideViewKind = components["schemas"]["GuideViewKind"];
type EvidenceReference = components["schemas"]["EvidenceReference"];
type Recommendation = components["schemas"]["RecommendationCard"];
type CompareResponse = components["schemas"]["CompareResponse"];
type TranscriptMessage = components["schemas"]["GuideTranscriptMessage"];

const context: components["schemas"]["ContentContextSummary"] = {
  id: "morning-routine-uv-001",
  anchor_product_id: "seoul-shade-daily-fluid",
  anchor_product_name: "Seoul Shade Daily Fluid",
  creator_handle: "@routine.notes",
  caption: "A lightweight SPF step for a humid commute",
  claims: [
    {
      claim_id: "claim-supported",
      evidence_id: "evidence-supported",
      status: "SUPPORTED",
      text: "Broad-spectrum sunscreen is relevant for daily UV protection.",
    },
    {
      claim_id: "claim-conflicting",
      evidence_id: "evidence-conflicting",
      status: "CONFLICTING",
      text: "A sunscreen can be treated as waterproof all day.",
    },
    {
      claim_id: "claim-insufficient",
      evidence_id: "evidence-insufficient",
      status: "INSUFFICIENT_EVIDENCE",
      text: "This exact formula leaves no white cast on every complexion.",
    },
    {
      claim_id: "claim-mixed",
      evidence_id: "evidence-mixed",
      status: "SUBJECTIVE_MIXED",
      text: "The finish feels weightless under makeup.",
    },
  ],
};

const evidence: EvidenceReference[] = [
  {
    evidence_id: "evidence-supported",
    source_kind: "public_rule",
    status: "SUPPORTED",
    synthetic: false,
    title: "FDA sunscreen labeling guide",
    summary: "Broad-spectrum labeling and directions work together.",
    url: "https://www.fda.gov/drugs/sunscreen-guide",
  },
  {
    evidence_id: "evidence-conflicting",
    source_kind: "public_rule",
    status: "CONFLICTING",
    synthetic: false,
    title: "Unsafe source must not become a link",
    summary: "The video wording conflicts with the labeled claim.",
    url: "javascript:alert('unsafe')",
  },
  {
    evidence_id: "evidence-insufficient",
    source_kind: "public_rule",
    status: "INSUFFICIENT_EVIDENCE",
    synthetic: false,
    title: "Evidence gap",
    summary: "No source verifies the claim for every complexion.",
    url: "https://www.fda.gov/consumers/consumer-updates/sunscreen-how-help-protect-your-skin-sun",
  },
  {
    evidence_id: "evidence-mixed",
    source_kind: "synthetic_review_aggregate",
    status: "SUBJECTIVE_MIXED",
    synthetic: true,
    title: "Synthetic review aggregate",
    summary: "The synthetic benchmark contains mixed finish reports.",
    url: "https://evidence.local.invalid/evidence-mixed",
  },
];

const recommendations: Recommendation[] = [
  {
    product_id: "seoul-shade-daily-fluid",
    brand: "Mirae Lab",
    name: "Seoul Shade Daily Fluid",
    verdict: "SUITABLE",
    starting_price_usd: 14,
    fit_reasons: ["natural finish", "listed for sensitive skin", "third reason", "hidden fourth"],
    tradeoffs: ["No labeled water resistance", "Reapply for extended exposure"],
    evidence_ids: evidence.map((item) => item.evidence_id),
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
    evidence_ids: ["evidence-supported"],
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
    evidence_ids: ["evidence-supported"],
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
];

const actionsByView: Record<GuideViewKind, GuideAction[]> = {
  OPENING_CONTEXT: ["SEND_MESSAGE", "RETURN_TO_FEED"],
  ANSWER_READY: ["SEND_MESSAGE", "RETURN_TO_FEED"],
  CONTEXT_CONFIRMATION: ["SEND_MESSAGE", "CONFIRM_CONTEXT", "RETURN_TO_FEED"],
  WAITING_CLARIFICATION: [
    "SEND_MESSAGE",
    "ANSWER_CLARIFICATION",
    "SKIP_CLARIFICATION",
    "UPDATE_CONSTRAINTS",
    "RETURN_TO_FEED",
  ],
  VERIFYING_FACTS: ["RETURN_TO_FEED"],
  DECISION_READY: [
    "SEND_MESSAGE",
    "UPDATE_CONSTRAINTS",
    "REQUEST_COMPARISON",
    "OPEN_PRODUCT",
    "RETURN_TO_FEED",
  ],
  NO_MATCH: ["SEND_MESSAGE", "RELAX_CONSTRAINT", "RETURN_TO_FEED"],
  INSUFFICIENT_EVIDENCE: [
    "SEND_MESSAGE",
    "OPEN_PRODUCT",
    "CONTINUE_WITH_KNOWN",
    "RETURN_TO_FEED",
  ],
  COMPARISON_READY: ["SEND_MESSAGE", "OPEN_PRODUCT", "RETURN_TO_FEED"],
  SAFE_BOUNDARY: ["RETURN_TO_FEED"],
  RECOVERY_REQUIRED: ["RETRY_GUIDE_OPERATION", "RETURN_TO_FEED"],
  FATAL_ERROR: ["RETURN_TO_FEED"],
};

function turnFor(
  guideViewKind: GuideViewKind,
  overrides: Partial<GuideTurn> = {},
): GuideTurn {
  const isDecision = [
    "DECISION_READY",
    "INSUFFICIENT_EVIDENCE",
    "COMPARISON_READY",
    "RECOVERY_REQUIRED",
    "FATAL_ERROR",
  ].includes(guideViewKind);
  const isNoMatch = guideViewKind === "NO_MATCH";
  const isSafe = guideViewKind === "SAFE_BOUNDARY";
  const isClarification = guideViewKind === "WAITING_CLARIFICATION";
  const text = overrides.text ?? `${guideViewKind} 的可见说明`;
  const turnRecommendations =
    overrides.recommendations ?? (isDecision ? recommendations : []);
  const turnEvidence = overrides.evidence ?? (isDecision ? evidence : []);
  const transcriptKind: TranscriptMessage["kind"] = isSafe
    ? "SAFETY"
    : isNoMatch
      ? "NO_MATCH"
      : guideViewKind === "COMPARISON_READY"
        ? "COMPARISON"
        : guideViewKind === "DECISION_READY"
          ? "RECOMMENDATION"
          : guideViewKind === "ANSWER_READY"
            ? "ANSWER"
            : guideViewKind === "RECOVERY_REQUIRED" ||
                guideViewKind === "FATAL_ERROR"
              ? "RECOVERY"
              : isClarification
                ? "OPENING"
                : "QUESTION";
  const quickReplies = isClarification
    ? ["适合油皮吗？", "会不会泛白？", "和防水款比比"]
    : [];
  const transcript: TranscriptMessage[] = isSafe
    ? [
        {
          id: "msg_redacted_health",
          sequence: 1,
          role: "USER",
          kind: "USER_TEXT",
          text: "已隐藏一条健康相关描述",
          redacted: true,
        },
        {
          id: `msg_${guideViewKind.toLowerCase()}`,
          sequence: 2,
          role: "ASSISTANT",
          kind: transcriptKind,
          text,
          redacted: false,
        },
      ]
    : [
        {
          id: `msg_${guideViewKind.toLowerCase()}`,
          sequence: 1,
          role: "ASSISTANT",
          kind: transcriptKind,
          text,
          quick_replies: quickReplies,
          recommendations: turnRecommendations,
          evidence: turnEvidence,
          comparison: overrides.comparison,
          redacted: false,
        },
      ];
  return {
    session_id: "ses_guide_1",
    trace_id: "trace_guide_1",
    state:
      guideViewKind === "COMPARISON_READY"
        ? "COMPARE"
        : isClarification
          ? "CLARIFY"
          : "PRESENT_RECOMMENDATION",
    kind: isSafe
      ? "safety_boundary"
      : isNoMatch
        ? "no_match"
        : isDecision
          ? "recommendation"
          : isClarification
            ? "clarification"
            : "opening",
    text,
    context,
    quick_replies: quickReplies,
    locale: "zh-CN",
    guide_status: isSafe ? "SAFE_EXIT" : guideViewKind === "FATAL_ERROR" ? "FAILED" : isClarification ? "WAITING_USER" : "ACTIVE",
    guide_view_kind: guideViewKind,
    guide_revision: 1,
    conversation_revision: 1,
    facts_snapshot_at: "2026-08-05T00:00:00Z",
    allowed_actions: actionsByView[guideViewKind],
    degraded: false,
    verdict:
      guideViewKind === "INSUFFICIENT_EVIDENCE"
        ? "INSUFFICIENT_EVIDENCE"
        : isNoMatch
          ? "NOT_RECOMMENDED"
          : isDecision
            ? "SUITABLE"
            : undefined,
    recommendations: turnRecommendations,
    evidence: turnEvidence,
    transcript,
    ...overrides,
  };
}

const clarificationTurn = turnFor("WAITING_CLARIFICATION", {
  text: "主要是日常通勤，还是需要 40/80 分钟防水？",
});

const recommendationTurn = turnFor("DECISION_READY", {
  guide_revision: 2,
  conversation_revision: 2,
  text: "这些商品满足你明确条件。第一款最接近你的偏好，请选择前查看取舍。",
});

const comparison: CompareResponse = {
  session_id: "ses_guide_1",
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

const comparisonReadyTurn = turnFor("COMPARISON_READY", {
  guide_revision: 3,
  conversation_revision: 3,
  comparison,
});

const recommendationTranscript: TranscriptMessage[] = [
  {
    id: "msg_opening",
    sequence: 1,
    role: "ASSISTANT",
    kind: "OPENING",
    text: "我看到你在看 Seoul Shade。你最想确认什么？",
    quick_replies: ["适合油皮吗？", "会不会泛白？", "和防水款比比"],
    redacted: false,
  },
  {
    id: "msg_user_recommendation",
    sequence: 2,
    role: "USER",
    kind: "USER_TEXT",
    text: "帮我选一款",
    redacted: false,
  },
  {
    id: "msg_recommendation",
    sequence: 3,
    role: "ASSISTANT",
    kind: "RECOMMENDATION",
    text: "日常通勤更适合这款。",
    recommendations,
    evidence,
    redacted: false,
  },
];

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

async function reachRecommendations({
  onOpenProduct = vi.fn(),
}: {
  onOpenProduct?: (productId: string, role: "current" | "alternative") => void;
} = {}) {
  const user = userEvent.setup();
  render(
    <GuideSheet
      open
      onClose={vi.fn()}
      onOpenProduct={onOpenProduct}
    />,
  );
  await screen.findByRole("button", { name: "会不会泛白？" });
  await user.click(screen.getByRole("button", { name: "会不会泛白？" }));
  await screen.findByRole("article", {
    name: "Seoul Shade Daily Fluid 商品建议",
  });
  return user;
}

async function selectFirstTwoCandidates() {
  await screen.findByRole("button", { name: "和另一款比比" });
}

beforeEach(() => {
  sessionStorage.clear();
  for (const client of [
    api.compareProducts,
    api.createGuideSession,
    api.getGuideSession,
    api.sendGuideMessage,
  ]) {
    client.mockReset();
  }
  api.createGuideSession.mockResolvedValue(clarificationTurn);
  api.getGuideSession.mockResolvedValue(clarificationTurn);
  api.sendGuideMessage.mockResolvedValue(recommendationTurn);
  api.compareProducts.mockResolvedValue(comparison);
});

afterEach(() => {
  cleanup();
  sessionStorage.clear();
  document.body.style.overflow = "";
});

it("expands the sheet only after the user opens the alternatives subview", async () => {
  api.createGuideSession.mockResolvedValueOnce({
    ...recommendationTurn,
    transcript: recommendationTranscript,
  });
  const user = userEvent.setup();

  render(<GuideSheet open onClose={vi.fn()} />);

  const dialog = screen.getByRole("dialog", { name: "AI 导购（概念）" });
  expect(await screen.findByRole("button", { name: "看看其他选择" })).toBeVisible();
  expect(dialog).toHaveAttribute("data-mode", "compact");

  await user.click(screen.getByRole("button", { name: "看看其他选择" }));

  expect(dialog).toHaveAttribute("data-mode", "expanded");
  expect(screen.getByRole("region", { name: "其他选择" })).toBeVisible();
});

it.each([
  ["opening", clarificationTurn],
  ["short answer", turnFor("ANSWER_READY")],
  ["no match", turnFor("NO_MATCH")],
  ["safety", turnFor("SAFE_BOUNDARY")],
] as const)("keeps %s in compact mode", async (_label, nextTurn) => {
  api.createGuideSession.mockResolvedValueOnce(nextTurn);

  render(<GuideSheet open onClose={vi.fn()} />);

  const dialog = screen.getByRole("dialog", { name: "AI 导购（概念）" });
  await screen.findByRole("log", { name: "导购对话" });
  expect(dialog).toHaveAttribute("data-mode", "compact");
});

it("restores an authoritative comparison directly in expanded mode", async () => {
  api.createGuideSession.mockResolvedValueOnce(comparisonReadyTurn);

  render(<GuideSheet open onClose={vi.fn()} />);

  const dialog = screen.getByRole("dialog", { name: "AI 导购（概念）" });
  expect(await screen.findByRole("table", { name: "商品对比" })).toBeVisible();
  expect(dialog).toHaveAttribute("data-mode", "expanded");
});

it("shows only the pending user bubble and status before canonical message resolution", async () => {
  const pending = deferred<GuideTurn>();
  api.sendGuideMessage.mockReturnValueOnce(pending.promise);
  const user = userEvent.setup();
  render(<GuideSheet open onClose={vi.fn()} />);
  await screen.findByRole("button", { name: "会不会泛白？" });

  await user.click(screen.getByRole("button", { name: "会不会泛白？" }));

  const log = screen.getByRole("log", { name: "导购对话" });
  expect(within(log).getByRole("article", { name: "你" })).toHaveTextContent(
    "会不会泛白？",
  );
  expect(within(log).getAllByRole("article", { name: "AI" })).toHaveLength(1);
  expect(within(log).getByRole("status")).toHaveTextContent(
    "正在核对商品信息…",
  );

  await act(async () =>
    pending.resolve(
      turnFor("ANSWER_READY", {
        conversation_revision: 2,
        transcript: [
          ...clarificationTurn.transcript!,
          {
            id: "msg_pending_user_resolved",
            sequence: 2,
            role: "USER",
            kind: "USER_TEXT",
            text: "会不会泛白？",
            redacted: false,
          },
          {
            id: "msg_pending_answer_resolved",
            sequence: 3,
            role: "ASSISTANT",
            kind: "ANSWER",
            text: "现有资料显示泛白风险较低。",
            redacted: false,
          },
        ],
      }),
    ),
  );

  expect(await screen.findByText("现有资料显示泛白风险较低。")).toBeVisible();
  expect(within(log).queryByRole("status")).not.toBeInTheDocument();
  expect(within(log).getAllByRole("article", { name: "AI" })).toHaveLength(2);
});

it("expands while comparison is pending without inventing an assistant reply", async () => {
  const pendingComparison = deferred<CompareResponse>();
  api.createGuideSession.mockResolvedValueOnce({
    ...recommendationTurn,
    transcript: recommendationTranscript,
  });
  api.compareProducts.mockReturnValueOnce(pendingComparison.promise);
  const user = userEvent.setup();
  render(<GuideSheet open onClose={vi.fn()} />);
  await screen.findByRole("button", { name: "和另一款比比" });

  await user.click(screen.getByRole("button", { name: "和另一款比比" }));

  const dialog = screen.getByRole("dialog", { name: "AI 导购（概念）" });
  const log = screen.getByRole("log", { name: "导购对话" });
  expect(dialog).toHaveAttribute("data-mode", "expanded");
  expect(within(log).getByRole("status")).toHaveTextContent(
    "正在核对商品信息…",
  );
  expect(within(log).getAllByRole("article", { name: "AI" })).toHaveLength(2);
});

it("keeps evidence compact and does not let transcript length expand the sheet", async () => {
  const longTranscript = Array.from({ length: 10 }, (_, index) => ({
    id: `msg_history_${index}`,
    sequence: index + 1,
    role: (index % 2 === 0 ? "USER" : "ASSISTANT") as TranscriptMessage["role"],
    kind: (index % 2 === 0 ? "USER_TEXT" : "ANSWER") as TranscriptMessage["kind"],
    text: `历史消息 ${index + 1}`,
    redacted: false,
  }));
  api.createGuideSession.mockResolvedValueOnce({
    ...recommendationTurn,
    transcript: [...longTranscript, ...recommendationTranscript.slice(-1)],
  });
  const user = userEvent.setup();
  render(<GuideSheet open onClose={vi.fn()} />);
  await screen.findByRole("button", { name: "查看 4 条依据" });

  const dialog = screen.getByRole("dialog", { name: "AI 导购（概念）" });
  expect(dialog).toHaveAttribute("data-mode", "compact");
  await user.click(screen.getByRole("button", { name: "查看 4 条依据" }));
  expect(screen.getByRole("region", { name: /的依据/ })).toBeVisible();
  expect(dialog).toHaveAttribute("data-mode", "compact");
});

it.each([
  ["SUPPORTED", "有公开依据"],
  ["CONFLICTING", "与来源冲突"],
  ["INSUFFICIENT_EVIDENCE", "证据不足"],
  ["SUBJECTIVE_MIXED", "主观体验分歧"],
] as const)("keeps the %s evidence state distinct in Chinese", (status, label) => {
  expect(claimStatusLabel(status)).toBe(label);
});

it("opens with inherited creator/product context, three Chinese starting questions, and no commerce controls", async () => {
  render(<GuideSheet open onClose={vi.fn()} />);

  expect(screen.getByRole("dialog", { name: "AI 导购（概念）" })).toHaveAttribute(
    "aria-modal",
    "true",
  );
  await screen.findByText("@routine.notes");

  expect(api.createGuideSession).toHaveBeenCalledOnce();
  expect(api.createGuideSession).toHaveBeenCalledWith(
    "morning-routine-uv-001",
    "zh-CN",
  );
  expect(screen.getByText("Seoul Shade Daily Fluid")).toBeVisible();
  for (const prompt of ["适合油皮吗？", "会不会泛白？", "和防水款比比"]) {
    expect(screen.getByRole("button", { name: prompt })).toBeVisible();
  }
  expect(screen.getByText("AI 生成 · 合成原型")).toBeVisible();
  expect(screen.getByLabelText("继续提问")).toHaveAttribute(
    "placeholder",
    "问问这款商品…",
  );
  expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /购物车|加购|购买|SKU/i })).not.toBeInTheDocument();
  expect(document.body).not.toHaveTextContent("seoul-shade-30");
});

it("enters a clear fatal state when the initial Guide response is invalid", async () => {
  api.createGuideSession.mockRejectedValueOnce(
    new ApiError(200, "INVALID_API_RESPONSE"),
  );

  render(<GuideSheet open onClose={vi.fn()} />);

  expect(
    await screen.findByRole("heading", { name: "导购暂时不可用" }),
  ).toBeVisible();
  expect(screen.getByText("导购暂时不可用，请返回 Feed 后重新打开。")).toBeVisible();
  expect(screen.queryByRole("button", { name: "重新同步" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "关闭导购" })).toBeEnabled();
});

it("sends one of the server-owned opening replies explicitly", async () => {
  const user = userEvent.setup();
  render(<GuideSheet open onClose={vi.fn()} />);
  await screen.findByRole("button", { name: "适合油皮吗？" });

  expect(screen.getByText(clarificationTurn.text)).toBeVisible();
  await user.click(screen.getByRole("button", { name: "适合油皮吗？" }));
  expect(screen.queryByRole("button", { name: "适合油皮吗？" })).not.toBeInTheDocument();
  expect(api.sendGuideMessage).toHaveBeenCalledWith(
    "ses_guide_1",
    expect.stringMatching(/^msg_/),
    "适合油皮吗？",
    1,
  );
});

it("submits free Chinese constraints, shows verified progress, and blocks duplicate submits synchronously", async () => {
  const pending = deferred<GuideTurn>();
  api.sendGuideMessage.mockReturnValue(pending.promise);
  render(<GuideSheet open onClose={vi.fn()} />);
  await screen.findByLabelText("继续提问");

  const input = screen.getByLabelText("继续提问");
  fireEvent.change(input, {
    target: { value: "油敏皮、深肤色，预算 30 美元以内" },
  });
  const form = input.closest("form");
  expect(form).not.toBeNull();
  fireEvent.submit(form!);
  fireEvent.submit(form!);

  expect(api.sendGuideMessage).toHaveBeenCalledOnce();
  expect(api.sendGuideMessage).toHaveBeenCalledWith(
    "ses_guide_1",
    expect.stringMatching(/^msg_/),
    "油敏皮、深肤色，预算 30 美元以内",
    1,
  );
  expect(screen.getByRole("status")).toHaveTextContent(
    "正在核对商品信息…",
  );
  expect(screen.getByRole("button", { name: "发送消息" })).toBeDisabled();
  expect(input).toBeDisabled();

  await act(async () => pending.resolve(recommendationTurn));
  expect(
    await screen.findByRole("article", {
      name: "Seoul Shade Daily Fluid 商品建议",
    }),
  ).toBeVisible();
});

it("reconciles a failed message POST before re-enabling the previous business actions", async () => {
  const user = userEvent.setup();
  const snapshot = deferred<GuideTurn>();
  api.getGuideSession.mockReturnValueOnce(snapshot.promise);
  render(<GuideSheet open onClose={vi.fn()} />);
  await screen.findByRole("button", { name: "适合油皮吗？" });
  await user.click(screen.getByRole("button", { name: "会不会泛白？" }));
  await screen.findByRole("article", { name: "Seoul Shade Daily Fluid 商品建议" });

  api.sendGuideMessage.mockRejectedValueOnce(
    new ApiError(503, "TEMPORARY_UNAVAILABLE"),
  );
  api.sendGuideMessage.mockRejectedValueOnce(
    new ApiError(503, "TEMPORARY_UNAVAILABLE"),
  );
  await user.type(screen.getByLabelText("继续提问"), "改成优先哑光");
  await user.click(screen.getByRole("button", { name: "发送消息" }));

  await waitFor(() =>
    expect(api.getGuideSession).toHaveBeenCalledWith("ses_guide_1"),
  );
  expect(screen.getByRole("dialog", { name: "AI 导购（概念）" })).toHaveAttribute(
    "aria-busy",
    "true",
  );
  expect(screen.queryByRole("button", { name: "看商品" })).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "和另一款比比" }),
  ).not.toBeInTheDocument();
  expect(api.compareProducts).not.toHaveBeenCalled();

  await act(async () =>
    snapshot.resolve(
      turnFor("DECISION_READY", {
        guide_revision: 3,
        conversation_revision: 3,
        text: "已从服务端恢复最新的哑光优先结果",
      }),
    ),
  );
  expect(
    await screen.findByText("已从服务端恢复最新的哑光优先结果"),
  ).toBeVisible();
  expect(screen.getByRole("dialog", { name: "AI 导购（概念）" })).toHaveAttribute(
    "aria-busy",
    "false",
  );
  expect(screen.getAllByRole("button", { name: "看商品" })[0]).toBeEnabled();
});

it("keeps the last verified result read-only when reconciliation fails and retries the snapshot", async () => {
  const user = await reachRecommendations();
  api.sendGuideMessage.mockRejectedValueOnce(
    new ApiError(503, "TEMPORARY_UNAVAILABLE"),
  );
  api.sendGuideMessage.mockRejectedValueOnce(
    new ApiError(503, "TEMPORARY_UNAVAILABLE"),
  );
  api.getGuideSession.mockRejectedValueOnce(
    new ApiError(503, "TEMPORARY_UNAVAILABLE"),
  );
  await user.type(screen.getByLabelText("继续提问"), "改成优先哑光");
  await user.click(screen.getByRole("button", { name: "发送消息" }));

  expect(await screen.findByRole("alert")).toHaveTextContent("尚未确认服务端最终状态");
  expect(screen.queryByRole("button", { name: "看商品" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "和另一款比比" })).not.toBeInTheDocument();
  const retry = screen.getByRole("button", { name: "重新同步" });
  expect(retry).toBeEnabled();

  api.getGuideSession.mockResolvedValueOnce(
    turnFor("DECISION_READY", {
      guide_revision: 3,
      conversation_revision: 3,
      text: "重新同步后的最新结果",
    }),
  );
  await user.click(retry);
  expect(await screen.findByText("重新同步后的最新结果")).toBeVisible();
  expect(screen.getAllByRole("button", { name: "看商品" })[0]).toBeEnabled();
});

it("keeps one recommendation inline and moves the remaining candidates into alternatives", async () => {
  const user = userEvent.setup();
  render(<GuideSheet open onClose={vi.fn()} />);
  await screen.findByRole("button", { name: "会不会泛白？" });
  await user.click(screen.getByRole("button", { name: "会不会泛白？" }));

  expect(await screen.findByRole("article", { name: "Seoul Shade Daily Fluid 商品建议" })).toBeVisible();
  expect(screen.getAllByRole("article", { name: /商品建议/ })).toHaveLength(1);
  expect(screen.getByText("natural finish")).toBeVisible();
  expect(screen.queryByText("third reason")).not.toBeInTheDocument();
  expect(screen.queryByText("hidden fourth")).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "看看其他选择" }));
  const alternatives = screen.getByRole("region", { name: "其他选择" });
  expect(within(alternatives).getAllByRole("article", { name: /商品建议/ })).toHaveLength(2);
  expect(screen.queryByText("Busan Soft Sun Milk")).not.toBeInTheDocument();
  expect(document.body.innerHTML).not.toContain("javascript:alert");
  expect(screen.queryByText("$14.00")).not.toBeInTheDocument();
  expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
});

it("opens current and alternative products with the correct role", async () => {
  const user = userEvent.setup();

  function Harness() {
    const [destination, setDestination] = useState("guide");
    return destination === "guide" ? (
      <GuideSheet
        open
        onClose={vi.fn()}
        onOpenProduct={(productId, role) =>
          setDestination(`${productId}:${role}`)
        }
      />
    ) : (
      <output>{destination}</output>
    );
  }

  render(<Harness />);
  await screen.findByRole("button", { name: "会不会泛白？" });
  await user.click(screen.getByRole("button", { name: "会不会泛白？" }));
  await screen.findByRole("article", { name: "Seoul Shade Daily Fluid 商品建议" });
  await user.click(screen.getByRole("button", { name: "看看其他选择" }));
  const alternativeCard = screen
    .getByRole("heading", { name: "Cloud Veil Mineral SPF" })
    .closest("article");
  expect(alternativeCard).not.toBeNull();
  await user.click(within(alternativeCard!).getByRole("button", { name: "看商品" }));
  expect(screen.getByText("cloud-veil-mineral:alternative")).toBeVisible();
});

it("applies only the authoritative Guide snapshot after a successful comparison", async () => {
  const pendingSnapshot = deferred<GuideTurn>();
  api.getGuideSession.mockReturnValueOnce(pendingSnapshot.promise);
  const user = userEvent.setup();
  render(<GuideSheet open onClose={vi.fn()} />);
  await screen.findByRole("button", { name: "会不会泛白？" });
  await user.click(screen.getByRole("button", { name: "会不会泛白？" }));
  await screen.findByRole("article", { name: "Seoul Shade Daily Fluid 商品建议" });

  await user.click(screen.getByRole("button", { name: "和另一款比比" }));

  expect(api.compareProducts).toHaveBeenCalledWith(
    "ses_guide_1",
    expect.stringMatching(/^cmp_/),
    ["seoul-shade-daily-fluid", "cloud-veil-mineral"],
    2,
  );
  await waitFor(() =>
    expect(api.getGuideSession).toHaveBeenCalledWith("ses_guide_1"),
  );
  expect(screen.queryByRole("table", { name: "商品对比" })).not.toBeInTheDocument();
  expect(screen.getByRole("dialog", { name: "AI 导购（概念）" })).toHaveAttribute(
    "aria-busy",
    "true",
  );
  expect(screen.getByRole("button", { name: "和另一款比比" })).toBeDisabled();

  await act(async () => pendingSnapshot.resolve(comparisonReadyTurn));
  expect(await screen.findByRole("table", { name: "商品对比" })).toBeVisible();
  expect(screen.queryByRole("article", { name: /商品建议/ })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "返回推荐" })).not.toBeInTheDocument();
});

it("locks comparison and product opening while comparison A+B is pending", async () => {
  const pending = deferred<CompareResponse>();
  const onOpenProduct = vi.fn();
  api.compareProducts.mockReturnValueOnce(pending.promise);
  api.getGuideSession.mockResolvedValueOnce(comparisonReadyTurn);
  const user = await reachRecommendations({ onOpenProduct });
  await selectFirstTwoCandidates();
  await user.click(screen.getByRole("button", { name: "和另一款比比" }));

  const dialog = screen.getByRole("dialog", { name: "AI 导购（概念）" });
  const compare = screen.getByRole("button", { name: "和另一款比比" });
  const open = within(
    screen.getByRole("heading", { name: "Seoul Shade Daily Fluid" }).closest(
      "article",
    )!,
  ).getByRole("button", { name: "看商品" });
  expect(dialog).toHaveAttribute("aria-busy", "true");
  expect(compare).toBeDisabled();
  expect(open).toBeDisabled();

  for (const control of [compare, open]) {
    control.removeAttribute("disabled");
    fireEvent.click(control);
  }
  expect(api.compareProducts).toHaveBeenCalledOnce();
  expect(onOpenProduct).not.toHaveBeenCalled();

  await act(async () => pending.resolve(comparison));
  const table = await screen.findByRole("table", { name: "商品对比" });
  expect(
    within(table)
      .getAllByRole("columnheader")
      .map((cell) => cell.textContent),
  ).toEqual([
    "对比维度",
    "Seoul Shade Daily Fluid",
    "Cloud Veil Mineral SPF",
  ]);
});

it("keeps all old business actions inert while a newer Guide turn is pending", async () => {
  const pending = deferred<GuideTurn>();
  const onOpenProduct = vi.fn();
  const user = await reachRecommendations({ onOpenProduct });
  api.sendGuideMessage.mockReturnValueOnce(pending.promise);
  await user.type(screen.getByLabelText("继续提问"), "现在优先哑光");
  await user.click(screen.getByRole("button", { name: "发送消息" }));

  const dialog = screen.getByRole("dialog", { name: "AI 导购（概念）" });
  expect(dialog).toHaveAttribute("aria-busy", "true");
  expect(screen.queryByRole("button", { name: "和另一款比比" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "看商品" })).not.toBeInTheDocument();
  expect(onOpenProduct).not.toHaveBeenCalled();
  expect(api.compareProducts).not.toHaveBeenCalled();

  await act(async () =>
    pending.resolve(
      turnFor("SAFE_BOUNDARY", {
        guide_revision: 3,
        conversation_revision: 3,
        text: "已切换到安全边界",
      }),
    ),
  );
  expect(await screen.findByText("已切换到安全边界")).toBeVisible();
});

it("compares the current recommendation with the first alternative in order", async () => {
  api.getGuideSession.mockResolvedValueOnce(comparisonReadyTurn);
  const user = await reachRecommendations();
  await selectFirstTwoCandidates();
  await user.click(screen.getByRole("button", { name: "和另一款比比" }));

  const table = await screen.findByRole("table", { name: "商品对比" });
  expect(api.compareProducts).toHaveBeenCalledWith(
    "ses_guide_1",
    expect.stringMatching(/^cmp_/),
    ["seoul-shade-daily-fluid", "cloud-veil-mineral"],
    2,
  );
  expect(
    within(table)
      .getAllByRole("columnheader")
      .map((cell) => cell.textContent),
  ).toEqual([
    "对比维度",
    "Seoul Shade Daily Fluid",
    "Cloud Veil Mineral SPF",
  ]);
});

it.each([
  new ApiError(503, "UNKNOWN_POST_RESULT"),
  new ApiError(200, "INVALID_API_RESPONSE"),
])("retries an unknown comparison POST once, then recovers through GET: %s", async (postError) => {
  api.compareProducts.mockRejectedValueOnce(postError);
  api.compareProducts.mockRejectedValueOnce(postError);
  api.getGuideSession.mockResolvedValueOnce(comparisonReadyTurn);
  const user = await reachRecommendations();
  await selectFirstTwoCandidates();
  await user.click(screen.getByRole("button", { name: "和另一款比比" }));

  expect(await screen.findByRole("table", { name: "商品对比" })).toBeVisible();
  expect(api.compareProducts).toHaveBeenCalledTimes(2);
  expect(api.getGuideSession).toHaveBeenCalledOnce();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

it("keeps an unknown comparison outcome frozen when GET returns a fatal turn", async () => {
  api.compareProducts.mockRejectedValueOnce(
    new ApiError(503, "UNKNOWN_POST_RESULT"),
  );
  api.getGuideSession.mockResolvedValueOnce(
    turnFor("FATAL_ERROR", {
      guide_revision: 3,
      text: "这个终态不能证明未知的比较写入结果。",
    }),
  );
  const user = await reachRecommendations();
  await selectFirstTwoCandidates();
  await user.click(screen.getByRole("button", { name: "和另一款比比" }));

  expect(
    await screen.findByRole("button", { name: "重新同步" }),
  ).toBeVisible();
  expect(screen.getByText(recommendationTurn.text)).toBeVisible();
  expect(
    screen.queryByText("这个终态不能证明未知的比较写入结果。"),
  ).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "和另一款比比" })).toBeDisabled();
});

it.each([
  "ACTION_NOT_ALLOWED",
  "PRODUCT_NOT_RECOMMENDED",
  "STALE_GUIDE_REVISION",
])("reconciles comparison conflict %s against the authoritative Guide snapshot", async (code) => {
  api.compareProducts.mockRejectedValueOnce(new ApiError(409, code));
  api.getGuideSession.mockResolvedValueOnce(comparisonReadyTurn);
  const user = await reachRecommendations();
  await selectFirstTwoCandidates();
  await user.click(screen.getByRole("button", { name: "和另一款比比" }));

  expect(await screen.findByRole("table", { name: "商品对比" })).toBeVisible();
  expect(api.compareProducts).toHaveBeenCalledOnce();
  expect(api.getGuideSession).toHaveBeenCalledWith("ses_guide_1");
  expect(screen.queryByText("比较请求未被服务端接受")).not.toBeInTheDocument();
});

it("adopts a newer authoritative decision after an action state conflict", async () => {
  const onOpenProduct = vi.fn();
  const updatedDecision = turnFor("DECISION_READY", {
    guide_revision: 3,
    conversation_revision: 2,
    text: "商品状态变化后，已按服务端最新事实重新推荐。",
    recommendations: [recommendations[2], recommendations[3]],
  });
  api.compareProducts.mockRejectedValueOnce(
    new ApiError(409, "ACTION_NOT_ALLOWED"),
  );
  api.getGuideSession.mockResolvedValueOnce(updatedDecision);
  const user = await reachRecommendations({ onOpenProduct });
  await selectFirstTwoCandidates();
  await user.click(screen.getByRole("button", { name: "和另一款比比" }));

  expect(
    await screen.findByText("商品状态变化后，已按服务端最新事实重新推荐。"),
  ).toBeVisible();
  expect(
    screen.getByRole("article", { name: "Jeju Sport Sun Gel 商品建议" }),
  ).toBeVisible();
  expect(
    screen.queryByRole("article", { name: "Cloud Veil Mineral SPF 商品建议" }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "和另一款比比" }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "重新同步" }),
  ).not.toBeInTheDocument();

  await user.click(
    within(
      screen.getByRole("article", {
        name: "Jeju Sport Sun Gel 商品建议",
      }),
    ).getByRole("button", { name: "看商品" }),
  );
  expect(onOpenProduct).toHaveBeenCalledWith(
    "jeju-sport-sun-gel",
    "alternative",
  );
  expect(api.getGuideSession).toHaveBeenCalledWith("ses_guide_1");
});

it("unfreezes an unchanged authoritative decision after a product state conflict", async () => {
  api.compareProducts.mockRejectedValueOnce(
    new ApiError(409, "PRODUCT_NOT_RECOMMENDED"),
  );
  api.getGuideSession.mockResolvedValueOnce(recommendationTurn);
  const user = await reachRecommendations();
  await selectFirstTwoCandidates();
  await user.click(screen.getByRole("button", { name: "和另一款比比" }));

  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "和另一款比比" }),
    ).toBeEnabled(),
  );
  expect(screen.getByText(recommendationTurn.text)).toBeVisible();
  expect(
    screen.queryByRole("button", { name: "重新同步" }),
  ).not.toBeInTheDocument();
  expect(screen.getAllByRole("button", { name: "看商品" })[0]).toBeEnabled();
  expect(api.compareProducts).toHaveBeenCalledOnce();
  expect(api.getGuideSession).toHaveBeenCalledWith("ses_guide_1");
});

it("adopts an authoritative safety boundary after a comparison state conflict", async () => {
  api.compareProducts.mockRejectedValueOnce(
    new ApiError(409, "ACTION_NOT_ALLOWED"),
  );
  api.getGuideSession.mockResolvedValueOnce(
    turnFor("SAFE_BOUNDARY", {
      guide_revision: 3,
      conversation_revision: 2,
      text: "服务端最新状态要求停止商品比较。",
    }),
  );
  const user = await reachRecommendations();
  await selectFirstTwoCandidates();
  await user.click(screen.getByRole("button", { name: "和另一款比比" }));

  expect(await screen.findByText("服务端最新状态要求停止商品比较。")).toBeVisible();
  expect(
    screen.queryByRole("button", { name: "重新同步" }),
  ).not.toBeInTheDocument();
  expect(screen.queryByRole("article", { name: /商品建议/ })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "看商品" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "关闭导购" })).toBeEnabled();
  expect(api.getGuideSession).toHaveBeenCalledWith("ses_guide_1");
});

it("keeps the verified decision frozen when conflict reconciliation regresses revision", async () => {
  api.compareProducts.mockRejectedValueOnce(
    new ApiError(409, "STALE_GUIDE_REVISION"),
  );
  api.getGuideSession.mockResolvedValueOnce(
    turnFor("DECISION_READY", {
      guide_revision: 1,
      text: "这是比当前结果更旧的服务端快照。",
    }),
  );
  const user = await reachRecommendations();
  await selectFirstTwoCandidates();
  await user.click(screen.getByRole("button", { name: "和另一款比比" }));

  expect(
    await screen.findByRole("button", { name: "重新同步" }),
  ).toBeVisible();
  expect(screen.getByText(recommendationTurn.text)).toBeVisible();
  expect(screen.queryByText("这是比当前结果更旧的服务端快照。")).not.toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "和另一款比比" }),
  ).toBeDisabled();
});

it("keeps the verified decision frozen when a fatal conflict snapshot regresses revision", async () => {
  api.compareProducts.mockRejectedValueOnce(
    new ApiError(409, "STALE_GUIDE_REVISION"),
  );
  api.getGuideSession.mockResolvedValueOnce(
    turnFor("FATAL_ERROR", {
      guide_revision: 1,
      text: "这是比当前结果更旧的终态快照。",
    }),
  );
  const user = await reachRecommendations();
  await selectFirstTwoCandidates();
  await user.click(screen.getByRole("button", { name: "和另一款比比" }));

  expect(
    await screen.findByRole("button", { name: "重新同步" }),
  ).toBeVisible();
  expect(screen.getByText(recommendationTurn.text)).toBeVisible();
  expect(
    screen.queryByText("这是比当前结果更旧的终态快照。"),
  ).not.toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "和另一款比比" }),
  ).toBeDisabled();
});

it("keeps the previous decision frozen when comparison conflict reconciliation is retryable", async () => {
  api.compareProducts.mockRejectedValueOnce(
    new ApiError(409, "ACTION_NOT_ALLOWED"),
  );
  api.getGuideSession
    .mockRejectedValueOnce(new ApiError(503, "TEMPORARY_UNAVAILABLE"))
    .mockResolvedValueOnce(comparisonReadyTurn);
  const user = await reachRecommendations();
  await selectFirstTwoCandidates();
  await user.click(screen.getByRole("button", { name: "和另一款比比" }));

  expect(
    await screen.findByRole("button", { name: "重新同步" }),
  ).toBeVisible();
  expect(screen.getByRole("article", { name: "Seoul Shade Daily Fluid 商品建议" })).toBeVisible();
  expect(
    screen.getByRole("button", { name: "和另一款比比" }),
  ).toBeDisabled();
  expect(screen.getAllByRole("button", { name: "看商品" })[0]).toBeDisabled();

  await user.click(screen.getByRole("button", { name: "重新同步" }));
  expect(await screen.findByRole("table", { name: "商品对比" })).toBeVisible();
  expect(api.compareProducts).toHaveBeenCalledOnce();
  expect(api.getGuideSession).toHaveBeenCalledTimes(2);
});

it("clears the previous decision when comparison conflict reconciliation proves the session is gone", async () => {
  api.compareProducts.mockRejectedValueOnce(
    new ApiError(409, "PRODUCT_NOT_RECOMMENDED"),
  );
  api.getGuideSession.mockRejectedValueOnce(
    new ApiError(404, "SESSION_NOT_FOUND"),
  );
  const user = await reachRecommendations();
  await selectFirstTwoCandidates();
  await user.click(screen.getByRole("button", { name: "和另一款比比" }));

  expect(
    await screen.findByRole("heading", { name: "导购暂时不可用" }),
  ).toBeVisible();
  expect(screen.queryByRole("article", { name: "Seoul Shade Daily Fluid 商品建议" })).not.toBeInTheDocument();
  expect(api.getGuideSession).toHaveBeenCalledOnce();
});

it("locally unlocks the previous decision when comparison input validation rejects before execution", async () => {
  api.compareProducts.mockRejectedValueOnce(
    new ApiError(422, "VALIDATION_ERROR"),
  );
  const user = await reachRecommendations();
  await selectFirstTwoCandidates();
  await user.click(screen.getByRole("button", { name: "和另一款比比" }));

  expect(await screen.findByRole("alert")).toHaveTextContent(
    "比较请求未被服务端接受",
  );
  expect(screen.getByRole("article", { name: "Seoul Shade Daily Fluid 商品建议" })).toBeVisible();
  expect(
    screen.getByRole("button", { name: "和另一款比比" }),
  ).toBeEnabled();
  expect(api.getGuideSession).not.toHaveBeenCalled();
});

it("clears the previous decision when comparison POST proves the session is gone", async () => {
  api.compareProducts.mockRejectedValueOnce(
    new ApiError(404, "SESSION_NOT_FOUND"),
  );
  const user = await reachRecommendations();
  await selectFirstTwoCandidates();
  await user.click(screen.getByRole("button", { name: "和另一款比比" }));

  expect(
    await screen.findByRole("heading", { name: "导购暂时不可用" }),
  ).toBeVisible();
  expect(screen.queryByRole("article", { name: "Seoul Shade Daily Fluid 商品建议" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "看商品" })).not.toBeInTheDocument();
  expect(api.getGuideSession).not.toHaveBeenCalled();
});

it("keeps the last decision read-only after comparison reconciliation fails and retries GET only", async () => {
  const pendingRetry = deferred<GuideTurn>();
  api.getGuideSession
    .mockRejectedValueOnce(new ApiError(503, "TEMPORARY_UNAVAILABLE"))
    .mockReturnValueOnce(pendingRetry.promise);
  const user = await reachRecommendations();
  await selectFirstTwoCandidates();
  await user.click(screen.getByRole("button", { name: "和另一款比比" }));

  expect(
    await screen.findByRole("button", { name: "重新同步" }),
  ).toBeVisible();
  expect(screen.getByRole("article", { name: "Seoul Shade Daily Fluid 商品建议" })).toBeVisible();
  expect(
    screen.getAllByRole("button", { name: "看商品" })[0],
  ).toBeDisabled();
  expect(
    screen.getByRole("button", { name: "和另一款比比" }),
  ).toBeDisabled();
  await user.click(screen.getByRole("button", { name: "重新同步" }));
  expect(api.compareProducts).toHaveBeenCalledOnce();
  expect(api.getGuideSession).toHaveBeenCalledTimes(2);
  expect(screen.queryByRole("button", { name: "重新同步" })).not.toBeInTheDocument();
  expect(screen.getByRole("dialog", { name: "AI 导购（概念）" })).toHaveAttribute(
    "aria-busy",
    "true",
  );
  await act(async () => pendingRetry.resolve(comparisonReadyTurn));
  expect(await screen.findByRole("table", { name: "商品对比" })).toBeVisible();
  expect(api.compareProducts).toHaveBeenCalledOnce();
});

it("clears the previous decision when comparison reconciliation proves the session is gone", async () => {
  const error = new ApiError(404, "SESSION_NOT_FOUND");
  api.getGuideSession.mockRejectedValueOnce(error);
  const user = await reachRecommendations();
  await selectFirstTwoCandidates();
  await user.click(screen.getByRole("button", { name: "和另一款比比" }));

  expect(
    await screen.findByRole("heading", { name: "导购暂时不可用" }),
  ).toBeVisible();
  expect(screen.queryByRole("article", { name: "Seoul Shade Daily Fluid 商品建议" })).not.toBeInTheDocument();
  expect(screen.queryByRole("table", { name: "商品对比" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "看商品" })).not.toBeInTheDocument();
});

it("keeps a verified decision frozen after an invalid comparison GET and accepts the next authoritative GET", async () => {
  api.getGuideSession
    .mockRejectedValueOnce(new ApiError(200, "INVALID_API_RESPONSE"))
    .mockResolvedValueOnce(comparisonReadyTurn);
  const user = await reachRecommendations();
  await selectFirstTwoCandidates();
  await user.click(screen.getByRole("button", { name: "和另一款比比" }));

  expect(
    await screen.findByRole("button", { name: "重新同步" }),
  ).toBeVisible();
  expect(screen.getByRole("article", { name: "Seoul Shade Daily Fluid 商品建议" })).toBeVisible();
  expect(screen.getAllByRole("button", { name: "看商品" })[0]).toBeDisabled();
  await user.click(screen.getByRole("button", { name: "重新同步" }));

  expect(await screen.findByRole("table", { name: "商品对比" })).toBeVisible();
  expect(api.compareProducts).toHaveBeenCalledOnce();
  expect(api.getGuideSession).toHaveBeenCalledTimes(2);
});

it.each([
  "OPENING_CONTEXT",
  "CONTEXT_CONFIRMATION",
  "WAITING_CLARIFICATION",
  "VERIFYING_FACTS",
  "DECISION_READY",
  "NO_MATCH",
  "INSUFFICIENT_EVIDENCE",
  "COMPARISON_READY",
  "SAFE_BOUNDARY",
  "RECOVERY_REQUIRED",
  "FATAL_ERROR",
] as const)("renders a nonempty %s view", async (viewKind) => {
  const nextTurn = turnFor(
    viewKind,
    viewKind === "COMPARISON_READY" ? { comparison } : {},
  );
  api.createGuideSession.mockResolvedValueOnce(nextTurn);
  render(<GuideSheet open onClose={vi.fn()} />);

  if (viewKind === "FATAL_ERROR") {
    expect(
      await screen.findByRole("heading", { name: "导购暂时不可用" }),
    ).toBeVisible();
  } else {
    await screen.findByLabelText(
      viewKind === "SAFE_BOUNDARY" ? "安全提示" : "当前视频商品",
    );
  }
  if (viewKind === "COMPARISON_READY") {
    expect(screen.getByRole("table", { name: "商品对比" })).toBeVisible();
  } else if (viewKind === "RECOVERY_REQUIRED") {
    expect(screen.getByRole("button", { name: "重新开始导购" })).toBeVisible();
  } else {
    expect(screen.getByText(nextTurn.text)).toBeVisible();
  }
  expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /购物车|加购|购买|SKU/i })).not.toBeInTheDocument();
});

it("does not execute business actions omitted by the server", async () => {
  api.createGuideSession.mockResolvedValueOnce(
    turnFor("DECISION_READY", { allowed_actions: ["RETURN_TO_FEED"] }),
  );
  render(<GuideSheet open onClose={vi.fn()} />);
  await screen.findByRole("article", { name: "Seoul Shade Daily Fluid 商品建议" });

  expect(screen.queryByRole("button", { name: "看商品" })).not.toBeInTheDocument();
  expect(screen.queryByRole("checkbox", { name: /比较 / })).not.toBeInTheDocument();
  expect(screen.queryByRole("textbox", { name: "继续提问" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "发送消息" })).not.toBeInTheDocument();
  expect(api.sendGuideMessage).not.toHaveBeenCalled();
  expect(screen.queryByRole("button", { name: /继续|重试|放宽/ })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "关闭导购" })).toBeVisible();
});

it("renders a server-owned COMPARISON_READY snapshot instead of a placeholder", async () => {
  const onOpenProduct = vi.fn();
  api.createGuideSession.mockResolvedValueOnce(
    turnFor("COMPARISON_READY", {
      guide_revision: 3,
      comparison,
    }),
  );
  const user = userEvent.setup();
  render(
    <GuideSheet
      open
      onClose={vi.fn()}
      onOpenProduct={onOpenProduct}
    />,
  );

  const table = await screen.findByRole("table", { name: "商品对比" });
  expect(
    within(table)
      .getAllByRole("columnheader")
      .map((cell) => cell.textContent),
  ).toEqual([
    "对比维度",
    "Seoul Shade Daily Fluid",
    "Cloud Veil Mineral SPF",
  ]);
  expect(screen.queryByRole("article", { name: /商品建议/ })).not.toBeInTheDocument();
  await user.click(
    screen.getByRole("button", { name: "查看 Cloud Veil Mineral SPF" }),
  );
  expect(onOpenProduct).toHaveBeenCalledWith(
    "cloud-veil-mineral",
    "alternative",
  );
});

it("shows the last usable decision read-only in RECOVERY_REQUIRED and starts a safe new session", async () => {
  const user = await reachRecommendations();
  api.sendGuideMessage.mockResolvedValueOnce(
    turnFor("RECOVERY_REQUIRED", {
      guide_revision: 3,
      conversation_revision: 3,
      text: "当前会话需要恢复",
      recommendations: [],
      evidence: [],
    }),
  );
  await user.type(screen.getByLabelText("继续提问"), "继续核验");
  await user.click(screen.getByRole("button", { name: "发送消息" }));

  expect(await screen.findByRole("button", { name: "重新开始导购" })).toBeVisible();
  expect(screen.getByRole("heading", { name: "Seoul Shade Daily Fluid" })).toBeVisible();
  expect(screen.queryByRole("button", { name: "看商品" })).not.toBeInTheDocument();

  api.createGuideSession.mockResolvedValueOnce(
    turnFor("DECISION_READY", {
      session_id: "ses_guide_recovered",
      guide_revision: 1,
      text: "新会话已安全恢复",
    }),
  );
  await user.click(screen.getByRole("button", { name: "重新开始导购" }));
  expect(await screen.findByText("新会话已安全恢复")).toBeVisible();
  expect(api.createGuideSession).toHaveBeenLastCalledWith(
    "morning-routine-uv-001",
    "zh-CN",
  );
  expect(api.getGuideSession).not.toHaveBeenCalled();
});

it("enters a clear fatal state when recovery creates an invalid new Guide session", async () => {
  const user = await reachRecommendations();
  api.sendGuideMessage.mockResolvedValueOnce(
    turnFor("RECOVERY_REQUIRED", {
      guide_revision: 3,
      conversation_revision: 3,
      text: "当前会话需要恢复",
      recommendations: [],
      evidence: [],
    }),
  );
  await user.type(screen.getByLabelText("继续提问"), "继续核验");
  await user.click(screen.getByRole("button", { name: "发送消息" }));
  await screen.findByRole("button", { name: "重新开始导购" });
  api.createGuideSession.mockRejectedValueOnce(
    new ApiError(200, "INVALID_API_RESPONSE"),
  );

  await user.click(screen.getByRole("button", { name: "重新开始导购" }));

  expect(
    await screen.findByRole("heading", { name: "导购暂时不可用" }),
  ).toBeVisible();
  expect(screen.queryByRole("button", { name: "重新开始导购" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "关闭导购" })).toBeEnabled();
});

it("keeps recovery retry actionable after a temporary new-session failure", async () => {
  const user = await reachRecommendations();
  api.sendGuideMessage.mockResolvedValueOnce(
    turnFor("RECOVERY_REQUIRED", {
      guide_revision: 3,
      conversation_revision: 3,
      text: "当前会话需要恢复",
      recommendations: [],
      evidence: [],
    }),
  );
  await user.type(screen.getByLabelText("继续提问"), "继续核验");
  await user.click(screen.getByRole("button", { name: "发送消息" }));
  await screen.findByRole("button", { name: "重新开始导购" });
  api.createGuideSession
    .mockRejectedValueOnce(new ApiError(503, "TEMPORARY_UNAVAILABLE"))
    .mockResolvedValueOnce(
      turnFor("DECISION_READY", {
        session_id: "ses_guide_recovered_after_retry",
        guide_revision: 1,
        text: "第二次恢复已建立有效会话",
      }),
    );

  await user.click(screen.getByRole("button", { name: "重新开始导购" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "新会话暂时无法建立",
  );
  const retry = screen.getByRole("button", { name: "重新开始导购" });
  expect(retry).toBeEnabled();
  await user.click(retry);

  expect(await screen.findByText("第二次恢复已建立有效会话")).toBeVisible();
  expect(api.createGuideSession).toHaveBeenCalledTimes(3);
});

it("excludes links inside closed evidence details from the focus trap while keeping summaries", async () => {
  const insufficientContext = {
    ...context,
    claims: [context.claims[2]],
  };
  api.createGuideSession.mockResolvedValueOnce(
    turnFor("INSUFFICIENT_EVIDENCE", {
      context: insufficientContext,
      recommendations: [],
      evidence: [evidence[2]],
    }),
  );
  render(<GuideSheet open onClose={vi.fn()} />);
  await screen.findByText("INSUFFICIENT_EVIDENCE 的可见说明");

  const dialog = screen.getByRole("dialog", { name: "AI 导购（概念）" });
  const summaries = Array.from(dialog.querySelectorAll("details > summary"));
  expect(summaries).toHaveLength(1);
  const lastSummary = summaries[0] as HTMLElement;
  lastSummary.focus();
  expect(lastSummary).toHaveFocus();
  fireEvent.keyDown(dialog, { key: "Tab" });
  expect(screen.getByRole("button", { name: "关闭导购" })).toHaveFocus();
});

it("clears the active turn when message reconciliation proves the session is gone", async () => {
  const error = new ApiError(404, "SESSION_NOT_FOUND");
  const user = await reachRecommendations();
  api.sendGuideMessage.mockRejectedValueOnce(
    new ApiError(503, "UNKNOWN_POST_RESULT"),
  );
  api.sendGuideMessage.mockRejectedValueOnce(
    new ApiError(503, "UNKNOWN_POST_RESULT"),
  );
  api.getGuideSession.mockRejectedValueOnce(error);
  await user.type(screen.getByLabelText("继续提问"), "更新条件");
  await user.click(screen.getByRole("button", { name: "发送消息" }));

  expect(await screen.findByRole("heading", { name: "导购暂时不可用" })).toBeVisible();
  expect(screen.queryByRole("article", { name: "Seoul Shade Daily Fluid 商品建议" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "看商品" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "关闭导购" })).toBeEnabled();
});

it("keeps a verified turn frozen after an invalid message reconciliation GET and accepts the next valid GET", async () => {
  const user = await reachRecommendations();
  api.sendGuideMessage.mockRejectedValueOnce(
    new ApiError(503, "UNKNOWN_POST_RESULT"),
  );
  api.sendGuideMessage.mockRejectedValueOnce(
    new ApiError(503, "UNKNOWN_POST_RESULT"),
  );
  api.getGuideSession
    .mockRejectedValueOnce(new ApiError(200, "INVALID_API_RESPONSE"))
    .mockResolvedValueOnce(
      turnFor("DECISION_READY", {
        guide_revision: 3,
        conversation_revision: 3,
        text: "重新同步后已确认的最新结果",
      }),
    );
  await user.type(screen.getByLabelText("继续提问"), "更新条件");
  await user.click(screen.getByRole("button", { name: "发送消息" }));

  expect(
    await screen.findByRole("button", { name: "重新同步" }),
  ).toBeVisible();
  expect(screen.queryByRole("button", { name: "看商品" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "和另一款比比" })).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "重新同步" }));

  expect(await screen.findByText("重新同步后已确认的最新结果")).toBeVisible();
  expect(screen.getAllByRole("button", { name: "看商品" })[0]).toBeEnabled();
  expect(api.getGuideSession).toHaveBeenCalledTimes(2);
});

describe("dual revision monotonicity", () => {
  it.each([
    ["guide revision", { guide_revision: 0, conversation_revision: 2 }],
    ["conversation revision", { guide_revision: 2, conversation_revision: 0 }],
    ["non-advancing conversation revision", { guide_revision: 2, conversation_revision: 1 }],
  ] as const)(
    "keeps the opening frozen when a message POST returns a stale %s",
    async (_label, revisions) => {
      api.sendGuideMessage.mockResolvedValueOnce(
        turnFor("ANSWER_READY", {
          ...revisions,
          text: "这个过期 POST 响应不能成为回答。",
        }),
      );
      const user = userEvent.setup();
      render(<GuideSheet open onClose={vi.fn()} />);
      await screen.findByRole("button", { name: "会不会泛白？" });

      await user.click(screen.getByRole("button", { name: "会不会泛白？" }));

      expect(await screen.findByRole("button", { name: "重新同步" })).toBeVisible();
      const log = screen.getByRole("log", { name: "导购对话" });
      expect(within(log).getAllByRole("article", { name: "AI" })).toHaveLength(1);
      expect(within(log).getByRole("article", { name: "你" })).toHaveTextContent(
        "会不会泛白？",
      );
      expect(
        screen.queryByText("这个过期 POST 响应不能成为回答。"),
      ).not.toBeInTheDocument();
      expect(screen.getByLabelText("继续提问")).toBeDisabled();
    },
  );

  it.each([
    ["same conversation revision", { guide_revision: 2, conversation_revision: 1 }],
    ["lower conversation revision", { guide_revision: 2, conversation_revision: 0 }],
    ["lower guide revision", { guide_revision: 0, conversation_revision: 2 }],
  ] as const)(
    "rejects a message canonical GET with %s without inventing an assistant reply",
    async (_label, revisions) => {
      api.sendGuideMessage
        .mockRejectedValueOnce(new TypeError("network lost"))
        .mockRejectedValueOnce(new TypeError("network lost"));
      api.getGuideSession.mockResolvedValueOnce(
        turnFor("ANSWER_READY", {
          ...revisions,
          text: "这个过期 canonical GET 不能成为回答。",
        }),
      );
      const user = userEvent.setup();
      render(<GuideSheet open onClose={vi.fn()} />);
      await screen.findByRole("button", { name: "会不会泛白？" });

      await user.click(screen.getByRole("button", { name: "会不会泛白？" }));

      expect(await screen.findByRole("button", { name: "重新同步" })).toBeVisible();
      const log = screen.getByRole("log", { name: "导购对话" });
      expect(within(log).getAllByRole("article", { name: "AI" })).toHaveLength(1);
      expect(within(log).getByRole("article", { name: "你" })).toHaveTextContent(
        "会不会泛白？",
      );
      expect(
        screen.queryByText("这个过期 canonical GET 不能成为回答。"),
      ).not.toBeInTheDocument();
      expect(api.sendGuideMessage).toHaveBeenCalledTimes(2);
      expect(api.getGuideSession).toHaveBeenCalledWith("ses_guide_1");
    },
  );

  it.each([
    ["guide revision", { guide_revision: 1, conversation_revision: 3 }],
    ["conversation revision", { guide_revision: 3, conversation_revision: 1 }],
    ["non-advancing conversation revision", { guide_revision: 3, conversation_revision: 2 }],
  ] as const)(
    "keeps the recommendation frozen when comparison canonical GET lowers %s",
    async (_label, revisions) => {
      api.getGuideSession.mockResolvedValueOnce({
        ...comparisonReadyTurn,
        ...revisions,
        text: "这个过期比较快照不能覆盖推荐。",
        transcript: [
          {
            ...comparisonReadyTurn.transcript![0]!,
            text: "这个过期比较快照不能覆盖推荐。",
          },
        ],
      });
      const user = await reachRecommendations();

      await user.click(screen.getByRole("button", { name: "和另一款比比" }));

      expect(await screen.findByRole("button", { name: "重新同步" })).toBeVisible();
      expect(screen.getByText(recommendationTurn.text)).toBeVisible();
      expect(screen.queryByRole("table", { name: "商品对比" })).not.toBeInTheDocument();
      expect(
        screen.queryByText("这个过期比较快照不能覆盖推荐。"),
      ).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "和另一款比比" })).toBeDisabled();
    },
  );
});

describe("sheet lifecycle and snapshot continuity", () => {
  function OpenHarness({
    initialScrollTop = 0,
    onScrollTopChange = vi.fn(),
  }: {
    initialScrollTop?: number;
    onScrollTopChange?: (scrollTop: number) => void;
  }) {
    const [open, setOpen] = useState(false);
    return (
      <>
        <button type="button" onClick={() => setOpen(true)}>
          问 AI
        </button>
        <GuideSheet
          open={open}
          onClose={() => setOpen(false)}
          initialScrollTop={initialScrollTop}
          onScrollTopChange={onScrollTopChange}
        />
      </>
    );
  }

  it("keeps an authoritative comparison as the read-only last usable result during recovery", async () => {
    api.createGuideSession.mockResolvedValueOnce(comparisonReadyTurn);
    api.getGuideSession.mockResolvedValueOnce(
      turnFor("RECOVERY_REQUIRED", {
        guide_revision: 4,
        conversation_revision: 3,
        text: "比较后的会话需要恢复",
        recommendations: [],
        evidence: [],
      }),
    );
    const user = userEvent.setup();
    render(<OpenHarness />);

    await user.click(screen.getByRole("button", { name: "问 AI" }));
    expect(await screen.findByRole("table", { name: "商品对比" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "关闭导购" }));
    await user.click(screen.getByRole("button", { name: "问 AI" }));

    expect(
      await screen.findByRole("button", { name: "重新开始导购" }),
    ).toBeVisible();
    expect(screen.getByRole("table", { name: "商品对比" })).toBeVisible();
    expect(
      screen.queryByRole("button", { name: /^查看 / }),
    ).not.toBeInTheDocument();
  });

  it("locks body scroll, traps focus, closes with Escape, and returns focus", async () => {
    const user = userEvent.setup();
    render(<OpenHarness />);
    const trigger = screen.getByRole("button", { name: "问 AI" });

    await user.click(trigger);
    const close = screen.getByRole("button", { name: "关闭导购" });
    expect(close).toHaveFocus();
    expect(document.body.style.overflow).toBe("hidden");
    await screen.findByRole("button", { name: "适合油皮吗？" });

    await user.tab({ shift: true });
    expect(document.activeElement).not.toBe(trigger);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "AI 导购（概念）" })).not.toBeInTheDocument();
    expect(document.body.style.overflow).toBe("");
    expect(trigger).toHaveFocus();
  });

  it("reuses the server snapshot and restores scroll within two pixels after close/reopen", async () => {
    const user = userEvent.setup();
    const onScrollTopChange = vi.fn();
    const { rerender } = render(
      <OpenHarness onScrollTopChange={onScrollTopChange} />,
    );
    await user.click(screen.getByRole("button", { name: "问 AI" }));
    await screen.findByRole("button", { name: "会不会泛白？" });
    await user.click(screen.getByRole("button", { name: "会不会泛白？" }));
    await screen.findByRole("article", { name: "Seoul Shade Daily Fluid 商品建议" });

    const scroller = screen.getByRole("log", { name: "导购对话" });
    Object.defineProperty(scroller, "scrollTop", {
      configurable: true,
      writable: true,
      value: 218.5,
    });
    fireEvent.scroll(scroller);
    expect(onScrollTopChange).toHaveBeenLastCalledWith(218.5);
    await user.click(screen.getByRole("button", { name: "关闭导购" }));

    api.getGuideSession.mockResolvedValueOnce(recommendationTurn);
    rerender(
      <OpenHarness initialScrollTop={218.5} onScrollTopChange={onScrollTopChange} />,
    );
    await user.click(screen.getByRole("button", { name: "问 AI" }));
    await screen.findByRole("article", { name: "Seoul Shade Daily Fluid 商品建议" });

    expect(api.createGuideSession).toHaveBeenCalledTimes(1);
    expect(api.getGuideSession).toHaveBeenCalledWith("ses_guide_1");
    await waitFor(() => {
      expect(
        Math.abs(
          screen.getByRole("log", { name: "导购对话" }).scrollTop -
            218.5,
        ),
      ).toBeLessThanOrEqual(2);
    });
  });

  it.each([
    ["guide revision", { guide_revision: 1, conversation_revision: 2 }],
    ["conversation revision", { guide_revision: 2, conversation_revision: 1 }],
  ] as const)(
    "keeps the last verified turn frozen when an ordinary reopen GET lowers %s",
    async (_label, revisions) => {
      const user = userEvent.setup();
      render(<OpenHarness />);
      await user.click(screen.getByRole("button", { name: "问 AI" }));
      await screen.findByRole("button", { name: "会不会泛白？" });
      await user.click(screen.getByRole("button", { name: "会不会泛白？" }));
      await screen.findByRole("article", {
        name: "Seoul Shade Daily Fluid 商品建议",
      });
      await user.click(screen.getByRole("button", { name: "关闭导购" }));
      api.getGuideSession.mockResolvedValueOnce(
        turnFor("DECISION_READY", {
          ...revisions,
          text: "这个过期 reopen 快照不能覆盖当前结果。",
        }),
      );

      await user.click(screen.getByRole("button", { name: "问 AI" }));

      expect(await screen.findByRole("button", { name: "重新同步" })).toBeVisible();
      expect(screen.getByText(recommendationTurn.text)).toBeVisible();
      expect(
        screen.queryByText("这个过期 reopen 快照不能覆盖当前结果。"),
      ).not.toBeInTheDocument();
      expect(screen.getAllByRole("button", { name: "看商品" })[0]).toBeDisabled();
    },
  );

  it("accepts a same-revision reopen replay without freezing the Guide", async () => {
    const user = userEvent.setup();
    render(<OpenHarness />);
    await user.click(screen.getByRole("button", { name: "问 AI" }));
    await screen.findByRole("button", { name: "会不会泛白？" });
    await user.click(screen.getByRole("button", { name: "会不会泛白？" }));
    await screen.findByRole("article", {
      name: "Seoul Shade Daily Fluid 商品建议",
    });
    await user.click(screen.getByRole("button", { name: "关闭导购" }));
    api.getGuideSession.mockResolvedValueOnce(recommendationTurn);

    await user.click(screen.getByRole("button", { name: "问 AI" }));

    expect(
      await screen.findByRole("article", {
        name: "Seoul Shade Daily Fluid 商品建议",
      }),
    ).toBeVisible();
    expect(screen.queryByRole("button", { name: "重新同步" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "看商品" })[0]).toBeEnabled();
    expect(api.getGuideSession).toHaveBeenCalledWith("ses_guide_1");
  });

  it("restores alternatives, transcript, session, mode, and scroll after close/reopen", async () => {
    function AlternativesHarness() {
      const [open, setOpen] = useState(false);
      const [scrollTop, setScrollTop] = useState(0);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            问 AI
          </button>
          <GuideSheet
            open={open}
            onClose={() => setOpen(false)}
            initialScrollTop={scrollTop}
            onScrollTopChange={setScrollTop}
          />
        </>
      );
    }

    const user = userEvent.setup();
    render(<AlternativesHarness />);
    await user.click(screen.getByRole("button", { name: "问 AI" }));
    await screen.findByRole("button", { name: "会不会泛白？" });
    await user.click(screen.getByRole("button", { name: "会不会泛白？" }));
    await screen.findByRole("article", {
      name: "Seoul Shade Daily Fluid 商品建议",
    });
    await user.click(screen.getByRole("button", { name: "看看其他选择" }));
    const log = screen.getByRole("log", { name: "导购对话" });
    Object.defineProperty(log, "scrollTop", {
      configurable: true,
      writable: true,
      value: 211,
    });
    fireEvent.scroll(log);
    await user.click(screen.getByRole("button", { name: "关闭导购" }));
    api.getGuideSession.mockResolvedValueOnce(recommendationTurn);

    await user.click(screen.getByRole("button", { name: "问 AI" }));

    const dialog = screen.getByRole("dialog", { name: "AI 导购（概念）" });
    expect(await screen.findByRole("region", { name: "其他选择" })).toBeVisible();
    expect(dialog).toHaveAttribute("data-mode", "expanded");
    expect(screen.getByText(recommendationTurn.text)).toBeVisible();
    expect(sessionStorage.getItem("ai-shopping-guide-session:morning-routine-uv-001")).toBe(
      "ses_guide_1",
    );
    expect(api.createGuideSession).toHaveBeenCalledTimes(1);
    expect(api.getGuideSession).toHaveBeenCalledWith("ses_guide_1");
    await waitFor(() =>
      expect(screen.getByRole("log", { name: "导购对话" }).scrollTop).toBe(211),
    );
  });

  it("restores alternatives, transcript, session, mode, and scroll after an alternative PDP return", async () => {
    function AlternativesPdpHarness() {
      const [open, setOpen] = useState(true);
      const [pdp, setPdp] = useState<string | null>(null);
      const [scrollTop, setScrollTop] = useState(0);
      return (
        <>
          {pdp ? (
            <button
              type="button"
              onClick={() => {
                setPdp(null);
                setOpen(true);
              }}
            >
              从 {pdp} 返回 AI
            </button>
          ) : null}
          <GuideSheet
            open={open}
            onClose={() => setOpen(false)}
            initialScrollTop={scrollTop}
            onScrollTopChange={setScrollTop}
            onOpenProduct={(productId, role) => {
              setPdp(`${productId}:${role}`);
              setOpen(false);
            }}
          />
        </>
      );
    }

    const user = userEvent.setup();
    render(<AlternativesPdpHarness />);
    await screen.findByRole("button", { name: "会不会泛白？" });
    await user.click(screen.getByRole("button", { name: "会不会泛白？" }));
    await screen.findByRole("article", {
      name: "Seoul Shade Daily Fluid 商品建议",
    });
    await user.click(screen.getByRole("button", { name: "看看其他选择" }));
    const log = screen.getByRole("log", { name: "导购对话" });
    Object.defineProperty(log, "scrollTop", {
      configurable: true,
      writable: true,
      value: 173,
    });
    fireEvent.scroll(log);
    const alternative = screen
      .getByRole("heading", { name: "Cloud Veil Mineral SPF" })
      .closest("article");
    await user.click(within(alternative!).getByRole("button", { name: "看商品" }));
    api.getGuideSession.mockResolvedValueOnce(recommendationTurn);

    await user.click(
      screen.getByRole("button", {
        name: "从 cloud-veil-mineral:alternative 返回 AI",
      }),
    );

    const dialog = screen.getByRole("dialog", { name: "AI 导购（概念）" });
    expect(await screen.findByRole("region", { name: "其他选择" })).toBeVisible();
    expect(dialog).toHaveAttribute("data-mode", "expanded");
    expect(screen.getByText(recommendationTurn.text)).toBeVisible();
    expect(sessionStorage.getItem("ai-shopping-guide-session:morning-routine-uv-001")).toBe(
      "ses_guide_1",
    );
    expect(api.createGuideSession).toHaveBeenCalledTimes(1);
    expect(api.getGuideSession).toHaveBeenCalledWith("ses_guide_1");
    await waitFor(() =>
      expect(screen.getByRole("log", { name: "导购对话" }).scrollTop).toBe(173),
    );
  });

  it("keeps a visible prior snapshot frozen while a reopen refresh is pending", async () => {
    const user = userEvent.setup();
    const refresh = deferred<GuideTurn>();
    render(<OpenHarness />);
    await user.click(screen.getByRole("button", { name: "问 AI" }));
    await screen.findByRole("button", { name: "会不会泛白？" });
    await user.click(screen.getByRole("button", { name: "会不会泛白？" }));
    await screen.findByRole("article", { name: "Seoul Shade Daily Fluid 商品建议" });
    await user.click(screen.getByRole("button", { name: "关闭导购" }));

    api.getGuideSession.mockReturnValueOnce(refresh.promise);
    await user.click(screen.getByRole("button", { name: "问 AI" }));
    expect(screen.getByRole("article", { name: "Seoul Shade Daily Fluid 商品建议" })).toBeVisible();
    expect(screen.getByRole("dialog", { name: "AI 导购（概念）" })).toHaveAttribute(
      "aria-busy",
      "true",
    );
    const compare = screen.getByRole("button", { name: "和另一款比比" });
    const openProduct = screen.getAllByRole("button", { name: "看商品" })[0];
    expect(compare).toBeDisabled();
    expect(openProduct).toBeDisabled();
    compare.removeAttribute("disabled");
    fireEvent.click(compare);
    expect(api.compareProducts).not.toHaveBeenCalled();

    await act(async () => refresh.resolve(recommendationTurn));
    await waitFor(() => expect(openProduct).toBeEnabled());
  });

  it("preserves an in-flight comparison expectation across close/reopen and reconciles with GET only", async () => {
    const pendingComparison = deferred<CompareResponse>();
    api.compareProducts.mockReturnValueOnce(pendingComparison.promise);
    api.getGuideSession
      .mockResolvedValueOnce(recommendationTurn)
      .mockResolvedValueOnce(comparisonReadyTurn);
    const user = userEvent.setup();
    render(<OpenHarness />);

    await user.click(screen.getByRole("button", { name: "问 AI" }));
    await screen.findByRole("button", { name: "会不会泛白？" });
    await user.click(
      screen.getByRole("button", { name: "会不会泛白？" }),
    );
    await screen.findByRole("article", { name: "Seoul Shade Daily Fluid 商品建议" });
    await selectFirstTwoCandidates();
    await user.click(screen.getByRole("button", { name: "和另一款比比" }));
    expect(api.compareProducts).toHaveBeenCalledOnce();

    await user.click(screen.getByRole("button", { name: "关闭导购" }));
    await user.click(screen.getByRole("button", { name: "问 AI" }));
    await waitFor(() => expect(api.getGuideSession).toHaveBeenCalledTimes(1));

    expect(
      await screen.findByRole("button", { name: "重新同步" }),
    ).toBeVisible();
    expect(screen.getByRole("article", { name: "Seoul Shade Daily Fluid 商品建议" })).toBeVisible();
    expect(
      screen.getByRole("button", { name: "和另一款比比" }),
    ).toBeDisabled();

    await act(async () => pendingComparison.resolve(comparison));
    expect(api.getGuideSession).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole("button", { name: "重新同步" }));

    expect(await screen.findByRole("table", { name: "商品对比" })).toBeVisible();
    expect(api.compareProducts).toHaveBeenCalledOnce();
    expect(api.getGuideSession).toHaveBeenCalledTimes(2);
  });

  it("clears a closed comparison expectation when input validation rejects before execution", async () => {
    const pendingComparison = deferred<CompareResponse>();
    api.compareProducts.mockReturnValueOnce(pendingComparison.promise);
    api.getGuideSession.mockResolvedValueOnce(recommendationTurn);
    const user = userEvent.setup();
    render(<OpenHarness />);

    await user.click(screen.getByRole("button", { name: "问 AI" }));
    await screen.findByRole("button", { name: "会不会泛白？" });
    await user.click(
      screen.getByRole("button", { name: "会不会泛白？" }),
    );
    await screen.findByRole("article", { name: "Seoul Shade Daily Fluid 商品建议" });
    await selectFirstTwoCandidates();
    await user.click(screen.getByRole("button", { name: "和另一款比比" }));
    await user.click(screen.getByRole("button", { name: "关闭导购" }));

    await act(async () =>
      pendingComparison.reject(new ApiError(422, "VALIDATION_ERROR")),
    );
    await user.click(screen.getByRole("button", { name: "问 AI" }));

    await screen.findByRole("article", { name: "Seoul Shade Daily Fluid 商品建议" });
    expect(
      screen.queryByRole("button", { name: "重新同步" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "和另一款比比" }),
    ).toBeEnabled();
    expect(api.compareProducts).toHaveBeenCalledOnce();
    expect(api.getGuideSession).toHaveBeenCalledOnce();
  });

  it("preserves a closed state-conflict expectation and adopts the authoritative turn on reopen", async () => {
    const pendingComparison = deferred<CompareResponse>();
    api.compareProducts.mockReturnValueOnce(pendingComparison.promise);
    api.getGuideSession.mockResolvedValueOnce(
      turnFor("DECISION_READY", {
        guide_revision: 3,
        conversation_revision: 2,
        text: "重开后已采用冲突对应的最新服务端决策。",
        recommendations: [recommendations[2], recommendations[3]],
      }),
    );
    const user = userEvent.setup();
    render(<OpenHarness />);

    await user.click(screen.getByRole("button", { name: "问 AI" }));
    await screen.findByRole("button", { name: "会不会泛白？" });
    await user.click(
      screen.getByRole("button", { name: "会不会泛白？" }),
    );
    await screen.findByRole("article", { name: "Seoul Shade Daily Fluid 商品建议" });
    await selectFirstTwoCandidates();
    await user.click(screen.getByRole("button", { name: "和另一款比比" }));
    await user.click(screen.getByRole("button", { name: "关闭导购" }));

    await act(async () =>
      pendingComparison.reject(new ApiError(409, "ACTION_NOT_ALLOWED")),
    );
    await user.click(screen.getByRole("button", { name: "问 AI" }));

    expect(
      await screen.findByText("重开后已采用冲突对应的最新服务端决策。"),
    ).toBeVisible();
    expect(
      screen.getByRole("article", { name: "Jeju Sport Sun Gel 商品建议" }),
    ).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "和另一款比比" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "重新同步" }),
    ).not.toBeInTheDocument();
    expect(api.compareProducts).toHaveBeenCalledOnce();
    expect(api.getGuideSession).toHaveBeenCalledOnce();
  });

  it("preserves a failed comparison GET retry across close/reopen and rejects a stale decision snapshot", async () => {
    api.getGuideSession
      .mockRejectedValueOnce(new ApiError(503, "TEMPORARY_UNAVAILABLE"))
      .mockRejectedValueOnce(new ApiError(503, "TEMPORARY_UNAVAILABLE"))
      .mockResolvedValueOnce(recommendationTurn)
      .mockResolvedValueOnce(comparisonReadyTurn);
    const user = userEvent.setup();
    render(<OpenHarness />);

    await user.click(screen.getByRole("button", { name: "问 AI" }));
    await screen.findByRole("button", { name: "会不会泛白？" });
    await user.click(
      screen.getByRole("button", { name: "会不会泛白？" }),
    );
    await screen.findByRole("article", { name: "Seoul Shade Daily Fluid 商品建议" });
    await selectFirstTwoCandidates();
    await user.click(screen.getByRole("button", { name: "和另一款比比" }));
    await screen.findByRole("button", { name: "重新同步" });

    await user.click(screen.getByRole("button", { name: "重新同步" }));
    await waitFor(() => expect(api.getGuideSession).toHaveBeenCalledTimes(2));
    await screen.findByRole("button", { name: "重新同步" });
    await user.click(screen.getByRole("button", { name: "关闭导购" }));
    await user.click(screen.getByRole("button", { name: "问 AI" }));
    await waitFor(() => expect(api.getGuideSession).toHaveBeenCalledTimes(3));

    expect(
      await screen.findByRole("button", { name: "重新同步" }),
    ).toBeVisible();
    expect(screen.getByRole("article", { name: "Seoul Shade Daily Fluid 商品建议" })).toBeVisible();
    expect(
      screen.getAllByRole("button", { name: "看商品" })[0],
    ).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "重新同步" }));

    expect(await screen.findByRole("table", { name: "商品对比" })).toBeVisible();
    expect(api.compareProducts).toHaveBeenCalledOnce();
    expect(api.getGuideSession).toHaveBeenCalledTimes(4);
  });

  it(
    "clears a stale comparison locator and creates a new session on reopen",
    async () => {
      const error = new ApiError(404, "SESSION_NOT_FOUND");
      api.createGuideSession
        .mockResolvedValueOnce(clarificationTurn)
        .mockResolvedValueOnce({
          ...clarificationTurn,
          session_id: "ses_after_stale_locator",
        });
      api.getGuideSession
        .mockRejectedValueOnce(new ApiError(503, "TEMPORARY_UNAVAILABLE"))
        .mockRejectedValueOnce(error);
      const user = userEvent.setup();
      render(<OpenHarness />);

      await user.click(screen.getByRole("button", { name: "问 AI" }));
      await screen.findByRole("button", { name: "会不会泛白？" });
      await user.click(
        screen.getByRole("button", { name: "会不会泛白？" }),
      );
      await screen.findByRole("article", { name: "Seoul Shade Daily Fluid 商品建议" });
      await selectFirstTwoCandidates();
      await user.click(screen.getByRole("button", { name: "和另一款比比" }));
      await screen.findByRole("button", { name: "重新同步" });
      await user.click(screen.getByRole("button", { name: "关闭导购" }));
      await user.click(screen.getByRole("button", { name: "问 AI" }));

      expect(
        await screen.findByRole("button", { name: "适合油皮吗？" }),
      ).toBeVisible();
      expect(screen.queryByRole("article", { name: "Seoul Shade Daily Fluid 商品建议" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "重新同步" })).not.toBeInTheDocument();
      expect(api.compareProducts).toHaveBeenCalledOnce();
      expect(api.createGuideSession).toHaveBeenCalledTimes(2);
      expect(
        sessionStorage.getItem(
          "ai-shopping-guide-session:morning-routine-uv-001",
        ),
      ).toBe("ses_after_stale_locator");
    },
  );

  it("keeps a comparison expectation frozen when reopen GET is invalid, then accepts a valid retry", async () => {
    api.getGuideSession
      .mockRejectedValueOnce(new ApiError(503, "TEMPORARY_UNAVAILABLE"))
      .mockRejectedValueOnce(new ApiError(200, "INVALID_API_RESPONSE"))
      .mockResolvedValueOnce(comparisonReadyTurn);
    const user = userEvent.setup();
    render(<OpenHarness />);

    await user.click(screen.getByRole("button", { name: "问 AI" }));
    await screen.findByRole("button", { name: "会不会泛白？" });
    await user.click(
      screen.getByRole("button", { name: "会不会泛白？" }),
    );
    await screen.findByRole("article", { name: "Seoul Shade Daily Fluid 商品建议" });
    await selectFirstTwoCandidates();
    await user.click(screen.getByRole("button", { name: "和另一款比比" }));
    await screen.findByRole("button", { name: "重新同步" });
    await user.click(screen.getByRole("button", { name: "关闭导购" }));
    await user.click(screen.getByRole("button", { name: "问 AI" }));

    expect(
      await screen.findByRole("button", { name: "重新同步" }),
    ).toBeVisible();
    expect(screen.getByRole("article", { name: "Seoul Shade Daily Fluid 商品建议" })).toBeVisible();
    expect(screen.getAllByRole("button", { name: "看商品" })[0]).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "重新同步" }));

    expect(await screen.findByRole("table", { name: "商品对比" })).toBeVisible();
    expect(api.compareProducts).toHaveBeenCalledOnce();
    expect(api.getGuideSession).toHaveBeenCalledTimes(3);
  });

  it("ignores an old message response after close/reopen", async () => {
    const user = userEvent.setup();
    const stale = deferred<GuideTurn>();
    api.sendGuideMessage.mockReturnValueOnce(stale.promise);
    api.getGuideSession.mockResolvedValueOnce(recommendationTurn);
    render(<OpenHarness />);
    await user.click(screen.getByRole("button", { name: "问 AI" }));
    await screen.findByLabelText("继续提问");
    await user.type(screen.getByLabelText("继续提问"), "日常通勤");
    await user.click(screen.getByRole("button", { name: "发送消息" }));
    await user.click(screen.getByRole("button", { name: "关闭导购" }));
    await user.click(screen.getByRole("button", { name: "问 AI" }));
    await screen.findByRole("article", { name: "Seoul Shade Daily Fluid 商品建议" });

    await act(async () =>
      stale.resolve(
        turnFor("NO_MATCH", { text: "旧响应不能覆盖当前快照" }),
      ),
    );
    expect(screen.queryByText("旧响应不能覆盖当前快照")).not.toBeInTheDocument();
    expect(screen.getByRole("article", { name: "Seoul Shade Daily Fluid 商品建议" })).toBeVisible();
  });

  it("invalidates the old session and response when contentContextId changes while open", async () => {
    const oldSession = deferred<GuideTurn>();
    const newSession = deferred<GuideTurn>();
    api.createGuideSession
      .mockReturnValueOnce(oldSession.promise)
      .mockReturnValueOnce(newSession.promise);
    const contextB = {
      ...context,
      id: "night-routine-uv-002",
      anchor_product_id: "cloud-veil-mineral",
      anchor_product_name: "Cloud Veil Mineral SPF",
      caption: "A mineral sunscreen for the next video",
    };
    const { rerender } = render(
      <GuideSheet
        open
        onClose={vi.fn()}
        contentContextId="morning-routine-uv-001"
      />,
    );
    await waitFor(() =>
      expect(api.createGuideSession).toHaveBeenCalledWith(
        "morning-routine-uv-001",
        "zh-CN",
      ),
    );

    rerender(
      <GuideSheet
        open
        onClose={vi.fn()}
        contentContextId="night-routine-uv-002"
      />,
    );
    await waitFor(() =>
      expect(api.createGuideSession).toHaveBeenCalledWith(
        "night-routine-uv-002",
        "zh-CN",
      ),
    );
    await act(async () =>
      newSession.resolve(
        turnFor("WAITING_CLARIFICATION", {
          session_id: "ses_context_b",
          context: contextB,
          text: "这是新视频的导购会话",
        }),
      ),
    );
    expect(await screen.findByText("Cloud Veil Mineral SPF")).toBeVisible();

    await act(async () =>
      oldSession.resolve(
        turnFor("NO_MATCH", {
          text: "旧视频响应不得复活",
        }),
      ),
    );
    expect(screen.queryByText("旧视频响应不得复活")).not.toBeInTheDocument();
    expect(screen.getByText("Cloud Veil Mineral SPF")).toBeVisible();
  });

  it("clears a FATAL_ERROR session so reopening creates a fresh session", async () => {
    const user = userEvent.setup();
    api.createGuideSession
      .mockResolvedValueOnce(
        turnFor("FATAL_ERROR", {
          text: "当前会话不可恢复",
        }),
      )
      .mockResolvedValueOnce(
        turnFor("DECISION_READY", {
          session_id: "ses_after_fatal",
          text: "新会话已建立",
        }),
      );
    render(<OpenHarness />);
    await user.click(screen.getByRole("button", { name: "问 AI" }));
    expect(
      await screen.findByRole("heading", { name: "导购暂时不可用" }),
    ).toBeVisible();
    expect(api.createGuideSession).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole("button", { name: "关闭导购" }));
    await user.click(screen.getByRole("button", { name: "问 AI" }));

    expect(await screen.findByText("新会话已建立")).toBeVisible();
    expect(api.createGuideSession).toHaveBeenCalledTimes(2);
    expect(api.getGuideSession).not.toHaveBeenCalled();
  });

  it("returns from an AI-origin PDP without creating another Guide session", async () => {
    const user = userEvent.setup();

    function PdpHarness() {
      const [open, setOpen] = useState(true);
      const [pdp, setPdp] = useState<string | null>(null);
      return (
        <>
          {pdp ? (
            <button
              type="button"
              onClick={() => {
                setPdp(null);
                setOpen(true);
              }}
            >
              从 {pdp} 返回 AI
            </button>
          ) : null}
          <GuideSheet
            open={open}
            onClose={() => setOpen(false)}
            onOpenProduct={(productId, role) => {
              setPdp(`${productId}:${role}`);
              setOpen(false);
            }}
          />
        </>
      );
    }

    render(<PdpHarness />);
    await screen.findByRole("button", { name: "会不会泛白？" });
    await user.click(screen.getByRole("button", { name: "会不会泛白？" }));
    await screen.findByRole("article", { name: "Seoul Shade Daily Fluid 商品建议" });
    const currentCard = screen
      .getByRole("heading", { name: "Seoul Shade Daily Fluid" })
      .closest("article");
    await user.click(within(currentCard!).getByRole("button", { name: "看商品" }));
    api.getGuideSession.mockResolvedValueOnce(recommendationTurn);
    await user.click(
      screen.getByRole("button", {
        name: "从 seoul-shade-daily-fluid:current 返回 AI",
      }),
    );

    expect(await screen.findByRole("article", { name: "Seoul Shade Daily Fluid 商品建议" })).toBeVisible();
    expect(api.createGuideSession).toHaveBeenCalledTimes(1);
    expect(api.getGuideSession).toHaveBeenCalledWith("ses_guide_1");
  });
});

describe("authoritative session locator and request recovery", () => {
  const locatorKey =
    "ai-shopping-guide-session:morning-routine-uv-001";

  it("stores only the opaque server session ID under the content locator", async () => {
    render(<GuideSheet open onClose={vi.fn()} />);

    await screen.findByRole("button", { name: "适合油皮吗？" });

    expect(Object.keys(sessionStorage)).toEqual([locatorKey]);
    expect(sessionStorage.getItem(locatorKey)).toBe("ses_guide_1");
  });

  it("restores a locator-backed transcript after a component reload without creating", async () => {
    const first = render(<GuideSheet open onClose={vi.fn()} />);
    await screen.findByRole("button", { name: "适合油皮吗？" });
    first.unmount();

    api.getGuideSession.mockResolvedValueOnce(
      turnFor("DECISION_READY", {
        conversation_revision: 2,
        text: "已从服务端恢复完整会话",
      }),
    );
    render(<GuideSheet open onClose={vi.fn()} />);

    expect(await screen.findByText("已从服务端恢复完整会话")).toBeVisible();
    expect(api.createGuideSession).toHaveBeenCalledTimes(1);
    expect(api.getGuideSession).toHaveBeenCalledWith("ses_guide_1");
  });

  it("clears a stale locator before creating after a locator GET returns 404", async () => {
    sessionStorage.setItem(locatorKey, "ses_stale");
    api.getGuideSession.mockRejectedValueOnce(
      new ApiError(404, "SESSION_NOT_FOUND"),
    );
    api.createGuideSession.mockImplementationOnce(async () => {
      expect(sessionStorage.getItem(locatorKey)).toBeNull();
      return {
        ...clarificationTurn,
        session_id: "ses_recreated",
      };
    });

    render(<GuideSheet open onClose={vi.fn()} />);

    await screen.findByRole("button", { name: "适合油皮吗？" });
    expect(api.getGuideSession).toHaveBeenCalledWith("ses_stale");
    expect(api.createGuideSession).toHaveBeenCalledOnce();
    expect(sessionStorage.getItem(locatorKey)).toBe("ses_recreated");
  });

  it("isolates locators when the content context changes", async () => {
    const contextB = {
      ...context,
      id: "night-routine-uv-002",
      anchor_product_id: "cloud-veil-mineral",
      anchor_product_name: "Cloud Veil Mineral SPF",
      caption: "A mineral sunscreen for the next video",
    };
    api.createGuideSession
      .mockResolvedValueOnce(clarificationTurn)
      .mockResolvedValueOnce(
        turnFor("WAITING_CLARIFICATION", {
          session_id: "ses_context_b",
          context: contextB,
        }),
      );
    const { rerender } = render(
      <GuideSheet
        open
        onClose={vi.fn()}
        contentContextId="morning-routine-uv-001"
      />,
    );
    await screen.findByRole("button", { name: "适合油皮吗？" });
    expect(sessionStorage.getItem(locatorKey)).toBe("ses_guide_1");

    rerender(
      <GuideSheet
        open
        onClose={vi.fn()}
        contentContextId="night-routine-uv-002"
      />,
    );

    await screen.findByText("Cloud Veil Mineral SPF");
    expect(sessionStorage.getItem(locatorKey)).toBeNull();
    expect(
      sessionStorage.getItem(
        "ai-shopping-guide-session:night-routine-uv-002",
      ),
    ).toBe("ses_context_b");
  });

  it("ignores a late locator 404 after close without clearing or creating", async () => {
    const pendingRestore = deferred<GuideTurn>();
    const onVerifiedTurnChange = vi.fn();
    sessionStorage.setItem(locatorKey, "ses_stale");
    api.getGuideSession.mockReturnValueOnce(pendingRestore.promise);
    const { rerender } = render(
      <GuideSheet
        open
        onClose={vi.fn()}
        onVerifiedTurnChange={onVerifiedTurnChange}
      />,
    );
    await waitFor(() =>
      expect(api.getGuideSession).toHaveBeenCalledWith("ses_stale"),
    );

    rerender(
      <GuideSheet
        open={false}
        onClose={vi.fn()}
        onVerifiedTurnChange={onVerifiedTurnChange}
      />,
    );
    await act(async () =>
      pendingRestore.reject(new ApiError(404, "SESSION_NOT_FOUND")),
    );

    expect(sessionStorage.getItem(locatorKey)).toBe("ses_stale");
    expect(api.createGuideSession).not.toHaveBeenCalled();
    expect(onVerifiedTurnChange).not.toHaveBeenCalled();
  });

  it("ignores a late locator 404 after unmount without clearing or creating", async () => {
    const pendingRestore = deferred<GuideTurn>();
    sessionStorage.setItem(locatorKey, "ses_stale");
    api.getGuideSession.mockReturnValueOnce(pendingRestore.promise);
    const view = render(<GuideSheet open onClose={vi.fn()} />);
    await waitFor(() =>
      expect(api.getGuideSession).toHaveBeenCalledWith("ses_stale"),
    );

    view.unmount();
    await act(async () =>
      pendingRestore.reject(new ApiError(404, "SESSION_NOT_FOUND")),
    );

    expect(sessionStorage.getItem(locatorKey)).toBe("ses_stale");
    expect(api.createGuideSession).not.toHaveBeenCalled();
  });

  it("ignores an old-context locator 404 after switching context", async () => {
    const pendingRestore = deferred<GuideTurn>();
    const contextB = {
      ...context,
      id: "night-routine-uv-002",
      anchor_product_id: "cloud-veil-mineral",
      anchor_product_name: "Cloud Veil Mineral SPF",
      caption: "A mineral sunscreen for the next video",
    };
    sessionStorage.setItem(locatorKey, "ses_stale");
    api.getGuideSession.mockReturnValueOnce(pendingRestore.promise);
    api.createGuideSession.mockResolvedValueOnce(
      turnFor("WAITING_CLARIFICATION", {
        session_id: "ses_context_b",
        context: contextB,
      }),
    );
    const { rerender } = render(
      <GuideSheet
        open
        onClose={vi.fn()}
        contentContextId="morning-routine-uv-001"
      />,
    );
    await waitFor(() =>
      expect(api.getGuideSession).toHaveBeenCalledWith("ses_stale"),
    );

    rerender(
      <GuideSheet
        open
        onClose={vi.fn()}
        contentContextId="night-routine-uv-002"
      />,
    );
    await screen.findByText("Cloud Veil Mineral SPF");
    await act(async () =>
      pendingRestore.reject(new ApiError(404, "SESSION_NOT_FOUND")),
    );

    expect(api.createGuideSession).toHaveBeenCalledOnce();
    expect(api.createGuideSession).toHaveBeenCalledWith(
      "night-routine-uv-002",
      "zh-CN",
    );
    expect(
      sessionStorage.getItem(
        "ai-shopping-guide-session:night-routine-uv-002",
      ),
    ).toBe("ses_context_b");
  });

  it("retains a locator after a temporary restore failure and retries GET", async () => {
    sessionStorage.setItem(locatorKey, "ses_restore_retry");
    api.getGuideSession
      .mockRejectedValueOnce(new ApiError(503, "TEMPORARY_UNAVAILABLE"))
      .mockResolvedValueOnce(
        turnFor("DECISION_READY", {
          session_id: "ses_restore_retry",
          text: "同一 locator 已恢复",
        }),
      );
    const user = userEvent.setup();
    render(<GuideSheet open onClose={vi.fn()} />);

    expect(
      await screen.findByRole("button", { name: "重新同步" }),
    ).toBeVisible();
    expect(sessionStorage.getItem(locatorKey)).toBe("ses_restore_retry");
    expect(api.createGuideSession).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "重新同步" }));

    expect(await screen.findByText("同一 locator 已恢复")).toBeVisible();
    expect(api.getGuideSession).toHaveBeenCalledTimes(2);
    expect(sessionStorage.getItem(locatorKey)).toBe("ses_restore_retry");
  });

  it("clears a locator and creates only after retry GET confirms 404", async () => {
    sessionStorage.setItem(locatorKey, "ses_restore_then_missing");
    api.getGuideSession
      .mockRejectedValueOnce(new ApiError(503, "TEMPORARY_UNAVAILABLE"))
      .mockRejectedValueOnce(new ApiError(404, "SESSION_NOT_FOUND"));
    api.createGuideSession.mockImplementationOnce(async () => {
      expect(sessionStorage.getItem(locatorKey)).toBeNull();
      return {
        ...clarificationTurn,
        session_id: "ses_after_retry_404",
      };
    });
    const user = userEvent.setup();
    render(<GuideSheet open onClose={vi.fn()} />);
    await screen.findByRole("button", { name: "重新同步" });

    await user.click(screen.getByRole("button", { name: "重新同步" }));

    await screen.findByRole("button", { name: "适合油皮吗？" });
    expect(api.createGuideSession).toHaveBeenCalledOnce();
    expect(sessionStorage.getItem(locatorKey)).toBe("ses_after_retry_404");
  });

  it("retains a locator after a network restore failure and reuses it on reopen", async () => {
    sessionStorage.setItem(locatorKey, "ses_restore_reopen");
    api.getGuideSession
      .mockRejectedValueOnce(new TypeError("network unavailable"))
      .mockResolvedValueOnce(
        turnFor("DECISION_READY", {
          session_id: "ses_restore_reopen",
          text: "重开后恢复同一会话",
        }),
      );
    const { rerender } = render(<GuideSheet open onClose={vi.fn()} />);

    expect(
      await screen.findByRole("button", { name: "重新同步" }),
    ).toBeVisible();
    rerender(<GuideSheet open={false} onClose={vi.fn()} />);
    rerender(<GuideSheet open onClose={vi.fn()} />);

    expect(await screen.findByText("重开后恢复同一会话")).toBeVisible();
    expect(api.getGuideSession).toHaveBeenNthCalledWith(
      2,
      "ses_restore_reopen",
    );
    expect(api.createGuideSession).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(locatorKey)).toBe("ses_restore_reopen");
  });

  it.each([
    [
      "session",
      turnFor("WAITING_CLARIFICATION", { session_id: "ses_wrong" }),
    ],
    [
      "context",
      turnFor("WAITING_CLARIFICATION", {
        context: {
          ...context,
          id: "night-routine-uv-002",
        },
      }),
    ],
  ])(
    "replaces a locator response with wrong %s ownership",
    async (_ownership, wrongTurn) => {
      sessionStorage.setItem(locatorKey, "ses_stale");
      api.getGuideSession.mockResolvedValueOnce(wrongTurn);
      api.createGuideSession.mockImplementationOnce(async () => {
        expect(sessionStorage.getItem(locatorKey)).toBeNull();
        return {
          ...clarificationTurn,
          session_id: "ses_recreated",
        };
      });

      render(<GuideSheet open onClose={vi.fn()} />);

      await screen.findByRole("button", { name: "适合油皮吗？" });
      expect(api.createGuideSession).toHaveBeenCalledOnce();
      expect(sessionStorage.getItem(locatorKey)).toBe("ses_recreated");
    },
  );

  it("rejects a wrong-context create response without storing its session", async () => {
    api.createGuideSession.mockResolvedValueOnce(
      turnFor("WAITING_CLARIFICATION", {
        session_id: "ses_wrong_context",
        context: {
          ...context,
          id: "night-routine-uv-002",
        },
      }),
    );

    render(<GuideSheet open onClose={vi.fn()} />);

    expect(
      await screen.findByRole("heading", { name: "导购暂时不可用" }),
    ).toBeVisible();
    expect(sessionStorage.getItem(locatorKey)).toBeNull();
    expect(screen.queryByText("Cloud Veil Mineral SPF")).not.toBeInTheDocument();
  });

  it("rejects a wrong-context message response instead of applying it", async () => {
    api.sendGuideMessage.mockResolvedValueOnce(
      turnFor("DECISION_READY", {
        session_id: "ses_guide_1",
        context: {
          ...context,
          id: "night-routine-uv-002",
        },
      }),
    );
    const user = userEvent.setup();
    render(<GuideSheet open onClose={vi.fn()} />);
    await screen.findByRole("button", { name: "会不会泛白？" });

    await user.click(
      screen.getByRole("button", { name: "会不会泛白？" }),
    );

    expect(
      await screen.findByRole("heading", { name: "导购暂时不可用" }),
    ).toBeVisible();
    expect(sessionStorage.getItem(locatorKey)).toBeNull();
    expect(screen.queryByRole("article", { name: "Seoul Shade Daily Fluid 商品建议" })).not.toBeInTheDocument();
  });

  it("retries an uncertain message POST once with one stable ID and revision before GET", async () => {
    api.sendGuideMessage.mockRejectedValueOnce(new TypeError("network lost"));
    api.sendGuideMessage.mockRejectedValueOnce(new TypeError("network lost"));
    api.getGuideSession.mockResolvedValueOnce(recommendationTurn);
    const user = userEvent.setup();
    render(<GuideSheet open onClose={vi.fn()} />);
    await screen.findByRole("button", {
      name: "会不会泛白？",
    });

    await user.click(
      screen.getByRole("button", { name: "会不会泛白？" }),
    );
    await screen.findByRole("article", { name: "Seoul Shade Daily Fluid 商品建议" });

    expect(api.sendGuideMessage).toHaveBeenCalledTimes(2);
    const firstCall = api.sendGuideMessage.mock.calls[0];
    expect(firstCall).toEqual([
      "ses_guide_1",
      expect.stringMatching(/^msg_/),
      "会不会泛白？",
      1,
    ]);
    expect(api.sendGuideMessage.mock.calls[1]).toEqual(firstCall);
    expect(api.getGuideSession).toHaveBeenCalledWith("ses_guide_1");
  });

  it("retries an uncertain comparison POST once with one stable ID and revision before GET", async () => {
    api.compareProducts.mockRejectedValueOnce(new TypeError("network lost"));
    api.compareProducts.mockRejectedValueOnce(new TypeError("network lost"));
    api.getGuideSession.mockResolvedValueOnce(comparisonReadyTurn);
    const user = await reachRecommendations();
    await selectFirstTwoCandidates();

    await user.click(screen.getByRole("button", { name: "和另一款比比" }));
    await screen.findByRole("table", { name: "商品对比" });

    expect(api.compareProducts).toHaveBeenCalledTimes(2);
    const firstCall = api.compareProducts.mock.calls[0];
    expect(firstCall).toEqual([
      "ses_guide_1",
      expect.stringMatching(/^cmp_/),
      ["seoul-shade-daily-fluid", "cloud-veil-mineral"],
      2,
    ]);
    expect(api.compareProducts.mock.calls[1]).toEqual(firstCall);
    expect(api.getGuideSession).toHaveBeenCalledWith("ses_guide_1");
  });
});
