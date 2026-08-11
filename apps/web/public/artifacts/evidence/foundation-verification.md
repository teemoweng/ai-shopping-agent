# Foundation Verification Record

> Source commit: `cd18147f7eb1e309aa6043a1262a28f0c4349b4d`. The release-gate table below was refreshed only from the clean-source run executed on 2026-08-05 UTC. The later TDD section separately labels its pre-source RED provenance.

| Gate | Command | Expected | Observed | Status | Artifact |
|---|---|---|---|---|---|
| Layout | `pnpm check:layout`<br>2026-08-05T00:41:56Z | Exit 0; required paths exist | Exit 0; `Foundation layout is valid` | Pass | [layout verifier](../../scripts/verify-foundation.mjs) |
| API unit/component | `uv --directory apps/api run pytest tests -q`<br>2026-08-05T00:41:56Z | Exit 0; no failed tests | 119 passed; 0 failed; 1 existing upstream Starlette/httpx deprecation warning | Pass | [trace coverage](../../apps/api/tests/component/test_trace_coverage.py) |
| OpenAPI drift | Export OpenAPI at 00:42:27Z → generate TypeScript at 00:42:27Z → `git diff --exit-code` at 00:42:28Z | Exit 0; generated diff empty | All three commands exited 0; generated diff empty | Pass | [OpenAPI](../../packages/contracts/openapi.json) · [TypeScript contract](../../packages/contracts/src/api.ts) |
| Web unit | `pnpm --dir apps/web test`<br>2026-08-05T00:42:28Z | Exit 0; no failed tests | 4 files; 68 passed; 0 failed | Pass | [decision-action tests](../../apps/web/src/test/decision-actions.test.tsx) |
| TypeScript | `pnpm --dir apps/web exec tsc --noEmit`<br>2026-08-05T00:42:33Z | Exit 0 | Exit 0; no diagnostics | Pass | [Web tsconfig](../../apps/web/tsconfig.json) |
| Lint | Ruff at 2026-08-05T00:41:56Z; ESLint at 2026-08-05T00:42:32Z | Exit 0 | Ruff: `All checks passed!`; ESLint: exit 0 | Pass | [API config](../../apps/api/pyproject.toml) · [Web ESLint config](../../apps/web/eslint.config.mjs) |
| Foundation eval | `uv --directory apps/api run python ../../evals/run_foundation.py`<br>2026-08-05T00:42:44Z | 6/6; pass rate 1.0; exit 0 | 6 passed / 6 total; pass rate 1.0; exit 0 | Pass | [six cases](../../evals/cases/foundation-cases.jsonl) · [rule scorer](../../evals/run_foundation.py) |
| Playwright mobile | `pnpm --dir apps/web test:e2e`<br>2026-08-05T00:42:44Z | Mobile golden and zero-match pass | `mobile-chromium`: 2/2 passed | Pass | [journeys](../../apps/web/e2e/guide.spec.ts) · [mobile screenshot](../screenshots/foundation-mobile.png) |
| Playwright desktop | `pnpm --dir apps/web test:e2e`<br>2026-08-05T00:42:44Z | Desktop golden and zero-match pass | `desktop-interview`: 2/2 passed; total matrix 4/4 | Pass | [Playwright config](../../apps/web/playwright.config.ts) |
| Secret scan | Exact Task 15 repository scan<br>2026-08-05T00:43:03Z | `Secret scan clean`; exit 0 | `Secret scan clean`; exit 0 | Pass | [request-boundary tests](../../apps/web/src/test/api-client.test.ts) · [redacted sample](../traces/samples/foundation-golden.jsonl) |
| Synthetic disclosure | Golden journey assertions in the Playwright run at 2026-08-05T00:42:44Z | Concept prototype + synthetic + no-order/payment wording visible | Both projects asserted the terminal receipt and persistent disclosure in viewport; the captured 390×844 PNG remains the visually inspected artifact | Pass | [mobile screenshot](../screenshots/foundation-mobile.png) |
| Artifact immutability | SHA-256 comparison before/after the Playwright run at 2026-08-05T00:42:44Z | Normal E2E must not overwrite committed evidence | Screenshot remained `cc7be098…e676`; golden Trace remained `965bc6c0…76469` | Pass | [mobile screenshot](../screenshots/foundation-mobile.png) · [golden Trace](../traces/samples/foundation-golden.jsonl) |
| Port guards | Listener checks after Playwright<br>2026-08-05T00:43:03Z | No listeners on 3000 or 8000 | Both port guards clean | Pass | [Playwright config](../../apps/web/playwright.config.ts) |
| Evidence links | Non-empty artifact check<br>2026-08-05T00:44:27Z | Screenshot, redacted trace, manifest and this record exist | All four paths existed and were non-empty | Pass | [manifest](./foundation-run-manifest.json) · [screenshot](../screenshots/foundation-mobile.png) · [trace](../traces/samples/foundation-golden.jsonl) |

