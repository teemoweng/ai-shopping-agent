# Chat-first Lightweight Guide Verification

> Verification refreshed 2026-08-10 UTC from clean source commit `659596537efe7bd7a879aeb3b49bee17b01f5e73`. This is local deterministic evidence over frozen synthetic fixtures. It is not evidence of a real LLM, real users, conversion, business impact, or production reliability.

## Release result

The chat-first slice passed the contract, static, production-build, API, Web, browser, Foundation-eval, artifact, and privacy gates below. The accepted Task 11 refresh collected 70 browser tests: 39 passed, 31 were intentional project/capture routing skips, and 0 failed. Its one production-capture run collected the same 70 tests: 42 passed, 28 routed skips, and 0 failed in 33.13 seconds wall time; the three-test delta is exactly the opted-in screenshot set.

This evidence upgrades only the narrow engineering maturity to **implemented and evaluated on frozen synthetic fixtures in local Chromium**. It does not close Phase 1's real LLM, Hybrid Retrieval, data-expansion, durable persistence, user-research, deployment, or business-result work.

## Source and environment

The worktree was clean before the gates. The evidence documents and README/PLAN/TASKS updates were written after the run, so the source under test remains the pre-evidence commit shown above.

| Item | Observed |
| --- | --- |
| Host | Darwin 25.5.0 arm64 |
| Node / pnpm | Node 24.14.0 / pnpm 11.20.0 |
| uv / Python | uv 0.11.14 / Python 3.14.5 |
| Browser runner | Playwright 1.62.1; Chromium 151.0.7922.34 |
| Formal capture | Fresh uvicorn with `--no-access-log --workers 1`; `next build && next start`; no server reuse; Playwright trace off |
| Browser determinism | Fixed browser time `2026-08-10T12:00:00Z`; fonts ready; video paused/seeked; motion and caret disabled |
| Viewports | Mobile 390×844; desktop interview 1440×1000; additional 320×700 at 200% text browser contract |

## Verification history and readiness stabilization

The release history is intentionally retained because a single green browser run did not prove the original keyboard/readiness paths were stable:

1. The first Task 9 full run on `add3f885…` was green at 39 passed / 31 routed skips / 0 failed. A finishing rerun then failed the reduced-motion focus path: 38 passed / 31 skips / 1 failed. An immediate focused rerun failed again. Task 9 stopped instead of retrying for a green sample.
2. Task 8 traced the failure to a test-side loading-to-final DOM replacement race. A 50-repeat RED sample was 46 passed / 4 failed; after waiting for authoritative HTTP 201 `OPENING_CONTEXT` and final opening UI, the same sample was 50/50. Independent review of Fix Round 2 was CLEAN.
3. The next Task 9 full refresh on `c5d28ae…` stopped at 37 passed / 31 skips / 2 failed. The 320×700 composer check sampled during loading-to-final replacement, and the responsive desktop-frame path dispatched Escape before the final Guide dialog was authoritative. Task 9 again stopped without rerunning for green.
4. Task 8 Fix Round 3 moved the shared browser helpers onto authoritative session readiness and final UI/focus commit. The two new failures plus reduced-motion focus passed an interleaved 150/150 stability run; focused Guide/PDP suites were 10/10; full E2E was 39/31/0 and production capture 42/28/0. Independent review was CLEAN.
5. Task 9 then ran the complete gate exactly once from clean `46606d3…`. Every gate exited 0, including full E2E 39/31/0. That was the accepted pre-review release evidence.
6. Task 11 independently reproduced seven accepted code/product findings with real failing tests, then committed the source/test fixes as `0228819…`. From that clean commit, contracts, lint, layout-foundation, build, and generated integrity passed, but the first full API gate stopped at 323 passed / 1 failed. The failing golden-trace test invoked raw `WorkflowEngine.open_session/handle_message`, bypassed the public `GuideService` orchestration, and therefore never committed the authoritative `latest_response` now required by legacy cart authorization. No later gate or screenshot capture ran in that attempt.
7. The trace test alone was migrated to real `GuideService.create/message` orchestration—same engine, repository, cart, and trace events; no mock or manual snapshot assignment—and committed as `6595965…`. The affected focus was 61/61. A transparently labeled second full gate then passed every command below, followed by exactly one production capture. This second run is the accepted final evidence; the 323/1 harness failure remains part of the record.

