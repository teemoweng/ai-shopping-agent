"use client";

import type { components } from "@shopping-guide/contracts/src/api";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import type { FormEvent, KeyboardEvent } from "react";

import { RecommendationCard } from "@/components/recommendation-card";
import { createGuideSession, sendGuideMessage } from "@/lib/api-client";

type GuideTurn = components["schemas"]["GuideTurnResponse"];
type EvidenceStatus = components["schemas"]["EvidenceStatus"];

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
  const [compareIds, setCompareIds] = useState<Set<string>>(() => new Set());
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const openCycleRef = useRef(false);
  const isOpenRef = useRef(false);
  const requestVersionRef = useRef(0);
  const messageSequenceRef = useRef(0);
  const submittingRef = useRef(false);

  const handleClose = useCallback(() => {
    isOpenRef.current = false;
    openCycleRef.current = false;
    submittingRef.current = false;
    requestVersionRef.current += 1;
    setUiState({ status: "opening" });
    setInput("");
    setCompareIds(new Set());
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (!open) {
      isOpenRef.current = false;
      openCycleRef.current = false;
      requestVersionRef.current += 1;
      submittingRef.current = false;
      return;
    }
    if (openCycleRef.current) {
      return;
    }

    openCycleRef.current = true;
    isOpenRef.current = true;
    const requestVersion = ++requestVersionRef.current;
    void createGuideSession("morning-routine-uv-001")
      .then((turn) => {
        if (
          isOpenRef.current &&
          requestVersionRef.current === requestVersion
        ) {
          setUiState(uiStateFromTurn(turn));
        }
      })
      .catch(() => {
        if (
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
  }, [open]);

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
      setUiState({ status: "submitting", turn });
      const requestVersion = ++requestVersionRef.current;
      const messageId = `msg_${turn.session_id}_${++messageSequenceRef.current}`;
      void sendGuideMessage(turn.session_id, messageId, text)
        .then((nextTurn) => {
          if (
            isOpenRef.current &&
            requestVersionRef.current === requestVersion
          ) {
            setInput("");
            setCompareIds(new Set());
            setUiState(uiStateFromTurn(nextTurn));
          }
        })
        .catch(() => {
          if (
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
          if (requestVersionRef.current === requestVersion) {
            submittingRef.current = false;
          }
        });
    },
    [uiState],
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
    setCompareIds((current) => {
      const next = new Set(current);
      if (selected) {
        next.add(productId);
      } else {
        next.delete(productId);
      }
      return next;
    });
  }

  if (!open) {
    return null;
  }

  const turn = turnFromState(uiState);
  const isSubmitting = uiState.status === "submitting";

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
                <strong>{turn.context.anchor_product_id}</strong>
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
                <p>{turn.text}</p>
              </div>
            ) : null}
            {uiState.status === "no_match" ? (
              <section className="errorPanel noMatchPanel">
                <span>Hard constraints preserved</span>
                <h2>Change one requirement</h2>
                <p>{uiState.turn.text}</p>
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
                {isSubmitting ? "Checking…" : "Check my fit"}
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
                      selectedForCompare={compareIds.has(recommendation.product_id)}
                      onCompareChange={handleCompareChange}
                    />
                  ),
                )}
              </div>
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