## Mutation-sensitive Trace evidence

The committed artifact is one golden Trace containing 11 redacted event records, not 11 separate traces. Its canonical validator locks the complete event/state order, all five transition pairs, both Tool call/result pairs, exact argument/result/cart payloads, one trace/session, unique record IDs, ordered timestamps, and recursive privacy rules.

- RED provenance: in an uncommitted test-first worktree based on parent commit `ace95d9af86a4e166521a9a517e9bf2678151c2f`, the old inline checks were first extracted without strengthening them, then the adversarial tests were added. `pytest tests/component/test_trace_coverage.py -q -k 'committed_trace_validator'` produced 12 expected failures, 1 pass, and 6 deselected. The pre-existing record-count check already rejected the extra twelfth record; the other mutations escaped. This RED is developmental evidence and is not claimed to be output from source commit `cd18147…`.
- GREEN: `pytest tests/component/test_trace_coverage.py -q -k 'committed_trace'` produced 14 passed and 5 deselected after hardening.
- Full focused file: `pytest tests/component/test_trace_coverage.py -q` produced 19 passed.
- Explicit in-memory mutations cover swapped opening transitions, eight caller/message identifier key variants, raw user input inside `argument_summary`, a `tool_result` changed to `started`, an extra twelfth record, and a nested confirmation-token value.

## Integrity-binding rationale

The semantic validator deliberately does not read the release manifest. Its job is to reject a malformed or privacy-unsafe committed sample using hand-checked event contracts, without coupling source tests to a documentation artifact that is refreshed only after the clean-source gate.

The release layer supplies the mechanical binding instead: the manifest points to the clean source commit, hashes the hardened Trace test and Playwright journey, hashes the screenshot and one-Trace/11-record sample, and hashes this verification record. The clean evidence-commit integrity check recomputes every listed hash. The manifest does not hash itself, avoiding a self-reference that could never be finalized.

## Exact release commands

```bash
pnpm check:layout
uv --directory apps/api run ruff check app tests ../../evals
uv --directory apps/api run pytest tests -q
uv --directory apps/api run python -m scripts.export_openapi
pnpm --dir packages/contracts generate
git diff --exit-code -- packages/contracts/openapi.json packages/contracts/src/api.ts
pnpm --dir apps/web test
pnpm --dir apps/web lint
pnpm --dir apps/web exec tsc --noEmit
uv --directory apps/api run python ../../evals/run_foundation.py
pnpm --dir apps/web test:e2e
if rg -n --hidden --glob '!**/.git/**' --glob '!**/node_modules/**' "(api[_-]?key|secret|token)[[:space:]]*[:=][[:space:]]*[\"'][^\"']+[\"']" .; then
  echo "Potential committed secret found" >&2
  exit 1
else
  scan_status=$?
  if [ "$scan_status" -eq 1 ]; then
    echo "Secret scan clean"
  else
    exit "$scan_status"
  fi
fi
```

## Scope of this verification

This is a deterministic local Foundation release check over synthetic fixtures. It does not measure real-LLM quality, production latency or cost, user comprehension, conversion lift, fairness, or reliability under production traffic.

The Foundation fixture baseline contains 3 SPUs, 6 SKUs, 1 `ContentContext`, and 3 evidence documents. The evaluation is a six-case rule-scored regression set with no LLM judge. Browser automation covers two journeys in two Chromium viewport projects; it is not a user study or a cross-browser certification.
