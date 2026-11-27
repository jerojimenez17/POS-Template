# TEST_CHECKLIST: Remove Redundant "Búsqueda rápida de producto" and Improve ProductSearchBar UX

## Test Files

| File | Tests |
|------|-------|
| `src/components/Billing/__tests__/PrintableTable.test.tsx` | CA-14 (x2) — redundant search removed |
| `src/components/Billing/__tests__/ProductSearchBar.test.tsx` | CA-14 — loading spinner (x2), debounce (x3) |

---

## PrintableTable.test.tsx — CA-14: Redundant search removed

| # | Test | Status | Assertion |
|---|------|--------|-----------|
| 1 | Should NOT show "Búsqueda rápida de producto" button text | ❌ FAILS now, ✅ after | `queryByText("Búsqueda rápida de producto")` is `null` |
| 2 | Should have exactly ONE product search input | ❌ FAILS now, ✅ after | `getAllByPlaceholderText(/Buscar producto/)` has `length === 1` |

### Why test 1 fails now
The toggle button with text "Búsqueda rápida de producto" is rendered unconditionally in `PrintableTable.tsx` (line 312). After the fix, the entire toggle block is removed.

### Why test 2 fails now
Clicking the toggle reveals the `ProductSearchSelect` input, so there are two inputs matching `/Buscar producto/`. After the fix, the toggle and `ProductSearchSelect` no longer exist — only `ProductSearchBar` remains.

---

## ProductSearchBar.test.tsx — Loading Spinner

| # | Test | Status | Assertion |
|---|------|--------|-----------|
| 3 | Shows loading spinner while `getProductsBySearch` is in flight | ❌ FAILS now, ✅ after | `.animate-spin` element is in the DOM |
| 4 | Hides loading spinner after search results arrive | ✅ Regression | `.animate-spin` element is removed after resolution |

### Why test 3 fails now
`ProductSearchBar.tsx` has no `isSearching` state and no spinner JSX. After the fix, `performSearch` sets `isSearching(true)` before `await` and `isSearching(false)` in `finally`, and the spinner is rendered conditionally.

### Test strategy for spinner appearance
- Mock `getProductsBySearch` to return a **never-resolving promise** so `isSearching` stays `true` after the debounce fires
- Use `vi.useFakeTimers()` to control the debounce timeout
- Query by `.animate-spin` class selector

---

## ProductSearchBar.test.tsx — Debounce (300ms → 400ms)

| # | Test | Status | Assertion |
|---|------|--------|-----------|
| 5 | NOT called immediately after typing | ✅ Always | `getProductsBySearch` not called at 0ms |
| 6 | NOT called at 300ms (old debounce boundary) | ❌ FAILS now, ✅ after | `getProductsBySearch` not called at 300ms |
| 7 | Called after full debounce delay (400ms+) | ✅ Always | `getProductsBySearch` called at 450ms with `("ab", undefined)` |

### Why test 6 fails now
Current debounce is 300ms, so `getProductsBySearch` fires at the 300ms mark. After the fix, the debounce is 400ms, so at 300ms the timeout is still pending.

### Why test 7 always passes
Both the old (300ms) and new (400ms) debounce have fired by 450ms.

---

## Acceptance Criteria Coverage

| AC | Description | Covered By |
|----|-------------|-----------|
| AC1 | Remove `ProductSearchSelect` import | Test 1, 2 |
| AC2 | Remove `showQuickSearch` state | Test 1, 2 |
| AC3 | Remove toggle button + wrapper | Test 1 |
| AC4 | Remove conditional `<ProductSearchSelect>` render | Test 2 |
| AC5 | Clean layout after removal | Test 2 |
| AC6 | `ProductSearchSelect` untouched elsewhere | N/A (code review) |
| AC7 | `isSearching` state introduced | Test 3 |
| AC8 | `isSearching` set before call, cleared after | Test 3, 4 |
| AC9 | Spinner rendered inside input | Test 3 |
| AC10 | No spinner for barcode scans | N/A (manual / existing barcode tests) |
| AC11 | Debounce changed from 300ms → 400ms | Test 6 |
| AC12 | Typing resets debounce timer | Test 5, 6 |
| AC13 | Barcode detection unaffected | N/A (existing barcode tests) |
| AC14 | No regressions in ProductSearchBar | Test 1–7 |
| AC15 | ProductSearchSelect unaffected elsewhere | N/A (code review) |
| AC16 | TypeScript build passes | N/A (separate CI check) |
