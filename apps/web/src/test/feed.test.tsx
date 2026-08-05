import type { components } from "@shopping-guide/contracts/src/api";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DemoShell } from "@/components/demo-shell";
import { ShortVideoFeed } from "@/components/short-video-feed";
import {
  createGuideSession,
  getFeed,
  getProduct,
} from "@/lib/api-client";

vi.mock("@/lib/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api-client")>();
  return {
    ...actual,
    createGuideSession: vi.fn(),
    getFeed: vi.fn(),
    getProduct: vi.fn(),
  };
});

type FeedResponse = components["schemas"]["FeedResponse"];
type ProductDetailResponse = components["schemas"]["ProductDetailResponse"];

const FEED: FeedResponse = {
  feed_tabs: ["For You", "Following"],
  bottom_nav_variant: "shopping-agent",
  items: [
    {
      id: "feed-uv-morning-001",
      synthetic: true,
      creator_handle: "@routine.notes",
      creator_display_name: "Routine Notes",
      caption_zh: "潮湿通勤前的轻薄防晒步骤：妆前使用感和防水需求要分开看。",
      media: {
        kind: "video",
        src: "/demo/feed-commerce.mp4",
        poster_src: "/demo/feed-commerce-poster.jpg",
        alt_zh: "创作者在早晨护肤步骤中展示合成防晒商品的视频",
        license_ref: "Pexels License",
      },
      engagement: {
        likes: 24800,
        comments: 642,
        favorites: 3100,
        shares: 488,
      },
      content_context_id: "morning-routine-uv-001",
      anchor_product_id: "seoul-shade-daily-fluid",
      commerce_status: "available",
      anchor_product: {
        id: "seoul-shade-daily-fluid",
        brand: "Mirae Lab",
        name: "Seoul Shade Daily Fluid With An Intentionally Long Name",
        display_name_zh: "首尔轻透通勤防晒乳",
        starting_price_usd: 14,
        image_src: "/demo/product-seoul-shade.svg",
      },
    },
    {
      id: "feed-city-style-002",
      synthetic: true,
      creator_handle: "@city.frames",
      creator_display_name: "City Frames",
      caption_zh: "傍晚街头的层次穿搭记录。",
      media: {
        kind: "video",
        src: "/demo/feed-normal.mp4",
        poster_src: "/demo/feed-normal-poster.jpg",
        alt_zh: "创作者在城市街头展示穿搭的视频",
        license_ref: "Pexels License",
      },
      engagement: {
        likes: 12600,
        comments: 218,
        favorites: 850,
        shares: 104,
      },
      content_context_id: null,
      anchor_product_id: null,
      commerce_status: "none",
      anchor_product: null,
    },
  ],
};

const PRODUCT_DETAIL = {
  freshness: {
    facts_version: "catalog-v1",
    observed_at: "2026-08-05T09:00:00Z",
    expires_at: "2099-08-12T09:00:00Z",
  },
  starting_price_usd: 14,
  synthetic_disclosure: true,
  product: {},
} as ProductDetailResponse;

function renderFeed(
  overrides: Partial<React.ComponentProps<typeof ShortVideoFeed>> = {},
) {
  const props: React.ComponentProps<typeof ShortVideoFeed> = {
    items: FEED.items,
    feedTabs: FEED.feed_tabs,
    bottomNavVariant: FEED.bottom_nav_variant,
    activeIndex: 0,
    priceFreshByProductId: { "seoul-shade-daily-fluid": true },
    onFeedIndexChange: vi.fn(),
    onOpenProduct: vi.fn(),
    onAskAi: vi.fn(),
    onNotice: vi.fn(),
    ...overrides,
  };
  return { ...render(<ShortVideoFeed {...props} />), props };
}

beforeEach(() => {
  vi.mocked(getFeed).mockResolvedValue(FEED);
  vi.mocked(getProduct).mockResolvedValue(PRODUCT_DETAIL);
  vi.mocked(createGuideSession).mockImplementation(
    () => new Promise(() => undefined),
  );
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  Object.defineProperty(navigator, "share", {
    configurable: true,
    value: undefined,
  });
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: undefined,
  });
});

