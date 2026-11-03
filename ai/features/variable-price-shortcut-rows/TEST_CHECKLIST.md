# Variable-price shortcut rows — test checklist

This checklist follows [`SPEC.md`](./SPEC.md). Tests are intentionally limited to
this feature's cart-row identity, checkout projection, and stock-delta boundaries.

## G2 — QA tests

- [x] **Focused feature/action tests pass:** all 8 new tests pass after correcting
  the verified six-row expectation defect described below.
- [x] **Tests compile without relying on a missing production API declaration:**
  the proposed independent-add action is passed to the reducer through a local
  `BillAction` cast so the pre-implementation result is a behavioral failure.
- [x] **G2 RED verified:** the focused run fails on expected behavior assertions,
  rather than TypeScript/Vitest transform errors (5 failures: independent
  shortcut addition, row-local reducer behavior, normal/shortcut separation,
  and duplicate-id stock aggregation in create/update).

## Acceptance criteria coverage

| SPEC criterion | Test coverage / expected result |
| --- | --- |
| AC1 — repeated F1/F2/F3 adds | Shortcut component test activates each configured key twice for the same catalog product with deterministic UUID values. Expect six separate one-unit, zero-price rows, unchanged catalog ids, unique `cartRowId`s, and focus requests for the generated row ids. |
| AC2 — independent prices/totals | Reducer test sets two same-catalog rows to 4000 and 3400 and expects distinct values and a total of 7400. |
| AC3 — row-specific focus | Shortcut test requires focus requests to use each distinct new row id rather than the shared catalog id; a `PriceEditInput` test verifies only the input whose row id matches the request is focused/edited. Full table-to-input row-key wiring is not currently verified at this boundary. |
| AC4 — remove and amount edits target one row | Reducer test changes the second row quantity and removes the first; it checks the other row's id, price, quantity, and total are preserved. |
| AC5 — ordinary search/click/scan additions merge | Reducer test verifies repeated normal `addItem` calls merge into one ordinary row and that a legacy row with no cart-row id still merges. Search and barcode UI paths are not independently simulated; they share the default add path. |
| AC6 — normal additions do not merge into shortcut rows | Reducer test starts with a custom-priced row, adds a normal row separately, then adds normally again and expects only that ordinary row's quantity to increase. |
| AC7 — other shortcut behavior unchanged | Existing shortcut tests continue covering missing configuration, missing product/error, active-session, and sale-edit guards. The new test only exercises configured product additions. |
| AC8 — checkout and sale update retain lines/catalog ids and aggregate stock | Checkout component test asserts the actual `processSaleAction` payload contains distinct lines, true catalog ids, per-row prices/quantities, and no `cartRowId`. Action tests assert separate persisted order items and summed stock changes for sale creation and both stock directions during sale update. |
| AC9 — downstream row pricing | Snapshot and AFIP DTO tests assert both lines and their row prices/quantities survive projections and generated cart-row ids are not exposed in fiscal product DTOs. Budget/account and receipt/print integrations are not all directly traversed. |
| AC10 — no schema change / historical compatibility | Legacy-row reducer merge behavior is covered. Schema/migration absence is a change-review check rather than a runtime test assertion. |

## Targeted command

```sh
npm run test -- ai/features/variable-price-shortcut-rows/variable-price-shortcut-rows.test.tsx src/__tests__/actions/sale-variable-price-stock-aggregation.test.ts
```

Expected before implementation: behavioral failures for independent shortcut
addition/row-targeted reducer behavior and duplicate-id stock aggregation. Any
compile/transform failure is a test defect and must be fixed before accepting
those red assertions as TDD evidence.

## Step 4 QA validation evidence

- Confirmed the single focused-run failure was an assertion defect: the test
  intentionally dispatches F1, F1, F2, F2, F3, F3 (six successful activations),
  and observed six rows with `{ amount: 1, salePrice: 0 }`, while the expected
  array incorrectly used `Array(3)`. Corrected only that expected array to
  `Array(6)`; production source and `SPEC.md` were not changed by QA.
