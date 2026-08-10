# Task 4 Report — Keep Comparison Inside the Guide Conversation

## Status

DONE_WITH_CONCERNS

## Changes

- Made comparison a repository-transactional conversation action: request replay/digest is checked first, followed by expected conversation revision, current `REQUEST_COMPARISON`, and recommended-product membership.
- Added canonical compare replay for the same request ID and payload. Replay does not append another transcript message, advance either revision, rerun comparison work, or append another trace event.
- Added `409 MESSAGE_ID_REUSED` for one request ID with a different payload and `409 STALE_CONVERSATION` for stale compare requests, with transaction rollback preserving session, snapshot, processed requests, events, and trace bytes.
- Appended exactly one assistant `COMPARISON` transcript message, advanced `conversation_revision` exactly once, and stored the canonical `COMPARISON_READY` snapshot and processed request in the same transaction.
- Limited the comparison trace payload to `product_ids`; request IDs, raw text, transcript, tokens, and secrets are not written to trace.
- Changed `COMPARISON_READY` actions to exactly `SEND_MESSAGE`, `OPEN_PRODUCT`, and `RETURN_TO_FEED`, while retaining comparison state/session ownership, request-comparison gating, recommendation membership, current Guide provenance, product-scoped SKU checks, confirmation-token checks, transaction revision, and Commerce idempotency.
- Preserved current authority for non-preference explanation prompts such as `为什么？` without advancing `guide_revision`. Preference changes advance `guide_revision` and invalidate older provenance; safety makes historical recommendation cards non-authoritative; a hard-filtered read-only anchor remains ineligible for Commerce.
- Regenerated OpenAPI and TypeScript contracts. The generated files were already canonical, so regeneration produced no committed diff.

## RED Evidence

Baseline before Task 4 test changes:

```text
uv --directory apps/api run pytest tests/api/test_compare_cart_api.py tests/component/test_guide_semantics.py tests/component/test_commerce_service.py -q
# 84 passed, 1 warning
```

After adding the Task 4 reliability, continued-conversation, trace, and current-authority tests, before implementation:

```text
uv --directory apps/api run pytest tests/api/test_compare_cart_api.py tests/component/test_guide_semantics.py tests/component/test_commerce_service.py -q
# 8 failed, 82 passed, 1 warning
```

The eight intended failures proved the missing behavior: compare replay was rejected, request-ID reuse returned the wrong conflict, stale compare mutated state, comparison blocked the next message, the comparison trace contained an extra field, `COMPARISON_READY` lacked `SEND_MESSAGE`, serialized concurrency still treated comparison as terminal, and a standalone `为什么？` discarded current Commerce provenance.

## GREEN Evidence

Focused tests after the minimal implementation and refactor:

```text
uv --directory apps/api run pytest tests/api/test_compare_cart_api.py tests/component/test_guide_semantics.py tests/component/test_commerce_service.py -q
# 90 passed, 1 warning
```

The first full API run then found two old assertions outside the original Task 4 file authorization:

```text
uv --directory apps/api run pytest tests -q
# 2 failed, 304 passed, 1 warning
```

The failures were limited to:

- `tests/api/test_guide_api.py::test_message_rejects_comparison_ready_without_mutating_snapshot_or_trace`, which still required a post-comparison message to return 409;
- `tests/contract/test_contracts.py::test_comparison_ready_turn_requires_exact_terminal_actions`, which still required the removed two-action terminal validator.

Work stopped at that boundary. The coordinator then granted minimal authorization to update only those two stale tests. They now verify the exact continuable action mapping, post-comparison transcript/revisions, current Commerce authority, and trace privacy while the existing malformed-comparison, safety/fatal, and all-view action invariants remain covered.

Focused verification of the two authorized updates:

```text
uv --directory apps/api run pytest tests/api/test_guide_api.py::test_message_continues_after_comparison_with_current_authority_and_safe_trace tests/contract/test_contracts.py::test_comparison_ready_turn_uses_exact_continuable_action_mapping -q
# 2 passed, 1 warning
```

## Final Verification

```text
uv --directory apps/api run python -m scripts.export_openapi
pnpm --dir packages/contracts generate
pnpm --dir packages/contracts check
# Passed; generated OpenAPI and TypeScript are canonical with no diff

uv --directory apps/api run pytest tests -q
# 306 passed, 1 warning

uv --directory apps/api run python ../../evals/run_foundation.py
# 6 passed / 6 total; pass_rate 1.0

uv --directory apps/api run ruff check app tests ../../evals
# All checks passed!

git diff --check
# Passed with no output
```

## Commit

- Implementation commit: `dece709` — `feat: keep comparison inside guide conversation`
- Report commit: the commit containing this report; its exact hash is returned as the final Task 4 HEAD because a commit cannot include its own hash.

## Concerns

- The deterministic Foundation classifier treats explanation terms such as `为什么` / `依据` as a decision explanation that reruns the existing verified recommendation path. This preserves current provenance without changing `guide_revision`, but it is still a narrow lexical baseline rather than a real LLM explanation capability.
- `CompareRequest.request_id` and expected revision remain optional for backward compatibility established by Task 1. Reliable clients should supply both; calls without them still execute once but cannot receive request-ID replay guarantees.
- The sole test warning is the pre-existing Starlette TestClient/httpx deprecation warning.
