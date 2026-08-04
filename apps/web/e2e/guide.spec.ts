import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { expect, test } from "@playwright/test";

test("content context reaches a confirmed simulated cart item", async ({ page }, testInfo) => {
  await page.goto("/");
  await expect(page.getByText("Concept prototype · Synthetic products")).toBeVisible();
  await page.getByRole("button", { name: "Ask AI about this product" }).click();
  const guide = page.getByRole("dialog", { name: "AI shopping guide" });
  await expect(guide.getByText("Seoul Shade Daily Fluid")).toBeVisible();

  await guide.getByLabel("Your must-haves").fill(
    "Under $20, fragrance-free, natural finish, daily commute",
  );
  await guide.getByRole("button", { name: "Find my match" }).click();
  await expect(guide.getByText("Closest fit")).toBeVisible();
  await expect(guide.getByText("Seoul Shade Daily Fluid")).toBeVisible();

  await guide
    .getByRole("checkbox", { name: "Compare Seoul Shade Daily Fluid" })
    .check();
  await guide
    .getByRole("checkbox", { name: "Compare Cloud Veil Mineral SPF" })
    .check();
  await guide.getByRole("button", { name: "Compare 2" }).click();
  await expect(guide.getByRole("table", { name: "Product comparison" })).toBeVisible();

  await guide
    .getByLabel("Size for Seoul Shade Daily Fluid")
    .selectOption("seoul-shade-50");
  await guide.getByRole("button", { name: "Preview simulated add" }).click();
  await expect(
    guide.getByText("This is a prototype—no order or payment will be created"),
  ).toBeVisible();
  await guide.getByRole("button", { name: "Confirm simulated add" }).click();
  const receipt = guide.getByRole("region", {
    name: "Simulated cart decision receipt",
  });
  await expect(receipt).toBeVisible();
  await receipt.scrollIntoViewIfNeeded();

  const requiredReceiptFacts = [
    receipt.getByText("@routine.notes · Seoul Shade Daily Fluid"),
    receipt.getByText("Seoul Shade Daily Fluid · Suitable"),
    receipt.getByText(
      "3 cited sources · Sunscreen: How to Help Protect Your Skin from the Sun",
    ),
    receipt.getByText("seoul-shade-50"),
    receipt.getByText("$19.00").first(),
    receipt.getByText("7 units at preview"),
    receipt.getByText("Quantity 1"),
    receipt.getByText("Added to simulated cart"),
    receipt.getByText("This was simulated—no order or payment was created."),
    receipt.getByText(/^item_/),
  ];
  for (const fact of requiredReceiptFacts) {
    await expect(fact).toBeVisible();
    await expect(fact).toBeInViewport();
  }

  const disclosure = guide.locator("footer").getByText(
    "Concept prototype · Synthetic products",
  );
  await expect(disclosure).toBeVisible();
  await expect(disclosure).toBeInViewport();
  const guideMarkup = await guide.evaluate((element) => element.outerHTML);
  expect(guideMarkup).not.toContain("confirm_");

  if (
    process.env.CAPTURE_FOUNDATION_EVIDENCE === "1" &&
    testInfo.project.name === "mobile-chromium"
  ) {
    const screenshotPath = resolve(
      process.cwd(),
      "../../artifacts/screenshots/foundation-mobile.png",
    );
    await mkdir(dirname(screenshotPath), { recursive: true });
    await page.screenshot({ path: screenshotPath, fullPage: false });
  }
});

test("zero match is explicit and recoverable", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Ask AI about this product" }).click();
  const guide = page.getByRole("dialog", { name: "AI shopping guide" });
  const input = guide.getByLabel("Your must-haves");

  await input.fill("Under $15, fragrance-free, 80 minute water resistance");
  await guide.getByRole("button", { name: "Find my match" }).click();
  await expect(guide.getByText("Change one requirement")).toBeVisible();
  await expect(
    guide.getByRole("button", { name: "Confirm simulated add" }),
  ).toHaveCount(0);

  await input.fill("Under $20, fragrance-free, 40 minute water resistance");
  await guide.getByRole("button", { name: "Find my match" }).click();
  await expect(guide.getByText("Cloud Veil Mineral SPF")).toBeVisible();
});
