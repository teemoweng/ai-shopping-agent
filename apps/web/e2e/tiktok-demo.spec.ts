import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

import { expect, test, type Locator, type Page, type Response } from "@playwright/test";

const EVIDENCE_TIME = new Date("2026-08-07T12:00:00Z");
const SCREENSHOT_DIR = resolve(process.cwd(), "../../artifacts/screenshots");

type CommerceResponse = {
  commerce_view_kind: string;
  operation_status: string;
  transaction_revision: number;
  operation_id: string;
  confirmation_token?: string;
  receipt?: { receipt_id: string; quantity: number };
};

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(EVIDENCE_TIME);
});

async function expectInViewport(locator: Locator) {
  await expect(locator).toBeVisible();
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  const viewport = locator.page().viewportSize();
  expect(viewport).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewport!.width);
  expect(box!.y + box!.height).toBeLessThanOrEqual(viewport!.height);
}

async function gotoFeed(page: Page, scenario = "normal") {
  await page.goto(`/?scenario=${scenario}`);
  await expect(
    page.getByRole("button", { name: /查看商品 Seoul Shade Daily Fluid/ }),
  ).toBeVisible();
}

async function openDirectPdp(page: Page) {
  await page
    .getByRole("button", { name: /查看商品 Seoul Shade Daily Fluid/ })
    .click();
  const pdp = page.getByRole("region", { name: "商品详情" });
  await expect(pdp.getByRole("heading", { name: "Seoul Shade Daily Fluid" })).toBeVisible();
  return pdp;
}

async function openGuide(page: Page) {
  const sessionResponse = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname.endsWith("/guide/sessions"),
  );
  await page
    .getByRole("button", { name: /问问这款：Seoul Shade Daily Fluid/ })
    .click();
  const response = await sessionResponse;
  expect(response.status()).toBe(201);
  const opening = (await response.json()) as {
    guide_view_kind: string;
    guide_revision: number;
    conversation_revision: number;
    allowed_actions: string[];
  };
  expect(opening.guide_view_kind).toBe("OPENING_CONTEXT");
  expect(opening.guide_revision).toBe(1);
  expect(opening.conversation_revision).toBe(1);
  expect(opening.allowed_actions).toEqual(["SEND_MESSAGE", "RETURN_TO_FEED"]);
  const guide = page.getByRole("dialog", { name: "AI 导购（概念）" });
  await expect(guide).toBeVisible();
  await expect(
    guide.getByText("我看到你在看 Seoul Shade。你最想确认什么？"),
  ).toBeVisible();
  const clarificationResponse = page.waitForResponse(
    (candidate) =>
      candidate.request().method() === "POST" &&
      /\/guide\/sessions\/[^/]+\/messages$/.test(
        new URL(candidate.url()).pathname,
      ),
  );
  await guide.getByRole("button", { name: "适合油皮吗？" }).click();
  const clarification = (await (await clarificationResponse).json()) as {
    guide_view_kind: string;
    conversation_revision: number;
  };
  expect(clarification.guide_view_kind).toBe("WAITING_CLARIFICATION");
  expect(clarification.conversation_revision).toBe(
    opening.conversation_revision + 1,
  );
  await expect(
    guide.getByText("主要是日常通勤，还是户外出汗或玩水？"),
  ).toBeVisible();
  await expect(guide.getByLabel("继续提问")).toBeEnabled();
  return guide;
}

async function reachDecision(
  guide: Locator,
  constraints = "预算20美元以内、无香精、自然妆效、日常通勤",
) {
  await guide.getByLabel("继续提问").fill(constraints);
  const responsePromise = guide.page().waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      /\/guide\/sessions\/[^/]+\/messages$/.test(new URL(response.url()).pathname),
  );
  await guide.getByRole("button", { name: "发送消息" }).click();
  const response = await responsePromise;
  expect(response.status()).toBe(200);
  const body = (await response.json()) as {
    guide_view_kind: string;
    guide_revision: number;
    conversation_revision: number;
  };
  expect(body.guide_view_kind).toBe("DECISION_READY");
  expect(body.guide_revision).toBeGreaterThan(0);
  expect(body.conversation_revision).toBeGreaterThan(2);
  await expect(
    guide.getByRole("article", {
      name: "Seoul Shade Daily Fluid 商品建议",
    }),
  ).toBeVisible();
  return body;
}

