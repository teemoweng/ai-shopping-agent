# TikTok Experience Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a runnable, high-fidelity Chinese TikTok Shop-inspired concept demo for the United States K-Beauty sunscreen market, from a shoppable short-video feed through AI-assisted decision support or direct product browsing to an explicitly confirmed simulated add-to-cart receipt.

**Architecture:** Keep the existing deterministic FastAPI + Next.js foundation, but split control into three explicit planes. The browser owns `NavigationState` and media restoration; an optional `GuideSession` owns evidence-grounded recommendations; a standalone `CommerceOperation` owns dynamic facts, confirmation tokens, idempotency, and simulated cart mutation. Catalog/feed and PDP data come from versioned synthetic fixtures. Existing Foundation endpoints remain compatible while the redesigned UI consumes new catalog, enriched Guide, and independent Commerce contracts.

**Tech Stack:** Python 3.12+, FastAPI, Pydantic v2, in-memory repositories with injectable UTC clock, JSON fixtures, OpenAPI, openapi-typescript, Next.js 16 App Router, React 19, TypeScript, CSS, Vitest + Testing Library, Playwright, HTML5 video, ffmpeg, pnpm, uv.

---

## Global Constraints

- Product identity: `TikTok Shop-inspired Concept Prototype`; never claim this UI or AI feature is a current TikTok product.
- Transaction market is the United States; demo UI language is Simplified Chinese; the user-provided iOS screenshots have an unknown market/account/experiment configuration.
- Use no TikTok logo, real creator identity, real product listing, real payment, real order, real inventory, production TikTok API, or real LLM.
- Business products and comments remain synthetic and marked `synthetic: true`; public sunscreen evidence retains authoritative URL and access date.
- Search and LIVE remain future entry points only. Do not add routes, pages, fake execution, or fixtures for them.
- The only side effect is an explicitly confirmed simulated cart mutation. AI components never call cart write endpoints.
- Direct `Feed → PDP → cart` must work without a GuideSession. AI attribution is optional and valid only at its source guide revision.
- Dynamic price, stock, SKU, shipping, promotion, and freshness values render only from structured fixtures/API responses. Missing promotion renders nothing.
- Every user-visible control must either work locally, call an in-scope API, or show the shared Concept Boundary notice. No dead buttons.
- Use two licensed vertical stock videos. Record creator/source/license/transform details and an explicit no-endorsement statement. User screenshots remain research-only.
- Mobile primary viewport is exactly 390×844. Desktop interview viewport is exactly 1440×1000 and uses the same product/API path inside a phone frame.
- Preserve existing accessibility protections: focus trap, Escape, focus return, visible focus, reduced motion, stale-response guards, synchronous duplicate-submit guards, and confirmation-secret non-rendering.
- Use TDD for every behavior: focused failing test → observe intended failure → smallest implementation → focused pass → relevant suite.
- Preserve unrelated user changes. Each engineering task ends in a focused commit on `codex/tiktok-experience-redesign`.

## Locked Public Contract

### NavigationState (browser only)

```ts
type BaseSurface = "feed" | "pdp";
type Overlay = "none" | "ai-sheet" | "cart-confirm" | "receipt";
type PdpEntrySource = "feed" | "ai";
type ProductRole = "current" | "alternative";

interface NavigationState {
  baseSurface: BaseSurface;
  overlay: Overlay;
  feedIndex: number;
  pdpProductId: string | null;
  pdpEntrySource: PdpEntrySource | null;
  productRole: ProductRole | null;
  videoSnapshots: Record<string, { currentTime: number; paused: boolean; muted: boolean }>;
  guideScrollTop: number;
  notice: string | null;
}
```

### New read APIs

- `GET /api/v1/catalog/feed` → `FeedResponse` with exactly one shoppable and one normal fixture.
- `GET /api/v1/catalog/products/{product_id}` → complete `ProductDetailResponse` or stable `PRODUCT_NOT_FOUND`.
- `GET /api/v1/guide/sessions/{session_id}` → latest `GuideTurnResponse` snapshot.

### Guide semantics

- Keep the existing POST session/message/compare paths and legacy `state`/`kind` fields during this migration.
- Add `guide_status`, `guide_view_kind`, `guide_revision`, `facts_snapshot_at`, and `allowed_actions`.
- `GuideAction`: `CONFIRM_CONTEXT`, `ANSWER_CLARIFICATION`, `SKIP_CLARIFICATION`, `UPDATE_CONSTRAINTS`, `RELAX_CONSTRAINT`, `CONTINUE_WITH_KNOWN`, `REQUEST_COMPARISON`, `OPEN_PRODUCT`, `RETRY_GUIDE_OPERATION`, `RETURN_TO_FEED`.
- Default locale stays `en-US` for compatibility; redesigned UI explicitly creates `locale: "zh-CN"` sessions.
- One fixed Foundation clarification at most: daily commute vs 40/80-minute water resistance; skip adds no water-resistance hard constraint.

