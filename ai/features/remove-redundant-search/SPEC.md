# SPEC: Remove Redundant "Búsqueda rápida de producto" and Improve ProductSearchBar UX

## 1. Feature Summary

Two search bars exist on the billing page (`PrintableTable.tsx`) for adding products to a bill:

| Search Bar | Visibility | Features |
|---|---|---|
| **ProductSearchBar** | Always visible | Barcode scanning, supplier filter, keyboard shortcuts (`/` to focus, arrow keys, Enter, Escape), autocomplete dropdown with debounced search |
| **ProductSearchSelect** | Hidden behind "Búsqueda rápida de producto" toggle | Fewer features (no barcode, no supplier filter, no keyboard shortcuts beyond Enter/Arrow/Escape), uses the same `getProductsBySearch()` action |

Both call `getProductsBySearch()` from `src/actions/stock`. The second one is redundant — it offers no additional functionality and adds unnecessary UI clutter.

**What changes**:

1. **Remove** `ProductSearchSelect` and its associated toggle button + state from `PrintableTable.tsx`
2. **Improve** `ProductSearchBar.tsx`:
   - Add a **loading spinner** inside the search input while `getProductsBySearch()` is in flight
   - Increase **debounce delay** from 300ms to 400ms for a better balance between responsiveness and unnecessary queries

No functionality is lost — the always-visible `ProductSearchBar` already covers all use cases that `ProductSearchSelect` provided.

---

## 2. Acceptance Criteria

### 2.1 Removal of Quick Search (PrintableTable.tsx)

- [ ] **AC1**: The `ProductSearchSelect` import (`import ProductSearchSelect from "../AdminSettings/ProductSearchSelect"`) is removed from `PrintableTable.tsx`.
- [ ] **AC2**: The `showQuickSearch` state variable (`const [showQuickSearch, setShowQuickSearch] = useState(false)`) is removed from the component.
- [ ] **AC3**: The toggle button ("Búsqueda rápida de producto") and its wrapping `<div className="mb-4 max-w-7xl mx-auto print:hidden">` are removed.
- [ ] **AC4**: The conditional rendering of `<ProductSearchSelect>` (inside `{showQuickSearch && (...)`) is removed.
- [ ] **AC5**: After removal, the billing page layout remains clean — `ProductSearchBar` is the only search element, followed immediately by the "Products Table" section. No stray whitespace or broken layout.
- [ ] **AC6**: The `ProductSearchSelect` component in `src/components/AdminSettings/ProductSearchSelect.tsx` is **not** deleted, only the import and usage in `PrintableTable.tsx` — it is still used elsewhere in the codebase.

### 2.2 Loading Spinner (ProductSearchBar.tsx)

