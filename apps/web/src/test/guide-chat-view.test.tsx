import type { components } from "@shopping-guide/contracts/src/api";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { GuideChatView } from "@/components/guide-chat-view";

type GuideTurn = components["schemas"]["GuideTurnResponse"];
type TranscriptMessage = components["schemas"]["GuideTranscriptMessage"];

const context: components["schemas"]["ContentContextSummary"] = {
  id: "morning-routine-uv-001",
  anchor_product_id: "seoul-shade-daily-fluid",
  anchor_product_name: "Seoul Shade",
  creator_handle: "@routine.notes",
  caption: "A lightweight SPF step for a humid commute",
  claims: [],
};

const evidence: components["schemas"]["EvidenceReference"] = {
  evidence_id: "fda-sunscreen-basics",
  source_kind: "public_rule",
  status: "SUPPORTED",
  synthetic: false,
  title: "FDA sunscreen labeling guide",
  summary: "Broad-spectrum labeling and directions work together.",
  url: "https://www.fda.gov/drugs/sunscreen-guide",
};

const recommendations: components["schemas"]["RecommendationCard"][] = [
  {
    product_id: "seoul-shade-daily-fluid",
    brand: "Mirae Lab",
    name: "Seoul Shade Daily Fluid",
    verdict: "SUITABLE",
    starting_price_usd: 14,
    fit_reasons: ["轻薄妆效适合日常通勤", "无香精配方"],
    tradeoffs: ["没有防水标注", "户外场景需要更频繁补涂"],
    evidence_ids: [evidence.evidence_id],
    eligible_sku_ids: ["seoul-shade-30", "seoul-shade-50"],
  },
  {
    product_id: "cloud-veil-mineral",
    brand: "Atelier Namu",
    name: "Cloud Veil Mineral SPF",
    verdict: "CONDITIONAL",
    starting_price_usd: 17,
    fit_reasons: ["40 分钟防水"],
    tradeoffs: ["中等泛白风险"],
    evidence_ids: [],
    eligible_sku_ids: ["cloud-veil-50"],
  },
  {
    product_id: "jeju-sport-shield",
    brand: "Jeju Current",
    name: "Jeju Sport Shield",
    verdict: "CONDITIONAL",
    starting_price_usd: 16,
    fit_reasons: ["80 分钟防水"],
    tradeoffs: ["更厚重"],
    evidence_ids: [],
    eligible_sku_ids: ["jeju-sport-50"],
  },
];

const comparison: components["schemas"]["CompareResponse"] = {
  session_id: "ses_chat_view",
  state: "COMPARE",
  product_ids: [
    "seoul-shade-daily-fluid",
    "cloud-veil-mineral",
    "jeju-sport-shield",
  ],
  rows: {
    starting_price_usd: [14, 17, 16],
    fragrance_free: [true, false, true],
    water_resistance_minutes: [null, 40, 80],
    finish: ["natural", "matte", "natural"],
    white_cast_risk: ["low", "medium", "low"],
  },
  simulated: true,
};

const openingMessage: TranscriptMessage = {
  id: "gmsg_opening",
  sequence: 1,
  role: "ASSISTANT",
  kind: "OPENING",
  text: "我看到你在看 Seoul Shade。你最想确认什么？",
  created_at: "2026-08-10T00:00:00Z",
  redacted: false,
  quick_replies: ["适合油皮吗？", "会不会泛白？", "和防水款比比", "不应出现"],
  recommendations: [],
  evidence: [],
};

function turnWith(
  transcript: TranscriptMessage[],
  overrides: Partial<GuideTurn> = {},
): GuideTurn {
  const latest = transcript.at(-1) ?? openingMessage;
  return {
    session_id: "ses_chat_view",
    trace_id: "trace_chat_view",
    state: "UNDERSTAND",
    kind: "opening",
    text: latest.text,
    context,
    quick_replies: latest.quick_replies ?? [],
    locale: "zh-CN",
    guide_status: "ACTIVE",
    guide_view_kind: "OPENING_CONTEXT",
    guide_revision: 1,
    conversation_revision: 1,
    facts_snapshot_at: "2026-08-10T00:00:00Z",
    allowed_actions: ["SEND_MESSAGE", "RETURN_TO_FEED"],
    degraded: false,
    recommendations: latest.recommendations ?? [],
    evidence: latest.evidence ?? [],
    transcript,
    ...overrides,
  };
}

