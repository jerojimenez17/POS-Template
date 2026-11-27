# Feature: Bulk-update — "Últimos modificados" filter

## 1. Overview

Add a fifth filter to the bulk-update page (`src/app/(protected)/stock/bulk-update/page.tsx`) that restricts the product list to items modified in the last 30 days. The filter is a boolean toggle (not a date picker):

- **OFF (default)** — no date restriction; behaves exactly as today.
- **ON** — restricts results to products whose `last_update` is greater than or equal to `now() - 30 days`.

The filter combines with the existing filters (`search`, `categoryId`, `brandId`, `unit`, `supplierId`) using AND semantics. It affects both `getProductsFiltered` (paginated list) and `getFilteredProductIds` (select-all across pages), so bulk operations automatically honor it.

---

## 2. Affected files

| File | Reason |
|------|--------|
| `src/actions/stock.ts` | Extend `getProductsFiltered` and `getFilteredProductIds` signatures to accept `recentlyModified?: boolean`. Add `where.last_update: { gte: <Date> }` when true. |
| `src/app/(protected)/stock/bulk-update/page.tsx` | Add `recentlyModified: boolean` to `FilterState` (default `false`). Add a checkbox in the filters sidebar, between the Proveedor `<select>` and the "Aplicar Filtros" button. Pass the value to `getProductsFiltered` and `getFilteredProductIds`. |
| `src/__tests__/actions/getProductsFiltered.test.ts` | Add a new `describe("getProductsFiltered - recentlyModified filter", ...)` block with 4 tests (AC1–AC4). Existing 18 tests remain unchanged. |

No Prisma schema changes. No new dependencies.

---

## 3. Out of scope

- Date picker UI ("show me products from N days ago") — boolean toggle only.
- Sorting or ordering changes.
- Prisma schema changes (`last_update` already exists).
- Bulk-unit-update / bulk-price-update logic (they consume the filtered selection; no changes).
- Print modal (unrelated).
- Indexes on `last_update` (follow-up; current dataset size does not warrant it).

---

## 4. Detailed requirements

### 4.1 Server Action signature change — `src/actions/stock.ts`

Extend both functions with an optional `recentlyModified?: boolean` parameter:

```typescript
export const getProductsFiltered = async (filters: {
  search?: string;
  categoryId?: string;
  brandId?: string;
  unit?: string;
  supplierId?: string;
  recentlyModified?: boolean;  // NEW
  page?: number;
  pageSize?: number;
}) => { ... }

export const getFilteredProductIds = async (filters: {
  search?: string;
  categoryId?: string;
  brandId?: string;
  unit?: string;
  supplierId?: string;
  recentlyModified?: boolean;  // NEW
}): Promise<string[]> => { ... }
```

Inside both functions, after the existing `where` object is built, append:

```typescript
...(filters.recentlyModified
  ? { last_update: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } }
  : {}),
```

**Date arithmetic — fixed 30-day window**

- 30 days × 24 h × 60 min × 60 s × 1000 ms = **2,592,000,000 ms**.
- Use a fixed window (`Date.now() - 2_592_000_000`) rather than calendar-month arithmetic (`setMonth(now.getMonth() - 1)`).
- Reason: calendar-month arithmetic yields different dates depending on the current month (e.g. going back one month from March 31 = March 3 or March 2 depending on leap year rules), which makes tests non-deterministic. The fixed 30-day window is unambiguous and matches the natural Spanish reading of "menos de un mes" for the bulk-update workflow.

**Where to place the spread**

In `getProductsFiltered` (around line 1255), append after the `supplierId` spread:
```typescript
      ...(filters.supplierId ? { supplierId: filters.supplierId } : {}),
      ...(filters.recentlyModified
        ? { last_update: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } }
        : {}),
    };
```

In `getFilteredProductIds` (around line 1313), the same placement.

### 4.2 UI change — `src/app/(protected)/stock/bulk-update/page.tsx`

1. **Extend `FilterState`** (line ~14–20) to include `recentlyModified: boolean`:
   ```typescript
   interface FilterState {
     search: string;
     categoryId: string;
     brandId: string;
     unit: string;
     supplierId: string;
     recentlyModified: boolean;
   }
   ```

2. **Update `useState` initial value** (line ~30–36) to include `recentlyModified: false`.

