# TEST_CHECKLIST: Pagination in Bulk Update Stock Page

## Server Action — `getProductsFiltered`

### Pagination Signature & Parameters

- [ ] AC1: `getProductsFiltered` accepts optional `page: number` and `pageSize: number` in its filters parameter
- [ ] AC2: When `page` is provided, the function returns `{ products, total, page, pageSize, totalPages }`
- [ ] AC3: When `page` is not provided, defaults to `page=1`, `pageSize=25`
- [ ] AC6: Pagination parameters are validated: `page >= 1`
- [ ] AC6: Pagination parameters are validated: `pageSize` clamped between 1 and 100

### Database Transaction & Query

- [ ] AC8: Uses `db.$transaction` with `findMany` and `count` for atomic pagination
- [ ] AC23: `skip` and `take` are derived correctly from `page` and `pageSize`
- [ ] AC4: `products` array includes `supplier` relation (full object, not just ID)
- [ ] AC4: `products` array includes `brand` relation
- [ ] AC4: `products` array includes `category` relation
- [ ] AC4: `products` array includes `subCategory` relation

### Filters (Existing + New)

- [ ] AC24: `supplierId` filter is supported in the Prisma `where` clause
- [ ] Search filter (`search`) is supported
- [ ] Category filter (`categoryId`) is supported
- [ ] Brand filter (`brandId`) is supported
- [ ] Unit filter (`unit`) is supported
- [ ] Multiple filters combine correctly with pagination

### Edge Cases & Error Handling

- [ ] AC7: Unauthenticated user receives `{ products: [], total: 0, page: 1, pageSize: 25, totalPages: 0 }`
- [ ] AC7: User without `businessId` receives `{ products: [], total: 0, page: 1, pageSize: 25, totalPages: 0 }`
- [ ] AC8: Database errors are caught, logged, and return empty paginated shape
- [ ] Empty filter match returns `{ products: [], total: 0, page: 1, pageSize: 25, totalPages: 0 }`
- [ ] `totalPages` calculation: `Math.ceil(total / pageSize)`

---

## Page — `bulk-update/page.tsx`

### Paginated Fetching

- [ ] AC9: Page uses `getProductsFiltered` with `page` and `pageSize` parameters on initial load
- [ ] AC9: Page uses `getProductsFiltered` with `page` and `pageSize` on filter application
- [ ] AC14: When filters change, `page` resets to 1
- [ ] AC14: When filters change, current selection is cleared
- [ ] Loading state (spinner + "Cargando productos…") shown during page changes and filter applications

### Selection Persistence

- [ ] AC12: Selected product IDs (`selectedIds`) are preserved when navigating between pages
- [ ] AC12: Switching pages does NOT clear the selection
- [ ] AC13: "X de Y seleccionados" counter shows total accumulated selected IDs across all pages
- [ ] AC11: "Seleccionar todos" only selects products on the **current page**
- [ ] AC11: "Deseleccionar todos" only deselects products on the **current page**

---

## Pagination UI

- [ ] AC15: Pagination bar is displayed at bottom of product list when `totalPages > 0`
- [ ] AC15: Pagination bar is hidden when `totalPages === 0`
- [ ] AC16: Shows total product count (e.g., "150 productos encontrados")
- [ ] AC16: Shows current range (e.g., "1–25 de 150")
- [ ] AC16: Shows **Anterior** and **Siguiente** navigation buttons
- [ ] AC16: Shows "Página X de Y" display
- [ ] AC16: Shows **First page** (`ChevronsLeft`) shortcut button
- [ ] AC16: Shows **Last page** (`ChevronsRight`) shortcut button
- [ ] AC17: Page size selector (dropdown) with options **25**, **50**, **100**
- [ ] AC18: Changing page size resets to page 1
- [ ] AC19: **Anterior** button is disabled on page 1
- [ ] AC19: **Siguiente** button is disabled on last page
- [ ] AC19: **First page** button is disabled on page 1
- [ ] AC19: **Last page** button is disabled on last page
- [ ] AC20: Pagination bar appears **after** the product table/cards and **before** the footer

---

## Tests

- [ ] AC21: `getProductsFiltered.test.ts` mocks `db.product.count` + `db.$transaction` + `db.product.findMany`
- [ ] AC22: Tests verify the paginated return shape `{ products, total, page, pageSize, totalPages }`
- [ ] AC23: Tests verify `skip` and `take` parameters are passed to Prisma `findMany`
- [ ] AC24: Tests verify `supplierId` filter is passed to Prisma `where` clause
- [ ] AC25: Tests verify default `page=1`, `pageSize=25` when no pagination params provided
- [ ] Tests verify `pageSize` is clamped to max 100
- [ ] Tests verify `page` is enforced to minimum of 1
- [ ] Tests verify `totalPages` is correctly calculated
- [ ] Tests verify combined filters with pagination
- [ ] Tests verify error cases return empty paginated shape
- [ ] `ProductSelectionModal.test.tsx` mock returns `{ products, total, page, pageSize, totalPages }`

---

## Non-Functional

- [ ] No new npm packages introduced
- [ ] Existing pagination UI pattern from `ProductDataTable.tsx` is followed
- [ ] Backward compatible: existing callers that don't pass pagination params get correct shape
