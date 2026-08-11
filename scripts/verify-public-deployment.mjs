import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const requireFromWeb = createRequire(
  new URL("../apps/web/package.json", import.meta.url),
);
const { chromium, expect } = requireFromWeb("@playwright/test");

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const baseUrl = (process.env.PUBLIC_WEB_URL ?? "https://ai-shopping-agent.vercel.app").replace(/\/$/u, "");
const apiUrl = (process.env.PUBLIC_API_URL ?? "https://ai-shopping-agent-api.vercel.app/api/v1").replace(/\/$/u, "");
const screenshotDir = path.join(projectRoot, "artifacts/screenshots");
const evidenceTime = new Date("2026-08-11T12:00:00Z");

await mkdir(screenshotDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
try {
  const caseContext = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  const casePage = await caseContext.newPage();
  await casePage.clock.setFixedTime(evidenceTime);
  const healthResponse = await casePage.goto(`${apiUrl}/health`, {
    waitUntil: "domcontentloaded",
  });
  assert.equal(healthResponse?.status(), 200, "public API health endpoint must return 200");
  assert.deepEqual(JSON.parse(await casePage.locator("body").innerText()), {
    status: "ok",
    mode: "deterministic-foundation",
  });
  await casePage.goto(`${baseUrl}/case-study`, { waitUntil: "networkidle" });
  await expect(
    casePage.getByRole("heading", { name: /基于 TikTok Shop 的 AI 导购产品原型/ }),
  ).toBeVisible();

  const demoLinks = casePage.locator("[data-demo-link]");
  assert.equal(await demoLinks.count(), 3, "case study must expose three Demo entries");
  for (const link of await demoLinks.all()) {
    assert.equal(await link.getAttribute("href"), `${baseUrl}/`);
  }

  await casePage.locator('[data-evidence="overview"]').click();
  const reader = casePage.locator("#evidence-modal");
  await expect(reader).toBeVisible();
  await expect(reader).toHaveAttribute("aria-labelledby", "evidence-modal-title");
  await expect(reader.locator("#evidence-modal-title")).toHaveText("产品概览与边界");
  await expect(reader.getByRole("heading", { name: /AI Shopping Agent/ }).first()).toBeVisible();
  assert.ok(
    (await reader.locator("#evidence-reader-content").innerText()).length > 5_000,
    "the modal must expose the complete rich-text evidence, not a short abstract",
  );
  await reader.getByRole("button", { name: "关闭关键证据弹窗" }).click();
  await expect(reader).toBeHidden();
  await casePage.screenshot({
    path: path.join(screenshotDir, "public-case-study-desktop.png"),
    fullPage: false,
  });
  await caseContext.close();

  const demoContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const demoPage = await demoContext.newPage();
  await demoPage.clock.setFixedTime(evidenceTime);
  await demoPage.goto(`${baseUrl}/?scenario=normal`, { waitUntil: "networkidle" });

  const openingResponse = demoPage.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname.endsWith("/guide/sessions"),
  );
  await demoPage
    .getByRole("button", { name: /问问这款：Seoul Shade Daily Fluid/ })
    .click();
  const opening = await openingResponse;
  assert.equal(opening.status(), 201);
  assert.equal((await opening.json()).guide_view_kind, "OPENING_CONTEXT");

  const guide = demoPage.getByRole("dialog", { name: "AI 导购（概念）" });
  await expect(
    guide.getByText("我看到你在看 Seoul Shade。你最想确认什么？"),
  ).toBeVisible();
  await guide
    .getByLabel("继续提问")
    .fill("预算20美元以内、无香精、自然妆效、日常通勤");
  const decisionResponse = demoPage.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      /\/guide\/sessions\/[^/]+\/messages$/u.test(new URL(response.url()).pathname),
  );
  await guide.getByRole("button", { name: "发送消息" }).click();
  const decision = await decisionResponse;
  assert.equal(decision.status(), 200);
  assert.equal((await decision.json()).guide_view_kind, "DECISION_READY");

  const recommendation = guide.getByRole("article", {
    name: "Seoul Shade Daily Fluid 商品建议",
  });
  await expect(recommendation).toContainText("适合点");
  await expect(recommendation).toContainText("取舍");
  await demoPage.screenshot({
    path: path.join(screenshotDir, "public-demo-mobile.png"),
    fullPage: false,
  });

  await recommendation.getByRole("button", { name: "看商品" }).click();
  const pdp = demoPage.getByRole("region", { name: "商品详情" });
  await expect(pdp.getByRole("heading", { name: "Seoul Shade Daily Fluid" })).toBeVisible();

  const previewResponse = demoPage.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname.endsWith("/commerce/cart/preview"),
  );
  await demoPage.getByRole("button", { name: "模拟加入购物车" }).click();
  assert.equal((await previewResponse).status(), 201);

  const confirmResponse = demoPage.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      /\/commerce\/operations\/[^/]+\/items$/u.test(new URL(response.url()).pathname),
  );
  await demoPage
    .getByRole("dialog", { name: "复核模拟加购" })
    .getByRole("button", { name: "确认模拟加购" })
    .click();
  assert.equal((await confirmResponse).status(), 201);
  const receipt = demoPage.getByRole("dialog", { name: "模拟加购回执" });
  await expect(receipt).toContainText("模拟加购成功");
  await expect(receipt).toContainText("未创建订单或支付");
  await demoContext.close();

  console.log(
    JSON.stringify(
      {
        status: "passed",
        web: baseUrl,
        case_study: `${baseUrl}/case-study`,
        api_health: `${apiUrl}/health`,
        journey: "case study -> Demo -> AI decision -> PDP -> simulated cart receipt",
        screenshots: [
          path.relative(projectRoot, path.join(screenshotDir, "public-case-study-desktop.png")),
          path.relative(projectRoot, path.join(screenshotDir, "public-demo-mobile.png")),
        ],
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
}
