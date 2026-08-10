# Task 11 Report — Independent Review Fixes and Final Handoff

## Status

DONE

Final source under test: `659596537efe7bd7a879aeb3b49bee17b01f5e73` from a clean worktree.

Source/test commits:

- `0228819d6180846ba9a8c29b8f25c1fd83d454c2` — `fix: close chat-first review findings`
- `659596537efe7bd7a879aeb3b49bee17b01f5e73` — `test: exercise authoritative guide snapshot in trace coverage`

## Review findings closed with RED → GREEN

1. **Safety composer follows authoritative actions.** Web RED exposed 2 failures with 278 passes; the real-API browser RED exposed 1 failure. `GuideChatView` now renders quick replies and the composer only when `SEND_MESSAGE` is authoritative. Safety keeps only the return/close path. GREEN: Web 280/280 and focused browser 1/1.
2. **Legacy cart requires current Guide authority.** Two safety-transition API REDs minted/accepted stale legacy authority, and one revision RED accepted a token after its source revision changed. Preview/add now require the current snapshot, `OPEN_PRODUCT`, matching `guide_revision`, current-card SKU authority, and token revision provenance. Rejections are atomic. GREEN: new cases 3/3; legacy compare/cart file 24/24.
3. **`guide_revision` versions recommendation authority.** Two REDs proved first/replacement recommendation authority could change without a revision. The engine now compares a deterministic fingerprint of decision inputs plus product-scoped eligible SKU authority before/after each turn and increments exactly once on semantic change. GREEN: key cases 3/3; affected API/Foundation set 144/144.
4. **Conclusion appears before the card.** Component and browser REDs each failed because bottom auto-scroll hid the latest conclusion. Recommendation turns now anchor internal scroll at the latest authoritative assistant message while retaining the card below. GREEN: component 1/1 and focused browser 1/1; formal mobile/desktop captures assert full conclusion visibility.
5. **Chinese fit/tradeoff copy is localized and distinct.** API and browser REDs exposed duplicated raw `natural finish`. Chinese copy now derives concise fit and decision-relevant tradeoffs from structured finish, skin, fragrance, water-resistance, and white-cast facts; evidence IDs and eligible SKUs remain unchanged. GREEN: API 1/1 and browser 1/1.
6. **One honest disclosure.** Three component REDs and one browser RED exposed repeated prototype narration. The Feed badge and desktop prototype/maturity/footer duplicates were removed; Guide retains one expandable disclosure containing every required boundary. GREEN: components 3/3 and browser 1/1.
7. **Real 200% Guide typography.** Browser RED held actual assistant copy at 14 px after the root became 32 px: 1 failed / 38 passed / 31 routed skips. Guide typography now uses root-relative units while 44 px touch minima remain fixed. The focused actual-font and reachability oracle passed 1/1.

The combined precommit focus then found one existing-oracle regression: a localized read-only comparison had replaced the explicit 40-minute exclusion with generic text (1 failed / 111 passed). Localizing concrete filter exclusions preserved the hard-constraint reason; the affected API set passed 112/112. Final precommit focus was API 112/112, Web 157/157, browser 21 passed / 19 routed skips / 0 failed, with focused Ruff, ESLint, and diff checks clean.

## Full-gate history retained

The first clean-source gate on `0228819…` is intentionally not erased:

- contracts 0, Ruff 0, Web lint 0, layout-foundation 0, build 0, and generated-contract integrity 0;
- full API stopped at **323 passed / 1 failed**;
- the failing golden trace test called raw `WorkflowEngine.open_session/handle_message`, bypassing public `GuideService.create/message`, so it never saved `latest_response`; the newly correct current-snapshot cart boundary rejected preview;
- no Web, browser, eval, or capture gate followed this failure.

The narrow correction changed only that test harness to the real `GuideService` orchestration with the same engine, repository, cart, events, trace ordering, and privacy assertions. It did not mock or manually assign a snapshot. Focused GREEN was 1/1, then trace plus legacy cart 61/61.

From clean `6595965…`, the transparently labeled second full Task 9 gate passed once:

- Contracts: exit 0, 0.95 s.
- Ruff: exit 0, 0.02 s.
- Web lint: exit 0, 2.84 s.
- Layout-foundation: exit 0, 0.20 s; this is not visual proof.
- Production build: exit 0, 4.04 s.
- Generated-contract integrity: exit 0, 0.01 s.
- API: 324/324, 3.19 s wall.
- Web: 281/281, 5.34 s wall.
- Ordinary E2E: 39 passed / 31 intentional routed skips / 0 failed, 31.41 s wall.
- Foundation eval pytest: 15/15, 0.46 s wall.
- Foundation deterministic runner: 6/6, pass rate 1.0, 0.23 s wall.

The sole production capture then passed 42 / 28 / 0 in 33.13 s wall.

## Formal artifact inspection

All three regenerated PNGs were inspected at original detail:

| Artifact | Dimensions | Bytes | SHA-256 | Original-detail result |
| --- | ---: | ---: | --- | --- |
| `chat-first-opening-mobile.png` | 390×844 | 223,333 | `670297d95460415b75c60761b437934f179cc5b5b383f26e1936b4a3fbabc17a` | Video/context remain visible; prompt, three replies, composer, close, and single disclosure are uncut |
| `chat-first-decision-mobile.png` | 390×844 | 242,594 | `bcfd411c0e3d47629f02eb975d1d701b6aeed7f4247af9c01b11371977cd97ae` | Conclusion is fully visible before the localized single card; no duplicate prototype badge |
| `chat-first-desktop.png` | 1440×1000 | 719,968 | `1dec9a3819a408c1c89bf26cfac146d8e062f52bb1d13ae786faa65e13902abd` | Live phone remains primary; simplified walkthrough panel remains secondary |

Against the pre-review canonical, changed-pixel bounds were: opening 1,022 / 329,160 (0.31%, status-clock bbox only), decision 52,999 / 329,160 (16.10%, intended hierarchy/copy/disclosure region), and desktop 316,540 / 1,440,000 (21.98%, intended phone/panel region).

## Evidence and limitations

- Raw urgent-health text is excluded from retained runtime artifacts. Explicit synthetic urgent-health and privacy-rejection fixtures remain in test source by design.
- CSS safe-area variables and nominal Chromium containment are covered; real iOS nonzero notch/home-indicator insets are not verified.
- The Sheet has no drag interaction or drag affordance. No fake handle was added.
- The opening still has a noticeable whitespace gap between prompt and quick replies.
- Frozen synthetic fixtures, deterministic rules, local Chromium, in-memory sessions, and all prior no-real-LLM/no-user/no-business-result boundaries remain unchanged.

Final commands, counts, hashes, capture flags, history, and limitations are mirrored in `artifacts/evidence/chat-first-run-manifest.json` and `artifacts/evidence/chat-first-verification.md`.
