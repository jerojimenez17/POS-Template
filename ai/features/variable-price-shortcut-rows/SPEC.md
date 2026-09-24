# SPEC: Keep variable-price shortcut additions as separate sale rows

## Status and scope

- **G1 (Architect specification): PASS / ready for implementation.** The current shortcut, cart reducer, row editing/removal, and checkout paths have been inspected; acceptance criteria and a minimal design are defined below.
- This change covers only products added through configured variable-price shortcuts (`F1`/`F2`/`F3` in `BillButtonsDefault`). It does not cover shortcut keys used for checkout in the separate `BillButtons` component.
- Specification only: do not implement or add tests in this step.
- No Prisma/schema change or new package is proposed.

## Problem and current behavior

On `/newBill`, `BillButtonsDefault` fetches the product configured for F1/F2/F3, overrides `salePrice` to `0` and `amount` to `1`, then calls the shared `addItem` callback. `BillReducer` handles `addItem` by matching `product.id`; a match increments the existing row's amount. As a result, the next shortcut activation targets the same visible row, so the cashier cannot assign a separate price to each activation.

The same reducer behavior is used by `ProductSearchBar` for ordinary search, click, and barcode additions and must remain the default behavior. `Product.id` is also the actual catalog/database product id: sales actions use it for the order-item relation and stock changes. Replacing that id with a cart-generated value would break checkout and stock accounting.

The current product model has no separate variable-price flag or normal-product shortcut category. The configured shortcut settings and existing shortcut add flow are specifically described/implemented as variable-price products, and the handler initializes their price to zero. Therefore, the minimal applicable scope is configured F1/F2/F3 product additions in `BillButtonsDefault`; no new category discriminator is needed. The separate `BillButtons` F1/F2/F3 checkout listener is unrelated and must not be changed.

## Requirements

1. Each successful activation of a configured variable-price shortcut adds exactly one new cart row with initial quantity `1` and initial sale price `0`, including when the same catalog product already exists in the cart from another shortcut activation.
2. Separate shortcut-created rows for the same catalog product have independently editable prices and quantities. Editing one row must not update another row.
3. Removing a row removes only that row. Changing its quantity, changing its price, and setting its edit/focus state must also affect only that row.
4. Ordinary additions via search, result click, barcode scan, or other normal product-add paths retain existing product-identity quantity merging. Normal rows remain mergeable with other normal additions; they must not absorb or be absorbed by a variable-price shortcut row.
5. Preserve the catalog product id on every cart row. Do not persist a generated row id as `productId`, use it for stock operations, or expose it in fiscal/product identity fields.
6. Checkout, order update, budget/account flows, receipts, and AFIP projection continue receiving the true catalog product id, per-row quantity, and per-row sale price. When identical catalog products have different shortcut prices, checkout persists/prints their values without collapsing the rows or overwriting one price with the other.
7. Existing bill state with ordinary products (including edit-mode sales loaded from persistence) remains compatible: a product lacking a cart-row identifier continues to behave as one normal row keyed by its catalog `id`.
8. Do not alter shortcut mappings, shortcut configuration persistence, modal keybindings, or any unrelated checkout shortcut handler.

## Proposed minimal design

### Cart-row identity versus product identity

- Keep `Product.id` as the catalog/database id.
- Add an optional, client-side cart-row identifier to the bill product shape (for example `cartRowId?: string`). Ordinary products omit it. Every variable-price shortcut activation assigns a fresh unique value to it (prefer the existing browser `crypto.randomUUID()` API; use an established project-compatible ID utility if the target runtime requires a fallback).
- Centralize row identity in a helper, e.g. `getBillRowId(product) => product.cartRowId ?? product.id`. Do not infer row identity from description, array position, price, or the catalog id alone.
- Keep the row identifier out of minimal checkout/product payloads. Existing `toMinimalProducts` in `BillButtons.tsx` explicitly projects the catalog `id`, code, description, cost, sale price, and amount; preserve this behavior. AFIP projection already whitelists product fields and must continue to do so.

### Addition semantics

- Preserve current `addItem(Product)` behavior as the default normal/mergeable add path.
- Add a narrowly named independent-row path (e.g. `addIndependentItem(Product)` and a corresponding reducer action) for variable-price shortcut additions only. It appends the supplied single-unit row and never merges it by catalog id.
- The normal `addItem` reducer branch should find/merge only the normal row for that catalog id, not an independent shortcut row. This preserves repeated search/scan merging while preventing ordinary additions from mutating a custom-priced row.
- In the F1/F2/F3 success branch in `BillButtonsDefault`, create the row identifier, set `salePrice: 0` and `amount: 1`, append through the independent-row path, and request focus using that row identifier. Keep existing missing-config/error/session behavior unchanged.

### Row-targeted cart operations and focus

- Use `getBillRowId` consistently for `removeItem`, amount changes, `updateSalePrice`, row React keys, and price-input focus matching. Reducer branches that currently match `product.id` for row-local operations must match the cart-row identity instead.
- Make amount editing update the row in place/by row identifier rather than relying on the current remove-then-add pattern, which can merge a custom-price shortcut row back into another same-product row.
- The current `focusPriceProductId` signal must identify a cart row, not a catalog product, so only the newly appended row enters price-edit/focus mode. It may be renamed to `focusPriceRowId` for accurate semantics; update its context/provider/input/shortcut call sites together if renamed.
- Keep total calculation as the sum of each row's `salePrice * amount`; a price or quantity update must recalculate bill totals and discounted totals as today.

