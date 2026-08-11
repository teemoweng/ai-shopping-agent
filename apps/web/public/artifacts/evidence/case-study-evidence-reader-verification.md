# Case-study Offline Evidence Reader Verification

## Result

The product case-study page now embeds six complete authority documents as a rich, offline Document Reader Modal. A reader can open the page directly through `file://`, click any “关键证据” card, browse the full source through a table of contents, inspect its source path and SHA-256, open the raw file, and close through Escape, backdrop, or the close control with focus returned to the originating card.

Accepted source commit: `5f9771d77c2e02994506403c10f48a6908a44041`.

This is a portfolio-page reading capability. It does not change the AI shopping Demo, API, fixtures, model behavior, existing evaluation results, or product claims.

## Product decision

The six sources total 106,729 bytes before conversion. They are small enough to pre-render into one standalone HTML page, so the reader does not need runtime `fetch()`, a local server, a CDN, or a browser Markdown parser. This keeps the direct-double-click workflow while providing a substantially better reading experience than raw Markdown.

The generated page is 273,723 bytes and remains a single portable HTML file. Only the region between `EVIDENCE_DOCUMENTS_START` and `EVIDENCE_DOCUMENTS_END` is generated; the surrounding product narrative and visual design remain manually maintained.

## Embedded authority files

| Evidence card | Source | Bytes | SHA-256 |
|---|---|---:|---|
| 产品概览与边界 | `README.md` | 21,891 | `fb5fcd1b3cdc71bdac3bd8233dcfa8f9eef0958a0b3dec0597d555ce2b84233e` |
| Chat-first 交互规格 | `docs/superpowers/specs/2026-08-10-chat-first-lightweight-guide-design.md` | 15,663 | `9de99aa1da8fb18b04d4cd754793689f8704c58c03214c50e89d4e46ead53e57` |
| 原型评测 | `artifacts/evidence/chat-first-verification.md` | 17,382 | `a8fc9fcda4a21c3997dd82c6e86378948b47827ec4737dfdb4080cfcb2ad60ec` |
| 运行证据 | `artifacts/evidence/chat-first-run-manifest.json` | 16,671 | `f0e101f13339b42cf107fe1c7619f869b61c52cf6f8247d90852a1ae5b8eb567` |
| 阶段计划 | `PLAN.md` | 21,042 | `714bd97101422638be303464cc8badce8cba9abd14eb9338c97863d736fa7ebe` |
| 交付状态 | `TASKS.md` | 14,080 | `c29acf6805764bfa78530be011166bce1ea2be7532a41d84a437fe658814f17c` |

The generator tests check beginning, middle, and end source sentinels for every document. The JSON reader renders every top-level and nested value and retains an expandable, formatted raw JSON view.

## Rendering and safety boundary

- Markdown support covers headings and anchors, paragraphs, emphasis, inline code, ordered and unordered lists, task lists, blockquotes and callouts, tables, fenced code, images, and links.
- Repository-relative links are resolved from the source document directory and rewritten relative to the case-study page.
- External links open separately with `rel="noreferrer"`.
- Raw HTML is escaped. `javascript:`, `data:`, and `vbscript:` link targets are not emitted as active links.
- The runtime clones only pre-rendered `<template>` content and contains no `fetch()` call.
- `pnpm check:case-study-evidence` is read-only and exits non-zero when a source change makes the embedded region stale.

This controlled renderer is designed for these six repository-authored sources. It is not a general-purpose renderer for arbitrary untrusted Internet Markdown.

## Automated verification

Final verification was run from clean source commit `5f9771d77c2e02994506403c10f48a6908a44041`:

| Command | Result |
|---|---|
| `pnpm test:case-study-evidence` | 8 passed / 0 failed |
| `pnpm check:case-study-evidence` | synchronized 6/6 / exit 0 |
| `pnpm verify:case-study-evidence` | `file://` + HTTP, 6/6 documents in each protocol, desktop + two mobile viewports / exit 0; screenshots unchanged |
| `pnpm lint:web` | 0 errors / 0 warnings |
| `pnpm --dir apps/web exec tsc --noEmit` | exit 0 |
| `git diff --check` | exit 0 |

The browser verifier uses Chromium through the already installed `apps/web` Playwright dependency and an ephemeral Node HTTP server. It checks:

- six embedded templates and all six card-to-document mappings;
- complete-document length plus first/last authority sentinels;
- exact source path and SHA-256 metadata;
- non-empty table of contents and in-reader heading navigation;
- Escape, backdrop close, modal focus containment, and focus return;
- desktop two-column reader and mobile single-column reader;
- scrollability of long documents and no page-level horizontal overflow;
- reader animation completion before visual sampling;
- 1440×1000, 390×844, and 320×700 viewport bounds.

The existing local processes were also checked read-only after the accepted gate:

| URL | Result |
|---|---|
| `http://127.0.0.1:4173/vibe-coding-case-study.html` | HTTP 200 |
| `http://127.0.0.1:3000` | HTTP 200 |
| `http://127.0.0.1:8000/openapi.json` | HTTP 200 |

## Formal screenshots

| Screenshot | Viewport | SHA-256 | Visual conclusion |
|---|---:|---|---|
| [`case-study-evidence-desktop.png`](../screenshots/case-study-evidence-desktop.png) | 1440×1000 | `e80f5241da7d40842ae70af0d7d25aeb7d69163a03b76f3ec046db9d29a08dad` | Centered Modal Dialog; sticky metadata header, left TOC, independent long-form article; not a Drawer or Bottom Sheet |
| [`case-study-evidence-mobile.png`](../screenshots/case-study-evidence-mobile.png) | 390×844 | `438cb9519d5ae94d481d6a10f851160cbd554a0d7c86d2b38917d3910a6abf3d` | Near-full-screen single column; source, close, collapsed TOC, summary, JSON structure, and vertical scroll remain reachable |
| [`case-study-evidence-mobile-compact.png`](../screenshots/case-study-evidence-mobile-compact.png) | 320×700 | `94ffd2731a126bd45cec3eb3fcb5dcab12291d20fe1c9324370ecc659db6ff40` | Compact viewport retains readable header, 44px close, collapsible TOC, body scroll, and no page-level horizontal overflow |

All three originals were inspected at original detail. No development overlay, page-level horizontal clipping, inaccessible close control, or false full-screen Drawer presentation was found.

## Verification history and limitation

The first browser run passed DOM and interaction checks, but manual image inspection found that screenshots were sampled at the dialog animation's opacity-zero first frame. A focused regression proved `opacity: 0`; the verifier now awaits the browser animation's actual `finished` promise and asserts final opacity before sampling.

The screenshot harness also fixes image loading, fonts, reveal state, animation state, viewport, and scroll position before capture. Chromium can still produce negligible antialiasing/compositor byte differences across independent renders, so byte-for-byte cross-run PNG equality is not treated as a product requirement. The committed hashes identify this accepted capture; content, geometry, interaction, and overflow are the automated contracts.

## Known limits

- The page is offline-readable, but the Demo button still requires the local Web/API processes.
- Source freshness is repository-local: changing one of the six sources requires `pnpm build:case-study-evidence`; CI is not configured in this work package.
- The controlled Markdown renderer targets the syntax currently present in the six declared sources, not arbitrary extensions or executable HTML.
- Browser coverage is local Chromium on macOS; Safari, Firefox, real iOS safe-area behavior, and assistive-technology user studies were not performed.
- Browser automation proves interaction contracts, not reader comprehension, hiring-manager preference, or portfolio conversion.
