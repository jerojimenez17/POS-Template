# QA Checklist: Restore product-search focus after a successful new sale

Source of truth: `SPEC.md`. This checklist records the isolated callback/ref
tests and integration coverage of the real
`ProductsTable` → `PrintableTable` → `ProductSearchBar` tree with the real
`BillButtons` and selected real `ClientSelectionModal` flows. All new work in
this QA iteration is tests/checklist only; production code and `SPEC.md` are
unchanged.

## Automated scenarios

- [x] **Factura success (AC-01):** valid CAE and persisted sale call the optional
  focus callback exactly once, only after reset dispatch; print is initiated.
- [x] **Remito success (AC-02):** persisted sale calls the focus callback once
  after reset dispatch; it does not depend on a CAE response.
- [x] **A cuenta create success (AC-03):** the unpaid-order success callback
  calls the focus callback once after reset dispatch.
- [x] **A cuenta append success (AC-03):** the existing-order success callback
  calls the focus callback once after reset dispatch.
- [x] **Presupuesto success (AC-04):** feature-enabled budget success calls the
  focus callback once after reset dispatch and starts printing.
- [x] **Factura failure (AC-05):** invalid CAE and rejected sale persistence do
  not call the focus callback.
- [x] **Remito failure (AC-05):** rejected sale persistence does not call the
  focus callback.
- [x] **Unpaid-order / budget failure (AC-05):** without the modal's success
  signal, the focus callback is not called.
- [x] **Ref delivery (AC-08 / AC-09):** the optional ref points to the single
  existing `#product-search-input`; focusing it retains the current query.
- [x] **Actual component wiring (AC-01/02/08/09):** mount the real
  `ProductsTable`, `PrintableTable`, `ProductSearchBar`, and `BillButtons`; a
  successful Remito closes the real confirmation dialog and eventually focuses
  the actual search input. The test proves it is not focused before the first
  queued frame or after only one frame, and is focused after the second.
- [x] **Focus-only state (AC-09):** the successful integration path retains a
  pre-existing search query while restoring focus.
- [x] **Actual unpaid-order modal success (AC-03/08):** the real
  `ClientSelectionModal` loads/selects a client, creates an unpaid order through
  its actual success branch, closes, and restores focus only after two deferred
  animation frames.
- [x] **Actual unpaid-order modal rejection (AC-05):** a failed create response
  leaves the modal open and does not focus search.
- [x] **Cancellation (AC-06):** cancelling the real Remito confirmation or the
  real A cuenta modal does not enqueue feature focus or execute checkout.
- [x] **Stale focus after cancellation (revalidated PASS):** a successful Remito
  queues deferred search focus; opening and cancelling a new Remito confirmation
  before either queued frame runs preserves the cancellation's focus outcome,
  and flushing both frames does not let the stale request steal focus to product
  search.
- [x] **Edit exclusion (AC-07):** a successful existing-sale update path does
  not focus the search input.
- [x] **Unmount/null ref safety (AC-08):** unmount the actual billing tree after
  success has queued deferred focus; flushing those frames does not throw.

## Remaining coverage gaps / limits

- [ ] Integrated Factura success and invalid-CAE/failure paths; these still have
  isolated `BillButtons` boundary coverage, but this integration suite uses the
  real Remito success and failure paths instead.
- [ ] Real `ClientSelectionModal` append-to-existing-order success/failure and
  real budget create success/failure/throw paths. Existing isolated
  `BillButtons` cases exercise the callback contract using a mocked modal; this
  iteration covers actual unpaid-order creation success and returned failure.
- [ ] Validation, inactive-session, and offline rejection flows and
  supplier-selection preservation; these require broader state/transition
  scenarios than the focused test boundary currently exercises.
- [ ] Product/bill mutation absence and `/` shortcut regression in this
  integration suite. The focused component contract checks query preservation,
  while prior shortcut suites remain the regression evidence for `/`.
- [ ] Static verification that the `/newBill` page remains a Server Component
  and broad AC-10 compatibility. The test mounts the existing client tree and
  does not alter the page or public server interfaces.

These items are untested, not inherently infeasible; no production behavior was
changed to make tests pass.

