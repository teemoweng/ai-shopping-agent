import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

import {
  expect,
  test,
  type Locator,
  type Page,
  type Request,
  type Response,
} from "@playwright/test";

const EVIDENCE_TIME = new Date("2026-08-10T12:00:00Z");
const SCREENSHOT_DIR = resolve(process.cwd(), "../../artifacts/screenshots");
const MOBILE_PROJECT = "mobile-chromium";
const DESKTOP_PROJECT = "desktop-interview";

type TranscriptMessage = {
  id: string;
  role: "USER" | "ASSISTANT";
  kind: string;
  text: string;
  redacted: boolean;
};

type GuideTurn = {
  session_id: string;
  guide_view_kind: string;
  guide_revision: number;
  conversation_revision: number;
  allowed_actions: string[];
  transcript: TranscriptMessage[];
};

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(EVIDENCE_TIME);
});

function guideSessionResponse(response: Response) {
  const pathname = new URL(response.url()).pathname;
  return (
    response.request().method() === "POST" &&
    pathname.endsWith("/guide/sessions")
  );
}

function guideMessageResponse(response: Response) {
  return (
    response.request().method() === "POST" &&
    /\/guide\/sessions\/[^/]+\/messages$/.test(
      new URL(response.url()).pathname,
    )
  );
}

function guideSnapshotResponse(response: Response) {
  return (
    response.request().method() === "GET" &&
    /\/guide\/sessions\/[^/]+$/.test(new URL(response.url()).pathname)
  );
}

async function gotoFeed(page: Page) {
  await page.goto("/?scenario=normal");
  const entry = page.getByRole("button", {
    name: /问问这款：Seoul Shade Daily Fluid/,
  });
  await expect(entry).toBeVisible();
  return entry;
}

async function openGuide(page: Page) {
  const entry = await gotoFeed(page);
  const responsePromise = page.waitForResponse(guideSessionResponse);
  await entry.click();
  const response = await responsePromise;
  expect(response.status()).toBe(201);
  const opening = (await response.json()) as GuideTurn;
  expect(opening.guide_view_kind).toBe("OPENING_CONTEXT");
  expect(opening.guide_revision).toBe(1);
  expect(opening.conversation_revision).toBe(1);
  expect(opening.allowed_actions).toEqual(["SEND_MESSAGE", "RETURN_TO_FEED"]);
  const guide = page.getByRole("dialog", { name: "AI 导购（概念）" });
  await expect(guide).toBeVisible();
  return { entry, guide, opening };
}

async function sendMessage(
  guide: Locator,
  text: string,
  expectedConversationRevision: number,
) {
  const page = guide.page();
  const requestPromise = page.waitForRequest(
    (request) =>
      request.method() === "POST" &&
      /\/guide\/sessions\/[^/]+\/messages$/.test(
        new URL(request.url()).pathname,
      ),
  );
  const responsePromise = page.waitForResponse(guideMessageResponse);
  await guide.getByLabel("继续提问").fill(text);
  await guide.getByRole("button", { name: "发送消息" }).click();
  const request = await requestPromise;
  expectMessageRequest(request, expectedConversationRevision);
  const response = await responsePromise;
  expect(response.status()).toBe(200);
  return (await response.json()) as GuideTurn;
}

function expectMessageRequest(
  request: Request,
  expectedConversationRevision: number,
) {
  const body = request.postDataJSON() as {
    message_id: string;
    expected_conversation_revision: number;
  };
  expect(body.message_id).toMatch(/^msg_/);
  expect(body.expected_conversation_revision).toBe(
    expectedConversationRevision,
  );
}

async function reachDecision(
  guide: Locator,
  opening: GuideTurn,
  text = "预算20美元以内、无香精、自然妆效、日常通勤",
) {
  const decision = await sendMessage(
    guide,
    text,
    opening.conversation_revision,
  );
  expect(decision.guide_view_kind).toBe("DECISION_READY");
  expect(decision.conversation_revision).toBe(
    opening.conversation_revision + 1,
  );
  await expect(
    guide.getByRole("article", {
      name: "Seoul Shade Daily Fluid 商品建议",
    }),
  ).toBeVisible();
  return decision;
}

async function expectNoHorizontalOverflow(page: Page) {
  const metrics = await page.evaluate(() => ({
    viewport: window.innerWidth,
    root: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
  }));
  expect(metrics.root).toBeLessThanOrEqual(metrics.viewport);
  expect(metrics.body).toBeLessThanOrEqual(metrics.viewport);
}

