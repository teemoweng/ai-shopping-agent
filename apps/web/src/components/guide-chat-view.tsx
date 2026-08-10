"use client";

import type { components } from "@shopping-guide/contracts/src/api";
import { useEffect, useRef, useState } from "react";

import { ComparisonTable } from "@/components/comparison-table";
import { RecommendationCard } from "@/components/recommendation-card";

type GuideTurn = components["schemas"]["GuideTurnResponse"];
type EvidenceReference = components["schemas"]["EvidenceReference"];
type Recommendation = components["schemas"]["RecommendationCard"];
type ProductRole = "current" | "alternative";
type GuideMode = "compact" | "expanded";
type SubviewKind = "evidence" | "alternatives";
type Subview =
  | { kind: "evidence"; recommendation: Recommendation; messageId: string }
  | { kind: "alternatives"; messageId: string }
  | null;
type RestorableSubview = Extract<NonNullable<Subview>, { kind: "alternatives" }>;

const COMPOSER_MIN_HEIGHT = 44;
const COMPOSER_MAX_HEIGHT = 84;
const COMPOSER_BORDER_HEIGHT = 2;

export interface GuideChatViewProps {
  turn: GuideTurn;
  mode: GuideMode;
  disabled?: boolean;
  statusText?: string | null;
  errorText?: string | null;
  onSubmit: (text: string) => void;
  onQuickReply: (reply: string) => void;
  onOpenProduct?: (productId: string, role: ProductRole) => void;
  onCompare?: () => void;
  onShowEvidence?: (productId: string) => void;
  onSubviewChange?: (kind: SubviewKind | null) => void;
  initialSubview?: RestorableSubview | null;
  initialScrollTop?: number;
  onScrollTopChange?: (scrollTop: number) => void;
  onClose: () => void;
}

function evidenceFor(
  recommendation: Recommendation,
  evidence: EvidenceReference[],
) {
  const wanted = new Set(recommendation.evidence_ids);
  return evidence.filter((item) => wanted.has(item.evidence_id));
}

