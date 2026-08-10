# Task 8 Report — Preserve the Eight Journeys and Add Chat-first Browser Evidence

## Status

DONE_WITH_CONCERNS

Implementation commit:

- `dc29e6d35d549a6427b6e40303115855b2a8b6be` — `test: verify chat-first shopping journeys`

## Changes

- Migrated the eight required TikTok-demo journeys from the removed heavyweight Guide DOM and old copy to the real chat-first opening, composer, recommendation, alternatives, PDP-return, no-match, and safety interfaces.
- Preserved the journey assertions for real Guide/Commerce network responses, Guide and conversation revisions, server allowed actions, transaction identity, confirmation-token refresh, idempotency, single write POST plus reconciliation GET, exactly one receipt, and exactly one cart item.
- Added an independent no-cart `chat-first.spec.ts` suite covering the light opening and video context, one-question clarification, short white-cast answer, one primary recommendation, explicit comparison expansion, canonical close/reopen, AI-to-PDP-to-AI restoration, safety redaction/action removal, compact geometry, 200% text reflow, desktop framing, focus trap/Escape return, and reduced motion.
- Added the separate `CAPTURE_CHAT_FIRST_EVIDENCE=1` gate. It forces one fresh no-access-log API worker, `next build && next start`, no server reuse, and trace-off production capture while reusing fixed time, font readiness, paused/seeked video, disabled animation/caret, and viewport assertions.
- Added only the three new formal screenshots. No historical Foundation or `tiktok-redesign-*` screenshot changed.
- No product component, controller, API, contract, or CSS source required a Task 8 fix; the completed Task 7 implementation already satisfied the browser contract.

## RED and Migration Evidence

Initial eight-journey run against the unmodified Task 7 selectors:

```text
pnpm --dir apps/web exec playwright test e2e/tiktok-demo.spec.ts --project=mobile-chromium --project=desktop-interview
# 4 passed, 4 failed, 12 skipped
```

Journeys 2, 3, 5, and 6 failed on the obsolete `问 AI：Seoul ...` entry selector. Journeys 1, 4, 7, and 8 already passed, including the transaction and reconciliation paths.

After equivalent selector/setup migration:

```text
pnpm --dir apps/web exec playwright test e2e/tiktok-demo.spec.ts --project=mobile-chromium
# 8 passed, 2 capture tests skipped
```

First new chat-first run:

```text
pnpm --dir apps/web exec playwright test e2e/chat-first.spec.ts
# 10 passed, 2 failed, 18 skipped
```

Both failures sampled Sheet bounds during its entrance animation rather than after the stable state. Polling for settled geometry and applying the 200% root-font mutation only after hydration fixed the test timing without changing product code or weakening the geometry bounds.

Focused chat-first GREEN:

```text
pnpm --dir apps/web exec playwright test e2e/chat-first.spec.ts
# 12 passed, 18 skipped
```

Responsive mobile/desktop migration:

```text
pnpm --dir apps/web exec playwright test e2e/tiktok-responsive.spec.ts --project=mobile-chromium --project=desktop-interview
# 8 passed
```

## Final Verification

Non-capture browser gate:

```text
pnpm test:e2e
# 38 passed, 30 skipped in 31.2s
```

Production capture browser gate:

```text
CAPTURE_CHAT_FIRST_EVIDENCE=1 pnpm test:e2e
# 41 passed, 27 skipped in 34.1s
```

The three-test delta is exactly the opted-in chat-first capture set. All skips are explicit cross-project or opt-in capture routing; no existing journey was skipped, marked todo, or deleted.

Additional final checks:

```text
pnpm test:web
# 11 files passed; 280 passed / 280 total

pnpm lint:web
# Passed with 0 errors and 0 warnings

pnpm --dir apps/web exec tsc --noEmit
# Passed

pnpm check:layout
# Foundation layout is valid

git diff --check
# Passed
```

Toolchain used: Node `v24.14.0`, pnpm `11.20.0`, Playwright `1.62.1`.

## Screenshot Evidence and Visual Inspection

- `artifacts/screenshots/chat-first-opening-mobile.png` — 390×844 — SHA-256 `d7cace3e42681da1b0cf40e2452a2dd5a96624b52547b9e0245b391923fd4e53`
- `artifacts/screenshots/chat-first-decision-mobile.png` — 390×844 — SHA-256 `e4876b02fa2c9c49b7e0fd7419ec1d85a0f1e5a6136dabb077ac7d6e1f5c7a43`
- `artifacts/screenshots/chat-first-desktop.png` — 1440×1000 — SHA-256 `83cf7019169ae166e0d0e58b98bef218eb502ed5f9e4632c94b3a88f490b9ce5`

All three originals were inspected at original detail. They contain no dev overlay, clipped composer, fake full-screen takeover, duplicate disclosure, hidden video context, horizontal overflow, or desktop explanation panel competing with the live phone path. The mobile opening remains a compact partial-height Sheet over visible video; decision and desktop frames show the single primary product path and reachable composer.

## Concerns and Review Routing

- The platform returned `agent thread limit reached` on every fresh-spawn path. This implementation turn therefore reused a previously read-only Task 7 reviewer identity, but that identity was not the Task 7 implementer. The Task 7 review conclusions were discarded before Task 8; the repository requirements and Task 8 materials were re-read from disk from the exact clean baseline `2e9f59308db8b5baea1cda8f7d4dd65221de86c8`.
- The lifetime thread limit does not lower or waive the independent review gate. No self-review is represented as an independent review; the clean Task 8 implementation commit and this evidence report remain routed to the coordinator for independent review when capacity is available.
- Next.js continues to emit the pre-existing multiple-lockfile/workspace-root warning, and dev E2E continues to emit the pre-existing single-dimension product-image warning. Production build/start, every behavior assertion, and all screenshots complete successfully.
- An initial full-lint attempt raced with Playwright deleting its ignored `test-results` directory and exited on `ENOENT`. The final serial `pnpm lint:web` run passed cleanly; the scoped changed-file ESLint run also passed before the full run.
