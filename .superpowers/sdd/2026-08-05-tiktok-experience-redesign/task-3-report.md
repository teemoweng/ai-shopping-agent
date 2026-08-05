# Task 3 Report — Bilingual Guide Semantics and Snapshots

## Status

Implemented and verified.

## Files

- Modified `apps/api/app/domain/contracts.py`
- Modified `apps/api/app/domain/events.py`
- Modified `apps/api/app/repositories/session_repository.py`
- Modified `apps/api/app/services/guide_service.py`
- Modified `apps/api/app/api/routes/guide.py`
- Modified `apps/api/app/workflow/agent.py`
- Modified `apps/api/app/workflow/filtering.py`
- Modified `apps/api/app/workflow/engine.py`
- Modified `apps/api/tests/component/test_filtering.py`
- Created `apps/api/tests/component/test_guide_semantics.py`
- Modified `apps/api/tests/api/test_guide_api.py`
- Modified `apps/api/tests/contract/test_contracts.py`

## RED / GREEN evidence

### Bilingual parsing

- RED: `uv --directory apps/api run pytest tests/component/test_filtering.py -q`
  returned `17 failed, 6 passed`. The missing Chinese budget, fragrance, water
  resistance, finish, skin type, and white-cast mappings failed while the
  existing `$30` form remained compatible.
- GREEN: the same command returned `23 passed` after the minimal bilingual
  parser implementation.

### Locale and semantic enums

- Initial RED collection exposed the missing `GuideAction` import. The test was
  corrected to defer lookup until execution, then the same contract command
  returned `5 failed, 7 passed` for missing locale/schema support and the three
  missing enums.
- GREEN: `uv --directory apps/api run pytest tests/contract/test_contracts.py -q`
  returned `12 passed`.

### Guide views, safety, revision, and snapshots

- RED: `uv --directory apps/api run pytest tests/component/test_guide_semantics.py tests/api/test_guide_api.py -q`
  returned `19 failed, 5 passed`. Failures identified the absent locale session
  state, semantic response fields, Chinese safety boundary, revision, snapshot
  route, and stable snapshot 404. A frozen test-double assignment and one stale
  fixture product ID were corrected before production implementation.
- GREEN: the same focused pair returned `24 passed, 1 warning` after the minimal
  semantic implementation.
- Snapshot ownership RED: mutating the returned turn also mutated the stored
  response (`1 failed`); GREEN returned `13 passed` after storing and returning
  independent deep copies.
- Complete action-map RED: the explicit per-view action helper was absent
  (`1 failed`); GREEN returned `14 passed` after defining all 11 view mappings
  and routing emitted responses through that map.

## Final verification

```sh
uv --directory apps/api run pytest tests/component/test_filtering.py tests/component/test_guide_semantics.py tests/api/test_guide_api.py tests/component/test_workflow.py -q
uv --directory apps/api run pytest tests/contract/test_contracts.py tests/component/test_session_repository.py tests/component/test_trace_coverage.py tests/api/test_compare_cart_api.py tests/eval/test_foundation_eval.py -q
uv --directory apps/api run pytest -q
uv --directory apps/api run ruff check app tests ../../evals
git diff --check
```

Results:

- Required focused suite: `75 passed, 1 warning`.
- Related legacy/trace/decision/eval regression: `69 passed, 1 warning`.
- Full API suite: `168 passed, 1 warning`.
- Ruff: `All checks passed!`.
- Diff whitespace check: clean.

## Commit

Focused commit message: `feat: add bilingual guide semantics and snapshots`.

## Self-review

- Existing `state` and `kind` remain present, and omitted locale still defaults
  to `en-US` with the prior English output behavior.
- Chinese parsing covers every locked mapping plus the mixed
  `油敏皮、深肤色、预算30美元以内、自然妆效` example. `油敏皮` resolves to the
  safety-relevant `sensitive` ranking preference, and `深肤色` raises the
  white-cast concern.
- All 11 Guide view kinds have one explicit server-side action list. Emitted
  clarification, decision, no-match, insufficient-evidence, and safe-boundary
  responses use that map rather than client inference.
- `guide_revision` starts at the established content context revision and only
  increments when hard constraints or ranking-relevant soft preferences differ.
  Repeated constraints, comparison selection, and SKU selection leave it stable.
- Create/message responses are Pydantic-validated before snapshot storage.
  Stored and returned snapshots are independent deep copies, and the GET route
  returns the latest copy with stable `SESSION_NOT_FOUND` handling.
- Safety trace events contain only the boundary code; tests verify Chinese
  health input and generic `text` fields do not enter trace payloads.
- `degraded` is part of the response contract. Normal deterministic Foundation
  results are verified `DECISION_READY` responses with `degraded=false`; no
  second recovery action is introduced.

## Concerns

- The suite retains the pre-existing FastAPI TestClient/httpx deprecation
  warning.
- Snapshot recovery follows the existing in-process Foundation repository. It
  survives Sheet close/reopen and PDP round-trips, but not an API process
  restart; durable persistence remains outside this task's scope.