## G4 validation results

### Isolated boundary revalidation (Step 4 / Step 5 iteration 1)

**Focused feature tests: PASS — 11/11.** Rerun command:

```text
npm run test -- ai/features/focus-search-after-sale/bill-buttons-focus.test.tsx src/components/Billing/__tests__/ProductSearchBar.focus-ref.test.tsx
```

Latest Vitest output: `Test Files 2 passed (2)`, `Tests 11 passed (11)`,
duration `17.71s`. This covers success/failure callback boundaries and the
ProductSearchBar ref/query contract. A cuenta create/append and budget
completion are exercised via the modal's mocked `onSuccess` callback, not
through the real ClientSelectionModal actions.

**Affected billing regression suites: 49/71 pass; 22 baseline failures.**
Rerun command:

```text
npm run test -- src/components/Billing/__tests__/ProductSearchBar.test.tsx src/components/Billing/__tests__/PrintableTable.test.tsx src/components/Billing/__tests__/PrintableTable.barcode.test.tsx src/components/Billing/__tests__/PrintableTable-discount.test.tsx tests/components/PrintableTable.shortcuts.integration.test.tsx
```

Latest Vitest output: `Test Files 2 failed | 3 passed (5)`,
`Tests 22 failed | 49 passed (71)`, `Errors 10`, duration `17.63s`.
The failure split is unchanged: 11 assertions in `PrintableTable.test.tsx`
and 11 tests in `PrintableTable.barcode.test.tsx`. The first group mismatches
current print/table/layout/edit component behavior. The barcode group includes
timing/debounce tests that advance only 300ms or assert before the component's
900ms debounce / 400ms timeout behavior has completed. `ProductSearchBar.test.tsx`,
discount, and the printable-table shortcuts integration suites passed in this
run.

**Baseline classification:** The developer reports temporarily removing and
then restoring the feature changes, and independently reproducing the identical
22 PrintableTable/barcode failures against that baseline. The developer made no
production fixes. On that reported baseline comparison, classify these as
pre-existing baseline failures, not as failures introduced by this feature.
QA's rerun after restoration independently confirms the same failure count and
file split, but QA did not perform a separate pristine-checkout run; the
baseline attribution is explicitly based on the developer's reported
remove/restore reproduction.

**ProductSearchBar and button/shortcut regressions: PASS.** ProductSearchBar's
existing regression is included above (5 tests passed). The additional button
and shortcut rerun was:

```text
npm run test -- tests/components/BillButtons.test.tsx tests/components/BillButtons.shortcuts.test.tsx tests/context/BillReducer.shortcuts.test.ts tests/components/PrintableTable.shortcuts.integration.test.tsx
```

Latest Vitest output: `Test Files 4 passed (4)`, `Tests 38 passed (38)`,
duration `11.89s`. This is the four-suite rerun (38 tests); it supersedes the
previously reported 31/31 count for this rerun's exact file selection.

### G4 disposition and remaining coverage

**Feature-test subgate: PASS. Full G4 gate: BLOCKED / NOT A FULL-GATE PASS.**
At the time of that isolated revalidation, the feature-specific 11/11 pass and
the focused button/shortcut suites passed. The relevant regression command
exited with 22 known baseline failures, and baseline classification does not
turn that command green. The full suite has not been rerun in this revalidation; earlier attempts did not complete
(unhandled worker shutdown `Error: kill EPERM`, followed by a 600-second
constrained-run timeout with no final summary). Do not claim a full-suite pass
or infer a reliable full-suite failure total.

The outstanding coverage list above reflects the current focused integration
suite. The `/` shortcut is covered by the passing shortcut suites above, but
scanner/manual-search behavior remains among the baseline failures described
above.

### Integration iteration 2 results

Command:

```text
npm run test -- ai/features/focus-search-after-sale/bill-buttons-focus.test.tsx src/components/Billing/__tests__/ProductSearchBar.focus-ref.test.tsx ai/features/focus-search-after-sale/products-table-focus.integration.test.tsx
```