function cssColorChannels(value: string) {
  const channels = value.match(/[\d.]+/g)?.map(Number) ?? [];
  if (channels.length < 3) {
    throw new Error(`Expected an rgb/rgba color, received ${value}`);
  }
  return {
    red: channels[0],
    green: channels[1],
    blue: channels[2],
    alpha: channels[3] ?? 1,
  };
}

function relativeLuminance(value: string) {
  const { red, green, blue } = cssColorChannels(value);
  const linearize = (channel: number) => {
    const normalized = channel / 255;
    return normalized <= 0.04045
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  };
  return (
    0.2126 * linearize(red) +
    0.7152 * linearize(green) +
    0.0722 * linearize(blue)
  );
}

function contrastRatio(first: string, second: string) {
  const firstLuminance = relativeLuminance(first);
  const secondLuminance = relativeLuminance(second);
  const lighter = Math.max(firstLuminance, secondLuminance);
  const darker = Math.min(firstLuminance, secondLuminance);
  return (lighter + 0.05) / (darker + 0.05);
}

async function expectInsideViewport(locator: Locator) {
  await expect(locator).toBeVisible();
  await expect
    .poll(async () => {
      const currentBox = await locator.boundingBox();
      const currentViewport = locator.page().viewportSize();
      return Boolean(
        currentBox &&
          currentViewport &&
          currentBox.x >= 0 &&
          currentBox.y >= 0 &&
          currentBox.x + currentBox.width <= currentViewport.width + 1 &&
          currentBox.y + currentBox.height <= currentViewport.height + 1,
      );
    })
    .toBe(true);
  const box = await locator.boundingBox();
  const viewport = locator.page().viewportSize();
  expect(box).not.toBeNull();
  expect(viewport).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewport!.width + 1);
  expect(box!.y + box!.height).toBeLessThanOrEqual(viewport!.height + 1);
  return box!;
}

async function stabilizeEvidenceFrame(page: Page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    for (const video of Array.from(document.querySelectorAll("video"))) {
      video.pause();
      if (video.readyState === 0) continue;
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
        // The poster remains the deterministic fallback until metadata is ready.
      }
    }
  });
  await page.addStyleTag({
    content:
      "*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}",
  });
  await page.evaluate(
    () =>
      new Promise<void>((resolveFrame) =>
        requestAnimationFrame(() =>
          requestAnimationFrame(() => resolveFrame()),
        ),
      ),
  );
}