Task 11 intentionally changed product authority, decision hierarchy, localization, disclosure density, and Guide typography. Its three regenerated PNGs were inspected at original resolution: the latest conclusion precedes the card, localized fit/tradeoff copy is distinct, the single Guide disclosure remains low weight, the composer is not clipped, and the desktop phone remains primary. The opening whitespace and missing drag interaction remain limitations below.

## Exact release gates

| Gate | Exact command | Observed result | Duration |
| --- | --- | --- | ---: |
| Contracts | `pnpm --dir packages/contracts check` | Exit 0; OpenAPI export and TypeScript generation completed; generated diff empty | 0.95 s |
| API lint | `uv --directory apps/api run ruff check app tests ../../evals` | Exit 0; `All checks passed!` | 0.02 s |
| Web lint | `pnpm lint:web` | Exit 0; 0 errors / 0 warnings | 2.84 s |
| Layout foundation | `pnpm check:layout` | Exit 0; `Foundation layout is valid` | 0.20 s |
| Web production build | `pnpm --dir apps/web build` | Exit 0; compile, TypeScript, and 2 static routes completed | 4.04 s |
| Generated integrity | `git diff --exit-code -- packages/contracts/openapi.json packages/contracts/src/api.ts` | Exit 0; 0 changed generated files | 0.01 s |
| API full | `uv --directory apps/api run pytest tests -q` | 324 passed; 0 failed; 0 skipped; 1 upstream warning | 3.19 s |
| Web full | `pnpm test:web` | 11 files; 281 passed; 0 failed; 0 skipped | 5.34 s |
| Browser full | `pnpm test:e2e` | 70 collected; 39 passed; 31 routed skips; 0 failed | 31.41 s |
| Foundation eval tests | `uv --directory apps/api run pytest tests/eval/test_foundation_eval.py -q` | 15 passed; 0 failed; 0 skipped; 1 upstream warning | 0.46 s |
| Foundation runner | `uv --directory apps/api run python ../../evals/run_foundation.py` | Deterministic rule scorer 6/6; pass rate 1.0; exit 0 | 0.23 s |

`pnpm check:layout` is an asset/layout-foundation gate only. It does not prove visual correctness. The visual claim is bounded to browser geometry assertions plus original-detail inspection of the three production screenshots.

The two warnings retained as limitations are the existing Next.js multiple-lockfile workspace-root inference warning and the development E2E one-dimension product-image warning. The build and all assertions still exited 0. API/eval runs emit one existing Starlette/httpx deprecation warning.

## Chat-first browser journeys

All chat-first message writes carry a `message_id` and the current `expected_conversation_revision`; the browser assertions check those values without retaining the runtime IDs. The UI renders the service response or subsequent authoritative GET snapshot rather than appending a client-invented assistant state.

