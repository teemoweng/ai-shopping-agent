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
  OPENING_CONTEXT: ["RETURN_TO_FEED"],
  CONTEXT_CONFIRMATION: ["CONFIRM_CONTEXT", "RETURN_TO_FEED"],
  WAITING_CLARIFICATION: [
    "ANSWER_CLARIFICATION",
    "SKIP_CLARIFICATION",
    "UPDATE_CONSTRAINTS",
    "RETURN_TO_FEED",
  ],
  VERIFYING_FACTS: ["RETURN_TO_FEED"],
  DECISION_READY: [
    "UPDATE_CONSTRAINTS",
    "REQUEST_COMPARISON",
    "OPEN_PRODUCT",
    "RETURN_TO_FEED",
  ],
  NO_MATCH: ["RELAX_CONSTRAINT", "RETURN_TO_FEED"],
  INSUFFICIENT_EVIDENCE: [
    "OPEN_PRODUCT",
    "CONTINUE_WITH_KNOWN",
    "RETURN_TO_FEED",
  ],
  COMPARISON_READY: ["OPEN_PRODUCT", "RETURN_TO_FEED"],
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
  return {
    session_id: "ses_guide_1",
    trace_id: "trace_guide_1",
    state: isClarification ? "CLARIFY" : "PRESENT_RECOMMENDATION",
    kind: isSafe
      ? "safety_boundary"
      : isNoMatch
        ? "no_match"
        : isDecision
          ? "recommendation"
          : isClarification
            ? "clarification"
            : "opening",
    text: `${guideViewKind} 的可见说明`,
    context,
    quick_replies: isClarification ? ["日常通勤", "40 分钟", "80 分钟", "跳过"] : [],
    locale: "zh-CN",
    guide_status: isSafe ? "SAFE_EXIT" : guideViewKind === "FATAL_ERROR" ? "FAILED" : isClarification ? "WAITING_USER" : "ACTIVE",
    guide_view_kind: guideViewKind,
    guide_revision: 1,
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
    recommendations: isDecision ? recommendations : [],
    evidence: isDecision ? evidence : [],
    ...overrides,
  };
}

const clarificationTurn = turnFor("WAITING_CLARIFICATION", {
  text: "主要是日常通勤，还是需要 40/80 分钟防水？",
});

const recommendationTurn = turnFor("DECISION_READY", {
  guide_revision: 2,
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

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
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
  document.body.style.overflow = "";
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
  expect(screen.getByText(context.caption)).toBeVisible();
  for (const prompt of [
    "这款适合我吗？",
    "视频里的说法可信吗？",
    "帮我找更合适的替代",
  ]) {
    expect(screen.getByRole("button", { name: prompt })).toBeVisible();
  }
  expect(screen.getByText("基于合成商品数据和公开资料快照")).toBeVisible();
  expect(screen.getByLabelText("补充你的条件")).toHaveAttribute(
    "placeholder",
    "例如：油敏皮、深肤色、去夏威夷，预算 30 美元以内",
  );
  expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /购物车|加购|购买|SKU/i })).not.toBeInTheDocument();
  expect(document.body).not.toHaveTextContent("seoul-shade-30");
});

it("reveals exactly one fixed clarification with four choices and sends skip explicitly", async () => {
  const user = userEvent.setup();
  render(<GuideSheet open onClose={vi.fn()} />);
  await screen.findByRole("button", { name: "这款适合我吗？" });

  await user.click(screen.getByRole("button", { name: "这款适合我吗？" }));
  expect(screen.getByText(clarificationTurn.text)).toBeVisible();
  for (const option of ["日常通勤", "40 分钟", "80 分钟", "跳过"]) {
    expect(screen.getByRole("button", { name: option })).toBeVisible();
  }
  expect(screen.queryByRole("button", { name: "这款适合我吗？" })).not.toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "跳过" }));
  expect(api.sendGuideMessage).toHaveBeenCalledWith(
    "ses_guide_1",
    expect.stringMatching(/^msg_/),
    "跳过",
  );
});

it("submits free Chinese constraints, shows verified progress, and blocks duplicate submits synchronously", async () => {
  const pending = deferred<GuideTurn>();
  api.sendGuideMessage.mockReturnValue(pending.promise);
  render(<GuideSheet open onClose={vi.fn()} />);
  await screen.findByLabelText("补充你的条件");

  const input = screen.getByLabelText("补充你的条件");
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
  );
  expect(screen.getByRole("status")).toHaveTextContent(
    "正在核验商品事实与视频说法",
  );
  expect(screen.getByRole("button", { name: "正在核验" })).toBeDisabled();
  expect(input).toBeDisabled();

  await act(async () => pending.resolve(recommendationTurn));
  expect(await screen.findByRole("heading", { name: "适合" })).toBeVisible();
});

