import { expect, test, type Page } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-08-07T12:00:00Z"));
});

async function expectNoHorizontalOverflow(page: Page) {
  const metrics = await page.evaluate(() => ({
    viewport: window.innerWidth,
    root: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
  }));
  expect(metrics.root).toBeLessThanOrEqual(metrics.viewport);
  expect(metrics.body).toBeLessThanOrEqual(metrics.viewport);
}

async function tabTo(page: Page, accessibleName: string) {
  for (let index = 0; index < 30; index += 1) {
    await page.keyboard.press("Tab");
    const name = await page.evaluate(() =>
      document.activeElement?.getAttribute("aria-label") ??
      document.activeElement?.textContent?.trim() ??
      "",
    );
    if (name.includes(accessibleName)) return;
  }
  throw new Error(`Could not reach ${accessibleName} with Tab`);
}

async function expectBoxInsideViewport(page: Page, selector: string) {
  const box = await page.locator(selector).first().boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(await page.evaluate(() => innerWidth));
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.y + box!.height).toBeLessThanOrEqual(await page.evaluate(() => innerHeight));
  return box!;
}

async function expectAnchorAboveCreator(page: Page) {
  const anchor = await page.locator(".productAnchor").first().boundingBox();
  const creator = await page.locator(".creatorCopy").first().boundingBox();
  const rail = await page.locator(".actionRail").first().boundingBox();
  const nav = await page.locator(".bottomNavigation").boundingBox();
  expect(anchor).not.toBeNull();
  expect(creator).not.toBeNull();
  expect(rail).not.toBeNull();
  expect(nav).not.toBeNull();
  expect(anchor!.y + anchor!.height).toBeLessThanOrEqual(creator!.y);
  expect(creator!.y + creator!.height).toBeLessThanOrEqual(nav!.y);
  const anchorOverlapsRail =
    anchor!.x < rail!.x + rail!.width &&
    anchor!.x + anchor!.width > rail!.x &&
    anchor!.y < rail!.y + rail!.height &&
    anchor!.y + anchor!.height > rail!.y;
  expect(anchorOverlapsRail).toBe(false);
}

async function computedFontSize(page: Page, selector: string) {
  return page.locator(selector).first().evaluate((node) =>
    Number.parseFloat(getComputedStyle(node).fontSize),
  );
}