### Independent Commerce APIs

- `POST /api/v1/commerce/cart/preview` creates a CommerceOperation and rechecks facts.
- `POST /api/v1/commerce/operations/{operation_id}/accept-facts` accepts a structured diff and issues a fresh token.
- `POST /api/v1/commerce/operations/{operation_id}/items` consumes a token with an idempotency key.
- `GET /api/v1/commerce/operations/{operation_id}` returns the current operation/receipt.
- `GET /api/v1/commerce/operations/by-idempotency/{idempotency_key}` reconciles an unknown commit result.
- Existing `/guide/sessions/{session_id}/cart/*` routes remain Foundation compatibility paths and are not used by the redesigned UI.

`CommerceStep`: `PDP_READY`, `CHECKING_FACTS`, `AWAITING_CONFIRMATION`, `FACTS_CHANGED`, `COMMITTING`, `COMMIT_STATUS_UNKNOWN`, `SUCCEEDED`, `FAILED`, `CANCELLED`.

`CommerceAction`: `SELECT_SKU`, `SET_QUANTITY`, `PREVIEW_CART`, `ACCEPT_UPDATED_FACTS`, `CONFIRM_ADD_TO_CART`, `CANCEL_CONFIRMATION`, `RESELECT_SKU`, `RETRY_COMMERCE_OPERATION`, `RETURN_TO_PRODUCT`, `CONTINUE_BROWSING`.

Confirmation tokens expire after five minutes, are single-use, and are bound to `transaction_revision + facts_version + SKU + quantity + price`. Tests use an injected clock. Reusing an idempotency key returns the same receipt without another cart mutation.

## Locked File Map

```text
ai-shopping-agent/
├── apps/api/app/
│   ├── api/routes/{catalog,commerce,guide,cart,health}.py
│   ├── domain/{contracts,events,models}.py
│   ├── repositories/{fixture_repository,session_repository,commerce_repository}.py
│   ├── services/{catalog_service,commerce_service,guide_service,cart_service}.py
│   ├── workflow/{agent,engine,filtering,tools}.py
│   ├── dependencies.py
│   └── main.py
├── apps/api/tests/
│   ├── api/{test_catalog_api,test_commerce_api,test_guide_api,test_compare_cart_api}.py
│   ├── component/{test_fixtures,test_filtering,test_guide_semantics,test_commerce_service}.py
│   └── contract/{test_contracts,test_openapi}.py
├── apps/web/
│   ├── e2e/{guide,tiktok-demo}.spec.ts
│   ├── public/demo/{feed-commerce.mp4,feed-commerce-poster.jpg,feed-normal.mp4,feed-normal-poster.jpg,product-*.svg,ASSET_SOURCES.md}
│   └── src/
│       ├── app/{globals.css,page.tsx}
│       ├── components/{demo-shell,short-video-feed,product-anchor,guide-sheet,recommendation-card,comparison-table,pdp-screen,cart-confirmation-drawer,receipt-drawer,concept-boundary-toast}.tsx
│       ├── lib/{api-client,decision-contracts,demo-navigation,formatters}.ts
│       └── test/{api-client,decision-actions,feed,guide-sheet,navigation,pdp-transaction}.test.tsx
├── data/fixtures/{feed-items,content-contexts,evidence,products}.json
├── packages/contracts/{openapi.json,src/api.ts}
├── artifacts/{evidence/tiktok-redesign-verification.md,screenshots/tiktok-redesign-{mobile,desktop,normal-feed}.png}
├── scripts/verify-foundation.mjs
├── README.md
├── PLAN.md
└── TASKS.md
```

---

## Task 0: Freeze the Product Decision and Start the Work Package

**Files:**
- Existing product spec: `../../AI产品经理/项目实战/AI导购Agent/07-TikTok真实体验重设计规格.md`
- Existing ADR: `../../AI产品经理/项目实战/AI导购Agent/决策/ADR-001-真实TikTok体验与AI入口重设计.md`
- Modify: `TASKS.md`
- Create: this plan

- [x] Incorporate independent product, UI, and state-contract reviews into product spec v0.3.
- [x] Split transaction market, demo language, UI reference snapshot, and concept identity.
- [x] Freeze `NavigationState`, optional `GuideSession`, and independent `CommerceOperation`.
- [x] Mark this work package `IN PROGRESS` with expected evidence in `TASKS.md`.
- [x] Run `git diff --check` in both the workspace repository and the nested engineering repository.
- [x] Commit the engineering plan and task-state change: `git commit -m "docs: plan TikTok experience redesign"`.

---

## Task 1: Extend Synthetic Catalog and Feed Fixtures