3. **Add the checkbox UI** in the filters sidebar, **between the Proveedor `<select>` block (ends ~line 282) and the "Aplicar Filtros" `<Button>` (line ~284)**:
   ```tsx
   <div className="flex items-center gap-2 pt-1">
     <input
       id="recently-modified-filter"
       type="checkbox"
       checked={filters.recentlyModified}
       onChange={(e) => setFilters({ ...filters, recentlyModified: e.target.checked })}
       className="h-4 w-4 rounded border-gray-300 text-blue-600 focus-visible:ring-2 focus-visible:ring-blue-500 cursor-pointer"
     />
     <label htmlFor="recently-modified-filter" className="text-sm font-medium cursor-pointer select-none">
       Últimos modificados (último mes)
     </label>
   </div>
   ```
   - The `id="recently-modified-filter"` and label text **must match exactly** so automated/manual selectors find it.
   - Uses a native `<input type="checkbox">`, consistent with the existing native `<input>`/`<select>` filter controls.

4. **Wire to fetch** — update `fetchProducts()` (~line 49–60) and `handleSelectAll()` (~line 116–122) to pass `recentlyModified: filters.recentlyModified` alongside the other filter values.

5. No other changes — the existing "Aplicar Filtros" button already triggers a re-fetch via `setFilterVersion`, so toggling the checkbox is naturally picked up when the user clicks "Aplicar Filtros".

---

## 5. Acceptance criteria

### AC1 — `getProductsFiltered` with `recentlyModified: true` adds the date clause

Calling `getProductsFiltered({ recentlyModified: true })` must produce a Prisma `where` object containing `last_update: { gte: <Date> }`. The `gte` value must be within ±1000 ms of `new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)` as captured *before* invoking the action (test captures `Date.now()` first, then calls the action).

**Measurable:** `expect(db.product.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ last_update: { gte: <Date> } }) }))` and `Math.abs(actualGte.getTime() - expectedGte.getTime()) < 1000`.

### AC2 — `getProductsFiltered` with `recentlyModified: false` (or undefined) adds NO date clause

Calling `getProductsFiltered({ recentlyModified: false })` or `getProductsFiltered({})` must produce a Prisma `where` object that **does not** contain a `last_update` key.

**Measurable:** `expect(where).not.toHaveProperty("last_update")` (assert on the first argument of `db.product.findMany.mock.calls[0][0].where`).

### AC3 — `getFilteredProductIds` with `recentlyModified: true` adds the date clause

Same as AC1 but for `getFilteredProductIds({ recentlyModified: true })`. The `gte` date must be within ±1000 ms of the same captured expected value.

### AC4 — `getFilteredProductIds` with `recentlyModified: false` (or undefined) adds NO date clause

Same as AC2 but for `getFilteredProductIds`.

### AC5 — Bulk-update page renders the checkbox with correct id and label

The rendered DOM must contain an `<input type="checkbox" id="recently-modified-filter">` whose associated `<label>` (matching `htmlFor="recently-modified-filter"`) contains the text "Últimos modificados" and "(último mes)". The checkbox must default to unchecked (`checked={false}`).

### AC6 — Toggling the checkbox updates `filters.recentlyModified` in local state

When the user toggles the checkbox, the local `filters.recentlyModified` value flips (`false` → `true`, `true` → `false`). Pressing "Aplicar Filtros" after toggling causes a re-fetch that includes the new value.

---

## 6. Test plan

### 6.1 New tests in `src/__tests__/actions/getProductsFiltered.test.ts`

Add a new `describe` block **after** the existing `describe("getProductsFiltered Server Action", ...)` (the file currently ends with that block at line ~504):