- Before correction, the focused command below produced **2 files / 8 tests:
  7 passed, 1 failed** at the erroneous three-versus-six array comparison.
- After correction, the focused command below passed: **2 files / 8 tests, all
  passed**. There were no transform or TypeScript execution errors.
- Related existing regression run: **12 files / 184 tests: 157 passed, 27
  failed**. Nine files passed, including the reducer, regular BillButtons,
  shortcut-table integration, and sales action regression files. Failures were:
  - `tests/components/BillButtons.shortcuts.test.tsx`: 4 failures in legacy
    assertions that expect shortcut additions via `addItem` and focus by
    catalog id. Those expectations conflict with the specified independent-row
    action and row-id focus behavior; classify as outdated test contracts, not
    evidence that the new feature expectation is wrong.
  - `src/components/Billing/__tests__/PrintableTable.test.tsx`: 12 failures
    across print/render, calculations, and inline amount-edit assertions. These
    are actual unresolved existing-suite failures; this run does not establish
    them as unrelated to the changed table implementation.
  - `src/components/Billing/__tests__/PrintableTable.barcode.test.tsx`: 11
    failures. Most report that barcode/search mocks were not called; the scan
    path also raises a mock lookup error for `getProductsByCode`. Classify as
    barcode/search test-mock/API contract failures, not as validated feature
    regressions; they remain unresolved.
- The related regression command was:

  ```sh
  npm run test -- tests/context/BillReducer.shortcuts.test.ts src/__tests__/context/BillReducer.test.ts src/__tests__/context/BillReducer-removeAll-default.test.ts tests/components/BillButtons.shortcuts.test.tsx tests/components/BillButtons.test.tsx src/components/Billing/__tests__/PrintableTable.test.tsx src/components/Billing/__tests__/PrintableTable.barcode.test.tsx src/components/Billing/__tests__/PrintableTable-discount.test.tsx tests/components/PrintableTable.shortcuts.integration.test.tsx src/__tests__/actions/processSaleAction.test.ts src/__tests__/actions/sales-history-report-returns.test.ts src/__tests__/actions/sales-history-credit-notes.test.ts
  ```
- `npx eslint ai/features/variable-price-shortcut-rows/variable-price-shortcut-rows.test.tsx src/__tests__/actions/sale-variable-price-stock-aggregation.test.ts`:
  **passed**. `git diff --check`: **passed** (Git only emitted line-ending
  conversion warnings for pre-existing developer-edited source files).
- Global validation per orchestration G4 definition is **BLOCKED**:
  - `npm run test`: **348 files; 66 failed, 279 passed, 3 skipped; 282 tests
    failed, 2935 passed, 2 skipped, 10 todo; 10 runtime errors**. Failures span
    unrelated existing feature/action/UI suites, database-backed tests (for
    example seed-debts foreign-key violations), test/API mock contract issues,
    and assertions in multiple existing components. The selected regression
    failures are detailed above. The full run also includes failures outside
    this feature, so this is not a feature-only result.
  - `npm run lint`: **failed**, 49 errors and 21 warnings project-wide. Errors
    include existing test `any`/`require` lint violations and application
    hook/style issues; `src/components/Billing/PrintableTable.tsx:136` is also
    flagged for `react-hooks/set-state-in-effect` and needs implementation-side
    triage. QA did not modify source to address lint.
  - `npx tsc --noEmit`: **failed** on project test/type errors including
    incomplete Product fixtures (`codebar`, `seed-debts`), stale query result
    fields (`getProductsPaginated`), cart/product component fixtures, auth
    action mocks and existing shortcut/reducer tests. No diagnostic was
    reported for the feature test or the stock aggregation test.
- **G4 disposition: NOT MET.** The focused feature/action tests are green, but
  G4 requires the full test, lint, and typecheck commands to pass.

## QA correction — legacy quantity/shortcut expectations

