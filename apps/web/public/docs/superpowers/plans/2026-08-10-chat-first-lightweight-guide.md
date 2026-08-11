# Chat-first Lightweight Guide Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the report-like AI Commerce Sheet with a recoverable, compact conversation that progressively reveals one answer, one recommendation, or one comparison while preserving every Guide and Commerce safety boundary.

**Architecture:** Keep `NavigationState`, `GuideSession`, and `CommerceOperation` as separate authority planes. Add a bounded server-side transcript and a `conversation_revision` that is independent from commerce-facing `guide_revision`; render that transcript through a pure `GuideChatView`, while `GuideSheet` remains the controller for API calls, conflict reconciliation, focus, scroll, and PDP provenance.

**Tech Stack:** FastAPI, Pydantic v2, in-memory transactional repository, generated OpenAPI TypeScript contracts, Next.js 16, React 19, TypeScript, CSS, Vitest/Testing Library, Playwright Chromium, pytest.

## Global Constraints

- Mobile opening target is 40%–44% of a 390×844 viewport; comparison target is 72%–74%.
- Opening copy is `我看到你在看 Seoul Shade。你最想确认什么？` with exactly `适合油皮吗？`, `会不会泛白？`, and `和防水款比比`.
- Keep video context visible; do not introduce a full-screen assistant or automatic input focus.
- One assistant turn asks at most one clarifying question.
- `conversation_revision` changes for accepted conversation actions; `guide_revision` changes only for semantic preference, constraint, or recommendation-authority changes.
- Transcript is presentation history only. Current top-level `allowed_actions`, `guide_revision`, and verified recommendation state remain the only business authority.
- AI never writes the cart. PDP and Commerce Workflow still re-read SKU, price, stock, revision, token, and idempotency facts.
- Trace and committed artifacts must not contain raw user messages, client message IDs, confirmation tokens, idempotency keys, hidden reasoning, or raw health descriptions.
- At most 12 user turns per in-memory session; API process restart persistence is explicitly out of scope.
- Preserve all eight existing product/commerce journeys and their network/revision/idempotency assertions.
- Do not add a real LLM, vector store, search UI, TikTok API, payment, user study, or business-effect claim.

---

## File Structure

### New files

- `apps/api/app/services/guide_conversation.py`: request hashing, transcript construction, safe redaction, bounded-turn checks, and response attachment.
- `apps/web/src/components/guide-chat-view.tsx`: pure context/message/composer/inline-result presentation.
- `apps/web/src/test/guide-chat-view.test.tsx`: presentation and accessibility TDD.
- `apps/web/e2e/chat-first.spec.ts`: lightweight opening, progressive disclosure, recovery, responsive, and accessibility journeys.
- `artifacts/evidence/chat-first-verification.md`: human-readable release evidence.
- `artifacts/evidence/chat-first-run-manifest.json`: machine-readable source/config/test/screenshot hashes.
- `artifacts/screenshots/chat-first-opening-mobile.png`: compact opening evidence.
- `artifacts/screenshots/chat-first-decision-mobile.png`: progressively disclosed decision evidence.
- `artifacts/screenshots/chat-first-desktop.png`: same phone path inside desktop interview mode.
- `../../AI产品经理/项目实战/AI导购Agent/决策/ADR-002-Chat-first轻量导购与渐进披露.md`: product decision and trade-off.

### Primary modified files

- `apps/api/app/domain/contracts.py`: transcript enums/models, `ANSWER_READY`, `SEND_MESSAGE`, conversation revisions, message/compare request fields.
- `apps/api/app/domain/events.py`: transcript and processed-request state in `GuideSession`.
- `apps/api/app/repositories/session_repository.py`: transactional snapshot/restore of new session fields.
- `apps/api/app/services/guide_service.py`: opening creation, message idempotency, stale-revision rejection, transcript commit.
- `apps/api/app/services/cart_service.py`: comparison idempotency, transcript append, comparison no longer terminal.
- `apps/api/app/workflow/agent.py`: allowed actions, intent classification, concise Chinese copy.
- `apps/api/app/workflow/engine.py`: opening, short answer, one-question clarification, and recommendation routing.
- `apps/api/tests/api/test_guide_api.py`, `apps/api/tests/api/test_compare_cart_api.py`: HTTP contract and recovery.
- `apps/api/tests/component/test_guide_semantics.py`, `test_session_repository.py`, `test_workflow.py`, `test_commerce_service.py`, `test_trace_coverage.py`: reliability, commerce authority, and privacy.
- `packages/contracts/openapi.json`, `packages/contracts/src/api.ts`: generated contract outputs.
- `apps/web/src/lib/api-client.ts`, `apps/web/src/lib/decision-contracts.ts`: conversation request/response parsing.
- `apps/web/src/components/guide-sheet.tsx`: controller integration and compact/expanded mode.
- `apps/web/src/components/recommendation-card.tsx`, `comparison-table.tsx`: compact inline result modes.
- `apps/web/src/components/demo-shell.tsx`: `问问这款` copy and secondary desktop explanation.
- `apps/web/src/app/globals.css`: lightweight Sheet and message styles.
- `apps/web/src/test/guide-sheet.test.tsx`, `decision-actions.test.tsx`, `responsive-frame.test.tsx`: controller and layout regression.
- `apps/web/e2e/guide.spec.ts`, `tiktok-demo.spec.ts`, `tiktok-responsive.spec.ts`, `pdp-focus.spec.ts`: selector migration without weaker business assertions.
- `apps/web/playwright.config.ts`: separate `CAPTURE_CHAT_FIRST_EVIDENCE` production capture gate.
- `README.md`, `PLAN.md`, `TASKS.md`: verified engineering state and commands.
- `../../AI产品经理/项目实战/AI导购Agent/00-项目总控.md`, `06-面试问题与证据索引.md`, `07-TikTok真实体验重设计规格.md`, `log.md`: product rationale, maturity, and evidence pointers.

