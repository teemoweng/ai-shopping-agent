"use client";

import type { components } from "@shopping-guide/contracts/src/api";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import type { KeyboardEvent } from "react";

import { GuideChatView } from "@/components/guide-chat-view";
import {
  ApiError,
  compareProducts,
  createGuideSession,
  getGuideSession,
  sendGuideMessage,
} from "@/lib/api-client";

type GuideTurn = components["schemas"]["GuideTurnResponse"];
type GuideAction = components["schemas"]["GuideAction"];
type EvidenceStatus = components["schemas"]["EvidenceStatus"];
type ProductRole = "current" | "alternative";
type RevisionBaseline = {
  sessionId: string;
  guideRevision: number;
  conversationRevision: number;
};
type SyncExpectation =
  | ({ kind: "message-unknown" } & RevisionBaseline)
  | ({ kind: "comparison-unknown" } & RevisionBaseline)
  | ({ kind: "state-conflict" } & RevisionBaseline)
  | null;
type RestorableSubview = {
  kind: "alternatives";
  sessionId: string;
  contextId: string;
  messageId: string;
};

const GUIDE_SESSION_LOCATOR_PREFIX = "ai-shopping-guide-session:";

function sessionLocatorKey(contentContextId: string) {
  return `${GUIDE_SESSION_LOCATOR_PREFIX}${contentContextId}`;
}

function readSessionLocator(contentContextId: string) {
  try {
    const sessionId = window.sessionStorage.getItem(
      sessionLocatorKey(contentContextId),
    );
    if (sessionId?.trim()) {
      return sessionId;
    }
    window.sessionStorage.removeItem(sessionLocatorKey(contentContextId));
  } catch {
    // The in-memory session remains usable when browser storage is unavailable.
  }
  return null;
}

function writeSessionLocator(contentContextId: string, sessionId: string) {
  try {
    window.sessionStorage.setItem(
      sessionLocatorKey(contentContextId),
      sessionId,
    );
  } catch {
    // The server session is still authoritative; storage is only a locator.
  }
}

function clearSessionLocator(contentContextId: string) {
  try {
    window.sessionStorage.removeItem(sessionLocatorKey(contentContextId));
  } catch {
    // Storage cleanup is best-effort when the browser denies access.
  }
}

function isUncertainPostError(error: unknown) {
  return (
    error instanceof TypeError ||
    (error instanceof ApiError &&
      (error.status >= 500 || error.code === "INVALID_API_RESPONSE"))
  );
}

function isRecoverableRestoreError(error: unknown) {
  return (
    error instanceof TypeError ||
    (error instanceof ApiError && error.status >= 500)
  );
}

let fallbackRequestSequence = 0;

function createClientRequestId(prefix: "msg" | "cmp", sessionId: string) {
  const randomId = globalThis.crypto?.randomUUID?.();
  if (randomId) {
    return `${prefix}_${randomId}`;
  }
  fallbackRequestSequence += 1;
  return `${prefix}_${sessionId}_${Date.now()}_${fallbackRequestSequence}`;
}

const claimStatusLabels = {
  SUPPORTED: "有公开依据",
  CONFLICTING: "与来源冲突",
  INSUFFICIENT_EVIDENCE: "证据不足",
  SUBJECTIVE_MIXED: "主观体验分歧",
} satisfies Record<EvidenceStatus, string>;

export function claimStatusLabel(status: EvidenceStatus) {
  return claimStatusLabels[status];
}

function hasAction(turn: GuideTurn, action: GuideAction) {
  return turn.allowed_actions.includes(action);
}

function isTerminalSessionError(error: unknown) {
  return (
    error instanceof ApiError &&
    (error.status === 404 || error.code === "SESSION_NOT_FOUND")
  );
}

function isInvalidApiResponse(error: unknown) {
  return error instanceof ApiError && error.code === "INVALID_API_RESPONSE";
}

function isGuideSessionMismatch(error: unknown) {
  return error instanceof ApiError && error.code === "GUIDE_SESSION_MISMATCH";
}

function isDefinitiveCompareInputRejection(error: unknown) {
  return error instanceof ApiError && error.status === 422;
}

function isExplicitCompareStateConflict(error: unknown) {
  return error instanceof ApiError && error.status === 409;
}

function isMissingGuideSessionError(error: unknown) {
  return (
    error instanceof ApiError &&
    (error.status === 404 || error.code === "SESSION_NOT_FOUND")
  );
}

function isAuthoritativeComparisonTurn(turn: GuideTurn, sessionId: string) {
  return (
    turn.session_id === sessionId &&
    turn.state === "COMPARE" &&
    turn.guide_view_kind === "COMPARISON_READY" &&
    turn.comparison?.session_id === sessionId
  );
}