test.describe("chat-first mobile journeys", () => {
  test.beforeEach(async ({}, testInfo) => {
    test.skip(testInfo.project.name !== MOBILE_PROJECT, "Mobile contract only.");
  });

  test("light opening preserves visible video context and exactly three product questions", async ({
    page,
  }) => {
    const { guide } = await openGuide(page);

    await expect(guide).toHaveAttribute("data-mode", "compact");
    await expect(guide.getByLabel("当前视频商品")).toContainText(
      "Seoul Shade Daily Fluid",
    );
    await expect(
      guide.getByText("我看到你在看 Seoul Shade。你最想确认什么？"),
    ).toBeVisible();
    await expect(
      guide.getByRole("group", { name: "你可以这样问" }).getByRole("button"),
    ).toHaveText(["适合油皮吗？", "会不会泛白？", "和防水款比比"]);
    await expect(guide.getByLabel("继续提问")).toHaveAttribute(
      "placeholder",
      "问问这款商品…",
    );
    await expect(guide.locator(".guideChatDisclosure")).toHaveCount(1);
    const sheet = await expectInsideViewport(guide);
    expect(sheet.y).toBeGreaterThan(0);
    await expect(page.locator(".feedVideo").first()).toBeVisible();
  });

  test("light scrim keeps the source video visually legible behind the compact guide", async ({
    page,
  }) => {
    await openGuide(page);
    const scrim = await page.locator(".guideBackdrop").evaluate((node) => {
      const style = getComputedStyle(node);
      return {
        backgroundColor: style.backgroundColor,
        backdropFilter: style.backdropFilter,
      };
    });

    expect(cssColorChannels(scrim.backgroundColor).alpha).toBeLessThanOrEqual(
      0.3,
    );
    expect(scrim.backdropFilter).toBe("none");
    await expect(page.locator(".feedVideo").first()).toBeVisible();
  });

  test("one clarification turn contains at most one question and no product result", async ({
    page,
  }) => {
    const { guide, opening } = await openGuide(page);
    const responsePromise = page.waitForResponse(guideMessageResponse);
    await guide.getByRole("button", { name: "适合油皮吗？" }).click();
    const clarification = (await (await responsePromise).json()) as GuideTurn;

    expect(clarification.guide_view_kind).toBe("WAITING_CLARIFICATION");
    expect(clarification.conversation_revision).toBe(
      opening.conversation_revision + 1,
    );
    const question = guide.locator('article[data-kind="QUESTION"]');
    await expect(question).toBeVisible();
    expect((await question.textContent())?.match(/？/g)?.length ?? 0).toBeLessThanOrEqual(
      1,
    );
    await expect(guide.getByRole("article", { name: /商品建议/ })).toHaveCount(0);
    await expect(guide).toHaveAttribute("data-mode", "compact");
  });

  test("white-cast question stays a short answer without recommendation matrix", async ({
    page,
  }) => {
    const { guide, opening } = await openGuide(page);
    const responsePromise = page.waitForResponse(guideMessageResponse);
    await guide.getByRole("button", { name: "会不会泛白？" }).click();
    const answer = (await (await responsePromise).json()) as GuideTurn;

    expect(answer.guide_view_kind).toBe("ANSWER_READY");
    expect(answer.guide_revision).toBe(opening.guide_revision);
    expect(answer.conversation_revision).toBe(opening.conversation_revision + 1);
    await expect(guide.getByText(/低泛白风险/)).toBeVisible();
    await expect(guide.getByRole("article", { name: /商品建议/ })).toHaveCount(0);
    await expect(guide.getByRole("table", { name: "商品对比" })).toHaveCount(0);
    await expect(guide).toHaveAttribute("data-mode", "compact");
  });

  test("decision shows one primary recommendation until alternatives are requested", async ({
    page,
  }) => {
    const { guide, opening } = await openGuide(page);
    await reachDecision(guide, opening);

    await expect(guide.getByRole("article", { name: /商品建议/ })).toHaveCount(1);
    await expect(
      guide.getByRole("heading", { name: "Cloud Veil Mineral SPF" }),
    ).toHaveCount(0);
    await expect(guide.getByRole("button", { name: "看看其他选择" })).toBeVisible();
    await expect(guide).toHaveAttribute("data-mode", "compact");
  });

  test("comparison expands only after explicit comparison intent", async ({ page }) => {
    const { guide, opening } = await openGuide(page);
    const decision = await reachDecision(guide, opening);
    await expect(guide).toHaveAttribute("data-mode", "compact");
    await expect(guide.getByRole("table", { name: "商品对比" })).toHaveCount(0);

    const compareRequest = page.waitForRequest(
      (request) =>
        request.method() === "POST" &&
        /\/guide\/sessions\/[^/]+\/compare$/.test(
          new URL(request.url()).pathname,
        ),
    );
    const canonical = page.waitForResponse(
      (response) => guideSnapshotResponse(response),
    );
    await guide.getByRole("button", { name: "和另一款比比" }).click();
    const body = (await compareRequest).postDataJSON() as {
      request_id: string;
      expected_conversation_revision: number;
      product_ids: string[];
    };
    expect(body.request_id).toMatch(/^cmp_/);
    expect(body.expected_conversation_revision).toBe(
      decision.conversation_revision,
    );
    expect(body.product_ids).toEqual([
      "seoul-shade-daily-fluid",
      "cloud-veil-mineral",
    ]);
    const compared = (await (await canonical).json()) as GuideTurn;
    expect(compared.guide_view_kind).toBe("COMPARISON_READY");
    expect(compared.conversation_revision).toBe(
      decision.conversation_revision + 1,
    );
    await expect(guide).toHaveAttribute("data-mode", "expanded");
    await expect(guide.getByRole("table", { name: "商品对比" })).toBeVisible();
  });

  test("close and reopen restores the canonical session and transcript", async ({
    page,
  }) => {
    const { entry, guide, opening } = await openGuide(page);
    const decision = await reachDecision(guide, opening);
    await guide.getByRole("button", { name: "关闭导购" }).click();
    await expect(entry).toBeFocused();

    const snapshotPromise = page.waitForResponse(guideSnapshotResponse);
    await entry.click();
    const snapshot = (await (await snapshotPromise).json()) as GuideTurn;
    expect(snapshot.session_id).toBe(decision.session_id);
    expect(snapshot.conversation_revision).toBe(decision.conversation_revision);
    expect(snapshot.transcript).toEqual(decision.transcript);
    await expect(
      page.getByRole("dialog", { name: "AI 导购（概念）" }).getByText(decision.transcript.at(-1)!.text),
    ).toBeVisible();
  });

  test("AI to PDP to AI restores the same transcript and current recommendation", async ({
    page,
  }) => {
    const { guide, opening } = await openGuide(page);
    const decision = await reachDecision(guide, opening);
    await guide
      .getByRole("article", { name: "Seoul Shade Daily Fluid 商品建议" })
      .getByRole("button", { name: "看商品" })
      .click();
    const pdp = page.getByRole("region", { name: "商品详情" });
    await expect(pdp).toContainText("AI 建议商品 · 当前款");

    const snapshotPromise = page.waitForResponse(guideSnapshotResponse);
    await pdp.getByRole("button", { name: "返回内容流" }).click();
    const snapshot = (await (await snapshotPromise).json()) as GuideTurn;
    expect(snapshot.session_id).toBe(decision.session_id);
    expect(snapshot.transcript).toEqual(decision.transcript);
    const restored = page.getByRole("dialog", { name: "AI 导购（概念）" });
    await expect(
      restored.getByRole("article", {
        name: "Seoul Shade Daily Fluid 商品建议",
      }),
    ).toBeVisible();
  });

  test("safety removes every product, comparison, and cart action", async ({
    page,
  }) => {
    const { guide, opening } = await openGuide(page);
    const safety = await sendMessage(
      guide,
      "脸部肿胀并且呼吸困难",
      opening.conversation_revision,
    );

    expect(safety.guide_view_kind).toBe("SAFE_BOUNDARY");
    expect(safety.allowed_actions).toEqual(["RETURN_TO_FEED"]);
    expect(safety.transcript.at(-2)).toMatchObject({
      role: "USER",
      redacted: true,
      text: "已隐藏一条健康相关描述",
    });
    await expect(guide.getByLabel("安全提示")).toBeVisible();
    await expect(guide.getByRole("article", { name: /商品建议/ })).toHaveCount(0);
    await expect(guide.getByRole("table", { name: "商品对比" })).toHaveCount(0);
    await expect(
      guide.getByRole("button", { name: /看商品|比比|加购/ }),
    ).toHaveCount(0);
    await expect(guide).toHaveAttribute("data-mode", "compact");
  });

  test("390×844 compact mode stays within the 40–44 percent target without overflow", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const { guide } = await openGuide(page);
    const box = await expectInsideViewport(guide);

    expect(box.height / 844).toBeGreaterThanOrEqual(0.4);
    expect(box.height / 844).toBeLessThanOrEqual(0.445);
    await expectInsideViewport(guide.getByRole("button", { name: "关闭导购" }));
    await expectInsideViewport(guide.getByLabel("继续提问"));
    await expectNoHorizontalOverflow(page);
  });

  test("320×700 at 200 percent text keeps close, latest message, and composer reachable", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 700 });
    await page.goto("/?scenario=normal");
    await expect(
      page.getByRole("button", {
        name: /问问这款：Seoul Shade Daily Fluid/,
      }),
    ).toBeVisible();
    await page.evaluate(() => {
      document.documentElement.style.fontSize = "200%";
    });
    await expect
      .poll(() =>
        page.locator("html").evaluate((node) =>
          Number.parseFloat(getComputedStyle(node).fontSize),
        ),
      )
      .toBeGreaterThanOrEqual(32);
    const entry = page.getByRole("button", {
      name: /问问这款：Seoul Shade Daily Fluid/,
    });
    await entry.click();
    const guide = page.getByRole("dialog", { name: "AI 导购（概念）" });

    await expectInsideViewport(guide.getByRole("button", { name: "关闭导购" }));
    const opening = guide.getByText(
      "我看到你在看 Seoul Shade。你最想确认什么？",
    );
    await opening.scrollIntoViewIfNeeded();
    await expect(opening).toBeVisible();
    const composer = guide.getByLabel("继续提问");
    await composer.scrollIntoViewIfNeeded();
    await expect(composer).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test("reduced motion keeps focus trapped and Escape returns it to the entry", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    const entry = await gotoFeed(page);
    await entry.focus();
    await page.keyboard.press("Enter");
    const guide = page.getByRole("dialog", { name: "AI 导购（概念）" });
    const close = guide.getByRole("button", { name: "关闭导购" });
    await expect(close).toBeFocused();
    await expect
      .poll(() =>
        page.evaluate(() =>
          window.matchMedia("(prefers-reduced-motion: reduce)").matches,
        ),
      )
      .toBe(true);
    await page.keyboard.press("Shift+Tab");
    expect(await guide.evaluate((node) => node.contains(document.activeElement))).toBe(
      true,
    );
    await expect(page.locator("[inert]")).not.toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(guide).toHaveCount(0);
    await expect(entry).toBeFocused();
  });
});

