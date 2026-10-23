# SPEC: Classify sales search results by CAE presence

## Status and scope

- **Stage:** G1 architecture/specification only.
- **Feature:** `/(protected)/searchBill` / `getSalesAction`.
- **Deliverable:** this specification. Do not change production code or add tests in G1.
- **No schema or dependency change is expected.**

Update sales search so its invoice/remito presentation is determined by the
presence of a valid persisted CAE, not by persisted `billType`, voucher type,
or agreement between those metadata fields. This is a search-presentation rule
only. Fiscal metadata and credit-note validation retain their existing stricter
rules.

## Current flow and findings

1. `src/app/(protected)/searchBill/page.tsx` supplies initial sales to
   `SalesTable`; `src/components/Billing/SalesTable.tsx` also requests data
   through `getSalesAction` when filters change, on refresh, and when loading
   another cursor page.
2. `FilterBillPanel` exposes Facturas and Remitos switches and payment-method
   switches. `FiltersProivder` currently initializes Remito and Efectivo as
   active, while Factura and the other payment methods are inactive; seller and
   date filters are inactive. `serializeSalesFilters` sends active selections
   as document-type/payment-method filters, so the first request is currently
   restricted to Remitos paid in cash. Removing persisted `billType` from the
   Prisma `where` alone does not remove these derived/client-filter
   restrictions. `FACTURA_C` is a legacy token meaning all invoice variants,
   not only type C.
3. `src/actions/sales/get-sales.ts` currently queries by business and
   `paidStatus: "pago"`, plus seller, payment, and date filters. It does not put
   `billType` in the Prisma `where`. Instead, it classifies fetched candidates
   with `classifySalesDocument` and discards candidates that do not match an
   active document filter. The classifier can return `UNKNOWN` for a CAE-backed
   sale when `billType`, `afipVoucherType`, or historical metadata is missing,
   unsupported, or conflicts. Such paid sales are consequently absent from
   the filtered search result even though their CAE should make them Facturas.
4. The classifier in `src/services/sales-document-classification.ts` is
   intentionally fiscal-metadata-aware. It currently combines bill type,
   voucher type, historical JSON metadata, and CAE validity. It is used both by
   search filtering and by `mapOrderToBillState` to recover the detailed fiscal
   bill type.
5. `Order.CAE` is nullable Prisma `Json?`. The normal issuance path in
   `src/actions/sales/process.ts` persists the ARCA response object, whose
   `CAE` property is a string and whose optional/adjacent fields include
   `vencimiento`, `nroComprobante`, `qrData`, and `ptoVenta`. `src/lib/cae.ts`
   parses that object (including a JSON-serialized object) into the app's CAE
   shape. Historical classification also knows nested `CAE` / `cae` values.
   `normalizeCae` in `src/services/afip/credit-note.ts` trims and recognizes
   placeholder values; the existing classifier additionally requires a
   14-digit numeric CAE.
6. `mapOrderToBillState` in `src/actions/sales/history.ts` separately maps the
   CAE and derives a fiscal `billType`. `SaleAccordion` currently treats any
   nonblank `sale.CAE.CAE` as official for its invoice-number versus Facturar
   presentation. A placeholder or malformed nonblank string is therefore not
   equivalent to valid CAE presence and must not become an invoice merely
   because it is truthy.
7. The query includes `returns`; mapping sales also builds credit-note context,
   diagnostics, and recovery data from the stricter fiscal normalizer. This
   behavior must remain independent of the search presentation class.

## Required behavior

### 1. One presentation classification rule

For sales-search classification, define exactly two classes:

| CAE evidence | Search class |
|---|---|
| A valid, normalized CAE is present | `FACTURA` (visible label: **Factura** / Facturas filter) |
| No valid, normalized CAE is present | `REMITO` (visible label: **Remito** / Remitos filter) |