test("390×844 is a true full-bleed phone with no outside frame", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?scenario=normal");
  await expect(page.getByRole("button", { name: /查看商品/ })).toBeVisible();

  const phone = await page.locator(".phoneFrame").boundingBox();
  expect(phone).toEqual({ x: 0, y: 0, width: 390, height: 844 });
  await expect(page.getByRole("complementary", { name: "演示说明" })).toBeHidden();
  await expectNoHorizontalOverflow(page);
  const tabs = page.getByRole("navigation", { name: "内容频道" });
  await expect(tabs.getByRole("button")).toHaveText([
    "LIVE",
    "社区",
    "好友",
    "关注",
    "推荐",
  ]);
  await expect(tabs.getByRole("button", { name: "推荐" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  expect(
    await page
      .getByRole("navigation", { name: "底部导航" })
      .getByRole("button")
      .evaluateAll((buttons) =>
        buttons.map((button) => button.getAttribute("aria-label")),
      ),
  ).toEqual(["首页", "商城", "发布", "收件箱", "主页"]);
  await tabs.getByRole("button", { name: "LIVE" }).click();
  await expect(page.getByRole("status")).toContainText(
    "LIVE未接入本次概念原型",
  );

  for (const selector of [".feedTabs", ".actionRail", ".creatorCopy", ".productAnchor", ".bottomNavigation"]) {
    await expectBoxInsideViewport(page, selector);
  }
  await expectAnchorAboveCreator(page);

  const normalItem = page.locator('[data-feed-item-id="feed-city-style-002"]');
  await normalItem.scrollIntoViewIfNeeded();
  await expect(normalItem).toBeVisible();
  await expect(normalItem.locator(".productAnchor")).toHaveCount(0);
  const normalCreator = await normalItem.locator(".creatorCopy").boundingBox();
  const nav = await page.locator(".bottomNavigation").boundingBox();
  expect(normalCreator).not.toBeNull();
  expect(nav).not.toBeNull();
  const normalCreatorGap = nav!.y - (normalCreator!.y + normalCreator!.height);
  expect(normalCreatorGap).toBeGreaterThanOrEqual(0);
  expect(normalCreatorGap).toBeLessThanOrEqual(24);
});

test("1440×1000 keeps one 390×844 live phone and an outside panel", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/?scenario=normal");
  await expect(page.getByRole("button", { name: /问问这款/ })).toBeVisible();

  const phoneLocator = page.locator(".phoneFrame");
  const panelLocator = page.getByRole("complementary", { name: "演示说明" });
  await expect(phoneLocator).toHaveCount(1);
  await expect(panelLocator).toBeVisible();
  const phone = await phoneLocator.boundingBox();
  const panel = await panelLocator.boundingBox();
  expect(phone?.width).toBe(390);
  expect(phone?.height).toBe(844);
  expect(panel!.x).toBeGreaterThan(phone!.x + phone!.width);
  expect(panel!.y).toBeGreaterThanOrEqual(0);
  expect(panel!.y + panel!.height).toBeLessThanOrEqual(1000);
  await expect(page.locator(".feedSurface")).toHaveCount(1);
  await expectNoHorizontalOverflow(page);

  const askAi = page.getByRole("button", { name: /问问这款/ });
  await askAi.click();
  const dialog = page.getByRole("dialog", { name: "AI 导购（概念）" });
  await expect(dialog).toBeVisible();
  const overlay = await page.locator(".guideBackdrop").boundingBox();
  expect(overlay).toEqual(phone);
  expect(await dialog.evaluate((node) => node.closest("[inert]") === null)).toBe(true);
  await expect(panelLocator.getByTestId("current-demo-step")).toHaveText(
    "轻量商品对话",
  );
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(askAi).toBeFocused();
});

test("320×700 at 200% text size reflows without trapping product actions", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto("/?scenario=normal");
  const baseProductNameFont = await computedFontSize(page, ".productAnchorName");
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "200%";
  });
  await expect
    .poll(() => computedFontSize(page, "html"))
    .toBeGreaterThanOrEqual(32);
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  const statusBarBox = await page.locator(".feedStatusBar").boundingBox();
  const badgeBox = await page.locator(".prototypeBadge").boundingBox();
  const tabButtonBoxes = await page
    .locator(".feedTabs button")
    .evaluateAll((buttons) =>
      buttons.map((button) => {
        const rect = button.getBoundingClientRect();
        return { top: rect.top, bottom: rect.bottom };
      }),
    );
  expect(statusBarBox).not.toBeNull();
  expect(badgeBox).not.toBeNull();
  expect(tabButtonBoxes.length).toBeGreaterThan(0);
  const statusToBadgeGap = badgeBox!.y - (statusBarBox!.y + statusBarBox!.height);
  const badgeToTabsGap =
    Math.min(...tabButtonBoxes.map((box) => box.top)) -
    (badgeBox!.y + badgeBox!.height);
  expect(statusToBadgeGap).toBeGreaterThanOrEqual(2);
  expect(statusToBadgeGap).toBeLessThanOrEqual(4);
  expect(badgeToTabsGap).toBeGreaterThanOrEqual(2);
  expect(badgeToTabsGap).toBeLessThanOrEqual(4);
  const product = page.getByRole("button", { name: /查看商品/ });
  const askAi = page.getByRole("button", { name: /问问这款/ });
  await expect(product).toBeVisible();
  await expect(askAi).toBeVisible();
  await expect(page.locator(".prototypeBadge")).toHaveText("合成原型");
  const disclosureBox = await expectBoxInsideViewport(page, ".prototypeBadge");
  expect(disclosureBox.width).toBeGreaterThan(0);
  const searchBox = await expectBoxInsideViewport(page, ".feedSearchButton");
  const searchIconBox = await expectBoxInsideViewport(page, ".feedSearchButton svg");
  expect(searchIconBox.width).toBeLessThanOrEqual(searchBox.width);
  expect(searchIconBox.height).toBeLessThanOrEqual(searchBox.height);
  const railBox = await expectBoxInsideViewport(page, ".actionRail");
  const searchOverlapsRail =
    searchBox.x < railBox.x + railBox.width &&
    searchBox.x + searchBox.width > railBox.x &&
    searchBox.y < railBox.y + railBox.height &&
    searchBox.y + searchBox.height > railBox.y;
  expect(await computedFontSize(page, ".productAnchorName")).toBeGreaterThanOrEqual(
    baseProductNameFont * 1.8,
  );
  for (const selector of [".productAnchorName", ".productAnchorCopy small"]) {
    const textMetrics = await page.locator(selector).first().evaluate((node) => ({
      clientWidth: node.clientWidth,
      clientHeight: node.clientHeight,
      scrollWidth: node.scrollWidth,
      scrollHeight: node.scrollHeight,
    }));
    expect(textMetrics.clientWidth).toBeGreaterThan(0);
    expect(textMetrics.clientHeight).toBeGreaterThan(0);
    expect(textMetrics.scrollWidth).toBeLessThanOrEqual(textMetrics.clientWidth + 1);
    expect(textMetrics.scrollHeight).toBeLessThanOrEqual(textMetrics.clientHeight + 1);
  }
  expect(searchOverlapsRail).toBe(false);
  await expectAnchorAboveCreator(page);
  await expectNoHorizontalOverflow(page);
  const navLabelBottoms = await page.locator(".bottomNavigation small").evaluateAll(
    (labels) => labels.map((label) => label.getBoundingClientRect().bottom),
  );
  expect(Math.max(...navLabelBottoms)).toBeLessThanOrEqual(700);

  await tabTo(page, "问问这款");
  await expect(askAi).toBeFocused();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "AI 导购（概念）" });
  await expect(dialog).toBeVisible();
  const overlay = await page.locator(".guideBackdrop").boundingBox();
  expect(overlay).toEqual({ x: 0, y: 0, width: 320, height: 700 });
  await expect(page.getByRole("button", { name: "关闭导购" })).toBeVisible();
  const lastQuickAction = dialog.getByRole("button", {
    name: "和防水款比比",
  });
  await lastQuickAction.scrollIntoViewIfNeeded();
  await expect(lastQuickAction).toBeVisible();
  const actionBox = await lastQuickAction.boundingBox();
  expect(actionBox!.y).toBeGreaterThanOrEqual(0);
  expect(actionBox!.y + actionBox!.height).toBeLessThanOrEqual(700);
  await expectNoHorizontalOverflow(page);
  await page.keyboard.press("Escape");
  await expect(askAi).toBeFocused();
});

