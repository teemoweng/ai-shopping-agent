# Task 7 Report: Integrate Compact Guide Sheet

## Status

Complete. The compact chat-first Guide Sheet is integrated, all required unit/browser/build gates pass, the implementation is committed, and the worktree was clean immediately after the implementation commit.

Implementation commit:

- `96d788c53fb718f3dc4c1d4f852e75881ea39fb2 feat: integrate compact guide sheet`

## Changes

- Replaced the old heavyweight report/dashboard render in `GuideSheet` with `GuideChatView` while retaining the verified-turn, request-version, same-ID retry/reconcile, comparison-expectation, freeze, session locator/context ownership, focus, inert, body-lock, and scroll controller.
- Added deterministic compact/expanded mode control: comparison pending/ready and the explicit alternatives subview expand; opening, ordinary answer, no-match, safety, and evidence remain compact. Message count is not a mode signal.
- Pending sends render only the explicit user bubble and status until canonical POST/retry/GET resolution; no assistant content is synthesized.
- Restored the same session, transcript, mode, and scroll across close/reopen and AI-to-PDP-to-AI return paths.
- Kept product/commerce callbacks gated by server actions and current canonical recommendation/provenance. Safety/fatal paths close subviews and remove business actions.
- Added `GuideChatView` semantic subview notifications and one-boundary scroll restore/reporting without moving parent mode authority into the pure view.
- Updated the AI entry copy/accessibility name to `问问这款` and the secondary desktop explanation to describe the lightweight conversation. Feed/PDP structure, assets, anchors, and click behavior are unchanged.
- Migrated E2E selectors to the chat view while retaining and extending message ID, conversation revision, canonical response, focus, evidence, and recovery assertions.

## TDD Evidence

### RED

1. Initial prescribed controller/responsive RED:

   `pnpm --dir apps/web exec vitest run src/test/guide-sheet.test.tsx src/test/responsive-frame.test.tsx`

   Result: 94 tests; 92 passed, 2 failed. Key failures were the old AI entry wording and the old desktop step copy.

2. Controller mode coverage RED after adding alternatives behavior:

   Same focused command.

   Result: 95 tests; 92 passed, 3 failed. The old sheet did not expose the semantic alternatives expansion path.

3. Pure view interface RED:

   `pnpm --dir apps/web exec vitest run src/test/guide-chat-view.test.tsx`

   Result: 10 tests; 8 passed, 2 failed. Missing interfaces were semantic subview notification and scroll change/restore wiring.

4. Expanded integration RED:

   `pnpm --dir apps/web exec vitest run src/test/guide-sheet.test.tsx src/test/responsive-frame.test.tsx`

   Result: 103 tests; 91 passed, 12 failed. The old heavyweight report path and fixed sheet sizing did not satisfy the compact chat controller contract.

### GREEN and migration checkpoints

- Pure view GREEN: 10/10 passed.
- First render-swap GREEN attempt: 103 tests; 30 passed, 73 failed. This was the expected broad old-selector mismatch after removing the report DOM; no failures were skipped or deleted.
- Equivalent selector/helper migration checkpoints: 32/103, 63/103, 93/103, 100/103, 102/103, then 103/103 passed.
- After removing the dead report render:

  `pnpm --dir apps/web exec vitest run src/test/guide-chat-view.test.tsx src/test/guide-sheet.test.tsx src/test/responsive-frame.test.tsx`

  Result: 3 files, 113/113 passed.

- First combined Guide/focus E2E run: 10 tests; 6 passed, 4 failed. All six PDP focus cases passed; four Guide cases used stale chat copy/selectors.
- Guide E2E after semantic selector migration: 4/4 passed.
- Final combined E2E: 10/10 passed, including focus 6/6.

## Authorized Test/Interface Migrations

- `product-anchor.tsx` was outside the original file list but required to satisfy the brief's exact visible/accessibility entry copy. Authorization was limited to `问问这款` wording while preserving product name, DOM structure, assets, click behavior, anchors, and layout.
- `guide-chat-view.tsx` and its pure tests were authorized because the parent controller required semantic `evidence | alternatives | null` notifications and scroll restore/reporting. The view reports semantics only; `GuideSheet` remains the sole mode authority.
- First full Web run was 257/265 passed with 8 failures: five `feed.test.tsx` and three `pdp-transaction.test.tsx` selectors still used the old `问 AI：…` entry name. Authorization covered only those exact entry selector migrations.
- Second full Web run was 259/265 passed with 6 failing scenarios. The new opening state required one deterministic server-owned quick reply before the authoritative recommendation, and compact cards/close control used `看商品`/`关闭导购`. A second narrow authorization covered only those equivalent UI setup/selectors. The migration uses the real `createGuideSession -> sendGuideMessage -> recommendation -> PDP` path; media pause/resume, focus, network/revision, stale downgrade, Guide/Commerce provenance, receipt, and cart assertions remain active and unchanged.
- The affected Feed/PDP transaction subset passed 57/57 after migration. No test was skipped, marked todo, or reduced to fake DOM setup.

## Final Verification

- Focused Vitest:

  `pnpm --dir apps/web exec vitest run src/test/guide-chat-view.test.tsx src/test/guide-sheet.test.tsx src/test/responsive-frame.test.tsx`

  Result: 3 files, 113/113 passed.