### Checkout and compatibility boundary

- Continue sending each row as a separate element with the same real catalog `id`. Current sale persistence creates one order item per `BillState.products` entry, which supports same-product rows with distinct prices.
- Aggregate stock deltas by catalog product id before calling `bulkUpdateStock` for a bill's product rows. That helper emits an `UPDATE ... FROM (VALUES ...)`; repeated ids in its input are not a safe way to apply multiple deltas to the same product row. Apply the same aggregation when reverting an edited order's existing items and when applying its replacement items. Per-line stock-movement records may remain per row if that preserves existing audit semantics.
- Preserve the row-specific `salePrice` and `amount` in bill snapshots and downstream projections. Do not group by product id during checkout, order update, budget/account submission, or receipt generation as part of this feature.
- For old rows without `cartRowId`, fallback identity is `id`; no data migration is required.
- Audit any downstream use of product id for line-item addressing separately from catalog/stock identity. The spec does not authorize replacing `Product.id` or changing database relations.

## Acceptance criteria

### AC1 — Repeated variable-price shortcut adds distinct one-unit rows

Given the same product is configured for a variable-price shortcut, activating that shortcut twice results in two cart rows for that product. Each row has amount `1`, starts at sale price `0`, has a different cart-row identity, and the catalog product id remains unchanged.

### AC2 — Independent price editing

Given two shortcut-created rows for the same product, set their prices to `$4000` and `$3400`. The cart retains two rows, each with amount `1`, the corresponding separate price, and their correct individual subtotals; the bill total is `$7400` before discounts. Editing either row does not change the other.

### AC3 — Shortcut focus targets the new row only

After each successful shortcut add, only the newly added row's price input enters edit mode and receives focus. Other rows with the same catalog product id do not enter edit mode or consume the focus request.

### AC4 — Remove and quantity edits target one row

Given at least two same-product shortcut rows, removing one leaves the other intact. Updating the amount of one row changes only its amount, preserves its cart-row identity and custom price, and recalculates totals correctly.

### AC5 — Normal search/click/scan additions still merge

Adding an ordinary product repeatedly through existing search/click/barcode paths continues to increment its ordinary row quantity instead of producing a new normal row. Existing single-row products without a cart-row id still merge as before.

### AC6 — Normal additions do not merge into custom-price shortcut rows

Given a shortcut-created custom-price row exists, adding the same catalog product through a normal path continues normal-row merge semantics and does not increment/change the custom-price row. If no normal row exists, a normal row is created separately and subsequent normal adds merge into that row.

### AC7 — Other shortcut behavior is unchanged

F1/F2/F3 continue using their configured product, initial price `0`, unit quantity, and existing success/error/session behavior. The separate checkout-shortcut component, modal shortcuts, and ordinary configured behavior outside the variable-price F1/F2/F3 flow are not changed.

### AC8 — Checkout and persistence preserve rows and catalog identity

Given two same-product shortcut rows with different prices, checkout and sale update preserve both line items, their individual unit prices and quantities, and their common real catalog product id. Stock is decremented by the sum of their quantities, not by the generated row ids and not more than once.

### AC9 — Downstream views retain per-row pricing

Receipt/print, budget/account, and applicable fiscal payloads receive each row's sale price and quantity. No downstream path groups those rows solely by catalog product id or exposes the generated cart-row id as a product identity.

### AC10 — No database change

No Prisma model, migration, or database identity change is introduced. Existing persisted order item data and historical bill loading continue to work.

## Intended implementation boundary

Expected implementation is limited to the cart/product row identity and reducer/action plumbing, the BillContext/Provider API if an independent-add operation or row-focus rename is needed, `BillButtonsDefault` shortcut row creation, and the billing table/price-input row-specific operations. Update `BillButtons.tsx` checkout serialization only if required to explicitly keep `cartRowId` out; preserve the current minimal product projection. In `src/actions/sales/process.ts`, aggregate stock deltas by catalog product id for sale creation and both sides of sale update; preserve separate `OrderItem` rows/prices. Review account/budget, fiscal projection, and print mappings to confirm per-row passthrough, but avoid modifying persistence schema or unrelated actions unless verification finds actual grouping by product id.

Do not modify ordinary search/scan call sites except as needed to ensure they use the unchanged default merge path. Do not change the separate `BillButtons` checkout hotkeys. Do not add tests or implementation in this architecture step.

## Material ambiguity / clarification

No blocking user clarification is needed for this spec: repository behavior and existing feature naming support treating configured F1/F2/F3 shortcut additions as the variable-price category, and no product-level normal-shortcut category/flag was found. If the product owner intends some configured F1/F2/F3 shortcuts to be fixed-price/mergeable, that category is not represented in current code/configuration; they should define its discriminator and scope before implementation. Until then, all configured variable-price shortcut additions use independent rows, while separate checkout shortcut keys and normal search/scan additions retain their current behavior.