---

### Task 1: Version the Conversation Contract

**Files:**
- Modify: `apps/api/app/domain/contracts.py`
- Modify: `apps/api/app/domain/events.py`
- Modify: `apps/api/tests/api/test_guide_api.py`
- Modify: `apps/api/tests/component/test_session_repository.py`
- Modify: `apps/api/tests/component/test_guide_semantics.py`
- Modify: `apps/api/tests/component/test_trace_coverage.py`
- Regenerate: `packages/contracts/openapi.json`
- Regenerate: `packages/contracts/src/api.ts`

**Interfaces:**
- Produces: `GuideTranscriptRole`, `GuideTranscriptKind`, `GuideTranscriptMessage`, `conversation_revision`, `transcript`, `GuideAction.SEND_MESSAGE`, `GuideViewKind.ANSWER_READY`.
- Produces: `GuideMessageRequest.expected_conversation_revision: int | None` and `CompareRequest.request_id / expected_conversation_revision`.
- Consumed by: Tasks 2–7.

- [ ] **Step 1: Add failing schema tests**

Add tests that construct a response with one opening message and reject an invalid user message carrying recommendation attachments:

```python
opening = GuideTranscriptMessage(
    id="gmsg_1",
    sequence=1,
    role=GuideTranscriptRole.ASSISTANT,
    kind=GuideTranscriptKind.OPENING,
    text="我看到你在看 Seoul Shade。你最想确认什么？",
    quick_replies=["适合油皮吗？", "会不会泛白？", "和防水款比比"],
)
assert opening.sequence == 1
with pytest.raises(ValidationError):
    GuideTranscriptMessage(
        id="gmsg_bad",
        sequence=2,
        role="USER",
        kind="USER_TEXT",
        text="适合油皮吗？",
        recommendations=[valid_recommendation],
    )
```

Assert `GuideTurnResponse` accepts `conversation_revision=1`, strictly increasing transcript sequences, unique transcript IDs, and a transcript whose last assistant message matches the current view kind.

- [ ] **Step 2: Run the focused contract tests and verify failure**

Run:

```bash
uv --directory apps/api run pytest tests/api/test_guide_api.py tests/component/test_session_repository.py tests/component/test_guide_semantics.py -q
```

Expected: FAIL because transcript types, `SEND_MESSAGE`, `ANSWER_READY`, and request revision fields do not exist.

- [ ] **Step 3: Implement additive Pydantic types**

Add the exact public enums and fields:

```python
class GuideTranscriptRole(StrEnum):
    USER = "USER"
    ASSISTANT = "ASSISTANT"

class GuideTranscriptKind(StrEnum):
    OPENING = "OPENING"
    USER_TEXT = "USER_TEXT"
    QUESTION = "QUESTION"
    ANSWER = "ANSWER"
    RECOMMENDATION = "RECOMMENDATION"
    COMPARISON = "COMPARISON"
    NO_MATCH = "NO_MATCH"
    SAFETY = "SAFETY"
    RECOVERY = "RECOVERY"
```

Define `GuideTranscriptMessage` with `id`, positive `sequence`, `role`, `kind`, nonblank `text`, `created_at`, `redacted`, `quick_replies`, `verdict`, `recommendations`, `evidence`, and `comparison`. Validate role/attachment compatibility and comparison attachment shape.

Add to `GuideTurnResponse`:

```python
conversation_revision: Annotated[int, Field(ge=1)] = 1
transcript: list[GuideTranscriptMessage] = Field(default_factory=list)
```

Add `GuideAction.SEND_MESSAGE`, `GuideViewKind.ANSWER_READY`, and response kind `answer`. Add optional expected revision/request ID fields without breaking existing callers.

- [ ] **Step 4: Extend `GuideSession` with conversation state**

Add:

```python
conversation_revision: int = Field(default=1, ge=1)
transcript: list[GuideTranscriptMessage] = Field(default_factory=list)
processed_guide_requests: dict[str, ProcessedGuideRequest] = Field(default_factory=dict)
```

Define `ProcessedGuideRequest` with `request_kind: Literal["MESSAGE", "COMPARE"]`, `payload_digest`, `result_conversation_revision`, and optional `comparison` for idempotent compare replay. Keep the repository deep-copy rollback path generic so the new fields are included automatically.

- [ ] **Step 5: Prove trace privacy still rejects message content and IDs**

Extend the forbidden-key/property tests so committed trace payloads containing `raw_message`, `message_text`, `client_message_id`, or `conversation_transcript` are rejected. Do not add transcript values to trace events.

- [ ] **Step 6: Export and regenerate contracts**

Run:

```bash
uv --directory apps/api run python -m scripts.export_openapi
pnpm --dir packages/contracts generate
pnpm --dir packages/contracts check
```

Expected: generated OpenAPI and TypeScript include all new fields and enums; contract check passes.

- [ ] **Step 7: Run focused tests**

Run the command from Step 2 plus:

```bash
uv --directory apps/api run pytest tests/component/test_trace_coverage.py -q
```

Expected: PASS.

- [ ] **Step 8: Commit Task 1**

```bash
git add apps/api/app/domain/contracts.py apps/api/app/domain/events.py apps/api/tests packages/contracts/openapi.json packages/contracts/src/api.ts
git commit -m "feat: version guide conversation contract"
```

---

### Task 2: Make Guide Messages Recoverable and Idempotent

**Files:**
- Create: `apps/api/app/services/guide_conversation.py`
- Modify: `apps/api/app/services/guide_service.py`
- Modify: `apps/api/app/repositories/session_repository.py`
- Modify: `apps/api/tests/api/test_guide_api.py`
- Modify: `apps/api/tests/component/test_guide_semantics.py`
- Modify: `apps/api/tests/component/test_session_repository.py`