| # | Observable UI | Authoritative HTTP / revision evidence | Result |
| ---: | --- | --- | --- |
| 1 | Compact opening preserves visible video, shows the Seoul Shade context, approved opening, exactly three questions, one composer, and exactly one low-weight expandable disclosure | `POST /guide/sessions` returns 201, `OPENING_CONTEXT`, `guide_revision=1`, `conversation_revision=1`, and `SEND_MESSAGE` / `RETURN_TO_FEED`; disclosure details centralize the synthetic/no-integration/no-real-validation/PDP-recheck boundaries | Pass |
| 2 | Light scrim leaves the source video legible | Computed backdrop alpha is at most 0.30 and `backdrop-filter` is `none`; this is a browser style oracle, not an API claim | Pass |
| 3 | “适合油皮吗？” produces one clarification question, no product result, and stays compact | Authoritative message response is `WAITING_CLARIFICATION`; `conversation_revision` advances exactly +1 | Pass |
| 4 | “会不会泛白？” returns a short answer with no recommendation matrix or comparison | Authoritative response is `ANSWER_READY`; `conversation_revision` advances +1 while `guide_revision` stays unchanged | Pass |
| 5 | A complete constraint message initially shows the authoritative conclusion before one primary card; Chinese fit/tradeoff copy is localized, distinct, and decision-relevant | `POST .../messages` returns 200 `DECISION_READY`; conversation revision advances +1, first recommendation authority advances `guide_revision` exactly once, and evidence/SKU authority remains unchanged | Pass |
| 6 | Comparison appears only after explicit intent and expands the Sheet | Compare POST carries `cmp_*`, the current expected conversation revision, and the two authorized product IDs; canonical GET is `COMPARISON_READY` with conversation revision +1 | Pass |
| 7 | Close/reopen returns focus to the entry and restores the same transcript | `GET /guide/sessions/{id}` returns the same session ID, conversation revision, and transcript as the prior decision | Pass |
| 8 | AI → PDP → AI restores the current recommendation and full transcript | PDP carries current AI attribution; authoritative session GET returns the same session ID and transcript | Pass |
| 9 | Safety hides the composer, quick replies, recommendation, comparison, PDP, and cart actions while keeping a compact return path | `POST .../messages` returns 200 `SAFE_BOUNDARY`, only `RETURN_TO_FEED`; the stored user transcript entry is the fixed redacted placeholder; legacy preview/add also reject stale current-snapshot/revision authority atomically | Pass |
| 10 | 390×844 compact Sheet occupies 40%–44.5% of the viewport with no horizontal overflow | Browser geometry bounds and viewport containment assertions pass | Pass |
| 11 | 320×700 at 200% root text scales actual Guide message, card, action, disclosure, and composer copy to at least 1.9× while keeping controls reachable | Computed-font ratios, internal scrolling, close/card/composer reachability, and horizontal-overflow assertions pass; 44 px minimum touch targets remain fixed | Pass |
| 12 | Reduced motion keeps focus trapped; Escape closes and restores entry focus | Browser focus, `inert`, media-query, and Escape assertions pass | Pass |
| 13 | Desktop interview state keeps one 390×844 live phone primary and the explanation secondary | 1440×1000 geometry, panel-width, title-size, contrast, and compact-mode assertions pass | Pass |

The non-capture browser total decomposes to 13 chat-first, 4 Foundation guide, 6 PDP-focus, 8 existing commerce, and 8 responsive tests = 39 passes. The 31 skips are explicit cross-project or opt-in-capture routing.

## Existing commerce journeys preserved

The chat-first UI did not replace the transaction authority. Direct PDP and AI-assisted paths still enter the separate Commerce Workflow, which re-reads current SKU/price/stock facts and requires explicit confirmation.

| # | Journey | Authoritative evidence | Result |
| ---: | --- | --- | --- |
| 1 | Feed → direct PDP → 50 mL → confirm | Preview POST 201 `AWAITING_CONFIRMATION`, transaction revision 1; item POST 201 `SUCCEEDED` with the same operation/revision; one receipt | Pass |
| 2 | Feed → AI decision → alternative PDP → restored AI → Feed | Session POST 201 opening; message responses reach clarification then decision; alternative PDP shows AI attribution and return restores the decision | Pass |
| 3 | AI recommendation → PDP → simulated cart | Decision provenance reaches PDP; preview/item POSTs return 201; operation and transaction revision remain consistent; one receipt | Pass |
| 4 | Normal Feed | No shoppable group, product action, or “问问这款” control | Pass |
| 5 | Zero match → one relaxation | `NO_MATCH` exposes only send/relax/return and no product action; one “防水不限” message returns `DECISION_READY` with `guide_revision +1` | Pass |
| 6 | Safety boundary | Message response 200 `SAFE_BOUNDARY`, only `RETURN_TO_FEED`, and no product/compare/cart action | Pass |
| 7 | Price change → accept → reconfirm | Preview 201 `FACTS_CHANGED` revision 1; accept-facts POST 200 returns `AWAITING_CONFIRMATION` revision 2 and a runtime token checked by type only; item POST 201 succeeds at revision 2 | Pass |
| 8 | Unknown commit → idempotent reconciliation | Exactly one item POST returns `COMMIT_STATUS_UNKNOWN` / `RECONCILIATION_REQUIRED`; exactly one GET by the same idempotency key returns `SUCCEEDED`; one receipt and one cart item | Pass |

## Formal screenshots

