# Task 5 Report — Validate and Restore Conversation State in the Web Client

## Status

DONE_WITH_CONCERNS

## Changes

- Added strict runtime validation for transcript identity and sequence integrity, role/kind compatibility, timestamps, redaction metadata, attachment shapes, comparison ownership/equality, conversation revisions, known views/actions, and exact ordered view/action mappings.
- Updated Guide message and comparison clients to require stable request IDs plus expected conversation revisions and to encode every Guide session path segment, including legacy cart paths.
- Added the single allowed `sessionStorage` locator `ai-shopping-guide-session:<contentContextId>`, storing only the opaque server session ID. No transcript, request ID, token, product fact, or health text is persisted client-side.
- Restored authoritative sessions across close/reopen, reload, and PDP return. Content-context changes isolate and clear the previous locator; a stale 404 locator is removed before a new session is created.
- Added one-ID/one-revision POST recovery for messages and comparisons: an uncertain write is retried exactly once with the same values, followed by canonical session reconciliation when the write remains unresolved.
- Preserved read-only/frozen feedback while state is uncertain and retained the existing focus, busy-state, recovery, action-authority, and transaction-safety behavior. No Task 6 layout, card hierarchy, branding, or visual redesign was performed.
- With coordinator approval, updated five stale legacy Web test files only as required by the stricter Task 5 contract. API tests now use the four-argument message/compare signatures and assert encoded paths/reliability bodies; comparison/action/feed/PDP fixtures now carry legal transcript/revision/action data; feed/PDP suites explicitly isolate `sessionStorage`. Negative contract assertions were retained.

## RED Evidence

Runtime-validator tests before implementation:

```text
pnpm --dir apps/web exec vitest run src/test/decision-contracts.test.ts
# 4 failed, 16 passed (20 total)
```

The failures proved that valid opening/answer snapshots were rejected, an action subset was accepted, and the new continuable comparison contract was rejected.

After adding API signature and recovery-field tests, still before implementation:

```text
pnpm --dir apps/web exec vitest run src/test/decision-contracts.test.ts
# 7 failed, 16 passed (23 total)
```

The three additional failures proved missing revision-aware message/compare calls and unencoded legacy Guide session paths.

Locator, lifecycle, and recovery component tests before implementation:

```text
pnpm --dir apps/web exec vitest run src/test/guide-sheet.test.tsx
# 6 failed, 67 passed (73 total)
```

The failures proved that only in-memory IDs existed, reload did not restore through GET, stale locators were not cleared before create, content contexts were not isolated, and uncertain message/compare POSTs did not retry with stable identifiers.

## GREEN Evidence

Focused Task 5 verification after the minimal implementation:

```text
pnpm --dir apps/web exec vitest run src/test/decision-contracts.test.ts src/test/guide-sheet.test.tsx
# 2 files passed; 96 passed / 96 total
```

The first complete Web run then exposed nine stale legacy tests outside the original Task 5 file list:

```text
pnpm --dir apps/web test
# 1 file passed, 9 failed; 213 passed, 9 failed / 222 total
```

The nine failures were limited to six old API-client calls/fixtures, one terminal comparison fixture, and one leaked locator each in Feed and PDP tests. Work paused at the boundary. The coordinator authorized minimal updates to `api-client.test.ts`, `decision-contracts-comparison.test.ts`, `decision-actions.test.tsx`, `feed.test.tsx`, and `pdp-transaction.test.tsx`; no production workaround or weakened validator was added.

Final verification on the implementation tree:

```text
pnpm lint:web
# Passed; 0 errors, 0 warnings

pnpm --dir apps/web exec tsc --noEmit
# Passed

pnpm --dir apps/web exec vitest run src/test/decision-contracts.test.ts src/test/guide-sheet.test.tsx
# 2 files passed; 96 passed / 96 total

pnpm --dir apps/web test
# 10 files passed; 222 passed / 222 total

pnpm --dir apps/web build
# Production build passed; 4/4 static pages generated

git diff --check
# Passed with no output
```

## Commit

- Implementation commit: `455e7d3576f679adac6318bc9c866635d2c7dddd` — `feat: restore authoritative guide conversation`
- Report commit: the commit containing this report; its exact hash is returned as the final Task 5 HEAD because a commit cannot contain its own hash.

## Concerns

- `next build` emits the existing multi-lockfile workspace-root inference warning because both the main repository and worktree contain `pnpm-workspace.yaml`. Compilation, TypeScript, static generation, and the production build all complete successfully.
- The browser locator intentionally provides continuity only for the current tab/sessionStorage lifetime; the server remains authoritative for all transcript and Guide state.
