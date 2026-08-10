# Task 8 Report — Preserve the Eight Journeys and Add Chat-first Browser Evidence

## Status

DONE_WITH_CONCERNS

Implementation commits:

- `dc29e6d35d549a6427b6e40303115855b2a8b6be` — `test: verify chat-first shopping journeys`
- `767b8c772f2202b37e90f82eb18e0e082223a5ef` — `fix: preserve video focus in lightweight guide`
- `73de4f5` — `test: stabilize guide focus journey`
- `f25ba7e` — `test: await authoritative guide readiness`

## Changes

- Migrated the eight required TikTok-demo journeys from the removed heavyweight Guide DOM and old copy to the real chat-first opening, composer, recommendation, alternatives, PDP-return, no-match, and safety interfaces.
- Preserved the journey assertions for real Guide/Commerce network responses, Guide and conversation revisions, server allowed actions, transaction identity, confirmation-token refresh, idempotency, single write POST plus reconciliation GET, exactly one receipt, and exactly one cart item.
- Added an independent no-cart `chat-first.spec.ts` suite covering the light opening and video context, one-question clarification, short white-cast answer, one primary recommendation, explicit comparison expansion, canonical close/reopen, AI-to-PDP-to-AI restoration, safety redaction/action removal, compact geometry, 200% text reflow, desktop framing, focus trap/Escape return, and reduced motion.
- Added the separate `CAPTURE_CHAT_FIRST_EVIDENCE=1` gate. It forces one fresh no-access-log API worker, `next build && next start`, no server reuse, and trace-off production capture while reusing fixed time, font readiness, paused/seeked video, disabled animation/caret, and viewport assertions.
- Added only the three new formal screenshots. No historical Foundation or `tiktok-redesign-*` screenshot changed.
- No product component, controller, API, or contract source required a Task 8 fix. Independent visual review later demonstrated two scoped CSS hierarchy gaps; Fix Round 1 addresses only those gaps in `globals.css`.

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
# 39 passed, 31 skipped in 31.9s
```

Production capture browser gate:

```text
CAPTURE_CHAT_FIRST_EVIDENCE=1 pnpm test:e2e
# 42 passed, 28 skipped in 37.0s
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

- `artifacts/screenshots/chat-first-opening-mobile.png` — 390×844 — SHA-256 `6552ee74ecffca9c967868d38e08fa89488e33cd007e3b194ea79709f441c204`
- `artifacts/screenshots/chat-first-decision-mobile.png` — 390×844 — SHA-256 `489e4990c88fe9074901890a3f811dfabf30b6d66c8f0e75325d9281e86ad02b`
- `artifacts/screenshots/chat-first-desktop.png` — 1440×1000 — SHA-256 `ef2cdadf4133ac468f4eb37a1d8c3e20ef88ed7fbcd39c0e3ad01fa74a613e70`

The original pre-review screenshots were inspected, but the earlier statement that they had no hidden-video-context or desktop-panel competition was incorrect. Independent review found that the `0.72` scrim plus `blur(7px)` reduced the video to a dark outline and that the 440px, high-contrast desktop panel outweighed the 390px phone. Those screenshots and hashes are superseded by the three current files above.

All three regenerated originals were inspected at original detail. The mobile opening and decision now retain a clearly recognizable creator, beach setting, feed chrome, and partial-height Sheet. The desktop frame keeps the saturated live phone primary while the narrower, lower-contrast explanation panel remains secondary. There is no dev overlay, clipped composer, fake full-screen takeover, duplicate disclosure, horizontal overflow, or historical screenshot overwrite.

## Concerns and Review Routing

- The platform returned `agent thread limit reached` on every fresh-spawn path. This implementation turn therefore reused a previously read-only Task 7 reviewer identity, but that identity was not the Task 7 implementer. The Task 7 review conclusions were discarded before Task 8; the repository requirements and Task 8 materials were re-read from disk from the exact clean baseline `2e9f59308db8b5baea1cda8f7d4dd65221de86c8`.
- The lifetime thread limit did not lower or waive the independent review gate. A separate Task 8 review returned NOT CLEAN with three Important findings; Fix Round 1 below addresses all three, and its final status remains routed to the coordinator for independent re-review.
- Next.js continues to emit the pre-existing multiple-lockfile/workspace-root warning, and dev E2E continues to emit the pre-existing single-dimension product-image warning. Production build/start, every behavior assertion, and all screenshots complete successfully.
- An initial full-lint attempt raced with Playwright deleting its ignored `test-results` directory and exited on `ENOENT`. The final serial `pnpm lint:web` run passed cleanly; the scoped changed-file ESLint run also passed before the full run.

---

## Independent Review Fix Round 1

### Findings Fixed

