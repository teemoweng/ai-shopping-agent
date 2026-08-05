export type BaseSurface = "feed" | "pdp";
export type Overlay = "none" | "ai-sheet" | "cart-confirm" | "receipt";
export type PdpEntrySource = "feed" | "ai";
export type ProductRole = "current" | "alternative";

export interface VideoSnapshot {
  currentTime: number;
  paused: boolean;
  muted: boolean;
}

export interface NavigationState {
  baseSurface: BaseSurface;
  overlay: Overlay;
  feedIndex: number;
  pdpProductId: string | null;
  pdpEntrySource: PdpEntrySource | null;
  productRole: ProductRole | null;
  videoSnapshots: Record<string, VideoSnapshot>;
  guideScrollTop: number;
  notice: string | null;
}

export type DemoNavigationEvent =
  | { type: "SET_FEED_INDEX"; index: number }
  | { type: "OPEN_GUIDE" }
  | { type: "CLOSE_GUIDE" }
  | {
      type: "OPEN_PDP";
      productId: string;
      entrySource: PdpEntrySource;
      productRole: ProductRole;
    }
  | { type: "CLOSE_PDP" }
  | { type: "OPEN_CART_CONFIRM" }
  | { type: "SHOW_FACTS_CHANGED" }
  | { type: "SHOW_RECEIPT" }
  | { type: "CLOSE_OVERLAY" }
  | { type: "SAVE_GUIDE_SCROLL"; scrollTop: number }
  | { type: "SAVE_VIDEO_SNAPSHOT"; itemId: string; snapshot: VideoSnapshot }
  | { type: "SHOW_NOTICE"; message: string }
  | { type: "CLEAR_NOTICE" };

export function createInitialNavigationState(): NavigationState {
  return {
    baseSurface: "feed",
    overlay: "none",
    feedIndex: 0,
    pdpProductId: null,
    pdpEntrySource: null,
    productRole: null,
    videoSnapshots: {},
    guideScrollTop: 0,
    notice: null,
  };
}

function returnToFeed(
  state: NavigationState,
  overlay: Overlay,
): NavigationState {
  return {
    ...state,
    baseSurface: "feed",
    overlay,
    pdpProductId: null,
    pdpEntrySource: null,
    productRole: null,
  };
}

export function demoNavigationReducer(
  state: NavigationState,
  event: DemoNavigationEvent,
): NavigationState {
  switch (event.type) {
    case "SET_FEED_INDEX":
      return state.baseSurface === "feed" &&
        Number.isSafeInteger(event.index) &&
        event.index >= 0
        ? { ...state, feedIndex: event.index }
        : state;
    case "OPEN_GUIDE":
      return state.baseSurface === "feed" && state.overlay === "none"
        ? { ...state, overlay: "ai-sheet" }
        : state;
    case "CLOSE_GUIDE":
      return state.overlay === "ai-sheet"
        ? { ...state, overlay: "none" }
        : state;
    case "OPEN_PDP": {
      const fromFeed =
        event.entrySource === "feed" &&
        state.baseSurface === "feed" &&
        state.overlay === "none";
      const fromAi =
        event.entrySource === "ai" && state.overlay === "ai-sheet";
      if (!event.productId.trim() || (!fromFeed && !fromAi)) {
        return state;
      }
      return {
        ...state,
        baseSurface: "pdp",
        overlay: "none",
        pdpProductId: event.productId,
        pdpEntrySource: event.entrySource,
        productRole: event.productRole,
      };
    }
    case "CLOSE_PDP":
      return state.baseSurface === "pdp"
        ? returnToFeed(
            state,
            state.overlay !== "receipt" && state.pdpEntrySource === "ai"
              ? "ai-sheet"
              : "none",
          )
        : state;
    case "OPEN_CART_CONFIRM":
      return state.baseSurface === "pdp" && state.overlay === "none"
        ? { ...state, overlay: "cart-confirm" }
        : state;
    case "SHOW_FACTS_CHANGED":
      return state.baseSurface === "pdp" && state.overlay === "cart-confirm"
        ? { ...state, overlay: "cart-confirm" }
        : state;
    case "SHOW_RECEIPT":
      return state.baseSurface === "pdp" && state.overlay === "cart-confirm"
        ? { ...state, overlay: "receipt" }
        : state;
    case "CLOSE_OVERLAY":
      return state.overlay === "none" ? state : { ...state, overlay: "none" };
    case "SAVE_GUIDE_SCROLL":
      return Number.isFinite(event.scrollTop) && event.scrollTop >= 0
        ? { ...state, guideScrollTop: event.scrollTop }
        : state;
    case "SAVE_VIDEO_SNAPSHOT":
      return event.itemId.trim()
        ? {
            ...state,
            videoSnapshots: {
              ...state.videoSnapshots,
              [event.itemId]: { ...event.snapshot },
            },
          }
        : state;
    case "SHOW_NOTICE":
      return event.message.trim()
        ? { ...state, notice: event.message }
        : state;
    case "CLEAR_NOTICE":
      return state.notice === null ? state : { ...state, notice: null };
  }
}

export function captureAndPauseVideo(video: HTMLVideoElement): VideoSnapshot {
  const snapshot = {
    currentTime: Number.isFinite(video.currentTime) ? video.currentTime : 0,
    paused: video.paused,
    muted: video.muted,
  };
  try {
    video.pause();
  } catch {
    // A media failure must not block navigation to decision support.
  }
  return snapshot;
}

export async function restoreVideoSnapshot(
  video: HTMLVideoElement,
  snapshot: VideoSnapshot,
): Promise<void> {
  try {
    video.currentTime = Number.isFinite(snapshot.currentTime)
      ? Math.max(0, snapshot.currentTime)
      : 0;
  } catch {
    // Some browsers reject seeking until metadata is available; mute/play restore still applies.
  }
  video.muted = snapshot.muted;

  if (snapshot.paused) {
    try {
      video.pause();
    } catch {
      // Media restoration is best-effort and never blocks the surrounding UI.
    }
    return;
  }

  try {
    await video.play();
  } catch {
    // Autoplay policies can reject play(); the Feed remains interactive.
  }
}