**Files:**
- Modify: `apps/api/app/domain/models.py`
- Modify: `apps/api/app/repositories/fixture_repository.py`
- Modify: `data/fixtures/products.json`
- Create: `data/fixtures/feed-items.json`
- Modify: `apps/api/tests/component/test_fixtures.py`

**Interfaces:**

Add frozen Pydantic models:

```python
class MediaAsset(BaseModel):
    kind: Literal["video", "image"]
    src: str
    poster_src: str | None
    alt_zh: str
    license_ref: str

class ShippingProfile(BaseModel):
    market: Literal["US"]
    fee_usd: float
    eta_min_days: int
    eta_max_days: int
    return_summary_zh: str

class FeedItem(BaseModel):
    id: str
    synthetic: Literal[True]
    creator_handle: str
    creator_display_name: str
    caption_zh: str
    media: MediaAsset
    engagement: EngagementSnapshot
    content_context_id: str | None
    anchor_product_id: str | None
    commerce_status: Literal["none", "available", "unavailable"]
```

Extend `Product` with `display_name_zh`, `description_zh`, `media`, `shipping`, `list_price_usd`, `promotion`, `store_name`, `facts_version`, `observed_at`, `expires_at`, and SKU `label`/`image_src`. `promotion` is nullable.

- [ ] Add failing fixture tests asserting exactly two feed items, unique IDs, one `commerce_status=available`, one `none`, and valid optional references.
- [ ] Add failing tests asserting all products have US shipping, versioned facts, and valid media/license references; nullable promotion does not invalidate a product.
- [ ] Run `uv --directory apps/api run pytest tests/component/test_fixtures.py -q` and observe model/loader failures.
- [ ] Implement models and extend `FixtureRepository.load()` with `feed_items` plus reference validation.
- [ ] Add the two feed fixtures and enrich all three existing product fixtures without changing their existing SPU/SKU IDs or core eligibility facts.
- [ ] Keep current current-price values (`$14/$19`, `$17/$24`, `$16/$22`) so Foundation eval expectations do not drift.
- [ ] Rerun focused fixture tests, then `uv --directory apps/api run pytest tests/component/test_fixtures.py tests/eval/test_foundation_eval.py -q`.
- [ ] Commit: `git commit -m "feat: add versioned feed and PDP fixtures"`.

---

## Task 2: Add Catalog Feed and Product Detail APIs

**Files:**
- Modify: `apps/api/app/domain/contracts.py`
- Create: `apps/api/app/services/catalog_service.py`
- Create: `apps/api/app/api/routes/catalog.py`
- Modify: `apps/api/app/dependencies.py`
- Modify: `apps/api/app/main.py`
- Create: `apps/api/tests/api/test_catalog_api.py`
- Modify: `apps/api/tests/contract/test_openapi.py`

**Interfaces:**

`FeedResponse` returns configured `feed_tabs`, `bottom_nav_variant`, and ordered `items`. `ProductDetailResponse` returns the product record, current `starting_price_usd`, freshness, and synthetic disclosure. Product IDs remain kebab-case.

- [ ] Write failing API tests for `GET /api/v1/catalog/feed`, shoppable/normal conditional fields, and `GET /api/v1/catalog/products/seoul-shade-daily-fluid`.
- [ ] Add 404 test asserting `{detail: {code: "PRODUCT_NOT_FOUND"}}` for an unknown product.
- [ ] Add OpenAPI path assertions for both endpoints and run focused tests to observe 404 route failures.
- [ ] Implement `CatalogService`, dependency wiring, router inclusion, and stable error mapping.
- [ ] Ensure the normal Feed item serializes `anchor_product_id=null` and never receives a placeholder product.
- [ ] Run `uv --directory apps/api run pytest tests/api/test_catalog_api.py tests/contract/test_openapi.py -q`.
- [ ] Commit: `git commit -m "feat: expose feed and product catalog APIs"`.

---

## Task 3: Add Bilingual Parsing and Enriched Guide Semantics

**Files:**
- Modify: `apps/api/app/domain/contracts.py`
- Modify: `apps/api/app/domain/events.py`
- Modify: `apps/api/app/repositories/session_repository.py`
- Modify: `apps/api/app/services/guide_service.py`
- Modify: `apps/api/app/api/routes/guide.py`
- Modify: `apps/api/app/workflow/agent.py`
- Modify: `apps/api/app/workflow/filtering.py`
- Modify: `apps/api/app/workflow/engine.py`
- Modify: `apps/api/tests/component/test_filtering.py`
- Create: `apps/api/tests/component/test_guide_semantics.py`
- Modify: `apps/api/tests/api/test_guide_api.py`
- Modify: `apps/api/tests/contract/test_contracts.py`

**Behavior lock:**

