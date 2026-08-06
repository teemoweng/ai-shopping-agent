"use client";

import type { components } from "@shopping-guide/contracts/src/api";
import { useCallback, useEffect, useReducer, useRef, useState } from "react";

import { getFeed, getProduct } from "@/lib/api-client";
import {
  createInitialNavigationState,
  demoNavigationReducer,
  type ProductRole,
  type VideoSnapshot,
} from "@/lib/demo-navigation";

import { ConceptBoundaryToast } from "./concept-boundary-toast";
import { GuideSheet } from "./guide-sheet";
import {
  ShortVideoFeed,
  type ShortVideoFeedHandle,
} from "./short-video-feed";

type FeedResponse = components["schemas"]["FeedResponse"];
type FeedItem = components["schemas"]["CatalogFeedItemResponse"];
type ProductDetailResponse = components["schemas"]["ProductDetailResponse"];

type FeedLoadState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; feed: FeedResponse };

interface GuideMediaRestore {
  itemId: string;
  snapshot: VideoSnapshot | null;
}

interface PdpFeedReturn {
  itemId: string;
  snapshot: VideoSnapshot | null;
}

function putShoppableItemFirst(items: FeedItem[]): FeedItem[] {
  const shoppableIndex = items.findIndex(
    (item) => item.commerce_status === "available" && item.anchor_product,
  );
  if (shoppableIndex <= 0) {
    return items;
  }
  return [
    items[shoppableIndex],
    ...items.filter((_, index) => index !== shoppableIndex),
  ];
}

function hasFreshFacts(detail: ProductDetailResponse, now = Date.now()): boolean {
  const observedAt = Date.parse(detail.freshness.observed_at);
  const expiresAt = Date.parse(detail.freshness.expires_at);
  return (
    Number.isFinite(observedAt) &&
    Number.isFinite(expiresAt) &&
    observedAt <= now &&
    expiresAt > now
  );
}

