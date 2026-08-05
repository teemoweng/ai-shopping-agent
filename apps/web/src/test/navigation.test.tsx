import { describe, expect, it, vi } from "vitest";

import {
  captureAndPauseVideo,
  createInitialNavigationState,
  demoNavigationReducer,
  restoreVideoSnapshot,
  type NavigationState,
} from "@/lib/demo-navigation";

function feedState(): NavigationState {
  return createInitialNavigationState();
}

describe("demoNavigationReducer", () => {
  it("starts on the first shoppable feed item with no overlay", () => {
    expect(feedState()).toEqual({
      baseSurface: "feed",
      overlay: "none",
      feedIndex: 0,
      pdpProductId: null,
      pdpEntrySource: null,
      productRole: null,
      videoSnapshots: {},
      guideScrollTop: 0,
      notice: null,
    });
  });

  it("updates the visible feed index but ignores invalid indices", () => {
    const visible = demoNavigationReducer(feedState(), {
      type: "SET_FEED_INDEX",
      index: 1,
    });

    expect(visible.feedIndex).toBe(1);
    expect(
      demoNavigationReducer(visible, { type: "SET_FEED_INDEX", index: -1 }),
    ).toBe(visible);
  });

  it("opens and closes the AI sheet over the feed", () => {
    const open = demoNavigationReducer(feedState(), { type: "OPEN_GUIDE" });
    expect(open).toMatchObject({ baseSurface: "feed", overlay: "ai-sheet" });

    const closed = demoNavigationReducer(open, { type: "CLOSE_GUIDE" });
    expect(closed).toMatchObject({ baseSurface: "feed", overlay: "none" });
  });

  it("returns a direct Feed PDP to the Feed", () => {
    const pdp = demoNavigationReducer(feedState(), {
      type: "OPEN_PDP",
      productId: "seoul-shade-daily-fluid",
      entrySource: "feed",
      productRole: "current",
    });

    expect(pdp).toMatchObject({
      baseSurface: "pdp",
      overlay: "none",
      pdpProductId: "seoul-shade-daily-fluid",
      pdpEntrySource: "feed",
      productRole: "current",
    });
    expect(demoNavigationReducer(pdp, { type: "CLOSE_PDP" })).toMatchObject({
      baseSurface: "feed",
      overlay: "none",
      pdpProductId: null,
      pdpEntrySource: null,
      productRole: null,
    });
  });

  it.each(["current", "alternative"] as const)(
    "returns an AI %s PDP to the open AI sheet",
    (productRole) => {
      const guide = demoNavigationReducer(feedState(), { type: "OPEN_GUIDE" });
      const pdp = demoNavigationReducer(guide, {
        type: "OPEN_PDP",
        productId:
          productRole === "current"
            ? "seoul-shade-daily-fluid"
            : "cloud-veil-water-gel",
        entrySource: "ai",
        productRole,
      });

      expect(pdp).toMatchObject({
        baseSurface: "pdp",
        overlay: "none",
        pdpEntrySource: "ai",
        productRole,
      });
      expect(demoNavigationReducer(pdp, { type: "CLOSE_PDP" })).toMatchObject({
        baseSurface: "feed",
        overlay: "ai-sheet",
        pdpProductId: null,
        pdpEntrySource: null,
        productRole: null,
      });
    },
  );

  it("moves from PDP through cart confirmation, changed facts, and receipt", () => {
    const pdp = demoNavigationReducer(feedState(), {
      type: "OPEN_PDP",
      productId: "seoul-shade-daily-fluid",
      entrySource: "feed",
      productRole: "current",
    });
    const confirm = demoNavigationReducer(pdp, {
      type: "OPEN_CART_CONFIRM",
    });
    expect(confirm.overlay).toBe("cart-confirm");

    const changed = demoNavigationReducer(confirm, {
      type: "SHOW_FACTS_CHANGED",
    });
    expect(changed.overlay).toBe("cart-confirm");

    const receipt = demoNavigationReducer(changed, { type: "SHOW_RECEIPT" });
    expect(receipt.overlay).toBe("receipt");
  });

  it("returns a receipt to its PDP or directly to the Feed", () => {
    const pdp = demoNavigationReducer(feedState(), {
      type: "OPEN_PDP",
      productId: "seoul-shade-daily-fluid",
      entrySource: "feed",
      productRole: "current",
    });
    const receipt = demoNavigationReducer(
      demoNavigationReducer(pdp, { type: "OPEN_CART_CONFIRM" }),
      { type: "SHOW_RECEIPT" },
    );

    expect(
      demoNavigationReducer(receipt, { type: "CLOSE_OVERLAY" }),
    ).toMatchObject({ baseSurface: "pdp", overlay: "none" });
    expect(demoNavigationReducer(receipt, { type: "CLOSE_PDP" })).toMatchObject(
      { baseSurface: "feed", overlay: "none", pdpProductId: null },
    );
  });

  it("continues browsing from an AI-origin receipt without reopening AI", () => {
    const guide = demoNavigationReducer(feedState(), { type: "OPEN_GUIDE" });
    const pdp = demoNavigationReducer(guide, {
      type: "OPEN_PDP",
      productId: "cloud-veil-water-gel",
      entrySource: "ai",
      productRole: "alternative",
    });
    const receipt = demoNavigationReducer(
      demoNavigationReducer(pdp, { type: "OPEN_CART_CONFIRM" }),
      { type: "SHOW_RECEIPT" },
    );

    expect(demoNavigationReducer(receipt, { type: "CLOSE_PDP" })).toMatchObject({
      baseSurface: "feed",
      overlay: "none",
      pdpProductId: null,
      pdpEntrySource: null,
    });
  });

  it("ignores commerce overlays when the PDP is not active", () => {
    const state = feedState();

    expect(
      demoNavigationReducer(state, { type: "OPEN_CART_CONFIRM" }),
    ).toBe(state);
    expect(demoNavigationReducer(state, { type: "SHOW_RECEIPT" })).toBe(state);
  });

  it("persists guide scroll, video snapshots, and the shared notice", () => {
    const scrolled = demoNavigationReducer(feedState(), {
      type: "SAVE_GUIDE_SCROLL",
      scrollTop: 218.5,
    });
    const snapshotted = demoNavigationReducer(scrolled, {
      type: "SAVE_VIDEO_SNAPSHOT",
      itemId: "feed-uv-morning-001",
      snapshot: { currentTime: 4.75, paused: false, muted: true },
    });
    const noticed = demoNavigationReducer(snapshotted, {
      type: "SHOW_NOTICE",
      message: "搜索不在本次概念原型范围内",
    });

    expect(noticed.guideScrollTop).toBe(218.5);
    expect(noticed.videoSnapshots["feed-uv-morning-001"]).toEqual({
      currentTime: 4.75,
      paused: false,
      muted: true,
    });
    expect(noticed.notice).toBe("搜索不在本次概念原型范围内");
    expect(
      demoNavigationReducer(noticed, { type: "CLEAR_NOTICE" }).notice,
    ).toBeNull();
  });
});