- Updated the four stale configured-shortcut assertions in
  `tests/components/BillButtons.shortcuts.test.tsx`: successful F1/F2/F3
  variable-price additions are asserted through `addIndependentItem`, preserve
  the catalog id, have `amount: 1` / `salePrice: 0` and a generated
  `cartRowId`, and do not call normal `addItem`. The focus assertion now
  verifies the requested focus id is the newly added row's `cartRowId`.
- Added negative assertions for the independent-add path to existing
  missing-config/edit/error-fetch guards; existing missing-product, session,
  and sale-edit behavior remains covered without changing its expected result.
- Updated only the quantity-edit test in
  `src/components/Billing/__tests__/PrintableTable.test.tsx`. Its +/− clicks
  now run through the real bill reducer and verify the displayed quantity
  changes 5 → 6 → 5, rather than expecting the obsolete remove/add callback
  sequence.
- Focused validation: `npm run test -- tests/components/BillButtons.shortcuts.test.tsx`
  passed (**1 file / 26 tests**); the focused quantity-edit test passed (**1
  test**, 37 other tests skipped) via
  `npm run test -- src/components/Billing/__tests__/PrintableTable.test.tsx -t "buttons still work for increment/decrement"`.
- Full `PrintableTable.test.tsx` validation: **1 file / 38 tests; 27 passed,
  11 failed**. The updated quantity-edit test passes. The remaining failures
  are the pre-existing print/render, search placeholder, billing-info, and
  inline amount-input failures; they were not changed. The barcode suite's 11
  existing timing/mock failures were not rerun or modified.
- `npx eslint tests/components/BillButtons.shortcuts.test.tsx
  src/components/Billing/__tests__/PrintableTable.test.tsx`: **passed**.
- `npx tsc --noEmit --pretty false`: **fails on existing project test typing
  errors** (stale/incomplete fixture types, auth mock types, etc.); it reported
  no diagnostics for either of the two edited test files. Both updated suites
  transpile and execute under Vitest, with no transform/compile errors.
- No production source or `SPEC.md` was changed for this correction.

## Test-boundary limitations

- Browser DOM focus across the rendered billing table, including React keys and
  focus-request consumption between same-catalog rows, needs an integrated table
  test once row ids are wired through the row/input props. The shortcut test
  verifies the emitted focus target only.
- Search, result click, and barcode scanning are tested at their shared reducer
  boundary, not through separate scanner/search workflows.
- Receipt, budget, and account UI flows are not exercised end-to-end. Their
  output mapping should remain a review item unless a stable focused boundary is
  available; the checkout snapshot and AFIP projection are asserted directly.
- AC10's no-database-change requirement cannot be robustly proven by runtime
  tests; verify it in the implementation diff and schema/migration review.

## Step 4 — independent QA revalidation (2026-11-03)

Reran the requested tests independently after the stale shortcut and quantity
assertions were updated. No production source or test files were edited during
this revalidation; this checklist is the only file changed here.

