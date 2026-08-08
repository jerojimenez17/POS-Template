# SPEC: Pagination in Bulk Update Stock Page

## 1. Detailed Requirements

### 1.1 Problem

The Bulk Update page (`src/app/(protected)/stock/bulk-update/page.tsx`) calls `getProductsFiltered` from `src/actions/stock.ts`. When no filters are applied, this server action fetches **all** products for the business without any pagination. As the product catalog grows, this causes slow page loads and excessive memory/resource consumption on both server and client.

### 1.2 Scope

- **Server Action**: Modify `getProductsFiltered` (lines 895–932 of `src/actions/stock.ts`) to support pagination.
- **Page**: Update the bulk-update page to use paginated fetching, persist selected IDs across page changes, and show a pagination UI.
- **Tests**: Update `getProductsFiltered.test.ts` and any other test files that mock or test the new return shape.
- **Backward Compatibility**: Existing callers that still pass no pagination params should receive the correct shape (see Migration Strategy).

### 1.3 Non-Goals

- Do **not** modify `getProductsPaginated` (it continues to work as-is but without `supplier`, `category`, `subCategory` includes).
- Do **not** modify the filter sidebar layout or bulk action logic.
- Do **not** introduce new npm packages.

---

## 2. Acceptance Criteria

### 2.1 Server Action — `getProductsFiltered`

- [ ] **AC1**: `getProductsFiltered` accepts optional `page: number` and `pageSize: number` in its filters parameter.
- [ ] **AC2**: When `page` is provided, the function returns `{ products, total, page, pageSize, totalPages }` (paginated shape).
- [ ] **AC3**: When `page` is **not** provided (or is `undefined`), the function returns the same paginated shape with `page=1`, `pageSize=10000` (effectively all products, matching previous behavior).
- [ ] **AC4**: The response `products` array includes `supplier`, `brand`, `category`, `subCategory` in each product (full related objects, not just IDs).
- [ ] **AC5**: The `supplierId` filter is supported.
- [ ] **AC6**: Pagination parameters are validated: `page >= 1`, `pageSize` clamped between 1 and 100.
- [ ] **AC7**: Empty/unauthenticated responses return `{ products: [], total: 0, page: 1, pageSize: 25, totalPages: 0 }`.
- [ ] **AC8**: Database errors still log and return the empty paginated shape.

### 2.2 Page — `bulk-update/page.tsx`

- [ ] **AC9**: The page uses `getProductsFiltered` with `page`, `pageSize` parameters on initial load and on filter application.
- [ ] **AC10**: Loading state (spinner + "Cargando productos…") is shown during page changes and filter applications.
- [ ] **AC11**: "Seleccionar todos" / "Deseleccionar todos" only applies to products on the **current page** (not all pages).
- [ ] **AC12**: Selected product IDs (`selectedIds`) are **preserved** when navigating between pages. Switching pages does not clear the selection.
- [ ] **AC13**: The "X de Y seleccionados" counter shows the total accumulated selected IDs (across all pages).
- [ ] **AC14**: When filters change, `page` resets to 1 and the current selection is **cleared** (new result set).

### 2.3 Pagination UI

- [ ] **AC15**: A pagination bar is displayed at the bottom of the product list when `totalPages > 0`.
- [ ] **AC16**: The pagination bar shows:
  - Total product count (e.g., "150 productos encontrados")
  - Current range (e.g., "1–25 de 150")
  - Page navigation: buttons for **Anterior** and **Siguiente**
  - Page number display: "Página X de Y"
  - **First page** (`ChevronsLeft`) and **Last page** (`ChevronsRight`) shortcut buttons
- [ ] **AC17**: A page size selector (dropdown) allows switching between **25**, **50**, and **100** items per page.
- [ ] **AC18**: Changing the page size resets to page 1.
- [ ] **AC19**: All buttons are disabled appropriately at boundary pages (Anterior on page 1, Siguiente on last page).
- [ ] **AC20**: The pagination bar appears **after** the product table/cards and **before** the footer.

### 2.4 Tests

- [ ] **AC21**: `getProductsFiltered.test.ts` is updated to mock `db.product.count` in addition to `db.product.findMany`.
- [ ] **AC22**: Tests verify the paginated return shape `{ products, total, page, pageSize, totalPages }`.
- [ ] **AC23**: Tests verify that `page` and `pageSize` are passed to the Prisma `skip` and `take` parameters.
- [ ] **AC24**: Tests verify the `supplierId` filter is passed to the Prisma where clause.
- [ ] **AC25**: Tests verify that when no `page` is provided, it defaults to `page=1`, `pageSize=10000`.

---

## 3. Data Models & Interfaces

