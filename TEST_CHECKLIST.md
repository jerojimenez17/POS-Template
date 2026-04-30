# Test Checklist - Barcode Scanner Detection Feature

**Feature:** Barcode Scanner Detection in Product Search  
**Component:** `src/components/Billing/PrintableTable.tsx`  
**Spec:** SPEC.md (lines 633-832)

---

## Acceptance Criteria Checklist

### AC-01: Barcode Detection by Timing
**Requirement:** Fast keystrokes (<50ms) trigger barcode mode (`isBarcodeMode` becomes true)

- [ ] **Positive:** Typing 3+ characters with <50ms between keystrokes sets `isBarcodeMode = true`
- [ ] **Positive:** Inter-keystroke time of 10ms triggers barcode mode
- [ ] **Positive:** Inter-keystroke time of 49ms triggers barcode mode
- [ ] **Negative:** Inter-keystroke time of 50ms does NOT trigger barcode mode
- [ ] **Negative:** Inter-keystroke time of 100ms does NOT trigger barcode mode
- [ ] **Edge:** First keystroke (no previous keystroke) should not trigger barcode mode
- [ ] **Edge:** Burst of fast keystrokes (e.g., 13 chars for EAN-13) maintains barcode mode

**Expected State:** `isBarcodeMode === true` when fast typing detected

---

### AC-02: Immediate Product Lookup by Code in Barcode Mode
**Requirement:** When barcode mode detected and input >= 3 chars, `getProductByCode` is called immediately

- [ ] **Positive:** After barcode mode detected, typing 3rd character calls `getProductByCode("123")`
- [ ] **Positive:** Barcode mode with 13-char EAN code calls `getProductByCode` with full code
- [ ] **Positive:** `getProductByCode` called immediately (no debounce delay)
- [ ] **Negative:** Manual typing (>=50ms) does NOT call `getProductByCode`
- [ ] **Negative:** `getProductsBySearch` is NOT called in barcode mode
- [ ] **Edge:** Input of exactly 3 characters triggers `getProductByCode`
- [ ] **Edge:** Input longer than 3 characters in barcode mode calls `getProductByCode` once with full value

**Expected Behavior:** `getProductByCode` called with complete input value immediately

---

### AC-03: Description Search Preserved for Manual Typing
**Requirement:** Manual typing (>=50ms between keystrokes) triggers `getProductsBySearch` at 2+ chars

- [ ] **Positive:** Typing with 100ms between keystrokes at 2 chars calls `getProductsBySearch("ab")`
- [ ] **Positive:** Manual typing continues to call `getProductsBySearch` as input grows
- [ ] **Negative:** Fast typing (<50ms) does NOT call `getProductsBySearch`
- [ ] **Negative:** Input of 1 character (manual) does NOT trigger search
- [ ] **Edge:** Exactly 50ms between keystrokes is treated as manual typing
- [ ] **Edge:** Switching from fast to slow typing resets to manual search mode

**Expected Behavior:** `getProductsBySearch` called when `value.length >= 2` and typing is slow

---

### AC-04: Reset Barcode Mode After Timeout
**Requirement:** After 300ms of no keystrokes, barcode mode resets (`isBarcodeMode` becomes false)

- [ ] **Positive:** 300ms after last fast keystroke sets `isBarcodeMode = false`
- [ ] **Positive:** 500ms after last keystroke confirms barcode mode is reset
- [ ] **Negative:** 200ms after last keystroke does NOT reset barcode mode yet
- [ ] **Edge:** New keystroke before 300ms resets the timer
- [ ] **Edge:** After timeout, manual typing works normally (calls `getProductsBySearch`)
- [ ] **Edge:** After timeout and mode reset, input is cleared

**Expected Behavior:** `isBarcodeMode === false` after 300ms timeout, input cleared

---

### AC-05: Successful Barcode Scan Adds Product
**Requirement:** Successful barcode scan calls `addItem`, clears `searchCode`, clears suggestions

- [ ] **Positive:** `getProductByCode` returns product → `addItem` called with adapted product
- [ ] **Positive:** After successful scan, `searchCode` state is cleared (input empty)
- [ ] **Positive:** After successful scan, suggestions array is cleared
- [ ] **Positive:** `addItem` called with correct product data (id, code, description, price)
- [ ] **Negative:** Product with zero stock shows "Producto sin Stock" error
- [ ] **Edge:** Scanning same product twice adds it again (separate line items)
- [ ] **Edge:** Product with `amount: 0` shows error and does NOT call `addItem`

**Expected Behavior:**
- `addItem` called with `{ ...adaptedProduct, amount: 1 }`
- `searchCode` set to `""`
- `suggestions` set to `[]`
- `selectedIndex` set to `-1`

---

### AC-06: Handle Barcode Scan Failure
**Requirement:** Failed barcode scan (product not found) calls `setErrorMessage`, clears input