```typescript
import { getProductsFiltered, getFilteredProductIds } from "@/actions/stock";

describe("getProductsFiltered - recentlyModified filter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // AC1
  it("adds last_update gte clause when recentlyModified is true", async () => {
    const { db } = await import("@/lib/db");
    (db.$transaction as ReturnType<typeof vi.fn>).mockImplementation(
      (queries: Promise<unknown>[]) => Promise.all(queries)
    );
    (db.product.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (db.product.count as ReturnType<typeof vi.fn>).mockResolvedValue(0);

    const before = Date.now();
    const expectedGte = new Date(before - 30 * 24 * 60 * 60 * 1000);

    await getProductsFiltered({ recentlyModified: true });

    const callArgs = (db.product.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(callArgs.where).toHaveProperty("last_update");
    expect(callArgs.where.last_update).toHaveProperty("gte");
    const actualGte: Date = callArgs.where.last_update.gte;
    expect(actualGte).toBeInstanceOf(Date);
    expect(Math.abs(actualGte.getTime() - expectedGte.getTime())).toBeLessThan(1000);
  });

  // AC2 — false
  it("does NOT add last_update clause when recentlyModified is false", async () => {
    const { db } = await import("@/lib/db");
    (db.$transaction as ReturnType<typeof vi.fn>).mockImplementation(
      (queries: Promise<unknown>[]) => Promise.all(queries)
    );
    (db.product.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (db.product.count as ReturnType<typeof vi.fn>).mockResolvedValue(0);

    await getProductsFiltered({ recentlyModified: false });

    const callArgs = (db.product.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(callArgs.where).not.toHaveProperty("last_update");
  });

  // AC2 — undefined (same expectation)
  it("does NOT add last_update clause when recentlyModified is undefined", async () => {
    const { db } = await import("@/lib/db");
    (db.$transaction as ReturnType<typeof vi.fn>).mockImplementation(
      (queries: Promise<unknown>[]) => Promise.all(queries)
    );
    (db.product.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (db.product.count as ReturnType<typeof vi.fn>).mockResolvedValue(0);

    await getProductsFiltered({});

    const callArgs = (db.product.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(callArgs.where).not.toHaveProperty("last_update");
  });

  // AC3
  it("getFilteredProductIds adds last_update gte clause when recentlyModified is true", async () => {
    const { db } = await import("@/lib/db");
    (db.product.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const before = Date.now();
    const expectedGte = new Date(before - 30 * 24 * 60 * 60 * 1000);

    await getFilteredProductIds({ recentlyModified: true });

    const callArgs = (db.product.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(callArgs.where).toHaveProperty("last_update");
    const actualGte: Date = callArgs.where.last_update.gte;
    expect(actualGte).toBeInstanceOf(Date);
    expect(Math.abs(actualGte.getTime() - expectedGte.getTime())).toBeLessThan(1000);
  });

  // AC4
  it("getFilteredProductIds does NOT add last_update clause when recentlyModified is false", async () => {
    const { db } = await import("@/lib/db");
    (db.product.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    await getFilteredProductIds({ recentlyModified: false });

    const callArgs = (db.product.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(callArgs.where).not.toHaveProperty("last_update");
  });
});
```

The 18 existing tests must remain unchanged and continue to pass.

### 6.2 UI validation (AC5, AC6)

The existing test suite in `src/__tests__/actions/getProductsFiltered.test.ts` covers Server Actions only. There is **no component test framework currently configured for the bulk-update client page** — `src/__tests__/components/` covers specific components (e.g. `BulkUnitUpdate`), not the bulk-update page itself, and that page requires substantial mocking (categories/brands/suppliers fetches, print modal, bulk-unit-update component, `auth()`).

**Recommendation: validate AC5 and AC6 manually.** Manual checklist:
1. Navigate to `/stock/bulk-update`.
2. Verify a checkbox is rendered between the Proveedor dropdown and "Aplicar Filtros" button, with `id="recently-modified-filter"` and label "Últimos modificados (último mes)".
3. Verify it is unchecked by default.
4. Toggle it on, click "Aplicar Filtros", and verify the resulting product list contains only products whose `last_update` is within the last 30 days (spot-check 1–2 rows by inspecting the DB).
5. Toggle it off, click "Aplicar Filtros", and verify the date restriction is removed (the full filtered set is shown again).

If automated UI testing is required later, a follow-up feature can introduce React Testing Library + render the bulk-update page with full mocks. That is **out of scope** for this feature to keep the diff minimal.

---

## 7. Risk / regression notes

- **`expect.objectContaining` compatibility** — The 18 existing tests use `expect.objectContaining({ where: expect.objectContaining({ ... }) })`. `expect.objectContaining` only checks the keys it lists, so adding a new optional `last_update` key to `where` cannot break those assertions. (Vitest matches Jest semantics here.) Verified safe.
- **Fixed 30-day vs calendar-month** — Documented trade-off: fixed window for determinism; calendar-month arithmetic would be a follow-up if exact-month semantics are needed.
- **Native `<input type="checkbox">`** — No new dependency. Consistent with the sidebar's other native controls.
- **Bulk-unit-update and bulk-price-update** — These consume `selectedIds`, which is built from the filtered list. They will automatically honor the new filter with no changes.
- **Performance / index** — `Product.last_update` is not indexed in the current schema (`@@index([businessId, ...])`). For small/medium datasets the filter is fine; for large datasets, a follow-up could add `@@index([businessId, last_update])`. Out of scope here.
- **Type safety** — The new optional `recentlyModified?: boolean` field in both action signatures does not break existing callers (all current fields are optional too).
- **Auth/permission** — No change. The new filter rides on the existing `businessId` scoping.

---

## 8. Summary of implementation effort