### 3.1 Modified Server Action Signature

```typescript
// Current (line 895):
export const getProductsFiltered = async (filters: {
  search?: string;
  categoryId?: string;
  brandId?: string;
  unit?: string;
  supplierId?: string;
}) => Promise<Product[]>;

// New:
export interface PaginatedResult<T> {
  products: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export const getProductsFiltered = async (filters: {
  search?: string;
  categoryId?: string;
  brandId?: string;
  unit?: string;
  supplierId?: string;
  page?: number;
  pageSize?: number;
}) => Promise<PaginatedResult<Product & {
  supplier: Supplier | null;
  brand: Brand | null;
  category: Category | null;
  subCategory: Subcategory | null;
  images: { id: string; url: string }[];
}>>;
```

### 3.2 Default Values for Pagination

```typescript
const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 25; // matches existing PAGINATION.DEFAULT_PAGE_SIZE
const MAX_PAGE_SIZE = 100;    // matches existing PAGINATION.MAX_PAGE_SIZE
```

For backward compatibility (when `page` is not provided), use `pageSize = 10000` (a high limit to effectively return all products). However, to keep the behavior consistent and simple, we'll use `defaultPageSize = 25` when `page` is explicitly provided, and `10000` when neither `page` nor `pageSize` are provided.

**Simpler approach**: Always default to `page=1, pageSize=25`. Callers that need all products should expect the paginated shape and iterate. Since the only legacy caller is the bulk-update page itself (which we're updating), this is the cleanest approach.

**Final decision**: Default to `page=1`, `pageSize=25`. The bulk-update page will be updated to use pagination explicitly.

### 3.3 Page State Additions

```typescript
// New state in BulkUpdatePage:
const [page, setPage] = useState(1);
const [pageSize, setPageSize] = useState(25);
const [total, setTotal] = useState(0);
const [totalPages, setTotalPages] = useState(0);
```

### 3.4 ProductExtended Type (unchanged from `src/components/stock/product-form.tsx`)

```typescript
export type ProductExtended = Product & {
  supplier?: Supplier | null;
  brand?: Brand | null;
  category?: Category | null;
  subCategory?: Subcategory | null;
  images?: { id: string; url: string }[];
};
```

### 3.5 Pagination UI Props (if extracted to a reusable component)

```typescript
interface PaginationBarProps {
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  pageSizeOptions?: number[]; // default [25, 50, 100]
}
```

---

## 4. File Structure Recommendations

### Files to MODIFY

| File | Changes Required |
|------|-----------------|
| `src/actions/stock.ts` (`getProductsFiltered`, lines 895–932) | Add `page`/`pageSize` params, use `skip`/`take` + `db.product.count`, return `PaginatedResult` |
| `src/app/(protected)/stock/bulk-update/page.tsx` | Add pagination state, update `fetchProducts`, add pagination UI, handle selection persistence across pages, reset selection on filter change |
| `src/__tests__/actions/getProductsFiltered.test.ts` | Mock `db.product.count`, update assertions for new paginated return shape, add tests for pagination params and `supplierId` filter |

### Files to CREATE

| File | Purpose |
|------|---------|
| (none) | Keep pagination UI inline or extract later. For this feature, inline pagination controls in `bulk-update/page.tsx` is preferred — mirrors the pattern used in `ProductDataTable.tsx` lines 482–513. |

### Files to VERIFY (no changes needed)

| File | Reason |
|------|--------|
| `src/__tests__/actions/codebar.test.ts` | Only checks Prisma call args (`findMany` with `where`), not return value. The `db.product.findMany` call pattern does not change. |
| `src/__tests__/components/ProductSelectionModal.test.tsx` | Mocks `getProductsFiltered` — just update the mock to return `{ products: [...], total: 2, page: 1, pageSize: 25, totalPages: 1 }`. |
| `src/components/stock/product-form.tsx` | `ProductExtended` type is unchanged. |
| `src/components/stock/product-print-modal.tsx` | Receives `products` array from parent — no interface change. |
| `src/components/stock/product-dashboard.tsx` | Uses `getProductsPaginated`, not `getProductsFiltered` — no change. |
| `src/components/stock/stock-table.tsx` | Uses `getProductsPaginated`, not `getProductsFiltered` — no change. |
| `src/components/ProductDataTable.tsx` | Uses `getProductsPaginated`, not `getProductsFiltered` — no change. |
| `src/actions/stock/products.ts` | Has a separate `getProductsFiltered` (without `supplierId`) — leave untouched. |
| `src/lib/pagination.ts` | Constants are already defined; we can reference `PAGINATION.DEFAULT_PAGE_SIZE` and `PAGINATION.MAX_PAGE_SIZE`. |

---

## 5. Migration Strategy & Backward Compatibility

### 5.1 Return Type Change

`getProductsFiltered` currently returns `Product[]`. The new signature returns `PaginatedResult<Product[]>`.

**Breakage analysis**:

| Caller | Impact | Action |
|--------|--------|--------|
| `bulk-update/page.tsx` | **Breakage** | Update to destructure `{ products, total, page, totalPages }` from result |
| `getProductsFiltered.test.ts` | **Breakage** | Update all test assertions for new shape |
| `codebar.test.ts` | **No breakage** | Only verifies Prisma call args (`db.product.findMany`), not the return value |
| `ProductSelectionModal.test.tsx` | **Mock breakage** | Update mock return to `{ products: [...], total, page, pageSize, totalPages }` |

### 5.2 Test Updates

1. **`getProductsFiltered.test.ts`**:
   - Add `count: vi.fn()` to the `db.product` mock
   - Wrap `db.product.findMany` mock results with the paginated wrapper `{ products: [...], total: N, page: ..., pageSize: ..., totalPages: ... }`
   - Add test: "should apply skip and take when page and pageSize are provided"
   - Add test: "should count total products matching filters"
   - Add test: "should return default pagination when no page/pageSize provided"
   - Update existing tests to destructure `.products` from the returned object

2. **`ProductSelectionModal.test.tsx`**:
   - Change the mock from `vi.fn().mockResolvedValue([...])` to `vi.fn().mockResolvedValue({ products: [...], total: 2, page: 1, pageSize: 25, totalPages: 1 })`

### 5.3 Step-by-Step Implementation Order

1. **Modify `getProductsFiltered`** in `src/actions/stock.ts`:
   - Add `page`, `pageSize` to the filters parameter
   - Add validation and defaults
   - Use `db.$transaction` with `findMany` (with `skip`/`take`) + `count`
   - Keep the same `include` relations
   - Return `PaginatedResult`

2. **Update tests** (`getProductsFiltered.test.ts`):
   - Add `count` mock
   - Rewrite assertions for paginated shape
   - Add new pagination-specific tests

3. **Update `ProductSelectionModal.test.tsx`** mock shape

4. **Update `bulk-update/page.tsx`**:
   - Add pagination state
   - Update `fetchProducts` to pass `page`/`pageSize`
   - Update `handleSelectAll` to only select current page
   - Add pagination UI bar
   - Change auto-select on load: only select products on page 1, not all products
   - Add `useCallback` dependencies for `page`, `pageSize`

5. **Run tests & lint**: `npm run test` and `npm run lint`

---

## 6. Detailed Design Notes

### 6.1 Server Action Logic (pseudocode)

```typescript
export const getProductsFiltered = async (filters: {
  search?: string;
  categoryId?: string;
  brandId?: string;
  unit?: string;
  supplierId?: string;
  page?: number;
  pageSize?: number;
}) => {
  const session = await auth();
  if (!session?.user?.businessId) {
    return { products: [], total: 0, page: 1, pageSize: 25, totalPages: 0 };
  }

  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, filters.pageSize ?? DEFAULT_PAGE_SIZE));
  const skip = (page - 1) * pageSize;

  const where: Prisma.ProductWhereInput = {
    businessId: session.user.businessId,
    ...(filters.search && {
      OR: [
        { code: { contains: filters.search, mode: "insensitive" } },
        { codebar: { contains: filters.search, mode: "insensitive" } },
        { description: { contains: filters.search, mode: "insensitive" } },
      ],
    }),
    ...(filters.categoryId && { categoryId: filters.categoryId }),
    ...(filters.brandId && { brandId: filters.brandId }),
    ...(filters.unit && { unit: filters.unit }),
    ...(filters.supplierId && { supplierId: filters.supplierId }),
  };

  try {
    const [products, total] = await db.$transaction([
      db.product.findMany({
        where,
        include: { supplier: true, brand: true, category: true, subCategory: true },
        orderBy: { description: "asc" },
        skip,
        take: pageSize,
      }),
      db.product.count({ where }),
    ]);

    return {
      products,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  } catch (error) {
    console.error("Error fetching filtered products:", error);
    return { products: [], total: 0, page, pageSize, totalPages: 0 };
  }
};
```

### 6.2 Page State Flow

```
Initial Load:
  hasLoaded=false → user sees "Seleccioná filtros para comenzar"
  User clicks "Aplicar Filtros" or default auto-load (if no filters needed):
    → setHasLoaded(true)
    → fetchProducts(page=1, pageSize=25, filters)
    → setFilteredProducts(result.products)
    → setSelectedIds(new Set(result.products.map(p => p.id)))  // select all on page 1
    → setTotal(result.total)
    → setPage(result.page)
    → setTotalPages(result.totalPages)

Filter Change:
  User changes any filter → clear selectedIds, reset page to 1
  User clicks "Aplicar Filtros" → fetchProducts(page=1, ...)

Page Change:
  User clicks "Siguiente" (page+1) or a page number:
    → fetchProducts(newPage, pageSize, filters)
    → append/keep selectedIds as-is
    → Do NOT clear selectedIds

Page Size Change:
  User picks 50 from dropdown:
    → setPageSize(50)
    → setPage(1)
    → fetchProducts(1, 50, filters)
    → clear selectedIds? NO, but auto-select only current page products
    → Actually: keep selection, but only auto-select the visible products if "select all" was active

"Select All" (current page):
  If all current page products are selected → deselect all on current page
  If not all selected → select all on current page
  (Accumulates across pages)
```

### 6.3 Selection Persistence Strategy

- `selectedIds` is a `Set<string>` that accumulates across page navigations.
- When navigating to a new page, previously selected products remain selected (their IDs stay in the set).
- "Select all" on a page adds **only** that page's product IDs to the set. "Deselect all" removes **only** that page's product IDs.
- When filters change (new search/category/brand/unit/supplier), the selection is **cleared** because the result set fundamentally changes.
- When page size changes, the selection is **kept** (the user just asked for more/fewer items per page; selection persists).

### 6.4 Pagination UI Layout

```
┌──────────────────────────────────────────────────────────────┐
│  ← Anterior  │  ←  1  │  2  │  3  │  ...  │  10  │  →  │  Siguiente →  │
│                                                              │
│  Página 2 de 10  │  25 por página  ▼  │  150 productos encontrados  │
└──────────────────────────────────────────────────────────────┘
```

Icons:
- `ChevronLeft` for "Anterior"
- `ChevronRight` for "Siguiente"
- `ChevronsLeft` for "Primera página"
- `ChevronsRight` for "Última página"

Page number buttons: show a window of up to 5 pages around current, with ellipsis for large ranges.

### 6.5 Page Size Selector

Use the existing Radix UI `Select` component from `@/components/ui/select`, with options: `[25, 50, 100]`.

### 6.6 Edge Cases

| Case | Behavior |
|------|----------|
| **0 products match filters** | Show "No se encontraron productos" (existing empty state). Pagination bar hidden. |
| **Single page of results** | Pagination bar shows page info but navigation buttons are disabled (page 1 of 1). |
| **All products selected, then navigate** | New page's products auto-select if "select all" was active? No — keep it simple. "Select all" is per-page. |
| **Change filter while on page 5** | Reset to page 1 and clear selection. |
| **Rapid page clicks** | Each click triggers a fetch. Loading state blocks UI? Use loading state to disable buttons during fetch. |
| **Very large total (e.g., 10k products)** | Pagination works with pageSize 100, totalPages = 100. Page number window shows limited range with ellipsis. |

---

## 7. Reference: Existing Patterns

### ProductDataTable pagination bar (existing pattern to follow)

```tsx
{total > 0 && (
  <div className="flex items-center justify-between px-2 py-4">
    <span className="text-sm text-gray-500 dark:text-gray-400">
      {from}–{to} de {total.toLocaleString("es-AR")} productos
    </span>
    <div className="flex items-center gap-2">
      <Button variant="outline" size="sm" onClick={() => onPageChange(page - 1)}
        disabled={page <= 1} className="h-8 px-3">
        <ChevronLeft className="h-4 w-4 mr-1" />
        Anterior
      </Button>
      <span className="text-sm text-gray-500 dark:text-gray-400 px-2">
        {page} / {totalPages}
      </span>
      <Button variant="outline" size="sm" onClick={() => onPageChange(page + 1)}
        disabled={page >= totalPages} className="h-8 px-3">
        Siguiente
        <ChevronRight className="h-4 w-4 ml-1" />
      </Button>
    </div>
  </div>
)}
```

This feature will **extend** this pattern with:
- Page number buttons (with ellipsis for large ranges)
- First/Last page buttons
- Page size selector dropdown
- Total count display

---

## 8. Dependencies

**No new npm packages**. All required UI primitives (Button, Select, icons from `lucide-react`) are already present in the project.

Icons to use from `lucide-react`:
- `ChevronLeft` — previous page
- `ChevronRight` — next page
- `ChevronsLeft` — first page
- `ChevronsRight` — last page
- Already imported in the page: `CheckSquare`, `Square`, `Printer`, `Percent`, `ArrowLeft`, `Filter`, `X`