**Interfaces:**
- Consumes: Task 1 transcript and processed-request types.
- Produces: `request_digest(payload: object) -> str`, `attach_conversation(session, response) -> GuideTurnResponse`, and atomic opening/user/assistant transcript commits.
- Produces error codes: `MESSAGE_ID_REUSED`, `STALE_CONVERSATION`, `CONVERSATION_LIMIT_REACHED`.

- [ ] **Step 1: Write API failures for recovery, idempotency, and stale writes**

Add a test sequence:

```python
created = client.post("/api/v1/guide/sessions", json=create_payload).json()
revision = created["conversation_revision"]
request = {
    "message_id": "stable-client-id",
    "text": "适合油皮吗？",
    "expected_conversation_revision": revision,
}
first = client.post(f"/api/v1/guide/sessions/{created['session_id']}/messages", json=request)
replayed = client.post(f"/api/v1/guide/sessions/{created['session_id']}/messages", json=request)
restored = client.get(f"/api/v1/guide/sessions/{created['session_id']}")
assert first.status_code == replayed.status_code == restored.status_code == 200
assert replayed.json()["transcript"] == restored.json()["transcript"]
assert len(restored.json()["transcript"]) == 3
```

Also assert same ID/different text returns 409 `MESSAGE_ID_REUSED`, stale revision returns 409 `STALE_CONVERSATION`, and neither mutates transcript, revisions, snapshot, or trace count.

- [ ] **Step 2: Run focused tests and verify failure**

```bash
uv --directory apps/api run pytest tests/api/test_guide_api.py tests/component/test_guide_semantics.py tests/component/test_session_repository.py -q
```

Expected: FAIL because create/message do not attach transcript or use message ID/revision.

- [ ] **Step 3: Implement conversation helpers**

In `guide_conversation.py`, implement canonical JSON SHA-256 hashing, server-generated `gmsg_<uuid>` IDs, monotonically increasing sequences, safe health-message redaction, and attachment of a deep-copied transcript to every response.

Use this boundary:

```python
MAX_USER_TURNS = 12

def request_digest(payload: object) -> str: ...
def opening_message(response: GuideTurnResponse) -> GuideTranscriptMessage: ...
def append_exchange(
    session: GuideSession,
    request: GuideMessageRequest,
    response: GuideTurnResponse,
    *,
    redact_user: bool,
) -> GuideTurnResponse: ...
def attach_conversation(
    session: GuideSession,
    response: GuideTurnResponse,
) -> GuideTurnResponse: ...
```

User transcript text is the fixed `已隐藏一条健康相关描述` when `redact_user=True`.

- [ ] **Step 4: Make create and message atomic**

Wrap session creation/opening snapshot in a transaction. `create()` appends exactly one assistant opening. In `message()`, perform checks in this order:

1. hash and look up the client message ID;
2. same ID/same digest returns the current canonical snapshot;
3. same ID/different digest raises `MESSAGE_ID_REUSED`;
4. stale expected revision raises `STALE_CONVERSATION`;
5. enforce the 12-user-turn cap;
6. verify current `SEND_MESSAGE` or compatible legacy action;
7. execute the engine;
8. append user + assistant messages, increment conversation revision once, save processed request, save snapshot.

Any exception must roll back all session and trace mutations through `SessionRepository.transaction()`.

- [ ] **Step 5: Add concurrency and rollback tests**

Use the existing paused-engine thread pattern to prove two different IDs with the same expected revision yield one success and one 409, while identical IDs execute once. Inject a tool/trace failure after preference mutation and assert transcript, processed map, both revisions, latest snapshot, in-memory events, and trace-file byte length roll back.

- [ ] **Step 6: Run focused tests**

Run Step 2. Expected: PASS.

- [ ] **Step 7: Commit Task 2**

```bash
git add apps/api/app/services/guide_conversation.py apps/api/app/services/guide_service.py apps/api/app/repositories/session_repository.py apps/api/tests
git commit -m "feat: persist reliable guide transcript"
```

---

### Task 3: Route Each Question to the Lightest Valid Answer

**Files:**
- Modify: `apps/api/app/workflow/agent.py`
- Modify: `apps/api/app/workflow/engine.py`
- Modify: `apps/api/tests/component/test_workflow.py`
- Modify: `apps/api/tests/component/test_guide_semantics.py`
- Modify: `apps/api/tests/api/test_guide_api.py`
- Modify: `evals/cases/foundation-cases.jsonl` only if an existing expected view intentionally changes; preserve the six case IDs and scoring meaning.

**Interfaces:**
- Produces: internal `GuideQuestionIntent` and `classify_question(text: str) -> GuideQuestionIntent`.
- Produces view routing for `OPENING_CONTEXT`, `ANSWER_READY`, `WAITING_CLARIFICATION`, `DECISION_READY`, `NO_MATCH`, `INSUFFICIENT_EVIDENCE`, and `SAFE_BOUNDARY`.
- Consumed by: Tasks 4–7.

- [ ] **Step 1: Write failing workflow examples**

Cover these exact Chinese paths:

```python
opening = engine.open_session(session)
assert opening.guide_view_kind == GuideViewKind.OPENING_CONTEXT
assert opening.quick_replies == ["适合油皮吗？", "会不会泛白？", "和防水款比比"]

fit = engine.handle_message(session, GuideMessageRequest(message_id="fit", text="适合油皮吗？"))
assert fit.guide_view_kind == GuideViewKind.WAITING_CLARIFICATION
assert fit.quick_replies == ["日常通勤", "户外出汗或玩水"]
assert fit.text.count("？") <= 1

claim = engine.handle_message(fresh_session, GuideMessageRequest(message_id="cast", text="会不会泛白？"))
assert claim.guide_view_kind == GuideViewKind.ANSWER_READY
assert claim.recommendations == []
assert "低泛白风险" in claim.text
assert "所有肤色" in claim.text

decision = engine.handle_message(session, GuideMessageRequest(message_id="commute", text="日常通勤"))
assert decision.guide_view_kind == GuideViewKind.DECISION_READY
assert decision.recommendations
```