- [ ] **AC7**: A loading state is introduced in `ProductSearchBar` (e.g., `const [isSearching, setIsSearching] = useState(false)`).
- [ ] **AC8**: The loading state is set to `true` immediately before calling `getProductsBySearch()` inside `performSearch()` and set to `false` after results are returned (both success and error/no-results paths).
- [ ] **AC9**: A **spinning circle indicator** is rendered inside the search input while `isSearching` is `true`:
  - Positioned at the **right side** of the input (inside the input's bounds), similar to how `ProductSearchSelect` already does it (see lines 208-212 of `ProductSearchSelect.tsx`).
  - Uses `animate-spin` (Tailwind) for rotation.
  - Has a muted color (e.g., `border-gray-300 border-t-blue-500`) to not distract from the search text.
  - Does **not** overlap the search text or the left-side search icon.
  - Disappears once the search completes.
- [ ] **AC10**: The spinner does **not** appear for barcode scans — only for manual text debounced searches. (Barcode path does not call `performSearch`.)

### 2.3 Debounce Change (ProductSearchBar.tsx)

- [ ] **AC11**: The debounce delay constant for manual search is changed from `300` to `400` milliseconds (line 145 of current `ProductSearchBar.tsx`).
- [ ] **AC12**: Typing stops for 400ms triggers a search call; typing again before 400ms resets the debounce timer.
- [ ] **AC13**: The barcode detection logic (sub-50ms keystroke interval → barcode mode with 900ms timeout) is **unaffected**.

### 2.4 No Regressions

- [ ] **AC14**: The `ProductSearchBar` still functions correctly: typing shows suggestions, arrow keys navigate, Enter selects, `/` focuses the input, barcode scanning works, supplier filter works.
- [ ] **AC15**: The `ProductSearchSelect` component in its other usage locations (e.g., `AdminSettings`) is unaffected — imports, props, and behavior remain unchanged.
- [ ] **AC16**: The build completes with no TypeScript errors (`npm run build` passes).

---

## 3. Technical Notes

### 3.1 Files to Modify

| File | Changes Required |
|------|-----------------|
| `src/components/Billing/PrintableTable.tsx` | Remove import of `ProductSearchSelect` (line 9). Remove `showQuickSearch` state (line 204). Remove the entire quick search toggle + `ProductSearchSelect` rendering block (lines 297–328). |
| `src/components/Billing/ProductSearchBar.tsx` | (1) Add `isSearching` state. (2) Set `isSearching` in `performSearch()`. (3) Render a spinner inside the input. (4) Change debounce from 300ms to 400ms (line 145). |

### 3.2 Detailed Change Descriptions

#### 3.2.1 PrintableTable.tsx — Removals

**Remove line 9**:
```typescript
import ProductSearchSelect from "../AdminSettings/ProductSearchSelect";
```

**Remove line 204**:
```typescript
const [showQuickSearch, setShowQuickSearch] = useState(false);
```

**Remove lines 297–328** (the entire block beginning with the comment `{/* Quick product search via ProductSearchSelect ... */}` and ending with the closing `</div>` of the section):

```typescript
      {/* Quick product search via ProductSearchSelect (reusable from settings) */}
      <div className="mb-4 max-w-7xl mx-auto print:hidden">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowQuickSearch(!showQuickSearch)}
            className="flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
          >
            <svg ...>
              {showQuickSearch ? (...) : (...)}
            </svg>
            {showQuickSearch ? "Cerrar búsqueda rápida" : "Búsqueda rápida de producto"}
          </button>
        </div>
        {showQuickSearch && (
          <div className="mt-2">
            <ProductSearchSelect
              onSelect={(product) => {
                handleProductAdd({ ...product, amount: 1 });
                setShowQuickSearch(false);
              }}
              showSelectedCard={false}
              showStock
              placeholder="Buscar producto por código o nombre..."
            />
          </div>
        )}
      </div>
```

#### 3.2.2 ProductSearchBar.tsx — Add Loading Spinner

**Add state variable** (alongside existing `useState` declarations, after line 31):
```typescript
const [isSearching, setIsSearching] = useState(false);
```

**Update `performSearch()`** (lines 89–92) to track loading:
```typescript
const performSearch = async (value: string, supId: string) => {
  setIsSearching(true);
  try {
    const results = await getProductsBySearch(value, supId || undefined);
    setSuggestions(results.map(ProductPrismaAdapter.toDomain));
  } finally {
    setIsSearching(false);
  }
};
```

> **Why `try/finally`?** Ensures `isSearching` is always reset to `false`, even if `getProductsBySearch` throws. This prevents a stuck spinner.

**Add spinner inside the input wrapper**, after the `<input>` element and before the closing `</div>` of the search container (around line 289). Use the same approach as `ProductSearchSelect.tsx` lines 208–212:

```typescript
{isSearching && (
  <div className="absolute right-3 top-1/2 -translate-y-1/2">
    <div className="w-4 h-4 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin" />
  </div>
)}
```

#### 3.2.3 ProductSearchBar.tsx — Increase Debounce

**Change debounce delay** (line 145):
```typescript
// Before:
}, 300);
// After:
}, 400);
```

### 3.3 Other Search Bars

The third search bar in the billing page is `ProductSearchBar` itself. The `ProductSearchSelect` is only used in `AdminSettings` pages for shortcut configuration and similar settings forms. Those usages remain unchanged.

### 3.4 No New Dependencies

All changes are self-contained. No new npm packages are required. The spinner uses Tailwind's built-in `animate-spin` utility.

---

## 4. Test Scenarios

| # | Scenario | Expected |
|---|----------|----------|
| 1 | Navigate to billing page | Only `ProductSearchBar` is visible. No "Búsqueda rápida de producto" toggle button exists. |
| 2 | Type in ProductSearchBar input | After 400ms of inactivity, `getProductsBySearch()` is called and suggestions appear. |
| 3 | Type in ProductSearchBar input while results are loading | A spinning indicator is visible on the right side of the input. |
| 4 | Search completes (results or empty) | Spinner disappears. Suggestions dropdown shows results or no-results state. |
| 5 | Barcode scan is performed | No spinner appears. Product is added directly on scan. |
| 6 | Rapid typing in search bar | Only one request fires after 400ms of the last keystroke (debounce works). |
| 7 | Quick search toggle is absent | DOM inspection shows no button with "Búsqueda rápida de producto" text. |
| 8 | `npm run build` | No TypeScript errors. Build succeeds. |

---

## 5. Implementation Order

1. **Edit `ProductSearchBar.tsx`** — Add `isSearching` state, integrate it into `performSearch()`, render the spinner, increase debounce to 400ms.
2. **Edit `PrintableTable.tsx`** — Remove import, state, and toggle block for `ProductSearchSelect`.
3. **Verify build** — Run `npm run build` to confirm no TypeScript errors.
4. **Manual smoke test** — Navigate to billing page, verify search still works, verify no "Búsqueda rápida de producto" appears, verify spinner shows during search.

---

## 6. Files to Modify (Summary)

| File | Action |
|------|--------|
| `src/components/Billing/PrintableTable.tsx` | Delete import + state + JSX block |
| `src/components/Billing/ProductSearchBar.tsx` | Add loading state + spinner + increase debounce |
| `src/components/AdminSettings/ProductSearchSelect.tsx` | **No change** — left untouched |