export function DemoShell() {
  const [navigation, dispatch] = useReducer(
    demoNavigationReducer,
    undefined,
    createInitialNavigationState,
  );
  const [loadState, setLoadState] = useState<FeedLoadState>({ status: "loading" });
  const [freshStartingPriceByProductId, setFreshStartingPriceByProductId] = useState<
    Record<string, number | null>
  >({});
  const [pdpFeedReturn, setPdpFeedReturn] = useState<PdpFeedReturn | null>(null);
  const [guideContentContextId, setGuideContentContextId] = useState(
    "morning-routine-uv-001",
  );
  const [guideMediaRestore, setGuideMediaRestore] =
    useState<GuideMediaRestore | null>(null);
  const feedRef = useRef<ShortVideoFeedHandle>(null);
  const guideFocusTimerRef = useRef<number | null>(null);
  const pdpBackRef = useRef<HTMLButtonElement | null>(null);
  const loadVersionRef = useRef(0);

  const loadCatalog = useCallback(async () => {
    const loadVersion = ++loadVersionRef.current;
    setLoadState({ status: "loading" });
    try {
      const response = await getFeed();
      const items = putShoppableItemFirst(response.items);
      const productIds = Array.from(
        new Set(
          items
            .map((item) => item.anchor_product_id)
            .filter((productId): productId is string => Boolean(productId)),
        ),
      );
      const productResults = await Promise.allSettled(
        productIds.map(async (productId) => ({
          productId,
          detail: await getProduct(productId),
        })),
      );
      if (loadVersionRef.current !== loadVersion) {
        return;
      }

      const freshStartingPrices: Record<string, number | null> = {};
      let productFactsUnavailable = false;
      for (const result of productResults) {
        if (result.status === "fulfilled") {
          freshStartingPrices[result.value.productId] = hasFreshFacts(
            result.value.detail,
          )
            ? result.value.detail.starting_price_usd
            : null;
        } else {
          productFactsUnavailable = true;
        }
      }
      setFreshStartingPriceByProductId(freshStartingPrices);
      setLoadState({ status: "ready", feed: { ...response, items } });
      if (productFactsUnavailable) {
        dispatch({
          type: "SHOW_NOTICE",
          message: "部分商品价格暂时无法核实，已隐藏价格",
        });
      }
    } catch {
      if (loadVersionRef.current === loadVersion) {
        setLoadState({ status: "error" });
      }
    }
  }, []);

  useEffect(() => {
    const startTimer = window.setTimeout(() => void loadCatalog(), 0);
    return () => {
      window.clearTimeout(startTimer);
      loadVersionRef.current += 1;
      if (guideFocusTimerRef.current !== null) {
        window.clearTimeout(guideFocusTimerRef.current);
      }
    };
  }, [loadCatalog]);

  useEffect(() => {
    if (!navigation.notice) {
      return;
    }
    const timer = window.setTimeout(() => {
      dispatch({ type: "CLEAR_NOTICE" });
    }, 3600);
    return () => window.clearTimeout(timer);
  }, [navigation.notice]);

  useEffect(() => {
    if (navigation.baseSurface === "pdp") {
      pdpBackRef.current?.focus();
    }
  }, [navigation.baseSurface]);

  useEffect(() => {
    if (
      navigation.baseSurface !== "feed" ||
      loadState.status !== "ready" ||
      !pdpFeedReturn
    ) {
      return;
    }
    feedRef.current?.focusProduct(pdpFeedReturn.itemId);
    const clearReturnTimer = window.setTimeout(() => {
      setPdpFeedReturn(null);
    }, 0);
    return () => window.clearTimeout(clearReturnTimer);
  }, [loadState.status, navigation.baseSurface, pdpFeedReturn]);

  function showNotice(message: string) {
    dispatch({ type: "SHOW_NOTICE", message });
  }

  function openGuide(item: FeedItem) {
    if (!item.content_context_id) {
      showNotice("这条普通内容没有商品或 AI 导购入口");
      return;
    }
    const snapshot = feedRef.current?.capture(item.id) ?? null;
    setGuideMediaRestore({ itemId: item.id, snapshot });
    if (snapshot) {
      dispatch({
        type: "SAVE_VIDEO_SNAPSHOT",
        itemId: item.id,
        snapshot,
      });
    }
    setGuideContentContextId(item.content_context_id);
    dispatch({ type: "OPEN_GUIDE" });
  }

  function closeGuide() {
    dispatch({ type: "CLOSE_GUIDE" });
    const restore = guideMediaRestore;
    setGuideMediaRestore(null);
    if (restore?.snapshot) {
      void feedRef.current?.restore(restore.itemId, restore.snapshot);
    }
    if (restore) {
      if (guideFocusTimerRef.current !== null) {
        window.clearTimeout(guideFocusTimerRef.current);
      }
      guideFocusTimerRef.current = window.setTimeout(() => {
        feedRef.current?.focusAskAi(restore.itemId);
        guideFocusTimerRef.current = null;
      }, 0);
    }
  }

  function openProduct(productId: string, item: FeedItem) {
    const snapshot = feedRef.current?.capture(item.id) ?? null;
    setPdpFeedReturn({ itemId: item.id, snapshot });
    if (snapshot) {
      dispatch({
        type: "SAVE_VIDEO_SNAPSHOT",
        itemId: item.id,
        snapshot,
      });
    }
    dispatch({
      type: "OPEN_PDP",
      productId,
      entrySource: "feed",
      productRole: "current",
    });
  }

  function openProductFromGuide(productId: string, role: ProductRole) {
    dispatch({
      type: "OPEN_PDP",
      productId,
      entrySource: "ai",
      productRole: role,
    });
  }

  return (
    <main className="interviewStage">
      <section
        className="phoneFrame"
        aria-label="TikTok Shop-inspired Concept Prototype"
        aria-hidden={navigation.overlay === "ai-sheet" ? true : undefined}
        data-base-surface={navigation.baseSurface}
        data-overlay={navigation.overlay}
        inert={navigation.overlay === "ai-sheet"}
      >
        {loadState.status === "loading" ? (
          <div className="feedLoadState" role="status">
            <span className="feedLoadPulse" aria-hidden="true" />
            <strong>正在加载内容</strong>
            <small>本地许可视频与合成商品数据</small>
          </div>
        ) : null}

        {loadState.status === "error" ? (
          <div className="feedLoadState feedLoadError" role="alert">
            <span aria-hidden="true">!</span>
            <strong>内容暂时无法加载</strong>
            <small>没有显示未经核实的商品或价格。</small>
            <button type="button" onClick={() => void loadCatalog()}>
              重新加载
            </button>
          </div>
        ) : null}

        {loadState.status === "ready" && navigation.baseSurface === "feed" ? (
          <ShortVideoFeed
            ref={feedRef}
            items={loadState.feed.items}
            feedTabs={loadState.feed.feed_tabs}
            bottomNavVariant={loadState.feed.bottom_nav_variant}
            activeIndex={navigation.feedIndex}
            freshStartingPriceByProductId={freshStartingPriceByProductId}
            initialVideoRestore={
              navigation.overlay === "ai-sheet" &&
              guideMediaRestore?.snapshot
                ? {
                    itemId: guideMediaRestore.itemId,
                    snapshot: {
                      ...guideMediaRestore.snapshot,
                      paused: true,
                    },
                  }
                : pdpFeedReturn?.snapshot
                ? {
                    itemId: pdpFeedReturn.itemId,
                    snapshot: pdpFeedReturn.snapshot,
                  }
                : null
            }
            onFeedIndexChange={(index) =>
              dispatch({ type: "SET_FEED_INDEX", index })
            }
            onOpenProduct={openProduct}
            onAskAi={openGuide}
            onNotice={showNotice}
          />
        ) : null}

        {loadState.status === "ready" && navigation.baseSurface === "pdp" ? (
          <section
            className="pdpNavigationScaffold"
            role="region"
            aria-label="商品详情"
          >
            <header>
              <button
                ref={pdpBackRef}
                type="button"
                aria-label="返回内容流"
                onClick={() => dispatch({ type: "CLOSE_PDP" })}
              >
                ‹
              </button>
              <strong>商品详情</strong>
              <span>概念原型</span>
            </header>
            <div>
              <span className="pdpScaffoldEyebrow">PDP NAVIGATION SURFACE</span>
              <h1>{navigation.pdpProductId}</h1>
              <p>商品事实、SKU 与独立模拟加购流程将在下一层商品页承接。</p>
            </div>
          </section>
        ) : null}

        <ConceptBoundaryToast
          message={navigation.notice}
          onClose={() => dispatch({ type: "CLEAR_NOTICE" })}
        />
      </section>

      <GuideSheet
        open={navigation.overlay === "ai-sheet"}
        onClose={closeGuide}
        contentContextId={guideContentContextId}
        initialScrollTop={navigation.guideScrollTop}
        onScrollTopChange={(scrollTop) =>
          dispatch({ type: "SAVE_GUIDE_SCROLL", scrollTop })
        }
        onOpenProduct={openProductFromGuide}
      />
    </main>
  );
}