**PASS — 3 files, 19 tests.** This includes 11 prior isolated callback/ref
tests and 8 actual component-tree integration tests. Integration coverage now
demonstrates real Remito success, A cuenta create success and failure, checkout
and modal cancellation, edit exclusion, two-frame focus deferral, retained
search text, and unmount-safe queued focus. New integration tests also pass
ESLint. A project-wide `npx tsc --noEmit` was attempted and remains blocked by
existing errors in unrelated tests (`codebar`, `getProductsPaginated`, several
component/action tests, shortcut tests, and reducer tests); it reported no
diagnostics in the new integration test file.

The earlier 22 known PrintableTable/barcode regression failures remain noted
above; those affected suites were not rerun in integration iteration 2. No
production source or specification files were modified.

### Step 4 follow-up revalidation (reviewer iteration 1)

Developer reported no production-source changes after the previous iteration.
QA independently reran the feature and relevant regression selections:

**Focus-after-sale feature suites: PASS — 3 files, 19/19 tests.** Command:

```text
npx vitest run ai/features/focus-search-after-sale/bill-buttons-focus.test.tsx src/components/Billing/__tests__/ProductSearchBar.focus-ref.test.tsx ai/features/focus-search-after-sale/products-table-focus.integration.test.tsx
```

Output: `Test Files 3 passed (3)`, `Tests 19 passed (19)`, duration `29.62s`.
This includes the actual component-tree integration coverage.

**Existing bill/shortcut regression suites: PASS — 4 files, 38/38 tests.**
Command:

```text
npx vitest run tests/components/BillButtons.test.tsx tests/components/BillButtons.shortcuts.test.tsx tests/context/BillReducer.shortcuts.test.ts tests/components/PrintableTable.shortcuts.integration.test.tsx
```

Output: `Test Files 4 passed (4)`, `Tests 38 passed (38)`, duration `26.99s`.

**PrintableTable/barcode affected suites: FAIL — 22 known failures reproduced.**
Command:

```text
npx vitest run src/components/Billing/__tests__/PrintableTable.test.tsx src/components/Billing/__tests__/PrintableTable.barcode.test.tsx
```

Observed 11 failing assertions in `PrintableTable.test.tsx` and 11 failing
tests in `PrintableTable.barcode.test.tsx` (38 + 13 = 51 tests total; 22 fail,
29 pass). The failures match the previously recorded split; this rerun confirms
they remain, and does not represent a passing regression gate.

**Targeted ESLint: FAIL — 1 error, 2 warnings.** Command:

```text
npx eslint src/components/Billing/ProductsTable.tsx src/components/Billing/PrintableTable.tsx src/components/Billing/ProductSearchBar.tsx src/components/Billing/BillButtons.tsx ai/features/focus-search-after-sale/bill-buttons-focus.test.tsx src/components/Billing/__tests__/ProductSearchBar.focus-ref.test.tsx ai/features/focus-search-after-sale/products-table-focus.integration.test.tsx
```

The error is the existing `react-hooks/set-state-in-effect` at
`src/components/Billing/PrintableTable.tsx:135` (`setDisplayBannerCae`); the
two warnings are the existing `checkSession` dependency warning in
`BillButtons.tsx:87` and `bannerCae` missing dependency warning in
`PrintableTable.tsx:145`. No error was reported in the three focused feature
test files. This is targeted lint only; global lint was not run/passed.

### Latest G4 disposition and remaining gap

**Feature-test subgate: PASS (19/19). Full G4 gate: BLOCKED / NOT A FULL-GATE
PASS.** The relevant bill/shortcut regression selection also passes 38/38, but
the affected PrintableTable/barcode selection still has 22 failures and
targeted lint still reports the existing error above. Do not mark global lint,
typecheck, or the full test suite as passed; none was passed in this follow-up.

The stale-focus transition now has an integration test, but it is currently
failing: after a successful sale queues deferred search focus, a newly opened
Remito confirmation is cancelled before the queued callback runs; flushing the
frame queue then focuses `#product-search-input` instead of preserving the
cancellation's post-close focus outcome. Validation, inactive-session/offline
rejection, supplier preservation, and the other previously listed integration
gaps remain open.

### Reviewer follow-up iteration 2: stale focus after cancellation

Focused integration command:

