# Task 3 Report — Route Each Question to the Lightest Valid Answer

## Status

DONE_WITH_CONCERNS

## Changes

- Added the internal deterministic `GuideQuestionIntent` enum and lexical `classify_question()` baseline for fit, white-cast claim, comparison, recommendation/constraint, and general questions. This is not an LLM classifier.
- Changed session creation to a true `UNDERSTAND` / `OPENING_CONTEXT` opening with the approved Chinese copy, exactly three quick questions, `SEND_MESSAGE`, and no pre-question retrieval.
- Routed `适合油皮吗？` to one commute-versus-outdoor clarification, storing `skin_type="oily"` and incrementing `guide_revision` exactly once.
- Routed `会不会泛白？` to a recommendation-free `ANSWER_READY` response that separates the structured low-risk product fact from the unsupported creator claim covering all complexions, without changing `guide_revision` or running retrieval.
- Routed commute and outdoor/water replies through the existing hard-filter-before-ranking recommendation path; outdoor/water now applies a 40-minute water-resistance hard constraint.
- Routed explicit comparison intent through a valid recommendation state containing the anchor and a water-resistant candidate for Task 4.
- Added `SEND_MESSAGE` to nonterminal conversational views while preserving safety/fatal action removal, hard filtering, evidence/verdict validation, deterministic fallback copy, and current server `allowed_actions` authority.
- With coordinator approval, updated only the Foundation opening oracle from `["UNDERSTAND", "CLARIFY"]` to `["UNDERSTAND"]`. The six case IDs, expected verdicts/products, forbidden tools/products, tool-event requirements, and pass criteria are unchanged.

## RED Evidence

The brief's focused command after adding the approved opening and exact Chinese route tests, before implementation:

```text
uv --directory apps/api run pytest tests/component/test_workflow.py tests/component/test_guide_semantics.py tests/api/test_guide_api.py -q
# 9 failed, 77 passed, 1 warning
```

Failures were the intended missing behaviors: the old opening ended at `CLARIFY`, the oil-skin question immediately ran the full recommendation path, and nonterminal conversational views lacked `SEND_MESSAGE`.

The outdoor/water clarification was independently proven RED before adding its hard-constraint mapping:

```text
uv --directory apps/api run pytest tests/component/test_workflow.py -q
# 1 failed, 28 passed
```

After the true opening implementation, the previously frozen Foundation oracle was deliberately run unchanged:

```text
uv --directory apps/api run pytest tests/component/test_workflow.py tests/component/test_guide_semantics.py tests/api/test_guide_api.py tests/eval/test_foundation_eval.py -q
# 4 failed, 96 passed, 1 warning
```

The runner reported only 1/6 because it still required the obsolete transient `CLARIFY` opening state. The product specification now requires opening to remain in `UNDERSTAND`, so the oracle had to change with the specified behavior; retaining `[UNDERSTAND, CLARIFY]` would reward the behavior Task 3 removes. The authorized update narrows only the opening-state expectation and does not weaken any Foundation case scoring meaning.

## GREEN / Final Verification

Fresh focused and Foundation pytest on the implementation commit:

```text
uv --directory apps/api run pytest tests/component/test_workflow.py tests/component/test_guide_semantics.py tests/api/test_guide_api.py tests/eval/test_foundation_eval.py -q
# 101 passed, 1 warning
```

Fresh Foundation runner:

```text
uv --directory apps/api run python ../../evals/run_foundation.py
# 6 passed / 6 total; pass_rate 1.0
```

Additional full API and static verification:

```text
uv --directory apps/api run pytest tests -q
# 288 passed, 1 warning

uv --directory apps/api run ruff check app tests ../../evals
# All checks passed!

git diff --check
# Passed with no output
```

## Commit

- Implementation commit: `4448685` — `feat: route guide questions progressively`
- Final report commit: the commit containing this report; its exact hash is returned as the final Task 3 HEAD because a commit cannot include its own hash.