- `src/actions/stock.ts`: ~6 lines added (parameter + spread × 2 functions).
- `src/app/(protected)/stock/bulk-update/page.tsx`: ~14 lines added (interface field, state default, checkbox block, 2 fetch-passing updates).
- `src/__tests__/actions/getProductsFiltered.test.ts`: ~1 import + 1 describe block with 5 new tests.
- No schema migration, no new packages.

---

## 9. v2 — Sort by `last_update` desc + `last_update` audit & fixes

The v1 feature shipped the "Últimos modificados (último mes)" filter, which filters products by `last_update >= now() - 30 days`. This v2 update makes the filter reliable and improves UX on the bulk-update page:

1. **Sort the result list by `last_update` desc** so the most recently modified products appear first (most useful order for the bulk-update workflow).
2. **Audit every Product write path** and bump `last_update` on the 7 active paths that currently skip it (BUGS).
3. **Document** in which cases the field IS being updated (final-state audit table in § 9.6).

### 9.1 Context

The user reported that "últimos modificados" should show the most recently touched items first. Sorting alphabetically hides the very items the user came to see. Switching `orderBy` to `{ last_update: "desc" }` aligns the list with the filter's intent.

Sorting on `last_update` is only useful if the column is actually bumped on every write. A full audit of all 36 Product write paths identified **7 active code paths** that mutate Product state without setting `last_update`. Without fixing these, the sort order is misleading (and the v1 date filter is silently wrong for products touched via those paths). All 7 must be fixed by adding `last_update: new Date()` to the Prisma `data` payload.

`getFilteredProductIds` does NOT have an orderBy (it returns just IDs); no change needed there.

### 9.2 Affected files

| File | Reason |
|------|--------|
| `src/actions/stock.ts` | (a) Change `orderBy` in `getProductsFiltered` from `{ description: "asc" }` to `{ last_update: "desc" }`. (b) Fix `bulkUpdatePrices` (line 1362) and `toggleProductCatalogAction` (line 1383) to set `last_update: new Date()`. |
| `src/actions/stock/products.ts` | Fix duplicate `toggleProductCatalogAction` (line 342) to set `last_update: new Date()`. |
| `src/actions/stock/bulk.ts` | Fix duplicate `bulkUpdatePrices` (line 437) to set `last_update: new Date()`. |
| `src/actions/sales/update.ts` | Fix `deleteOrderAction` (line 72) to set `last_update: new Date()` on the stock-restore loop. |
| `src/actions/ledger/index.ts` | Fix `createLedgerAccountAction` (line 106) and `addProductsToLedgerAction` (line 254) to set `last_update: new Date()` on the product updates. |
| `src/__tests__/actions/getProductsFiltered.test.ts` | Add 4 new tests (AC1 sort + AC2/AC3/AC5 for the active fixes) appended to the existing `describe("getProductsFiltered - recentlyModified filter", ...)` block. AC4/AC6/AC7/AC8 are validated by code review (mechanical, same pattern). |

### 9.3 Out of scope

- `src/actions/billing.ts` `updateProductsStock` is unused (no callers in the repo). Recommend deletion in a follow-up but **NOT** required for this feature.
- Indexes on `last_update` for query performance. `@@index([businessId, last_update])` would help at scale but is out of scope here (already mentioned in § 7 of v1).
- `Client.last_update` (different model on line 331 of `schema.prisma`) is unrelated to Product — not in scope.
- Changing `getFilteredProductIds` sort order — it returns only IDs and is not displayed.
- Changing the v1 UI checkbox / filter logic — only the data layer and sort order change.

### 9.4 Detailed requirements

#### 9.4.1 Sort order — `src/actions/stock.ts`

In `getProductsFiltered`, change the `orderBy` field on the `db.product.findMany` call (currently line 1265) from:

```typescript
orderBy: { description: "asc" },
```

to:

```typescript
orderBy: { last_update: "desc" },
```

Full before/after for the transaction block (lines 1261–1270):

```typescript
const [products, total] = await db.$transaction([
  db.product.findMany({
    where,
    include: { supplier: true, brand: true, category: true, subCategory: true },
    orderBy: { last_update: "desc" },   // CHANGED
    skip,
    take: currentPageSize,
  }),
  db.product.count({ where }),
]);
```

`getFilteredProductIds` (line 1324) keeps `orderBy: { description: "asc" }` — IDs are not displayed and order is irrelevant for the select-all workflow.

#### 9.4.2 Fix all 7 active paths to bump `last_update`

For each path below, add `last_update: new Date()` to the `data` payload of the Prisma update call. The change is purely additive and does not affect existing return values or behavior other than setting the timestamp.

