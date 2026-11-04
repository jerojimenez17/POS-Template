# Account-ledger balance QA checklist

This checklist follows `SPEC.md` AC1–AC20 and records the focused QA evidence, including the final green Existing Order Dialog follow-up. Automated checks are marked only for behaviors verified by passing tests; checks requiring API/auth integration, actual viewport inspection, or other unverified evidence remain open.

## Automated checks

- [x] **AC1 — Ledger column and ordering:** `account-ledger-balance.test.tsx` verifies that `Saldo de cuenta` appears once and immediately after `Total` across the ledger statuses.
- [x] **AC2 — Current client balance, not order total:** ledger tests verify the client balance is formatted as `es-AR` and distinguished from order totals.
- [x] **AC3 — Same current balance across a client's orders:** ledger tests verify different orders for the same client display the same balance.
- [x] **AC4 — Null and signs:** ledger tests cover positive, zero, and negative balances and a missing client displaying `—` rather than `$0`.
- [x] **AC5 — Set-based query/no N+1:** `account-ledger-balance-action.test.ts` verifies the existing `order.findMany` projection includes `client.balance` without extra per-order reads.
- [x] **AC6 — Action contract:** action tests verify numeric balance pass-through and a null relation; focused tests passed. This does not establish project-wide TypeScript success.
- [x] **AC7 — Both modal modes:** modal balance tests cover `mode="unpaid"` (A cuenta) and `mode="budget"` (Presupuesto), including positive, zero, and negative balances.
- [x] **AC8 — Filtering and selection identity:** modal tests cover filtering/search and selecting a client while retaining its associated balance.
- [x] **Malformed modal API data:** modal tests cover missing and non-numeric `balance` responses; the client remains selectable, shows `Saldo: —` rather than a fabricated amount, and identifies the invalid balance. Both malformed-response cases passed.

**Earlier focused QA result (preserved):** 5 test files / 24 tests passed. This run included the ledger, action, selection, both modal modes, malformed missing/non-numeric balance responses, and related modal tests; it predates the Existing Order Dialog follow-up below.
- [ ] **AC9 — API shape/auth/tenant isolation:** Not evidenced. Verify authenticated GET returns `{ clients: [...] }` with numeric `balance`, filters by session business, and returns 401 without a session.
- [ ] **AC10 — Existing mutations and checkout payloads:** Full selection/create/order/budget regression and checkout-payload authority checks were not evidenced. Focused balance/modal tests do not establish complete flow coverage.
- [ ] **AC11 — Responsive UI:** Not evidenced. Inspect ledger and modal at narrow mobile and desktop widths, including visibility, legibility, and scrolling.
- [ ] **AC12 — No schema/dependency changes:** Not evidenced by the final QA results; verify the diff for schema, migration, and dependency changes.
- [ ] **AC13 — Validation / project-wide G4:** Not passed or not evidenced:
  - Earlier focused QA: **passed**, 5 files / 24 tests (see above); final focused QA including AC20: **passed**, 5 files / 34 tests (see below).
  - Earlier full test suite: **failed** — 64 files / 275 tests / 10 errors; baseline status is unverified, so this does not establish feature-caused regressions.
  - `npm run lint`: **failed** — 49 errors and 21 warnings project-wide; no changed-file diagnostics were reported.
  - `npx tsc --noEmit`: **failed** project-wide; no changed-file diagnostics were reported.
  - API/auth and manual acceptance checks: **not evidenced**.
  - `npm run build`: **not evidenced**.

## Existing Order Dialog follow-up (AC14–AC20)

- [x] **AC14 — Correct dialog and placement:** The component test opens the Existing Order Dialog through the `ClientSelectionModal` selection flow and verifies its explicit balance label appears before the order list. It exercises this component dialog, not the ledger detail page.
- [x] **AC15 — Selected client's current balance:** Tests verify the selected record's balance is formatted in `es-AR` and shown separately from the deliberately different existing-order total and **Total a agregar**.
- [x] **AC16 — Signs, zero, unavailable data, identity changes:** Dialog tests cover positive, zero and negative balances, missing and non-finite balances showing `—` while adding remains enabled, and switching clients without retaining the previous client's balance.
- [x] **AC17 — Existing data path (component-level only):** The balance is sourced from the clients already loaded through `/api/clients`; the test observes the existing client fetch rather than a new balance request. This does not verify API response/authentication, business isolation, or the server integration.
- [x] **AC18 — Mutation payload unchanged:** Component flow test asserts `addItemsToOrder` receives exactly `{ orderId, businessId, items }`, with the expected mapped item and no balance/clientId fields.
- [x] **AC19 — Existing order flow and responsive structure:** Tests exercise the existing-order dialog, order total, **Total a agregar**, add action, and confirm the dialog layout has a bounded mobile-safe size, an independently scrollable body, and actions outside that body. These are DOM/class assertions, not visual inspection at actual mobile/desktop viewport sizes; broader manual responsive verification remains open.
- [x] **AC20 — Responsive width class scoping (automated):** Passing class assertions verify that the Existing Order Dialog alone receives `md:max-w-2xl` in both unpaid and budget modes, while retaining the mobile-safe `w-[calc(100%-1rem)]` width and `sm:max-w-md`. The normal client-picker remains unchanged in both modes. These are automated class assertions, not measurements of rendered viewport geometry.

**Final focused QA result including AC20:** 5 files / **34 tests passed**. This run covers AC14–AC20: Existing Order Dialog balance placement, selected-client identity, `es-AR` formatting and positive/negative/zero/fallback values, switching clients, unchanged mutation payload, responsive scroll/action structure, and the AC20 width-class assertions in unpaid and budget modes. Automated assertions confirm the normal picker is unchanged; this result does not measure actual viewport geometry or close API/auth integration and manual viewport checks.

**AC20 manual viewport verification remains open:** Actual viewport geometry at 375px, 768px, and 1024px was **not manually measured**. Verify the Existing Order Dialog has at least 8px side margins and no horizontal overflow on mobile; expands at `md` beyond 448px; is centered and capped at 672px at 1024px; and the other client-selection dialogs retain their existing rendered dimensions. DOM class assertions do not prove computed width, centering, or overflow behavior.

## Acceptance run commands

Focused QA results: the earlier run passed 5 files / 24 tests; the final Existing Order Dialog follow-up, including AC20, passed 5 files / 34 tests. The automated AC20 assertions pass in unpaid and budget modes and confirm only the Existing Order Dialog is widened while its mobile-safe and `sm:max-w-md` classes remain, and the normal picker stays unchanged. Actual viewport geometry at 375px, 768px, and 1024px was not manually measured. The full suite previously failed (64 files / 275 tests / 10 errors); baseline status is unverified, so feature attribution is unknown. Project-wide lint and TypeScript checks failed, though no changed-file diagnostics were reported. API/auth integration and `npm run build` remain unverified; manual viewport acceptance for AC11 and AC20 is also open. These outstanding gates are not cleared by focused test passes.
