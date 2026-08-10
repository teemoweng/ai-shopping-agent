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

---

# Independent Review Fix Round 1

## Status

DONE_WITH_CONCERNS

## Findings Fixed

1. **Stale 404 races are side-effect free.** Locator restore now verifies mount/open state, request version, current content context, session ref, and locator ownership before clearing storage, resetting refs/state, or creating. Deferred tests prove a 404 arriving after close, unmount, or context switch performs no stale clear/create/callback work.
2. **Temporary restore failures retain authority.** Network and 5xx failures keep the exact locator/session ID, freeze all actions, expose retry feedback, and retry GET through the same locator on either the sync control or reopen. Only a confirmed 404 or explicit ownership mismatch clears before create. Malformed contract responses remain distinct: they do not masquerade as 404 ownership evidence.
3. **Session and context ownership is enforced end to end.** GET, message, and compare guards reject a response whose `session_id` differs from the requested path. Restore replaces wrong-session/wrong-context locator snapshots only after clearing that locator; every controller apply checks the active `contentContextId`. A wrong-context create/message response enters the fatal contract state and never reaches storage.
4. **Redaction is exact.** `redacted=true` is accepted only for `USER` / `USER_TEXT` with text exactly `已隐藏一条健康相关描述`. Raw text marked redacted, an unmarked placeholder, and redacted assistant messages are rejected.
5. **Timestamps are strict RFC3339 instants.** Date-only values, timestamps without a timezone, impossible dates, hour 24, and malformed offsets are rejected. Valid UTC and explicit-offset date-times remain accepted.
6. **Retry-confirmed 404 and comparison ownership are consistent.** A locator first failing temporarily and later returning 404 is cleared before exactly one create. Compare response ownership now uses the same explicit session-mismatch guard as GET and message.

## RED Evidence

Redaction, timestamp, and GET/message ownership tests before production changes:

```text
pnpm --dir apps/web exec vitest run src/test/decision-contracts.test.ts src/test/api-client.test.ts
# 2 files failed; 9 failed, 53 passed / 62 total
```

The nine failures were three invalid redaction states accepted, four non-RFC3339 timestamps accepted, and two wrong-session Guide responses accepted.

Deferred race, temporary recovery, and controller ownership tests before production changes:

```text
pnpm --dir apps/web exec vitest run src/test/guide-sheet.test.tsx
# 1 file failed; 9 failed, 73 passed / 82 total
```

The failures proved late 404 clear/create side effects, loss of locator authority on temporary failure, acceptance of wrong session/context turns, and storage/application of wrong-context create/message responses.

The first combined GREEN attempt exposed two legacy invariants that the minimal implementation still had to preserve:

```text
pnpm --dir apps/web exec vitest run src/test/decision-contracts.test.ts src/test/api-client.test.ts src/test/guide-sheet.test.tsx
# 2 failed, 142 passed / 144 total
```

One encoded-path success fixture returned the wrong session. The other failure proved malformed contract recovery must remain frozen/retryable instead of being treated as confirmed stale ownership. A dedicated `GUIDE_SESSION_MISMATCH` boundary separated ownership from generic `INVALID_API_RESPONSE` without weakening either validator.

Retry GET confirmation was then tested independently before implementation:

```text
pnpm --dir apps/web exec vitest run src/test/guide-sheet.test.tsx -t "clears a locator and creates only after retry GET confirms 404"
# 1 failed, 82 skipped
```

Comparison guard consistency was also proven RED before its change:

```text
pnpm --dir apps/web exec vitest run src/test/api-client.test.ts -t "comparison response owned by a different session"
# 1 failed, 30 skipped
```

## GREEN and Final Verification

```text
pnpm --dir apps/web exec vitest run src/test/decision-contracts.test.ts src/test/api-client.test.ts src/test/guide-sheet.test.tsx
# 3 files passed; 146 passed / 146 total

pnpm --dir apps/web test
# 10 files passed; 244 passed / 244 total

pnpm lint:web
# Passed; 0 errors, 0 warnings

pnpm --dir apps/web exec tsc --noEmit
# Passed

pnpm --dir apps/web build
# Production build passed; 4/4 static pages generated

git diff --check
# Passed with no output
```

## Commit

- Fix-round commit: the independent commit containing these review fixes and this appended report; its exact hash is returned with the final clean-worktree handoff.

## Remaining Concerns

- `next build` still emits the pre-existing multi-lockfile workspace-root inference warning. Compilation, TypeScript, static generation, and the production build complete successfully.
- The client uses `GUIDE_SESSION_MISMATCH` as an internal successful-response guard code so the controller can distinguish explicit ownership failure from a generic malformed contract. It is not persisted or exposed as server authority.