async function readCommerce(response: Response, expectedStatus: number) {
  expect(response.status()).toBe(expectedStatus);
  return (await response.json()) as CommerceResponse;
}

async function previewCommerce(page: Page) {
  const previewResponse = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname.endsWith("/commerce/cart/preview"),
  );
  await page.getByRole("button", { name: "模拟加入购物车" }).click();
  return readCommerce(await previewResponse, 201);
}

async function confirmCommerce(page: Page) {
  const confirmResponse = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      /\/commerce\/operations\/[^/]+\/items$/.test(new URL(response.url()).pathname),
  );
  await page
    .getByRole("dialog", { name: "复核模拟加购" })
    .getByRole("button", { name: "确认模拟加购" })
    .click();
  return readCommerce(await confirmResponse, 201);
}

async function expectReceipt(page: Page) {
  const receipt = page.getByRole("dialog", { name: "模拟加购回执" });
  await expect(receipt).toBeVisible();
  await expect(receipt).toContainText("模拟加购成功");
  await expect(receipt).toContainText("未创建订单或支付");
  await expect(page.locator('[aria-label="购物车，1 件"]')).toHaveCount(1);
  return receipt;
}

async function stabilizeEvidenceFrame(page: Page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    const videos = Array.from(document.querySelectorAll("video"));
    for (const video of videos) {
      video.pause();
      if (video.readyState === 0) {
        continue;
      }
      try {
        video.currentTime = 0;
        if (video.seeking) {
          await Promise.race([
            new Promise<void>((resolveSeek) =>
              video.addEventListener("seeked", () => resolveSeek(), {
                once: true,
              }),
            ),
            new Promise<void>((resolveTimeout) =>
              window.setTimeout(resolveTimeout, 1_000),
            ),
          ]);
        }
      } catch {
        // The poster remains the deterministic fallback before metadata loads.
      }
    }
  });
  await page.addStyleTag({
    content:
      "*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}",
  });
  await page.evaluate(() => new Promise<void>((resolveFrame) => requestAnimationFrame(() => requestAnimationFrame(() => resolveFrame()))));
}