## Concerns

- The classifier is intentionally a narrow deterministic Foundation baseline. It does not provide broad natural-language coverage and must not be presented as an LLM.
- The sole test warning is the pre-existing Starlette TestClient/httpx deprecation warning.
- Task 4 still owns recoverable comparison request IDs, comparison idempotency, comparison conversation revision, and continued conversation after `COMPARISON_READY`.

## Independent Review Fix Round 1

### Reviewer findings

1. **Foundation opening oracle false positive:** the runner read trace only after the user turn and truncated to one state, so an extra opening-time `CLARIFY` could pass.
2. **Comparison preparation depended on generic top-three order:** the anchor and a legal water-resistant candidate were not selected explicitly, and an anchor excluded by hard constraints had no honest read-only representation.
3. **Chinese classifier/slot gaps:** common fit and white-cast phrasings, scenario-complete fit questions, water fact questions, negated comparison, and `比一下` were routed incorrectly.

### Fixes and reasons

- The Foundation runner now captures the complete opening state-transition sequence immediately after `open_session()` and before `handle_message()`. There is no truncation; the existing exact `["UNDERSTAND"]` oracle now rejects every extra opening state while leaving all six case IDs and every other scoring rule unchanged.
- Explicit comparison intent now selects the current anchor and the highest-ranked water-resistant candidate from the complete hard-filtered result, independent of generic top-three display order. If the anchor violates current hard constraints, it is appended only as a negative/read-only card with no eligible SKU or recommendation authority. If no legal water-resistant candidate exists, the response uses the real `NO_MATCH` path and clears current recommendation authority.
- Deterministic Chinese routing now recognizes `能用`, `比一下`/`比一比`, `嘛`/question punctuation, white-cast variants, and scenario-complete fit questions. Negated comparison phrases are checked before positive comparison. `防水吗？` returns the current product's structured water-resistance fact without retrieval. This remains a narrow Foundation lexical baseline, not an LLM.

### RED evidence

Opening oracle mutation test before the capture fix:

```text
uv --directory apps/api run pytest tests/eval/test_foundation_eval.py::test_foundation_oracle_rejects_extra_opening_state_transition -q
# 1 failed, 1 warning
```

Explicit comparison preparation before the selection fix:

```text
uv --directory apps/api run pytest tests/component/test_workflow.py -q -k comparison_intent
# 4 failed, 28 deselected
```

Chinese intent/slot matrix before classifier and routing fixes:

```text
uv --directory apps/api run pytest tests/component/test_guide_semantics.py::test_chinese_intent_and_slot_routing_is_progressive_and_revision_safe -q
# 8 failed
```

### GREEN evidence

Focused mutation/behavior cycles:

```text
uv --directory apps/api run pytest tests/eval/test_foundation_eval.py::test_foundation_oracle_rejects_extra_opening_state_transition -q
# 1 passed, 1 warning

uv --directory apps/api run pytest tests/component/test_workflow.py -q -k comparison_intent
# 4 passed, 28 deselected

uv --directory apps/api run pytest tests/component/test_guide_semantics.py::test_chinese_intent_and_slot_routing_is_progressive_and_revision_safe -q
# 8 passed
```

Final fix-round verification:

```text
uv --directory apps/api run pytest tests/component/test_workflow.py tests/component/test_guide_semantics.py tests/api/test_guide_api.py tests/eval/test_foundation_eval.py -q
# 113 passed, 1 warning

uv --directory apps/api run python ../../evals/run_foundation.py
# 6 passed / 6 total; pass_rate 1.0

uv --directory apps/api run pytest tests -q
# 300 passed, 1 warning

uv --directory apps/api run ruff check app tests ../../evals
# All checks passed!

git diff --check
# Passed with no output
```

The fix-round commit is the commit containing this appended section; its exact hash is returned to the coordinator as the new Task 3 HEAD.
