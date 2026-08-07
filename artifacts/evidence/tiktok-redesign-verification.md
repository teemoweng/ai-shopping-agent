# TikTok-inspired Experience Redesign Verification

> Verification date: 2026-08-07 UTC. Source baseline: `241bf7aa6ae424efa09328db1628f8b96b8bd3d6`. This is local deterministic evidence over synthetic fixtures, not a claim about real TikTok integration, real users, or business impact.

## Release result

The redesigned demo passed the backend, frontend, contract, static, evaluation, and production-browser gates listed below. All eight required product journeys ran once in `mobile-chromium` against one fresh in-memory API process. Transaction journeys were intentionally skipped in `desktop-interview` so the second project could not consume the same finite fixture inventory again. Desktop evidence instead exercised the same live phone path through the Foundation guide regressions, responsive checks, and the formal AI decision Sheet capture.

Every Playwright test calls `page.clock.setFixedTime(new Date("2026-08-07T12:00:00Z"))` before `page.goto`. This freezes only the synthetic browser evidence clock. The application still defaults to real `Date.now()` outside the test, the API uses its normal server clock, and no URL-controlled time override or test-reset endpoint exists.

## Environment

| Item | Observed |
| --- | --- |
| Host | Darwin 25.5.0 arm64 |
| Node / pnpm | Node 24.14.0 / pnpm 11.20.0 |
| uv / Python | uv 0.11.14 / Python 3.14.5 |
| Browser runner | Playwright 1.62.1; Chrome for Testing 151.0.7922.34 |
| API / Web | Fresh `127.0.0.1:8000` uvicorn process; production `next build && next start` on `127.0.0.1:3000` for formal capture |
| Concurrency | `workers: 1`; `fullyParallel: false`; existing servers never reused |

The Next.js build emitted the repository's existing multiple-lockfile workspace-root inference warning. Compilation, type checking, static generation, and exit status were successful. API tests and the Foundation runner emitted one existing Starlette/httpx deprecation warning.

## Exact gates and observed counts

| Gate | Exact command | Observed result |
| --- | --- | --- |
| API full | `uv --directory apps/api run pytest -q` | 234 passed; 0 failed; 1 upstream deprecation warning |
| Web full | `pnpm test:web` | 9 files; 193 passed; 0 failed |
| Contracts | `pnpm --dir packages/contracts check` | OpenAPI export and TypeScript generation completed; generated diff empty |
| Layout | `pnpm check:layout` | `Foundation layout is valid`; exit 0 |
| Web lint | `pnpm lint:web` | ESLint exit 0; 0 errors |
| Web production build | `pnpm --dir apps/web build` | Next production build and TypeScript/static generation exit 0 |
| Production E2E + capture | `CAPTURE_TIKTOK_REDESIGN_EVIDENCE=1 pnpm test:e2e` | 25 passed; 13 intentionally skipped; 0 failed; 38 collected |
| Foundation eval tests | `uv --directory apps/api run pytest tests/eval/test_foundation_eval.py -q` | 14 passed; 0 failed; 1 upstream deprecation warning |
| Foundation eval runner | `uv --directory apps/api run python ../../evals/run_foundation.py` | 6/6 passed; pass rate 1.0; exit 0 |
| API lint | `uv --directory apps/api run ruff check .` | `All checks passed!` |
| Integrity | `git diff --check` | Exit 0 |
| Secret scan | Repository scan described below | No credential-shaped assignment in the delivery diff; tokens and idempotency keys stayed in memory only |
| Asset audit | `ffprobe`, byte-size inventory, and `ASSET_SOURCES.md` inspection | Two licensed H.264/yuv420p 720×1280 videos; all nine demo files have provenance or original-synthetic disclosure |

## Eight required journeys

| # | User journey and network evidence | Result |
| --- | --- | --- |
| 1 | Shoppable Feed → direct PDP → select 50 mL SKU → `POST /commerce/cart/preview` 201 revision 1 → explicit `POST .../items` 201 → one success receipt | Pass |
| 2 | Feed → AI → 201 `WAITING_CLARIFICATION` revision 1 with the expected Chinese question/actions → Chinese decision → Cloud Veil alternative PDP → return to the same decision state → close to Feed | Pass |
| 3 | AI decision → recommended Seoul Shade PDP with verified AI attribution → preview/confirm → one receipt | Pass |
| 4 | Second normal Feed item contains no `可购物商品` group, product action, or Ask AI action | Pass |
| 5 | Zero match returns only `RELAX_CONSTRAINT` / `RETURN_TO_FEED`, no product/cart action; one “放宽防水要求” transition advances revision and restores a decision | Pass |
| 6 | Safety input returns `SAFE_BOUNDARY`, an incremented revision, and only `RETURN_TO_FEED`; no compare/product/cart action | Pass |
| 7 | `?scenario=price-changed`: preview returns `FACTS_CHANGED` revision 1 with structured price diff → accept returns `AWAITING_CONFIRMATION` revision 2 and a fresh runtime token (asserted by type only) → confirm succeeds at revision 2 | Pass |
| 8 | `?scenario=commit-status-unknown`: exactly one `POST .../items` returns `COMMIT_STATUS_UNKNOWN` / `RECONCILIATION_REQUIRED`; one subsequent `GET .../by-idempotency/{same-key}` reconciles to success; one receipt and one cart badge exist | Pass |