Keep medical boundary and zero-match assertions unchanged in meaning.

- [ ] **Step 2: Run workflow tests and verify failure**

```bash
uv --directory apps/api run pytest tests/component/test_workflow.py tests/component/test_guide_semantics.py tests/api/test_guide_api.py -q
```

Expected: FAIL because opening currently jumps directly to clarification and every nonmedical message runs the full recommendation path.

- [ ] **Step 3: Add intent classification and concise Chinese copy**

Implement a deterministic internal enum with `FIT`, `CLAIM_WHITE_CAST`, `COMPARE`, `RECOMMEND_OR_CONSTRAINT`, and `GENERAL`. Classification is only a Foundation baseline; it must not be described as an LLM.

Use exact opening and clarification copy from Global Constraints. White-cast answer must distinguish the structured `white_cast_risk` fact from the unsupported creator claim that the formula never casts on every complexion.

- [ ] **Step 4: Change `open_session()` to a true opening**

Return `WorkflowState.UNDERSTAND`, `kind="opening"`, `GuideViewKind.OPENING_CONTEXT`, `GuideStatus.WAITING_USER`, `SEND_MESSAGE + RETURN_TO_FEED`, and the three approved prompts. Do not run retrieval before the user asks anything.

- [ ] **Step 5: Route short answer, one-question clarification, and full decision**

- `适合油皮吗？`: merge `skin_type="oily"`, increment `guide_revision` once because preference authority changed, and ask only about commute versus outdoor/water.
- `会不会泛白？`: answer current-product fact/evidence without recommendations and without changing `guide_revision`.
- `日常通勤` or `户外出汗或玩水`: complete the existing retrieval/filter/recommendation flow.
- explicit comparison intent: create a valid recommendation state containing the anchor and at least one water-resistant candidate so Task 4 can compare them.
- medical terms: preserve `SAFE_BOUNDARY`, safe copy, redacted transcript, and only `RETURN_TO_FEED`.

- [ ] **Step 6: Preserve verifier and ranking invariants**

Keep hard filtering before ranking, positive-verdict evidence requirements, no silent hard-constraint relaxation, deterministic fallback copy, and allowed-action validation. Ensure `SEND_MESSAGE` is present on nonterminal conversational views but absent on safety/fatal views.

- [ ] **Step 7: Run focused and Foundation eval tests**

```bash
uv --directory apps/api run pytest tests/component/test_workflow.py tests/component/test_guide_semantics.py tests/api/test_guide_api.py tests/eval/test_foundation_eval.py -q
uv --directory apps/api run python ../../evals/run_foundation.py
```

Expected: all tests pass and the six named Foundation cases remain 6/6. If an expected opening view changed, update only the explicit frozen expectation and document why in the later verification report.

- [ ] **Step 8: Commit Task 3**

```bash
git add apps/api/app/workflow/agent.py apps/api/app/workflow/engine.py apps/api/tests evals/cases/foundation-cases.jsonl
git commit -m "feat: route guide questions progressively"
```

---

### Task 4: Make Comparison a Recoverable Conversation Action

**Files:**
- Modify: `apps/api/app/services/cart_service.py`
- Modify: `apps/api/app/api/routes/cart.py`
- Modify: `apps/api/app/workflow/agent.py`
- Modify: `apps/api/app/domain/contracts.py`
- Modify: `apps/api/tests/api/test_compare_cart_api.py`
- Modify: `apps/api/tests/component/test_guide_semantics.py`
- Modify: `apps/api/tests/component/test_commerce_service.py`
- Regenerate: `packages/contracts/openapi.json`
- Regenerate: `packages/contracts/src/api.ts`

**Interfaces:**
- Consumes: Task 1 `CompareRequest.request_id` and conversation revision.
- Produces: idempotent compare, transcript `COMPARISON` message, continued `SEND_MESSAGE`, and current comparison snapshot.
- Preserves: `CompareResponse` HTTP response and all Commerce provenance checks.

- [ ] **Step 1: Write failing comparison reliability tests**

Create a recommendation, then POST compare with a stable request ID and expected revision. Assert:

```python
assert first.status_code == repeated.status_code == 200
assert first.json() == repeated.json()
snapshot = client.get(f"/api/v1/guide/sessions/{session_id}").json()
assert snapshot["guide_view_kind"] == "COMPARISON_READY"
assert snapshot["allowed_actions"] == ["SEND_MESSAGE", "OPEN_PRODUCT", "RETURN_TO_FEED"]
assert [item["kind"] for item in snapshot["transcript"]].count("COMPARISON") == 1
```

Also assert same request ID/different product IDs returns 409, stale revision returns 409, and compare can be followed by another normal message.

- [ ] **Step 2: Run focused tests and verify failure**

```bash
uv --directory apps/api run pytest tests/api/test_compare_cart_api.py tests/component/test_guide_semantics.py tests/component/test_commerce_service.py -q
```

Expected: FAIL because compare is terminal and has no request id/revision/transcript semantics.

- [ ] **Step 3: Implement compare transaction ordering**

Inside the existing repository transaction:

1. replay/check request ID digest;
2. check expected conversation revision;
3. check `REQUEST_COMPARISON` and recommended-product membership;
4. build the same structured comparison rows;
5. append one assistant `COMPARISON` transcript message;
6. increment conversation revision once;
7. save processed request and canonical `COMPARISON_READY` snapshot;
8. append a trace event containing product IDs only.