| Command | Latest result |
| --- | --- |
| `npm run test -- ai/features/variable-price-shortcut-rows/variable-price-shortcut-rows.test.tsx` | **PASS** — 1 file, 6/6 tests. |
| `npm run test -- src/__tests__/actions/sale-variable-price-stock-aggregation.test.ts` | **PASS** — 1 file, 2/2 tests. Together, these are the feature/action **8/8** tests. |
| `npm run test -- tests/components/BillButtons.shortcuts.test.tsx` | **PASS** — 1 file, 26/26 tests. Updated row-id and independent-add assertions pass. |
| `npm run test -- tests/components/BillButtons.test.tsx` | **PASS** — 1 file, 4/4 tests. |
| `npm run test -- src/components/Billing/__tests__/PrintableTable.test.tsx -t "buttons still work for increment/decrement"` | **PASS** — 1 test passed; 37 skipped. |
| `npm run test -- src/components/Billing/__tests__/PrintableTable.test.tsx` | **FAIL** — 1 file, 27/38 passed and 11 failed. Failures remain in print invocation/styles, billing info, search placeholder, calculations, and inline amount editing; the changed quantity-edit test passes in the focused run. |
| `npm run test -- src/components/Billing/__tests__/PrintableTable.barcode.test.tsx` | **FAIL** — 1 file, 2/13 passed and 11 failed. Failures involve timer/search/lookup calls, scan outcomes, feedback reset, and input clearing; they remain unresolved and are not marked green. |
| `npm run test` | **FAIL** — 348 files: 280 passed, 65 failed, 3 skipped; 3,229 tests: 2,940 passed, 277 failed, 2 skipped, 10 todo. Existing broad-suite failures include database-backed and mock/API-contract failures, plus the `PrintableTable` and barcode failures above. This is not a feature-only failure. |
| `npm run lint` | **FAIL** — 49 errors and 21 warnings project-wide, including existing test typing/lint findings and application hook/style violations. `PrintableTable.tsx:136` remains flagged for `react-hooks/set-state-in-effect`; not changed by QA. |
| `npx tsc --noEmit --pretty false` | **FAIL** — project-wide pre-existing test/type errors (incomplete Product fixtures, stale product query result fields, incomplete component/auth mocks, etc.). No diagnostic names either new variable-price feature/action test. |

**Current G4 disposition: NOT MET.** Focused feature/action, updated shortcut,
existing `BillButtons`, and targeted quantity-edit tests pass. The unresolved
full `PrintableTable`, barcode, full Vitest, lint, and typecheck commands prevent
marking G4 green. The `PrintableTable` and barcode failures remain open rather
than being assumed unrelated or treated as passes.

## Reviewer iteration 1 — additional regression gaps (2026-11-03)

These tests address the three additional implementation gaps reported in
reviewer iteration 1. They intentionally describe expected behavior against the
history mapper, the `DecimalInput` callback/reducer boundary, sale create/update,
and budget item mapping. Failures below are expected RED evidence against the
current implementation, not test compilation failures.

| Gap | Deterministic acceptance check |
| --- | --- |
| Historical sale/edit hydration | Map two persisted `OrderItem`s with one catalog `productId`. Expect distinct deterministic client `cartRowId`s, while retaining the catalog id, each line's saved price and quantity. Separately verify that price editing, fractional quantity editing, and removal by those row ids affect only the selected historical row. |
| Fractional shortcut quantity input | Render `DecimalInput` for a shortcut row with a fractional unit and a same-catalog sibling. Confirming `2,75` must update through the row id, preserve the edited row's catalog identity, and leave the sibling's quantity and price unchanged. |
| Explicit zero line price | Sale creation, sale update, and budget item mapping receive a row with `salePrice: 0` and nonzero catalog `price`. Expect persisted line `price: 0` and `subTotal: 0` (cost remains available as `costPrice`), without fallback to catalog cost. |

### Focused RED verification

Command:

```sh
npm run test -- ai/features/variable-price-shortcut-rows/history-and-decimal-row-identity.test.tsx ai/features/variable-price-shortcut-rows/zero-sale-price-budget.test.ts src/__tests__/actions/sale-variable-price-stock-aggregation.test.ts
```

Result: **3 files; 7 failed, 2 passed (9 tests total)**. All seven failures
reached behavioral assertions; Vitest reported no TypeScript transpilation,
Vite transform, or module-resolution errors. The two passing tests are the
existing sale stock aggregation create/update regressions in the same action
test file. Specific observations:

- History mapping returns `cartRowId: undefined` for both duplicate catalog
  lines. The separate row-price test leaves the first price at `400` rather than
  updating it to `450`; the quantity test leaves the second amount at `1` rather
  than `1.5`. The duplicate lines therefore cannot be independently edited or
  removed by client row identity.
- `DecimalInput` leaves the targeted row at `1.25` rather than `2.75` when
  confirming the fractional amount; the component currently targets catalog
  `product.id`, so the row-id reducer callback does not update the row.
