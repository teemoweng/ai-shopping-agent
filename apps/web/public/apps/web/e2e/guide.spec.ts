import { expect, test } from "@playwright/test";

const EVIDENCE_TIME = new Date("2026-08-07T12:00:00Z");

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(EVIDENCE_TIME);
});

async function openGuide(page: import("@playwright/test").Page) {
  await page.goto("/?scenario=normal");
  const askAi = page.getByRole("button", {
    name: /问问这款：Seoul Shade Daily Fluid/,
  });
  await expect(askAi).toBeVisible();
  await askAi.click();
  const guide = page.getByRole("dialog", { name: "AI 导购（概念）" });
  await expect(guide).toBeVisible();
  await expect(guide.getByLabel("当前视频商品")).toContainText(
    "Seoul Shade Daily Fluid",
  );
  return guide;
}

test("Foundation content context still produces a cited, actionable decision", async ({
  page,
}) => {
  const guide = await openGuide(page);
  await guide.getByLabel("继续提问").fill(
    "预算20美元以内、无香精、自然妆效、日常通勤",
  );
  const messageRequest = page.waitForRequest(
    (request) =>
      request.method() === "POST" &&
      /\/guide\/sessions\/[^/]+\/messages$/.test(request.url()),
  );
  await guide.getByRole("button", { name: "发送消息" }).click();
  const requestBody = (await messageRequest).postDataJSON() as {
    message_id: string;
    expected_conversation_revision: number;
  };
  expect(requestBody.message_id).toMatch(/^msg_/);
  expect(requestBody.expected_conversation_revision).toBe(1);

  const recommendation = guide.getByRole("article", {
    name: "Seoul Shade Daily Fluid 商品建议",
  });
  await expect(recommendation).toContainText("适合点");
  await expect(recommendation).toContainText("取舍");
  await expect(recommendation.getByRole("button", { name: "看商品" })).toBeEnabled();
  await recommendation.getByRole("button", { name: /查看 \d+ 条依据/ }).click();
  const evidence = guide.getByRole("region", {
    name: "Seoul Shade Daily Fluid 的依据",
  });
  await expect(evidence).toContainText("FDA");
  await expect(evidence.getByRole("article").first()).toBeVisible();
  await expect(guide).toHaveAttribute("data-mode", "compact");
});

test("Foundation zero match remains explicit and recoverable by one relaxation", async ({
  page,
}) => {
  const guide = await openGuide(page);
  await guide
    .getByLabel("继续提问")
    .fill("预算15美元以内、无香精、80分钟防水");
  const noMatchRequest = page.waitForRequest(
    (request) =>
      request.method() === "POST" &&
      /\/guide\/sessions\/[^/]+\/messages$/.test(request.url()),
  );
  await guide.getByRole("button", { name: "发送消息" }).click();
  expect(
    ((await noMatchRequest).postDataJSON() as {
      expected_conversation_revision: number;
    }).expected_conversation_revision,
  ).toBe(1);

  await expect(
    guide.getByText(/不会悄悄放宽条件/),
  ).toBeVisible();
  await expect(guide.getByRole("button", { name: /看商品/ })).toHaveCount(0);
  await expect(guide).toHaveAttribute("data-mode", "compact");
  const relaxRequest = page.waitForRequest(
    (request) =>
      request.method() === "POST" &&
      /\/guide\/sessions\/[^/]+\/messages$/.test(request.url()),
  );
  await guide.getByLabel("继续提问").fill("防水不限");
  await guide.getByRole("button", { name: "发送消息" }).click();
  expect(
    ((await relaxRequest).postDataJSON() as {
      expected_conversation_revision: number;
    }).expected_conversation_revision,
  ).toBe(2);
  await expect(guide.getByRole("article", { name: /商品建议/ })).toBeVisible();
  await expect(guide.getByRole("button", { name: "看商品" })).toBeEnabled();
});
