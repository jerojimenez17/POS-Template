# SPEC.md — Fix Editable Order Product Picker

## Feature Name
`fix-editable-order-product-picker`

## Goal
Fix the "Agregar Producto" dialog in the account ledger detail page (`src/app/(protected)/account-ledger/[id]/`) so that:

- In **production**, the product list loads successfully (no more `"Error al cargar productos"` toast caused by an oversized Server Action response).
- In **development**, the modal opens immediately, the product list stays bounded and scrollable, and the dialog never exceeds the viewport.

The fix replaces the unbounded `getProducts()` Server Action call with the app's existing bounded server-side search action `getProductsBySearch()`, opens the modal before the fetch completes, debounces the search input against the server, and caps the dialog/list overflow.

---

## Context / Problem Statement

`src/components/ledger/EditableOrderDetail.tsx` is the **only** place in the app that calls `getProducts()` from `@/actions/stock` (defined at `src/actions/stock.ts:728`). That Server Action runs an **unbounded** query:

```typescript
db.product.findMany({
  where: { businessId },
  include: { supplier: true, brand: true, category: true, subCategory: true, images: { select: { id: true, url: true } } },
  orderBy: { description: 'asc' }
});
```

It loads **all** products with 5 relations and no `take` limit. Two concrete failure modes result:

| Environment | Symptom | Mechanism |
|-------------|---------|-----------|
| Production | Product list empty + toast `"Error al cargar productos"` | The enormous serialized Server Action response exceeds the server action transport/serialization limit → the promise rejects → the `catch` in `fetchProducts` shows the toast. |
| Development | Giant list (hundreds/thousands of rows), content overflows the container, modal takes a long time to appear | Large payload → slow fetch. `handleOpenAddProduct` does `await fetchProducts()` **before** `setIsAddProductOpen(true)`, so the modal opens only after the fetch completes; every product is then rendered in one giant list. |

The rest of the app already uses a bounded server-side search pattern: `getProductsBySearch(query)` (`src/actions/stock.ts:1097`, capped at 300 via `take: 300` / `LIMIT 300`, pg_trgm ranked search with ILIKE fallback), used by `ProductSearchBar.tsx` and `ProductSearchSelect.tsx`. This SPEC adopts that same pattern for the ledger product picker.

---

## Requirements

### R1 — Replace the unbounded action with the bounded search action
- Remove the `getProducts` import from `@/actions/stock` in `src/components/ledger/EditableOrderDetail.tsx` and import `getProductsBySearch` instead.
- No other file, action, or page is modified.

### R2 — Open the modal immediately, load the initial list in the background
- The `handleOpenAddProduct` handler must **not** `await` any product fetch before `setIsAddProductOpen(true)`.
- Reset state (`selectedProduct`, `quantity`, `searchProduct`) and open the dialog synchronously on click.
- Kick off the initial load in the background via `getProductsBySearch("")` (returns up to 300 products), which populates the list when it resolves.

### R3 — Loading state for product fetch
- Add an `isLoadingProducts` boolean state.
- Set it to `true` when a product fetch starts and `false` when it settles (success or error).
- Render a loading spinner inside the product list area while `isLoadingProducts` is `true`.
- On fetch error, show the existing `toast.error("Error al cargar productos")` and leave the list in its empty/safe state.

### R4 — Debounced server-side search (replace client-side filtering)
- Remove the current client-side filtering effect that filters the full `products` array (`useEffect` on `[searchProduct, products]`), along with the `filteredProducts` state if it becomes redundant.
- While typing in the search input, call `getProductsBySearch(searchProduct)` with a **~400ms debounce** (matching the `ProductSearchBar` convention).
- The list renders the results returned by the server for the current search term.
- Debounce timers must be cleared on unmount/effect cleanup to prevent stale updates.

### R5 — Fix overflow (dialog never exceeds the viewport)
- Add `max-h-[85vh] overflow-y-auto` to the `DialogContent` className so the dialog never exceeds the viewport height.
- Keep the inner product list capped with `max-h` + `overflow-y-auto` (as it already has), so the dialog body scrolls internally.

### R6 — Keep the existing `Product` shape and add-to-order flow
- The modal continues to consume products shaped as `{ id, code, description, salePrice, amount }`.
- `getProductsBySearch` returns Prisma `Product` rows that include all of these fields (`id`, `code`, `description`, `salePrice`, `amount`) — no adapter or field mapping is required.
- The `handleAddProduct` flow (validations, optimistic add via `addOptimisticAction`, call to `addItemsToOrder`, success/error toasts, close dialog on success) must be preserved unchanged.