**Path 1** — `src/actions/stock.ts` line 1362 (`bulkUpdatePrices`):

```typescript
// BEFORE
return db.product.update({
  where: { id: product.id },
  data: { salePrice: newSalePrice, gain },
});
// AFTER
return db.product.update({
  where: { id: product.id },
  data: { salePrice: newSalePrice, gain, last_update: new Date() },
});
```

**Path 2** — `src/actions/stock.ts` line 1383 (`toggleProductCatalogAction`):

```typescript
// BEFORE
await db.product.update({
  where: { id: productId },
  data: { catalog },
});
// AFTER
await db.product.update({
  where: { id: productId },
  data: { catalog, last_update: new Date() },
});
```

**Path 3** — `src/actions/stock/products.ts` line 342 (`toggleProductCatalogAction`, duplicate):

```typescript
// BEFORE
await db.product.update({
  where: { id: productId },
  data: { catalog },
});
// AFTER
await db.product.update({
  where: { id: productId },
  data: { catalog, last_update: new Date() },
});
```

**Path 4** — `src/actions/stock/bulk.ts` line 437 (`bulkUpdatePrices`, duplicate):

```typescript
// BEFORE
updates.push(
  db.product.update({
    where: { id },
    data: {
      salePrice: { multiply: factor },
      gain: gain,
    },
  })
);
// AFTER
updates.push(
  db.product.update({
    where: { id },
    data: {
      salePrice: { multiply: factor },
      gain: gain,
      last_update: new Date(),
    },
  })
);
```

**Path 5** — `src/actions/sales/update.ts` line 72 (`deleteOrderAction`, stock restore loop):

```typescript
// BEFORE (inside the for-loop at line 70)
await tx.product.update({
  where: { id: item.productId },
  data: { amount: { increment: item.quantity } },
});
// AFTER
await tx.product.update({
  where: { id: item.productId },
  data: { amount: { increment: item.quantity }, last_update: new Date() },
});
```

**Path 6** — `src/actions/ledger/index.ts` line 106 (`createLedgerAccountAction`):

```typescript
// BEFORE (inside Promise.all, line 105–110)
tx.product.update({
  where: { id: item.id },
  data: { amount: { decrement: item.amount } },
})
// AFTER
tx.product.update({
  where: { id: item.id },
  data: { amount: { decrement: item.amount }, last_update: new Date() },
})
```

**Path 7** — `src/actions/ledger/index.ts` line 254 (`addProductsToLedgerAction`):

```typescript
// BEFORE (inside Promise.all, line 253–258)
tx.product.update({
  where: { id: item.id },
  data: { amount: { decrement: item.amount } },
})
// AFTER
tx.product.update({
  where: { id: item.id },
  data: { amount: { decrement: item.amount }, last_update: new Date() },
})
```

### 9.5 Acceptance criteria

- **AC1 (sort)** — `getProductsFiltered()` calls `db.product.findMany` with `orderBy: { last_update: "desc" }` (replaces the previous `{ description: "asc" }`).
- **AC2 (fix `bulkUpdatePrices` in `stock.ts`)** — Calling `bulkUpdatePrices([productId], 10)` results in `db.product.update` being called with `data.last_update` set to a `Date` within ±1000 ms of `Date.now()` captured before the call.
- **AC3 (fix `toggleProductCatalogAction` in `stock.ts`)** — Calling `toggleProductCatalogAction(id, true)` results in `db.product.update` being called with `data.last_update` set to a `Date` within ±1000 ms of now.
- **AC4 (fix `toggleProductCatalogAction` duplicate in `stock/products.ts`)** — Same as AC3 for the duplicate version. **Validated by code review** (mechanical single-property addition; identical pattern).
- **AC5 (fix `bulkUpdatePrices` duplicate in `stock/bulk.ts`)** — Same as AC2 for the duplicate version.
- **AC6 (fix `deleteOrderAction`)** — When `deleteOrderAction` runs and there are items with `productId`, the `tx.product.update` call includes `data.last_update` set to a `Date` within ±1000 ms of now. **Validated by code review**.
- **AC7 (fix `createLedgerAccountAction`)** — When `createLedgerAccountAction` runs with products, each `tx.product.update` call includes `data.last_update` set to a `Date` within ±1000 ms of now. **Validated by code review**.
- **AC8 (fix `addProductsToLedgerAction`)** — Same as AC7 for the duplicate ledger path. **Validated by code review**.
- **AC9 (documentation)** — § 9.6 below contains a complete table of all Product write paths and their `last_update` behavior in the final state.

### 9.6 Audit documentation (final state, after this feature)