- Chinese parser covers `预算30美元以内 / $30以内`, `无香/无香精`, `40/80分钟防水`, `水润/自然/哑光`, `干皮/混合皮/油皮/敏感肌/油敏皮`, and `不泛白/白膜/泛白` while retaining current English phrases.
- Chinese safety covers `诊断/治疗/皮疹/过敏/荨麻疹/肿胀/呼吸困难/药物相互作用`; urgent wording remains distinct.
- `guide_revision` increments only when current context, hard constraints, or ranking-relevant soft preferences change.
- Latest verified Guide response is stored as a snapshot and can be read after closing/reopening the Sheet.

- [ ] Write table-driven failing parser tests for every bilingual mapping and mixed Chinese example `油敏皮、深肤色、预算30美元以内、自然妆效`.
- [ ] Write failing contract tests for complete `GuideAction`, `GuideStatus`, and `GuideViewKind` enum values.
- [ ] Write failing API tests for `locale="zh-CN"`, one fixed clarification with a skip option, a Chinese recommendation, `NO_MATCH`, `INSUFFICIENT_EVIDENCE`, and `SAFE_BOUNDARY` with no product actions.
- [ ] Write failing revision tests: identical repeated constraints do not increment; changed preference does; comparison selection and SKU selection do not mutate Guide revision.
- [ ] Write failing snapshot test for `GET /api/v1/guide/sessions/{session_id}` and stable `SESSION_NOT_FOUND`.
- [ ] Implement bilingual parser/safety/output helpers and the enriched response fields while preserving legacy `state` and `kind` for existing consumers.
- [ ] Store the latest response snapshot after create/message; do not store raw medical/health input in trace payloads.
- [ ] Make `allowed_actions` an explicit server list for every Guide view; generated/fallback content that passes deterministic verification returns `DECISION_READY` with `degraded=true` instead of a second recovery click.
- [ ] Run `uv --directory apps/api run pytest tests/component/test_filtering.py tests/component/test_guide_semantics.py tests/api/test_guide_api.py tests/component/test_workflow.py -q`.
- [ ] Commit: `git commit -m "feat: add bilingual guide semantics and snapshots"`.

---

## Task 4: Implement Independent CommerceOperation and Recovery

**Files:**
- Modify: `apps/api/app/domain/contracts.py`
- Modify: `apps/api/app/domain/events.py`
- Create: `apps/api/app/repositories/commerce_repository.py`
- Create: `apps/api/app/services/commerce_service.py`
- Create: `apps/api/app/api/routes/commerce.py`
- Modify: `apps/api/app/dependencies.py`
- Modify: `apps/api/app/main.py`
- Create: `apps/api/tests/component/test_commerce_service.py`
- Create: `apps/api/tests/api/test_commerce_api.py`
- Modify: `apps/api/tests/contract/test_contracts.py`
- Modify: `apps/api/tests/contract/test_openapi.py`

**Request lock:**

```python
class CommercePreviewRequest(BaseModel):
    purchase_origin: Literal["FEED", "AI"]
    guide_session_id: str | None = None
    source_guide_revision: int | None = None
    product_id: str
    sku_id: str
    quantity: Annotated[int, Field(ge=1, le=5)] = 1
    previous_operation_id: str | None = None
    expected_transaction_revision: Annotated[int, Field(ge=0)] = 0
    demo_scenario: Literal["NORMAL", "PRICE_CHANGED", "OUT_OF_STOCK"] = "NORMAL"

class CommerceAddRequest(BaseModel):
    confirmation_token: str
    idempotency_key: str
    expected_transaction_revision: int
    demo_scenario: Literal["NORMAL", "COMMIT_STATUS_UNKNOWN"] = "NORMAL"
```

`demo_scenario` is a disclosed deterministic test/demo control, never presented as a production API feature. The desktop interview layer may link to scenario URLs; the phone UI only shows the resulting business state.

`previous_operation_id` is forbidden on an initial preview and required on every follow-up preview whose `expected_transaction_revision > 0`. This exact operation-chain compare-and-swap prevents one purchase attempt from advancing an unrelated attempt that happens to have the same revision number.