The three files are nonempty and match their declared PNG dimensions. SHA-256 proves file identity only; it does not prove visual quality. They were regenerated once by the Task 11 production gate and then inspected at original detail.

| Artifact | Dimensions | Bytes | SHA-256 | Bounded visual observation |
| --- | ---: | ---: | --- | --- |
| [`chat-first-opening-mobile.png`](../screenshots/chat-first-opening-mobile.png) | 390×844 | 223,333 | `670297d95460415b75c60761b437934f179cc5b5b383f26e1936b4a3fbabc17a` | Partial-height opening, visible creator/video context, three approved prompts, composer not clipped; versus the prior canonical, 1,022 / 329,160 pixels (0.31%) changed within status-clock bounds `(10,26)–(62,47)` |
| [`chat-first-decision-mobile.png`](../screenshots/chat-first-decision-mobile.png) | 390×844 | 242,594 | `bcfd411c0e3d47629f02eb975d1d701b6aeed7f4247af9c01b11371977cd97ae` | Conclusion is fully visible before the localized single card; the expected hierarchy/copy/disclosure changes affect 52,999 / 329,160 pixels (16.10%), bounded to `(2,26)–(388,734)` |
| [`chat-first-desktop.png`](../screenshots/chat-first-desktop.png) | 1440×1000 | 719,968 | `1dec9a3819a408c1c89bf26cfac146d8e062f52bb1d13ae786faa65e13902abd` | One live phone remains primary and the renamed walkthrough panel stays secondary; expected phone/panel changes affect 316,540 / 1,440,000 pixels (21.98%), bounded to `(311,105)–(1189,937)` |

Historical `foundation-*` and `tiktok-redesign-*` screenshots and counts were not overwritten.

## Artifact, credential, and privacy checks

- No unlabeled credential-shaped assignment was found after excluding dependency lockfiles. Two explicit `secret=...` strings in trace-coverage tests are synthetic rejection fixtures used to prove exception/caller-controlled text is not persisted; they are not credentials.
- No unlabeled runtime-generated `cft_*`, `idem_*`, `msg_*`, or `gmsg_*` value was retained; retained runtime artifacts contain no raw urgent-health text, client message ID value, or `chain_of_thought` value. The runtime-shaped strings named below are documentation labels for fixed synthetic test constants, not captured runtime values.
- Schema field names and explicit synthetic urgent-health/privacy-rejection fixtures intentionally remain in test source. The no-raw-health-text claim applies only to retained runtime artifacts, not those source fixtures.
- `cft_e2e_text_resize`, `idem_*` values under API tests, and `syntheticConfirmation` are **synthetic test constants**, not runtime credentials. This report labels them explicitly instead of claiming the repository contains no token/idempotency strings.
- Playwright trace is off and the evidence API uses `--no-access-log`. The E2E assertions compare runtime token/key type or equality without printing their values.
- The idempotency key still appears in the reconciliation URL. It is an operation identifier rather than an authentication credential, but productionization must prevent proxy/access-log retention.

## Evidence limits

- Product, brand, creator, content, comment, price, stock, and cart data are frozen synthetic fixtures: 3 SPUs / 6 SKUs, 1 content context, 3 evidence documents, and 6 Foundation cases.
- No real LLM, embedding, Vector/Hybrid retrieval, reranker, TikTok API, payment, order, fulfillment, or production inventory is used.
- The deterministic 6/6 result describes only six frozen cases. It is not a claim about real recommendation quality.
- Browser coverage is local Chromium. It is not cross-browser certification, a real-user usability study, or evidence of production reliability.
- CSS uses `env(safe-area-inset-*)` and nominal Chromium containment is covered, but real iOS devices with nonzero notch/home-indicator insets were not exercised.
- The Sheet has no drag interaction or drag affordance. The opening retains a noticeable whitespace gap between its prompt and quick replies; both remain disclosed polish limitations rather than simulated capability.
- In-memory Guide sessions survive same-page refresh only while the API process lives. API restart persistence, authentication, deletion governance, and multi-process consistency remain out of scope.
- No conversion, trust, task-completion, latency, cost, uptime, or business-impact result has been measured.

Machine-readable commands, hashes, flags, and limitations are frozen in [`chat-first-run-manifest.json`](./chat-first-run-manifest.json).