This rule applies regardless of `billType`, `afipVoucherType`, their nullability,
whether they are unsupported or disagree with one another, and whether
historical JSON contains conflicting document-type metadata. In particular,
`billType: "Remito"` with a valid CAE is a Factura for search; a sale with no
valid CAE is a Remito for search even if it says `Factura A/B/C` or has an
invoice voucher code. Do not classify search presentation as `UNKNOWN` based
on these metadata conflicts.

This is not permission to infer or repair the *fiscal invoice subtype*. Do not
replace a valid fiscal `billType` with the generic presentation label, infer
Factura A/B/C from CAE presence, or use the presentation class to authorize a
credit note.

### 2. Robust CAE presence

Use existing persisted-value parsing and CAE normalization rather than a
truthiness check or `billType` fallback:

- Parse the persisted `Order.CAE` using existing CAE parsing/normalization
  utilities. Support the current JSON object shape and JSON-serialized object
  shape already handled by the repository; retain recognized historical
  nested CAE aliases where the current historical parser supports them.
- A CAE counts as present only after normalization yields a 14-digit numeric
  value (`/^\d{14}$/`). This matches existing valid-CAE classification and
  credit-note safety expectations. Treat parse failures and malformed values
  as absence for *search presentation*; do not throw or drop the sale.
- `null`, missing values, empty or whitespace-only strings, and placeholders
  recognized by `normalizeCae` (including values such as `"null"`,
  `"undefined"`, `"sin CAE"`, `"sin dato"`, and placeholder text) are not CAE
  evidence. QR data, invoice number, POS, voucher type, and bill type alone are
  not CAE evidence.
- If there is no valid CAE by this definition, the presentation class is
  Remito, even if some unrelated fiscal metadata exists. Fiscal diagnostics
  may still flag malformed/incomplete metadata separately.

Keep a single shared rule for filtering and search-row presentation so a sale
cannot pass one path as Factura and render through another path as Remito (or
vice versa). If a presentation-only field/helper is needed, keep it separate
from `BillState.billType` and fiscal metadata.

### 3. Document-type filtering and database query

- The Prisma sales query must include every paid sale in the authenticated
  business that satisfies the active seller, payment-method, date, and cursor
  constraints, regardless of persisted `billType`, `afipVoucherType`, or CAE
  representation. No document-type `where` clause may restrict candidates by
  `billType` or voucher subtype.
- Preserve the existing UI tokens and semantics: `FACTURA` and/or
  `FACTURA_C` select the derived Factura class; `REMITO` selects the derived
  Remito class. `FACTURA_C` remains a compatibility wire token for all
  Facturas. If no document type is selected, do not filter out either class.
- Retain server-side derived filtering in `getSalesAction`: fetch ordered paid
  candidates without a persisted document-type restriction, derive the class
  from valid CAE evidence, and apply the active document-type selection before
  determining the returned page. Client-side-only filtering of a fetched page
  is not acceptable because it can produce short/incorrect pages and hide
  matching rows beyond the page boundary.
- The presentation type filter must not modify or weaken business isolation,
  `paidStatus: "pago"`, seller equality, the split-payment OR matching either
  stored payment field, inclusive configured date bounds, cursor validation,
  or the stable order `(date DESC, id DESC)`.

### 3a. Initial SearchBill load defaults

- The first SearchBill request must return all paid sales in the authenticated
  business by default, including both CAE-backed Facturas and sales without a
  valid CAE presented as Remitos. It must not default to a subset based on
  document type or payment method.
- On initial load, document-type and payment-method switches are inactive, and
  the serialized `documentTypes` and `paymentMethods` arrays are both empty.
  Seller and date filters remain inactive as they are today.
- Keep all document-type and payment-method controls available and functional
  for explicit user filtering after load. Selecting a control must continue to
  narrow results using the existing filter semantics.

### 4. Pagination

