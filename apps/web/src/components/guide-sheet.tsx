"use client";

import type { components } from "@shopping-guide/contracts/src/api";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import type {
  FormEvent,
  KeyboardEvent,
  MouseEvent,
  ReactNode,
} from "react";

import { ComparisonTable } from "@/components/comparison-table";
import { RecommendationCard } from "@/components/recommendation-card";
import {
  compareProducts,
  createGuideSession,
  getGuideSession,
  sendGuideMessage,
} from "@/lib/api-client";

type GuideTurn = components["schemas"]["GuideTurnResponse"];
type GuideAction = components["schemas"]["GuideAction"];
type EvidenceStatus = components["schemas"]["EvidenceStatus"];
type EvidenceReference = components["schemas"]["EvidenceReference"];
type CompareResponse = components["schemas"]["CompareResponse"];
type ProductRole = "current" | "alternative";

const STARTING_QUESTIONS = [
  "这款适合我吗？",
  "视频里的说法可信吗？",
  "帮我找更合适的替代",
] as const;

const claimStatusLabels = {
  SUPPORTED: "有公开依据",
  CONFLICTING: "与来源冲突",
  INSUFFICIENT_EVIDENCE: "证据不足",
  SUBJECTIVE_MIXED: "主观体验分歧",
} satisfies Record<EvidenceStatus, string>;

const verdictLabels = {
  SUITABLE: "适合",
  CONDITIONAL: "有条件适合",
  NOT_RECOMMENDED: "不建议",
  INSUFFICIENT_EVIDENCE: "信息不足",
} as const;

export function claimStatusLabel(status: EvidenceStatus) {
  return claimStatusLabels[status];
}

function hasAction(turn: GuideTurn, action: GuideAction) {
  return turn.allowed_actions.includes(action);
}