- [ ] **Positive:** `getProductByCode` returns `null` → `setErrorMessage("Producto no encontrado")`
- [ ] **Positive:** Error message displays in UI (red text below search input)
- [ ] **Positive:** After error, input is cleared (`searchCode = ""`)
- [ ] **Positive:** Error message auto-clears after 3000ms
- [ ] **Negative:** Failed scan does NOT call `addItem`
- [ ] **Edge:** Network error during `getProductByCode` shows appropriate error
- [ ] **Edge:** Empty barcode result shows error (shouldn't happen with 3+ char check)

**Expected Error Message:** `"Producto no encontrado"`

**Expected Behavior:**
- `setErrorMessage("Producto no encontrado")` called
- Input cleared
- `addItem` NOT called

---

### AC-07: Visual Feedback for Barcode Mode (Optional)
**Requirement:** Visual feedback - input receives barcode mode styling (blue border class)

- [ ] **Positive:** When `isBarcodeMode = true`, input has blue border CSS class
- [ ] **Positive:** Visual class includes `border-blue-500` or equivalent
- [ ] **Positive:** Visual feedback appears immediately when barcode mode detected
- [ ] **Negative:** Manual typing mode does NOT apply blue border class
- [ ] **Edge:** After 300ms timeout, blue border class is removed
- [ ] **Edge:** Visual feedback works with dark mode (dark:border-blue-400)

**Expected CSS Classes:** `border-blue-500`, `ring-blue-500`, or similar visual indicator

---

## Integration Test Scenarios

### Scenario 1: Complete Barcode Scan Flow (Happy Path)
1. Focus search input
2. Type barcode quickly (<50ms between keys): "1234567890123"
3. Verify: `isBarcodeMode = true`, input has blue border
4. Verify: `getProductByCode("1234567890123")` called
5. Verify: Product found → `addItem` called
6. Verify: Input cleared, suggestions cleared
7. Verify: After 300ms, `isBarcodeMode = false`, blue border removed

### Scenario 2: Barcode Scan Failure Flow
1. Focus search input
2. Type invalid barcode quickly: "9999999999999"
3. Verify: `getProductByCode("9999999999999")` called
4. Verify: Returns null → `setErrorMessage("Producto no encontrado")`
5. Verify: Input cleared
6. Verify: `addItem` NOT called

### Scenario 3: Mixed Manual and Barcode Input
1. Type "ab" slowly (100ms between keys) → triggers `getProductsBySearch`
2. See suggestions appear
3. Clear input, then type "12345" quickly (<50ms) → triggers barcode mode
4. Verify: `getProductByCode("12345")` called (not `getProductsBySearch`)
5. Verify: Suggestions cleared after successful scan

### Scenario 4: Rapid Sequential Scans
1. Scan barcode 1 quickly → product added
2. Within 300ms, scan barcode 2 quickly → second product added
3. Verify: Both products in bill
4. Verify: Each scan clears input immediately

---

## Error Messages Reference

| Scenario | Error Message | Trigger |
|----------|--------------|---------|
| Product not found (barcode) | `"Producto no encontrado"` | `getProductByCode` returns `null` |
| Product out of stock | `"Producto sin Stock"` | Product found but `amount <= 0` |
| Network error | `"Error al buscar producto"` | `getProductByCode` throws exception |

---

## Test Execution Commands

```bash
# Run all barcode tests
npm run test -- PrintableTable.barcode.test.tsx

# Run specific acceptance criteria tests
npm run test -- --testNamePattern="AC-01"
npm run test -- --testNamePattern="AC-02"
npm run test -- --testNamePattern="AC-03"
npm run test -- --testNamePattern="AC-04"
npm run test -- --testNamePattern="AC-05"
npm run test -- --testNamePattern="AC-06"
npm run test -- --testNamePattern="AC-07"

# Run with watch mode during development
npm run test:watch -- PrintableTable.barcode.test.tsx
```

---

## Mock Setup Requirements

### Server Actions to Mock
- `getProductByCode(code: string)` → Returns `Product | null`
- `getProductsBySearch(query: string)` → Returns `Product[]`

### Context Values to Mock
- `BillContext`: Provide `addItem`, `removeItem`, `BillState`, `printMode`, `qzTrayActive`

### Timer Mocks
- Use `vi.advanceTimersByTime(ms)` to test 300ms timeout
- Mock `Date.now()` to simulate fast/slow keystrokes

---

## Notes for Implementation

1. **All tests currently FAIL** - This is expected in TDD Red phase
2. Implementation must be added to `handleSearch` function and `onKeyDown` handler in `PrintableTable.tsx`
3. Use `lastKeystrokeTime` ref to track timing
4. Use `barcodeTimeout` ref to manage 300ms reset timer
5. Use `isBarcodeMode` state to track barcode mode
6. Preserve existing `getProductsBySearch` behavior for manual typing