it("preserves the last verified response when a retryable message request fails", async () => {
  const user = userEvent.setup();
  api.sendGuideMessage.mockRejectedValueOnce(
    new ApiError(503, "TEMPORARY_UNAVAILABLE"),
  );
  render(<GuideSheet open onClose={vi.fn()} />);
  await screen.findByRole("button", { name: "这款适合我吗？" });
  await user.click(screen.getByRole("button", { name: "这款适合我吗？" }));
  await user.click(screen.getByRole("button", { name: "日常通勤" }));

  expect(await screen.findByRole("alert")).toHaveTextContent(
    "暂时无法完成核验",
  );
  expect(screen.getByText(clarificationTurn.text)).toBeVisible();
  expect(screen.getByRole("button", { name: "日常通勤" })).toBeEnabled();
});

it("shows at most three candidates, three fit reasons, four evidence states, and only safe source links", async () => {
  const user = userEvent.setup();
  render(<GuideSheet open onClose={vi.fn()} />);
  await screen.findByRole("button", { name: "视频里的说法可信吗？" });
  await user.click(screen.getByRole("button", { name: "视频里的说法可信吗？" }));

  expect(await screen.findByRole("heading", { name: "适合" })).toBeVisible();
  expect(screen.getAllByRole("article", { name: /商品建议/ })).toHaveLength(3);
  expect(screen.queryByText("Busan Soft Sun Milk")).not.toBeInTheDocument();
  expect(screen.getByText("third reason")).toBeVisible();
  expect(screen.queryByText("hidden fourth")).not.toBeInTheDocument();
  for (const label of ["有公开依据", "与来源冲突", "证据不足", "主观体验分歧"]) {
    expect(screen.getAllByText(label).length).toBeGreaterThan(0);
  }
  expect(screen.getAllByText(/合成评测证据/).length).toBeGreaterThan(0);
  const safeLink = screen.getAllByRole("link", {
    name: /FDA sunscreen labeling guide/,
  })[0];
  expect(safeLink).toHaveAttribute("href", evidence[0].url);
  expect(safeLink).toHaveAttribute("target", "_blank");
  expect(safeLink).toHaveAttribute("rel", expect.stringContaining("noopener"));
  expect(screen.queryByRole("link", { name: /Unsafe source/ })).not.toBeInTheDocument();
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
  await screen.findByRole("button", { name: "帮我找更合适的替代" });
  await user.click(screen.getByRole("button", { name: "帮我找更合适的替代" }));
  await screen.findByRole("heading", { name: "适合" });
  const alternativeCard = screen
    .getByRole("heading", { name: "Cloud Veil Mineral SPF" })
    .closest("article");
  expect(alternativeCard).not.toBeNull();
  await user.click(within(alternativeCard!).getByRole("button", { name: "查看商品" }));
  expect(screen.getByText("cloud-veil-mineral:alternative")).toBeVisible();
});

it("replaces candidate cards with the comparison and can return locally to recommendations", async () => {
  const user = userEvent.setup();
  render(<GuideSheet open onClose={vi.fn()} />);
  await screen.findByRole("button", { name: "帮我找更合适的替代" });
  await user.click(screen.getByRole("button", { name: "帮我找更合适的替代" }));
  await screen.findByRole("heading", { name: "适合" });

  await user.click(screen.getByRole("checkbox", { name: "比较 Seoul Shade Daily Fluid" }));
  await user.click(screen.getByRole("checkbox", { name: "比较 Cloud Veil Mineral SPF" }));
  await user.click(screen.getByRole("button", { name: "比较已选 2 款" }));

  expect(api.compareProducts).toHaveBeenCalledWith("ses_guide_1", [
    "seoul-shade-daily-fluid",
    "cloud-veil-mineral",
  ]);
  expect(await screen.findByRole("table", { name: "商品对比" })).toBeVisible();
  expect(screen.queryByRole("article", { name: /商品建议/ })).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "返回推荐" }));
  expect(screen.getAllByRole("article", { name: /商品建议/ })).toHaveLength(3);
});

it.each([
  ["OPENING_CONTEXT", "正在读取当前视频和商品"],
  ["CONTEXT_CONFIRMATION", "请确认视频中的商品"],
  ["WAITING_CLARIFICATION", "这款适合我吗？"],
  ["VERIFYING_FACTS", "正在核验商品事实与视频说法"],
  ["DECISION_READY", "适合"],
  ["NO_MATCH", "没有找到同时满足条件的商品"],
  ["INSUFFICIENT_EVIDENCE", "当前证据不足"],
  ["COMPARISON_READY", "比较结果"],
  ["SAFE_BOUNDARY", "安全边界"],
  ["RECOVERY_REQUIRED", "需要恢复导购"],
  ["FATAL_ERROR", "导购暂时不可用"],
] as const)("renders a nonempty %s view", async (viewKind, visibleText) => {
  api.createGuideSession.mockResolvedValueOnce(turnFor(viewKind));
  render(<GuideSheet open onClose={vi.fn()} />);

  await screen.findByLabelText("已继承的视频与商品上下文");
  expect(screen.getAllByText(visibleText, { exact: false })[0]).toBeVisible();
  expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /购物车|加购|购买|SKU/i })).not.toBeInTheDocument();
});

