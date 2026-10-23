# Sales CAE Classification — Test Checklist

## Search presentation classification

- [x] A valid normalized 14-digit CAE classifies as **Factura**, regardless of persisted `billType` and voucher conflicts.
- [x] A sale without valid CAE evidence classifies as **Remito**, even when `billType` or voucher metadata claims an invoice.
- [x] `FACTURA` and compatibility token `FACTURA_C` select the CAE-backed invoice group; `REMITO` selects the no-valid-CAE group.
- [x] Empty document-type selection keeps both presentation classes available.
- [x] Search row presentation shows invoice details only for valid CAE, and presents malformed/placeholder CAE as Remito/Facturar.
- [x] The Prisma candidate query does not include an excluding `billType` or voucher-type predicate.

## CAE normalization and edge cases

- [x] Null, missing, empty, whitespace, `null`, `undefined`, `SIN CAE`, `sin dato`, placeholder text, malformed/non-14-digit data, malformed JSON, and QR-only data are absence of CAE evidence.
- [x] Parsing/classification these values does not throw or drop the candidate from the opposite (Remitos) selection.
- [x] Current object and serialized-object CAE forms with valid 14-digit CAE remain recognized.

## Query constraints and pagination

- [x] All returned records remain scoped to the authenticated business and `paidStatus: "pago"`.
- [x] Seller, inclusive configured date bounds, and payment matching in either payment field remain active alongside document selection.
- [x] Derived document filtering scans beyond a raw candidate batch to fill the requested matching page.
- [x] Cursor pages preserve `(date DESC, id DESC)`, avoid duplicates/missing matching IDs, and derive continuation from matching rows.
- [x] Document filtering does not change cursor validation, take caps, or empty-selection behavior.

## Fiscal boundary

- [x] Search presentation classification does not infer or overwrite detailed fiscal `billType`, voucher type, invoice number/POS, or original voucher metadata.
- [x] A valid-CAE sale with conflicting/incomplete fiscal metadata remains ineligible for credit-note issuance and retains fiscal diagnostics.
- [x] A no-valid-CAE sale does not become credit-note eligible solely because it is presented as Remito or claims an invoice `billType`.
- [ ] A valid-CAE sale with explicitly persisted `billType: null` and otherwise supported invoice metadata remains classified as Factura for search while mapper fiscal normalization retains the explicit null as invalid/incomplete and provides no credit-note fiscal context/recovery.
- [ ] Existing returns, credit-note status, fiscal context, recovery behavior, and credit-note validation remain unchanged across the full regression suite.

## Supplemental TDD Step 2 — compatibility regressions

- [ ] A legacy raw order-ID cursor resolves its anchor only under the authenticated `businessId` and continues exclusively after `(date DESC, id DESC)` anchor position.
- [ ] Fetching all legacy-cursor continuation pages yields the expected ordered IDs exactly once, including rows tied on the anchor date and rows on an earlier date.
- [ ] Newly emitted cursors remain base64url JSON with exactly the existing `{ date, id }` fields and continue correctly as composite cursors.
- [ ] A raw ID belonging to another business and a nonexistent raw ID both return `{ sales: [], nextCursor: null }` without querying candidate pages or exposing cross-business anchor data.
- [ ] Search CAE classification does not omit or rewrite explicit nullable fiscal metadata before strict mapper normalization; a valid CAE does not make explicit `billType: null` newly credit-note eligible.

### Step 2 verification status

- New tests: `legacy-sales-cursor.test.ts` and `explicit-null-fiscal-boundary.test.ts`.
- Run serially with `npx vitest run ai/features/sales-cae-classification/legacy-sales-cursor.test.ts ai/features/sales-cae-classification/explicit-null-fiscal-boundary.test.ts --maxWorkers=1 --no-file-parallelism`.
- Expected TDD state before implementation: both target regressions are red against the current production behavior; confirm Vitest compiles the tests and records the intended assertion failures. Production source and existing tests must remain unchanged in this step.

## QA Step 4 — verification status

- Passed serially: `sales-cae-classification` (including the mixed-class empty-filter action case), `filters-provider-sales-filters`, filter serialization, `SalesTableGeneration`, and sales-history returns — **7 files, 42 tests passed**.
- The initial `SalesTable` request is asserted to send `cursor: undefined` and `{ documentTypes: [], paymentMethods: [] }`; its returned valid-CAE sale (`billType: Remito`) and no-valid-CAE sale (`billType: Factura B`) both render. This also verifies the default is independent of stored `billType`.
- Explicit `FACTURA`, `FACTURA_C`, and `REMITO` behavior, retained payment/seller/date constraints, candidate scanning, and cursor continuation passed in the classification tests.
- The fiscal mapper/eligibility and return-boundary subset passed; the broad regression item above remains unchecked pending a full credit-note regression run.
- See QA Step 4 test report for legacy suite failures that assert the superseded persisted-`billType` classification/default-filter behavior. Those failures do not change this checklist's expected behavior.
