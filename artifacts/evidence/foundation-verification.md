# Foundation Verification Record

> Source commit: `5f12d79dc00f2c10b4bf0e796df46a41db4adca8`. The table was initialized as `Not run`, then filled only from the clean-source release gate executed on 2026-08-04 UTC.

| Gate | Command | Expected | Observed | Status | Artifact |
|---|---|---|---|---|---|
| Layout | `pnpm check:layout`<br>2026-08-04T23:52:14Z | Exit 0; required paths exist | Exit 0; `Foundation layout is valid` | Pass | [layout verifier](../../scripts/verify-foundation.mjs) |
| API unit/component | `uv --directory apps/api run pytest tests -q`<br>2026-08-04T23:52:33Z | Exit 0; no failed tests | 106 passed; 0 failed; 1 existing upstream Starlette/httpx deprecation warning | Pass | [trace coverage](../../apps/api/tests/component/test_trace_coverage.py) |
| OpenAPI drift | Export OpenAPI at 23:52:40Z → generate TypeScript at 23:52:47Z → `git diff --exit-code` at 23:52:53Z | Exit 0; generated diff empty | All three commands exited 0; generated diff empty | Pass | [OpenAPI](../../packages/contracts/openapi.json) · [TypeScript contract](../../packages/contracts/src/api.ts) |
| Web unit | `pnpm --dir apps/web test`<br>2026-08-04T23:52:58Z | Exit 0; no failed tests | 4 files; 68 passed; 0 failed | Pass | [decision-action tests](../../apps/web/src/test/decision-actions.test.tsx) |
| TypeScript | `pnpm --dir apps/web exec tsc --noEmit`<br>2026-08-04T23:53:14Z | Exit 0 | Exit 0; no diagnostics | Pass | [Web tsconfig](../../apps/web/tsconfig.json) |
| Lint | Ruff at 2026-08-04T23:52:26Z; ESLint at 2026-08-04T23:53:07Z | Exit 0 | Ruff: `All checks passed!`; ESLint: exit 0 | Pass | [API config](../../apps/api/pyproject.toml) · [Web ESLint config](../../apps/web/eslint.config.mjs) |
| Foundation eval | `uv --directory apps/api run python ../../evals/run_foundation.py`<br>2026-08-04T23:53:21Z | 6/6; pass rate 1.0; exit 0 | 6 passed / 6 total; pass rate 1.0; exit 0 | Pass | [six cases](../../evals/cases/foundation-cases.jsonl) · [rule scorer](../../evals/run_foundation.py) |
| Playwright mobile | `pnpm --dir apps/web test:e2e`<br>2026-08-04T23:53:27Z | Mobile golden and zero-match pass | `mobile-chromium`: 2/2 passed | Pass | [journeys](../../apps/web/e2e/guide.spec.ts) · [mobile screenshot](../screenshots/foundation-mobile.png) |
| Playwright desktop | `pnpm --dir apps/web test:e2e`<br>2026-08-04T23:53:27Z | Desktop golden and zero-match pass | `desktop-interview`: 2/2 passed; total matrix 4/4 | Pass | [Playwright config](../../apps/web/playwright.config.ts) |
| Secret scan | Exact Task 15 repository scan<br>2026-08-04T23:59:33Z | `Secret scan clean`; exit 0 | `Secret scan clean`; exit 0 | Pass | [request-boundary tests](../../apps/web/src/test/api-client.test.ts) · [redacted sample](../traces/samples/foundation-golden.jsonl) |
| Synthetic disclosure | Golden journey assertions in the Playwright run at 2026-08-04T23:53:27Z | Concept prototype + synthetic + no-order/payment wording visible | Both projects asserted the terminal receipt and persistent disclosure in viewport; the captured 390×844 PNG was visually inspected | Pass | [mobile screenshot](../screenshots/foundation-mobile.png) |
| Evidence links | Non-empty artifact check<br>2026-08-04T23:54:53Z | Screenshot, redacted trace, manifest and this record exist | All four paths existed and were non-empty | Pass | [manifest](./foundation-run-manifest.json) · [screenshot](../screenshots/foundation-mobile.png) · [trace](../traces/samples/foundation-golden.jsonl) |

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