- [ ] Write failing contract tests for purchase-origin cross-field validation: FEED forbids Guide provenance; AI requires both Guide session and source revision.
- [ ] Write failing service tests with an injectable `Clock` for a direct Feed preview, valid AI provenance, stale Guide revision, five-minute expiry, single-use token, and SKU/product mismatch.
- [ ] Write failing tests for the invalidation matrix: quantity/SKU creates a new transaction revision but leaves Guide revision unchanged; changed facts invalidates the old token.
- [ ] Write failing API tests for `FACTS_CHANGED` structured diff, accept-new-facts → fresh token, and out-of-stock → `RESELECT_SKU`.
- [ ] Write failing idempotency tests: same key returns the same receipt; different key after token consumption is rejected; inventory/cart count changes once.
- [ ] Write failing unknown-result test: simulated network uncertainty stores the final result, returns/represents `COMMIT_STATUS_UNKNOWN`, and reconciliation by idempotency key resolves to the single success receipt.
- [ ] Implement a thread-safe in-memory `CommerceRepository`, operation records, token records, receipts, and injectable clock dependency.
- [ ] Implement `CommerceService.preview()`, `accept_facts()`, `add_item()`, `get_operation()`, and `get_by_idempotency_key()`; recheck current structured facts at both preview and commit.
- [ ] Return server-controlled `commerce_view_kind`, `operation_status`, revision, facts version, allowed actions, stable error codes, and no confirmation secret in post-success payloads.
- [ ] Leave the existing Foundation `CartService` and `/guide/.../cart/*` compatibility behavior passing.
- [ ] Run `uv --directory apps/api run pytest tests/component/test_commerce_service.py tests/api/test_commerce_api.py tests/api/test_compare_cart_api.py -q`.
- [ ] Commit: `git commit -m "feat: add independent commerce operation workflow"`.

---

## Task 5: Regenerate OpenAPI and Build Strict Web Clients

**Files:**
- Generate: `packages/contracts/openapi.json`
- Generate: `packages/contracts/src/api.ts`
- Modify: `apps/web/src/lib/api-client.ts`
- Modify: `apps/web/src/lib/decision-contracts.ts`
- Modify: `apps/web/src/test/api-client.test.ts`
- Modify: `apps/web/src/test/decision-actions.test.tsx`

**Client functions:**

```ts
getFeed(): Promise<FeedResponse>
getProduct(productId: string): Promise<ProductDetailResponse>
createGuideSession(contentContextId: string, locale: "zh-CN" | "en-US"): Promise<GuideTurnResponse>
getGuideSession(sessionId: string): Promise<GuideTurnResponse>
sendGuideMessage(...): Promise<GuideTurnResponse>
compareProducts(...): Promise<CompareResponse>
previewCommerce(request: CommercePreviewRequest): Promise<CommerceOperationResponse>
acceptUpdatedFacts(operationId: string, expectedRevision: number): Promise<CommerceOperationResponse>
confirmCommerce(operationId: string, request: CommerceAddRequest): Promise<CommerceOperationResponse>
getCommerceOperation(operationId: string): Promise<CommerceOperationResponse>
reconcileCommerce(idempotencyKey: string): Promise<CommerceOperationResponse>
```

- [ ] Add failing client tests for the exact HTTP method/path/body of all new functions and for stable structured error-code preservation.
- [ ] Add failing semantic-guard tests that reject unknown Guide/Commerce actions, illegal `view_kind × allowed_actions`, missing dynamic facts, and success payloads containing a confirmation token.
- [ ] Export OpenAPI: `uv --directory apps/api run python -m scripts.export_openapi`.
- [ ] Generate TypeScript: `pnpm --dir packages/contracts generate`.
- [ ] Implement typed clients and semantic guards. UI code may only render business buttons from the validated action set.
- [ ] Run `pnpm --dir apps/web test -- src/test/api-client.test.ts src/test/decision-actions.test.tsx`.
- [ ] Run `pnpm --dir packages/contracts check` and ensure it exits 0 with no contract diff.
- [ ] Commit: `git commit -m "feat: expose redesigned API contracts to web"`.

---

## Task 6: Acquire, Transform, and Document Licensed Demo Media

**Files:**
- Create: `apps/web/public/demo/feed-commerce.mp4`
- Create: `apps/web/public/demo/feed-commerce-poster.jpg`
- Create: `apps/web/public/demo/feed-normal.mp4`
- Create: `apps/web/public/demo/feed-normal-poster.jpg`
- Create: `apps/web/public/demo/product-seoul-shade.svg`
- Create: `apps/web/public/demo/product-cloud-veil.svg`
- Create: `apps/web/public/demo/product-jeju-sport.svg`
- Create: `apps/web/public/demo/ASSET_SOURCES.md`
- Modify: `scripts/verify-foundation.mjs`

**Source lock:**

- Commerce sunscreen video: Pexels video 7467138, Anna Tarazevich, source page `https://www.pexels.com/video/a-woman-applying-sunscreen-on-her-face-7467138/`.
- Normal fashion/lifestyle video: Pexels video 5901087, Leeloo The First, source page `https://www.pexels.com/video/woman-modelling-in-the-street-5901087/`.
- License: Pexels License, `https://www.pexels.com/license/`, captured 2026-08-05. Usage does not imply creator endorsement.

