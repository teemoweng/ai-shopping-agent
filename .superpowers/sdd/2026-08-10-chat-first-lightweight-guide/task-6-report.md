# Task 6 Report — Build the Lightweight Chat Presentation

## Status

DONE_WITH_CONCERNS

## Changes

- Added `GuideChatView` as a pure presentation/interaction component. It renders the verified transcript, compact/expanded mode, source chip, exactly three opening prompts, sticky textarea composer, controller-supplied status/error semantics, and one `AI 生成 · 合成原型` disclosure.
- Kept the authority boundary narrow: the view does not fetch, access browser storage, read or mutate revisions, inspect `allowed_actions`, or authorize Commerce. Product/evidence/comparison actions exist only when their controller callbacks are supplied; safety presentation suppresses every commercial result and action.
- Added conversation semantics with `role="log"`, polite live updates, explicit message-role labels, status/alert roles, no autofocus, composition-safe Enter submission, Shift+Enter preservation, and near-bottom-only transcript auto-scroll.
- Added one-at-a-time evidence/alternatives subviews. Hidden content is absent from the accessibility tree, and closing either subview restores focus to the newly mounted semantic trigger.
- Added optional compact variants to `RecommendationCard` and `ComparisonTable` while preserving all existing call sites and default behavior. The compact recommendation shows one fit reason, one tradeoff, one evidence action, current fixture starting price, product art, and `看商品`; the compact semantic comparison limits the primary path to two products in a labeled, keyboard-focusable horizontal region.
- Added a scoped light-surface visual system with compact 40–44dvh / expanded 72–74dvh targets, 44px controls, `100dvh`, safe-area padding, visible focus, reduced-motion overrides, and a 390×844 opening layout budget that keeps greeting, three prompts, composer, and disclosure within the compact container.

## RED Evidence

Tests were written before production implementation and run with the brief command:

```text
pnpm --dir apps/web exec vitest run src/test/guide-chat-view.test.tsx src/test/decision-actions.test.tsx
# exit 1
# 2 test files failed
# 2 failed, 9 passed / 11 collected tests
# 1 failed suite had 0 collected tests because @/components/guide-chat-view did not exist
```

The failures proved the new view was absent, the recommendation had no compact `$14 起` hierarchy, and comparison lacked the labeled focusable region while still showing three products.

## GREEN Evidence

The first focused GREEN run exposed a real focus-restoration defect:

```text
pnpm --dir apps/web exec vitest run src/test/guide-chat-view.test.tsx src/test/decision-actions.test.tsx
# exit 1
# 1 file failed, 1 passed
# 1 failed, 17 passed / 18 total
```

The implementation initially attempted to focus a trigger DOM node that had been unmounted while the progressive subview was open. Focus restoration was changed to target the newly mounted semantic trigger after the subview closes. A stale test reference to the old product card was also corrected to query the newly mounted card; the behavior assertion remained unchanged.

Focused verification after the fix and refactor:

```text
pnpm --dir apps/web exec vitest run src/test/guide-chat-view.test.tsx src/test/decision-actions.test.tsx
# 2 files passed; 18 passed / 18 total
```

Final verification on the implementation tree:

```text
pnpm test:web
# 11 files passed; 253 passed / 253 total

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

- Implementation commit: `f3f0d3d9f98571420ed2660eec0652c7dd14842d` — `feat: render lightweight shopping conversation`
- Report commit: the commit containing this report; its exact hash is returned as the final Task 6 HEAD because a commit cannot contain its own hash.

## Concerns

- `next build` emits the existing worktree multi-lockfile workspace-root inference warning. Compilation, TypeScript, static generation, and the production build complete successfully; changing repository-level Turbopack configuration is outside Task 6 ownership.
- Task 6 intentionally does not integrate `GuideChatView` into `GuideSheet` or modify navigation/commerce controllers. Production Chromium geometry, Sheet mode switching, and end-to-end focus/navigation evidence remain Task 7 scope; this task locks the pure presentation behavior and scoped responsive CSS only.