- Required Guide + PDP focus Playwright, mobile and desktop:

  `pnpm --dir apps/web exec playwright test e2e/guide.spec.ts e2e/pdp-focus.spec.ts --project=mobile-chromium --project=desktop-interview`

  Result: 10/10 passed; focus paths 6/6.

- Full Web tests:

  `pnpm --dir apps/web test`

  Result: 11 files, 265/265 passed.

- Lint: `pnpm --dir apps/web lint` — passed with 0 errors and 0 warnings.
- TypeScript: `pnpm --dir apps/web exec tsc --noEmit` — passed.
- Production build: `pnpm --dir apps/web build` — passed.
- Whitespace: `git diff --check` — passed.
- Diff/status self-review: only the six original Task 7 files plus the four explicitly authorized interface/selector files were changed; no skip/todo was introduced.

## Concerns

- No known Task 7 product failures or failures in the Task 7 gates listed above. This statement does not cover the Task 8 TikTok-demo journey suite, which was not run as part of Task 7.
- Next.js still emits the pre-existing multiple-lockfile/workspace-root warning in build and E2E.
- E2E still emits the pre-existing product-image single-dimension CSS warning. Neither warning blocks compilation, behavior, or the required assertions.

## Review Fix Round 1

### Status and commit

Complete. Review findings for dual-revision monotonicity, semantic alternatives restoration, and dead heavyweight Guide CSS are fixed and verified.

Fix implementation commit:

- `a7e6fffe4f6124a05257b3669d9b723baff28eea fix: harden guide revision and subview restore`

### Changes

- Added a revision baseline to every message, comparison, and state-conflict synchronization expectation. Every verified-turn application now rejects lower `guide_revision` or lower `conversation_revision` than the current verified turn; message and comparison resolutions additionally require `conversation_revision` to advance.
- A stale direct message response, uncertain-message canonical GET, comparison canonical GET, or ordinary reopen GET keeps the last verified turn, freezes business actions, requires synchronization, and never appends an unverified assistant message. State-conflict reconciliation still accepts an authoritative non-decreasing snapshot, and an ordinary same-revision replay remains valid.
- Replaced the controller's bare alternatives boolean with a recoverable semantic snapshot containing subview kind, session, context, and latest message ID. `GuideChatView` accepts that semantic as an initial subview, so close/reopen and alternatives-to-PDP-to-AI both restore the real alternatives region, expanded mode, transcript, session locator, and scroll position.
- Context/session replacement, a new message, comparison start, safety, fatal, and recovery boundaries clear the alternatives semantic. Expanded mode remains tied to an explicit alternatives semantic or comparison state; evidence remains compact.
- Changed message scrolling so a new initial value is applied only at mount/session boundaries; same-session rerenders report and preserve the user's current position instead of pulling it back.
- `rg` found no production references to the removed heavyweight Guide renderer classes. Deleted only those dead selectors, including the claims ledger/records, context/state panels, old header/body/composer/clarification/footer shells, while retaining live Guide Chat, recommendation, comparison, recovery, PDP, and commerce styles.

### TDD evidence

RED command:

`pnpm --dir apps/web exec vitest run src/test/guide-chat-view.test.tsx src/test/guide-sheet.test.tsx src/test/responsive-frame.test.tsx`

RED result: 3 files, 127 tests; 113 passed and 14 failed. The failures were 2 pure-view restoration cases and 12 controller cases covering lower/non-advancing message POST and canonical GET revisions, lower comparison/reopen revisions, and the two alternatives restoration paths. Responsive layout remained 11/11 green.

First GREEN attempt with the implementation: 3 files, 127 tests; 116 passed and 11 failed. All 14 new regressions were green. The remaining failures were existing valid-response fixtures whose default `conversation_revision: 1` now represented a rollback; only those fixtures were advanced to their intended non-decreasing or next canonical revisions, without removing or weakening network, authority, freeze, recovery, or commerce assertions.

Focused GREEN after fixture alignment: 3 files, 127/127 passed. A further guard case for a comparison canonical GET with a non-advancing conversation revision was added and passed, bringing the final focused result to 3 files, 128/128 tests.

### Final verification

- Focused controller/pure/layout Vitest: `pnpm --dir apps/web exec vitest run src/test/guide-chat-view.test.tsx src/test/guide-sheet.test.tsx src/test/responsive-frame.test.tsx` — 3 files, 128/128 passed; responsive layout 11/11.
- Full Web tests: `pnpm --dir apps/web test` — 11 files, 280/280 passed.
- Lint: `pnpm --dir apps/web lint` — passed with 0 errors and 0 warnings.
- TypeScript: `pnpm --dir apps/web exec tsc --noEmit` — passed.
- Production build: `pnpm --dir apps/web build` — passed.
- Guide + PDP focus Playwright: `pnpm --dir apps/web exec playwright test e2e/guide.spec.ts e2e/pdp-focus.spec.ts --project=mobile-chromium --project=desktop-interview` — 10/10 passed; Guide 4/4 and focus 6/6.
- Whitespace: `git diff --check` — passed.
- Diff/status self-review: the implementation commit contains only the five authorized review files (`globals.css`, both Guide components, and both focused test files). No test was skipped or weakened, and no Task 8 file was modified.

### Concerns and routed scope

- The eight `tiktok-demo` journeys are explicitly Task 8 plan files/steps. They were not run, are not claimed as passing here, and are routed to Task 8; no Task 8 file was changed in this review fix.
- The pre-existing Next.js multiple-lockfile/workspace-root warning and product-image single-dimension E2E warning remain non-blocking.
