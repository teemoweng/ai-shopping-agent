import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

import { buildEvidenceRegion, EVIDENCE_DOCUMENTS } from "./build-case-study-evidence.mjs";

const scriptPath = fileURLToPath(import.meta.url);
const projectRoot = path.resolve(path.dirname(scriptPath), "..");
const pagePath = path.join(projectRoot, "vibe-coding-case-study.html");
const requireFromWeb = createRequire(path.join(projectRoot, "apps/web/package.json"));
const { chromium } = requireFromWeb("@playwright/test");
const updateScreenshots = process.argv.includes("--update-screenshots");

const contentTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".json", "application/json; charset=utf-8"],
  [".md", "text/markdown; charset=utf-8"],
]);

const sentinels = {
  overview: ["AI Shopping Agent — US K-Beauty Sunscreen Guide", "文档入口"],
  interaction: ["Chat-first 轻量 AI 导购设计规格", "11. 完成定义"],
  evaluation: ["Chat-first Lightweight Guide Verification", "Evidence limits"],
  machine: ["schema_version", "verification_history", "known_limitations"],
  roadmap: ["AI Shopping Agent 总路线图", "11. 文档与事实源边界"],
  delivery: ["AI Shopping Agent 任务台", "更新规则"],
};

function contentType(filePath) {
  return contentTypes.get(path.extname(filePath).toLowerCase()) ?? "application/octet-stream";
}

async function startStaticServer() {
  const server = createServer(async (request, response) => {
    try {
      const requestUrl = new URL(request.url, "http://127.0.0.1");
      const requested = decodeURIComponent(requestUrl.pathname === "/" ? "/vibe-coding-case-study.html" : requestUrl.pathname);
      const absolute = path.resolve(projectRoot, `.${requested}`);
      if (!absolute.startsWith(`${projectRoot}${path.sep}`) && absolute !== projectRoot) {
        response.writeHead(403).end("Forbidden");
        return;
      }
      const body = await readFile(absolute);
      response.writeHead(200, { "content-type": contentType(absolute), "cache-control": "no-store" });
      response.end(body);
    } catch {
      response.writeHead(404).end("Not found");
    }
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address === "object");
  return {
    url: `http://127.0.0.1:${address.port}/vibe-coding-case-study.html`,
    close: () => new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve()))),
  };
}