function safePublicSourceUrl(evidence: EvidenceReference) {
  if (evidence.synthetic || evidence.source_kind !== "public_rule") {
    return null;
  }
  try {
    const url = new URL(evidence.url);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function EvidenceDisclosure({ evidence }: { evidence: EvidenceReference }) {
  const sourceUrl = safePublicSourceUrl(evidence);
  return (
    <details className="evidenceDisclosure" data-status={evidence.status}>
      <summary>
        <span>{claimStatusLabel(evidence.status)}</span>
        {evidence.title}
      </summary>
      <p>{evidence.summary}</p>
      {evidence.synthetic ? (
        <small>合成评测证据 · 不是外部用户研究</small>
      ) : sourceUrl ? (
        <a href={sourceUrl} target="_blank" rel="noopener noreferrer">
          {evidence.title}
          <span aria-hidden="true"> ↗</span>
        </a>
      ) : (
        <small>来源地址未通过安全校验，本页不提供跳转</small>
      )}
    </details>
  );
}

function ContextMiniCard({ turn }: { turn: GuideTurn }) {
  return (
    <section className="guideContextCard" aria-label="已继承的视频与商品上下文">
      <div className="guideContextThumb" aria-hidden="true">
        <span>SPF</span>
      </div>
      <div className="guideContextCopy">
        <span>关于视频中的商品</span>
        <strong>{turn.context.anchor_product_name}</strong>
        <small>
          <span>{turn.context.creator_handle}</span>
          <span aria-hidden="true"> · </span>
          <span>{turn.context.caption}</span>
        </small>
      </div>
      <span className="contextInheritedBadge">已继承</span>
    </section>
  );
}

function ClaimEvidence({ turn }: { turn: GuideTurn }) {
  if (turn.context.claims.length === 0) {
    return null;
  }
  const evidenceById = new Map(
    (turn.evidence ?? []).map((item) => [item.evidence_id, item]),
  );
  return (
    <section className="claimsLedger" aria-labelledby="claims-heading">
      <div className="sectionHeading">
        <span>{turn.context.claims.length} 条视频说法</span>
        <h2 id="claims-heading">视频宣称核验</h2>
      </div>
      <div className="claimList">
        {turn.context.claims.map((claim) => {
          const claimEvidence = evidenceById.get(claim.evidence_id);
          return (
            <article
              className="claimRecord"
              data-status={claim.status}
              key={claim.claim_id}
            >
              <span className="claimMarker" aria-hidden="true" />
              <div>
                <p>{claim.text}</p>
                {claimEvidence ? (
                  <EvidenceDisclosure evidence={claimEvidence} />
                ) : (
                  <small>当前没有可进一步展开的来源</small>
                )}
              </div>
              <strong>{claimStatusLabel(claim.status)}</strong>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function StatePanel({
  tone,
  eyebrow,
  title,
  children,
}: {
  tone?: "warning" | "safety" | "neutral";
  eyebrow: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className={`guideStatePanel ${tone ? `guideStatePanel-${tone}` : ""}`}>
      <span>{eyebrow}</span>
      <h2>{title}</h2>
      <div>{children}</div>
    </section>
  );
}

export interface GuideSheetProps {
  open: boolean;
  onClose: () => void;
  contentContextId?: string;
  initialScrollTop?: number;
  onScrollTopChange?: (scrollTop: number) => void;
  onOpenProduct?: (productId: string, role: ProductRole) => void;
}

export function GuideSheet({
  open,
  onClose,
  contentContextId = "morning-routine-uv-001",
  initialScrollTop = 0,
  onScrollTopChange,
  onOpenProduct,
}: GuideSheetProps) {
  const [turn, setTurn] = useState<GuideTurn | null>(null);
  const [showStartingQuestions, setShowStartingQuestions] = useState(true);
  const [input, setInput] = useState("");
  const [pendingLabel, setPendingLabel] = useState<string | null>(null);
  const [transientError, setTransientError] = useState<string | null>(null);
  const [fatalError, setFatalError] = useState<string | null>(null);
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const [comparison, setComparison] = useState<CompareResponse | null>(null);
  const [comparisonPending, setComparisonPending] = useState(false);
  const [comparisonError, setComparisonError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const verifiedTurnRef = useRef<GuideTurn | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const mountedRef = useRef(false);
  const isOpenRef = useRef(false);
  const openCycleRef = useRef(false);
  const requestVersionRef = useRef(0);
  const messageSequenceRef = useRef(0);
  const submittingRef = useRef(false);
  const comparisonPendingRef = useRef(false);
  const comparisonVersionRef = useRef(0);
  const lastContextIdRef = useRef(contentContextId);

  const resetComparison = useCallback(() => {
    comparisonVersionRef.current += 1;
    comparisonPendingRef.current = false;
    setSelectedProductIds([]);
    setComparison(null);
    setComparisonPending(false);
    setComparisonError(null);
  }, []);

  const applyVerifiedTurn = useCallback(
    (nextTurn: GuideTurn, fromNewSession = false) => {
      const previous = verifiedTurnRef.current;
      if (
        previous &&
        (previous.session_id !== nextTurn.session_id ||
          previous.guide_revision !== nextTurn.guide_revision)
      ) {
        resetComparison();
      }
      verifiedTurnRef.current = nextTurn;
      sessionIdRef.current = nextTurn.session_id;
      comparisonPendingRef.current = false;
      setTurn(nextTurn);
      setComparisonPending(false);
      setFatalError(null);
      setTransientError(null);
      if (fromNewSession) {
        setShowStartingQuestions(
          nextTurn.guide_view_kind === "WAITING_CLARIFICATION",
        );
      } else if (nextTurn.guide_view_kind !== "WAITING_CLARIFICATION") {
        setShowStartingQuestions(false);
      }
    },
    [resetComparison],
  );

  const saveScrollPosition = useCallback(() => {
    const scrollTop = bodyRef.current?.scrollTop;
    if (typeof scrollTop === "number" && Number.isFinite(scrollTop)) {
      onScrollTopChange?.(Math.max(0, scrollTop));
    }
  }, [onScrollTopChange]);

  const invalidatePendingRequests = useCallback(() => {
    requestVersionRef.current += 1;
    comparisonVersionRef.current += 1;
    submittingRef.current = false;
    comparisonPendingRef.current = false;
    setPendingLabel(null);
    setComparisonPending(false);
  }, []);

  const handleClose = useCallback(() => {
    saveScrollPosition();
    isOpenRef.current = false;
    openCycleRef.current = false;
    invalidatePendingRequests();
    onClose();
  }, [invalidatePendingRequests, onClose, saveScrollPosition]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (lastContextIdRef.current === contentContextId) {
      return;
    }
    lastContextIdRef.current = contentContextId;
    verifiedTurnRef.current = null;
    sessionIdRef.current = null;
    setTurn(null);
    setShowStartingQuestions(true);
    setInput("");
    resetComparison();
  }, [contentContextId, resetComparison]);

  useEffect(() => {
    if (!open) {
      isOpenRef.current = false;
      openCycleRef.current = false;
      requestVersionRef.current += 1;
      comparisonVersionRef.current += 1;
      submittingRef.current = false;
      comparisonPendingRef.current = false;
      return;
    }
    if (openCycleRef.current) {
      return;
    }

    openCycleRef.current = true;
    isOpenRef.current = true;
    setTransientError(null);
    setFatalError(null);
    const requestVersion = ++requestVersionRef.current;
    const existingSessionId = sessionIdRef.current;
    if (!verifiedTurnRef.current) {
      setPendingLabel("正在读取当前视频和商品…");
    } else {
      setPendingLabel("正在恢复上次已核验结果…");
    }

    const request = existingSessionId
      ? getGuideSession(existingSessionId)
      : createGuideSession(contentContextId, "zh-CN");
    void request
      .then((nextTurn) => {
        if (
          mountedRef.current &&
          isOpenRef.current &&
          requestVersionRef.current === requestVersion
        ) {
          applyVerifiedTurn(nextTurn, !existingSessionId);
        }
      })
      .catch(() => {
        if (
          mountedRef.current &&
          isOpenRef.current &&
          requestVersionRef.current === requestVersion
        ) {
          if (verifiedTurnRef.current) {
            setTransientError(
              "暂时无法刷新，继续显示上次已核验结果。",
            );
          } else {
            setFatalError("导购暂时不可用，请返回 Feed 后重新打开。 ");
          }
        }
      })
      .finally(() => {
        if (
          mountedRef.current &&
          requestVersionRef.current === requestVersion
        ) {
          setPendingLabel(null);
        }
      });
  }, [applyVerifiedTurn, contentContextId, open]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const activeElement = document.activeElement as HTMLElement | null;
    if (!dialogRef.current?.contains(activeElement)) {
      previousFocusRef.current = activeElement;
    }
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();

    return () => {
      document.body.style.overflow = previousOverflow;
      const previousFocus = previousFocusRef.current;
      previousFocusRef.current = null;
      previousFocus?.focus();
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const restore = () => {
      if (bodyRef.current) {
        bodyRef.current.scrollTop = Math.max(0, initialScrollTop);
      }
    };
    if (typeof window.requestAnimationFrame === "function") {
      const frame = window.requestAnimationFrame(restore);
      return () => window.cancelAnimationFrame(frame);
    }
    const timer = window.setTimeout(restore, 0);
    return () => window.clearTimeout(timer);
  }, [initialScrollTop, open, turn?.session_id]);

  const submitMessage = useCallback(
    (rawText: string) => {
      const currentTurn = verifiedTurnRef.current;
      const text = rawText.trim();
      if (!currentTurn || !text || submittingRef.current) {
        return;
      }

      submittingRef.current = true;
      comparisonVersionRef.current += 1;
      comparisonPendingRef.current = false;
      setComparisonPending(false);
      setComparison(null);
      setComparisonError(null);
      setShowStartingQuestions(false);
      setTransientError(null);
      setPendingLabel("正在核验商品事实与视频说法…");
      const requestVersion = ++requestVersionRef.current;
      const messageId = `msg_${currentTurn.session_id}_${++messageSequenceRef.current}`;
      void sendGuideMessage(currentTurn.session_id, messageId, text)
        .then((nextTurn) => {
          if (
            mountedRef.current &&
            isOpenRef.current &&
            requestVersionRef.current === requestVersion
          ) {
            setInput("");
            applyVerifiedTurn(nextTurn);
          }
        })
        .catch(() => {
          if (
            mountedRef.current &&
            isOpenRef.current &&
            requestVersionRef.current === requestVersion
          ) {
            setTransientError(
              "暂时无法完成核验，继续显示上次已核验结果。",
            );
          }
        })
        .finally(() => {
          if (
            mountedRef.current &&
            requestVersionRef.current === requestVersion
          ) {
            submittingRef.current = false;
            setPendingLabel(null);
          }
        });
    },
    [applyVerifiedTurn],
  );

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    submitMessage(input);
  }

  function handleStartingQuestionClick(event: MouseEvent<HTMLButtonElement>) {
    if (event.currentTarget.dataset.firstQuestion === "true") {
      setShowStartingQuestions(false);
      return;
    }
    submitMessage(event.currentTarget.value);
  }

  function handleMessageButtonClick(event: MouseEvent<HTMLButtonElement>) {
    submitMessage(event.currentTarget.value);
  }

  function handleDialogKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      handleClose();
      return;
    }
    if (event.key !== "Tab") {
      return;
    }

    const focusable = Array.from(
      dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), a[href], summary, [tabindex]:not([tabindex="-1"])',
      ) ?? [],
    ).filter((element) => element.getAttribute("aria-hidden") !== "true");
    if (focusable.length === 0) {
      event.preventDefault();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function handleCompareChange(productId: string, selected: boolean) {
    setSelectedProductIds((current) => {
      if (selected) {
        return current.includes(productId) || current.length >= 3
          ? current
          : [...current, productId];
      }
      return current.filter((id) => id !== productId);
    });
    setComparisonError(null);
  }

  function handleCompareProducts() {
    const currentTurn = verifiedTurnRef.current;
    if (
      !currentTurn ||
      !hasAction(currentTurn, "REQUEST_COMPARISON") ||
      selectedProductIds.length < 2 ||
      selectedProductIds.length > 3 ||
      comparisonPendingRef.current
    ) {
      return;
    }
    comparisonPendingRef.current = true;
    setComparisonPending(true);
    setComparisonError(null);
    const version = ++comparisonVersionRef.current;
    const productIds = [...selectedProductIds];
    void compareProducts(currentTurn.session_id, productIds)
      .then((response) => {
        if (
          mountedRef.current &&
          isOpenRef.current &&
          comparisonVersionRef.current === version
        ) {
          setComparison(response);
        }
      })
      .catch(() => {
        if (
          mountedRef.current &&
          isOpenRef.current &&
          comparisonVersionRef.current === version
        ) {
          setComparisonError(
            "比较暂时无法加载，已保留你的候选和上次已核验建议。",
          );
        }
      })
      .finally(() => {
        if (
          mountedRef.current &&
          comparisonVersionRef.current === version
        ) {
          comparisonPendingRef.current = false;
          setComparisonPending(false);
        }
      });
  }

  function openProduct(productId: string, role: ProductRole) {
    saveScrollPosition();
    invalidatePendingRequests();
    onOpenProduct?.(productId, role);
  }

  function retryGuideSnapshot() {
    const currentTurn = verifiedTurnRef.current;
    if (
      !currentTurn ||
      !hasAction(currentTurn, "RETRY_GUIDE_OPERATION") ||
      submittingRef.current
    ) {
      return;
    }
    submittingRef.current = true;
    setPendingLabel("正在恢复上次已核验结果…");
    setTransientError(null);
    const requestVersion = ++requestVersionRef.current;
    void getGuideSession(currentTurn.session_id)
      .then((nextTurn) => {
        if (
          mountedRef.current &&
          isOpenRef.current &&
          requestVersionRef.current === requestVersion
        ) {
          applyVerifiedTurn(nextTurn);
        }
      })
      .catch(() => {
        if (
          mountedRef.current &&
          isOpenRef.current &&
          requestVersionRef.current === requestVersion
        ) {
          setTransientError(
            "暂时无法恢复，继续显示上次已核验结果。",
          );
        }
      })
      .finally(() => {
        if (
          mountedRef.current &&
          requestVersionRef.current === requestVersion
        ) {
          submittingRef.current = false;
          setPendingLabel(null);
        }
      });
  }

  if (!open) {
    return null;
  }

  const isSubmitting = Boolean(pendingLabel);
  const recommendations = (turn?.recommendations ?? []).slice(0, 3);
  const evidenceById = new Map(
    (turn?.evidence ?? []).map((item) => [item.evidence_id, item]),
  );
  const productNames = Object.fromEntries(
    recommendations.map((item) => [item.product_id, item.name]),
  );

  function renderComposer(currentTurn: GuideTurn) {
    if (!hasAction(currentTurn, "UPDATE_CONSTRAINTS")) {
      return null;
    }
    return (
      <form className="guideComposer" onSubmit={handleSubmit}>
        <label>
          <span>补充你的条件</span>
          <input
            type="text"
            value={input}
            disabled={isSubmitting}
            placeholder="例如：油敏皮、深肤色、去夏威夷，预算 30 美元以内"
            onChange={(event) => setInput(event.target.value)}
          />
        </label>
        <button type="submit" disabled={isSubmitting || !input.trim()}>
          {isSubmitting ? "正在核验" : "发送"}
        </button>
      </form>
    );
  }

  function renderDecision(currentTurn: GuideTurn) {
    const verdict = currentTurn.verdict ?? "INSUFFICIENT_EVIDENCE";
    const comparisonEnabled = hasAction(
      currentTurn,
      "REQUEST_COMPARISON",
    );
    const productOpeningEnabled = hasAction(currentTurn, "OPEN_PRODUCT");

    if (comparison) {
      return (
        <section className="guideComparisonView">
          <ComparisonTable
            comparison={comparison}
            productNames={productNames}
            anchorProductId={currentTurn.context.anchor_product_id}
            onOpenProduct={productOpeningEnabled ? openProduct : undefined}
          />
          <button
            type="button"
            className="secondaryDecisionButton"
            onClick={() => setComparison(null)}
          >
            返回推荐
          </button>
        </section>
      );
    }

    return (
      <>
        <section className="decisionVerdict" data-verdict={verdict}>
          <span>AI 决策 · 基于已验证资料</span>
          <h2>{verdictLabels[verdict]}</h2>
          <p>{currentTurn.text}</p>
          {currentTurn.degraded ? (
            <small>已使用确定性降级文案，商品与证据结构未变化</small>
          ) : null}
        </section>
        <section className="recommendationSection" aria-labelledby="recommendations-heading">
          <div className="sectionHeading">
            <span>最多 3 款</span>
            <h2 id="recommendations-heading">商品建议</h2>
          </div>
          <div className="recommendationGrid">
            {recommendations.map((recommendation, index) => {
              const role: ProductRole =
                recommendation.product_id ===
                currentTurn.context.anchor_product_id
                  ? "current"
                  : "alternative";
              return (
                <RecommendationCard
                  key={recommendation.product_id}
                  recommendation={recommendation}
                  index={index}
                  role={role}
                  evidence={recommendation.evidence_ids.flatMap((evidenceId) => {
                    const item = evidenceById.get(evidenceId);
                    return item ? [item] : [];
                  })}
                  comparisonEnabled={comparisonEnabled}
                  selectedForCompare={selectedProductIds.includes(
                    recommendation.product_id,
                  )}
                  compareDisabled={
                    selectedProductIds.length >= 3 &&
                    !selectedProductIds.includes(recommendation.product_id)
                  }
                  onCompareChange={handleCompareChange}
                  onOpenProduct={
                    productOpeningEnabled ? openProduct : undefined
                  }
                />
              );
            })}
          </div>
          {comparisonEnabled ? (
            <div className="decisionActions" aria-label="比较操作">
              <button
                type="button"
                disabled={
                  selectedProductIds.length < 2 ||
                  selectedProductIds.length > 3 ||
                  comparisonPending
                }
                onClick={handleCompareProducts}
              >
                {comparisonPending
                  ? "正在生成比较"
                  : `比较已选 ${selectedProductIds.length} 款`}
              </button>
            </div>
          ) : null}
          {comparisonError ? (
            <div className="guideInlineError" role="alert">
              {comparisonError}
            </div>
          ) : null}
        </section>
        <ClaimEvidence turn={currentTurn} />
        {renderComposer(currentTurn)}
      </>
    );
  }

  function renderView(currentTurn: GuideTurn) {
    if (
      currentTurn.guide_view_kind === "WAITING_CLARIFICATION" &&
      showStartingQuestions
    ) {
      const canAnswer = hasAction(currentTurn, "ANSWER_CLARIFICATION");
      return (
        <>
          <section className="guideStartingQuestions">
            <span>从一个问题开始</span>
            <h2>你最想先确认什么？</h2>
            <div>
              {STARTING_QUESTIONS.map((question, index) => (
                <button
                  type="button"
                  key={question}
                  value={question}
                  data-first-question={index === 0 ? "true" : "false"}
                  disabled={isSubmitting || !canAnswer}
                  onClick={handleStartingQuestionClick}
                >
                  <span aria-hidden="true">{index + 1}</span>
                  {question}
                </button>
              ))}
            </div>
          </section>
          {renderComposer(currentTurn)}
        </>
      );
    }

    switch (currentTurn.guide_view_kind) {
      case "OPENING_CONTEXT":
        return (
          <StatePanel
            tone="neutral"
            eyebrow="上下文读取中"
            title="正在读取当前视频和商品"
          >
            <p>{currentTurn.text}</p>
          </StatePanel>
        );
      case "CONTEXT_CONFIRMATION":
        return (
          <StatePanel eyebrow="需要你的确认" title="请确认视频中的商品">
            <p>{currentTurn.text}</p>
            {hasAction(currentTurn, "CONFIRM_CONTEXT") ? (
              <button
                type="button"
                className="primaryDecisionButton"
                value="确认是视频里的商品"
                disabled={isSubmitting}
                onClick={handleMessageButtonClick}
              >
                确认是这款商品
              </button>
            ) : null}
          </StatePanel>
        );
      case "WAITING_CLARIFICATION": {
        const canAnswer = hasAction(currentTurn, "ANSWER_CLARIFICATION");
        const canSkip = hasAction(currentTurn, "SKIP_CLARIFICATION");
        return (
          <>
            <section className="clarificationView">
              <span>只问一个会改变结果的问题</span>
              <h2>{currentTurn.text}</h2>
              <div className="clarificationChoices">
                {(currentTurn.quick_replies ?? []).slice(0, 4).map((reply) => {
                  const isSkip = reply === "跳过";
                  if ((isSkip && !canSkip) || (!isSkip && !canAnswer)) {
                    return null;
                  }
                  return (
                    <button
                      key={reply}
                      type="button"
                      value={reply}
                      disabled={isSubmitting}
                      onClick={handleMessageButtonClick}
                    >
                      {reply}
                    </button>
                  );
                })}
              </div>
              <small>跳过按日常通勤继续，不会暗中添加防水硬约束。</small>
            </section>
            {renderComposer(currentTurn)}
          </>
        );
      }
      case "VERIFYING_FACTS":
        return (
          <StatePanel
            tone="neutral"
            eyebrow="可验证进度"
            title="正在核验商品事实与视频说法"
          >
            <p>{currentTurn.text}</p>
          </StatePanel>
        );
      case "DECISION_READY":
        return renderDecision(currentTurn);
      case "NO_MATCH":
        return (
          <StatePanel
            tone="warning"
            eyebrow="硬性条件未被放宽"
            title="没有找到同时满足条件的商品"
          >
            <p>{currentTurn.text}</p>
            {hasAction(currentTurn, "RELAX_CONSTRAINT") ? (
              <button
                type="button"
                className="primaryDecisionButton"
                value="防水不限"
                disabled={isSubmitting}
                onClick={handleMessageButtonClick}
              >
                放宽防水要求
              </button>
            ) : null}
          </StatePanel>
        );
      case "INSUFFICIENT_EVIDENCE":
        return (
          <>
            <StatePanel
              tone="warning"
              eyebrow="事实与未知项分开显示"
              title="当前证据不足"
            >
              <p>{currentTurn.text}</p>
              {hasAction(currentTurn, "CONTINUE_WITH_KNOWN") ? (
                <button
                  type="button"
                  className="primaryDecisionButton"
                  value="继续使用已知信息"
                  disabled={isSubmitting}
                  onClick={handleMessageButtonClick}
                >
                  仅基于已知信息继续
                </button>
              ) : null}
            </StatePanel>
            {recommendations.length > 0 && hasAction(currentTurn, "OPEN_PRODUCT") ? (
              <section className="recommendationGrid insufficientCandidates">
                {recommendations.map((recommendation, index) => (
                  <RecommendationCard
                    key={recommendation.product_id}
                    recommendation={recommendation}
                    index={index}
                    role={
                      recommendation.product_id ===
                      currentTurn.context.anchor_product_id
                        ? "current"
                        : "alternative"
                    }
                    evidence={recommendation.evidence_ids.flatMap((id) => {
                      const item = evidenceById.get(id);
                      return item ? [item] : [];
                    })}
                    comparisonEnabled={false}
                    selectedForCompare={false}
                    onCompareChange={handleCompareChange}
                    onOpenProduct={openProduct}
                  />
                ))}
              </section>
            ) : null}
            <ClaimEvidence turn={currentTurn} />
          </>
        );
      case "COMPARISON_READY":
        return (
          <StatePanel
            tone="neutral"
            eyebrow="候选列表已替换"
            title="比较结果"
          >
            <p>{currentTurn.text}</p>
            <small>比较数据若不可用，不回退显示未经核验的候选事实。</small>
          </StatePanel>
        );
      case "SAFE_BOUNDARY":
        return (
          <StatePanel
            tone="safety"
            eyebrow="只提供商品事实帮助"
            title="安全边界"
          >
            <p>{currentTurn.text}</p>
          </StatePanel>
        );
      case "RECOVERY_REQUIRED":
        return (
          <StatePanel
            tone="warning"
            eyebrow="保留上次已验证结果"
            title="需要恢复导购"
          >
            <p>{currentTurn.text}</p>
            {hasAction(currentTurn, "RETRY_GUIDE_OPERATION") ? (
              <button
                type="button"
                className="primaryDecisionButton"
                disabled={isSubmitting}
                onClick={retryGuideSnapshot}
              >
                重试恢复
              </button>
            ) : null}
          </StatePanel>
        );
      case "FATAL_ERROR":
        return (
          <StatePanel
            tone="warning"
            eyebrow="不可恢复错误"
            title="导购暂时不可用"
          >
            <p>{currentTurn.text}</p>
          </StatePanel>
        );
    }
  }

  return (
    <div className="guideBackdrop">
      <div
        ref={dialogRef}
        className="guideSheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="guide-title"
        onKeyDown={handleDialogKeyDown}
      >
        <header className="guideHeader">
          <span className="sheetHandle" aria-hidden="true" />
          <div>
            <span>关于视频中的商品</span>
            <h1 id="guide-title">AI 导购（概念）</h1>
          </div>
          <button
            ref={closeRef}
            className="guideClose"
            type="button"
            aria-label="关闭 AI 导购"
            onClick={handleClose}
          >
            <span aria-hidden="true">×</span>
          </button>
        </header>

        <div
          ref={bodyRef}
          className="guideBody"
          role="region"
          aria-label="AI 导购内容"
          onScroll={(event) =>
            onScrollTopChange?.(event.currentTarget.scrollTop)
          }
        >
          {turn ? <ContextMiniCard turn={turn} /> : null}

          <div className="guideConceptDisclosure">
            <span aria-hidden="true">AI</span>
            <p>
              <strong>基于合成商品数据和公开资料快照</strong>
              <small>未接入真实 TikTok、开放域大模型或支付</small>
            </p>
          </div>

          {pendingLabel ? (
            <div className="guideProgress" role="status" aria-live="polite">
              <span className="statusPulse" aria-hidden="true" />
              {pendingLabel}
            </div>
          ) : null}
          {transientError ? (
            <div className="guideInlineError" role="alert">
              {transientError}
            </div>
          ) : null}

          {fatalError ? (
            <StatePanel
              tone="warning"
              eyebrow="无法建立导购会话"
              title="导购暂时不可用"
            >
              <p>{fatalError}</p>
            </StatePanel>
          ) : turn ? (
            renderView(turn)
          ) : !pendingLabel ? (
            <StatePanel
              tone="neutral"
              eyebrow="上下文读取中"
              title="正在读取当前视频和商品"
            >
              <p>正在建立受控导购会话。</p>
            </StatePanel>
          ) : null}
        </div>

        <footer className="sheetFooter">
          <span>交易市场：美国 · 演示语言：简体中文</span>
          <strong>AI 可能出错，请以商品标签与 PDP 复核为准</strong>
        </footer>
      </div>
    </div>
  );
}