test.describe("required redesigned journeys", () => {
  test.beforeEach(async ({}, testInfo) => {
    test.skip(testInfo.project.name !== "mobile-chromium", "Transactions run once against the shared in-memory API inventory.");
  });

  test("1. direct Feed → PDP → confirm → one receipt", async ({ page }) => {
    await gotoFeed(page);
    const pdp = await openDirectPdp(page);
    await pdp.getByRole("radio", { name: /50 mL 正装/ }).check();

    const preview = await previewCommerce(page);
    expect(preview.commerce_view_kind).toBe("AWAITING_CONFIRMATION");
    expect(preview.transaction_revision).toBe(1);
    const confirmed = await confirmCommerce(page);
    expect(confirmed.commerce_view_kind).toBe("SUCCEEDED");
    expect(confirmed.operation_status).toBe("SUCCEEDED");
    expect(confirmed.transaction_revision).toBe(preview.transaction_revision);
    expect(confirmed.operation_id).toBe(preview.operation_id);
    expect(confirmed.receipt?.quantity).toBe(1);
    await expectReceipt(page);
  });

  test("2. Feed → AI decision → alternative PDP → restored AI state → Feed", async ({ page }) => {
    await gotoFeed(page);
    const guide = await openGuide(page);
    const decision = await reachDecision(guide);
    await guide.getByRole("button", { name: "看看其他选择" }).click();
    const alternative = guide.getByRole("article", {
      name: "Cloud Veil Mineral SPF 商品建议",
    });
    await alternative.getByRole("button", { name: "看商品" }).click();

    const pdp = page.getByRole("region", { name: "商品详情" });
    await expect(pdp.getByRole("heading", { name: "Cloud Veil Mineral SPF" })).toBeVisible();
    await expect(pdp).toContainText("AI 建议商品");
    await pdp.getByRole("button", { name: "返回内容流" }).click();

    const restored = page.getByRole("dialog", { name: "AI 导购（概念）" });
    await expect(restored.getByRole("region", { name: "其他选择" })).toBeVisible();
    await expect(
      restored.getByRole("article", {
        name: "Cloud Veil Mineral SPF 商品建议",
      }),
    ).toBeVisible();
    expect(decision.guide_revision).toBeGreaterThan(0);
    await restored.getByRole("button", { name: "关闭导购" }).click();
    await expect(
      page.getByRole("button", { name: /问问这款：Seoul Shade/ }),
    ).toBeVisible();
  });

  test("3. AI recommended product → PDP → one receipt", async ({ page }) => {
    await gotoFeed(page);
    const guide = await openGuide(page);
    const decision = await reachDecision(guide);
    const recommended = guide.getByRole("article", {
      name: "Seoul Shade Daily Fluid 商品建议",
    });
    await recommended.getByRole("button", { name: "看商品" }).click();
    await expect(page.getByRole("region", { name: "商品详情" })).toContainText("AI 建议商品");

    const preview = await previewCommerce(page);
    expect(preview.commerce_view_kind).toBe("AWAITING_CONFIRMATION");
    expect(preview.transaction_revision).toBe(1);
    const confirmed = await confirmCommerce(page);
    expect(confirmed.commerce_view_kind).toBe("SUCCEEDED");
    expect(confirmed.transaction_revision).toBe(preview.transaction_revision);
    expect(confirmed.operation_id).toBe(preview.operation_id);
    expect(decision.guide_revision).toBeGreaterThan(0);
    await expectReceipt(page);
  });

  test("4. normal Feed has neither commerce nor AI actions", async ({ page }) => {
    await gotoFeed(page);
    const normalFeed = page.getByRole("article", { name: "City Frames 的短视频" });
    await normalFeed.scrollIntoViewIfNeeded();
    await expect(normalFeed).toBeInViewport();
    await expect(normalFeed.getByRole("group", { name: "可购物商品" })).toHaveCount(0);
    await expect(normalFeed.getByRole("button", { name: /查看商品|问 AI/ })).toHaveCount(0);

    if (process.env.CAPTURE_TIKTOK_REDESIGN_EVIDENCE === "1") {
      await stabilizeEvidenceFrame(page);
      await expectInViewport(normalFeed.getByText("@city.frames"));
      await page.screenshot({
        path: resolve(SCREENSHOT_DIR, "tiktok-redesign-normal-feed.png"),
        fullPage: false,
      });
    }
  });

  test("5. zero match has no cart action and recovers after one relaxation", async ({ page }) => {
    await gotoFeed(page);
    const guide = await openGuide(page);
    await guide.getByLabel("继续提问").fill("预算15美元以内、无香精、80分钟防水");
    const noMatchResponse = page.waitForResponse(
      (response) => response.request().method() === "POST" && /\/messages$/.test(new URL(response.url()).pathname),
    );
    await guide.getByRole("button", { name: "发送消息" }).click();
    const noMatch = (await (await noMatchResponse).json()) as {
      guide_view_kind: string;
      guide_revision: number;
      allowed_actions: string[];
    };
    expect(noMatch.guide_view_kind).toBe("NO_MATCH");
    expect(noMatch.allowed_actions).toEqual([
      "SEND_MESSAGE",
      "RELAX_CONSTRAINT",
      "RETURN_TO_FEED",
    ]);
    await expect(
      guide.getByRole("button", { name: /看商品|比比|模拟加入购物车/ }),
    ).toHaveCount(0);

    const relaxedResponse = page.waitForResponse(
      (response) => response.request().method() === "POST" && /\/messages$/.test(new URL(response.url()).pathname),
    );
    await guide.getByLabel("继续提问").fill("防水不限");
    await guide.getByRole("button", { name: "发送消息" }).click();
    const relaxed = (await (await relaxedResponse).json()) as {
      guide_view_kind: string;
      guide_revision: number;
    };
    expect(relaxed.guide_view_kind).toBe("DECISION_READY");
    expect(relaxed.guide_revision).toBe(noMatch.guide_revision + 1);
    await expect(guide.getByRole("button", { name: "看商品" })).toBeEnabled();
  });

  test("6. safety boundary exposes no comparison, product, or cart business actions", async ({ page }) => {
    await gotoFeed(page);
    const guide = await openGuide(page);
    await guide.getByLabel("继续提问").fill("脸部肿胀并且呼吸困难");
    const responsePromise = page.waitForResponse(
      (response) => response.request().method() === "POST" && /\/messages$/.test(new URL(response.url()).pathname),
    );
    await guide.getByRole("button", { name: "发送消息" }).click();
    const response = await responsePromise;
    expect(response.status()).toBe(200);
    const safety = (await response.json()) as {
      guide_view_kind: string;
      guide_revision: number;
      allowed_actions: string[];
    };
    expect(safety.guide_view_kind).toBe("SAFE_BOUNDARY");
    expect(safety.guide_revision).toBeGreaterThan(0);
    expect(safety.allowed_actions).toEqual(["RETURN_TO_FEED"]);
    await expect(guide.getByLabel("安全提示")).toBeVisible();
    await expect(
      guide.getByRole("button", { name: /看商品|比比|加购/ }),
    ).toHaveCount(0);
  });

  test("7. price change diff → accept → new revision/token → success", async ({ page }) => {
    const hydrationErrors: string[] = [];
    page.on("console", (message) => {
      if (
        message.type() === "error" &&
        message.text().includes("hydrated but some attributes")
      ) {
        hydrationErrors.push(message.text());
      }
    });
    await gotoFeed(page, "price-changed");
    expect(hydrationErrors).toEqual([]);
    await openDirectPdp(page);
    const preview = await previewCommerce(page);
    expect(preview.commerce_view_kind).toBe("FACTS_CHANGED");
    expect(preview.transaction_revision).toBe(1);
    const changed = page.getByRole("dialog", { name: "商品事实已更新" });
    await expect(changed.getByRole("region", { name: "事实变更明细" })).toContainText("单价");

    const acceptResponse = page.waitForResponse(
      (response) => response.request().method() === "POST" && /\/accept-facts$/.test(new URL(response.url()).pathname),
    );
    await changed.getByRole("button", { name: "接受新事实并继续" }).click();
    const accepted = await readCommerce(await acceptResponse, 200);
    expect(accepted.commerce_view_kind).toBe("AWAITING_CONFIRMATION");
    expect(accepted.transaction_revision).toBe(preview.transaction_revision + 1);
    expect(accepted.operation_id).toBe(preview.operation_id);
    expect(typeof accepted.confirmation_token).toBe("string");

    const confirmed = await confirmCommerce(page);
    expect(confirmed.commerce_view_kind).toBe("SUCCEEDED");
    expect(confirmed.transaction_revision).toBe(accepted.transaction_revision);
    expect(confirmed.operation_id).toBe(preview.operation_id);
    await expectReceipt(page);
  });

  test("8. commit unknown reconciles the same attempt to exactly one receipt", async ({ page }) => {
    let itemPostCount = 0;
    let reconcileGetCount = 0;
    let requestKey: unknown;
    let reconcileKey: string | null = null;
    page.on("request", (request) => {
      const pathname = new URL(request.url()).pathname;
      if (request.method() === "POST" && /\/commerce\/operations\/[^/]+\/items$/.test(pathname)) {
        itemPostCount += 1;
        requestKey = (request.postDataJSON() as Record<string, unknown>)
          .idempotency_key;
      }
      if (request.method() === "GET" && pathname.includes("/commerce/operations/by-idempotency/")) {
        reconcileGetCount += 1;
        reconcileKey = decodeURIComponent(pathname.split("/").at(-1)!);
      }
    });

    await gotoFeed(page, "commit-status-unknown");
    await openDirectPdp(page);
    const preview = await previewCommerce(page);
    expect(preview.commerce_view_kind).toBe("AWAITING_CONFIRMATION");
    const unknown = await confirmCommerce(page);
    expect(unknown.commerce_view_kind).toBe("COMMIT_STATUS_UNKNOWN");
    expect(unknown.operation_status).toBe("RECONCILIATION_REQUIRED");
    expect(unknown.transaction_revision).toBe(preview.transaction_revision);
    expect(unknown.operation_id).toBe(preview.operation_id);

    const unknownDialog = page.getByRole("dialog", { name: "加购结果待对账" });
    await expect(unknownDialog).toContainText("不要重复提交加购");
    const reconcileResponse = page.waitForResponse(
      (response) =>
        response.request().method() === "GET" &&
        new URL(response.url()).pathname.includes("/commerce/operations/by-idempotency/"),
    );
    await unknownDialog.getByRole("button", { name: "查询加购结果" }).click();
    const reconciled = await readCommerce(await reconcileResponse, 200);
    expect(reconciled.commerce_view_kind).toBe("SUCCEEDED");
    expect(reconciled.transaction_revision).toBe(preview.transaction_revision);
    expect(reconciled.operation_id).toBe(preview.operation_id);
    await expectReceipt(page);

    expect(itemPostCount).toBe(1);
    expect(reconcileGetCount).toBe(1);
    expect(typeof requestKey).toBe("string");
    expect(reconcileKey === requestKey).toBe(true);
    await page.waitForTimeout(100);
    await expect(page.getByRole("dialog", { name: "模拟加购回执" })).toHaveCount(1);
    await expect(page.locator('[aria-label="购物车，1 件"]')).toHaveCount(1);
  });
});

