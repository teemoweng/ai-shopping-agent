"use client";

import type { components } from "@shopping-guide/contracts/src/api";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import type { FormEvent, KeyboardEvent } from "react";

import { CartConfirmation } from "@/components/cart-confirmation";
import { ComparisonTable } from "@/components/comparison-table";
import { RecommendationCard } from "@/components/recommendation-card";
import {
  ApiError,
  addCartItem,
  compareProducts,
  createGuideSession,
  previewCart,
  sendGuideMessage,
} from "@/lib/api-client";
import {
  validateCartItemResponse,
  validateComparisonResponse,
} from "@/lib/decision-contracts";

type GuideTurn = components["schemas"]["GuideTurnResponse"];
type EvidenceStatus = components["schemas"]["EvidenceStatus"];
type CompareResponse = components["schemas"]["CompareResponse"];
type CartPreviewResponse = components["schemas"]["CartPreviewResponse"];
type CartItemResponse = components["schemas"]["CartItemResponse"];

type GuideUiState =
  | { status: "opening" }
  | { status: "clarification"; turn: GuideTurn }
  | { status: "submitting"; turn: GuideTurn }
  | { status: "recommendation"; turn: GuideTurn }
  | { status: "no_match"; turn: GuideTurn }
  | { status: "safety_boundary"; turn: GuideTurn }
  | { status: "error"; message: string; turn?: GuideTurn };

const claimStatusLabels = {
  SUPPORTED: "Supported by source",
  CONFLICTING: "Conflicts with source",
  INSUFFICIENT_EVIDENCE: "Not enough evidence",
  SUBJECTIVE_MIXED: "Mixed subjective reports",
} satisfies Record<EvidenceStatus, string>;

export function claimStatusLabel(status: EvidenceStatus) {
  return claimStatusLabels[status];
}

function uiStateFromTurn(turn: GuideTurn): GuideUiState {
  switch (turn.kind) {
    case "opening":
    case "clarification":
      return { status: "clarification", turn };
    case "recommendation":
      return { status: "recommendation", turn };
    case "no_match":
      return { status: "no_match", turn };
    case "safety_boundary":
      return { status: "safety_boundary", turn };
  }
}

function turnFromState(state: GuideUiState) {
  return "turn" in state ? state.turn : undefined;
}

function defaultSkuForTurn(turn: GuideTurn) {
  if (turn.kind !== "recommendation") {
    return null;
  }
  const eligibleSkuIds = (turn.recommendations ?? []).flatMap(
    (recommendation) => recommendation.eligible_sku_ids,
  );
  return eligibleSkuIds[0] ?? null;
}

function decisionErrorCode(error: unknown) {
  return error instanceof ApiError ? error.code : "UNKNOWN_API_ERROR";
}

function previewRecoveryMessage(errorCode: string) {
  if (errorCode === "INSUFFICIENT_STOCK") {
    return "This size no longer has enough stock. Choose another size and preview again.";
  }
  if (errorCode === "SKU_NOT_RECOMMENDED") {
    return "This size is no longer eligible. Choose another recommended size and preview again.";
  }
  return "Current price and stock could not be checked. Keep this size selected and try previewing again.";
}

function recommendationSummary(text: string) {
  return text.replace(/closest fit/gi, "best overall match");
}

function noMatchSummary(text: string) {
  return text.replace(/change one requirement/gi, "adjust one must-have");
}

function sourceHost(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "public source";
  }
}