it("does not render business actions omitted by the server", async () => {
  api.createGuideSession.mockResolvedValueOnce(
    turnFor("DECISION_READY", { allowed_actions: ["RETURN_TO_FEED"] }),
  );
  render(<GuideSheet open onClose={vi.fn()} />);
  await screen.findByRole("heading", { name: "适合" });

  expect(screen.queryByRole("button", { name: "查看商品" })).not.toBeInTheDocument();
  expect(screen.queryByRole("checkbox", { name: /比较 / })).not.toBeInTheDocument();
  expect(screen.queryByLabelText("补充你的条件")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /继续|重试|放宽/ })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "关闭 AI 导购" })).toBeVisible();
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

  it("locks body scroll, traps focus, closes with Escape, and returns focus", async () => {
    const user = userEvent.setup();
    render(<OpenHarness />);
    const trigger = screen.getByRole("button", { name: "问 AI" });

    await user.click(trigger);
    const close = screen.getByRole("button", { name: "关闭 AI 导购" });
    expect(close).toHaveFocus();
    expect(document.body.style.overflow).toBe("hidden");
    await screen.findByRole("button", { name: "这款适合我吗？" });

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
    await screen.findByRole("button", { name: "视频里的说法可信吗？" });
    await user.click(screen.getByRole("button", { name: "视频里的说法可信吗？" }));
    await screen.findByRole("heading", { name: "适合" });

    const scroller = screen.getByRole("region", { name: "AI 导购内容" });
    Object.defineProperty(scroller, "scrollTop", {
      configurable: true,
      writable: true,
      value: 218.5,
    });
    fireEvent.scroll(scroller);
    expect(onScrollTopChange).toHaveBeenLastCalledWith(218.5);
    await user.click(screen.getByRole("button", { name: "关闭 AI 导购" }));

    api.getGuideSession.mockResolvedValueOnce(recommendationTurn);
    rerender(
      <OpenHarness initialScrollTop={218.5} onScrollTopChange={onScrollTopChange} />,
    );
    await user.click(screen.getByRole("button", { name: "问 AI" }));
    await screen.findByRole("heading", { name: "适合" });

    expect(api.createGuideSession).toHaveBeenCalledTimes(1);
    expect(api.getGuideSession).toHaveBeenCalledWith("ses_guide_1");
    await waitFor(() => {
      expect(
        Math.abs(
          screen.getByRole("region", { name: "AI 导购内容" }).scrollTop -
            218.5,
        ),
      ).toBeLessThanOrEqual(2);
    });
  });

  it("ignores an old message response after close/reopen", async () => {
    const user = userEvent.setup();
    const stale = deferred<GuideTurn>();
    api.sendGuideMessage.mockReturnValueOnce(stale.promise);
    api.getGuideSession.mockResolvedValueOnce(recommendationTurn);
    render(<OpenHarness />);
    await user.click(screen.getByRole("button", { name: "问 AI" }));
    await screen.findByLabelText("补充你的条件");
    await user.type(screen.getByLabelText("补充你的条件"), "日常通勤");
    await user.click(screen.getByRole("button", { name: "发送" }));
    await user.click(screen.getByRole("button", { name: "关闭 AI 导购" }));
    await user.click(screen.getByRole("button", { name: "问 AI" }));
    await screen.findByRole("heading", { name: "适合" });

    await act(async () =>
      stale.resolve(
        turnFor("NO_MATCH", { text: "旧响应不能覆盖当前快照" }),
      ),
    );
    expect(screen.queryByText("旧响应不能覆盖当前快照")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "适合" })).toBeVisible();
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
    await screen.findByRole("button", { name: "帮我找更合适的替代" });
    await user.click(screen.getByRole("button", { name: "帮我找更合适的替代" }));
    await screen.findByRole("heading", { name: "适合" });
    const currentCard = screen
      .getByRole("heading", { name: "Seoul Shade Daily Fluid" })
      .closest("article");
    await user.click(within(currentCard!).getByRole("button", { name: "查看商品" }));
    api.getGuideSession.mockResolvedValueOnce(recommendationTurn);
    await user.click(
      screen.getByRole("button", {
        name: "从 seoul-shade-daily-fluid:current 返回 AI",
      }),
    );

    expect(await screen.findByRole("heading", { name: "适合" })).toBeVisible();
    expect(api.createGuideSession).toHaveBeenCalledTimes(1);
    expect(api.getGuideSession).toHaveBeenCalledWith("ses_guide_1");
  });
});
