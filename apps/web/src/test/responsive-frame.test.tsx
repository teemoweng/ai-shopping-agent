import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  DemoShell,
  interviewStepFor,
  parseDemoScenario,
} from "@/components/demo-shell";
import { getFeed, getProduct } from "@/lib/api-client";

vi.mock("@/lib/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api-client")>();
  return {
    ...actual,
    createGuideSession: vi.fn(() => new Promise(() => undefined)),
    getFeed: vi.fn(),
    getGuideSession: vi.fn(() => new Promise(() => undefined)),
    getProduct: vi.fn(),
  };
});

const feed = {
  feed_tabs: ["For You", "Following"],
  bottom_nav_variant: "shopping-agent",
  items: [
    {
      id: "feed-uv-morning-001",
      synthetic: true,
      creator_handle: "@routine.notes",
      creator_display_name: "Routine Notes",
      caption_zh:
        "潮湿通勤前的轻薄防晒步骤：妆前使用感、防水需求和深肤色是否泛白需要分开判断，这是一段用于压力测试的长中文说明。",
      media: {
        kind: "video",
        src: "/demo/feed-commerce.mp4",
        poster_src: "/demo/feed-commerce-poster.jpg",
        alt_zh: "合成防晒商品视频",
        license_ref: "Pexels License",
      },
      engagement: { likes: 24800, comments: 642, favorites: 3100, shares: 488 },
      content_context_id: "morning-routine-uv-001",
      anchor_product_id: "seoul-shade-daily-fluid",
      commerce_status: "available",
      anchor_product: {
        id: "seoul-shade-daily-fluid",
        brand: "Mirae Lab",
        name: "Seoul Shade Daily Fluid With An Intentionally Long English Product Name",
        display_name_zh: "首尔轻透通勤防晒乳",
        starting_price_usd: 14,
        image_src: "/demo/product-seoul-shade.svg",
      },
    },
  ],
} as never;

const product = {
  freshness: {
    facts_version: "catalog-v1",
    observed_at: "2026-08-05T09:00:00Z",
    expires_at: "2099-08-12T09:00:00Z",
  },
  starting_price_usd: 14,
  synthetic_disclosure: true,
} as never;

beforeEach(() => {
  window.history.replaceState({}, "", "/?scenario=normal");
  vi.mocked(getFeed).mockResolvedValue(feed);
  vi.mocked(getProduct).mockResolvedValue(product);
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("disclosed scenario allowlist", () => {
  it.each([
    ["normal", "NORMAL", "NORMAL"],
    ["price-changed", "PRICE_CHANGED", "NORMAL"],
    ["out-of-stock", "OUT_OF_STOCK", "NORMAL"],
    ["commit-status-unknown", "NORMAL", "COMMIT_STATUS_UNKNOWN"],
  ] as const)(
    "maps %s only to its permitted preview and confirm controls",
    (name, preview, confirm) => {
      expect(parseDemoScenario(`?scenario=${name}`)).toEqual({
        name,
        preview,
        confirm,
      });
    },
  );

  it.each(["", "?scenario=", "?scenario=PRICE_CHANGED", "?scenario=other"])(
    "defaults malformed or unlisted query %s to NORMAL",
    (search) => {
      expect(parseDemoScenario(search)).toEqual({
        name: "normal",
        preview: "NORMAL",
        confirm: "NORMAL",
      });
    },
  );
});

describe("single live phone interview frame", () => {
  it("renders one phone and one outside sibling panel with four working scenario links", async () => {
    render(<DemoShell />);

    const phone = document.querySelector(".phoneFrame");
    const panel = screen.getByRole("complementary", { name: "演示说明" });
    expect(document.querySelectorAll(".phoneFrame")).toHaveLength(1);
    expect(phone?.parentElement).toBe(panel.parentElement);
    expect(panel).toHaveTextContent("内容电商 AI 导购概念原型");
    expect(panel).toHaveTextContent("已实现");
    expect(panel).toHaveTextContent("未来能力");

    const links = within(panel).getAllByRole("link");
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "/?scenario=normal",
      "/?scenario=price-changed",
      "/?scenario=out-of-stock",
      "/?scenario=commit-status-unknown",
    ]);
    await waitFor(() => expect(phone).toHaveTextContent("Seoul Shade"));
    expect(phone).not.toHaveTextContent("price-changed");
    expect(phone).not.toHaveTextContent("commit-status-unknown");
  });

  it("shows the current phone step without creating a second product surface", async () => {
    const user = userEvent.setup();
    render(<DemoShell />);
    const panel = screen.getByRole("complementary", { name: "演示说明" });

    expect(within(panel).getByTestId("current-demo-step")).toHaveTextContent(
      "短视频内容流",
    );
    await user.click(
      await screen.findByRole("button", { name: /问 AI：Seoul Shade/ }),
    );
    expect(within(panel).getByTestId("current-demo-step")).toHaveTextContent(
      "AI 导购决策支持",
    );
    const dialog = screen.getByRole("dialog", { name: "AI 导购（概念）" });
    expect(dialog.closest("[inert]")).toBeNull();
    expect(document.querySelectorAll(".feedSurface")).toHaveLength(1);
  });

  it("names every navigation milestone used by the interview panel", () => {
    expect(
      [
        interviewStepFor({ baseSurface: "feed", overlay: "none" }),
        interviewStepFor({ baseSurface: "feed", overlay: "ai-sheet" }),
        interviewStepFor({ baseSurface: "pdp", overlay: "none" }),
        interviewStepFor({ baseSurface: "pdp", overlay: "cart-confirm" }),
        interviewStepFor({ baseSurface: "pdp", overlay: "receipt" }),
      ],
    ).toEqual([
      "短视频内容流",
      "AI 导购决策支持",
      "商品详情与规格选择",
      "价格库存复核与确认",
      "模拟加购回执",
    ]);
  });
});