test("captures the 390×844 shoppable Feed evidence frame", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-chromium", "Mobile evidence only.");
  test.skip(process.env.CAPTURE_TIKTOK_REDESIGN_EVIDENCE !== "1", "Formal capture is opt-in.");
  await mkdir(SCREENSHOT_DIR, { recursive: true });
  await gotoFeed(page);
  await stabilizeEvidenceFrame(page);
  await expectInViewport(page.getByRole("group", { name: "可购物商品" }));
  await expectInViewport(page.getByRole("navigation", { name: "底部导航" }));
  await page.screenshot({
    path: resolve(SCREENSHOT_DIR, "tiktok-redesign-mobile.png"),
    fullPage: false,
  });
});

test("captures the 1440×1000 AI decision Sheet and interview panel", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-interview", "Desktop evidence only.");
  test.skip(process.env.CAPTURE_TIKTOK_REDESIGN_EVIDENCE !== "1", "Formal capture is opt-in.");
  await mkdir(SCREENSHOT_DIR, { recursive: true });
  await gotoFeed(page);
  const guide = await openGuide(page);
  await reachDecision(guide);
  await stabilizeEvidenceFrame(page);
  await expectInViewport(guide);
  await expectInViewport(page.getByRole("complementary", { name: "演示说明" }));
  await expect(
    page.getByRole("complementary", { name: "演示说明" }).getByTestId("current-demo-step"),
  ).toHaveText("轻量商品对话");
  await page.screenshot({
    path: resolve(SCREENSHOT_DIR, "tiktok-redesign-desktop.png"),
    fullPage: false,
  });
});