No user raw text, request ID, or secret may enter trace.

- [ ] **Step 4: Allow conversation after comparison without weakening Commerce**

Set `COMPARISON_READY` allowed actions to `SEND_MESSAGE`, `OPEN_PRODUCT`, `RETURN_TO_FEED`. Remove the exact-terminal-action validator, but keep session ownership, compare state, product ID membership, and current Guide provenance checks.

- [ ] **Step 5: Prove business authority remains current-only**

Add tests showing a historical recommendation in transcript cannot open an old product after constraints change or after safety state. A non-authority-changing “为什么” message keeps current valid provenance; a preference change increments `guide_revision` and makes the older source revision invalid.

- [ ] **Step 6: Regenerate contracts and run tests**

```bash
uv --directory apps/api run python -m scripts.export_openapi
pnpm --dir packages/contracts generate
pnpm --dir packages/contracts check
uv --directory apps/api run pytest tests/api/test_compare_cart_api.py tests/component/test_guide_semantics.py tests/component/test_commerce_service.py -q
```

Expected: PASS.

- [ ] **Step 7: Commit Task 4**

```bash
git add apps/api packages/contracts/openapi.json packages/contracts/src/api.ts
git commit -m "feat: keep comparison inside guide conversation"
```

---

### Task 5: Validate and Restore Conversation State in the Web Client

**Files:**
- Modify: `apps/web/src/lib/decision-contracts.ts`
- Modify: `apps/web/src/lib/api-client.ts`
- Modify: `apps/web/src/test/decision-contracts.test.ts`
- Modify: `apps/web/src/test/guide-sheet.test.tsx`
- Modify: `apps/web/src/components/guide-sheet.tsx`

**Interfaces:**
- Consumes: generated Task 4 contracts.
- Produces: strict `validateGuideTranscript`, revision-aware `sendGuideMessage`, idempotent `compareProducts`, and sessionStorage locator helpers.
- Consumed by: Tasks 6–7.

- [ ] **Step 1: Write failing runtime-validator tests**

Add valid transcript fixtures and reject:

- duplicate IDs or sequences;
- non-increasing sequence;
- user messages with attachments;
- comparison kind without a comparison;
- transcript session/comparison mismatch;
- unknown actions/view kinds;
- top-level conversation revision older than processed transcript sequence semantics.

- [ ] **Step 2: Run validator tests and verify failure**

```bash
pnpm --dir apps/web exec vitest run src/test/decision-contracts.test.ts
```

Expected: FAIL because generated fields are not validated.

- [ ] **Step 3: Implement strict transcript validation**

Add `SEND_MESSAGE` and `ANSWER_READY` to known sets and exact view/action mappings. Validate message roles, kinds, timestamps, pure-text values, redaction, attachments, unique IDs/sequences, and comparison ownership before returning `GuideTurnResponse`.

- [ ] **Step 4: Extend API client signatures**

Use these public signatures:

```ts
sendGuideMessage(
  sessionId: string,
  messageId: string,
  text: string,
  expectedConversationRevision: number,
): Promise<GuideTurn>

compareProducts(
  sessionId: string,
  requestId: string,
  productIds: string[],
  expectedConversationRevision: number,
): Promise<CompareResponse>
```

Encode the session ID path segment. Keep all existing response guards.

- [ ] **Step 5: Add opaque session locator helpers**

In `guide-sheet.tsx` or a small local helper, use key `ai-shopping-guide-session:<contentContextId>`. Store only the server session ID in `sessionStorage`. On 404, remove it and create a new session; never store transcript, tokens, idempotency keys, product facts, or health text.

- [ ] **Step 6: Make POST recovery use the same request ID**

Generate one message ID before the request. On network uncertainty, retry the same POST once with the same message ID/revision; only then GET the canonical session. Do not create a new ID on retry. Apply the same rule to comparison request IDs.

- [ ] **Step 7: Prove close/reopen, reload locator, and PDP return behavior**

Component tests must assert one create POST, same session ID on reopen, restored transcript from GET, content-context change clearing the previous locator, and fatal/404 recovery creating a new session only after clearing the stale ID.

- [ ] **Step 8: Run focused Web tests**

```bash
pnpm --dir apps/web exec vitest run src/test/decision-contracts.test.ts src/test/guide-sheet.test.tsx
```

Expected: PASS.

- [ ] **Step 9: Commit Task 5**

```bash
git add apps/web/src/lib apps/web/src/components/guide-sheet.tsx apps/web/src/test
git commit -m "feat: restore authoritative guide conversation"
```

---

### Task 6: Build the Lightweight Chat Presentation

**Files:**
- Create: `apps/web/src/components/guide-chat-view.tsx`
- Create: `apps/web/src/test/guide-chat-view.test.tsx`
- Modify: `apps/web/src/components/recommendation-card.tsx`
- Modify: `apps/web/src/components/comparison-table.tsx`
- Modify: `apps/web/src/test/decision-actions.test.tsx`
- Modify: `apps/web/src/app/globals.css`

**Interfaces:**
- Consumes: verified `GuideTurn`/transcript and callbacks supplied by `GuideSheet`.
- Produces: pure `GuideChatView` with `mode: "compact" | "expanded"`, `onSubmit`, `onQuickReply`, `onOpenProduct`, `onCompare`, `onShowEvidence`, and `onClose`.
- Does not: fetch, mutate revisions, infer allowed actions, write sessionStorage, or authorize Commerce.

- [ ] **Step 1: Write failing opening/presentation tests**

Render `GuideChatView` with a verified opening and assert:

