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

---

# Independent Review Fix Round 1

## Status

DONE_WITH_CONCERNS

## Baseline and Scope

- Started from clean HEAD `0abc29882f26c0dd95f2ffb22678c930e2399e69`.
- Kept the work inside Task 4 files, plus the explicitly authorized explanation-routing change in `apps/api/app/workflow/engine.py` and its component coverage.
- Retained the earlier minimal authorization for the two stale legacy assertions in `test_guide_api.py` and `test_contracts.py`. The original Task 4 evidence above therefore remains explicit: focused RED `8 failed / 82 passed`, focused GREEN `90 passed`, and the first full API run `2 failed / 304 passed`. Those two failures were old terminal-comparison assertions that contradicted the new continuable comparison contract; no other legacy test was relaxed.
- This section supersedes the earlier concern that explanation prompts rerun recommendation: fix round 1 replaces that behavior with the snapshot-only path documented below.

## Review Findings Fixed

### 1. Comparison Authority Is Separate from Commerce Authority

- Compare membership now comes only from recommendation cards on the current authoritative `latest_response` snapshot.
- A hard-constraint-ineligible anchor with `eligible_sku_ids=[]` can be used as an honest read-only comparator with an eligible current candidate.
- The anchor is never added to `recommended_product_ids` or `eligible_sku_ids_by_product`, and both API and component tests prove its Commerce preview remains rejected with `SKU_NOT_RECOMMENDED`.
- Historical transcript cards remain presentation history only. A product present in an older recommendation but absent from the current snapshot is rejected with `PRODUCT_NOT_RECOMMENDED`; stale revision and safety/current-snapshot action gates still reject without mutation.

### 2. `为什么` / `依据` Uses a Pure Explanation Route

- Added a deterministic `EXPLAIN` intent that runs before the retrieval/ranking path.
- When a current recommendation, insufficient-evidence decision, or comparison exists, the response reuses that exact authoritative snapshot and changes only the explanation text. It cites actual current fit/tradeoff facts or current comparison names, prices, and water-resistance labels.
- It does not call tools, rerank, expand products, rewrite product-scoped SKU authority, change `guide_revision`, replace comparison context, or append trace events. The accepted message still advances `conversation_revision` exactly once.
- With no explainable current decision, it returns an honest lightweight `ANSWER_READY` fallback without inventing recommendations or evidence.

### 3. Exact Comparison Actions Are Enforced Again

- `GuideTurnResponse` now requires the exact ordered comparison actions `[SEND_MESSAGE, OPEN_PRODUCT, RETURN_TO_FEED]`.
- Contract tests reject missing, extra, wrong-order, and wrong-action variants while retaining all comparison shape, state, session, and transcript compatibility validators.

### 4. Compare-vs-Compare Concurrency Is Locked Down

- Barrier-based dual-thread tests cover the same request ID and payload, producing one commit plus one canonical replay.
- A different request ID at the same expected revision produces one success plus one `STALE_CONVERSATION` rejection.
- Both cases prove one revision increment, one `COMPARISON` transcript commit, one `comparison_presented` trace, one processed compare request, exactly one comparison build, no request IDs in trace, and no half-committed state.
- This finding was a missing regression test rather than a production defect: after correcting the test to filter processed requests by `request_kind == "COMPARE"`, both concurrency cases passed without changing transaction code.

## RED Evidence

The pre-fix focused baseline was:

```text
uv --directory apps/api run pytest tests/api/test_compare_cart_api.py tests/component/test_guide_semantics.py tests/component/test_commerce_service.py tests/component/test_workflow.py tests/contract/test_contracts.py -q
# 145 passed, 1 warning
```

After adding the review regressions, the clean focused RED before production changes was:

```text
# 8 failed, 148 passed, 1 warning
```

Those failures were the read-only anchor comparison, three pure-explanation cases, and four exact-action negative cases. The first draft briefly reported `10 failed / 146 passed`; the extra two were false test failures because the new concurrency assertion counted the setup `MESSAGE` request ID. The assertion was corrected before implementation to inspect only processed `COMPARE` requests; both concurrency cases then passed against the baseline transaction.

After updating the authorized legacy post-comparison assertion and including `test_guide_api.py`, the complete round RED was:

```text
uv --directory apps/api run pytest tests/api/test_compare_cart_api.py tests/api/test_guide_api.py tests/component/test_guide_semantics.py tests/component/test_commerce_service.py tests/component/test_workflow.py tests/contract/test_contracts.py -q
# 9 failed, 165 passed, 1 warning
```

The ninth failure proved the API still replaced a comparison with a newly reranked recommendation for `为什么？`.

During refactor, two tighter explanation-content assertions were added. They failed because the first GREEN copy named only generic fact categories rather than the current decision's concrete facts:

```text
uv --directory apps/api run pytest tests/component/test_guide_semantics.py -k 'current_read_only_anchor_is_comparable or explanation_reuses_current_decision' -q
# 2 failed, 1 passed, 50 deselected
```

The minimal refinement made the explanation cite snapshot-only concrete facts; the same command then returned `3 passed / 50 deselected`.

## GREEN and Final Verification

```text
uv --directory apps/api run pytest tests/api/test_compare_cart_api.py tests/api/test_guide_api.py tests/component/test_guide_semantics.py tests/component/test_commerce_service.py tests/component/test_workflow.py tests/contract/test_contracts.py -q
# 175 passed, 1 warning

uv --directory apps/api run pytest tests -q
# 318 passed, 1 warning

uv --directory apps/api run python ../../evals/run_foundation.py
# 6 passed / 6 total; pass_rate 1.0

uv --directory apps/api run python -m scripts.export_openapi
pnpm --dir packages/contracts generate
pnpm --dir packages/contracts check
# Passed; OpenAPI and generated TypeScript are canonical with no diff

uv --directory apps/api run ruff check app tests ../../evals
# All checks passed!

git diff --check
# Passed with no output
```

## Commit

- Fix-round implementation and report: the independent commit containing this section; its exact hash is returned with the final clean-worktree handoff because a commit cannot contain its own hash.

## Remaining Concerns

- Explanation copy is deliberately deterministic and snapshot-only; this task does not add an LLM or live product retrieval.
- `CompareRequest.request_id` and expected revision remain optional for Task 1 backward compatibility. Clients that omit them do not receive replay/stale guarantees.
- The only test warning remains the pre-existing Starlette TestClient/httpx deprecation warning.