afterEach(cleanup);

describe("GuideChatView", () => {
  it("renders a compact opening with exactly three product questions and one disclosure", () => {
    render(
      <GuideChatView
        turn={turnWith([openingMessage])}
        mode="compact"
        onSubmit={vi.fn()}
        onQuickReply={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByRole("log", { name: "导购对话" })).toBeInTheDocument();
    expect(
      screen.getByText("我看到你在看 Seoul Shade。你最想确认什么？"),
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole("button", {
        name: /适合油皮|会不会泛白|和防水款比比/,
      }),
    ).toHaveLength(3);
    expect(screen.queryByRole("button", { name: "不应出现" })).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText("问问这款商品…")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("问问这款商品…")).not.toHaveFocus();
    expect(screen.queryByText("AI 决策")).not.toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.getAllByText("AI 生成 · 合成原型")).toHaveLength(1);
    expect(document.querySelectorAll("details")).toHaveLength(1);
    expect(screen.getByText("AI 生成 · 合成原型")).toHaveStyle({
      minHeight: "44px",
      display: "inline-flex",
      alignItems: "center",
    });
  });

  it("keeps a short answer conversational without rendering product results", () => {
    const answer: TranscriptMessage = {
      id: "gmsg_answer",
      sequence: 2,
      role: "ASSISTANT",
      kind: "ANSWER",
      text: "现有资料显示泛白风险较低，但不能保证所有肤色都完全不泛白。",
      redacted: false,
      recommendations: [],
      evidence: [evidence],
      quick_replies: [],
    };

    render(
      <GuideChatView
        turn={turnWith([openingMessage, answer], {
          kind: "answer",
          guide_view_kind: "ANSWER_READY",
          evidence: [evidence],
        })}
        mode="compact"
        onSubmit={vi.fn()}
        onQuickReply={vi.fn()}
        onOpenProduct={vi.fn()}
        onCompare={vi.fn()}
        onShowEvidence={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText(answer.text)).toBeVisible();
    expect(screen.queryByRole("article", { name: /商品建议/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /看商品|比较/ })).not.toBeInTheDocument();
  });

  it("shows one compact recommendation and keeps alternatives and evidence out of the tree until requested", async () => {
    const user = userEvent.setup();
    const onOpenProduct = vi.fn();
    const onShowEvidence = vi.fn();
    const recommendationMessage: TranscriptMessage = {
      id: "gmsg_recommendation",
      sequence: 2,
      role: "ASSISTANT",
      kind: "RECOMMENDATION",
      text: "日常通勤更适合 Seoul Shade；户外出汗时换防水款更稳妥。",
      redacted: false,
      recommendations,
      evidence: [evidence],
      quick_replies: [],
    };

    render(
      <GuideChatView
        turn={turnWith([openingMessage, recommendationMessage], {
          state: "PRESENT_RECOMMENDATION",
          kind: "recommendation",
          guide_view_kind: "DECISION_READY",
          verdict: "SUITABLE",
          recommendations,
          evidence: [evidence],
        })}
        mode="compact"
        onSubmit={vi.fn()}
        onQuickReply={vi.fn()}
        onOpenProduct={onOpenProduct}
        onCompare={vi.fn()}
        onShowEvidence={onShowEvidence}
        onClose={vi.fn()}
      />,
    );

    const card = screen.getByRole("article", {
      name: "Seoul Shade Daily Fluid 商品建议",
    });
    expect(within(card).getByText("轻薄妆效适合日常通勤")).toBeVisible();
    expect(within(card).queryByText("无香精配方")).not.toBeInTheDocument();
    expect(within(card).getByText("没有防水标注")).toBeVisible();
    expect(within(card).queryByText("户外场景需要更频繁补涂")).not.toBeInTheDocument();
    expect(screen.queryByText("Cloud Veil Mineral SPF")).not.toBeInTheDocument();
    expect(screen.queryByText(evidence.summary)).not.toBeInTheDocument();

    const evidenceTrigger = within(card).getByRole("button", { name: "查看 1 条依据" });
    await user.click(evidenceTrigger);
    expect(onShowEvidence).toHaveBeenCalledWith("seoul-shade-daily-fluid");
    expect(screen.getByRole("region", { name: "Seoul Shade Daily Fluid 的依据" })).toBeVisible();
    expect(screen.getByText(evidence.summary)).toBeVisible();

    await user.click(screen.getByRole("button", { name: "返回推荐" }));
    expect(
      screen.getByRole("button", { name: "查看 1 条依据" }),
    ).toHaveFocus();
    expect(screen.queryByText(evidence.summary)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "看看其他选择" }));
    expect(screen.getByRole("region", { name: "其他选择" })).toBeVisible();
    expect(screen.getByText("Cloud Veil Mineral SPF")).toBeVisible();
    expect(screen.getByText("Jeju Sport Shield")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "返回首选" }));
    expect(screen.getByRole("button", { name: "看看其他选择" })).toHaveFocus();
    expect(screen.queryByText("Cloud Veil Mineral SPF")).not.toBeInTheDocument();

    await user.click(
      within(
        screen.getByRole("article", {
          name: "Seoul Shade Daily Fluid 商品建议",
        }),
      ).getByRole("button", { name: "看商品" }),
    );
    expect(onOpenProduct).toHaveBeenCalledWith("seoul-shade-daily-fluid", "current");
  });

  it("reports evidence and alternatives subviews without deciding the parent mode", async () => {
    const user = userEvent.setup();
    const onSubviewChange = vi.fn();
    const recommendationMessage: TranscriptMessage = {
      id: "gmsg_subview_contract",
      sequence: 2,
      role: "ASSISTANT",
      kind: "RECOMMENDATION",
      text: "日常通勤更适合 Seoul Shade。",
      redacted: false,
      recommendations,
      evidence: [evidence],
      quick_replies: [],
    };

    render(
      <GuideChatView
        turn={turnWith([openingMessage, recommendationMessage], {
          state: "PRESENT_RECOMMENDATION",
          kind: "recommendation",
          guide_view_kind: "DECISION_READY",
          recommendations,
          evidence: [evidence],
        })}
        mode="compact"
        onSubmit={vi.fn()}
        onQuickReply={vi.fn()}
        onSubviewChange={onSubviewChange}
        onClose={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "查看 1 条依据" }));
    expect(onSubviewChange).toHaveBeenLastCalledWith("evidence");
    await user.click(screen.getByRole("button", { name: "返回推荐" }));
    expect(onSubviewChange).toHaveBeenLastCalledWith(null);

    await user.click(screen.getByRole("button", { name: "看看其他选择" }));
    expect(onSubviewChange).toHaveBeenLastCalledWith("alternatives");
    await user.click(screen.getByRole("button", { name: "返回首选" }));
    expect(onSubviewChange).toHaveBeenLastCalledWith(null);
  });

  it("restores message scroll once per session boundary and reports only user scrolling", () => {
    const onScrollTopChange = vi.fn();
    const props = {
      mode: "compact" as const,
      initialScrollTop: 126,
      onScrollTopChange,
      onSubmit: vi.fn(),
      onQuickReply: vi.fn(),
      onClose: vi.fn(),
    };
    const { rerender } = render(
      <GuideChatView {...props} turn={turnWith([openingMessage])} />,
    );
    const log = screen.getByRole("log", { name: "导购对话" });
    expect(log.scrollTop).toBe(126);
    expect(onScrollTopChange).not.toHaveBeenCalled();

    log.scrollTop = 191;
    fireEvent.scroll(log);
    expect(onScrollTopChange).toHaveBeenLastCalledWith(191);

    rerender(
      <GuideChatView
        {...props}
        turn={turnWith([openingMessage], { conversation_revision: 2 })}
      />,
    );
    expect(log.scrollTop).toBe(191);
    expect(onScrollTopChange).toHaveBeenCalledTimes(1);

    rerender(
      <GuideChatView
        {...props}
        turn={turnWith([openingMessage], { session_id: "ses_restored" })}
      />,
    );
    expect(log.scrollTop).toBe(126);
    expect(onScrollTopChange).toHaveBeenCalledTimes(1);
  });

  it("renders a semantic two-product comparison only in expanded mode", () => {
    const comparisonMessage: TranscriptMessage = {
      id: "gmsg_comparison",
      sequence: 2,
      role: "ASSISTANT",
      kind: "COMPARISON",
      text: "通勤选 Seoul Shade；需要防水时选 Cloud Veil。",
      redacted: false,
      recommendations,
      evidence: [],
      comparison,
      quick_replies: [],
    };
    const turn = turnWith([openingMessage, comparisonMessage], {
      state: "COMPARE",
      kind: "recommendation",
      guide_view_kind: "COMPARISON_READY",
      recommendations,
      comparison,
    });
    const props = {
      turn,
      onSubmit: vi.fn(),
      onQuickReply: vi.fn(),
      onOpenProduct: vi.fn(),
      onCompare: vi.fn(),
      onShowEvidence: vi.fn(),
      onClose: vi.fn(),
    };
    const { rerender } = render(<GuideChatView {...props} mode="compact" />);

    expect(screen.queryByRole("table", { name: "商品对比" })).not.toBeInTheDocument();

    rerender(<GuideChatView {...props} mode="expanded" />);
    const scroller = screen.getByRole("region", { name: "商品对比，可横向滚动" });
    expect(scroller).toHaveAttribute("tabindex", "0");
    const table = within(scroller).getByRole("table", { name: "商品对比" });
    expect(within(table).getAllByRole("columnheader")).toHaveLength(3);
    expect(within(table).queryByText("Jeju Sport Shield")).not.toBeInTheDocument();
  });

  it("never exposes product, comparison, or evidence actions for a safety turn", () => {
    const recommendationMessage: TranscriptMessage = {
      id: "gmsg_previous_recommendation",
      sequence: 2,
      role: "ASSISTANT",
      kind: "RECOMMENDATION",
      text: "Seoul Shade 是当前首选。",
      redacted: false,
      recommendations,
      evidence: [evidence],
      quick_replies: [],
    };
    const redactedUserMessage: TranscriptMessage = {
      id: "gmsg_redacted_user",
      sequence: 3,
      role: "USER",
      kind: "USER_TEXT",
      text: "已隐藏一条健康相关描述",
      redacted: true,
      recommendations: [],
      evidence: [],
      quick_replies: [],
    };
    const safetyMessage: TranscriptMessage = {
      id: "gmsg_safety",
      sequence: 4,
      role: "ASSISTANT",
      kind: "SAFETY",
      text: "如果出现严重过敏或药物相关问题，请停止使用并咨询专业人士。",
      redacted: false,
      recommendations: [],
      evidence: [],
      quick_replies: [],
    };

    render(
      <GuideChatView
        turn={turnWith(
          [
            openingMessage,
            recommendationMessage,
            redactedUserMessage,
            safetyMessage,
          ],
          {
            kind: "safety_boundary",
            guide_status: "SAFE_EXIT",
            guide_view_kind: "SAFE_BOUNDARY",
            recommendations,
            evidence: [evidence],
            comparison,
          },
        )}
        mode="expanded"
        statusText="安全信息已更新"
        onSubmit={vi.fn()}
        onQuickReply={vi.fn()}
        onOpenProduct={vi.fn()}
        onCompare={vi.fn()}
        onShowEvidence={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    const log = screen.getByRole("log", { name: "导购对话" });
    expect(within(log).getAllByRole("article")).toHaveLength(2);
    expect(screen.getByText(redactedUserMessage.text)).toBeVisible();
    expect(screen.getByText(safetyMessage.text)).toBeVisible();
    expect(screen.getByLabelText("安全提示")).toHaveTextContent(
      "商品建议已隐藏",
    );
    expect(screen.getByRole("status")).toHaveTextContent("安全信息已更新");
    expect(screen.getByRole("button", { name: "关闭导购" })).toBeVisible();
    expect(screen.queryByText(/Seoul Shade/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText("当前视频商品")).not.toBeInTheDocument();
    expect(screen.queryByText(openingMessage.text)).not.toBeInTheDocument();
    expect(screen.queryByText(recommendationMessage.text)).not.toBeInTheDocument();
    expect(screen.queryByText(evidence.title)).not.toBeInTheDocument();
    expect(screen.queryByRole("article", { name: /商品建议/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("region", {
        name: /商品对比|其他选择|依据/,
      }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /看商品|比较|依据/ })).not.toBeInTheDocument();
  });

  it("submits once on Enter, ignores composition Enter, and preserves a real Shift+Enter line break", () => {
    const onSubmit = vi.fn();
    render(
      <GuideChatView
        turn={turnWith([openingMessage])}
        mode="compact"
        onSubmit={onSubmit}
        onQuickReply={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    const composer = screen.getByPlaceholderText("问问这款商品…");

    fireEvent.change(composer, { target: { value: "油皮适合吗" } });
    fireEvent.compositionStart(composer);
    fireEvent.keyDown(composer, { key: "Enter", code: "Enter", isComposing: true });
    expect(onSubmit).not.toHaveBeenCalled();
    fireEvent.compositionEnd(composer);

    fireEvent.keyDown(composer, { key: "Enter", code: "Enter", shiftKey: true });
    expect(onSubmit).not.toHaveBeenCalled();
    fireEvent.change(composer, {
      target: { value: "油皮适合吗\n还想确认泛白" },
    });
    expect(composer).toHaveValue("油皮适合吗\n还想确认泛白");

    fireEvent.keyDown(composer, { key: "Enter", code: "Enter" });
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith("油皮适合吗\n还想确认泛白");
    expect(composer).toHaveValue("");
  });

  it("grows from one through three rows using scroll geometry, caps the fourth, and shrinks after submit", () => {
    const onSubmit = vi.fn();
    render(
      <GuideChatView
        turn={turnWith([openingMessage])}
        mode="compact"
        onSubmit={onSubmit}
        onQuickReply={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    const composer = screen.getByPlaceholderText(
      "问问这款商品…",
    ) as HTMLTextAreaElement;
    Object.defineProperty(composer, "scrollHeight", {
      configurable: true,
      get: () => 42 + (String(composer.value).split("\n").length - 1) * 20,
    });

    fireEvent.change(composer, { target: { value: "第一行\n第二行" } });
    expect(composer).toHaveStyle({ height: "64px", overflowY: "hidden" });

    fireEvent.change(composer, {
      target: { value: "第一行\n第二行\n第三行" },
    });
    expect(composer).toHaveStyle({ height: "84px", overflowY: "hidden" });

    fireEvent.change(composer, {
      target: { value: "第一行\n第二行\n第三行\n第四行" },
    });
    expect(composer).toHaveStyle({ height: "84px", overflowY: "auto" });

    fireEvent.keyDown(composer, { key: "Enter", code: "Enter" });
    expect(onSubmit).toHaveBeenCalledWith("第一行\n第二行\n第三行\n第四行");
    expect(composer).toHaveValue("");
    expect(composer).toHaveStyle({ height: "44px", overflowY: "hidden" });
  });

  it("uses polite status and assertive error semantics supplied by the controller", () => {
    const { rerender } = render(
      <GuideChatView
        turn={turnWith([openingMessage])}
        mode="compact"
        statusText="正在核对商品信息…"
        onSubmit={vi.fn()}
        onQuickReply={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByRole("status")).toHaveTextContent("正在核对商品信息…");

    rerender(
      <GuideChatView
        turn={turnWith([openingMessage])}
        mode="compact"
        errorText="回答暂时无法恢复"
        onSubmit={vi.fn()}
        onQuickReply={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("回答暂时无法恢复");
  });
});