describe("Chinese short-video Feed", () => {
  it("renders real looping inline videos in a two-item vertical feed", () => {
    renderFeed();

    const items = screen.getAllByTestId("feed-item");
    const videos = screen.getAllByTestId("feed-video") as HTMLVideoElement[];
    expect(items).toHaveLength(2);
    expect(videos).toHaveLength(2);
    for (const video of videos) {
      expect(video).toHaveAttribute("playsinline");
      expect(video).toHaveAttribute("loop");
      expect(video.muted).toBe(true);
    }
    expect(items[0]).toHaveAttribute("data-commerce-status", "available");
    expect(items[1]).toHaveAttribute("data-commerce-status", "none");
  });

  it("localizes configured navigation and keeps the normal item free of commerce and AI", () => {
    renderFeed();

    expect(screen.getByRole("navigation", { name: "内容频道" })).toHaveTextContent(
      "为你推荐",
    );
    expect(screen.getByRole("navigation", { name: "内容频道" })).toHaveTextContent(
      "关注",
    );
    const [shoppable, normal] = screen.getAllByTestId("feed-item");
    expect(within(shoppable).getByRole("group", { name: "可购物商品" })).toBeVisible();
    expect(within(normal).queryByRole("group", { name: "可购物商品" })).toBeNull();
    expect(within(normal).queryByRole("button", { name: /问 AI/ })).toBeNull();
    expect(within(normal).queryByRole("button", { name: /查看商品/ })).toBeNull();
  });

  it("uses two distinct 44px product and AI hit areas", async () => {
    const user = userEvent.setup();
    const onOpenProduct = vi.fn();
    const onAskAi = vi.fn();
    renderFeed({ onOpenProduct, onAskAi });

    const product = screen.getByRole("button", {
      name: /查看商品 Seoul Shade Daily Fluid/,
    });
    const askAi = screen.getByRole("button", {
      name: /问 AI：Seoul Shade Daily Fluid/,
    });
    expect(product).not.toBe(askAi);
    expect(product).toHaveStyle({ minHeight: "44px" });
    expect(askAi).toHaveStyle({ minHeight: "44px" });

    await user.click(product);
    expect(onOpenProduct).toHaveBeenCalledWith("seoul-shade-daily-fluid");
    await user.click(askAi);
    expect(onAskAi).toHaveBeenCalledWith(FEED.items[0]);
  });

  it("truncates the original English name and renders price only when fresh", () => {
    const { rerender, props } = renderFeed({
      priceFreshByProductId: { "seoul-shade-daily-fluid": false },
    });

    const name = screen.getByText(
      "Seoul Shade Daily Fluid With An Intentionally Long Name",
    );
    expect(name).toHaveClass("productAnchorName");
    expect(screen.queryByText("$14.00 起")).toBeNull();

    rerender(
      <ShortVideoFeed
        {...props}
        priceFreshByProductId={{ "seoul-shade-daily-fluid": true }}
      />,
    );
    expect(
      screen.getByText((_, element) =>
        Boolean(
          element?.tagName === "SMALL" &&
            element.textContent?.startsWith("$14.00 起"),
        ),
      ),
    ).toBeVisible();
  });

  it("toggles like and save locally", async () => {
    const user = userEvent.setup();
    renderFeed();

    const like = screen.getAllByRole("button", { name: "点赞" })[0];
    const save = screen.getAllByRole("button", { name: "收藏" })[0];
    expect(like).toHaveAttribute("aria-pressed", "false");
    expect(save).toHaveAttribute("aria-pressed", "false");

    await user.click(like);
    await user.click(save);
    expect(screen.getAllByRole("button", { name: "取消点赞" })[0]).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getAllByRole("button", { name: "取消收藏" })[0]).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("opens and closes a read-only synthetic comments drawer", async () => {
    const user = userEvent.setup();
    renderFeed();

    await user.click(screen.getAllByRole("button", { name: "查看评论" })[0]);
    const drawer = screen.getByRole("dialog", { name: "合成评论" });
    expect(drawer).toHaveTextContent("只读演示");
    expect(drawer).toHaveTextContent("所有评论均为合成内容");

    await user.click(within(drawer).getByRole("button", { name: "关闭评论" }));
    expect(screen.queryByRole("dialog", { name: "合成评论" })).toBeNull();
  });

  it("closes comments with Escape and returns focus to its trigger", async () => {
    const user = userEvent.setup();
    renderFeed();
    const trigger = screen.getAllByRole("button", { name: "查看评论" })[0];

    await user.click(trigger);
    const drawer = screen.getByRole("dialog", { name: "合成评论" });
    expect(within(drawer).getByRole("button", { name: "关闭评论" })).toHaveFocus();

    fireEvent.keyDown(drawer, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "合成评论" })).toBeNull();
    expect(trigger).toHaveFocus();
  });

  it("toggles the current video's sound", async () => {
    const user = userEvent.setup();
    renderFeed();
    const firstVideo = screen.getAllByTestId("feed-video")[0] as HTMLVideoElement;

    expect(firstVideo.muted).toBe(true);
    await user.click(screen.getAllByRole("button", { name: "打开声音" })[0]);
    expect(firstVideo.muted).toBe(false);
    expect(screen.getAllByRole("button", { name: "静音" })[0]).toBeVisible();
  });

  it("uses Web Share and reports the result through the shared notice", async () => {
    const user = userEvent.setup();
    const onNotice = vi.fn();
    const share = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "share", { configurable: true, value: share });
    renderFeed({ onNotice });

    await user.click(screen.getAllByRole("button", { name: "分享" })[0]);
    await waitFor(() =>
      expect(onNotice).toHaveBeenCalledWith("已打开系统分享"),
    );
    expect(share).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Routine Notes", text: FEED.items[0].caption_zh }),
    );
  });

  it("falls back to copying a share link when Web Share is unavailable", async () => {
    const user = userEvent.setup();
    const onNotice = vi.fn();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "share", { configurable: true, value: undefined });
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    renderFeed({ onNotice });

    await user.click(screen.getAllByRole("button", { name: "分享" })[0]);
    await waitFor(() => expect(onNotice).toHaveBeenCalledWith("演示链接已复制"));
    expect(writeText).toHaveBeenCalledOnce();
  });

  it("routes follow, search, and every bottom navigation control to the shared notice", async () => {
    const user = userEvent.setup();
    const onNotice = vi.fn();
    renderFeed({ onNotice });

    await user.click(screen.getAllByRole("button", { name: "关注 Routine Notes" })[0]);
    await user.click(screen.getByRole("button", { name: "搜索" }));
    for (const label of ["首页", "商城", "发布", "消息", "我的"]) {
      await user.click(screen.getByRole("button", { name: label }));
    }

    expect(onNotice).toHaveBeenCalledTimes(7);
    expect(onNotice.mock.calls.every(([message]) => message.includes("概念原型"))).toBe(
      true,
    );
  });

  it("falls back to the same-source poster on media error without disabling commerce", () => {
    const onNotice = vi.fn();
    renderFeed({ onNotice });

    fireEvent.error(screen.getAllByTestId("feed-video")[0]);
    expect(
      screen.getByRole("img", {
        name: "创作者在早晨护肤步骤中展示合成防晒商品的视频",
      }),
    ).toHaveAttribute("src", "/demo/feed-commerce-poster.jpg");
    expect(onNotice).toHaveBeenCalledWith("视频暂时无法播放，已显示同源封面");
    expect(screen.getByRole("button", { name: /查看商品/ })).toBeEnabled();
    expect(screen.getByRole("button", { name: /问 AI/ })).toBeEnabled();
  });
});