Complete table of all 36 Product write paths and their `last_update` behavior:

| # | File | Line | Function | Updates `last_update`? | Method |
|---|------|------|----------|------------------------|--------|
| 1 | `src/actions/stock.ts` | 73 | `createProduct` | N/A (create) | schema `@default(now())` |
| 2 | `src/actions/stock.ts` | 477 | `processBulkProductBatch` (create branch) | N/A (create) | schema default |
| 3 | `src/actions/stock.ts` | 485 | `processBulkProductBatch` (createMany) | N/A (create) | schema default |
| 4 | `src/actions/stock.ts` | 501 | `processBulkProductBatch` (raw SQL update) | ✓ | `"last_update" = NOW()` |
| 5 | `src/actions/stock.ts` | 633 | `updateProduct` | ✓ | `data: { ..., last_update: new Date() }` |
| 6 | `src/actions/stock.ts` | 685 | `updateStockAmount` | ✓ | `data: { amount, last_update: new Date() }` |
| 7 | `src/actions/stock.ts` | 710 | `deleteProduct` | N/A (delete) | row removed |
| 8 | `src/actions/stock.ts` | 1362 | `bulkUpdatePrices` | ✓ **(FIXED)** | `data: { ..., last_update: new Date() }` |
| 9 | `src/actions/stock.ts` | 1383 | `toggleProductCatalogAction` | ✓ **(FIXED)** | `data: { catalog, last_update: new Date() }` |
| 10 | `src/actions/stock.ts` | 1425 | `bulkUpdateAmounts` | ✓ | `data: { amount, last_update: new Date() }` |
| 11 | `src/actions/stock/products.ts` | 20 | `createProduct` (alt) | N/A (create) | schema default |
| 12 | `src/actions/stock/products.ts` | 94 | `updateProduct` (alt) | ✓ | `data: { ..., last_update: new Date() }` |
| 13 | `src/actions/stock/products.ts` | 151 | `updateStockAmount` (alt) | ✓ | `data: { amount, last_update: new Date() }` |
| 14 | `src/actions/stock/products.ts` | 169 | `deleteProduct` (alt) | N/A (delete) | row removed |
| 15 | `src/actions/stock/products.ts` | 342 | `toggleProductCatalogAction` (alt) | ✓ **(FIXED)** | `data: { catalog, last_update: new Date() }` |
| 16 | `src/actions/stock/bulk.ts` | 299 | `createProductsBulk` (update branch) | ✓ | `data: { ..., last_update: new Date() }` |
| 17 | `src/actions/stock/bulk.ts` | 329 | `createProductsBulk` (create branch) | N/A (create) | schema default |
| 18 | `src/actions/stock/bulk.ts` | 437 | `bulkUpdatePrices` (alt) | ✓ **(FIXED)** | `data: { ..., last_update: new Date() }` |
| 19 | `src/actions/stock/bulk.ts` | 501 | `bulkUpdateAmounts` (alt) | ✓ | `data: { amount, last_update: new Date() }` |
| 20 | `src/actions/orders.ts` | 74 | `createOrder` (via `bulkUpdateStock`) | ✓ | raw SQL `"last_update" = NOW()` |
| 21 | `src/actions/orders.ts` | 195 | `updateOrderStatus` | ✓ | same helper |
| 22 | `src/actions/unpaid-orders.ts` | 184 | `createUnpaidOrder` | ✓ | same helper |
| 23 | `src/actions/unpaid-orders.ts` | 346 | `cancelUnpaidOrder` | ✓ | same helper |
| 24 | `src/actions/unpaid-orders.ts` | 610 | `addItemsToOrder` | ✓ | same helper |
| 25 | `src/actions/unpaid-orders.ts` | 749 | `updateOrderItem` | ✓ | same helper |
| 26 | `src/actions/unpaid-orders.ts` | 872 | `removeOrderItem` | ✓ | same helper |
| 27 | `src/actions/sales/process.ts` | 124 | `processSaleAction` | ✓ | same helper |
| 28 | `src/actions/sales/process.ts` | 298 | `processReturnAction` | ✓ | same helper |
| 29 | `src/actions/sales/process.ts` | 438 | `updateSaleAction` (revert) | ✓ | same helper |
| 30 | `src/actions/sales/process.ts` | 489 | `updateSaleAction` (apply) | ✓ | same helper |
| 31 | `src/actions/sales/update.ts` | 72 | `deleteOrderAction` | ✓ **(FIXED)** | `data: { amount, last_update: new Date() }` |
| 32 | `src/actions/ledger/index.ts` | 106 | `createLedgerAccountAction` | ✓ **(FIXED)** | `data: { amount, last_update: new Date() }` |
| 33 | `src/actions/ledger/index.ts` | 254 | `addProductsToLedgerAction` | ✓ **(FIXED)** | `data: { amount, last_update: new Date() }` |
| 34 | `src/components/actions/newProduct.ts` | 26 | `newProduct` | N/A (create) | schema default |
| 35 | `src/actions/seed-debts.ts` | 45 | `seedDebtsFromExcel` | N/A (create) | schema default |
| 36 | `src/actions/billing.ts` | 67 | `updateProductsStock` | ⚠️ DEPRECATED (no callers) | unused — recommend deletion in follow-up |