Document filtering occurs on the derived class while scanning the existing
ordered candidate stream. Continue scanning subsequent batches until there are
`take + 1` matching rows or no candidates remain. Compute `hasMore` and
`nextCursor` from matches, not from raw candidates. A returned cursor must
resume strictly after the last returned matching row using the existing
`(date, id)` ordering; candidates skipped because their derived class did not
match must not cause a matching sale to be skipped on the next page. Preserve
the take cap and current cursor encoding/invalid-cursor behavior.

#### Cursor compatibility and wire contract

- Continue emitting the current composite cursor in the exact checked-in shape:
  base64url-encoded JSON with the `date` ISO string and `id` string fields.
  Do not rename fields, change the encoding, or switch newly emitted cursors
  back to raw IDs. This preserves the existing `nextCursor` contract.
- Also accept legacy cursors whose entire cursor value is a raw order ID, as
  emitted before composite cursors were introduced. Resolve that ID to its
  order `date` using an order lookup constrained by the authenticated
  `businessId` (never resolve an ID globally and then use its date). Use the
  resolved `{ date, id }` as an exclusive keyset position under the same
  stable `(date DESC, id DESC)` ordering: continue with rows whose date is
  earlier, or whose date is equal and ID sorts lower. The legacy row itself
  must not be returned again. Apply the request's current paid-status, seller,
  payment, date, and presentation filters to subsequent candidates as usual.
- If a legacy ID does not resolve to an order in the authenticated business,
  treat it as an invalid cursor; do not leak whether the ID exists in another
  business. Likewise, malformed composite data, invalid dates, invalid IDs,
  and unresolvable cursor values must fail safely with the established empty
  result (`sales: []`, `nextCursor: null`), without throwing or broadening the
  query. Valid current composite cursors and valid legacy raw-ID cursors must
  both continue rather than being rejected.
- Cursor position and page continuation must remain exclusive and deterministic
  for equal-date rows. A cursor lookup must not weaken business isolation or
  change the existing stable ordering.

### 5. Mapper and fiscal behavior boundaries

- Ensure search rows preserve the CAE needed for the official invoice
  presentation when it can be parsed. Any official-versus-remito UI decision
  must use the robust valid-CAE rule above, not merely a nonempty string.
- Keep detailed fiscal `billType`, voucher subtype, invoice number/POS,
  original voucher data, fiscal diagnostics, and credit-note recovery sourced
  and validated by existing fiscal normalization. Search class must not mask
  fiscal conflicts or make an otherwise ineligible sale eligible.
- Derive the CAE-based search presentation independently. Before calling
  `normalizeSaleFiscalMetadata`, pass fiscal fields through without
  classification-based omission, defaulting, or rewriting: when a persisted
  fiscal property is explicitly present, preserve its original value,
  including `null` or `undefined`; when the property is genuinely absent,
  keep it absent. Do not substitute the presentation class (Factura/Remito),
  infer a fiscal subtype from CAE, or turn an explicit null into an omitted
  optional property. This preserves the normalizer's strict distinction: an
  explicit `null` such as `billType: null` remains invalid/incomplete if the
  current normalizer treats it that way, while a missing optional field follows
  the current missing-field/recovery behavior. An explicit `undefined` must not
  be coerced to `null` or to an inferred fiscal value; retain it as provided
  (the normalizer may treat it as missing according to its existing semantics).
- Consequently, a valid CAE may make the sale display as a Factura for search,
  but a valid CAE combined with explicit `billType: null` must not become
  credit-note-eligible merely because search classification ignored or
  repaired that fiscal value. Fiscal eligibility continues to depend solely on
  `normalizeSaleFiscalMetadata` and existing content/return checks.
- Preserve inclusion and mapping of `returns`, manual-return data, credit-note
  status, and fiscal return data. Do not alter credit-note issuance/validation
  or historical fiscal repair behavior as part of this feature.

## Contracts and implementation boundaries

