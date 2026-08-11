# Offline Evidence Document Reader Implementation Plan

> **For Codex:** Execute this plan inline with `superpowers:executing-plans`. Follow RED → GREEN → REFACTOR for each behavior and keep the case-study page usable through both `file://` and HTTP.

**Goal:** Turn the six “关键证据” cards in `vibe-coding-case-study.html` into a large, accessible Document Reader Modal that contains the complete rich-text source documents and remains fully usable when the HTML file is opened directly.

**Architecture:** A deterministic Node.js generator reads the six declared authority files, renders their controlled Markdown/JSON into safe HTML, computes SHA-256 metadata and replaces only a marked template region inside the standalone case-study page. Runtime JavaScript clones the selected embedded document into one native `<dialog>`; no `fetch()`, server, CDN, or remote parser is required. Unit tests lock rendering, sanitization, link rewriting, completeness, and drift detection; a Playwright verifier checks `file://` and an ephemeral HTTP server across desktop and mobile viewports.

**Tech Stack:** Node.js standard library, standalone HTML/CSS/JavaScript, native `<dialog>`, Node test runner, Playwright Chromium from `apps/web`.

---

## Task 1: Establish the deterministic evidence generator

**Files:**

- Create: `scripts/build-case-study-evidence.mjs`
- Create: `scripts/case-study-evidence.test.mjs`
- Modify: `package.json`

### Step 1: Write failing generator contract tests

Add tests that expect exports for:

- the fixed six-document registry;
- safe Markdown rendering with headings, anchors, inline emphasis/code, lists, task lists, blockquotes, tables, fenced code and links;
- JSON rendering that exposes all fields and preserves a formatted raw view;
- repository-relative link rewriting from each source directory;
- raw HTML and unsafe protocols being escaped or rejected;
- stable generated-region replacement and `--check` drift detection.

Run:

```bash
node --test scripts/case-study-evidence.test.mjs
```

Expected: FAIL because the generator module/exports do not exist.

### Step 2: Implement the minimal controlled renderer

Implement with Node standard-library only:

- `escapeHtml` and safe-URL filtering;
- a line-oriented Markdown block parser for the source syntax used in the six files;
- controlled inline rendering for emphasis, code and links;
- stable slug/anchor generation namespaced by evidence key;
- complete JSON tree rendering plus escaped raw JSON;
- SHA-256 and source metadata;
- stable `<!-- EVIDENCE_DOCUMENTS_START -->` / `END` replacement;
- `--check` mode that exits non-zero when the embedded region is stale.

Export pure helpers for tests. Do not execute when imported.

### Step 3: Add package scripts

Add:

```json
"build:case-study-evidence": "node scripts/build-case-study-evidence.mjs",
"check:case-study-evidence": "node scripts/build-case-study-evidence.mjs --check",
"test:case-study-evidence": "node --test scripts/case-study-evidence.test.mjs"
```

### Step 4: Run GREEN and refactor

Run:

```bash
pnpm test:case-study-evidence
```

Expected: all generator tests pass. Then run `pnpm check:case-study-evidence`; it should fail until the case-study page contains the marked generated region.

### Step 5: Commit

```bash
git add package.json scripts/build-case-study-evidence.mjs scripts/case-study-evidence.test.mjs
git commit -m "build: generate offline evidence documents"
```

## Task 2: Replace the summary popup with the full Document Reader

**Files:**

- Modify: `vibe-coding-case-study.html`
- Modify: `scripts/case-study-evidence.test.mjs`

### Step 1: Write failing page-shell assertions

Extend the unit test to require:

- one marked generated template region;
- six embedded document templates with source path and SHA-256;
- one large document-reader dialog with a sticky header, collapsible TOC, scroll article and raw-file link;
- no runtime `fetch()`;
- existing evidence keys still map one-to-one to the six sources.

Run the unit test and record the expected failures against the current summary-only modal.

### Step 2: Implement the modal shell and runtime behavior

Update the standalone page:

- retain current evidence cards and hover/focus states;
- replace summary fields with title/source/hash header, TOC, article, source link and sync-error state;
- set desktop size to approximately 1040px × 86dvh;
- make mobile near-full-screen with a single scroll column and collapsible TOC;
- keep native Escape support, backdrop click, explicit close and focus return;
- add focus containment while open;
- keep tables/code horizontally scrollable inside the article, never at page level;
- clone the selected embedded template and wire internal TOC scrolling;
- use relative source links that also work under `file://`.

### Step 3: Generate all six complete documents

