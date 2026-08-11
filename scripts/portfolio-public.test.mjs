import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

const moduleUrl = new URL("./build-portfolio-public.mjs", import.meta.url);
let portfolioModule = null;

try {
  portfolioModule = await import(`${moduleUrl.href}?test=${Date.now()}`);
} catch {
  // The first RED run reaches this branch before the deployment bundle exists.
}

const projectRoot = path.resolve(new URL("..", import.meta.url).pathname);

test("publishes the case study with protocol-aware Demo links", async () => {
  assert.equal(typeof portfolioModule?.renderPublicCaseStudy, "function");
  const source = await readFile(path.join(projectRoot, "vibe-coding-case-study.html"), "utf8");
  const output = portfolioModule.renderPublicCaseStudy(source);

  assert.equal((output.match(/<a[^>]+data-demo-link/g) ?? []).length, 3);
  assert.match(output, /window\.location\.protocol === "file:"/);
  assert.match(output, /http:\/\/127\.0\.0\.1:3000/);
  assert.match(output, /new URL\("\/", window\.location\.href\)/);
  assert.doesNotMatch(output, /href="http:\/\/127\.0\.0\.1:3000"/);
  assert.doesNotMatch(output, /href="\.\/\.\.\/\.\.\/AI产品经理\//);
  assert.doesNotMatch(output, /href="\.\/\.env/);
  assert.doesNotMatch(output, /href="\.\/(?:AGENTS\.md|\.gitignore)"/);
});

test("builds a deterministic public bundle with complete local references", async () => {
  assert.equal(typeof portfolioModule?.buildPortfolioBundle, "function");
  const temporaryRoot = await mkdtemp(path.join(tmpdir(), "portfolio-public-"));
  const publicRoot = path.join(temporaryRoot, "public");

  const built = await portfolioModule.buildPortfolioBundle({ projectRoot, publicRoot, check: false });
  assert.equal(built.changed, true);
  assert.ok(built.manifest.files.length >= 25);

  const page = await readFile(path.join(publicRoot, "vibe-coding-case-study.html"), "utf8");
  const localReferences = [
    ...page.matchAll(/(?:src|href)="\.\/([^"#?]+)(?:[#?][^"]*)?"/g),
  ].map((match) => match[1]);
  for (const reference of new Set(localReferences)) {
    const entry = built.manifest.files.find(
      (file) => file.path === reference || file.path.startsWith(`${reference}/`),
    );
    assert.ok(entry, `missing bundled reference: ${reference}`);
  }

  for (const file of built.manifest.files) {
    assert.doesNotMatch(file.path, /(^|\/)\.env/u);
    assert.match(file.sha256, /^[a-f0-9]{64}$/);
    assert.ok(file.bytes > 0);
  }
  assert.equal(await portfolioModule.buildPortfolioBundle({ projectRoot, publicRoot, check: true }).then((result) => result.changed), false);
});

test("check mode detects drift without rewriting the public file", async () => {
  assert.equal(typeof portfolioModule?.buildPortfolioBundle, "function");
  const temporaryRoot = await mkdtemp(path.join(tmpdir(), "portfolio-public-drift-"));
  const publicRoot = path.join(temporaryRoot, "public");
  await portfolioModule.buildPortfolioBundle({ projectRoot, publicRoot, check: false });
  const pagePath = path.join(publicRoot, "vibe-coding-case-study.html");
  await writeFile(pagePath, "stale", "utf8");

  const result = await portfolioModule.buildPortfolioBundle({ projectRoot, publicRoot, check: true });
  assert.equal(result.changed, true);
  assert.equal(await readFile(pagePath, "utf8"), "stale");
});

test("wires bundle drift checks into the Web build and exposes a clean case-study route", async () => {
  const rootPackage = JSON.parse(await readFile(path.join(projectRoot, "package.json"), "utf8"));
  const webPackage = JSON.parse(await readFile(path.join(projectRoot, "apps/web/package.json"), "utf8"));
  const nextConfig = await readFile(path.join(projectRoot, "apps/web/next.config.ts"), "utf8");

  assert.equal(rootPackage.scripts["build:portfolio-public"], "node scripts/build-portfolio-public.mjs");
  assert.equal(rootPackage.scripts["check:portfolio-public"], "node scripts/build-portfolio-public.mjs --check");
  assert.equal(rootPackage.scripts["test:portfolio-public"], "node --test scripts/portfolio-public.test.mjs");
  assert.equal(webPackage.scripts.prebuild, "node ../../scripts/build-portfolio-public.mjs --check");
  assert.match(nextConfig, /source:\s*["']\/case-study["']/);
  assert.match(nextConfig, /destination:\s*["']\/vibe-coding-case-study\.html["']/);
});