describe("video snapshot restoration", () => {
  it("records currentTime, paused, and muted before pausing", () => {
    const video = document.createElement("video");
    video.currentTime = 5.5;
    video.muted = false;
    Object.defineProperty(video, "paused", { configurable: true, value: false });
    const pause = vi.fn();
    Object.defineProperty(video, "pause", { configurable: true, value: pause });

    expect(captureAndPauseVideo(video)).toEqual({
      currentTime: 5.5,
      paused: false,
      muted: false,
    });
    expect(pause).toHaveBeenCalledOnce();
  });

  it("restores time within 0.25 seconds and resumes prior play and mute state", async () => {
    const video = document.createElement("video");
    const play = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(video, "play", { configurable: true, value: play });

    await restoreVideoSnapshot(video, {
      currentTime: 7.25,
      paused: false,
      muted: false,
    });

    expect(Math.abs(video.currentTime - 7.25)).toBeLessThanOrEqual(0.25);
    expect(video.muted).toBe(false);
    expect(play).toHaveBeenCalledOnce();
  });

  it("restores a paused video without playing it", async () => {
    const video = document.createElement("video");
    const pause = vi.fn();
    const play = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(video, "pause", { configurable: true, value: pause });
    Object.defineProperty(video, "play", { configurable: true, value: play });

    await restoreVideoSnapshot(video, {
      currentTime: 1.5,
      paused: true,
      muted: true,
    });

    expect(pause).toHaveBeenCalledOnce();
    expect(play).not.toHaveBeenCalled();
    expect(video.muted).toBe(true);
  });

  it("does not crash when video.play() is rejected", async () => {
    const video = document.createElement("video");
    Object.defineProperty(video, "play", {
      configurable: true,
      value: vi.fn().mockRejectedValue(new Error("autoplay blocked")),
    });

    await expect(
      restoreVideoSnapshot(video, {
        currentTime: 3,
        paused: false,
        muted: true,
      }),
    ).resolves.toBeUndefined();
  });
});