- [ ] Resolve each source page to the original MP4 using the official Pexels download redirect; do not scrape unrelated media.
- [ ] Download originals to a `mktemp -d` directory, never into the repository.
- [ ] Use ffmpeg to produce silent, fast-start, 720×1280, H.264, approximately 8-second clips and matching first-frame JPEG posters. Preserve aspect ratio with crop/scale; do not stretch.
- [ ] Verify each file with `ffprobe`: H.264 video, 720×1280, duration 7–9 seconds, no audio stream, browser-readable pixel format.
- [ ] Draw three original synthetic pack-shot SVGs using neutral geometric shapes and the fictional brand/product names; do not imitate a real package.
- [ ] Document source page, creator, license URL, acquisition date, transforms, local filenames, synthetic SVG authorship, and no-endorsement statement in `ASSET_SOURCES.md`.
- [ ] Extend `scripts/verify-foundation.mjs` to require all eight media/source files and reject a video larger than 8 MB.
- [ ] Run `pnpm check:layout` and `git diff --check`.
- [ ] Commit: `git commit -m "assets: add licensed vertical demo media"`.

---

## Task 7: Build Navigation Reducer and Chinese Feed Shell

**Files:**
- Create: `apps/web/src/lib/demo-navigation.ts`
- Create: `apps/web/src/components/demo-shell.tsx`
- Rewrite: `apps/web/src/components/short-video-feed.tsx`
- Rewrite: `apps/web/src/components/product-anchor.tsx`
- Create: `apps/web/src/components/concept-boundary-toast.tsx`
- Modify: `apps/web/src/app/page.tsx`
- Modify: `apps/web/src/app/globals.css`
- Create: `apps/web/src/test/navigation.test.tsx`
- Modify: `apps/web/src/test/feed.test.tsx`

**Reducer events:**

`SET_FEED_INDEX`, `OPEN_GUIDE`, `CLOSE_GUIDE`, `OPEN_PDP`, `CLOSE_PDP`, `OPEN_CART_CONFIRM`, `SHOW_FACTS_CHANGED`, `SHOW_RECEIPT`, `CLOSE_OVERLAY`, `SAVE_GUIDE_SCROLL`, `SAVE_VIDEO_SNAPSHOT`, `SHOW_NOTICE`, `CLEAR_NOTICE`.

- [ ] Write failing reducer tests for all legal transitions, especially Feed direct PDP return, AI current/alternative PDP return, and receipt → PDP/Feed.
- [ ] Write failing media-state tests: opening AI records currentTime/paused/muted and pauses; closing restores within 0.25 seconds and returns to prior play/mute state; a rejected `video.play()` does not crash.
- [ ] Write failing Feed tests for exactly one normal item without commerce/AI, one shoppable item with two distinct 44px hit areas, product click → PDP, and Ask AI click → Sheet.
- [ ] Write failing control tests: like/save toggle locally; comments open a read-only synthetic drawer; sound toggles muted; share uses Web Share or clipboard fallback; follow/search/bottom-nav show the shared notice.
- [ ] Implement `DemoShell` data loading/error boundary and reducer. The shoppable fixture is the initial demo item; normal content remains one vertical swipe/scroll away.
- [ ] Implement a full-height scroll-snap Feed with real `<video playsInline muted loop>` elements, Chinese configurable navigation, one shared right rail, optional text slots, gradients, and conditional product anchor.
- [ ] Keep the product anchor one line, truncate the English product name, render price only when fresh, and make `问 AI` a secondary text action rather than a second saturated pill.
- [ ] On media error, show the same-source poster and a nonblocking notice while keeping Product/AI interactions usable.
- [ ] Run `pnpm --dir apps/web test -- src/test/navigation.test.tsx src/test/feed.test.tsx`.
- [ ] Commit: `git commit -m "feat: build Chinese shoppable video feed shell"`.

---

## Task 8: Rebuild the AI Commerce Sheet as Decision Support Only

**Files:**
- Rewrite: `apps/web/src/components/guide-sheet.tsx`
- Modify: `apps/web/src/components/recommendation-card.tsx`
- Modify: `apps/web/src/components/comparison-table.tsx`
- Modify: `apps/web/src/components/demo-shell.tsx`
- Rewrite: `apps/web/src/test/guide-sheet.test.tsx`
- Modify: `apps/web/src/test/decision-actions.test.tsx`

**View lock:**

- Opening screen: current content mini-card + `这款适合我吗？`, `视频里的说法可信吗？`, `帮我找更合适的替代` + Chinese free input.
- `WAITING_CLARIFICATION`: one question, four choices including skip.
- `DECISION_READY`: one verdict, up to three fit reasons, tradeoffs, up to three candidates, claim-scoped evidence disclosures.
- `COMPARISON_READY`: comparison replaces candidate list.
- `NO_MATCH`, `INSUFFICIENT_EVIDENCE`, `SAFE_BOUNDARY`, `RECOVERY_REQUIRED`, `FATAL_ERROR`: each gets a visible, nonempty state and only server-authorized actions.
- No SKU selector, cart preview, confirmation, or cart write exists in this component.