```text
npm run test -- ai/features/focus-search-after-sale/products-table-focus.integration.test.tsx
```

**RED — 1 failing / 8 passing.** Vitest output: `Test Files 1 failed (1)`,
`Tests 1 failed | 8 passed (9)`, duration `20.43s`. The new test fails after
cancelling the second real Remito confirmation and flushing the deferred frame:
`document.activeElement` is the real product-search input, contrary to the
assertion that cancellation's focus outcome remains undisturbed. This is the
requested regression evidence; no production source or `SPEC.md` was edited in
this iteration.

### Step 4 revalidation (after generation-token fix)

QA independently reran all three feature suites and the related bill/shortcut
regressions after the developer's stale-focus cancellation fix. The targeted
PrintableTable/barcode selection was also rerun.

**Focus-after-sale feature suites: PASS — 3 files, 20/20 tests.** This includes
the stale-focus cancellation regression: after a successful-sale focus request
is queued, cancelling a newer Remito confirmation invalidates that stale
request, so flushing the queued frames does not steal focus from the
cancellation outcome. Command and exact Vitest summary:

```text
npx vitest run ai/features/focus-search-after-sale/bill-buttons-focus.test.tsx src/components/Billing/__tests__/ProductSearchBar.focus-ref.test.tsx ai/features/focus-search-after-sale/products-table-focus.integration.test.tsx
Test Files  3 passed (3)
Tests       20 passed (20)
Duration    26.89s
```

**Bill buttons and shortcut regressions: PASS — 4 files, 38/38 tests.**

```text
npx vitest run tests/components/BillButtons.test.tsx tests/components/BillButtons.shortcuts.test.tsx tests/context/BillReducer.shortcuts.test.ts tests/components/PrintableTable.shortcuts.integration.test.tsx
Test Files  4 passed (4)
Tests       38 passed (38)
Duration    23.91s
```

**Targeted PrintableTable/barcode regression: FAIL — 22 failures, 29 passes.**
The same split persists: 11 failures in `PrintableTable.test.tsx` and 11 in
`PrintableTable.barcode.test.tsx` (2 files, 51 tests total). Exact command and
summary:

```text
npx vitest run src/components/Billing/__tests__/PrintableTable.test.tsx src/components/Billing/__tests__/PrintableTable.barcode.test.tsx
Test Files  2 failed (2)
Tests       22 failed | 29 passed (51)
Duration    17.35s
```

These are the previously documented PrintableTable assertion/component-behavior
and barcode/manual-search timing/mocking failures. The earlier developer
remove/restore comparison reproduced this same 22-failure split against the
baseline; QA's current rerun confirms persistence, not an independent pristine
baseline run.

### Final G4 disposition and project-wide blockers

**G4 feature-test subgate: PASS (20/20). Full G4 gate: BLOCKED — not a full-gate
pass.** The cancellation race is now green, and bill/shortcut regressions pass
38/38. The affected PrintableTable/barcode command still fails 22 tests, so its
regression selection is not green.

Project-wide validations remain blockers based on prior recorded attempts; they
were not rerun in this revalidation:

- **Targeted ESLint:** previously failed with 1 error and 2 warnings. The error
  is `react-hooks/set-state-in-effect` at
  `src/components/Billing/PrintableTable.tsx:135` (`setDisplayBannerCae`); the
  warnings are the existing `checkSession` dependency warning in
  `BillButtons.tsx:87` and `bannerCae` missing dependency warning in
  `PrintableTable.tsx:145`. This was targeted lint, not global lint.
- **Project-wide TypeScript check:** the prior `npx tsc --noEmit` attempt was
  blocked by diagnostics in unrelated existing tests, including `codebar`,
  `getProductsPaginated`, component/action tests, shortcut tests, and reducer
  tests; it reported no diagnostics in the feature integration test.
- **Full test suite:** no successful complete run is recorded. Previous attempts
  did not produce a final suite summary: one ended with worker shutdown
  `Error: kill EPERM`, and a constrained attempt timed out after 600 seconds.

Accordingly, do not claim project-wide lint, typecheck, or the full test suite
passed. Only `TEST_CHECKLIST.md` was changed in this QA revalidation; no source
or test files were modified.
