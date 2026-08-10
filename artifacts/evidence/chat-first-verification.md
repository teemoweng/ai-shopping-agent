# Chat-first Lightweight Guide Verification

> Verification captured 2026-08-10 UTC from clean source commit `46606d36ae1a046f1e0edd601ae0ccbcbd6ce7b9`. This is local deterministic evidence over frozen synthetic fixtures. It is not evidence of a real LLM, real users, conversion, business impact, or production reliability.

## Release result

The chat-first slice passed the contract, static, production-build, API, Web, browser, Foundation-eval, artifact, and privacy gates below. The final Task 9 browser run collected 70 tests: 39 passed, 31 were intentional project/capture routing skips, and 0 failed. The Task 8 Fix Round 3 production-capture run on the same final source tree collected the same 70 tests: 42 passed, 28 routed skips, and 0 failed; the three-test delta is exactly the opted-in screenshot set.

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
5. Task 9 then ran the complete gate exactly once from clean `46606d3…`. Every gate below exited 0, including final full E2E 39/31/0. This final run, not the earlier green sample, is the accepted release evidence.

The fixes changed E2E readiness synchronization, not product authority or UI behavior. The two mobile screenshot hashes remain byte-identical. The desktop capture changed by 24 pixels / 42 color channels of text antialiasing, maximum channel delta 2; two consecutive production captures produced the same new hash, and original-detail review remained CLEAN.

## Exact release gates

| Gate | Exact command | Observed result | Duration |
| --- | --- | --- | ---: |
| Contracts | `pnpm --dir packages/contracts check` | Exit 0; OpenAPI export and TypeScript generation completed; generated diff empty | 1.022 s |
| API lint | `uv --directory apps/api run ruff check app tests ../../evals` | Exit 0; `All checks passed!` | <0.001 s |
| Web lint | `pnpm lint:web` | Exit 0; 0 errors / 0 warnings | 2.598 s |
| Layout foundation | `pnpm check:layout` | Exit 0; `Foundation layout is valid` | 0.106 s |
| Web production build | `pnpm --dir apps/web build` | Exit 0; compile, TypeScript, and 2 static routes completed | 3.991 s |
| Generated integrity | `git diff --exit-code -- packages/contracts/openapi.json packages/contracts/src/api.ts` | Exit 0; 0 changed generated files | <0.001 s |
| API full | `uv --directory apps/api run pytest tests -q` | 318 passed; 0 failed; 0 skipped; 1 upstream warning | 2.58 s |
| Web full | `pnpm test:web` | 11 files; 280 passed; 0 failed; 0 skipped | 4.52 s |
| Browser full | `pnpm test:e2e` | 70 collected; 39 passed; 31 routed skips; 0 failed | 31.9 s |
| Foundation eval tests | `uv --directory apps/api run pytest tests/eval/test_foundation_eval.py -q` | 15 passed; 0 failed; 0 skipped; 1 upstream warning | 0.26 s |
| Foundation runner | `uv --directory apps/api run python ../../evals/run_foundation.py` | Deterministic rule scorer 6/6; pass rate 1.0; exit 0 | 0.136 s |

`pnpm check:layout` is an asset/layout-foundation gate only. It does not prove visual correctness. The visual claim is bounded to browser geometry assertions plus original-detail inspection of the three production screenshots.

The two warnings retained as limitations are the existing Next.js multiple-lockfile workspace-root inference warning and the development E2E one-dimension product-image warning. The build and all assertions still exited 0. API/eval runs emit one existing Starlette/httpx deprecation warning.

## Chat-first browser journeys

All chat-first message writes carry a `message_id` and the current `expected_conversation_revision`; the browser assertions check those values without retaining the runtime IDs. The UI renders the service response or subsequent authoritative GET snapshot rather than appending a client-invented assistant state.