- [ ] Write failing opening-state tests for inherited creator/product context, all three quick prompts, Chinese concept disclosure, and absence of cart controls.
- [ ] Write failing tests for the fixed clarification, skip, free Chinese text, progress feedback, duplicate-submit block, and stale response after close/reopen.
- [ ] Write failing structured-view tests for all Guide view kinds and exact action authorization.
- [ ] Write failing recommendation tests: evidence status remains four-way, synthetic evidence is labeled, source links are safe, max three candidates, and `查看商品` calls `onOpenProduct(productId, role)`.
- [ ] Write failing lifecycle tests: focus trap, Escape, focus return, body scroll lock, snapshot reuse, scrollTop restore within 2px, and PDP→AI return without another session creation.
- [ ] Implement the 70% mobile Sheet with a decorative handle, close button, context header, progressive states, and request-version guards. Do not implement or claim swipe-to-close.
- [ ] Preserve the last verified response during retryable errors. Never render hidden chain-of-thought or unverified prices/stock.
- [ ] Run `pnpm --dir apps/web test -- src/test/guide-sheet.test.tsx src/test/decision-actions.test.tsx`.
- [ ] Commit: `git commit -m "feat: rebuild AI commerce decision sheet"`.

---

## Task 9: Build PDP, Fact Recheck, Confirmation, and Receipt

**Files:**
- Create: `apps/web/src/components/pdp-screen.tsx`
- Create: `apps/web/src/components/cart-confirmation-drawer.tsx`
- Create: `apps/web/src/components/receipt-drawer.tsx`
- Modify: `apps/web/src/components/demo-shell.tsx`
- Replace or remove from runtime: `apps/web/src/components/cart-confirmation.tsx`
- Create: `apps/web/src/test/pdp-transaction.test.tsx`

**PDP lock:**

- Full-screen inside the phone viewport with close/search/share/cart/more shell controls, product media, English original name + Chinese explanation, structured current/list price, stock, shipping, return summary, SKU selection, quantity, and sticky footer.
- AI provenance strip appears only when `entrySource="ai"` and a matching live Guide snapshot/revision exists.
- Store/chat/cart shell controls show the shared Concept Boundary notice; no fake page.
- Only executable primary CTA is `模拟加入购物车`.

- [ ] Write failing direct-flow test: product loads from catalog, no AI strip, SKU/quantity can change, preview uses `purchase_origin=FEED` without Guide fields.
- [ ] Write failing AI-flow test: valid Guide provenance strip is visible, recommended/current product role is preserved, and close returns to AI with prior scroll.
- [ ] Write failing invalid-provenance test: stale Guide revision hides/marks attribution and never claims the purchase was AI recommended.
- [ ] Write failing confirmation tests for dynamic fact snapshot, explicit confirmation, cancel, duplicate click, token secrecy, and success receipt/cart badge.
- [ ] Write failing `FACTS_CHANGED` test showing old/new price or stock diff, disabling old confirmation, accepting updated facts, and requiring a new token.
- [ ] Write failing out-of-stock test returning to SKU selection without a purchase action.
- [ ] Write failing `COMMIT_STATUS_UNKNOWN` test that disables blind resubmission, calls reconciliation, and reconstructs the single receipt.
- [ ] Implement PDP and overlays with focus management, Escape rules, request-version guards, idempotency key generation, and exact server action gating.
- [ ] Ensure success UI says `模拟加购成功` and `未创建订单或支付`; offer only `返回商品` and `继续浏览`.
- [ ] Run `pnpm --dir apps/web test -- src/test/pdp-transaction.test.tsx src/test/navigation.test.tsx`.
- [ ] Commit: `git commit -m "feat: add PDP and resilient simulated cart flow"`.

---

## Task 10: Finish the Visual System and Responsive Interview Frame

**Files:**
- Modify: `apps/web/src/app/globals.css`
- Modify: `apps/web/src/components/demo-shell.tsx`
- Modify: `apps/web/src/components/short-video-feed.tsx`
- Modify: `apps/web/src/components/guide-sheet.tsx`
- Modify: `apps/web/src/components/pdp-screen.tsx`
- Modify: `apps/web/src/app/layout.tsx`

