import { expect, test } from "@playwright/test";

const EVIDENCE_TIME = new Date("2026-08-07T12:00:00Z");

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(EVIDENCE_TIME);
});

async function openGuide(page: import("@playwright/test").Page) {
  await page.goto("/?scenario=normal");
  const askAi = page.getByRole("button", {
    name: /问 AI：Seoul Shade Daily Fluid/,
  });
  await expect(askAi).toBeVisible();
  await askAi.click();
  const guide = page.getByRole("dialog", { name: "AI 导购（概念）" });
  await expect(guide).toBeVisible();
  await expect(
    guide.getByRole("region", { name: "已继承的视频与商品上下文" }),
  ).toContainText("Seoul Shade Daily Fluid");
  return guide;
}

test("Foundation content context still produces a cited, actionable decision", async ({
  page,
}) => {
  const guide = await openGuide(page);
  await guide
    .getByLabel("补充你的条件")
    .fill("预算20美元以内、无香精、自然妆效、日常通勤");
  await guide.getByRole("button", { name: "发送" }).click();

  await expect(guide.getByText("AI 决策 · 基于已验证资料")).toBeVisible();
  const recommendation = guide.getByRole("article", {
    name: "Seoul Shade Daily Fluid 商品建议",
  });
  await expect(recommendation).toContainText("为什么适合");
  await expect(recommendation).toContainText("需要接受的取舍");
  await expect(recommendation.getByText("有公开依据").first()).toBeVisible();
  await expect(recommendation.getByRole("button", { name: "查看商品" })).toBeEnabled();
  await expect(guide.getByText("视频宣称核验")).toBeVisible();
});

test("Foundation zero match remains explicit and recoverable by one relaxation", async ({
  page,
}) => {
  const guide = await openGuide(page);
  await guide
    .getByLabel("补充你的条件")
    .fill("预算15美元以内、无香精、80分钟防水");
  await guide.getByRole("button", { name: "发送" }).click();

  await expect(
    guide.getByRole("heading", { name: "没有找到同时满足条件的商品" }),
  ).toBeVisible();
  await expect(guide.getByRole("button", { name: /查看商品/ })).toHaveCount(0);
  await guide.getByRole("button", { name: "放宽防水要求" }).click();
  await expect(guide.getByText("AI 决策 · 基于已验证资料")).toBeVisible();
  await expect(guide.getByRole("button", { name: "查看商品" }).first()).toBeEnabled();
});