**Summary after fix:**
- Active write paths: **35**
- ✓ SET: **26** (already correct before this feature)
- ✗ FIXED IN THIS FEATURE: **7** (newly bumped)
- ⚠️ DEPRECATED (no callers): **1** (left as-is, recommend removal in follow-up)
- N/A (create): **8** (covered by schema `@default(now())`)
- N/A (delete): **2** (row removed)
- **After this fix, every active write path that mutates product state bumps `last_update`.**

### 9.7 Test plan

#### New tests in `src/__tests__/actions/getProductsFiltered.test.ts`

Append 4 new tests to the existing `describe("getProductsFiltered - recentlyModified filter", ...)` block introduced in v1 (after its 5 existing tests).

**Test 1 — AC1 sort order**

```typescript
it("getProductsFiltered sorts by last_update desc (not description asc)", async () => {
  const { db } = await import("@/lib/db");
  (db.$transaction as ReturnType<typeof vi.fn>).mockImplementation(
    (queries: Promise<unknown>[]) => Promise.all(queries)
  );
  (db.product.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
  (db.product.count as ReturnType<typeof vi.fn>).mockResolvedValue(0);

  await getProductsFiltered({});

  const callArgs = (db.product.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0];
  expect(callArgs).toEqual(
    expect.objectContaining({ orderBy: { last_update: "desc" } })
  );
  expect(callArgs.orderBy).not.toEqual({ description: "asc" });
});
```

**Test 2 — AC2 `bulkUpdatePrices` in `stock.ts`**

```typescript
it("bulkUpdatePrices (stock.ts) sets last_update on each product.update", async () => {
  const { db } = await import("@/lib/db");
  const { bulkUpdatePrices } = await import("@/actions/stock");

  (db.product.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
    { id: "p1", price: 50, salePrice: 100 },
  ]);
  (db.$transaction as ReturnType<typeof vi.fn>).mockImplementation(
    async (queries: Promise<unknown>[]) => Promise.all(queries)
  );

  const before = Date.now();
  await bulkUpdatePrices(["p1"], 10);

  const updateCall = (db.product.update as ReturnType<typeof vi.fn>).mock.calls[0][0];
  expect(updateCall.data).toHaveProperty("last_update");
  expect(updateCall.data.last_update).toBeInstanceOf(Date);
  expect(Math.abs(updateCall.data.last_update.getTime() - before)).toBeLessThan(1000);
});
```

**Test 3 — AC3 `toggleProductCatalogAction` in `stock.ts`**

```typescript
it("toggleProductCatalogAction (stock.ts) sets last_update", async () => {
  const { db } = await import("@/lib/db");
  const { toggleProductCatalogAction } = await import("@/actions/stock");

  (db.product.update as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "p1", catalog: true });

  const before = Date.now();
  await toggleProductCatalogAction("p1", true);

  const updateCall = (db.product.update as ReturnType<typeof vi.fn>).mock.calls[0][0];
  expect(updateCall.data).toHaveProperty("last_update");
  expect(updateCall.data.last_update).toBeInstanceOf(Date);
  expect(Math.abs(updateCall.data.last_update.getTime() - before)).toBeLessThan(1000);
});
```

**Test 4 — AC5 `bulkUpdatePrices` in `stock/bulk.ts`**

```typescript
it("bulkUpdatePrices (stock/bulk.ts) sets last_update on each product.update", async () => {
  const { db } = await import("@/lib/db");
  // Import from the duplicate path
  const bulkModule = await import("@/actions/stock/bulk");
  // The exported function name mirrors the one in stock.ts; pick the correct export.
  const fn =
    (bulkModule as Record<string, unknown>).bulkUpdatePrices ??
    (bulkModule as Record<string, unknown>).bulkUpdatePricesAction;
  expect(fn).toBeDefined();

  (db.product.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
    { id: "p1", price: 50, salePrice: 100 },
  ]);
  (db.$transaction as ReturnType<typeof vi.fn>).mockImplementation(
    async (queries: Promise<unknown>[]) => Promise.all(queries)
  );

  const before = Date.now();
  await (fn as (ids: string[], pct: number) => Promise<unknown>)(["p1"], 10);

  const updateCall = (db.product.update as ReturnType<typeof vi.fn>).mock.calls[0][0];
  expect(updateCall.data).toHaveProperty("last_update");
  expect(updateCall.data.last_update).toBeInstanceOf(Date);
  expect(Math.abs(updateCall.data.last_update.getTime() - before)).toBeLessThan(1000);
});
```

