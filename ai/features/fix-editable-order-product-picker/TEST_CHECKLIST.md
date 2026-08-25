# TEST_CHECKLIST.md — fix-editable-order-product-picker

Feature workspace: `ai/features/fix-editable-order-product-picker/`

- **Target file (to be fixed):** `src/components/ledger/EditableOrderDetail.tsx`
- **Automated test file:** `ai/features/fix-editable-order-product-picker/editable-order-detail.test.tsx`
- **Run:** `npx vitest run ai/features/fix-editable-order-product-picker/editable-order-detail.test.tsx`
- **Status legend:** 🔴 = FAILS on current code (TDD red phase) · 🟢 = PASSES on current code (already-correct behavior, regression guard) · 🔲 = MANUAL check

---

## Acceptance Criteria (SPEC.md)

| AC | Criterion | Status | Automated test / manual verification |
|----|-----------|--------|--------------------------------------|
| AC1 | Dialog opens immediately on click — no `await` on a product fetch before `setIsAddProductOpen(true)` | 🔴 | **Automated:** `AC1 — opens the 'Agregar Producto' dialog instantly even when the product fetch never settles`. Mocks both `getProducts` and `getProductsBySearch` as never-resolving; asserts `role=dialog` + "Agregar Producto" are present right after clicking "Agregar producto". *Current failure:* `handleOpenAddProduct` does `await fetchProducts()` before opening, so with a never-resolving fetch the dialog never appears → `Unable to find role "dialog"`. |
| AC2 | Product list bounded — `getProducts()` never imported/called; `getProductsBySearch("")` used for initial load | 🔴 | **Automated:** `AC2 — loads the initial product list through getProductsBySearch and never calls getProducts`. Asserts `getProductsBySearch` is called with `("", undefined)` after the dialog opens, and `getProducts` is never called. *Current failure:* the component calls `getProducts()`, so `getProductsBySearch` has 0 calls → `waitFor` timeout. |
| AC3 | Typing triggers a debounced (~400ms) server-side search; no client-side filtering of the full array | 🔴 | **Automated:** `AC3 — does NOT call getProductsBySearch immediately and calls it with the typed term after the debounce`. Clears call history after open, types "papa", asserts NO call immediately, then `waitFor` asserts a call with `("papa", undefined)`. *Current failure:* no server search exists (client-side filter only) → 0 calls → timeout. (Real timers + `waitFor`; deterministic, no fake-timer/`waitFor` conflicts.) |
| AC4 | Loading spinner visible while `isLoadingProducts` is `true` | 🔴 | **Automated:** `AC4 — shows a spinner inside the dialog while the product fetch is in flight`. `getProductsBySearch` never resolves; asserts an `.animate-spin` element exists inside the open dialog. *Current failure:* no loading state for the list → `querySelector(".animate-spin")` returns `null`. |
| AC5 | Dialog never exceeds the viewport — `DialogContent` has `max-h-[85vh] overflow-y-auto` | 🔴 | **Automated:** `AC5 — applies max-h-[85vh] and overflow-y-auto to the DialogContent`. Asserts `toHaveClass("max-h-[85vh]")` and `toHaveClass("overflow-y-auto")` on the `role=dialog` element. *Current failure:* className is only `max-w-md` → both class assertions fail. |
| AC6 | "Agregar" still adds the product — `addItemsToOrder` payload shape preserved, success toast "Producto agregado" | 🟢 | **Automated:** `AC6 — calls addItemsToOrder with the correct payload and shows the success toast`. Selects product, sets quantity 3, clicks "Agregar"; asserts `addItemsToOrder` called with `{ orderId, businessId, items: [{ productId, code, description, price, quantity, subTotal }] }` and `toast.success("Producto agregado")`. *Already passes on current code* (add flow is unchanged — this is the regression guard; must keep passing after the fix). |
| AC7 | TypeScript strict + lint pass on the changed file | 🔲 | **Manual:** run `npx tsc --noEmit` (or `npm run typecheck`) and `npm run lint` after the fix; expect zero errors and no new warnings in `src/components/ledger/EditableOrderDetail.tsx`. |

---

## Edge Cases (SPEC.md)