test("desktop interview mode keeps the live phone path primary", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== DESKTOP_PROJECT, "Desktop contract only.");
  await page.setViewportSize({ width: 1440, height: 1000 });
  const { guide } = await openGuide(page);
  const phone = await page.locator(".phoneFrame").boundingBox();
  const panel = page.getByRole("complementary", { name: "演示说明" });
  const panelBox = await panel.boundingBox();
  const sheet = await guide.boundingBox();

  expect(phone).not.toBeNull();
  expect(phone!.width).toBe(390);
  expect(phone!.height).toBe(844);
  expect(sheet).not.toBeNull();
  expect(panelBox).not.toBeNull();
  expect(sheet!.x).toBeGreaterThanOrEqual(phone!.x);
  expect(sheet!.x + sheet!.width).toBeLessThanOrEqual(phone!.x + phone!.width);
  expect(panelBox!.x).toBeGreaterThan(phone!.x + phone!.width);
  expect(panelBox!.width).toBeLessThanOrEqual(phone!.width);
  const hierarchy = await panel.evaluate((node) => {
    const panelStyle = getComputedStyle(node);
    const title = node.querySelector("h1");
    const currentStep = node.querySelector(".interviewCurrentStep");
    if (!title || !currentStep) {
      throw new Error("Desktop explanation hierarchy is incomplete");
    }
    return {
      panelBackground: panelStyle.backgroundColor,
      titleFontSize: Number.parseFloat(getComputedStyle(title).fontSize),
      currentStepBackground: getComputedStyle(currentStep).backgroundColor,
    };
  });
  expect(hierarchy.titleFontSize).toBeLessThanOrEqual(24);
  expect(
    contrastRatio(hierarchy.panelBackground, hierarchy.currentStepBackground),
  ).toBeLessThanOrEqual(1.5);
  await expect(panel.getByTestId("current-demo-step")).toHaveText(
    "轻量商品对话",
  );
  await expect(guide).toHaveAttribute("data-mode", "compact");
  await expectNoHorizontalOverflow(page);
});

