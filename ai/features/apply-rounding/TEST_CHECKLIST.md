# TEST_CHECKLIST.md — Apply Rounding to All Prices and Totals

## Feature: `apply-rounding`

---

## Acceptance Criteria

### AC-01: `total` is always an integer after any add/remove/change operation
- [ ] **Test**: "should round total to integer when result has decimals" — 3 products at $1849.3 → total = 5548
- [ ] **Test**: "should round 1849.3 down to 1849 (single item)" — Math.round(1849.3) = 1849
- [ ] **Test**: "should round 1849.5 up to 1850" — Math.round(1849.5) = 1850
- [ ] **Test**: "should round 1849.7 up to 1850" — Math.round(1849.7) = 1850
- [ ] **Test**: "should round 0.5 up to 1" — Math.round(0.5) = 1
- [ ] **Test**: "should round 0.4 down to 0" — Math.round(0.4) = 0
- [ ] **Test**: "should round after reduce, not per-product" — reduce(1.3 + 2.7) = 4.0, Math.round = 4
- [ ] **Test**: "should round single item subtotal correctly" — 510069.86 → Math.round = 510070
- [ ] **Test**: "should ensure Number.isInteger(total) after complex sequence" — verifies integer at every step

### AC-02: `totalWithDiscount` is always an integer after any operation with discount
- [ ] **Test**: "should round totalWithDiscount correctly with integer percentage discount" — total=5548, discount=10% → totalWithDiscount = 4993
- [ ] **Test**: "should round totalWithDiscount with decimal discount percentage" — total=100, discount=10.5% → totalWithDiscount = 90
- [ ] **Test**: "should ensure Number.isInteger(totalWithDiscount) after complex sequence" — verifies integer after discount action

### AC-03: Individual product `salePrice` is rounded to integer in the table display
- [ ] **Implementation**: `PrintableTable.tsx` line 339-343 — `Math.round(product.salePrice)` with `minimumFractionDigits: 0`
- [ ] **Verification**: Visual check that `$1.849,3` becomes `$1.849`

### AC-04: Individual product subtotal (`salePrice × amount`) is rounded to integer in the table display
- [ ] **Implementation**: `PrintableTable.tsx` line 345-349 — `Math.round(product.salePrice * product.amount)` with `minimumFractionDigits: 0`
- [ ] **Verification**: Visual check that `$510.069,86` becomes `$510.070`

### AC-05: The totals section subtotal, discount, and total display rounded values
- [ ] **Implementation**: `PrintableTable.tsx` `totals` useMemo (lines 205-210) — apply `Math.round()` to subtotal, discountAmount, and total
- [ ] **Implementation**: Totals section display format changed to `minimumFractionDigits: 0`

### AC-06: The `ClientSelectionModal` total display shows a rounded integer
- [ ] **Verification**: Modal receives `BillState.total` which is already rounded by the reducer — no display change needed

### AC-07: Receipt/thermal print data contains integer values
- [ ] **Implementation**: `handlePrint` in `PrintableTable.tsx` lines 106-171 — apply `Math.round()` to subtotal, product subtotals, discountAmount, and total

### AC-08: `Math.round()` is used (standard JavaScript rounding: 0.5 goes up)
- [ ] **Test**: "should round 0.5 up to 1" — confirms Math.round(0.5) = 1
- [ ] **Test**: "should round 0.4 down to 0" — confirms Math.round(0.4) = 0
- [ ] **Verification**: All rounding uses `Math.round()`, never `Math.floor()`, `Math.ceil()`, or `Math.trunc()`

### AC-09: All existing tests still pass with rounded values
- [ ] Existing tests with integer values continue to pass
- [ ] "should handle floating point prices correctly" updated: total 31.5 → 32, totalWithDiscount 28.35 → 28
- [ ] Helper functions updated: `computeTotal` wraps with `Math.round()`, `computeTotalWithDiscount` wraps with `Math.round()`

---

## Edge Cases

| # | Case | Expected Behaviour | Status |
|---|------|--------------------|--------|
| 1 | Discount with decimals (10.5%) | totalWithDiscount = Math.round(100 * 0.895) = 90 | ✅ Tested |
| 2 | Zero amounts (product with amount=0) | Math.round(0) = 0 | ✅ Existing test |
| 3 | Large numbers (1342305.098) | Math.round = 1342305 | ✅ Tested |
| 4 | Single-item rounding | Each line item display is independently rounded; total rounds after reduce | ✅ Tested |
| 5 | Discount = 0 | totalWithDiscount = total (both integers) | ✅ Existing test |
| 6 | Discount = 100 | totalWithDiscount = Math.round(total × 0) = 0 | ✅ Existing test |
| 7 | Empty cart | total = 0, totalWithDiscount = 0 | ✅ Existing test |
| 8 | Negative values | Not possible via UI; Math.round(-1.5) = -1 (acceptable) | ❌ Not tested |
| 9 | Floating point precision artifacts | e.g., 0.1 + 0.2 = 0.30000000000000004 → Math.round = 0 (correct) | ❌ Not tested |
| 10 | `updateProductAmount` flow (removeItem + addItem) | Both actions round independently; result consistent | ✅ Existing test |

---

## Required File Changes

| File | Change | Status |
|------|--------|--------|
| `src/context/BillReducer.ts` | Wrap all `total` and `totalWithDiscount` assignments with `Math.round()` | ❌ Not yet implemented |
| `src/components/Billing/PrintableTable.tsx` | Round display values in price cells, subtotal cells, totals section, and receipt data | ❌ Not yet implemented |
| `src/components/Billing/BillButtons.tsx` | Round locally computed `totalAmount` and budget `totalWithDiscount` | ❌ Not yet implemented |
| `src/__tests__/context/BillReducer.test.ts` | Updated expectations + new rounding tests | ✅ Done (failing tests written) |

---

## Test Execution

```bash
npm run test -- --testNamePattern="BillReducer"
```

**Expected result**: All tests run. The new rounding tests should FAIL because `Math.round()` has not been applied to the reducer yet. The existing tests should PASS.

**After implementation**: All tests should PASS (Green).

---

## Test Cases Summary

### Existing Tests Updated (1 test)

| Test | Old Expectation | New Expectation |
|------|----------------|-----------------|
| "should handle floating point prices correctly" | total: 31.5, totalWithDiscount: 28.35 | total: 32, totalWithDiscount: 28 |

### New Tests Added (11 tests)

| # | Test Name | Key Assertion |
|---|-----------|---------------|
| 1 | should round total to integer when result has decimals | 1849.3 × 3 = 5548 |
| 2 | should round 1849.3 down to 1849 (single item) | Math.round(1849.3) = 1849 |
| 3 | should round 1849.5 up to 1850 | Math.round(1849.5) = 1850 |
| 4 | should round 1849.7 up to 1850 | Math.round(1849.7) = 1850 |
| 5 | should round 0.5 up to 1 | Math.round(0.5) = 1 |
| 6 | should round 0.4 down to 0 | Math.round(0.4) = 0 |
| 7 | should round totalWithDiscount correctly with integer percentage discount | 5548 × 0.9 = 4993.2 → 4993 |
| 8 | should round totalWithDiscount with decimal discount percentage | 100 × 0.895 = 89.5 → 90 |
| 9 | should round after reduce, not per-product | 1.3 + 2.7 = 4.0 → 4 |
| 10 | should round single item subtotal correctly | 510069.86 → 510070 |
| 11 | should ensure Number.isInteger(total) after complex sequence | Integer check after 7 operations |