- Budget mapping sends `price: 125` and `subTotal: 250` instead of the explicit
  zero sale price and zero subtotal.
- Sale creation and update each send `price: 125` and `subTotal: 250` for the
  row whose `salePrice` is zero.

Additional checks:

- Targeted `npx eslint` for the three test files: **passed**.
- `git diff --check`: **passed**; Git emitted line-ending conversion warnings
  for pre-existing developer-modified files only.
- No production source or `SPEC.md` was edited for this reviewer iteration.

**G2 status: PASS — QA tests are scoped, deterministic, and verified RED on the
implementation gaps.** This is a test-authoring/RED status, not implementation
acceptance: all three reviewer gaps remain open until implementation makes the
focused assertions pass.

## Step 4 — independent revalidation after reviewer iteration 1 (2026-11-03)

Reran the new feature/action tests and the requested regressions after the
developer addressed reviewer iteration 1. QA made no source or test changes;
this checklist is the only file updated during this validation.

### New feature/action tests

| Command | Result |
| --- | --- |
| `npm run test -- ai/features/variable-price-shortcut-rows/variable-price-shortcut-rows.test.tsx` | **PASS** — 1 file, 6/6 tests. |
| `npm run test -- ai/features/variable-price-shortcut-rows/history-and-decimal-row-identity.test.tsx` | **PASS** — 1 file, 4/4 tests. Confirms duplicate historical lines receive distinct row ids, row-targeted price/quantity/removal, and `DecimalInput` updates the selected row by identity. |
| `npm run test -- ai/features/variable-price-shortcut-rows/zero-sale-price-budget.test.ts` | **PASS** — 1 file, 1/1 test. Budget persists `price: 0` and `subTotal: 0` despite nonzero cost. |
| `npm run test -- src/__tests__/actions/sale-variable-price-stock-aggregation.test.ts` | **PASS** — 1 file, 4/4 tests. Sale creation and update preserve duplicate product lines and explicit zero prices; stock changes for repeated product ids are aggregated for create and both update directions. |
| Combined focused run of the four files above | **PASS** — 4 files, 15/15 tests. |

### Requested regressions

| Command | Result |
| --- | --- |
| `npm run test -- tests/components/BillButtons.shortcuts.test.tsx` | **PASS** — 1 file, 26/26 tests, including independent shortcut additions and row-id focus. |
| `npm run test -- tests/context/BillReducer.shortcuts.test.ts src/__tests__/context/BillReducer.test.ts src/__tests__/context/BillReducer-removeAll-default.test.ts` | **PASS** — 3 files, 52/52 tests. |
| `npm run test -- src/__tests__/actions/sales-history-credit-notes.test.ts` | **PASS** — 1 file, 16/16 tests. |

There is no standalone `DecimalInput` regression suite; its row-identity
regression is exercised by the passing `history-and-decimal-row-identity` tests.
At the time of the first reviewer revalidation, no dedicated assertion covered
one-to-one matching of duplicate lines in the order-update audit/history record.
That audit coverage gap is addressed in the follow-up validation below.

### Reviewer findings and gates

- **Fixed and verified by focused tests:** saved-line hydration assigns distinct
  row ids while preserving catalog ids and saved line values; `DecimalInput`
  uses row identity for fractional quantity changes; explicit zero sale price
  survives sale creation, sale update, and budget mapping; sale update retains
  repeated product lines and aggregates stock deltas by catalog id.
- **Not independently confirmed:** one-to-one duplicate-line matching in the
  order-update audit/history record, because no direct test for that behavior is
  present in the discovered suites. Do not treat the adjacent order update
  persistence/stock assertions as proof of this audit/history-specific behavior.
- **G4 global state: NOT MET.** This requested validation was focused; the full
  suite, lint, and typecheck were not rerun here. The latest recorded global
  results remain failing: `npm run test` had 65 failing files (277 failed tests),
  `npm run lint` had 49 errors and 21 warnings, and `npx tsc --noEmit --pretty
  false` reported project-wide errors. These are remaining gates, not green
  results; the focused passes above do not override them.