```ts
expect(screen.getByRole("log", { name: "导购对话" })).toBeInTheDocument();
expect(screen.getByText("我看到你在看 Seoul Shade。你最想确认什么？")).toBeInTheDocument();
expect(screen.getAllByRole("button", { name: /适合油皮|会不会泛白|和防水款比比/ })).toHaveLength(3);
expect(screen.getByPlaceholderText("问问这款商品…")).toBeInTheDocument();
expect(screen.queryByText("AI 决策")).not.toBeInTheDocument();
expect(screen.queryByRole("table")).not.toBeInTheDocument();
```

Add tests for short answer without products, one compact recommendation, comparison only in expanded mode, and safety with no product/compare actions.

- [ ] **Step 2: Run tests and verify failure**

```bash
pnpm --dir apps/web exec vitest run src/test/guide-chat-view.test.tsx src/test/decision-actions.test.tsx
```

Expected: FAIL because `GuideChatView` and compact card modes do not exist.

- [ ] **Step 3: Implement `GuideChatView` as a pure component**

Render:

- one-line source chip;
- `role="log" aria-live="polite" aria-relevant="additions text"` transcript;
- lightweight user/assistant rows without decorative AI dashboards;
- quick replies in `role="group" aria-label="你可以这样问"`;
- sticky 1–3 line textarea with composition-safe Enter handling and `enterKeyHint="send"`;
- one `AI 生成 · 合成原型` disclosure;
- status/error semantics supplied by the controller.

Do not autofocus the textarea.

- [ ] **Step 4: Convert result components to compact inline modes**

Recommendation default shows image, product name, one fit reason, one tradeoff, folded `依据 N`, and `看商品`. Alternatives and comparison controls are separate secondary actions. Comparison keeps a semantic table with at most two products in the primary path and a keyboard-focusable labeled horizontal container.

- [ ] **Step 5: Implement compact/expanded CSS**

Use a white/light surface, black text, neutral dividers, TikTok pink only for primary/send actions, `100dvh`, safe-area bottom padding, 44px targets, and reduced-motion overrides. Compact mobile opening must fit greeting, three prompts, and composer without mandatory scrolling at 390×844.

- [ ] **Step 6: Test IME, focus, and progressive disclosure**

Assert composition Enter does not submit, ordinary Enter submits once, Shift+Enter inserts a line break, hidden evidence/alternatives are absent from the accessibility tree, and returning from a subview restores focus to its trigger.

- [ ] **Step 7: Run focused tests**

Run Step 2. Expected: PASS.

- [ ] **Step 8: Commit Task 6**

```bash
git add apps/web/src/components/guide-chat-view.tsx apps/web/src/components/recommendation-card.tsx apps/web/src/components/comparison-table.tsx apps/web/src/test/guide-chat-view.test.tsx apps/web/src/test/decision-actions.test.tsx apps/web/src/app/globals.css
git commit -m "feat: render lightweight shopping conversation"
```

---

### Task 7: Integrate Sheet Modes Without Regressing Navigation or Commerce

**Files:**
- Modify: `apps/web/src/components/guide-sheet.tsx`
- Modify: `apps/web/src/components/demo-shell.tsx`
- Modify: `apps/web/src/test/guide-sheet.test.tsx`
- Modify: `apps/web/src/test/responsive-frame.test.tsx`
- Modify: `apps/web/e2e/guide.spec.ts`
- Modify: `apps/web/e2e/pdp-focus.spec.ts`

**Interfaces:**
- Consumes: Task 5 controller APIs and Task 6 pure view.
- Produces: compact opening/ordinary chat, expanded comparison, preserved focus/scroll/PDP provenance, and `问问这款` entry copy.

- [ ] **Step 1: Add failing controller integration tests**

Assert:

- opening mode is compact;
- ordinary short answers and no-match/safety remain compact;
- comparison pending switches to expanded and restored comparison reopens expanded;
- message/user bubble is pending only until authoritative POST/retry/GET resolution;
- stale or lower revision freezes actions and never appends a fake assistant reply;
- AI → PDP → AI restores same session/transcript/mode/scroll;
- focus trap, Escape, body lock, bottom `inert`, and entry focus return remain intact.

- [ ] **Step 2: Run focused tests and verify failure**

```bash
pnpm --dir apps/web exec vitest run src/test/guide-sheet.test.tsx src/test/responsive-frame.test.tsx
```

Expected: FAIL because the old report render and fixed 74% Sheet remain.

- [ ] **Step 3: Replace the report render with `GuideChatView`**

Keep the existing verified-turn, request-version, reconciliation, freeze, comparison-expectation, focus, and scroll controller logic. Remove the large context card, capability panel, state dashboards, claim ledger, repeated footer disclosure, three full recommendation cards, and inline checkbox matrix from the default render.

- [ ] **Step 4: Implement deterministic mode rules**

`mode="expanded"` only for comparison pending/ready or explicit alternatives subview. Message count alone never expands the Sheet. Close/reopen and PDP return restore the prior mode. Safety/fatal transitions close every product/evidence/comparison subview and remove business actions.

- [ ] **Step 5: Update entry and desktop copy**

Change only the AI entry/action wording to `问问这款`. Keep Feed/PDP platform structure and self-owned assets unchanged. Make desktop portfolio explanation secondary and update it to describe lightweight conversation rather than “AI decision board.”

- [ ] **Step 6: Run unit and focused browser tests**

```bash
pnpm --dir apps/web exec vitest run src/test/guide-sheet.test.tsx src/test/responsive-frame.test.tsx
pnpm --dir apps/web exec playwright test e2e/guide.spec.ts e2e/pdp-focus.spec.ts
```

Expected: PASS on mobile and desktop projects; existing focus paths remain 6/6.

- [ ] **Step 7: Commit Task 7**

