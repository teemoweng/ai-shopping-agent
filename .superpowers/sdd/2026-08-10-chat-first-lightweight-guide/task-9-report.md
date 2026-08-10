# Task 9 Report — Full Release Gate and Reproducible Evidence

## Status

DONE

Source under test: `add3f885fd0f70a979507c3de795bdc2f6bd1e3c` from a clean worktree.

## Fresh Task 9 gates

- Contracts: exit 0 in 1.129 s; generated OpenAPI/TypeScript diff empty.
- Ruff: exit 0 in 0.05 s.
- Web lint: exit 0 in 2.928 s; 0 errors / 0 warnings.
- Layout foundation: exit 0 in 0.090 s. This is an asset/layout-foundation gate, not visual proof.
- Production build: exit 0 in 4.130 s; existing multiple-lockfile warning retained as a limitation.
- API: 318 passed / 0 failed / 1 upstream warning in 2.74 s.
- Web: 11 files, 280 passed / 0 failed in 4.50 s.
- E2E: 70 collected, 39 passed / 31 intentional routed skips / 0 failed in 32.3 s.
- Foundation eval pytest: 15 passed / 0 failed / 1 upstream warning in 0.34 s.
- Foundation deterministic runner: 6/6, pass rate 1.0, exit 0 in 0.127 s.

The formal production screenshot gate was run and frozen in Task 8 on the same final source tree: 42 passed / 28 routed skips / 0 failed in 37.0 s. Task 9 did not rewrite non-owned screenshot files; it independently rechecked their dimensions, byte sizes, and SHA-256 identities.

## Evidence created

- `artifacts/evidence/chat-first-run-manifest.json`: source state, toolchain, every release command/count/duration, fixture/contract hashes, formal capture flags, screenshot metadata, privacy scan, synthetic-constant labels, and limitations.
- `artifacts/evidence/chat-first-verification.md`: 13 Chat-first browser contracts, the 8 preserved commerce journeys, exact gate results, screenshot inspection bounds, privacy evidence, and maturity limits.
- `README.md`, `PLAN.md`, and `TASKS.md`: added a new Chat-first evidence layer while preserving the 2026-08-05 Foundation and 2026-08-07 TikTok redesign counts/screenshots verbatim.

## Artifact and privacy result

- Three formal PNGs are nonempty and exactly 390×844, 390×844, and 1440×1000.
- SHA-256 values match Task 8's post-review files.
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