async function expectNoPageOverflow(page, label) {
  const geometry = await page.evaluate(() => ({
    innerWidth: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  assert.ok(
    geometry.scrollWidth <= geometry.innerWidth + 1,
    `${label}: page overflowed horizontally (${geometry.scrollWidth} > ${geometry.innerWidth})`,
  );
}

async function openEvidence(page, key) {
  const card = page.locator(`.evidence-card[data-evidence="${key}"]`);
  await card.click();
  const dialog = page.locator("#evidence-modal");
  await dialog.waitFor({ state: "visible" });
  await page.locator("#evidence-reader-content .evidence-document-summary").waitFor({ state: "visible" });
  await dialog.evaluate((element) => Promise.all(element.getAnimations().map((animation) => animation.finished)));
  assert.equal(await dialog.evaluate((element) => getComputedStyle(element).opacity), "1", "reader animation must settle before evidence sampling");
  return { card, dialog };
}

async function verifyAllDocuments(page, mode, expectedDocuments) {
  assert.equal(await page.locator('template[id^="evidence-document-"]').count(), 6, `${mode}: template count`);
  for (const document of expectedDocuments) {
    const { card, dialog } = await openEvidence(page, document.key);
    assert.equal(await page.locator("#evidence-modal-title").innerText(), document.title, `${mode}/${document.key}: title`);
    assert.equal(
      await page.locator("#evidence-reader-hash").getAttribute("title"),
      document.sha256,
      `${mode}/${document.key}: source hash`,
    );
    assert.equal(
      await page.locator("#evidence-reader-source").getAttribute("href"),
      `./${document.source}`,
      `${mode}/${document.key}: raw source href`,
    );
    const text = await page.locator("#evidence-reader-content").innerText();
    assert.ok(text.length > 1800, `${mode}/${document.key}: expected complete document text, got ${text.length} chars`);
    for (const sentinel of sentinels[document.key]) {
      assert.ok(text.includes(sentinel), `${mode}/${document.key}: missing sentinel ${sentinel}`);
    }
    assert.ok(await page.locator("#evidence-reader-toc a").count(), `${mode}/${document.key}: missing TOC`);
    const focusContained = await page.evaluate(() => {
      const dialog = document.querySelector("#evidence-modal");
      return dialog?.contains(document.activeElement) ?? false;
    });
    assert.equal(focusContained, true, `${mode}/${document.key}: focus escaped dialog`);
    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "hidden" });
    assert.equal(await card.evaluate((element) => element === document.activeElement), true, `${mode}/${document.key}: focus return`);
  }
}

async function verifyTocAndBackdrop(page, mode) {
  await openEvidence(page, "overview");
  const firstTocLink = page.locator("#evidence-reader-toc a").first();
  const targetId = (await firstTocLink.getAttribute("href")).slice(1);
  await firstTocLink.click();
  assert.equal(
    await page.evaluate((id) => document.activeElement?.id === id, targetId),
    true,
    `${mode}: TOC should focus its article heading`,
  );
  await page.keyboard.press("Escape");

  await openEvidence(page, "interaction");
  const dialogBox = await page.locator("#evidence-modal").boundingBox();
  assert.ok(dialogBox, `${mode}: dialog geometry missing`);
  const outsideX = Math.max(1, dialogBox.x - 6);
  const outsideY = Math.max(1, dialogBox.y - 6);
  await page.mouse.click(outsideX, outsideY);
  await page.locator("#evidence-modal").waitFor({ state: "hidden" });
}

async function prepareVisualPage(page, viewport, key) {
  await page.setViewportSize(viewport);
  await page.reload({ waitUntil: "load" });
  await page.evaluate(async () => {
    await document.fonts.ready;
    const images = [...document.images];
    images.forEach((image) => {
      image.loading = "eager";
    });
    await Promise.all(
      images.map(async (image) => {
        if (!image.complete) {
          await new Promise((resolve) => {
            image.addEventListener("load", resolve, { once: true });
            image.addEventListener("error", resolve, { once: true });
          });
        }
        await image.decode().catch(() => undefined);
      }),
    );
  });
  await page.addStyleTag({
    content:
      "*, *::before, *::after { animation: none !important; transition: none !important; caret-color: transparent !important; } [data-reveal] { opacity: 1 !important; transform: none !important; }",
  });
  await page.locator(`.evidence-card[data-evidence="${key}"]`).evaluate((element) => {
    element.scrollIntoView({ block: "center", inline: "center", behavior: "instant" });
  });
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await openEvidence(page, key);
}

async function captureScreenshot(page, outputPath) {
  await page.screenshot({ path: updateScreenshots ? outputPath : undefined, fullPage: false });
}

async function verifyResponsiveReader(page, viewport, screenshotName) {
  const prepare = () => prepareVisualPage(page, viewport, "machine");
  await prepare();
  const geometry = await page.evaluate(() => {
    const modal = document.querySelector("#evidence-modal").getBoundingClientRect();
    const close = document.querySelector(".evidence-modal-close").getBoundingClientRect();
    const layout = getComputedStyle(document.querySelector(".evidence-reader-layout"));
    const body = document.querySelector("#evidence-reader-body");
    return {
      modal: { left: modal.left, top: modal.top, right: modal.right, bottom: modal.bottom },
      close: { left: close.left, top: close.top, right: close.right, bottom: close.bottom },
      columns: layout.gridTemplateColumns,
      bodyScrollable: body.scrollHeight > body.clientHeight,
      tocSummaryVisible: getComputedStyle(document.querySelector(".evidence-reader-toc-panel > summary")).display !== "none",
    };
  });
  assert.ok(geometry.modal.left >= 0 && geometry.modal.right <= viewport.width + 1, `${screenshotName}: modal x bounds`);
  assert.ok(geometry.modal.top >= 0 && geometry.modal.bottom <= viewport.height + 1, `${screenshotName}: modal y bounds`);
  assert.ok(geometry.close.left >= 0 && geometry.close.right <= viewport.width, `${screenshotName}: close x bounds`);
  assert.equal(geometry.bodyScrollable, true, `${screenshotName}: complete document should scroll`);
  assert.equal(geometry.tocSummaryVisible, true, `${screenshotName}: mobile TOC summary`);
  assert.equal(geometry.columns.split(" ").length, 1, `${screenshotName}: expected one-column reader`);
  await expectNoPageOverflow(page, screenshotName);
  await captureScreenshot(page, path.join(projectRoot, "artifacts/screenshots", screenshotName));
  await page.keyboard.press("Escape");
}

async function verifyDesktopReader(page) {
  const viewport = { width: 1440, height: 1000 };
  const prepare = () => prepareVisualPage(page, viewport, "evaluation");
  await prepare();
  const geometry = await page.evaluate(() => {
    const modal = document.querySelector("#evidence-modal").getBoundingClientRect();
    const layout = getComputedStyle(document.querySelector(".evidence-reader-layout"));
    const body = document.querySelector("#evidence-reader-body");
    return {
      width: modal.width,
      height: modal.height,
      columns: layout.gridTemplateColumns,
      bodyScrollable: body.scrollHeight > body.clientHeight,
    };
  });
  assert.ok(geometry.width >= 980 && geometry.width <= 1080, `desktop: reader width ${geometry.width}`);
  assert.ok(geometry.height <= 860 && geometry.height >= 760, `desktop: reader height ${geometry.height}`);
  assert.ok(geometry.columns.split(" ").length >= 2, "desktop: TOC and article columns");
  assert.equal(geometry.bodyScrollable, true, "desktop: complete document should scroll");
  await expectNoPageOverflow(page, "desktop");
  await captureScreenshot(page, path.join(projectRoot, "artifacts/screenshots/case-study-evidence-desktop.png"));
  await page.keyboard.press("Escape");
}

async function run() {
  const expected = await buildEvidenceRegion(projectRoot);
  const staticServer = await startStaticServer();
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const page = await context.newPage();
    const targets = [
      { mode: "file", url: pathToFileURL(pagePath).href },
      { mode: "http", url: staticServer.url },
    ];
    for (const target of targets) {
      await page.goto(target.url, { waitUntil: "load" });
      await verifyAllDocuments(page, target.mode, expected.documents);
      await verifyTocAndBackdrop(page, target.mode);
    }
    await page.goto(pathToFileURL(pagePath).href, { waitUntil: "load" });
    await verifyDesktopReader(page);
    await verifyResponsiveReader(page, { width: 390, height: 844 }, "case-study-evidence-mobile.png");
    await verifyResponsiveReader(page, { width: 320, height: 700 }, "case-study-evidence-mobile-compact.png");
    await context.close();
  } finally {
    await browser.close();
    await staticServer.close();
  }
  console.log(
    `Case-study evidence reader verified: file + HTTP, 6/6 documents, desktop + 2 mobile viewports${updateScreenshots ? "; screenshots updated" : "; screenshots unchanged"}.`,
  );
}

await run();