1. Replaced the inherited `#050608b8` plus `blur(7px)` Guide backdrop with a TikTok-style `#0506083d` light scrim and no backdrop blur. A real Chromium contract now requires effective alpha at most `0.30`, computed `backdrop-filter: none`, and a visible feed video behind the compact Guide.
2. Made the desktop explanation subordinate to the live phone without deleting interview content: the column is at most 360px beside the 390px phone, the title is 24px, and the current-step block is a quiet light surface instead of a black secondary hero. Browser assertions require panel width no greater than phone width, title size at most 24px, and panel/current-step background contrast at most 1.5.
3. Corrected the normal-feed negative selector from obsolete `问 AI` to current `问问这款`, and restored the exact `WAITING_CLARIFICATION` server action assertion: `SEND_MESSAGE`, `ANSWER_CLARIFICATION`, `SKIP_CLARIFICATION`, `UPDATE_CONSTRAINTS`, `RETURN_TO_FEED`. No commerce, transaction, revision, provenance, receipt, or cart assertion was removed or relaxed.

### RED Evidence

Initial focused browser RED:

```text
pnpm --dir apps/web exec playwright test e2e/chat-first.spec.ts --grep "light scrim|desktop interview mode" --project=mobile-chromium --project=desktop-interview
# 2 failed, 2 skipped
# backdrop alpha: 0.72, required <= 0.30
# desktop panel: 440px, phone: 390px
```

Minimal fixes exposed each remaining sub-constraint in order rather than hiding them:

```text
# after lightening the scrim and narrowing the panel
# 2 failed, 2 skipped
# backdrop-filter: blur(7px), required none
# desktop title: 36px, required <= 24px

# after removing blur and reducing the title
# 1 passed, 1 failed, 2 skipped
# current-step/panel contrast: 17.5845, required <= 1.5
```

### GREEN and Final Verification

Focused visual contract:

```text
# 2 passed, 2 cross-project skipped
```

Required focused suites:

```text
pnpm --dir apps/web exec playwright test e2e/tiktok-demo.spec.ts --project=mobile-chromium
# 8 passed, 2 capture tests skipped

pnpm --dir apps/web exec playwright test e2e/chat-first.spec.ts
# 13 passed, 19 cross-project/capture tests skipped

pnpm --dir apps/web exec playwright test e2e/tiktok-responsive.spec.ts --project=mobile-chromium --project=desktop-interview
# 8 passed
```

Full non-capture and production capture:

```text
pnpm test:e2e
# 39 passed, 31 skipped in 31.9s

CAPTURE_CHAT_FIRST_EVIDENCE=1 pnpm test:e2e
# 42 passed, 28 skipped in 37.0s
```

Static/unit/layout verification:

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

The three production screenshots were regenerated in place under the existing `chat-first-*` filenames, checked at original detail, and hashed in the corrected evidence section above. Historical Foundation and `tiktok-redesign-*` files remain untouched.

---

## Task 9 Finishing-check Fix Round 2

### Root Cause

The reduced-motion focus test had a test-side synchronization race, not a product focus-trap defect. After keyboard `Enter`, it accepted the loading-state `关闭导购` button as the stable focused control. The session response could then replace that loading button with the final `GuideChatView` button while `Shift+Tab` or `Escape` was being dispatched. During that unmount/remount window, focus briefly left the dialog; the session effect restored focus afterward, but an Escape already dispatched outside the dialog was lost.

Retained Playwright traces showed the loading copy `正在打开导购`, the loading close button receiving focus, the `POST /guide/sessions` response committing the final view during the keyboard step, and the later session effect focusing the new close button. The working Guide and PDP focus tests both wait for the final API-backed semantic state and final control before keyboard assertions; this test was the only path that did not.

### RED Evidence

```text
pnpm --dir apps/web exec playwright test e2e/chat-first.spec.ts \
  --project=mobile-chromium \
  --grep "reduced motion keeps focus trapped" \
  --repeat-each=50 --trace=retain-on-failure
# 46 passed, 4 failed
# all four failures: activeElement outside the dialog after Shift+Tab
```

An initial 10-repeat sample passed 10/10, demonstrating why the larger repeat sample and retained traces were necessary to expose the timing window.

### Minimal Fix

The test now installs the real session-response waiter before pressing `Enter`, verifies HTTP 201 and `OPENING_CONTEXT`, and waits for the final opening message to be visible before exercising focus wrap and Escape. The focus-within, inert-background, Escape-close, and entry-focus-return assertions remain unchanged. No timeout, retry, sleep, skip, product component, API, or authority behavior changed.

### GREEN and Regression Evidence