```bash
git add apps/web/src/components/guide-sheet.tsx apps/web/src/components/demo-shell.tsx apps/web/src/test apps/web/e2e/guide.spec.ts apps/web/e2e/pdp-focus.spec.ts
git commit -m "feat: integrate compact guide sheet"
```

---

### Task 8: Preserve the Eight Journeys and Add Chat-first Browser Evidence

**Files:**
- Create: `apps/web/e2e/chat-first.spec.ts`
- Modify: `apps/web/e2e/tiktok-demo.spec.ts`
- Modify: `apps/web/e2e/tiktok-responsive.spec.ts`
- Modify: `apps/web/playwright.config.ts`
- Create: `artifacts/screenshots/chat-first-opening-mobile.png`
- Create: `artifacts/screenshots/chat-first-decision-mobile.png`
- Create: `artifacts/screenshots/chat-first-desktop.png`

**Interfaces:**
- Consumes: completed API/Web behavior.
- Produces: semantic E2E proof and deterministic production screenshots.
- Preserves: all existing network status, revision, allowed-action, transaction identity, single-POST/single-GET reconciliation, and one-receipt assertions.

- [ ] **Step 1: Migrate old selectors without weakening assertions**

Replace report-specific headings, `<article>` counts, claim-ledger selectors, and old quick-question copy. Do not remove assertions for:

- 8 required product/commerce journeys;
- zero-match single relaxation and revision +1;
- safety-only return action;
- fact-change re-confirmation and new token/revision;
- unknown commit exactly one write POST, same idempotency key GET reconciliation, one receipt, and one cart item.

- [ ] **Step 2: Add failing `chat-first.spec.ts` journeys**

Implement independent no-cart tests for:

1. light opening preserves visible video context;
2. one clarification per turn;
3. short white-cast answer has no recommendation matrix;
4. decision shows one primary recommendation by default;
5. comparison expands only after explicit intent;
6. close/reopen restores canonical transcript;
7. AI → PDP → AI restores transcript;
8. safety removes all business actions;
9. 390×844 compact geometry and no horizontal overflow;
10. 320×700, 200% text, desktop, Tab/Escape/focus return, and reduced motion.

- [ ] **Step 3: Run new E2E and verify failures before final fixes**

```bash
pnpm --dir apps/web exec playwright test e2e/chat-first.spec.ts
```

Expected initially: one or more geometry/selector/behavior failures that identify the remaining integration gaps.

- [ ] **Step 4: Fix only demonstrated E2E gaps**

Adjust components/CSS/selectors without changing API authority or broadening scope. Re-run Step 3 until all chat-first cases pass.

- [ ] **Step 5: Add a separate production capture gate**

`CAPTURE_CHAT_FIRST_EVIDENCE=1` must force fresh uvicorn with `--no-access-log`, `workers=1`, `next build && next start`, no server reuse, and Playwright trace off. Reuse fixed time, `document.fonts.ready`, paused/seeked video, disabled motion/caret, and viewport assertions.

- [ ] **Step 6: Capture three canonical screenshots without overwriting history**

Write only the three `chat-first-*` files. Before capture, assert visible opening/decision/desktop states and Sheet geometry. Do not modify `tiktok-redesign-*` or Foundation screenshots.

- [ ] **Step 7: Run noncapture and production E2E**

```bash
pnpm test:e2e
CAPTURE_CHAT_FIRST_EVIDENCE=1 pnpm test:e2e
```

Expected: zero failures. Record actual pass/skip counts; do not reuse historical counts.

- [ ] **Step 8: Visually inspect screenshots**

Inspect all three images at original detail. Confirm no dev overlay, clipped composer, fake full-screen takeover, duplicate disclosures, hidden video context, horizontal overflow, or desktop panel competing with the phone.

- [ ] **Step 9: Commit Task 8**

```bash
git add apps/web/e2e apps/web/playwright.config.ts artifacts/screenshots/chat-first-*.png
git commit -m "test: verify chat-first shopping journeys"
```

---

### Task 9: Run the Full Release Gate and Freeze Reproducible Evidence

**Files:**
- Create: `artifacts/evidence/chat-first-verification.md`
- Create: `artifacts/evidence/chat-first-run-manifest.json`
- Modify: `README.md`
- Modify: `PLAN.md`
- Modify: `TASKS.md`

**Interfaces:**
- Consumes: final source tree and screenshots.
- Produces: exact test counts, versions, commit/data/contract pointers, screenshot hashes, limitations, and completed engineering task status.

- [ ] **Step 1: Run contract, lint, layout-foundation, and build gates**

```bash
pnpm --dir packages/contracts check
uv --directory apps/api run ruff check app tests ../../evals
pnpm lint:web
pnpm check:layout
pnpm --dir apps/web build
git diff --exit-code -- packages/contracts/openapi.json packages/contracts/src/api.ts
```

Expected: every command exits 0. Describe `check:layout` only as an asset/layout-foundation gate, not visual proof.

- [ ] **Step 2: Run full API, Web, E2E, and Foundation eval gates**

```bash
uv --directory apps/api run pytest tests -q
pnpm test:web
pnpm test:e2e
uv --directory apps/api run pytest tests/eval/test_foundation_eval.py -q
uv --directory apps/api run python ../../evals/run_foundation.py
```

Expected: zero failures; Foundation runner remains 6/6. Capture actual collected/pass/skip counts from this source commit.

- [ ] **Step 3: Run artifact and secret checks**

Verify all new files are nonempty, PNG dimensions match 390×844 or 1440×1000, and SHA-256 values are recorded. Search tracked diffs/artifacts for credential patterns, runtime confirmation-token prefixes, idempotency keys, raw health text, client message IDs, and `chain_of_thought`; synthetic constants must be labeled as such rather than described as secrets.

- [ ] **Step 4: Write the machine manifest**

Include:

