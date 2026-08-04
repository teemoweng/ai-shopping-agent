import { expect, test } from "@playwright/test";

test("content context reaches a confirmed simulated cart item", async ({ page }) => {
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
  await expect(guide.getByText("Added to simulated cart")).toBeVisible();
  await expect(guide.getByText(/^item_/)).toBeVisible();
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