## Reviewer iteration 2 — duplicate-line audit quantity assertion (2026-11-03)

- **Coverage added:** the existing sale-update action test now inspects the
  `orderUpdate.create` audit payload for two old lines with the same catalog
  product id and different source quantities (`1`, then `4`). For corresponding
  replacement lines with quantities `2` and `3`, it asserts the audit records
  `quantity: { from: 1, to: 2 }` on the first update line and
  `quantity: { from: 4, to: 3 }` on the second. This fails if both audit lines
  reuse the first old quantity (`1`).
- **Source contract verified:** `updateOrderAction` reads prior order items in
  `addedAt ASC, id ASC` order, queues old quantities per catalog product, then
  consumes each product's old quantities once in updated-product input order.
  The audit type represents these values as `quantity.from` and `quantity.to`;
  no product-row identifier is part of this audit shape. The test exercises that
  existing occurrence-order contract without changing production code or SPEC.
- **Command:**
  ```sh
  npm run test -- src/__tests__/actions/sale-variable-price-stock-aggregation.test.ts
  ```
- **Result: PASS** — 1 file, 4/4 tests; the focused action suite completed with
  no transform or runtime errors. The new audit assertion is included in the
  existing sale-update case, alongside the replacement-line and stock-delta
  checks.

## Step 4 — independent revalidation after one-to-one update-history assertion (2026-11-03)

Reran the feature/action suites and requested regressions after the sale-update
test added the duplicate-line one-to-one audit/history quantity assertion. QA
made no production or test edits; this checklist is the only file updated.

| Command / suite | Latest result |
| --- | --- |
| `npm run test -- ai/features/variable-price-shortcut-rows/variable-price-shortcut-rows.test.tsx` | **PASS** — 1 file, 6/6 tests. |
| `npm run test -- ai/features/variable-price-shortcut-rows/history-and-decimal-row-identity.test.tsx` | **PASS** — 1 file, 4/4 tests, including historical duplicate-line hydration, row-local reducer updates/removal, and the DecimalInput fractional update. |
| `npm run test -- ai/features/variable-price-shortcut-rows/zero-sale-price-budget.test.ts` | **PASS** — 1 file, 1/1 test. |
| `npm run test -- src/__tests__/actions/sale-variable-price-stock-aggregation.test.ts` | **PASS** — 1 file, 4/4 tests; includes the updated one-to-one audit/history assertion matching old quantities `1` and `4` to replacement quantities `2` and `3`, along with sale-line and stock aggregation checks. |
| Four feature/action suites above | **PASS** — 4 files, 15/15 tests. |
| `npm run test -- tests/components/BillButtons.shortcuts.test.tsx` | **PASS** — 1 file, 26/26 tests. |
| `npm run test -- tests/context/BillReducer.shortcuts.test.ts src/__tests__/context/BillReducer.test.ts src/__tests__/context/BillReducer-removeAll-default.test.ts` | **PASS** — 3 files, 52/52 tests. |
| `npm run test -- ai/features/variable-price-shortcut-rows/history-and-decimal-row-identity.test.tsx -t "fractional shortcut quantity"` | **PASS** — 1 focused DecimalInput test passed; 3 other tests skipped by the name filter (4 total). |

The first concurrently launched stock action run also reported **4/4 passed**,
but Vitest emitted a worker shutdown `kill EPERM` warning after its pass summary.
The same suite was rerun alone and completed cleanly with **4/4 passed**. There
were **0 test assertion failures** across this revalidation. Counting each
requested test execution (including the DecimalInput test repeated as a focused
run) gives **94 passed and 3 filter-skipped**; the four feature/action files
contribute 15/15 passing tests.

**Global gates remain BLOCKED / NOT MET.** The full test suite, lint, and
typecheck were not rerun in this focused revalidation. Keep their latest prior
recorded results and failures above; the focused green runs do not change the
global gate disposition.
