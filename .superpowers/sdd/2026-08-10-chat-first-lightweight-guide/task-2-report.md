# Task 2 Report — Make Guide Messages Recoverable and Idempotent

## Status

DONE_WITH_CONCERNS

## Changes

- Added canonical Unicode JSON SHA-256 request hashing, server-generated `gmsg_<uuid>` message IDs, monotonic transcript sequences, fixed health-text redaction, bounded user turns, and deep-copied conversation attachment in `guide_conversation.py`.
- Made Guide session creation atomic across repository creation, opening workflow events, opening transcript, and authoritative snapshot persistence.
- Made message handling check processed ID/digest, stale conversation revision, the 12-user-turn limit, and allowed actions in the brief's required order before executing the engine.
- Committed user message, assistant message, one conversation revision increment, processed request, latest snapshot, in-memory events, and trace-file writes inside the existing `SessionRepository.transaction()` boundary.
- Added API/component coverage for recovery, replay, ID reuse, stale writes, canonical hashing, health redaction, turn limits, concurrent same/different IDs, create rollback, engine/tool rollback, snapshot immutability, and trace-file byte restoration.
- With coordinator approval, made one minimal cross-boundary compatibility change in `cart_service.py`: the existing compare transition appends a matching assistant `COMPARISON` transcript before persisting `COMPARISON_READY`. It does not implement Task 4 request IDs, compare idempotency, stale compare rejection, or conversation revision changes.
- `session_repository.py` required no production change: its existing reentrant lock, generic deep-copy session snapshot, in-memory event snapshot, and trace-length restore already provide the atomic behavior Task 2 needs. Task 2 tests exercise that path through create/message failures and concurrent messages.

## RED Evidence

The brief's focused command after adding Task 2 behavior tests and before implementation:

```text
uv --directory apps/api run pytest tests/api/test_guide_api.py tests/component/test_guide_semantics.py tests/component/test_session_repository.py -q
# 9 failed, 79 passed, 1 warning
```

The failures proved that create had no opening transcript, accepted messages did not advance `conversation_revision`, message IDs and expected revisions were ignored, the 13th user turn was accepted, identical concurrent IDs executed twice, different concurrent IDs both succeeded, health text was not redacted into transcript, and opening failure left session/trace mutations behind.

Canonical digest test before its implementation:

```text
uv --directory apps/api run pytest tests/component/test_guide_semantics.py::test_request_digest_uses_canonical_unicode_json -q
# 1 failed
```

After Task 2 began attaching transcript, Task 1's strict terminal invariant correctly exposed the existing compare snapshot incompatibility:

```text
uv --directory apps/api run pytest tests/api/test_guide_api.py tests/component/test_guide_semantics.py tests/component/test_session_repository.py -q
# 4 failed, 84 passed, 1 warning
```

All four failures came from the legacy compare path changing the top-level view to `COMPARISON_READY` while leaving the last transcript message as `RECOMMENDATION`. The contract was not weakened.

## GREEN / Final Verification

The coordinator-authorized narrow compare compatibility tests:

```text
uv --directory apps/api run pytest tests/api/test_guide_api.py::test_message_rejects_comparison_ready_without_mutating_snapshot_or_trace 'tests/component/test_guide_semantics.py::test_message_rejects_terminal_snapshot_without_mutating_session_or_trace[COMPARISON_READY]' tests/component/test_guide_semantics.py::test_compare_terminal_snapshot_cannot_be_overwritten_by_concurrent_message tests/component/test_guide_semantics.py::test_concurrent_message_waits_for_compare_then_rejects_terminal_snapshot -q
# 4 passed, 1 warning
```

Fresh pre-commit verification on the final implementation tree:

```text
uv --directory apps/api run pytest tests/api/test_guide_api.py tests/component/test_guide_semantics.py tests/component/test_session_repository.py -q
# 89 passed, 1 warning

uv --directory apps/api run ruff check app tests
# All checks passed!

uv --directory apps/api run pytest tests -q
# 284 passed, 1 warning

git diff --check
# Passed with no output
```

## Commit

- Implementation commit: `ce12e61` — `feat: persist reliable guide transcript`
- Final report commit: the commit containing this report; its exact hash is returned as the final Task 2 HEAD to the coordinator because a commit cannot include its own hash.

## Concerns

- The sole warning is the pre-existing Starlette TestClient/httpx deprecation warning.
- Task 3 still owns changing the legacy clarification opening into the approved `OPENING_CONTEXT` copy and `SEND_MESSAGE` flow. Task 2 records the current legacy opening response as the first assistant transcript without pre-implementing Task 3 routing.
- Task 4 still owns compare request IDs, compare idempotency, stale compare rejection, and compare-driven conversation revision increments. The authorized compatibility shim only preserves Task 1's terminal transcript invariant for the already-existing compare path.