### R7 — No scope creep
- Only `src/components/ledger/EditableOrderDetail.tsx` may be modified.
- Do **not** change `page.tsx`, `OrderItemsTable.tsx`, `AddPaymentForm.tsx`, or any server actions in this fix.

---

## Data / Interfaces

### Product shape used by the modal (unchanged, defined locally in `EditableOrderDetail.tsx`)

```typescript
interface Product {
  id: string;
  code: string | null;
  description: string | null;
  salePrice: number;
  amount: number;
}
```

### `getProductsBySearch` signature (existing, from `@/actions/stock`)

```typescript
export const getProductsBySearch = async (
  query: string,
  supplierId?: string
): Promise<Product[]> // Prisma Product[] — fields include id, code, description, salePrice, amount
```

- Returns up to **300** products (bounded by `take: 300` for the ILIKE path and `LIMIT 300` for the pg_trgm path).
- `query.length < 3` uses the ILIKE fallback; longer queries use pg_trgm ranked search with ILIKE fallback if the extension is unavailable.
- Returns `[]` when the session has no `businessId`.
- The returned rows have all fields needed by the modal's `Product` interface — no adapter/mapping step is required.

### Behavior contract of the revised picker

| Concern | Behavior |
|---------|----------|
| Modal open timing | Opens synchronously on click; fetch is background |
| Initial list | `getProductsBySearch("")` → up to 300 products |
| Typing | Debounced (~400ms) `getProductsBySearch(search)` |
| Loading UX | Spinner shown inside the list while `isLoadingProducts` |
| List cap | Renders only the server-returned (≤ 300) products |
| Overflow | Dialog `max-h-[85vh]` + scroll; inner list `max-h` + scroll |
| Add flow | Unchanged — optimistic add + `addItemsToOrder` |

---

## File Structure

| Action | File | Description |
|--------|------|-------------|
| **MODIFY** | `src/components/ledger/EditableOrderDetail.tsx` | Swap `getProducts` → `getProductsBySearch`; open dialog before fetch; add `isLoadingProducts`; debounced server-side search; dialog/list overflow classes |

**No other files are modified by this fix.** `src/actions/stock.ts` is read-only reference (both `getProducts` and `getProductsBySearch` already exist).

---

## Acceptance Criteria

### AC1: Dialog opens immediately on click (no blocking await before open)
- **Given** the user is editing an order and clicks "Agregar producto"
- **When** the click handler runs
- **Then** `setIsAddProductOpen(true)` runs synchronously in the handler and no `await` on a product fetch precedes it
- **Verification:** Code inspection — `handleOpenAddProduct` contains no `await fetchProducts()` (or equivalent) before `setIsAddProductOpen(true)`; the modal renders instantly even while the initial fetch is still in flight.

### AC2: Product list is bounded (never renders the full catalog unbounded)
- **Given** a business with a product catalog larger than 300 items
- **When** the dialog opens (or a search is performed)
- **Then** the rendered list contains at most the results returned by `getProductsBySearch` (server-capped at 300), and `getProducts()` is never imported or called from this component
- **Verification:** Code inspection — `getProducts` is absent from the imports/calls; `getProductsBySearch` is used for both the initial load and searches; `searchILIKE`/pg_trgm both cap at 300.

### AC3: Typing triggers a debounced server-side search (no client-side filtering of a full catalog)
- **Given** the dialog is open and the user types in the search input
- **When** the input value changes
- **Then** a `~400ms` debounced call to `getProductsBySearch(searchProduct)` is scheduled (and pending timers are cleared), and the list is updated from the server results — not by filtering a previously loaded full array
- **Verification:** Code inspection — the client-side filter `useEffect` over the full `products` array (and `filteredProducts` if kept) is removed; a debounce timer (~400ms) wraps the search call; test/QA check that a stale in-flight request does not overwrite a newer one.

### AC4: Loading indicator shown while products are being fetched
- **Given** a product fetch is in progress (initial load or search)
- **When** `isLoadingProducts` is `true`
- **Then** a spinner/loading indicator is visible inside the list area (e.g., `Loader2` with `animate-spin`)
- **Verification:** Code inspection — `isLoadingProducts` state exists, is set `true` on fetch start and `false` on settle, and drives a spinner in the render; QA observes the spinner during a slow fetch.