- schema/version and UTC capture time;
- source commit and dirty-state declaration;
- Node/pnpm/Python/uv/Chromium versions;
- fixture and generated-contract SHA-256 values;
- every command, exit code, actual counts, and duration;
- screenshot path/dimensions/SHA-256;
- evidence flags, fixed browser time, viewport, and known limitations.

- [ ] **Step 5: Write the human verification report**

Map each chat-first and existing commerce journey to observable UI and authoritative HTTP/revision evidence. State explicitly that results prove behavior only on frozen synthetic fixtures and local production Chromium, not real LLM quality, real users, conversion, or production reliability.

- [ ] **Step 6: Update README, PLAN, and TASKS from measured facts**

Replace “IN PROGRESS” with `DONE` only after the gates pass. Keep historical Foundation/TikTok redesign counts and screenshots intact; add a new chat-first evidence section rather than rewriting history.

- [ ] **Step 7: Commit Task 9**

```bash
git add artifacts/evidence/chat-first-* README.md PLAN.md TASKS.md
git commit -m "docs: verify lightweight chat-first demo"
```

---

### Task 10: Record the Product Decision and Interview Evidence

**Files:**
- Create: `../../AI产品经理/项目实战/AI导购Agent/决策/ADR-002-Chat-first轻量导购与渐进披露.md`
- Modify: `../../AI产品经理/项目实战/AI导购Agent/00-项目总控.md`
- Modify: `../../AI产品经理/项目实战/AI导购Agent/06-面试问题与证据索引.md`
- Modify: `../../AI产品经理/项目实战/AI导购Agent/07-TikTok真实体验重设计规格.md`
- Modify: `../../AI产品经理/项目实战/AI导购Agent/log.md`
- Regenerate then carefully preserve unrelated changes: `../../.claude/okf-reindex.sh`

**Interfaces:**
- Consumes: Task 9 measured evidence.
- Produces: product rationale and interview answer pointers; does not duplicate code inventories or raw test reports.

- [ ] **Step 1: Write ADR-002 with OKF frontmatter**

Record `问题 → 备选 → 决策 → 理由 → 代价 → 验证方式 → 面试表达`. Distinguish:

- why the heavy result board failed the attention model;
- why A was chosen over snapshot-only chat and full-screen persistent assistant;
- why true transcript and two revisions are product reliability decisions, not technical decoration;
- why progressive disclosure protects attention without deleting evidence/safety;
- what browser automation can and cannot prove.

- [ ] **Step 2: Update product control room and specification**

Mark the old 65%–75% default Sheet requirement as superseded by ADR-002. Add compact/expanded rules, approved opening prompts, one-question policy, message recovery, transcript/privacy boundary, and evidence links.

- [ ] **Step 3: Add process log and interview questions**

Append a dated log entry covering observation, hypothesis, external reference pattern, chosen intervention, implementation evidence, remaining uncertainty, and next user-research question. Add interview answers for:

- “为什么第二次又推翻 AI 导购界面？”
- “怎样在 Agent 能力和用户注意力之间取舍？”
- “你怎么做多轮会话恢复和幂等？”
- “为什么 conversation revision 不能复用 guide revision？”
- “你如何证明减重没有删掉安全和交易边界？”

- [ ] **Step 4: Run OKF checks and reindex safely**

Run the workspace OKF validation and reindex script. Snapshot unrelated dirty generated indexes before the command and restore byte-for-byte any index changes not caused by ADR-002/spec updates. Do not manually edit generated `index.md` files.

- [ ] **Step 5: Verify links and maturity language**

Every `已实现` or `已评测` statement must link to the canonical engineering evidence. No statement may imply real user, business, LLM, Hybrid RAG, or production results.

- [ ] **Step 6: Commit knowledge-layer changes in the workspace repository**

```bash
git add AI产品经理/项目实战/AI导购Agent
git commit -m "docs: record chat-first guide iteration"
```

---

### Task 11: Independent Review and Final Handoff

**Files:**
- Review: all Task 1–10 diffs and evidence.
- Modify only files required to resolve confirmed review findings.

**Interfaces:**
- Consumes: completed implementation and evidence.
- Produces: clean independent product/code/evidence review and final runnable handoff.

- [ ] **Step 1: Request independent code review**

Review contract invariants, transaction/idempotency ordering, two-revision authority, transcript privacy, safety action removal, current-only Commerce provenance, stale-response handling, focus/scroll/keyboard behavior, and test strength.

- [ ] **Step 2: Request independent visual/product review**

Inspect the three canonical screenshots at original detail. Review attention hierarchy, TikTok/Douyin tone, lightweight opening, chat readability, progressive disclosure, disclosure honesty, mobile safe areas, and desktop interview balance.

- [ ] **Step 3: Resolve every Critical or Important finding with TDD**

For each confirmed finding, add or tighten a failing test, reproduce it, implement the minimal fix, and rerun the focused plus affected full gate. Do not accept findings only because a reviewer asserted them; verify against the specification and source.

- [ ] **Step 4: Re-run final verification after fixes**

Repeat all Task 9 gates and production capture if any source or visual file changed. Update manifest, report, counts, hashes, and source commit so evidence describes the final tree.

- [ ] **Step 5: Confirm clean scope and runnable commands**

Run:

```bash
git status --short
git diff --check
```

Confirm no unrelated user changes were staged or reverted. Start API and Web with the README commands and verify `http://127.0.0.1:3000` opens the final Demo.

- [ ] **Step 6: Commit final review fixes if needed**

```bash
git add apps/api apps/web packages/contracts artifacts/evidence/chat-first-* artifacts/screenshots/chat-first-* README.md PLAN.md TASKS.md
git commit -m "fix: close chat-first review findings"
```

If no files changed, record the clean review in the verification report without creating an empty commit.
