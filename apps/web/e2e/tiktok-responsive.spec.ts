import { expect, test, type Page } from "@playwright/test";

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

test("390×844 is a true full-bleed phone with no outside frame", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?scenario=normal");
  await expect(page.getByRole("button", { name: /查看商品/ })).toBeVisible();

  const phone = await page.locator(".phoneFrame").boundingBox();
  expect(phone).toEqual({ x: 0, y: 0, width: 390, height: 844 });
  await expect(page.getByRole("complementary", { name: "演示说明" })).toBeHidden();
  await expectNoHorizontalOverflow(page);

  for (const selector of [".feedTabs", ".actionRail", ".creatorCopy", ".productAnchor", ".bottomNavigation"]) {
    const box = await page.locator(selector).first().boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(390);
    expect(box!.y).toBeGreaterThanOrEqual(0);
    expect(box!.y + box!.height).toBeLessThanOrEqual(844);
  }
});

test("1440×1000 keeps one 390×844 live phone and an outside panel", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/?scenario=normal");
  await expect(page.getByRole("button", { name: /问 AI/ })).toBeVisible();

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

  const askAi = page.getByRole("button", { name: /问 AI/ });
  await askAi.click();
  const dialog = page.getByRole("dialog", { name: "AI 导购（概念）" });
  await expect(dialog).toBeVisible();
  const overlay = await page.locator(".guideBackdrop").boundingBox();
  expect(overlay).toEqual(phone);
  expect(await dialog.evaluate((node) => node.closest("[inert]") === null)).toBe(true);
  await expect(panelLocator.getByTestId("current-demo-step")).toHaveText(
    "AI 导购决策支持",
  );
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(askAi).toBeFocused();
});

test("320×700 at 200% text size reflows without trapping product actions", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto("/?scenario=normal");
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "200%";
  });
  const product = page.getByRole("button", { name: /查看商品/ });
  const askAi = page.getByRole("button", { name: /问 AI/ });
  await expect(product).toBeVisible();
  await expect(askAi).toBeVisible();
  await expectNoHorizontalOverflow(page);
  const navLabelBottoms = await page.locator(".bottomNavigation small").evaluateAll(
    (labels) => labels.map((label) => label.getBoundingClientRect().bottom),
  );
  expect(Math.max(...navLabelBottoms)).toBeLessThanOrEqual(700);

  await tabTo(page, "问 AI");
  await expect(askAi).toBeFocused();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "AI 导购（概念）" });
  await expect(dialog).toBeVisible();
  const overlay = await page.locator(".guideBackdrop").boundingBox();
  expect(overlay).toEqual({ x: 0, y: 0, width: 320, height: 700 });
  await expect(page.getByRole("button", { name: "关闭 AI 导购" })).toBeVisible();
  const lastQuickAction = dialog.getByRole("button", {
    name: /帮我找更合适的替代/,
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