### AC5: Dialog never exceeds the viewport height
- **Given** the dialog is open on any screen size
- **When** the content is taller than the viewport
- **Then** the dialog is capped at `max-h-[85vh]` with `overflow-y-auto` on `DialogContent`, and the inner product list keeps its own `max-h` + `overflow-y-auto`, so the page/body never overflows
- **Verification:** Code inspection — `DialogContent` className includes `max-h-[85vh] overflow-y-auto`; QA visually confirms the dialog fits on a short viewport and only internal areas scroll.

### AC6: "Agregar" still adds the selected product with no regression
- **Given** a product is selected with a valid quantity and the user clicks "Agregar"
- **When** the add flow runs
- **Then** the item is optimistically added to the list (`addOptimisticAction`), `addItemsToOrder` is called with `{ productId, code, description, price, quantity, subTotal }`, and on success the toast `"Producto agregado"` shows and the dialog closes; on failure the existing error toast shows
- **Verification:** QA/regression test — the add flow behaves exactly as before the fix; `addItemsToOrder` receives the same payload shape as previously.

### AC7: TypeScript strict + lint pass on the changed file
- **Given** the fix is implemented
- **When** `npx tsc --noEmit` (or `npm run typecheck`) and `npm run lint` are executed
- **Then** they pass with no new errors/warnings introduced by `src/components/ledger/EditableOrderDetail.tsx`
- **Verification:** Run both commands; confirm zero errors and no new lint findings in the changed file.

---

## Edge Cases

| # | Case | Expected Behavior |
|---|------|-------------------|
| 1 | Business has 0 products | Initial load returns `[]`; list shows `"No se encontraron productos"`; no spinner stuck on. |
| 2 | Business has > 300 products, no search term | Only the first 300 (server-side order) render; catalog is not dumped into the DOM. |
| 3 | User types quickly | Only the final debounced term triggers a request; intermediate results are not shown; stale responses do not overwrite newer ones. |
| 4 | Search returns no matches | List shows `"No se encontraron productos"`. |
| 5 | Fetch fails (production serialization limit or network) | Toast `"Error al cargar productos"` shown; `isLoadingProducts` set `false`; list remains safe/empty; modal stays usable. |
| 6 | User clicks "Agregar producto" repeatedly | Dialog reopens immediately each time; no queued awaits delay the second open. |
| 7 | Short viewport / mobile | Dialog height capped at `85vh`; inner list scrolls; footer buttons remain reachable. |
| 8 | Product selected, then search changed | `selectedProduct`/`quantity` reset to initial values on dialog open (existing behavior preserved); selecting a product after a new search uses the new result. |
| 9 | `getProductsBySearch` returns `[]` due to missing session `businessId` | Empty list + `"No se encontraron productos"`; no crash. |

---

## Dependencies

- **No new npm packages.**
- Reuses the existing `getProductsBySearch` Server Action (`src/actions/stock.ts:1097`) — no server-side changes.
- Reuses the existing Radix `Dialog` primitives and Tailwind classes already in use in the component.
- Debounce uses `setTimeout`/`clearTimeout` via `useRef`/`useEffect` (the pattern already used in `ProductSearchBar.tsx` and `ProductSearchSelect.tsx`).

---

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Initial list capped at 300 means a product beyond the first 300 requires typing to find | Low — search is debounced and server-side; users search by code/name | The empty-search result set is bounded; type-ahead covers the rest of the catalog. |
| Stale debounced responses racing with newer input | Low — could show wrong results briefly | Clear timers on each keystroke and on effect cleanup; (optionally) guard with a request token/`useRef` to ignore stale responses. |
| Removing `filteredProducts` state could break the selected-item UI if not done carefully | Medium — selection logic references the list | Keep selection keyed by `product.id`; QA covers the select/quantity flow in AC6. |
| Dialog `max-h-[85vh]` conflicting with existing `max-w-md` classes | Low — classes compose (width vs height) | Verify visually on small screens; both classes coexist in Tailwind. |
| Leaving the unbounded `getProducts()` action unused in `stock.ts` | None for this fix | Out of scope — `getProducts()` remains for other consumers; this fix only stops `EditableOrderDetail` from using it. |
