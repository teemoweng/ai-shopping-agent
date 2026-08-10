# Task 9 Report — Full Release Gate and Reproducible Evidence

## Status

DONE

Final source under test: `46606d36ae1a046f1e0edd601ae0ccbcbd6ce7b9` from a clean worktree.

## Fresh Task 9 gates

- Contracts: exit 0 in 1.022 s; generated OpenAPI/TypeScript diff empty.
- Ruff: exit 0 in less than 0.001 s measured wall time.
- Web lint: exit 0 in 2.598 s; 0 errors / 0 warnings.
- Layout foundation: exit 0 in 0.106 s. This is an asset/layout-foundation gate, not visual proof.
- Production build: exit 0 in 3.991 s; existing multiple-lockfile warning retained as a limitation.
- API: 318 passed / 0 failed / 1 upstream warning in 2.58 s.
- Web: 11 files, 280 passed / 0 failed in 4.52 s.
- E2E: 70 collected, 39 passed / 31 intentional routed skips / 0 failed in 31.9 s.
- Foundation eval pytest: 15 passed / 0 failed / 1 upstream warning in 0.26 s.
- Foundation deterministic runner: 6/6, pass rate 1.0, exit 0 in 0.136 s.

The formal production screenshot gate was run and frozen in Task 8 Fix Round 3 on the same final source tree: 42 passed / 28 routed skips / 0 failed in 35.4 s. Task 9 did not rewrite non-owned screenshot files; it independently rechecked their dimensions, byte sizes, and SHA-256 identities.

## Verification history

- Initial Task 9 full E2E on `add3f885…`: 39/31/0. A finishing rerun exposed the reduced-motion readiness race at 38/31/1, and a focused rerun failed again. Task 9 stopped instead of rerunning for green.
- Task 8 Fix Round 2: repeat50 RED 46/4 → GREEN 50/50; independent review CLEAN.
- Task 9 refresh on `c5d28ae…`: stopped at 37/31/2 when the 200% composer and responsive Escape paths exposed the same loading-to-final readiness class. No green retry was attempted.
- Task 8 Fix Round 3: the two new paths plus reduced-motion passed interleaved 150/150; full E2E 39/31/0; production capture 42/28/0; independent review CLEAN.
- Final Task 9 gate on `46606d3…`: all 11 gates exited 0 on the first run, including E2E 39/31/0. This is the accepted release evidence.

## Evidence created

- `artifacts/evidence/chat-first-run-manifest.json`: source state, toolchain, every release command/count/duration, fixture/contract hashes, formal capture flags, screenshot metadata, privacy scan, synthetic-constant labels, and limitations.
- `artifacts/evidence/chat-first-verification.md`: 13 Chat-first browser contracts, the 8 preserved commerce journeys, exact gate results, screenshot inspection bounds, privacy evidence, and maturity limits.
- `README.md`, `PLAN.md`, and `TASKS.md`: added a new Chat-first evidence layer while preserving the 2026-08-05 Foundation and 2026-08-07 TikTok redesign counts/screenshots verbatim.

## Artifact and privacy result

- Three formal PNGs are nonempty and exactly 390×844, 390×844, and 1440×1000.
- Mobile SHA-256 values remain byte-identical. The desktop canonical is 724,473 bytes with SHA-256 `ef2cdadf4133ac468f4eb37a1d8c3e20ef88ed7fbcd39c0e3ad01fa74a613e70`; two consecutive captures matched, and the 24-pixel / 42-channel text-antialiasing delta passed original-detail review.
- No credential-shaped tracked assignment was found outside dependency lockfiles.
- Retained artifacts contain no unlabeled runtime-generated confirmation token, idempotency key, message ID, raw urgent-health phrase, or `chain_of_thought` value; documentation names fixed synthetic constants explicitly.
- Source schema identifiers and negative privacy-test fixtures remain by design.
- `cft_e2e_text_resize`, API `idem_*`, and `syntheticConfirmation` are labeled synthetic test constants; they are not described as runtime credentials.

## Limitations preserved

- Frozen synthetic 3 SPU / 6 SKU / 1 content context / 3 evidence document dataset.
- Deterministic rules and lexical retrieval, not a real LLM or Hybrid RAG.
- Local Chromium only; no real-user, conversion, business-impact, latency, cost, uptime, cross-browser, or production-reliability result.
- In-memory Guide session does not survive an API restart.
- Reconciliation idempotency key remains in a URL; access logging is disabled for local evidence, but productionization must prevent proxy/log retention.
- Existing Next.js multiple-lockfile warning, dev E2E image-aspect warning, and one Starlette/httpx deprecation warning remain.