- [ ] Add 390×844 safe-area layout, full-bleed video, Chinese system typography, white icon contrast, text shadow, gradient scrims, black bottom nav, and `prefers-reduced-motion` behavior.
- [ ] Add 1440×1000 interview frame with the same live phone product plus an outside-only panel showing: concept identity, current demo step, deterministic-vs-future maturity, and disclosed scenario links. Do not add another app or dashboard.
- [ ] Keep all product paths and API calls identical across mobile and desktop.
- [ ] Add long Chinese creator copy, long English product name, 200% text zoom, keyboard-only, and narrow safe-area checks to component/E2E coverage.
- [ ] Run `pnpm --dir apps/web lint` and `pnpm --dir apps/web build`.
- [ ] Commit: `git commit -m "style: finish responsive TikTok-inspired demo"`.

---

## Task 11: End-to-End QA, Evidence, and Product Documentation

**Files:**
- Keep/update: `apps/web/e2e/guide.spec.ts` for legacy Foundation path
- Create: `apps/web/e2e/tiktok-demo.spec.ts`
- Create: `artifacts/evidence/tiktok-redesign-verification.md`
- Create: `artifacts/screenshots/tiktok-redesign-mobile.png`
- Create: `artifacts/screenshots/tiktok-redesign-desktop.png`
- Create: `artifacts/screenshots/tiktok-redesign-normal-feed.png`
- Modify: `README.md`
- Modify: `PLAN.md`
- Modify: `TASKS.md`
- Modify product log: `../../AI产品经理/项目实战/AI导购Agent/log.md`
- Modify product ADR/spec maturity only after evidence exists
- Update relevant product evidence/index documents discovered from the project AGENTS instructions

**Required E2E journeys:**

1. Shoppable Feed → direct PDP → select SKU → preview → explicit simulated add → receipt.
2. Shoppable Feed → Ask AI → Chinese clarification/decision → alternative PDP → return AI with state → close Feed.
3. AI decision → recommended PDP → simulated add → receipt.
4. Normal Feed contains no product anchor and no Ask AI.
5. Zero match has no cart action and can recover after changing one constraint.
6. Safety boundary has no comparison/product/cart business actions.
7. Price changed → structured diff → accept → new token → success.
8. Commit status unknown → reconcile → one success receipt.

- [ ] Write the failing E2E journeys and add stable role/name/test-id selectors only where semantic roles are insufficient.
- [ ] Run mobile and desktop projects; capture the three named screenshots from real Chromium, not component mocks.
- [ ] Inspect screenshots visually for video fit, obscured controls, anchor density, Sheet height, PDP hierarchy, safe area, Chinese copy, and desktop framing. Fix defects before claiming completion.
- [ ] Run the complete backend suite: `uv --directory apps/api run pytest -q`.
- [ ] Run the complete frontend suite: `pnpm test:web`.
- [ ] Run contract drift check: `pnpm --dir packages/contracts check`.
- [ ] Run static checks: `pnpm check:layout && pnpm lint:web && pnpm --dir apps/web build`.
- [ ] Run full E2E: `CAPTURE_TIKTOK_REDESIGN_EVIDENCE=1 pnpm test:e2e`.
- [ ] Run Foundation evaluation: `uv --directory apps/api run pytest tests/eval/test_foundation_eval.py -q` and `uv --directory apps/api run python ../../evals/run_foundation.py` if the existing runner contract still requires it.
- [ ] Record exact commands, pass counts, screenshots, fixture counts, known limitations, and evidence maturity in `tiktok-redesign-verification.md`.
- [ ] Update README start commands and demo path; update PLAN/TASKS truthfully; append a PM-oriented log entry covering product choices, Agent/Workflow split, evaluation design, failures, and tradeoffs.
- [ ] Upgrade ADR/spec from `已设计` to `已实现` only if every required command passes and screenshots exist. Do not mark real-user discovery or business impact as validated.
- [ ] Run `git status --short`, `git diff --check`, and inspect the final diff for secrets, real user screenshot copies, oversized unlicensed assets, placeholders, and scope creep.
- [ ] Use `superpowers:requesting-code-review`, address actionable findings, rerun all impacted checks, then use `superpowers:verification-before-completion`.
- [ ] Commit: `git commit -m "docs: verify TikTok experience redesign demo"`.

---

## Final Completion Gate

Do not tell the user the Demo is runnable until all statements below are evidenced:

- `pnpm --dir apps/web dev` and `uv --directory apps/api run uvicorn app.main:app` start successfully with documented environment variables.
- Both direct and AI-assisted journeys end in one simulated cart receipt.
- Normal Feed never renders commerce/AI controls.
- Every Guide/Commerce error state has a visible recovery or exit; no blank Sheet/drawer exists.
- Old Guide/cart Foundation API tests and frozen evaluation still pass.
- Generated OpenAPI and TypeScript contracts have no drift.
- Videos have recorded licenses and meet file/dimension/codec limits.
- 390×844 and 1440×1000 Chromium screenshots exist and were visually inspected.
- Product documentation distinguishes implemented deterministic behavior, future Agent/LLM capabilities, and unvalidated user/business hypotheses.