export function GuideChatView({
  turn,
  mode,
  disabled = false,
  statusText = null,
  errorText = null,
  onSubmit,
  onQuickReply,
  onOpenProduct,
  onCompare,
  onShowEvidence,
  onSubviewChange,
  initialSubview,
  initialScrollTop = 0,
  onScrollTopChange,
  onClose,
}: GuideChatViewProps) {
  const [draft, setDraft] = useState("");
  const [subview, setSubview] = useState<Subview>(initialSubview ?? null);
  const composingRef = useRef(false);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const nearBottomRef = useRef(true);
  const evidenceTriggerRef = useRef<HTMLButtonElement>(null);
  const alternativesTriggerRef = useRef<HTMLButtonElement>(null);
  const pendingFocusRestoreRef = useRef<"evidence" | "alternatives" | null>(
    null,
  );
  const initialScrollTopRef = useRef(initialScrollTop);
  const transcript = turn.transcript ?? [];
  const latestMessage = transcript.at(-1);
  const recommendations = latestMessage?.recommendations ?? [];
  const evidence = latestMessage?.evidence ?? [];
  const quickReplies = latestMessage?.quick_replies ?? [];
  const messageId = latestMessage?.id ?? "";
  const activeSubview = subview?.messageId === messageId ? subview : null;
  const isOpening = latestMessage?.kind === "OPENING";
  const isSafety =
    latestMessage?.kind === "SAFETY" || turn.guide_view_kind === "SAFE_BOUNDARY";
  const safetyTranscript = isSafety
    ? [
        [...transcript]
          .reverse()
          .find(
            (message) =>
              message.role === "USER" &&
              message.kind === "USER_TEXT" &&
              message.redacted &&
              message.text === "已隐藏一条健康相关描述",
          ),
        [...transcript]
          .reverse()
          .find(
            (message) =>
              message.role === "ASSISTANT" && message.kind === "SAFETY",
          ),
      ].filter((message) => message !== undefined)
    : transcript;
  const primaryRecommendation = recommendations[0];
  const productNames = Object.fromEntries(
    recommendations.map((item) => [item.product_id, item.name]),
  );

  useEffect(() => {
    const log = logRef.current;
    if (log && nearBottomRef.current) {
      log.scrollTop = log.scrollHeight;
    }
  }, [safetyTranscript.length]);

  useEffect(() => {
    initialScrollTopRef.current = initialScrollTop;
  }, [initialScrollTop]);

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = Math.max(0, initialScrollTopRef.current);
    }
  }, [turn.session_id]);

  useEffect(() => {
    if (activeSubview || !pendingFocusRestoreRef.current) {
      return;
    }
    const target =
      pendingFocusRestoreRef.current === "evidence"
        ? evidenceTriggerRef.current
        : alternativesTriggerRef.current;
    pendingFocusRestoreRef.current = null;
    target?.focus();
  }, [activeSubview]);

  function closeSubview() {
    pendingFocusRestoreRef.current = activeSubview?.kind ?? null;
    setSubview(null);
    onSubviewChange?.(null);
  }

  function submitDraft() {
    const text = draft.trim();
    if (!text || disabled) {
      return;
    }
    onSubmit(text);
    setDraft("");
    if (composerRef.current) {
      composerRef.current.style.height = `${COMPOSER_MIN_HEIGHT}px`;
      composerRef.current.style.overflowY = "hidden";
    }
  }

  function resizeComposer(node: HTMLTextAreaElement) {
    node.style.height = `${COMPOSER_MIN_HEIGHT}px`;
    const contentHeight = node.scrollHeight + COMPOSER_BORDER_HEIGHT;
    const nextHeight = Math.min(
      Math.max(contentHeight, COMPOSER_MIN_HEIGHT),
      COMPOSER_MAX_HEIGHT,
    );
    node.style.height = `${nextHeight}px`;
    node.style.overflowY =
      contentHeight > COMPOSER_MAX_HEIGHT ? "auto" : "hidden";
  }

  function roleFor(recommendation: Recommendation): ProductRole {
    return recommendation.product_id === turn.context.anchor_product_id
      ? "current"
      : "alternative";
  }

  function renderRecommendation(
    recommendation: Recommendation,
    { allowEvidence = false }: { allowEvidence?: boolean } = {},
  ) {
    const recommendationEvidence = evidenceFor(recommendation, evidence);
    return (
      <RecommendationCard
        key={recommendation.product_id}
        recommendation={recommendation}
        index={recommendations.indexOf(recommendation)}
        role={roleFor(recommendation)}
        evidence={recommendationEvidence}
        comparisonEnabled={false}
        selectedForCompare={false}
        disabled={disabled}
        variant="compact"
        evidenceButtonRef={allowEvidence ? evidenceTriggerRef : undefined}
        onCompareChange={() => undefined}
        onOpenProduct={onOpenProduct}
        onShowEvidence={
          allowEvidence && recommendationEvidence.length > 0
            ? (productId) => {
                setSubview({ kind: "evidence", recommendation, messageId });
                onSubviewChange?.("evidence");
                onShowEvidence?.(productId);
              }
            : undefined
        }
      />
    );
  }

  return (
    <section
      className="guideChatView"
      data-mode={mode}
      data-opening={isOpening ? "true" : "false"}
      aria-label="AI 商品导购"
    >
      <header className="guideChatHeader">
        <div
          className="guideSourceChip"
          aria-label={isSafety ? "安全提示" : "当前视频商品"}
        >
          <span aria-hidden="true">{isSafety ? "!" : "▶"}</span>
          <p>
            <strong>
              {isSafety ? "安全提示" : turn.context.anchor_product_name}
            </strong>
            <small>
              {isSafety ? "商品建议已隐藏" : turn.context.creator_handle}
            </small>
          </p>
        </div>
        <button
          type="button"
          className="guideChatClose"
          aria-label="关闭导购"
          onClick={onClose}
        >
          ×
        </button>
      </header>

      <div
        ref={logRef}
        className="guideChatMessages"
        role="log"
        aria-label="导购对话"
        aria-live="polite"
        aria-relevant="additions text"
        onScroll={(event) => {
          const node = event.currentTarget;
          nearBottomRef.current =
            node.scrollHeight - node.scrollTop - node.clientHeight <= 48;
          onScrollTopChange?.(Math.max(0, node.scrollTop));
        }}
      >
        {safetyTranscript.map((message) => (
          <article
            key={message.id}
            className={`guideChatMessage guideChatMessage-${message.role.toLowerCase()}`}
            aria-label={message.role === "ASSISTANT" ? "AI" : "你"}
            data-kind={message.kind}
          >
            <span>{message.role === "ASSISTANT" ? "AI" : "你"}</span>
            <p>{message.text}</p>
          </article>
        ))}

        {statusText ? (
          <div className="guideChatStatus" role="status">
            {statusText}
          </div>
        ) : null}
        {errorText ? (
          <div className="guideChatError" role="alert">
            {errorText}
          </div>
        ) : null}

        {!isSafety && activeSubview?.kind === "evidence" ? (
          <section
            className="guideChatSubview guideEvidenceSubview"
            role="region"
            aria-label={`${activeSubview.recommendation.name} 的依据`}
          >
            <div className="guideSubviewHeading">
              <h2>为什么这样建议</h2>
              <button type="button" onClick={closeSubview}>
                返回推荐
              </button>
            </div>
            {evidenceFor(activeSubview.recommendation, evidence).map((item) => (
              <article key={item.evidence_id} className="guideEvidenceItem">
                <strong>{item.title}</strong>
                <p>{item.summary}</p>
              </article>
            ))}
          </section>
        ) : null}

        {!isSafety && activeSubview?.kind === "alternatives" ? (
          <section
            className="guideChatSubview guideAlternativesSubview"
            role="region"
            aria-label="其他选择"
          >
            <div className="guideSubviewHeading">
              <h2>其他合格选择</h2>
              <button type="button" onClick={closeSubview}>
                返回首选
              </button>
            </div>
            <div className="guideAlternativeList">
              {recommendations.slice(1).map((recommendation) =>
                renderRecommendation(recommendation),
              )}
            </div>
          </section>
        ) : null}

        {!isSafety && !activeSubview && latestMessage?.kind === "RECOMMENDATION" && primaryRecommendation ? (
          <div className="guideInlineDecision">
            {renderRecommendation(primaryRecommendation, { allowEvidence: true })}
            <div className="guideInlineActions" aria-label="推荐后续操作">
              {onCompare ? (
                <button type="button" disabled={disabled} onClick={onCompare}>
                  和另一款比比
                </button>
              ) : null}
              {recommendations.length > 1 ? (
                <button
                  ref={alternativesTriggerRef}
                  type="button"
                  disabled={disabled}
                  onClick={() => {
                    if (disabled) {
                      return;
                    }
                    setSubview({ kind: "alternatives", messageId });
                    onSubviewChange?.("alternatives");
                  }}
                >
                  看看其他选择
                </button>
              ) : null}
            </div>
          </div>
        ) : null}

        {!isSafety && !activeSubview && mode === "expanded" && latestMessage?.kind === "COMPARISON" && latestMessage.comparison ? (
          <ComparisonTable
            comparison={latestMessage.comparison}
            productNames={productNames}
            anchorProductId={turn.context.anchor_product_id}
            disabled={disabled}
            onOpenProduct={onOpenProduct}
            variant="compact"
          />
        ) : null}
      </div>

      {!isSafety && !activeSubview && quickReplies.length > 0 ? (
        <div className="guideChatQuickReplies" role="group" aria-label="你可以这样问">
          {quickReplies.slice(0, isOpening ? 3 : 4).map((reply) => (
            <button
              key={reply}
              type="button"
              disabled={disabled}
              onClick={() => {
                if (!disabled) {
                  onQuickReply(reply);
                }
              }}
            >
              {reply}
            </button>
          ))}
        </div>
      ) : null}

      <form
        className="guideChatComposer"
        onSubmit={(event) => {
          event.preventDefault();
          submitDraft();
        }}
      >
        <label htmlFor="guide-chat-input">继续提问</label>
        <textarea
          ref={composerRef}
          id="guide-chat-input"
          name="guide-chat-input"
          rows={1}
          value={draft}
          disabled={disabled}
          enterKeyHint="send"
          placeholder="问问这款商品…"
          style={{ height: COMPOSER_MIN_HEIGHT, overflowY: "hidden" }}
          onChange={(event) => {
            setDraft(event.target.value);
            resizeComposer(event.currentTarget);
          }}
          onCompositionStart={() => {
            composingRef.current = true;
          }}
          onCompositionEnd={() => {
            composingRef.current = false;
          }}
          onKeyDown={(event) => {
            if (
              composingRef.current ||
              event.nativeEvent.isComposing ||
              event.key !== "Enter" ||
              event.shiftKey
            ) {
              return;
            }
            event.preventDefault();
            submitDraft();
          }}
        />
        <button type="submit" disabled={disabled || !draft.trim()} aria-label="发送消息">
          ↑
        </button>
      </form>

      <details className="guideChatDisclosure">
        <summary
          style={{ minHeight: 44, display: "inline-flex", alignItems: "center" }}
        >
          AI 生成 · 合成原型
        </summary>
        <p>商品、内容和用户场景均为合成数据；价格与库存需在商品页再次核验。</p>
      </details>
    </section>
  );
}
