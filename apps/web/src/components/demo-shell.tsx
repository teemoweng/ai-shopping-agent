"use client";

import type { components } from "@shopping-guide/contracts/src/api";
import {
  useCallback,
  useEffect,
  useReducer,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import { getFeed, getProduct } from "@/lib/api-client";
import {
  createInitialNavigationState,
  demoNavigationReducer,
  type BaseSurface,
  type Overlay,
  type ProductRole,
  type VideoSnapshot,
} from "@/lib/demo-navigation";

import { ConceptBoundaryToast } from "./concept-boundary-toast";
import { GuideSheet } from "./guide-sheet";
import {
  PdpScreen,
  type CommerceReceiptSignal,
  type PendingCommerceReconciliation,
} from "./pdp-screen";
import {
  ShortVideoFeed,
  type ShortVideoFeedHandle,
} from "./short-video-feed";

type FeedResponse = components["schemas"]["FeedResponse"];
type FeedItem = components["schemas"]["CatalogFeedItemResponse"];
type ProductDetailResponse = components["schemas"]["ProductDetailResponse"];

export type DemoScenarioName =
  | "normal"
  | "price-changed"
  | "out-of-stock"
  | "commit-status-unknown";

export interface DemoScenarioConfig {
  name: DemoScenarioName;
  preview: "NORMAL" | "PRICE_CHANGED" | "OUT_OF_STOCK";
  confirm: "NORMAL" | "COMMIT_STATUS_UNKNOWN";
}

const DEMO_SCENARIOS: Record<DemoScenarioName, DemoScenarioConfig> = {
  normal: { name: "normal", preview: "NORMAL", confirm: "NORMAL" },
  "price-changed": {
    name: "price-changed",
    preview: "PRICE_CHANGED",
    confirm: "NORMAL",
  },
  "out-of-stock": {
    name: "out-of-stock",
    preview: "OUT_OF_STOCK",
    confirm: "NORMAL",
  },
  "commit-status-unknown": {
    name: "commit-status-unknown",
    preview: "NORMAL",
    confirm: "COMMIT_STATUS_UNKNOWN",
  },
};

const subscribeToStaticLocation = () => () => {};
const getBrowserSearch = () => window.location.search;
const getServerSearch = () => "";

export function parseDemoScenario(search: string): DemoScenarioConfig {
  const value = new URLSearchParams(search).get("scenario") ?? "normal";
  return DEMO_SCENARIOS[value as DemoScenarioName] ?? DEMO_SCENARIOS.normal;
}

export function interviewStepFor(state: {
  baseSurface: BaseSurface;
  overlay: Overlay;
}): string {
  if (state.overlay === "ai-sheet") return "轻量商品对话";
  if (state.overlay === "cart-confirm") return "价格库存复核与确认";
  if (state.overlay === "receipt") return "模拟加购回执";
  if (state.baseSurface === "pdp") return "商品详情与规格选择";
  return "短视频内容流";
}

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

export function applyCommerceReceiptOnce(
  currentCount: number,
  countedReceiptIds: Set<string>,
  receipt: CommerceReceiptSignal,
): number {
  if (countedReceiptIds.has(receipt.receiptId)) {
    return currentCount;
  }
  countedReceiptIds.add(receipt.receiptId);
  return currentCount + receipt.quantity;
}

export function DemoShell() {
  const [navigation, dispatch] = useReducer(
    demoNavigationReducer,
    undefined,
    createInitialNavigationState,
  );
  const [loadState, setLoadState] = useState<FeedLoadState>({ status: "loading" });
  const demoScenario = parseDemoScenario(
    useSyncExternalStore(
      subscribeToStaticLocation,
      getBrowserSearch,
      getServerSearch,
    ),
  );
  const [freshStartingPriceByProductId, setFreshStartingPriceByProductId] = useState<
    Record<string, number | null>
  >({});
  const [pdpFeedReturn, setPdpFeedReturn] = useState<PdpFeedReturn | null>(null);
  const [guideContentContextId, setGuideContentContextId] = useState(
    "morning-routine-uv-001",
  );
  const [guideMediaRestore, setGuideMediaRestore] =
    useState<GuideMediaRestore | null>(null);
  const [verifiedGuideTurn, setVerifiedGuideTurn] = useState<
    components["schemas"]["GuideTurnResponse"] | null
  >(null);
  const [pdpGuideCandidate, setPdpGuideCandidate] = useState<{
    sessionId: string;
    guideRevision: number;
    productRole: ProductRole;
  } | null>(null);
  const [cartCount, setCartCount] = useState(0);
  const [pendingCommerceReconciliation, setPendingCommerceReconciliation] =
    useState<PendingCommerceReconciliation | null>(null);
  const countedReceiptIdsRef = useRef(new Set<string>());
  const feedRef = useRef<ShortVideoFeedHandle>(null);
  const guideFocusTimerRef = useRef<number | null>(null);
  const pdpBackRef = useRef<HTMLButtonElement | null>(null);
  const loadVersionRef = useRef(0);
  const setPdpBackButton = useCallback((node: HTMLButtonElement | null) => {
    pdpBackRef.current = node;
  }, []);

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
      productId:
        pendingCommerceReconciliation?.operation.product_id ?? productId,
      entrySource: "feed",
      productRole: "current",
    });
    setPdpGuideCandidate(null);
    if (pendingCommerceReconciliation) {
      showNotice("请先查询上一笔模拟加购的最终结果");
    }
  }

  function openProductFromGuide(productId: string, role: ProductRole) {
    setPdpGuideCandidate(
      !pendingCommerceReconciliation && verifiedGuideTurn
        ? {
            sessionId: verifiedGuideTurn.session_id,
            guideRevision: verifiedGuideTurn.guide_revision,
            productRole: role,
          }
        : null,
    );
    dispatch({
      type: "OPEN_PDP",
      productId:
        pendingCommerceReconciliation?.operation.product_id ?? productId,
      entrySource: "ai",
      productRole: role,
    });
    if (pendingCommerceReconciliation) {
      showNotice("请先查询上一笔模拟加购的最终结果");
    }
  }

  function handleCommerceReceipt(receipt: CommerceReceiptSignal) {
    setPendingCommerceReconciliation(null);
    const receiptDelta = applyCommerceReceiptOnce(
      0,
      countedReceiptIdsRef.current,
      receipt,
    );
    if (receiptDelta > 0) {
      setCartCount((current) => current + receiptDelta);
    }
    dispatch({ type: "SHOW_RECEIPT" });
  }

  function openCommerceOverlay() {
    dispatch({ type: "OPEN_CART_CONFIRM" });
  }

  function continueBrowsing() {
    if (navigation.pdpEntrySource === "ai" && guideMediaRestore) {
      setPdpFeedReturn({
        itemId: guideMediaRestore.itemId,
        snapshot: guideMediaRestore.snapshot,
      });
      setGuideMediaRestore(null);
      setPdpGuideCandidate(null);
    }
    dispatch({ type: "CLOSE_PDP" });
  }

  return (
    <main className="interviewStage">
      <section
        className="phoneFrame"
        aria-label="TikTok Shop-inspired Concept Prototype"
        aria-hidden={navigation.overlay !== "none" ? true : undefined}
        data-base-surface={navigation.baseSurface}
        data-overlay={navigation.overlay}
        inert={navigation.overlay !== "none"}
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
          <PdpScreen
            productId={navigation.pdpProductId!}
            entrySource={navigation.pdpEntrySource!}
            productRole={navigation.productRole!}
            guideCandidate={pdpGuideCandidate}
            pendingReconciliation={pendingCommerceReconciliation}
            onPendingReconciliationChange={setPendingCommerceReconciliation}
            backButtonRef={setPdpBackButton}
            onBack={() => dispatch({ type: "CLOSE_PDP" })}
            onNotice={showNotice}
            onOpenCommerceOverlay={openCommerceOverlay}
            onCommerceReceipt={handleCommerceReceipt}
            overlay={navigation.overlay}
            onCloseOverlay={() => dispatch({ type: "CLOSE_OVERLAY" })}
            onContinueBrowsing={continueBrowsing}
            cartCount={cartCount}
            previewScenario={demoScenario.preview}
            confirmScenario={demoScenario.confirm}
          />
        ) : null}

        <ConceptBoundaryToast
          message={navigation.notice}
          onClose={() => dispatch({ type: "CLEAR_NOTICE" })}
        />
      </section>

      <aside className="interviewPanel" aria-label="演示说明">
        <header>
          <span>PORTFOLIO WALKTHROUGH</span>
          <h1>内容电商 AI 导购概念原型</h1>
          <p>
            面向美国 K-Beauty 防晒决策；手机内用轻量对话逐步展开答案、推荐与比较，不是静态截图或第二套桌面 App。
          </p>
        </header>
        <section className="interviewCurrentStep" aria-labelledby="current-step-title">
          <span id="current-step-title">当前步骤</span>
          <strong data-testid="current-demo-step">
            {interviewStepFor(navigation)}
          </strong>
        </section>
        <div className="interviewMaturity">
          <section>
            <span>已实现 · 确定性</span>
            <ul>
              <li>受控 Workflow 与白名单动作</li>
              <li>结构化价格、库存与规格事实</li>
              <li>显式复核、幂等加购与结果对账</li>
            </ul>
          </section>
          <section>
            <span>未来能力 · 未验证</span>
            <ul>
              <li>真实 LLM Shopping Agent</li>
              <li>Hybrid RAG 与多模态实时理解</li>
              <li>真实用户效果与业务指标</li>
            </ul>
          </section>
        </div>
        <nav className="scenarioLinks" aria-label="确定性演示场景">
          <span>公开测试场景</span>
          {(
            [
              ["normal", "正常路径"],
              ["price-changed", "价格变化"],
              ["out-of-stock", "规格缺货"],
              ["commit-status-unknown", "结果待对账"],
            ] as const
          ).map(([scenario, label]) => (
            <a
              key={scenario}
              href={`/?scenario=${scenario}`}
              aria-current={demoScenario.name === scenario ? "page" : undefined}
            >
              <span>{label}</span>
              <small>{scenario}</small>
            </a>
          ))}
        </nav>
        <footer>
          概念原型 · 合成商品与创作者 · 未接入 TikTok、支付或真实库存
        </footer>
      </aside>

      <div
        className="phoneOverlayHost"
        data-active={
          navigation.overlay === "cart-confirm" || navigation.overlay === "receipt"
            ? true
            : undefined
        }
      />

      <GuideSheet
        open={navigation.overlay === "ai-sheet"}
        onClose={closeGuide}
        contentContextId={guideContentContextId}
        initialScrollTop={navigation.guideScrollTop}
        onScrollTopChange={(scrollTop) =>
          dispatch({ type: "SAVE_GUIDE_SCROLL", scrollTop })
        }
        onOpenProduct={openProductFromGuide}
        onVerifiedTurnChange={setVerifiedGuideTurn}
      />
    </main>
  );
}