function isUsableResult(turn: GuideTurn) {
  return [
    "DECISION_READY",
    "NO_MATCH",
    "INSUFFICIENT_EVIDENCE",
    "COMPARISON_READY",
    "SAFE_BOUNDARY",
  ].includes(turn.guide_view_kind);
}

export interface GuideSheetProps {
  open: boolean;
  onClose: () => void;
  contentContextId?: string;
  initialScrollTop?: number;
  onScrollTopChange?: (scrollTop: number) => void;
  onOpenProduct?: (productId: string, role: ProductRole) => void;
  onVerifiedTurnChange?: (turn: GuideTurn | null) => void;
}

export function GuideSheet({
  open,
  onClose,
  contentContextId = "morning-routine-uv-001",
  initialScrollTop = 0,
  onScrollTopChange,
  onOpenProduct,
  onVerifiedTurnChange,
}: GuideSheetProps) {
  const [turn, setTurn] = useState<GuideTurn | null>(null);
  const [pendingLabel, setPendingLabel] = useState<string | null>(null);
  const [transientError, setTransientError] = useState<string | null>(null);
  const [fatalError, setFatalError] = useState<string | null>(null);
  const [comparisonPending, setComparisonPending] = useState(false);
  const [comparisonError, setComparisonError] = useState<string | null>(null);
  const [pendingUserText, setPendingUserText] = useState<string | null>(null);
  const [restorableSubview, setRestorableSubview] =
    useState<RestorableSubview | null>(null);
  const [guideFrozen, setGuideFrozen] = useState(false);
  const [syncRequired, setSyncRequired] = useState(false);
  const [syncExpectationKind, setSyncExpectationKind] = useState<
    "message-unknown" | "comparison-unknown" | "state-conflict" | null
  >(null);
  const [activeContextId, setActiveContextId] = useState(contentContextId);
  const [lastUsableTurn, setLastUsableTurn] = useState<GuideTurn | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const latestScrollTopRef = useRef(initialScrollTop);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const verifiedTurnRef = useRef<GuideTurn | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const mountedRef = useRef(false);
  const isOpenRef = useRef(false);
  const openCycleRef = useRef(false);
  const requestVersionRef = useRef(0);
  const submittingRef = useRef(false);
  const guideFrozenRef = useRef(false);
  const syncRequiredRef = useRef(false);
  const syncExpectationRef = useRef<SyncExpectation>(null);
  const comparisonPendingRef = useRef(false);
  const comparisonVersionRef = useRef(0);
  const lastContextIdRef = useRef(contentContextId);

  const resetComparison = useCallback(() => {
    comparisonVersionRef.current += 1;
    comparisonPendingRef.current = false;
    setComparisonPending(false);
    setComparisonError(null);
  }, []);

  const freezeGuide = useCallback((frozen: boolean) => {
    guideFrozenRef.current = frozen;
    setGuideFrozen(frozen);
  }, []);

  const requireSync = useCallback(
    (required: boolean, expectation?: SyncExpectation) => {
      syncRequiredRef.current = required;
      if (expectation !== undefined) {
        syncExpectationRef.current = expectation;
        setSyncExpectationKind(expectation?.kind ?? null);
      }
      setSyncRequired(required);
    },
    [],
  );

  const enterTerminalState = useCallback(
    (message: string, terminalTurn?: GuideTurn) => {
      verifiedTurnRef.current = null;
      onVerifiedTurnChange?.(null);
      setLastUsableTurn(null);
      sessionIdRef.current = null;
      clearSessionLocator(contentContextId);
      submittingRef.current = false;
      requireSync(false, null);
      freezeGuide(false);
      resetComparison();
      setTurn(terminalTurn ?? null);
      setPendingUserText(null);
      setRestorableSubview(null);
      setPendingLabel(null);
      setTransientError(null);
      setFatalError(terminalTurn ? null : message);
    },
    [contentContextId, freezeGuide, onVerifiedTurnChange, requireSync, resetComparison],
  );

  const applyVerifiedTurn = useCallback(
    (
      nextTurn: GuideTurn,
      expectedSessionId?: string,
    ) => {
      const previous = verifiedTurnRef.current;
      const expectation = syncExpectationRef.current;
      if (
        nextTurn.context.id !== contentContextId ||
        (expectedSessionId !== undefined &&
          nextTurn.session_id !== expectedSessionId)
      ) {
        enterTerminalState(
          "服务端返回了无法验证的导购状态，请关闭后重新打开导购。",
        );
        return;
      }
      if (expectation && nextTurn.session_id !== expectation.sessionId) {
        enterTerminalState(
          "服务端返回了无法验证的导购状态，请关闭后重新打开导购。",
        );
        return;
      }
      const minimumGuideRevision =
        previous?.guide_revision ?? expectation?.guideRevision;
      const minimumConversationRevision =
        previous?.conversation_revision ?? expectation?.conversationRevision;
      if (
        (minimumGuideRevision !== undefined &&
          nextTurn.guide_revision < minimumGuideRevision) ||
        (minimumConversationRevision !== undefined &&
          nextTurn.conversation_revision < minimumConversationRevision)
      ) {
        freezeGuide(true);
        requireSync(true, expectation);
        setTransientError(
          "服务端快照版本早于上次已核验结果；旧结果仅供查看，请重新同步。",
        );
        return;
      }
      if (
        expectation &&
        (expectation.kind === "message-unknown" ||
          expectation.kind === "comparison-unknown") &&
        nextTurn.conversation_revision <= expectation.conversationRevision
      ) {
        freezeGuide(true);
        requireSync(true, expectation);
        setTransientError(
          "服务端会话版本尚未前进；上次已核验结果仅供查看，请重新同步。",
        );
        return;
      }
      if (expectation?.kind === "comparison-unknown") {
        if (!isAuthoritativeComparisonTurn(nextTurn, expectation.sessionId)) {
          freezeGuide(true);
          requireSync(true, expectation);
          setTransientError(
            "尚未确认服务端最终比较状态；上次已核验结果仅供查看，请重新同步。",
          );
          return;
        }
      }
      if (nextTurn.guide_view_kind === "FATAL_ERROR") {
        enterTerminalState(nextTurn.text, nextTurn);
        return;
      }
      if (
        previous &&
        (previous.session_id !== nextTurn.session_id ||
          previous.guide_revision !== nextTurn.guide_revision)
      ) {
        resetComparison();
      }
      if (isUsableResult(nextTurn)) {
        setLastUsableTurn(nextTurn);
      }
      verifiedTurnRef.current = nextTurn;
      onVerifiedTurnChange?.(nextTurn);
      sessionIdRef.current = nextTurn.session_id;
      writeSessionLocator(contentContextId, nextTurn.session_id);
      comparisonPendingRef.current = false;
      setTurn(nextTurn);
      setPendingUserText(null);
      const nextMessageId = nextTurn.transcript?.at(-1)?.id;
      setRestorableSubview((current) =>
        current &&
        nextTurn.guide_view_kind !== "SAFE_BOUNDARY" &&
        current.sessionId === nextTurn.session_id &&
        current.contextId === nextTurn.context.id &&
        current.messageId === nextMessageId
          ? current
          : null,
      );
      setComparisonPending(false);
      freezeGuide(false);
      requireSync(false, null);
      setFatalError(null);
      setTransientError(null);
    },
    [contentContextId, enterTerminalState, freezeGuide, onVerifiedTurnChange, requireSync, resetComparison],
  );

  const saveScrollPosition = useCallback(() => {
    const scrollTop = latestScrollTopRef.current;
    if (Number.isFinite(scrollTop)) {
      onScrollTopChange?.(Math.max(0, scrollTop));
    }
  }, [onScrollTopChange]);

  const invalidatePendingRequests = useCallback(() => {
    requestVersionRef.current += 1;
    comparisonVersionRef.current += 1;
    submittingRef.current = false;
    comparisonPendingRef.current = false;
    guideFrozenRef.current = true;
    setPendingLabel(null);
    setComparisonPending(false);
    setGuideFrozen(true);
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
    clearSessionLocator(lastContextIdRef.current);
    lastContextIdRef.current = contentContextId;
    setActiveContextId(contentContextId);
    verifiedTurnRef.current = null;
    onVerifiedTurnChange?.(null);
    setLastUsableTurn(null);
    sessionIdRef.current = null;
    setTurn(null);
    setPendingUserText(null);
    setRestorableSubview(null);
    latestScrollTopRef.current = 0;
    openCycleRef.current = false;
    requestVersionRef.current += 1;
    submittingRef.current = false;
    freezeGuide(false);
    requireSync(false, null);
    setTransientError(null);
    setFatalError(null);
    resetComparison();
  }, [contentContextId, freezeGuide, onVerifiedTurnChange, requireSync, resetComparison]);

  useEffect(() => {
    latestScrollTopRef.current = Math.max(0, initialScrollTop);
  }, [initialScrollTop]);

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
    freezeGuide(true);
    setTransientError(null);
    setFatalError(null);
    const requestVersion = ++requestVersionRef.current;
    const locatorSessionId = readSessionLocator(contentContextId);
    const existingSessionId = sessionIdRef.current ?? locatorSessionId;
    sessionIdRef.current = existingSessionId;
    if (!verifiedTurnRef.current) {
      setTurn(null);
      setPendingLabel("正在读取当前视频和商品…");
    } else {
      setPendingLabel("正在恢复上次已核验结果…");
    }

    const isCurrentOpenRequest = () =>
      mountedRef.current &&
      isOpenRef.current &&
      requestVersionRef.current === requestVersion &&
      lastContextIdRef.current === contentContextId;
    const isCurrentRestore = () =>
      isCurrentOpenRequest() &&
      sessionIdRef.current === existingSessionId &&
      (locatorSessionId === null ||
        readSessionLocator(contentContextId) === locatorSessionId);
    let createdNewSession = !existingSessionId;
    const replaceStaleRestore = () => {
      if (!existingSessionId || !isCurrentRestore()) {
        return null;
      }
      clearSessionLocator(contentContextId);
      sessionIdRef.current = null;
      verifiedTurnRef.current = null;
      onVerifiedTurnChange?.(null);
      setLastUsableTurn(null);
      setTurn(null);
      setRestorableSubview(null);
      requireSync(false, null);
      resetComparison();
      createdNewSession = true;
      return createGuideSession(contentContextId, "zh-CN");
    };
    const request = (async () => {
      if (!existingSessionId) {
        return createGuideSession(contentContextId, "zh-CN");
      }
      try {
        const restoredTurn = await getGuideSession(existingSessionId);
        if (
          restoredTurn.session_id !== existingSessionId ||
          restoredTurn.context.id !== contentContextId
        ) {
          return replaceStaleRestore();
        }
        return restoredTurn;
      } catch (error: unknown) {
        if (
          !isTerminalSessionError(error) &&
          !isGuideSessionMismatch(error)
        ) {
          throw error;
        }
        return replaceStaleRestore();
      }
    })();
    void request
      .then((nextTurn) => {
        if (
          nextTurn &&
          isCurrentOpenRequest()
        ) {
          applyVerifiedTurn(
            nextTurn,
            createdNewSession ? undefined : existingSessionId ?? undefined,
          );
        }
      })
      .catch((error: unknown) => {
        if (isCurrentOpenRequest()) {
          if (isTerminalSessionError(error)) {
            enterTerminalState(
              "导购会话已失效，请关闭后重新打开以建立新会话。",
            );
          } else if (
            existingSessionId &&
            !createdNewSession &&
            isRecoverableRestoreError(error)
          ) {
            requireSync(true, null);
            setTransientError(
              "暂时无法读取服务端会话；已保留当前会话定位，请重新同步。",
            );
          } else if (verifiedTurnRef.current) {
            requireSync(true);
            setTransientError(
              "尚未确认服务端最终状态；上次已核验结果仅供查看，请重新同步。",
            );
          } else {
            enterTerminalState(
              "导购暂时不可用，请返回 Feed 后重新打开。",
            );
          }
        }
      })
      .finally(() => {
        if (isCurrentOpenRequest()) {
          setPendingLabel(null);
        }
      });
  }, [
    applyVerifiedTurn,
    contentContextId,
    enterTerminalState,
    freezeGuide,
    onVerifiedTurnChange,
    open,
    requireSync,
    resetComparison,
  ]);

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
    const closeButton =
      closeRef.current ??
      dialogRef.current?.querySelector<HTMLButtonElement>(
        'button[aria-label="关闭导购"]',
      );
    closeButton?.focus();

    return () => {
      document.body.style.overflow = previousOverflow;
      const previousFocus = previousFocusRef.current;
      previousFocusRef.current = null;
      previousFocus?.focus();
    };
  }, [open]);

  useEffect(() => {
    if (!open || !turn?.session_id) {
      return;
    }
    const activeElement = document.activeElement as HTMLElement | null;
    if (!dialogRef.current?.contains(activeElement)) {
      dialogRef.current
        ?.querySelector<HTMLButtonElement>('button[aria-label="关闭导购"]')
        ?.focus();
    }
  }, [open, turn?.session_id]);

  const submitMessage = useCallback(
    (rawText: string) => {
      const currentTurn = verifiedTurnRef.current;
      const text = rawText.trim();
      if (
        !currentTurn ||
        !text ||
        submittingRef.current ||
        guideFrozenRef.current ||
        !hasAction(currentTurn, "SEND_MESSAGE") ||
        !openCycleRef.current ||
        lastContextIdRef.current !== contentContextId
      ) {
        return;
      }

      submittingRef.current = true;
      freezeGuide(true);
      resetComparison();
      setRestorableSubview(null);
      setPendingUserText(text);
      setTransientError(null);
      const messageExpectation = {
        kind: "message-unknown",
        sessionId: currentTurn.session_id,
        guideRevision: currentTurn.guide_revision,
        conversationRevision: currentTurn.conversation_revision,
      } as const;
      requireSync(false, messageExpectation);
      setPendingLabel("正在核验商品事实与视频说法…");
      const requestVersion = ++requestVersionRef.current;
      const messageId = createClientRequestId("msg", currentTurn.session_id);
      const expectedConversationRevision = currentTurn.conversation_revision;
      const isCurrentRequest = () =>
        mountedRef.current &&
        isOpenRef.current &&
        requestVersionRef.current === requestVersion;

      void (async () => {
        try {
          try {
            let nextTurn: GuideTurn;
            try {
              nextTurn = await sendGuideMessage(
                currentTurn.session_id,
                messageId,
                text,
                expectedConversationRevision,
              );
            } catch (error: unknown) {
              if (!isUncertainPostError(error)) {
                throw error;
              }
              nextTurn = await sendGuideMessage(
                currentTurn.session_id,
                messageId,
                text,
                expectedConversationRevision,
              );
            }
            if (isCurrentRequest()) {
              applyVerifiedTurn(nextTurn, currentTurn.session_id);
            }
            return;
          } catch (error: unknown) {
            if (isTerminalSessionError(error)) {
              if (isCurrentRequest()) {
                enterTerminalState(
                  "导购会话已失效，请关闭后重新打开以建立新会话。",
                );
              }
              return;
            }
          }
          if (!isCurrentRequest()) {
            return;
          }
          setPendingLabel("正在同步服务端最终状态…");
          try {
            const snapshot = await getGuideSession(currentTurn.session_id);
            if (isCurrentRequest()) {
              applyVerifiedTurn(snapshot, currentTurn.session_id);
            }
          } catch (error: unknown) {
            if (!isCurrentRequest()) {
              return;
            }
            if (isTerminalSessionError(error)) {
              enterTerminalState(
                "导购会话已失效，请关闭后重新打开以建立新会话。",
              );
            } else {
              requireSync(true);
              setTransientError(
                "尚未确认服务端最终状态；上次已核验结果仅供查看，请重新同步。",
              );
            }
          }
        } finally {
          if (
            mountedRef.current &&
            requestVersionRef.current === requestVersion
          ) {
            submittingRef.current = false;
            setPendingLabel(null);
          }
        }
      })();
    },
    [
      applyVerifiedTurn,
      enterTerminalState,
      freezeGuide,
      requireSync,
      resetComparison,
      contentContextId,
    ],
  );

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
        'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), a[href], summary, [tabindex]:not([tabindex="-1"])',
      ) ?? [],
    ).filter((element) => {
      if (element.getAttribute("aria-hidden") === "true") {
        return false;
      }
      const closedDetails = element.closest("details:not([open])");
      return (
        !closedDetails ||
        (element.tagName === "SUMMARY" && element.parentElement === closedDetails)
      );
    });
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

  function handleCompareProducts() {
    const currentTurn = verifiedTurnRef.current;
    const currentRecommendations =
      currentTurn?.transcript?.at(-1)?.recommendations ??
      currentTurn?.recommendations ??
      [];
    const anchor = currentRecommendations.find(
      (item) => item.product_id === currentTurn?.context.anchor_product_id,
    );
    const alternative = currentRecommendations.find(
      (item) => item.product_id !== currentTurn?.context.anchor_product_id,
    );
    const productIds = [anchor?.product_id, alternative?.product_id].filter(
      (productId): productId is string => Boolean(productId),
    );
    if (
      !currentTurn ||
      !hasAction(currentTurn, "REQUEST_COMPARISON") ||
      productIds.length !== 2 ||
      guideFrozenRef.current ||
      !openCycleRef.current ||
      lastContextIdRef.current !== contentContextId ||
      comparisonPendingRef.current
    ) {
      return;
    }
    comparisonPendingRef.current = true;
    setComparisonPending(true);
    setComparisonError(null);
    setRestorableSubview(null);
    freezeGuide(true);
    const sessionId = currentTurn.session_id;
    const comparisonExpectation = {
      kind: "comparison-unknown",
      sessionId,
      guideRevision: currentTurn.guide_revision,
      conversationRevision: currentTurn.conversation_revision,
    } as const;
    requireSync(false, comparisonExpectation);
    const version = ++comparisonVersionRef.current;
    const requestId = createClientRequestId("cmp", sessionId);
    const expectedConversationRevision = currentTurn.conversation_revision;
    const isCurrentComparison = () =>
      mountedRef.current &&
      isOpenRef.current &&
      lastContextIdRef.current === contentContextId &&
      comparisonVersionRef.current === version;

    void (async () => {
      try {
        let postError: unknown = null;
        try {
          try {
            await compareProducts(
              sessionId,
              requestId,
              productIds,
              expectedConversationRevision,
            );
          } catch (error: unknown) {
            if (!isUncertainPostError(error)) {
              throw error;
            }
            await compareProducts(
              sessionId,
              requestId,
              productIds,
              expectedConversationRevision,
            );
          }
        } catch (error: unknown) {
          postError = error;
        }
        if (postError !== null) {
          if (isMissingGuideSessionError(postError)) {
            if (
              syncExpectationRef.current === comparisonExpectation &&
              sessionIdRef.current === sessionId &&
              lastContextIdRef.current === contentContextId
            ) {
              enterTerminalState(
                "导购会话已失效，请关闭后重新打开以建立新会话。",
              );
            }
            return;
          }
          if (isDefinitiveCompareInputRejection(postError)) {
            if (syncExpectationRef.current === comparisonExpectation) {
              syncExpectationRef.current = null;
            }
            if (!isCurrentComparison()) {
              return;
            }
            requireSync(false, null);
            freezeGuide(false);
            setComparisonError(
              "比较请求未被服务端接受，请检查候选后重试。",
            );
            return;
          }
          if (
            isExplicitCompareStateConflict(postError) &&
            syncExpectationRef.current === comparisonExpectation &&
            sessionIdRef.current === sessionId &&
            lastContextIdRef.current === contentContextId
          ) {
            syncExpectationRef.current = {
              kind: "state-conflict",
              sessionId,
              guideRevision: currentTurn.guide_revision,
              conversationRevision: currentTurn.conversation_revision,
            };
          }
          if (!isCurrentComparison()) {
            return;
          }
        }

        if (!isCurrentComparison()) {
          return;
        }
        const snapshot = await getGuideSession(sessionId);
        if (!isCurrentComparison()) {
          return;
        }
        applyVerifiedTurn(snapshot, sessionId);
      } catch (error: unknown) {
        if (!isCurrentComparison()) {
          return;
        }
        if (isTerminalSessionError(error)) {
          enterTerminalState(
            "导购会话已失效，请关闭后重新打开以建立新会话。",
          );
        } else {
          const activeExpectation =
            syncExpectationRef.current?.sessionId === sessionId
              ? syncExpectationRef.current
              : comparisonExpectation;
          requireSync(true, activeExpectation);
          setTransientError(
            activeExpectation.kind === "state-conflict"
              ? "尚未确认服务端冲突后的最新状态；上次已核验结果仅供查看，请重新同步。"
              : "尚未确认服务端最终比较状态；上次已核验结果仅供查看，请重新同步。",
          );
        }
      } finally {
        if (
          mountedRef.current &&
          comparisonVersionRef.current === version
        ) {
          comparisonPendingRef.current = false;
          setComparisonPending(false);
        }
      }
    })();
  }

  function openProduct(productId: string, role: ProductRole) {
    const currentTurn = verifiedTurnRef.current;
    if (
      !currentTurn ||
      !hasAction(currentTurn, "OPEN_PRODUCT") ||
      guideFrozenRef.current ||
      !openCycleRef.current ||
      lastContextIdRef.current !== contentContextId ||
      comparisonPendingRef.current
    ) {
      return;
    }
    saveScrollPosition();
    invalidatePendingRequests();
    onOpenProduct?.(productId, role);
  }

  function retryGuideSnapshot() {
    const currentSessionId = sessionIdRef.current;
    const expectation = syncExpectationRef.current;
    if (
      !currentSessionId ||
      !syncRequiredRef.current ||
      submittingRef.current
    ) {
      return;
    }
    submittingRef.current = true;
    freezeGuide(true);
    requireSync(false);
    setPendingLabel("正在恢复上次已核验结果…");
    setTransientError(null);
    const requestVersion = ++requestVersionRef.current;
    const isCurrentRequest = () =>
      mountedRef.current &&
      isOpenRef.current &&
      requestVersionRef.current === requestVersion &&
      lastContextIdRef.current === contentContextId;
    const isCurrentSessionRequest = () =>
      isCurrentRequest() && sessionIdRef.current === currentSessionId;
    const replaceConfirmedStaleSession = async () => {
      if (!isCurrentSessionRequest()) {
        return;
      }
      clearSessionLocator(contentContextId);
      sessionIdRef.current = null;
      verifiedTurnRef.current = null;
      onVerifiedTurnChange?.(null);
      setLastUsableTurn(null);
      setTurn(null);
      setRestorableSubview(null);
      requireSync(false, null);
      resetComparison();
      try {
        const nextTurn = await createGuideSession(contentContextId, "zh-CN");
        if (isCurrentRequest() && sessionIdRef.current === null) {
          applyVerifiedTurn(nextTurn);
        }
      } catch {
        if (isCurrentRequest() && sessionIdRef.current === null) {
          enterTerminalState(
            "无法建立有效的导购会话，请关闭后重新打开。",
          );
        }
      }
    };
    void (async () => {
      try {
        let nextTurn: GuideTurn;
        try {
          nextTurn = await getGuideSession(currentSessionId);
        } catch (error: unknown) {
          if (!isCurrentSessionRequest()) {
            return;
          }
          if (
            isTerminalSessionError(error) ||
            isGuideSessionMismatch(error)
          ) {
            await replaceConfirmedStaleSession();
          } else {
            requireSync(true, expectation);
            setTransientError(
              "尚未确认服务端最终状态；上次已核验结果仍为只读，请再次同步。",
            );
          }
          return;
        }
        if (!isCurrentSessionRequest()) {
          return;
        }
        if (
          nextTurn.session_id !== currentSessionId ||
          nextTurn.context.id !== contentContextId
        ) {
          await replaceConfirmedStaleSession();
          return;
        }
        applyVerifiedTurn(nextTurn, currentSessionId);
      } finally {
        if (isCurrentRequest()) {
          submittingRef.current = false;
          setPendingLabel(null);
        }
      }
    })();
  }

  function retryRecoverySession() {
    const currentTurn = verifiedTurnRef.current;
    if (
      !currentTurn ||
      currentTurn.guide_view_kind !== "RECOVERY_REQUIRED" ||
      !hasAction(currentTurn, "RETRY_GUIDE_OPERATION") ||
      submittingRef.current
    ) {
      return;
    }

    submittingRef.current = true;
    freezeGuide(true);
    requireSync(false, null);
    resetComparison();
    setRestorableSubview(null);
    sessionIdRef.current = null;
    clearSessionLocator(contentContextId);
    verifiedTurnRef.current = null;
    onVerifiedTurnChange?.(null);
    setPendingLabel("正在建立新的安全导购会话…");
    setTransientError(null);
    const requestVersion = ++requestVersionRef.current;
    void createGuideSession(contentContextId, "zh-CN")
      .then((nextTurn) => {
        if (
          mountedRef.current &&
          isOpenRef.current &&
          requestVersionRef.current === requestVersion
        ) {
          applyVerifiedTurn(nextTurn);
        }
      })
      .catch((error: unknown) => {
        if (
          mountedRef.current &&
          isOpenRef.current &&
          requestVersionRef.current === requestVersion
        ) {
          if (
            isTerminalSessionError(error) ||
            isInvalidApiResponse(error)
          ) {
            enterTerminalState(
              "无法建立有效的导购会话，请关闭后重新打开。",
            );
          } else {
            verifiedTurnRef.current = currentTurn;
            sessionIdRef.current = currentTurn.session_id;
            freezeGuide(false);
            setTransientError("新会话暂时无法建立，请稍后重试恢复。");
          }
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
  const businessFrozen =
    guideFrozen || activeContextId !== contentContextId;
  const comparisonExpected =
    syncRequired && syncExpectationKind === "comparison-unknown";
  const showingComparison =
    turn?.guide_view_kind === "COMPARISON_READY" ||
    (turn?.guide_view_kind === "RECOVERY_REQUIRED" &&
      lastUsableTurn?.guide_view_kind === "COMPARISON_READY");
  const activeAlternativesSubview =
    restorableSubview &&
    turn &&
    restorableSubview.sessionId === turn.session_id &&
    restorableSubview.contextId === turn.context.id &&
    restorableSubview.messageId === turn.transcript?.at(-1)?.id
      ? restorableSubview
      : null;
  const mode =
    comparisonPending ||
    comparisonExpected ||
    showingComparison ||
    activeAlternativesSubview
      ? "expanded"
      : "compact";
  const statusText = comparisonPending
    ? "正在核对商品信息…"
    : pendingLabel
      ? pendingUserText
        ? "正在核对商品信息…"
        : "正在恢复回答…"
      : syncRequired
        ? "正在恢复回答…"
        : null;
  const errorText = [transientError, comparisonError]
    .filter((message): message is string => Boolean(message))
    .join(" ") || null;
  const recoveryTurn =
    turn?.guide_view_kind === "RECOVERY_REQUIRED" && lastUsableTurn
      ? lastUsableTurn
      : turn;
  const isFatalTurn = turn?.guide_view_kind === "FATAL_ERROR";
  const displayTurn =
    recoveryTurn && pendingUserText
      ? {
          ...recoveryTurn,
          transcript: [
            ...(recoveryTurn.transcript ?? []),
            {
              id: `pending_${recoveryTurn.session_id}`,
              sequence:
                (recoveryTurn.transcript?.at(-1)?.sequence ?? 0) + 1,
              role: "USER" as const,
              kind: "USER_TEXT" as const,
              text: pendingUserText,
              redacted: false,
            },
          ],
        }
      : recoveryTurn;
  const chatTurn = displayTurn
    ? {
        ...displayTurn,
        recommendations: (displayTurn.recommendations ?? []).slice(0, 3),
        transcript: (displayTurn.transcript ?? []).map((message) => ({
          ...message,
          recommendations: message.recommendations?.slice(0, 3),
        })),
      }
    : null;
  const currentRecommendations =
    turn?.transcript?.at(-1)?.recommendations ?? turn?.recommendations ?? [];
  const canCompare =
    Boolean(turn && hasAction(turn, "REQUEST_COMPARISON")) &&
    currentRecommendations.some(
      (item) => item.product_id === turn?.context.anchor_product_id,
    ) &&
    currentRecommendations.some(
      (item) => item.product_id !== turn?.context.anchor_product_id,
    );
  const canOpenProduct = Boolean(turn && hasAction(turn, "OPEN_PRODUCT"));
  const needsRecoveryAction = Boolean(
    syncRequired ||
      (turn?.guide_view_kind === "RECOVERY_REQUIRED" &&
        hasAction(turn, "RETRY_GUIDE_OPERATION")),
  );

  return (
    <div className="guideBackdrop">
      <div
        ref={dialogRef}
        className="guideSheet guideSheetChat"
        role="dialog"
        aria-modal="true"
        aria-label="AI 导购（概念）"
        aria-busy={Boolean(statusText) || comparisonPending}
        data-mode={mode}
        style={{
          height:
            mode === "expanded" ? "min(74dvh, 670px)" : "min(44dvh, 390px)",
          minHeight: 0,
          gridTemplateRows: "minmax(0, 1fr)",
        }}
        onKeyDown={handleDialogKeyDown}
      >
        {chatTurn && !isFatalTurn ? (
          <GuideChatView
            turn={chatTurn}
            mode={mode}
            disabled={
              businessFrozen || turn?.guide_view_kind === "RECOVERY_REQUIRED"
            }
            statusText={statusText}
            errorText={errorText}
            initialScrollTop={initialScrollTop}
            initialSubview={
              activeAlternativesSubview
                ? {
                    kind: "alternatives",
                    messageId: activeAlternativesSubview.messageId,
                  }
                : null
            }
            onScrollTopChange={(scrollTop) => {
              latestScrollTopRef.current = scrollTop;
              onScrollTopChange?.(scrollTop);
            }}
            onSubmit={submitMessage}
            onQuickReply={submitMessage}
            onOpenProduct={canOpenProduct ? openProduct : undefined}
            onCompare={canCompare ? handleCompareProducts : undefined}
            onSubviewChange={(kind) => {
              const currentTurn = verifiedTurnRef.current;
              const messageId = currentTurn?.transcript?.at(-1)?.id;
              setRestorableSubview(
                kind === "alternatives" && currentTurn && messageId
                  ? {
                      kind,
                      sessionId: currentTurn.session_id,
                      contextId: currentTurn.context.id,
                      messageId,
                    }
                  : null,
              );
            }}
            onClose={handleClose}
          />
        ) : (
          <section
            className="guideChatView"
            data-mode="compact"
            aria-label="AI 商品导购"
          >
            <header className="guideChatHeader">
              <strong>
                {fatalError || isFatalTurn ? "导购暂时不可用" : "正在打开导购"}
              </strong>
              <button
                ref={closeRef}
                type="button"
                className="guideChatClose"
                aria-label="关闭导购"
                onClick={handleClose}
              >
                ×
              </button>
            </header>
            <div className="guideChatMessages">
              {fatalError || isFatalTurn ? (
                <div className="guideChatError" role="alert">
                  <h2>导购暂时不可用</h2>
                  <p>{fatalError ?? turn?.text}</p>
                </div>
              ) : (
                <div className="guideChatStatus" role="status">
                  正在读取当前视频和商品…
                </div>
              )}
            </div>
          </section>
        )}

        {needsRecoveryAction ? (
          <div
            className="guideRecoveryAction"
            style={{
              position: "absolute",
              right: 16,
              bottom: "max(70px, env(safe-area-inset-bottom))",
              zIndex: 2,
            }}
          >
            <button
              type="button"
              className="primaryDecisionButton"
              disabled={isSubmitting}
              onClick={
                turn?.guide_view_kind === "RECOVERY_REQUIRED"
                  ? retryRecoverySession
                  : retryGuideSnapshot
              }
            >
              {turn?.guide_view_kind === "RECOVERY_REQUIRED"
                ? "重新开始导购"
                : "重新同步"}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );

}