| # | Case | Status | Automated test / manual verification |
|---|------|--------|--------------------------------------|
| 1 | Business has 0 products → `[]`, shows "No se encontraron productos", no stuck spinner | 🟢 | **Automated:** `EC1/EC4/EC9 — shows 'No se encontraron productos' when the fetch returns zero products`. Asserts the empty-state message inside the dialog and that no `.animate-spin` remains after settle. |
| 2 | Business has > 300 products, no search term → only the server-capped list renders | 🔲 | **Manual + code inspection:** `getProductsBySearch` is capped at 300 (`take: 300` / `LIMIT 300`) — covered conceptually by AC2 (bounded action used). Verify on a large catalog that the DOM contains ≤ 300 rows. |
| 3 | User types quickly → only final debounced term triggers a request; stale responses don't overwrite | 🔴 | **Automated (debounce part):** AC3 proves a single delayed call fires with the typed term. **Manual:** guard against stale in-flight responses overwriting newer ones (request token / latest-wins) — observe typing "pap→papa" fast and confirm the list always reflects the last term. |
| 4 | Search returns no matches → "No se encontraron productos" | 🟢 | **Automated:** same empty-state rendering as EC1 (list renders server-returned results; an empty array yields the message). Manual visual check optional. |
| 5 | Fetch fails → toast "Error al cargar productos", `isLoadingProducts` false, list safe/empty, dialog usable | 🟢 | **Automated:** `EC5 — shows 'Error al cargar productos' toast when the product fetch fails`. Mocks both actions to reject; asserts `toast.error("Error al cargar productos")`. *Already passes on current code* (error path exists) — regression guard for R3. |
| 6 | User clicks "Agregar producto" repeatedly → dialog reopens immediately each time | 🔴 | **Manual (mechanism covered by AC1):** AC1 proves the open is synchronous with no queued `await`; repeat-click behavior follows from the same change. Spot-check by reopening the dialog twice in a row after the fix. |
| 7 | Short viewport / mobile → dialog capped at 85vh, inner list scrolls, footer reachable | 🔲 | **Manual:** AC5 asserts the CSS classes; visually verify on a short viewport (e.g., 667px height) that the dialog fits, only internal areas scroll, and "Agregar"/"Cancelar" remain reachable. |
| 8 | Product selected then search changed → selection/quantity reset on open | 🔲 | **Manual:** `handleOpenAddProduct` resets `selectedProduct`, `quantity`, `searchProduct` synchronously (existing behavior). Verify selecting a product after a new search uses the new result. |
| 9 | `getProductsBySearch` returns `[]` (missing session `businessId`) → empty list + message, no crash | 🟢 | **Automated:** covered by the EC1 empty-list test (same rendering path). Manual sanity check not required. |

---

## Run results on current code (before the fix)

```
npx vitest run ai/features/fix-editable-order-product-picker/editable-order-detail.test.tsx
Test Files  1 failed (1)
     Tests  5 failed | 3 passed (8)
```

| Test | Result on current code | Reason |
|------|------------------------|--------|
| AC1 — dialog opens instantly even when fetch never settles | 🔴 FAIL | `handleOpenAddProduct` awaits `fetchProducts()` before `setIsAddProductOpen(true)` → dialog never opens |
| AC2 — initial load via `getProductsBySearch`, never `getProducts` | 🔴 FAIL | Component calls `getProducts()`; `getProductsBySearch` has 0 calls |
| AC3 — debounced server-side search after typing | 🔴 FAIL | No debounce/server call; client-side filter only → 0 calls |
| AC4 — loading spinner while fetching | 🔴 FAIL | No `isLoadingProducts` state → no `.animate-spin` element |
| AC5 — `max-h-[85vh] overflow-y-auto` on DialogContent | 🔴 FAIL | `DialogContent` className is only `max-w-md` |
| AC6 — add flow payload + success toast | 🟢 PASS | Add flow unchanged (regression guard — must stay green) |
| EC1/EC4/EC9 — empty result message, no stuck spinner | 🟢 PASS | Already-correct behavior |
| EC5 — error toast on fetch failure | 🟢 PASS | Already-correct behavior |

**G2 (compiles):** PASS — the test file transforms and executes with no compile errors.
