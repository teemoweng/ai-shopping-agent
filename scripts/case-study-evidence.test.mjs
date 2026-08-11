import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

const moduleUrl = new URL("./build-case-study-evidence.mjs", import.meta.url);
let evidenceModule = null;

try {
  evidenceModule = await import(`${moduleUrl.href}?test=${Date.now()}`);
} catch {
  // The first RED run intentionally reaches this branch before the generator exists.
}

test("exports the deterministic six-document registry", () => {
  assert.ok(evidenceModule, "expected the evidence generator module to exist");
  assert.deepEqual(
    evidenceModule.EVIDENCE_DOCUMENTS.map(({ key, source }) => [key, source]),
    [
      ["overview", "README.md"],
      ["interaction", "docs/superpowers/specs/2026-08-10-chat-first-lightweight-guide-design.md"],
      ["evaluation", "artifacts/evidence/chat-first-verification.md"],
      ["machine", "artifacts/evidence/chat-first-run-manifest.json"],
      ["roadmap", "PLAN.md"],
      ["delivery", "TASKS.md"],
    ],
  );
});

test("renders the controlled Markdown vocabulary and escapes raw HTML", () => {
  assert.equal(typeof evidenceModule?.renderMarkdown, "function");
  const markdown = [
    "# Product title",
    "",
    "> A quoted **boundary**.",
    "",
    "## Decision flow",
    "",
    "- [x] complete",
    "- [ ] pending",
    "- plain *item* with `code`",
    "",
    "1. First",
    "2. Second",
    "",
    "| State | Result |",
    "|---|---|",
    "| Opening | Ready |",
    "",
    "```js",
    "const safe = true;",
    "```",
    "",
    "[Local](./artifacts/report.md) [External](https://example.com) [Unsafe](javascript:alert(1))",
    "",
    "<script>alert('never')</script>",
  ].join("\n");

  const result = evidenceModule.renderMarkdown(markdown, {
    key: "test",
    source: "docs/source.md",
  });

  assert.match(result.html, /<h1 id="test-product-title">Product title<\/h1>/);
  assert.match(result.html, /<blockquote>/);
  assert.match(result.html, /type="checkbox" checked disabled/);
  assert.match(result.html, /<ol>/);
  assert.match(result.html, /<table>/);
  assert.match(result.html, /<pre><code class="language-js">/);
  assert.match(result.html, /href="\.\/docs\/artifacts\/report\.md"/);
  assert.match(result.html, /target="_blank" rel="noreferrer"/);
  assert.doesNotMatch(result.html, /href="javascript:/);
  assert.match(result.html, /&lt;script&gt;/);
  assert.deepEqual(result.toc, [
    { level: 2, id: "test-decision-flow", text: "Decision flow" },
  ]);
});

test("renders all JSON fields plus escaped formatted source", () => {
  assert.equal(typeof evidenceModule?.renderJson, "function");
  const source = JSON.stringify({
    source: { commit: "abc123", clean: true },
    gates: [{ name: "browser", passed: 39, skipped: 31 }],
  });
  const result = evidenceModule.renderJson(source, { key: "machine" });

  for (const sentinel of ["source", "commit", "abc123", "gates", "browser", "passed", "skipped"]) {
    assert.match(result.html, new RegExp(sentinel));
  }
  assert.match(result.html, /<details class="json-raw">/);
  assert.match(result.html, /&quot;commit&quot;: &quot;abc123&quot;/);
});

test("replaces only the marked generated region and detects drift", () => {
  assert.equal(typeof evidenceModule?.replaceGeneratedRegion, "function");
  const shell = "before\n<!-- EVIDENCE_DOCUMENTS_START -->\nold\n<!-- EVIDENCE_DOCUMENTS_END -->\nafter\n";
  const expected = "before\n<!-- EVIDENCE_DOCUMENTS_START -->\nnew\n<!-- EVIDENCE_DOCUMENTS_END -->\nafter\n";
  assert.equal(evidenceModule.replaceGeneratedRegion(shell, "new"), expected);
  assert.throws(
    () => evidenceModule.replaceGeneratedRegion("no markers", "new"),
    /generated evidence markers/i,
  );
});

test("build output embeds complete six-source content, metadata, and stable hashes", async () => {
  assert.equal(typeof evidenceModule?.buildEvidenceRegion, "function");
  const projectRoot = path.resolve(new URL("..", import.meta.url).pathname);
  const result = await evidenceModule.buildEvidenceRegion(projectRoot);

  assert.equal(result.documents.length, 6);
  assert.equal((result.html.match(/<template id="evidence-document-/g) ?? []).length, 6);
  for (const document of result.documents) {
    const source = await readFile(path.join(projectRoot, document.source), "utf8");
    const meaningfulLines = source.split(/\r?\n/).filter((line) => line.trim().length > 0);
    const sentinels = [meaningfulLines[0], meaningfulLines[Math.floor(meaningfulLines.length / 2)], meaningfulLines.at(-1)];
    assert.match(document.sha256, /^[a-f0-9]{64}$/);
    assert.match(result.html, new RegExp(`data-source="${document.source.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`));
    for (const sentinel of sentinels) {
      const normalized = sentinel
        .replace(/^#{1,6}\s+/, "")
        .replace(/[`*_>#|\[\]()]/g, "")
        .replace(/\s+/g, " ")
        .trim();
      if (normalized.length >= 8) {
        assert.ok(document.searchText.includes(normalized), `missing sentinel from ${document.source}: ${normalized}`);
      }
    }
  }
});

test("check mode reports a stale page without mutating it", async () => {
  assert.equal(typeof evidenceModule?.synchronizeEvidencePage, "function");
  const temporaryRoot = await mkdtemp(path.join(tmpdir(), "case-study-evidence-"));
  const pagePath = path.join(temporaryRoot, "page.html");
  await writeFile(
    pagePath,
    "shell\n<!-- EVIDENCE_DOCUMENTS_START -->\nstale\n<!-- EVIDENCE_DOCUMENTS_END -->\n",
  );
  const expectedRegion = "fresh";

  const check = await evidenceModule.synchronizeEvidencePage({
    pagePath,
    generatedRegion: expectedRegion,
    check: true,
  });
  assert.equal(check.changed, true);
  assert.equal(await readFile(pagePath, "utf8"), "shell\n<!-- EVIDENCE_DOCUMENTS_START -->\nstale\n<!-- EVIDENCE_DOCUMENTS_END -->\n");

  await evidenceModule.synchronizeEvidencePage({ pagePath, generatedRegion: expectedRegion, check: false });
  const finalCheck = await evidenceModule.synchronizeEvidencePage({
    pagePath,
    generatedRegion: expectedRegion,
    check: true,
  });
  assert.equal(finalCheck.changed, false);
});

test("module URL is local and requires no remote runtime", () => {
  assert.equal(pathToFileURL(path.resolve(new URL("..", import.meta.url).pathname, "scripts/build-case-study-evidence.mjs")).protocol, "file:");
});