The journey assertions read real response status, view state, operation identity, and transaction revision. The price-change test verifies the accepted response contains a fresh runtime token by type only, without printing its value. The unknown-commit listener stores only numeric counters plus two private local key variables; matchers receive only numbers, a type, and the key-equality boolean, never the secret-bearing request body or URL. Playwright trace recording is disabled because it would serialize network bodies. No confirmation token or idempotency key is logged, attached, screenshotted, or committed.

## Formal screenshots

All captures came from the production server with Chromium. Before capture, the test awaited `document.fonts.ready`, disabled animation/transition/caret rendering, paused every video, sought to the deterministic first frame and awaited `seeked` where metadata was available, retained the poster as the explicit pre-metadata fallback, and checked critical controls were inside the viewport.

| Artifact | Dimensions | Bytes | SHA-256 | Visual inspection |
| --- | ---: | ---: | --- | --- |
| [`tiktok-redesign-mobile.png`](../screenshots/tiktok-redesign-mobile.png) | 390×844 | 321,508 | `7b434b7b037f522a1bb40b3a3fd920257d0d50eaabb10b9c1c9a32f81cbd07b7` | Full-bleed shoppable Feed; product anchor, creator copy, rail, safe-area chrome, and bottom nav remain readable and unobscured |
| [`tiktok-redesign-desktop.png`](../screenshots/tiktok-redesign-desktop.png) | 1440×1000 | 565,162 | `598d90129838a887d7f389d0329573ecc2090d5cf6b72750b85064f37946d225` | One live 390×844 phone; AI decision Sheet stays inside the phone; outside panel shows step, maturity, and scenarios without becoming a second app |
| [`tiktok-redesign-normal-feed.png`](../screenshots/tiktok-redesign-normal-feed.png) | 390×844 | 363,277 | `a47b1552b256df4ba8adb0e10f426a36990449ba6692405458eda1fbb60a2714` | Second Feed is visibly non-commerce; no product anchor or Ask AI control; creator copy, rail, and bottom nav fit |

No capture contains the Next development `N / Issue` overlay.

## Fixture and media audit

| Fixture or asset | Count / observed format |
| --- | --- |
| Products / SKUs | 3 SPUs / 6 SKUs |
| Content contexts | 1 |
| Feed items | 2 total: 1 shoppable, 1 normal |
| Evidence documents | 3 |
| Foundation evaluation | 6 frozen JSONL cases |
| Demo media pack | 9 files total: 2 MP4, 2 derived JPG posters, 4 original synthetic SVGs including the fallback poster, and 1 provenance ledger |
| Commerce video | H.264, yuv420p, 720×1280, 7.760 s, 1,820,917 bytes |
| Normal Feed video | H.264, yuv420p, 720×1280, 7.3073 s, 1,760,294 bytes |

The two background videos are Pexels assets credited to Anna Tarazevich and Leeloo The First under the Pexels License; acquisition URLs, dates, and transformations are recorded in [`ASSET_SOURCES.md`](../../apps/web/public/demo/ASSET_SOURCES.md). Product, brand, creator, packaging, and commerce contexts are synthetic; the three product pack-shots are original repository assets. Use does not imply creator or Pexels endorsement.

## Known limitations and evidence maturity

- This verifies deterministic local behavior on a small synthetic fixture set. It does not validate a real LLM Shopping Agent, Hybrid RAG, live multimodal understanding, TikTok API, production inventory, payment, order, fulfillment, latency, cost, or production reliability.
- Browser coverage is Chromium only. Mobile transaction journeys ran once to protect finite shared in-memory inventory; desktop demonstrates the same path and layout but does not repeat the eight transaction-sensitive journeys.
- Freezing the browser clock makes the synthetic fixture evidence reproducible. It does not override the server clock or prove behavior after the fixtures' real expiry; existing API/Web tests continue to cover stale-fact refusal.
- Automated journeys and visual inspection are not user research. User comprehension, trust, task completion with unassisted participants, conversion lift, and business impact remain unverified hypotheses.
- Evidence maturity is **implemented and evaluated on frozen synthetic fixtures**. It must not be described as validated with real users or real business traffic.
