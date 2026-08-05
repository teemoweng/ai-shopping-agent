# Task 2 — Catalog Feed and Product Detail APIs

## Status

Implemented and verified.

## Files

- Modified: `apps/api/app/domain/contracts.py`
- Created: `apps/api/app/services/catalog_service.py`
- Created: `apps/api/app/api/routes/catalog.py`
- Modified: `apps/api/app/dependencies.py`
- Modified: `apps/api/app/main.py`
- Created: `apps/api/tests/api/test_catalog_api.py`
- Modified: `apps/api/tests/contract/test_openapi.py`

## RED / GREEN evidence

RED command:

```sh
uv --directory apps/api run pytest tests/api/test_catalog_api.py tests/contract/test_openapi.py -q
```

Result: `4 failed, 3 passed`. Both catalog routes returned the expected pre-implementation `404 Not Found`; the unknown-product assertion saw framework default `"Not Found"`; the OpenAPI route assertion also failed.

GREEN command:

```sh
uv --directory apps/api run pytest tests/api/test_catalog_api.py tests/contract/test_openapi.py -q
```

Result: `7 passed, 1 warning`. The warning is the existing FastAPI TestClient deprecation warning for Starlette's httpx client.

## Verification

```sh
uv --directory apps/api run ruff check app tests
uv --directory apps/api run pytest -q
git diff --check
```

Result: ruff reported `All checks passed!`; pytest reported `125 passed, 1 warning in 1.47s`; `git diff --check` had no output.

## Commit

`feat: expose feed and product catalog APIs`

## Self-review

- Feed preserves fixture insertion order and maps product summaries only when an anchor product ID exists.
- The normal item is contract-tested with both `anchor_product_id: null` and `anchor_product: null`, preventing a placeholder product from reaching the client.
- PDP uses the lowest in-stock SKU price and exposes the source fact version and observed/expiry timestamps separately as freshness metadata.
- Unknown product IDs map only to the stable requested `{ "detail": { "code": "PRODUCT_NOT_FOUND" } }` response.
- New router is included under the existing `/api/v1` prefix, and both routes are OpenAPI-tested.

## Concerns

- No implementation blocker. The full test run retains a pre-existing TestClient/httpx deprecation warning.