test("320×700 at 200% text size doubles core commerce copy and keeps the action reachable", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await page.route("**/commerce/cart/preview", async (route) => {
    const response = await route.fetch();
    const operation = (await response.json()) as Record<string, unknown> & {
      facts: Record<string, unknown>;
    };
    await route.fulfill({
      response,
      json: {
        ...operation,
        commerce_view_kind: "AWAITING_CONFIRMATION",
        operation_status: "ACTIVE",
        allowed_actions: [
          "SELECT_SKU",
          "SET_QUANTITY",
          "CONFIRM_ADD_TO_CART",
          "CANCEL_CONFIRMATION",
          "RETURN_TO_PRODUCT",
        ],
        confirmation_token: "cft_e2e_text_resize",
        confirmation_expires_at: "2099-08-07T09:00:00Z",
        facts: {
          ...operation.facts,
          inventory_units: 18,
          in_stock: true,
        },
        facts_diff: [],
        error_code: null,
      },
    });
  });
  await page.goto("/?scenario=normal");
  await page.getByRole("button", { name: /查看商品 Seoul Shade Daily Fluid/ }).click();
  const cta = page.getByRole("button", { name: "模拟加入购物车" });
  await expect(cta).toBeVisible();
  await cta.click();
  const dialog = page.getByRole("dialog", { name: "复核模拟加购" });
  await expect(dialog).toBeVisible();

  const selectors = [
    ".commerceDrawer h2",
    ".commerceFactList dt",
    ".commerceFactList dd",
    ".commerceBoundaryCopy",
    ".commercePrimaryAction",
  ] as const;
  const baseline = Object.fromEntries(
    await Promise.all(
      selectors.map(async (selector) => [selector, await computedFontSize(page, selector)]),
    ),
  );
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "200%";
  });
  await expect
    .poll(() => computedFontSize(page, "html"))
    .toBeGreaterThanOrEqual(32);
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  for (const selector of selectors) {
    expect(await computedFontSize(page, selector)).toBeGreaterThanOrEqual(
      baseline[selector] * 1.8,
    );
  }
  await expectNoHorizontalOverflow(page);
  await expect(dialog).toBeVisible();
  const primary = dialog.getByRole("button", { name: "确认模拟加购" });
  await primary.scrollIntoViewIfNeeded();
  await expect(primary).toBeVisible();
  const primaryBox = await primary.boundingBox();
  expect(primaryBox!.y).toBeGreaterThanOrEqual(0);
  expect(primaryBox!.y + primaryBox!.height).toBeLessThanOrEqual(700);
});
