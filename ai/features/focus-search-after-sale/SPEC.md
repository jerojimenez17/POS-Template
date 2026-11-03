# SPEC: Restore product-search focus after a successful new sale

## Status and scope

- **Stage:** G1 architecture/specification only.
- **Deliverable:** this specification; do not implement production code or add
  tests in this stage.
- **Route:** the new-sale screen at `/newBill`, implemented by
  `src/app/(protected)/newBill/page.tsx`.
- **Goal:** after a new-sale creation flow has completed successfully, return
  keyboard focus to the product search input so a cashier can begin entering
  the next product without manually navigating back to it.
- **Out of scope:** changes to sale/invoice business rules, persistence,
  validation, checkout reset contents, search text/filter state, printing,
  existing-sale edits, and invoice creation from sale history. No Prisma,
  Server Action, route, schema, or dependency changes are expected.

## Existing flow and architectural constraints

1. `page.tsx` is an async Server Component. It mounts `BillProvider` around
   `ProductsTable`; do not add browser APIs, event handlers, refs, or client
   state to the page or convert the page into a Client Component.
2. `ProductsTable` is already a Client Component. It renders `PrintableTable`
   and `BillButtons` as sibling branches under the same billing context.
3. `PrintableTable` renders the active `ProductSearchBar`. The search input has
   the stable DOM id `product-search-input`, but it currently has no explicit
   ref contract for checkout components to request focus.
4. `BillButtons` owns the new-sale completion paths:
   - **Factura:** `createSale(true, false)` must return valid CAE data after
     voucher issuance and sale persistence; failed or invalid CAE paths return
     early without `resetCheckout()`.
   - **Remito:** `createSale(false, false)` must complete `processSaleAction`
     successfully before the success path prints and resets the checkout.
   - **A cuenta:** `ClientSelectionModal` calls `onSuccess` after creating a
     new unpaid order or successfully adding items to an existing unpaid
     order.
   - **Presupuesto:** when enabled, `ClientSelectionModal` calls `onSuccess`
     only after `createBudgetAction` succeeds.
5. Failure, validation rejection, offline/session rejection, and cancellation
   paths do not invoke the success completion code. Existing success callbacks
   already identify the correct completion boundary; the focus feature must
   attach to those boundaries rather than infer success from modal dismissal,
   button clicks, loading-state changes, or checkout reset alone.
6. The App Router client boundary remains inside existing Client Components.
   The ref/callback wiring described below is client-to-client and does not
   cross the Server Component serialization boundary. This follows the
   installed Next.js `use client` documentation (`node_modules/next/dist/docs/
   01-app/03-api-reference/01-directives/use-client.md`).

## Functional requirements

1. On successful completion of a new Factura, Remito, A cuenta, or (when
   available) Presupuesto flow initiated on `/newBill`, focus the product
   search input after checkout completion and modal close transitions have
   committed.
2. An A cuenta flow includes both creating a new unpaid order and appending
   products to an existing unpaid order. It is successful only when the
   existing `ClientSelectionModal` success callback is reached.
3. A flow that fails, is rejected by validation/connectivity/session checks,
   or is cancelled must not move focus to the product search input as a result
   of this feature. Existing dialog focus behavior may remain unchanged.
4. Do not focus merely because a confirmation button was clicked, a modal
   closed, a request started, or the checkout was reset for any unrelated
   reason. Do not focus during edits of an existing sale; the edit flow
   navigates away on success and is not a new-sale completion.
5. Focus the existing product-search input itself, not a table cell, a price
   field, the supplier filter, or a duplicate search control. If the input ref
   is unavailable during an unmount/transition, safely do nothing (no throw).
6. Keep the search input's current text, supplier selection, bill type, print
   mode, and other state unchanged. This request is focus-only; it must not
   clear or select text, add products, mutate the bill, or alter search
   behavior.
7. The focus request must be issued only after success is established by the
   existing completion branch and after the corresponding normal checkout
   reset/modal-close behavior has been started. It must not delay, block, or
   otherwise change sale persistence or printing.
8. Preserve the `/` keyboard shortcut and all existing product search,
   scanner, keyboard navigation, and modal semantics.

## Proposed design and interfaces

Keep all behavior within the existing client-side billing tree. Thread a
search-input ref from `ProductsTable` down through `PrintableTable` to
`ProductSearchBar`; use it as the ref for the existing input. In
`ProductsTable`, define a small `focusProductSearch` callback that schedules
`.focus()` for the next animation frame, after React has committed checkout
reset/modal state changes. The callback must be null-safe. Do not rely on a
global DOM query for the new completion wiring; retaining the current element
id for its existing `/` shortcut is backward compatible.

Pass that callback to the default `BillButtons` as an optional, locally typed
client prop (for example `onSaleCreated?: () => void`) so existing direct
component callers remain source-compatible. Invoke it exactly once in each
successful new-sale completion branch:

- after Factura and Remito creation returns success and the normal checkout
  reset is performed;
- from the existing A cuenta and Presupuesto `onSuccess` callbacks after the
  normal reset has been initiated.

Do not invoke it from `createSale` unconditionally, from failure/catch/finally
blocks, from modal `onOpenChange`, or from the edit-update branch. Existing
callbacks on `ClientSelectionModal` are success signals and must keep their
current behavior. If implementation details show that one frame can race the
dialog's focus restoration, retain the same success-only callback contract and
defer the focus until the close has committed; do not broaden when success is
reported.