test("captures the canonical mobile opening", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== MOBILE_PROJECT, "Mobile evidence only.");
  test.skip(
    process.env.CAPTURE_CHAT_FIRST_EVIDENCE !== "1",
    "Formal chat-first capture is opt-in.",
  );
  await mkdir(SCREENSHOT_DIR, { recursive: true });
  await page.setViewportSize({ width: 390, height: 844 });
  const { guide } = await openGuide(page);
  await stabilizeEvidenceFrame(page);
  const box = await expectInsideViewport(guide);
  expect(box.height / 844).toBeGreaterThanOrEqual(0.4);
  expect(box.height / 844).toBeLessThanOrEqual(0.445);
  await expect(
    guide.getByText("我看到你在看 Seoul Shade。你最想确认什么？"),
  ).toBeVisible();
  await page.screenshot({
    path: resolve(SCREENSHOT_DIR, "chat-first-opening-mobile.png"),
    fullPage: false,
  });
});

test("captures the canonical mobile decision", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== MOBILE_PROJECT, "Mobile evidence only.");
  test.skip(
    process.env.CAPTURE_CHAT_FIRST_EVIDENCE !== "1",
    "Formal chat-first capture is opt-in.",
  );
  await mkdir(SCREENSHOT_DIR, { recursive: true });
  await page.setViewportSize({ width: 390, height: 844 });
  const { guide, opening } = await openGuide(page);
  await reachDecision(guide, opening);
  await stabilizeEvidenceFrame(page);
  await expectInsideViewport(guide);
  await expect(
    guide.getByRole("article", {
      name: "Seoul Shade Daily Fluid 商品建议",
    }),
  ).toBeVisible();
  await expect(guide).toHaveAttribute("data-mode", "compact");
  await page.screenshot({
    path: resolve(SCREENSHOT_DIR, "chat-first-decision-mobile.png"),
    fullPage: false,
  });
});

test("captures the canonical desktop interview state", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== DESKTOP_PROJECT, "Desktop evidence only.");
  test.skip(
    process.env.CAPTURE_CHAT_FIRST_EVIDENCE !== "1",
    "Formal chat-first capture is opt-in.",
  );
  await mkdir(SCREENSHOT_DIR, { recursive: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  const { guide, opening } = await openGuide(page);
  await reachDecision(guide, opening);
  await stabilizeEvidenceFrame(page);
  await expectInsideViewport(guide);
  const panel = page.getByRole("complementary", { name: "演示说明" });
  await expectInsideViewport(panel);
  await expect(panel.getByTestId("current-demo-step")).toHaveText(
    "轻量商品对话",
  );
  await page.screenshot({
    path: resolve(SCREENSHOT_DIR, "chat-first-desktop.png"),
    fullPage: false,
  });
});