- `GetSalesResult` remains `{ sales: BillState[]; nextCursor: string | null }`.
- Existing `SalesFilters.documentTypes` tokens remain backward compatible.
- No Prisma schema change, data migration, or new dependency.
- Expected implementation touchpoints (confirm during development):
  - `src/actions/sales/get-sales.ts`: derive/filter by CAE presentation class;
    retain all non-document query constraints and cursor scan behavior.
  - `src/services/sales-document-classification.ts` and/or an appropriately
    named shared helper: isolate presentation classification from detailed
    fiscal type recovery; do not weaken existing fiscal rules.
  - `src/actions/sales/history.ts` and `src/lib/cae.ts`: only if needed to
    provide consistent robust CAE parsing/presentation without changing fiscal
    metadata validation.
  - `src/components/Billing/SaleAccordion.tsx` and
    `src/components/Billing/serialize-sales-filters.ts`: only as needed to
    align visible search cues and current Facturas/Remitos switches with the
    shared derived class and preserve current wire tokens.
- `src/services/afip/credit-note.ts` and
  `src/actions/sales/credit-note.ts` are protected behavior boundaries: no
  changes to fiscal validation/issuance semantics for this search-only rule.

## Measurable acceptance criteria

1. **CAE overrides conflicting type:** For a paid sale in the selected
   business with a valid 14-digit CAE and `billType: "Remito"`, selecting
   Facturas returns the sale, selecting Remitos does not, and its visible
   search class is Factura.
2. **CAE overrides null/unsupported/conflicting metadata:** A valid-CAE sale
   with `billType: null`, an unsupported `billType`, an invalid voucher type,
   or conflicting persisted/historical type metadata is still included by the
   Facturas filter and excluded by the Remitos-only filter. Classification does
   not throw.
3. **No CAE remains Remito independent of metadata:** A paid sale with no CAE
   but `billType: "Factura B"` and/or voucher type `6` is included by the
   Remitos filter and excluded by the Facturas-only filter.
4. **Invalid and placeholder CAE do not count:** For each of `null`, missing,
   `""`, whitespace, `"SIN CAE"`, `"null"`, placeholder text, malformed
   non-14-digit data, malformed JSON, and QR-only metadata, Facturas excludes
   the sale and Remitos includes it. The action does not throw.
5. **Current invoice variants remain one filter group:** Each existing
   supported persisted invoice subtype with a valid CAE is returned by the
   current `FACTURA_C` token; no subtype is excluded due to a conflicting
   persisted type. `FACTURA` and `FACTURA_C` retain the documented all-invoice
   meaning.
6. **Unselected document switches preserve all classes:** When
   `documentTypes` is empty, a mixed set of valid-CAE and no-valid-CAE paid
   sales is returned without document-type filtering.
7. **Unfiltered initial request shows both classes:** On the first SearchBill
   load, the request serializes `documentTypes: []` and `paymentMethods: []`;
   with no active seller or date filters it returns paid sales across payment
   methods and includes both CAE-backed Facturas and no-valid-CAE Remitos.
   Document-type and payment-method controls remain available for explicit
   filtering by the user.
8. **Other active filters are unchanged:** With each document-type selection,
   every returned row still belongs to the authenticated business, has
   `paidStatus: "pago"`, satisfies the seller filter, matches either payment
   column under split payment, and falls within configured date bounds. A row
   failing any of these non-document filters is never returned.
9. **Filter-before-page semantics:** Given more than one fetch batch containing
   both matching and nonmatching derived classes, a request for `take = N`
   returns exactly `N` matching rows when at least `N` exist, not fewer merely
   because early candidates had another class.
10. **Cursor continuity:** Fetch all pages for a fixture spanning at least two
   candidate batches with interleaved Facturas/Remitos and equal-date rows.
   Concatenating pages for each document selection yields exactly the matching
   rows in `(date DESC, id DESC)` order, with no duplicate or missing IDs; each
   next page begins after the prior page's last returned match, and the final
   cursor is `null`.
11. **Returns and credit-note fiscal safety:** Search results still include
    mapped return/credit-note metadata. Conflicting or incomplete fiscal
    metadata may keep credit-note eligibility false / diagnostics present, even
    when the presentation class is Factura due to a valid CAE. A no-CAE sale
    must not become credit-note-eligible solely because search presents it as
    Remito or because `billType` claims an invoice.