### Proposed client interfaces

The precise prop name can follow local conventions, but the ownership should
remain explicit:

```ts
// ProductSearchBar.tsx
interface ProductSearchBarProps {
  // existing props...
  searchInputRef?: React.RefObject<HTMLInputElement | null>;
}

// BillButtons.tsx (default new-sale component)
interface props {
  // existing props...
  onSaleCreated?: () => void;
}
```

`PrintableTable` should receive and forward the optional input ref; `ProductsTable`
owns the concrete ref and passes the focus callback to `BillButtons`. No public
Server Action or database interface changes are part of this feature.

## Acceptance criteria

- **AC-01 — Factura success:** Given a valid new sale and successful invoice
  issuance/persistence, after completion and dialog dismissal,
  `document.activeElement` is the input with id `product-search-input`.
- **AC-02 — Remito success:** Given a valid new sale and successful Remito
  persistence, after completion and dialog dismissal,
  `document.activeElement` is the input with id `product-search-input`.
- **AC-03 — A cuenta success paths:** Verify both successful creation of a new
  unpaid order and successful append to an existing unpaid order. In each
  case, once the completion callback closes the dialogs,
  `document.activeElement` is `#product-search-input`.
- **AC-04 — Presupuesto success:** When the feature is enabled and budget
  creation succeeds, after completion and dialog dismissal,
  `document.activeElement` is `#product-search-input`.
- **AC-05 — Failure does not steal focus:** For each relevant completion
  family, force the action/CAE/persistence to fail and assert that the feature
  does not call `.focus()` on the product search input. This includes invalid
  CAE, rejected sale save, failed budget/unpaid-order creation, and failed
  append-to-existing-order.
- **AC-06 — Cancel/reject does not steal focus:** Cancelling the Factura or
  Remito confirmation, closing the A cuenta/Budget selection flow without
  submission, or failing the existing validation/session/connectivity checks
  must not trigger a product-search focus request.
- **AC-07 — Edit is excluded:** Successfully updating an existing sale must
  not invoke the new-sale focus callback; the existing navigation/update
  behavior remains unchanged.
- **AC-08 — Focus is deferred and safe:** The focus request occurs after the
  completion handler has initiated the normal reset/close behavior, is
  delivered no earlier than the next animation frame, and does not throw if
  the ref is null.
- **AC-09 — Focus-only behavior:** Search text and supplier filter remain
  unchanged by focus restoration; no product is added or removed by the focus
  operation, and existing `/` shortcut behavior remains available.
- **AC-10 — Compatibility and scope:** `page.tsx` remains a Server Component;
  existing `ProductsTable`, `PrintableTable`, `ProductSearchBar`, and
  `BillButtons` callers compile with the optional ref/callback contract; no
  billing action, Prisma schema, persistence contract, dependency, or
  unrelated production file changes are introduced.

## Edge cases for QA/implementation handoff

- Factura issuance may succeed but the subsequent sale save can fail: this is
  not a completed sale and must not request focus.
- A returned response without a valid CAE is not success, even if the dialog
  closes or a print window was opened.
- A Remito uses the existing non-AFIP success sentinel; focus must follow the
  actual successful sale-save path, not require a CAE.
- The A cuenta modal can close a nested existing-order dialog and the main
  dialog in succession. Wait until focus restoration has settled before
  focusing search.
- A presupuesto action can return an error or throw; neither case should
  request focus. Only the existing success callback should.
- Feature-gated absence of Presupuesto does not affect the other creation
  paths.
- If the search component is temporarily unmounted or its ref is null, the
  callback is a no-op and must not crash.
- A sale can have a print popup that fails to open or a print path that takes
  longer; focus policy is based on persistence success and must not redefine
  printing success/failure.
- Dialog focus restoration after cancellation must not be overridden by a
  stale or previously queued success focus request. Each success should issue
  a single request; cancellation paths should enqueue none.

## Relevant files

- `src/app/(protected)/newBill/page.tsx` — retain Server Component status;
  expected to need no change.
- `src/components/Billing/ProductsTable.tsx` — own the input ref and
  post-commit focus callback, then wire the ref and callback to child branches.
- `src/components/Billing/PrintableTable.tsx` — pass the optional search ref
  to the actual search component.
- `src/components/Billing/ProductSearchBar.tsx` — accept/ref the existing
  product-search input without changing search behavior.
- `src/components/Billing/BillButtons.tsx` — add the optional completion
  callback and invoke it only for successful Factura, Remito, A cuenta, and
  Presupuesto creation; leave edit, error, cancellation, and `finally` paths
  untouched.
- `src/components/ledger/ClientSelectionModal.tsx` — inspect existing
  `onSuccess` behavior for budget and A cuenta (including add-to-existing);
  no changes are expected unless wiring exposes a genuine callback gap.
- Relevant QA suites should cover `BillButtons`, `ProductSearchBar`, and the
  ref/callback integration through `ProductsTable`/`PrintableTable`; tests
  are authored in the next workflow stage, not in G1.

## Gate G1 — verification

**G1 passes.** This specification defines the successful creation boundaries
for all new-sale document/order flows, distinguishes them from failures,
cancellations, and edits, keeps browser focus logic inside the existing client
tree, proposes explicit null-safe ref/callback interfaces, and supplies
measurable acceptance criteria and edge cases. The deliverable is
`ai/features/focus-search-after-sale/SPEC.md`. No production code or tests were
written.