| # | Observable UI | Authoritative HTTP / revision evidence | Result |
| ---: | --- | --- | --- |
| 1 | Compact opening preserves visible video, shows the Seoul Shade context, approved opening, exactly three questions, one composer, and one disclosure | `POST /guide/sessions` returns 201, `OPENING_CONTEXT`, `guide_revision=1`, `conversation_revision=1`, and `SEND_MESSAGE` / `RETURN_TO_FEED` | Pass |
| 2 | Light scrim leaves the source video legible | Computed backdrop alpha is at most 0.30 and `backdrop-filter` is `none`; this is a browser style oracle, not an API claim | Pass |
| 3 | “适合油皮吗？” produces one clarification question, no product result, and stays compact | Authoritative message response is `WAITING_CLARIFICATION`; `conversation_revision` advances exactly +1 | Pass |
| 4 | “会不会泛白？” returns a short answer with no recommendation matrix or comparison | Authoritative response is `ANSWER_READY`; `conversation_revision` advances +1 while `guide_revision` stays unchanged | Pass |
| 5 | A complete constraint message shows exactly one primary recommendation until alternatives are requested | `POST .../messages` returns 200 `DECISION_READY`; accepted conversation revision advances +1 | Pass |
| 6 | Comparison appears only after explicit intent and expands the Sheet | Compare POST carries `cmp_*`, the current expected conversation revision, and the two authorized product IDs; canonical GET is `COMPARISON_READY` with conversation revision +1 | Pass |
| 7 | Close/reopen returns focus to the entry and restores the same transcript | `GET /guide/sessions/{id}` returns the same session ID, conversation revision, and transcript as the prior decision | Pass |
| 8 | AI → PDP → AI restores the current recommendation and full transcript | PDP carries current AI attribution; authoritative session GET returns the same session ID and transcript | Pass |
| 9 | Safety hides recommendation, comparison, PDP, and cart actions while keeping a compact safety message | `POST .../messages` returns 200 `SAFE_BOUNDARY`, only `RETURN_TO_FEED`; the stored user transcript entry is the fixed redacted placeholder | Pass |
| 10 | 390×844 compact Sheet occupies 40%–44.5% of the viewport with no horizontal overflow | Browser geometry bounds and viewport containment assertions pass | Pass |
| 11 | 320×700 at 200% text keeps close, latest message, and composer reachable | Browser reflow, scroll reachability, and overflow assertions pass | Pass |
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

The three files are nonempty and match their declared PNG dimensions. SHA-256 proves file identity only; it does not prove visual quality. They were captured by the formal production gate and inspected at original detail after the Task 8 visual fixes.

| Artifact | Dimensions | Bytes | SHA-256 | Bounded visual observation |
| --- | ---: | ---: | --- | --- |
| [`chat-first-opening-mobile.png`](../screenshots/chat-first-opening-mobile.png) | 390×844 | 224,297 | `6552ee74ecffca9c967868d38e08fa89488e33cd007e3b194ea79709f441c204` | Partial-height opening, visible creator/video context, three approved prompts, composer not clipped |
| [`chat-first-decision-mobile.png`](../screenshots/chat-first-decision-mobile.png) | 390×844 | 233,129 | `489e4990c88fe9074901890a3f811dfabf30b6d66c8f0e75325d9281e86ad02b` | One primary recommendation in compact mode, video context retained, no heavy decision board |
| [`chat-first-desktop.png`](../screenshots/chat-first-desktop.png) | 1440×1000 | 724,473 | `ef2cdadf4133ac468f4eb37a1d8c3e20ef88ed7fbcd39c0e3ad01fa74a613e70` | One live phone remains primary; the narrower low-contrast interview panel is secondary |

Historical `foundation-*` and `tiktok-redesign-*` screenshots and counts were not overwritten.

## Artifact, credential, and privacy checks

- No credential-shaped assignment was found in tracked source after excluding dependency lockfiles.
- No unlabeled runtime-generated `cft_*`, `idem_*`, `msg_*`, or `gmsg_*` value was retained; no raw urgent-health phrase, client message ID value, or `chain_of_thought` value was retained. The runtime-shaped strings named below are documentation labels for fixed synthetic test constants, not captured runtime values.
- Schema field names and privacy-rejection test fixtures intentionally remain in source. Their presence is not a credential leak.
- `cft_e2e_text_resize`, `idem_*` values under API tests, and `syntheticConfirmation` are **synthetic test constants**, not runtime credentials. This report labels them explicitly instead of claiming the repository contains no token/idempotency strings.
- Playwright trace is off and the evidence API uses `--no-access-log`. The E2E assertions compare runtime token/key type or equality without printing their values.
- The idempotency key still appears in the reconciliation URL. It is an operation identifier rather than an authentication credential, but productionization must prevent proxy/access-log retention.

## Evidence limits

- Product, brand, creator, content, comment, price, stock, and cart data are frozen synthetic fixtures: 3 SPUs / 6 SKUs, 1 content context, 3 evidence documents, and 6 Foundation cases.
- No real LLM, embedding, Vector/Hybrid retrieval, reranker, TikTok API, payment, order, fulfillment, or production inventory is used.
- The deterministic 6/6 result describes only six frozen cases. It is not a claim about real recommendation quality.
- Browser coverage is local Chromium. It is not cross-browser certification, a real-user usability study, or evidence of production reliability.
- In-memory Guide sessions survive same-page refresh only while the API process lives. API restart persistence, authentication, deletion governance, and multi-process consistency remain out of scope.
- No conversion, trust, task-completion, latency, cost, uptime, or business-impact result has been measured.

Machine-readable commands, hashes, flags, and limitations are frozen in [`chat-first-run-manifest.json`](./chat-first-run-manifest.json).