12. **Current cursor wire shape remains stable:** Every newly emitted non-null
     cursor decodes as base64url JSON with exactly the existing `date` and `id`
     fields (date represented as an ISO string); subsequent-page behavior and
     `GetSalesResult` remain compatible. Do not emit raw IDs for new cursors.
13. **Legacy raw-ID cursor compatibility:** Given a valid raw order-ID cursor
     for a row in the authenticated business, the next page returns only rows
     strictly after that row in `(date DESC, id DESC)` order, including the
     correct lower-ID continuation among rows sharing its date, with no repeat
     of the cursor row. The lookup is constrained by `businessId`.
14. **Legacy cursor tenant isolation and malformed safety:** A raw ID belonging
     only to another business, a nonexistent ID, malformed cursor text, invalid
     composite JSON/date/ID, or an unresolved cursor returns `{ sales: [],
     nextCursor: null }`, causes no uncaught error, and never returns or uses
     another tenant's row date. A valid composite cursor continues normally.
15. **Fiscal explicit null survives search classification:** A valid-CAE sale
     with an explicitly persisted `billType: null` is presented/classified as
     Factura by CAE but is passed unchanged to `normalizeSaleFiscalMetadata`;
     it retains the normalizer's invalid/incomplete result/diagnostic and has no
     credit-note fiscal context or eligibility. Search classification does not
     repair it from voucher metadata.
16. **Missing and undefined fiscal values are not conflated with null:** For a
     valid CAE with bill type genuinely absent, normalization follows existing
     missing-field recovery semantics; with an own `billType` property whose
     value is `undefined`, the original value is preserved and not converted to
     `null` or inferred by presentation logic. Explicit `null` remains subject
     to strict normalizer behavior. Verify each input state independently.
17. **No persistence/dependency change:** Prisma schema, persisted rows, and
     filter tokens remain unchanged; implementation adds no migration or
     dependency.

## Verification plan for later stages

- QA should cover pure CAE presentation classification, parsing/placeholder
  cases, `getSalesAction` filters with conflicting bill types, preservation of
  non-document filters, and multi-batch cursor pagination.
- Include mapper/search-row assertions that presentation class follows valid
  CAE while detailed fiscal metadata and returns are preserved independently.
- Include cursor compatibility tests for the exact currently emitted composite
  payload, a legacy raw ID resolved only inside the authenticated business,
  strict continuation across equal-date IDs, cursor-row exclusion, malformed
  and cross-business cursor safety, and valid composite-cursor continuation.
- Include fiscal-normalizer boundary tests for `billType: null`, a missing
  `billType`, and an own `billType: undefined` with valid CAE and otherwise
  complete invoice metadata. Assert that classification does not rewrite the
  normalizer input/result, and specifically that valid CAE plus explicit null
  is not newly credit-note-eligible.
- Run existing sales history, returns, credit-note eligibility/validation, and
  sales pagination suites to prove the search-only boundary.
- G1 does not implement production changes or tests.

## Gate G1 — verification

**G1 satisfied.** The current query/filter path, classifier, mapper, SearchBill
initial-load path, `FiltersProivder` defaults, filter serializer, search UI
switches, pagination behavior, Prisma CAE storage shape, parser/normalizer, and
fiscal return validation boundary were inspected. The specification defines
the CAE-only search classification and neutral initial document/payment
defaults, requires the first request to send empty `documentTypes` and
`paymentMethods` and show both sale classes, preserves explicit filtering and
all unrelated filters, retains the checked-in emitted composite cursor while
requiring compatibility with scoped legacy raw-ID cursors, and preserves
explicit fiscal null/missing distinctions through strict normalization. It
provides measurable classification, cursor-compatibility, and fiscal-boundary
acceptance criteria. No production source or test files were changed.