function EvidenceList({ turn }: { turn: GuideTurn }) {
  const evidence = turn.evidence ?? [];
  if (evidence.length === 0) {
    return null;
  }

  return (
    <section className="evidencePanel" aria-labelledby="evidence-heading">
      <div className="sectionHeading">
        <span>Decision sources</span>
        <h2 id="evidence-heading">Evidence used</h2>
      </div>
      <div className="evidenceList">
        {evidence.map((item) =>
          item.source_kind === "public_rule" && !item.synthetic ? (
            <article className="evidenceRecord" key={item.evidence_id}>
              <span className="evidenceKind">Public rule · {sourceHost(item.url)}</span>
              <a href={item.url} target="_blank" rel="noopener noreferrer">
                {item.title}
                <span aria-hidden="true"> ↗</span>
              </a>
              <p>{item.summary}</p>
            </article>
          ) : (
            <article
              className="evidenceRecord syntheticEvidence"
              key={item.evidence_id}
            >
              <span className="evidenceKind">Synthetic benchmark</span>
              <strong>{item.title}</strong>
              <p>{item.summary}</p>
              <small>Prototype benchmark · Not external user research</small>
            </article>
          ),
        )}
      </div>
    </section>
  );
}

export function GuideSheet({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [uiState, setUiState] = useState<GuideUiState>({ status: "opening" });
  const [input, setInput] = useState("");
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const [selectedSkuId, setSelectedSkuId] = useState<string | null>(null);
  const [comparison, setComparison] = useState<CompareResponse | null>(null);
  const [preview, setPreview] = useState<CartPreviewResponse | null>(null);
  const [cartItem, setCartItem] = useState<CartItemResponse | null>(null);
  const [comparisonPending, setComparisonPending] = useState(false);
  const [previewPending, setPreviewPending] = useState(false);
  const [cartPending, setCartPending] = useState(false);
  const [comparisonError, setComparisonError] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [cartErrorCode, setCartErrorCode] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const openCycleRef = useRef(false);
  const isOpenRef = useRef(false);
  const mountedRef = useRef(false);
  const requestVersionRef = useRef(0);
  const messageSequenceRef = useRef(0);
  const submittingRef = useRef(false);
  const decisionGenerationRef = useRef(0);
  const selectedProductIdsRef = useRef<string[]>([]);
  const selectedSkuIdRef = useRef<string | null>(null);
  const comparisonVersionRef = useRef(0);
  const previewVersionRef = useRef(0);
  const cartVersionRef = useRef(0);
  const comparisonPendingRef = useRef(false);
  const previewPendingRef = useRef(false);
  const cartPendingRef = useRef(false);

  const resetDecisionArtifacts = useCallback((turn?: GuideTurn) => {
    decisionGenerationRef.current += 1;
    comparisonVersionRef.current += 1;
    previewVersionRef.current += 1;
    cartVersionRef.current += 1;
    comparisonPendingRef.current = false;
    previewPendingRef.current = false;
    cartPendingRef.current = false;
    selectedProductIdsRef.current = [];
    const nextSkuId = turn ? defaultSkuForTurn(turn) : null;
    selectedSkuIdRef.current = nextSkuId;

    setSelectedProductIds([]);
    setSelectedSkuId(nextSkuId);
    setComparison(null);
    setPreview(null);
    setCartItem(null);
    setComparisonPending(false);
    setPreviewPending(false);
    setCartPending(false);
    setComparisonError(null);
    setPreviewError(null);
    setCartErrorCode(null);
  }, []);

  const invalidateDecisionRequests = useCallback(() => {
    decisionGenerationRef.current += 1;
    comparisonVersionRef.current += 1;
    previewVersionRef.current += 1;
    cartVersionRef.current += 1;
    comparisonPendingRef.current = false;
    previewPendingRef.current = false;
    cartPendingRef.current = false;
    setComparisonPending(false);
    setPreviewPending(false);
    setCartPending(false);
  }, []);

  const handleClose = useCallback(() => {
    isOpenRef.current = false;
    openCycleRef.current = false;
    submittingRef.current = false;
    requestVersionRef.current += 1;
    resetDecisionArtifacts();
    setUiState({ status: "opening" });
    setInput("");
    onClose();
  }, [onClose, resetDecisionArtifacts]);

  const applyTurn = useCallback((turn: GuideTurn) => {
    resetDecisionArtifacts(turn);
    setUiState(uiStateFromTurn(turn));
  }, [resetDecisionArtifacts]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!open) {
      isOpenRef.current = false;
      openCycleRef.current = false;
      requestVersionRef.current += 1;
      submittingRef.current = false;
      decisionGenerationRef.current += 1;
      comparisonVersionRef.current += 1;
      previewVersionRef.current += 1;
      cartVersionRef.current += 1;
      comparisonPendingRef.current = false;
      previewPendingRef.current = false;
      cartPendingRef.current = false;
      return;
    }
    if (openCycleRef.current) {
      return;
    }

    openCycleRef.current = true;
    isOpenRef.current = true;
    resetDecisionArtifacts();
    setUiState({ status: "opening" });
    setInput("");
    const requestVersion = ++requestVersionRef.current;
    void createGuideSession("morning-routine-uv-001")
      .then((turn) => {
        if (
          mountedRef.current &&
          isOpenRef.current &&
          requestVersionRef.current === requestVersion
        ) {
          applyTurn(turn);
        }
      })
      .catch(() => {
        if (
          mountedRef.current &&
          isOpenRef.current &&
          requestVersionRef.current === requestVersion
        ) {
          setUiState({
            status: "error",
            message:
              "The guide could not load product context. Close the guide and try again.",
          });
        }
      });
  }, [applyTurn, open, resetDecisionArtifacts]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();

    return () => {
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, [open]);

  const submitMessage = useCallback(
    (rawText: string) => {
      const text = rawText.trim();
      const turn = turnFromState(uiState);
      if (!text || !turn || submittingRef.current) {
        return;
      }

      submittingRef.current = true;
      invalidateDecisionRequests();
      setUiState({ status: "submitting", turn });
      const requestVersion = ++requestVersionRef.current;
      const messageId = `msg_${turn.session_id}_${++messageSequenceRef.current}`;
      void sendGuideMessage(turn.session_id, messageId, text)
        .then((nextTurn) => {
          if (
            mountedRef.current &&
            isOpenRef.current &&
            requestVersionRef.current === requestVersion
          ) {
            setInput("");
            applyTurn(nextTurn);
          }
        })
        .catch(() => {
          if (
            mountedRef.current &&
            isOpenRef.current &&
            requestVersionRef.current === requestVersion
          ) {
            setUiState({
              status: "error",
              turn,
              message:
                "Product facts could not be checked. Close the guide and try again.",
            });
          }
        })
        .finally(() => {
          if (
            mountedRef.current &&
            requestVersionRef.current === requestVersion
          ) {
            submittingRef.current = false;
          }
        });
    },
    [applyTurn, invalidateDecisionRequests, uiState],
  );

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    submitMessage(input);
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
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), a[href]',
      ) ?? [],
    );
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
    const current = selectedProductIdsRef.current;
    if (selected && (current.includes(productId) || current.length >= 3)) {
      return;
    }
    const next = selected
      ? [...current, productId]
      : current.filter((id) => id !== productId);
    if (next.length === current.length && next.every((id, index) => id === current[index])) {
      return;
    }

    selectedProductIdsRef.current = next;
    comparisonVersionRef.current += 1;
    comparisonPendingRef.current = false;
    setSelectedProductIds(next);
    setComparison(null);
    setComparisonPending(false);
    setComparisonError(null);
  }

  function handleSelectedSkuChange(skuId: string | null) {
    const turn = turnFromState(uiState);
    const eligibleSkuIds =
      turn?.kind === "recommendation"
        ? (turn.recommendations ?? []).flatMap(
            (recommendation) => recommendation.eligible_sku_ids,
          )
        : [];
    const validatedSkuId =
      skuId && eligibleSkuIds.includes(skuId) ? skuId : null;
    if (selectedSkuIdRef.current === validatedSkuId) {
      return;
    }
    selectedSkuIdRef.current = validatedSkuId;
    previewVersionRef.current += 1;
    cartVersionRef.current += 1;
    previewPendingRef.current = false;
    cartPendingRef.current = false;
    setSelectedSkuId(validatedSkuId);
    setPreview(null);
    setCartItem(null);
    setPreviewPending(false);
    setCartPending(false);
    setPreviewError(null);
    setCartErrorCode(null);
  }

  function handleCompareProducts() {
    const ids = selectedProductIdsRef.current;
    const turn = turnFromState(uiState);
    if (
      !turn ||
      ids.length < 2 ||
      ids.length > 3 ||
      comparisonPendingRef.current
    ) {
      return;
    }

    comparisonPendingRef.current = true;
    setComparisonPending(true);
    setComparisonError(null);
    const generation = decisionGenerationRef.current;
    const operationVersion = ++comparisonVersionRef.current;
    void compareProducts(turn.session_id, [...ids])
      .then((response) => {
        if (
          mountedRef.current &&
          isOpenRef.current &&
          decisionGenerationRef.current === generation &&
          comparisonVersionRef.current === operationVersion
        ) {
          const validatedResponse = validateComparisonResponse(
            response,
            turn.session_id,
            ids,
          );
          if (validatedResponse) {
            setComparison(validatedResponse);
          } else {
            setComparison(null);
            setComparisonError("INVALID_COMPARISON_RESPONSE");
          }
        }
      })
      .catch((error: unknown) => {
        if (
          mountedRef.current &&
          isOpenRef.current &&
          decisionGenerationRef.current === generation &&
          comparisonVersionRef.current === operationVersion
        ) {
          setComparisonError(decisionErrorCode(error));
        }
      })
      .finally(() => {
        if (
          mountedRef.current &&
          decisionGenerationRef.current === generation &&
          comparisonVersionRef.current === operationVersion
        ) {
          comparisonPendingRef.current = false;
          setComparisonPending(false);
        }
      });
  }

  function handlePreviewCart() {
    const skuId = selectedSkuIdRef.current;
    const turn = turnFromState(uiState);
    if (!turn || !skuId || previewPendingRef.current) {
      return;
    }

    previewPendingRef.current = true;
    cartVersionRef.current += 1;
    cartPendingRef.current = false;
    setPreview(null);
    setCartItem(null);
    setPreviewPending(true);
    setCartPending(false);
    setPreviewError(null);
    setCartErrorCode(null);
    const generation = decisionGenerationRef.current;
    const operationVersion = ++previewVersionRef.current;
    void previewCart(turn.session_id, skuId)
      .then((response) => {
        if (
          mountedRef.current &&
          isOpenRef.current &&
          decisionGenerationRef.current === generation &&
          previewVersionRef.current === operationVersion &&
          selectedSkuIdRef.current === skuId
        ) {
          setPreview(response);
        }
      })
      .catch((error: unknown) => {
        if (
          mountedRef.current &&
          isOpenRef.current &&
          decisionGenerationRef.current === generation &&
          previewVersionRef.current === operationVersion &&
          selectedSkuIdRef.current === skuId
        ) {
          setPreviewError(decisionErrorCode(error));
        }
      })
      .finally(() => {
        if (
          mountedRef.current &&
          decisionGenerationRef.current === generation &&
          previewVersionRef.current === operationVersion
        ) {
          previewPendingRef.current = false;
          setPreviewPending(false);
        }
      });
  }

  function handleConfirmCart(confirmationToken: string) {
    const turn = turnFromState(uiState);
    if (!turn || !preview || cartPendingRef.current) {
      return;
    }

    cartPendingRef.current = true;
    setCartPending(true);
    setCartErrorCode(null);
    const generation = decisionGenerationRef.current;
    const previewVersion = previewVersionRef.current;
    const operationVersion = ++cartVersionRef.current;
    void addCartItem(turn.session_id, confirmationToken)
      .then((response) => {
        if (
          mountedRef.current &&
          isOpenRef.current &&
          decisionGenerationRef.current === generation &&
          previewVersionRef.current === previewVersion &&
          cartVersionRef.current === operationVersion
        ) {
          const validatedResponse = validateCartItemResponse(response, {
            sessionId: turn.session_id,
            skuId: preview.sku_id,
            quantity: preview.quantity,
            unitPriceUsd: preview.unit_price_usd,
          });
          if (validatedResponse) {
            setCartItem(validatedResponse);
          } else {
            setCartItem(null);
            setCartErrorCode("INVALID_CART_ITEM_RESPONSE");
          }
        }
      })
      .catch((error: unknown) => {
        if (
          mountedRef.current &&
          isOpenRef.current &&
          decisionGenerationRef.current === generation &&
          previewVersionRef.current === previewVersion &&
          cartVersionRef.current === operationVersion
        ) {
          setCartErrorCode(decisionErrorCode(error));
        }
      })
      .finally(() => {
        if (
          mountedRef.current &&
          decisionGenerationRef.current === generation &&
          previewVersionRef.current === previewVersion &&
          cartVersionRef.current === operationVersion
        ) {
          cartPendingRef.current = false;
          setCartPending(false);
        }
      });
  }

  if (!open) {
    return null;
  }

  const turn = turnFromState(uiState);
  const isSubmitting = uiState.status === "submitting";
  const anchorNameIsVisibleInRecommendations =
    uiState.status === "recommendation" &&
    (uiState.turn.recommendations ?? []).some(
      (recommendation) =>
        recommendation.product_id === uiState.turn.context.anchor_product_id &&
        recommendation.name.includes(uiState.turn.context.anchor_product_name),
    );

  return (
    <div
      className="guideBackdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          handleClose();
        }
      }}
    >
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
            <span>Evidence-led decision sheet</span>
            <h1 id="guide-title">AI shopping guide</h1>
          </div>
          <button
            ref={closeRef}
            className="guideClose"
            type="button"
            aria-label="Close AI shopping guide"
            onClick={handleClose}
          >
            <span aria-hidden="true">×</span>
          </button>
        </header>

        <div className="guideBody">
          {turn ? (
            <section className="contextStrip" aria-label="Inherited video context">
              <div>
                <span>Creator</span>
                <strong>{turn.context.creator_handle}</strong>
              </div>
              <div>
                <span>Inherited product</span>
                <strong>
                  {anchorNameIsVisibleInRecommendations
                    ? "Video anchor"
                    : turn.context.anchor_product_name}
                </strong>
                <small>{turn.context.anchor_product_id}</small>
              </div>
              <p>{turn.context.caption}</p>
            </section>
          ) : null}

          <div className="assistantStatus" aria-live="polite" aria-atomic="true">
            {uiState.status === "opening" ? (
              <div className="openingState">
                <span className="statusPulse" aria-hidden="true" />
                <p>Guide opening…</p>
              </div>
            ) : null}
            {turn &&
            uiState.status !== "no_match" &&
            uiState.status !== "safety_boundary" ? (
              <div className="decisionPrompt">
                <span>{isSubmitting ? "Checking product facts…" : "One clarification"}</span>
                <p>
                  {uiState.status === "recommendation"
                    ? recommendationSummary(turn.text)
                    : turn.text}
                </p>
              </div>
            ) : null}
            {uiState.status === "no_match" ? (
              <section className="errorPanel noMatchPanel">
                <span>Hard constraints preserved</span>
                <h2>Change one requirement</h2>
                <p>{noMatchSummary(uiState.turn.text)}</p>
              </section>
            ) : null}
            {uiState.status === "safety_boundary" ? (
              <section className="errorPanel safetyPanel">
                <span>Product guidance only</span>
                <h2>Safety boundary</h2>
                <p>{uiState.turn.text}</p>
              </section>
            ) : null}
            {uiState.status === "error" ? (
              <section className="errorPanel">
                <span>Facts unavailable</span>
                <h2>Guide unavailable</h2>
                <p>{uiState.message}</p>
              </section>
            ) : null}
          </div>

          {turn ? (
            <section className="claimsLedger" aria-labelledby="claims-heading">
              <div className="sectionHeading">
                <span>{turn.context.claims.length} inherited claims</span>
                <h2 id="claims-heading">Creator claims checked</h2>
              </div>
              <div className="claimList">
                {turn.context.claims.map((claim) => (
                  <article
                    className="claimRecord"
                    data-status={claim.status}
                    key={claim.claim_id}
                  >
                    <span className="claimMarker" aria-hidden="true" />
                    <p>{claim.text}</p>
                    <strong>{claimStatusLabel(claim.status)}</strong>
                  </article>
                ))}
              </div>
            </section>
          ) : null}

          {turn && uiState.status !== "error" ? (
            <form className="guideComposer" onSubmit={handleSubmit}>
              {(turn.quick_replies ?? []).length > 0 ? (
                <div className="quickReplies" aria-label="Quick replies">
                  {(turn.quick_replies ?? []).map((reply) => (
                    <button
                      key={reply}
                      type="button"
                      disabled={isSubmitting}
                      onClick={() => submitMessage(reply)}
                    >
                      {reply}
                    </button>
                  ))}
                </div>
              ) : null}
              <label>
                <span>Your must-haves</span>
                <input
                  type="text"
                  value={input}
                  disabled={isSubmitting}
                  placeholder="Budget, fragrance, finish, water resistance…"
                  onChange={(event) => setInput(event.target.value)}
                />
              </label>
              <button type="submit" disabled={isSubmitting || !input.trim()}>
                {isSubmitting ? "Checking…" : "Find my match"}
              </button>
            </form>
          ) : (
            <label className="openingInput">
              <span>Your must-haves</span>
              <input type="text" disabled />
            </label>
          )}

          {uiState.status === "recommendation" ? (
            <section className="recommendationSection" aria-labelledby="recommendations-heading">
              <div className="sectionHeading">
                <span>Structured product facts</span>
                <h2 id="recommendations-heading">Product choices</h2>
              </div>
              <div className="recommendationGrid">
                {(uiState.turn.recommendations ?? []).map(
                  (recommendation, index) => (
                    <RecommendationCard
                      key={recommendation.product_id}
                      recommendation={recommendation}
                      index={index}
                      selectedSkuId={selectedSkuId}
                      onSelectedSkuChange={handleSelectedSkuChange}
                      selectedForCompare={selectedProductIds.includes(
                        recommendation.product_id,
                      )}
                      compareDisabled={
                        selectedProductIds.length >= 3 &&
                        !selectedProductIds.includes(recommendation.product_id)
                      }
                      onCompareChange={handleCompareChange}
                    />
                  ),
                )}
              </div>
              <div className="decisionActions" aria-label="Decision actions">
                <button
                  type="button"
                  disabled={
                    selectedProductIds.length < 2 ||
                    selectedProductIds.length > 3 ||
                    comparisonPending
                  }
                  onClick={handleCompareProducts}
                >
                  Compare {selectedProductIds.length}
                </button>
                <button
                  type="button"
                  disabled={!selectedSkuId || previewPending}
                  onClick={handlePreviewCart}
                >
                  Preview simulated add
                </button>
              </div>
              {comparisonError ? (
                <div className="decisionRecovery" role="alert">
                  <p>
                    {comparisonError === "INVALID_COMPARISON_RESPONSE"
                      ? "Comparison data was incomplete. Keep your selections and try comparing again."
                      : "Comparison could not be loaded. Keep your selections and try comparing again."}
                  </p>
                </div>
              ) : null}
              {comparison ? <ComparisonTable comparison={comparison} /> : null}
              {previewError ? (
                <div className="decisionRecovery" role="alert">
                  <p>{previewRecoveryMessage(previewError)}</p>
                </div>
              ) : null}
              {preview ? (
                <CartConfirmation
                  preview={preview}
                  cartItem={cartItem}
                  pending={cartPending}
                  previewPending={previewPending}
                  errorCode={cartErrorCode}
                  onConfirm={handleConfirmCart}
                  onPreviewAgain={handlePreviewCart}
                />
              ) : null}
            </section>
          ) : null}

          {turn ? <EvidenceList turn={turn} /> : null}
        </div>

        <footer className="sheetFooter">
          <span>Concept prototype · Synthetic products</span>
          <strong>AI can make mistakes · Check product labels</strong>
        </footer>
      </div>
    </div>
  );
}