Run:

```bash
pnpm build:case-study-evidence
pnpm check:case-study-evidence
```

Expected: the generator writes only the marked region, then `--check` exits 0.

### Step 4: Verify exact source coverage

Run unit tests that assert beginning, middle and end sentinels for every source, all JSON top-level keys, and matching SHA-256 values.

### Step 5: Commit

```bash
git add vibe-coding-case-study.html scripts/case-study-evidence.test.mjs
git commit -m "feat: embed full evidence document reader"
```

## Task 3: Add real-browser offline and HTTP verification

**Files:**

- Create: `scripts/verify-case-study-evidence.mjs`
- Modify: `package.json`

### Step 1: Write the verifier with explicit failing expectations

Build a reusable Playwright verifier that:

- resolves Playwright from `apps/web` without adding a root dependency;
- opens the actual `file://` page;
- starts an ephemeral built-in Node HTTP server and opens the same file through HTTP;
- exercises all six evidence cards;
- checks complete-document sentinels, metadata, TOC and raw-file link;
- checks Escape, backdrop close, focus return and focus containment;
- checks desktop, 390×844 and 320×700 layouts;
- checks long tables/code do not cause page-level horizontal overflow;
- saves desktop and mobile reader screenshots under `artifacts/screenshots/`.

Before the reader implementation is complete, run the verifier and record its failures.

### Step 2: Complete minimal browser fixes

Fix only defects exposed by the verifier. Do not change the AI Demo or source evidence content.

### Step 3: Run browser GREEN

Run:

```bash
node scripts/verify-case-study-evidence.mjs
```

Expected: both `file://` and HTTP modes pass across all three viewport contracts, with screenshots generated.

### Step 4: Add the package command and commit

Add:

```json
"verify:case-study-evidence": "node scripts/verify-case-study-evidence.mjs"
```

Then commit:

```bash
git add package.json scripts/verify-case-study-evidence.mjs artifacts/screenshots/case-study-evidence-*.png
git commit -m "test: verify offline evidence reading"
```

## Task 4: Document and close the work package

**Files:**

- Modify: `README.md`
- Modify: `TASKS.md`
- Modify: `docs/superpowers/specs/2026-08-11-offline-evidence-document-reader-design.md`
- Create: `artifacts/evidence/case-study-evidence-reader-verification.md`

### Step 1: Record product-facing verification evidence

Document:

- why pre-rendering was chosen for the portfolio reader;
- exact six sources and synchronization mechanism;
- `file://` and HTTP browser results;
- desktop/mobile interaction and accessibility results;
- screenshot paths and hashes;
- limitations: repository-authored content only, controlled Markdown subset, no remote-source freshness.

### Step 2: Update reader entry points and task status

- README: add the generation/check/verification commands next to the case-study page entry.
- TASKS: change the reader row from `IN PROGRESS` to `DONE` and link the verification report and screenshots.
- Design spec: mark the approved design as implemented and point to evidence without changing its original decisions.

### Step 3: Run final verification from a clean source state

Run once after generation:

```bash
pnpm test:case-study-evidence
pnpm check:case-study-evidence
pnpm verify:case-study-evidence
pnpm lint:web
pnpm --dir apps/web exec tsc --noEmit
git diff --check
```

Also verify the existing standalone case-study page and local Demo/API URLs still return HTTP 200 when their local processes are available; do not describe unavailable processes as product failures.

### Step 4: Inspect generated screenshots at original detail

Confirm:

- desktop reader is centered and not a drawer;
- mobile reader is usable at 390×844 and 320×700;
- title/source/close remain reachable;
- long document, table and code content are readable;
- underlying page remains visually secondary;
- no dev overlay or horizontal page overflow.

### Step 5: Commit final documentation

```bash
git add README.md TASKS.md docs/superpowers/specs/2026-08-11-offline-evidence-document-reader-design.md artifacts/evidence/case-study-evidence-reader-verification.md
git commit -m "docs: record offline evidence reader verification"
```

## Definition of Done

- All six evidence cards open the full corresponding source document inside the case-study page.
- Direct `file://` opening requires no network, server, CDN or runtime parser.
- Markdown and JSON are complete, escaped and readable as rich content.
- Source SHA-256 and `--check` make drift visible.
- Desktop and mobile browser contracts pass for `file://` and HTTP.
- Escape, backdrop, close, TOC, focus return and raw-file access work.
- Product Demo behavior, API and source evidence content remain unchanged.
- TASKS and the verification report point to reproducible commands and screenshots.
