import { expect, test, type Page } from "@playwright/test";

test.beforeEach(async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-chromium", "Commerce focus runs once against the shared API inventory.");
  await page.clock.setFixedTime(new Date("2026-08-07T12:00:00Z"));
});

async function openProduct(page: Page) {
  await page.goto("/");
  const product = page.getByRole("button", {
    name: /查看商品 Seoul Shade Daily Fluid/,
  });
  await expect(product).toBeVisible();
  await product.click();
  const cta = page.getByRole("button", { name: "模拟加入购物车" });
  await expect(cta).toBeVisible();
  return cta;
}

async function openConfirmation(page: Page) {
  const cta = page.getByRole("button", { name: "模拟加入购物车" });
  await cta.focus();
  await expect(cta).toBeFocused();
  await cta.click();
  const dialog = page.getByRole("dialog", { name: "复核模拟加购" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "取消" })).toBeFocused();
  return { cta, dialog };
}

test("native inert restores confirmation cancel and Escape focus to the PDP CTA", async ({
  page,
}) => {
  await openProduct(page);
  const first = await openConfirmation(page);
  const cancel = first.dialog.getByRole("button", { name: "取消" });
  await cancel.click();
  await expect(first.cta).toBeFocused();

  const second = await openConfirmation(page);
  await page.keyboard.press("Escape");
  await expect(second.dialog).toHaveCount(0);
  await expect(second.cta).toBeFocused();
});

test("native inert restores UNKNOWN return focus to the reconciliation CTA", async ({
  page,
}) => {
  await page.route("**/commerce/operations/*/items", async (route) => {
    const request = route.request();
    const requestBody = request.postDataJSON() as Record<string, unknown>;
    await route.continue({
      headers: {
        ...request.headers(),
        "content-type": "application/json",
      },
      postData: JSON.stringify({
        ...requestBody,
        demo_scenario: "COMMIT_STATUS_UNKNOWN",
      }),
    });
  });
  await openProduct(page);
  const { dialog } = await openConfirmation(page);
  await dialog.getByRole("button", { name: "确认模拟加购" }).click();

  const unknown = page.getByRole("dialog", { name: "加购结果待对账" });
  await expect(unknown).toBeVisible();
  await unknown.getByRole("button", { name: "返回商品" }).click();
  const query = page.getByRole("button", { name: "查询加购结果" });
  await expect(query).toBeVisible();
  await expect(query).toBeFocused();
});

test("native inert restores receipt return focus to the fresh PDP CTA", async ({
  page,
}) => {
  await openProduct(page);
  const { dialog } = await openConfirmation(page);
  await dialog.getByRole("button", { name: "确认模拟加购" }).click();

  const receipt = page.getByRole("dialog", { name: "模拟加购回执" });
  await expect(receipt).toBeVisible();
  const returnProduct = receipt.getByRole("button", { name: "返回商品" });
  await expect(returnProduct).toBeFocused();
  await returnProduct.click();
  await expect(
    page.getByRole("button", { name: "模拟加入购物车" }),
  ).toBeFocused();
});