> **Note on the import name for `stock/bulk.ts`:** the file may export `bulkUpdatePrices` or `bulkUpdatePricesAction`. The Developer should pick whichever is actually exported (verified by reading the file). If neither name exists, search the file for the function definition and import by its actual exported name.

#### Tests deferred to code review

AC4 (`toggleProductCatalogAction` in `stock/products.ts`), AC6 (`deleteOrderAction`), AC7 (`createLedgerAccountAction`), and AC8 (`addProductsToLedgerAction`) are validated by code review rather than automated tests. The fix in each is a single-property addition to a `data` payload and is identical in pattern to AC2/AC3. Authoring full transaction/auth mocks for `deleteOrderAction` and the two ledger paths would add disproportionate test infrastructure for no additional coverage value (the assertion would be the same `expect.objectContaining({ last_update: expect.any(Date) })`).

Reviewer checklist for AC4 / AC6 / AC7 / AC8:

1. Open the file at the listed line number.
2. Confirm the `data: { ... }` object of the Prisma update call contains `last_update: new Date()`.
3. Confirm no other fields are removed or reordered.
4. Confirm no other call sites in the same function also need updating (e.g., additional `tx.product.update` calls inside the same transaction body).

#### Test count summary

- v1 tests: 5 in `getProductsFiltered - recentlyModified filter`
- v2 new tests: **4** (AC1, AC2, AC3, AC5)
- Total in the file: **9** new tests in the new `describe` block. The 18 pre-existing tests in `describe("getProductsFiltered Server Action", ...)` remain untouched.

### 9.8 Risk / regression notes

- **Sort change side effect**: The bulk-update page now shows recently-modified products first instead of alphabetical. This is the desired behavior. Users who relied on alphabetical order will notice; document in the user-facing change log ("Products now sorted by most recently modified").
- **Performance**: `orderBy: { last_update: "desc" }` is not supported by the existing `@@index([businessId, ...])` indexes. The query remains scoped by `businessId`, so the filter is selective. Fine for small/medium datasets; for large datasets, a `@@index([businessId, last_update])` would help — out of scope here, follow-up.
- **7 paths fixed**: These are the complete set of active write paths that mutate product state without bumping `last_update`. After this fix, every active write path bumps `last_update`. The deprecated `updateProductsStock` in `billing.ts` is intentionally left as-is (recommend deletion in a follow-up to remove dead code).
- **Existing tests unaffected**: The existing `getProductsFiltered.test.ts` tests pass `search: "Manzana"` and verify the result contains the matching product — none depend on order, so the sort change is safe. The v1 tests assert against `where.last_update` and `expect.objectContaining`, both of which are unaffected by `orderBy` changes. Run the full test suite after the change to confirm.
- **The duplicates in `stock/products.ts` and `stock/bulk.ts`**: Both files are exported and reachable. Without fixing the duplicates, half the user actions (depending on which import path is used) would still leave stale `last_update`. The fix list explicitly covers both.
- **Transactional consistency for paths 5–7**: These paths set `last_update` inside an existing `db.$transaction(...)` callback. Adding the field does not change transaction boundaries — the bump is committed atomically with the stock change.

### 9.9 Files affected (summary)

| File | Change |
|------|--------|
| `src/actions/stock.ts` | `orderBy` change (AC1) + 2 fixes (AC2, AC3) |
| `src/actions/stock/products.ts` | 1 fix (AC4) |
| `src/actions/stock/bulk.ts` | 1 fix (AC5) |
| `src/actions/sales/update.ts` | 1 fix (AC6) |
| `src/actions/ledger/index.ts` | 2 fixes (AC7, AC8) |
| `ai/features/bulk-update-recently-modified-filter/SPEC.md` | This section 9 (current task) |
| `src/__tests__/actions/getProductsFiltered.test.ts` | 4 new tests (AC1, AC2, AC3, AC5) appended to the existing `describe` block; AC4/AC6/AC7/AC8 validated by code review |

No Prisma schema migration. No new dependencies.