```text
# same focused command and 50-repeat sample
# 50 passed in 38.6s

pnpm --dir apps/web exec playwright test \
  e2e/guide.spec.ts e2e/pdp-focus.spec.ts \
  --project=mobile-chromium --project=desktop-interview
# 10 passed in 10.3s

pnpm test:e2e
# 39 passed, 31 skipped in 34.0s

CAPTURE_CHAT_FIRST_EVIDENCE=1 pnpm test:e2e
# 42 passed, 28 skipped in 35.4s

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

Production capture rewrote the three deterministic files byte-for-byte identically. Their SHA-256 values remain `6552ee74...c204`, `489e4990...02b`, and `ec507c6d...66d`; no screenshot or pixel evidence changed.

---

## Task 9 Finishing-check Fix Round 3

### Root Cause Investigation

Task 9's full gate found two more timing-dependent failures from the same test-side readiness gap:

- the 320×700 / 200% Chat-first geometry case measured the shared loading/final close locator before the final opening UI was committed, so the loading close could disappear between the geometry poll and the final `boundingBox()` read;
- the responsive desktop-frame case waited only for the loading/final dialog shell before pressing Escape, so Escape could be dispatched before the final close owned focus and be lost during the loading-close → final-close replacement.

Focused 50-repeat runs initially passed 50/50 for each case, and one complete retained-trace run passed 39/39 with 31 routed skips. The failure was therefore low-probability and sensitive to full-suite timing rather than an always-failing product behavior. A full-order three-repeat diagnostic reproduced the responsive Escape failure once. Its final error snapshot showed the authoritative opening message, three quick replies, composer, and final close focused while the dialog remained open: the final session commit and focus repair had completed after the already-lost Escape.

The earlier Fix Round 2 retained trace had already established the same loading-close unmount/final-close mount interval. The working Guide and PDP focus tests wait for a final semantic control before keyboard actions. The existing Chat-first `openGuide` helper did verify HTTP 201 and `OPENING_CONTEXT`, but it then waited only for the dialog shell shared by loading and final states, leaving the React commit/focus boundary unguarded.

The same three-repeat diagnostic later produced four unrelated PDP failures because transaction state is intentionally shared within one API process across repeated full commerce matrices. Those contaminated repeat-only failures were not treated as this fix's RED or as product regressions; fresh-process Guide/PDP and both full release gates remained the authoritative regression checks.

### Minimal Fix

`chat-first.spec.ts` now has one `openGuideFromEntry` readiness contract used by the normal helper, the 320×700 / 200% path, and the reduced-motion keyboard path. `tiktok-responsive.spec.ts` has the equivalent `openReadyGuide` contract used by both responsive Guide-opening paths. Each helper:

1. installs the real `POST /guide/sessions` response waiter before activation;
2. verifies HTTP 201, `OPENING_CONTEXT`, both revisions at `1`, and exact `SEND_MESSAGE` / `RETURN_TO_FEED` actions;
3. waits for the final opening text and final close focus before geometry or Escape assertions continue.

The original geometry, overflow, keyboard-entry, focus-return, inert, and Escape assertions remain intact. No sleep, retry, timeout increase, skip, product component, API, contract, authority, or Playwright configuration changed.

### GREEN and Final Verification

High-repeat target set, interleaving both failures with the previous reduced-motion path:

```text
pnpm --dir apps/web exec playwright test \
  e2e/chat-first.spec.ts e2e/tiktok-responsive.spec.ts \
  --project=mobile-chromium \
  --grep "320×700 at 200 percent text keeps close|reduced motion keeps focus trapped|1440×1000 keeps one 390×844 live phone" \
  --repeat-each=50 --trace=retain-on-failure
# 150 passed in 1.9m
```

Adjacent focus and full browser gates:

```text
pnpm --dir apps/web exec playwright test \
  e2e/guide.spec.ts e2e/pdp-focus.spec.ts \
  --project=mobile-chromium --project=desktop-interview
# 10 passed in 10.4s

pnpm test:e2e
# 39 passed, 31 skipped in 31.5s

CAPTURE_CHAT_FIRST_EVIDENCE=1 pnpm test:e2e
# 42 passed, 28 skipped in 39.1s
```

Static, unit, type, and layout gates:

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

### Production Screenshot Delta

The two mobile files remained byte-for-byte identical at `6552ee74...c204` and `489e4990...02b`. The strengthened final-UI/focus readiness changed the desktop capture from 724,474 to 724,473 bytes; two consecutive production captures produced the same new SHA-256 `ef2cdadf...3e70`.

Decoded pixel comparison against the superseded `ec507c6d...66d` desktop file found only 24 pixels / 42 RGB channels changed, with maximum channel delta `2`, confined to `x=324–336`, `y=820–832` in the phone composer's text-antialiasing area. There was no layout, content, hierarchy, focus-ring, or responsive-state change. The regenerated 1440×1000 original was inspected at original detail and is CLEAN: live phone remains primary, panel secondary, video and feed context visible, and no overlay, clipping, duplicate disclosure, or overflow is present.