describe("DemoShell", () => {
  it("loads catalog data and puts the shoppable item first", async () => {
    vi.mocked(getFeed).mockResolvedValue({
      ...FEED,
      items: [FEED.items[1], FEED.items[0]],
    });
    render(<DemoShell />);

    expect(screen.getByRole("status")).toHaveTextContent("正在加载内容");
    const items = await screen.findAllByTestId("feed-item");
    expect(items[0]).toHaveAttribute("data-commerce-status", "available");
    expect(items[1]).toHaveAttribute("data-commerce-status", "none");
    expect(getProduct).toHaveBeenCalledWith("seoul-shade-daily-fluid");
  });

  it("shows a recoverable catalog error boundary", async () => {
    const user = userEvent.setup();
    vi.mocked(getFeed).mockRejectedValueOnce(new Error("offline"));
    render(<DemoShell />);

    const error = await screen.findByRole("alert");
    expect(error).toHaveTextContent("内容暂时无法加载");
    vi.mocked(getFeed).mockResolvedValueOnce(FEED);
    await user.click(within(error).getByRole("button", { name: "重新加载" }));
    expect(await screen.findByText("Seoul Shade Daily Fluid With An Intentionally Long Name")).toBeVisible();
  });

  it("moves the product entry onto the PDP navigation surface and returns to Feed", async () => {
    const user = userEvent.setup();
    render(<DemoShell />);

    await user.click(
      await screen.findByRole("button", {
        name: /查看商品 Seoul Shade Daily Fluid/,
      }),
    );
    const pdp = screen.getByRole("region", { name: "商品详情" });
    expect(pdp).toHaveTextContent("seoul-shade-daily-fluid");

    await user.click(within(pdp).getByRole("button", { name: "返回内容流" }));
    expect(
      await screen.findByRole("article", { name: "Routine Notes 的短视频" }),
    ).toBeVisible();
  });

  it("captures and pauses media when AI opens, then safely restores it on close", async () => {
    const user = userEvent.setup();
    render(<DemoShell />);
    const video = (await screen.findAllByTestId("feed-video"))[0] as HTMLVideoElement;
    video.currentTime = 6.5;
    video.muted = false;
    Object.defineProperty(video, "paused", { configurable: true, value: false });
    const pause = vi.fn();
    const play = vi.fn().mockRejectedValue(new Error("autoplay blocked"));
    Object.defineProperty(video, "pause", { configurable: true, value: pause });
    Object.defineProperty(video, "play", { configurable: true, value: play });

    await user.click(screen.getByRole("button", { name: /问 AI：/ }));
    expect(await screen.findByRole("dialog", { name: "AI shopping guide" })).toBeVisible();
    expect(pause).toHaveBeenCalledOnce();

    await user.click(screen.getByRole("button", { name: "Close AI shopping guide" }));
    await waitFor(() => expect(play).toHaveBeenCalledOnce());
    expect(Math.abs(video.currentTime - 6.5)).toBeLessThanOrEqual(0.25);
    expect(video.muted).toBe(false);
  });
});
