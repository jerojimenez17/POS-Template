# TEST_CHECKLIST.md — Fix BillReducer Total Calculation Bugs

## Acceptance Criteria

| AC   | Description | Test Coverage | Status |
|------|-------------|---------------|--------|
| AC-01 | `removeItem` correctly updates `total` and `totalWithDiscount` | `removeItem` tests (3 tests) | ❌ FAIL (Bug 1) |
| AC-02 | `changeUnit` correctly recalculates `total` and `totalWithDiscount` | `changeUnit` tests (2 tests) | ❌ FAIL (Bug 2) |
| AC-03 | `removeUnit` correctly decrements `total` (minimum 1 unit) | `removeUnit` tests (3 tests) | ❌ FAIL (Bug 4) |
| AC-04 | `addItem` with discount correctly calculates `totalWithDiscount` | `addItem` discount test | ❌ FAIL (Bug 3) |
| AC-05 | `addUnit` with discount correctly calculates `totalWithDiscount` | `addUnit` discount test | ❌ FAIL (Bug 3) |
| AC-06 | After any sequence of operations, `state.total` = `sum(salePrice × amount)` | Sequence tests (3 tests) | ❌ FAIL (Bugs 1,2,4) |
| AC-07 | After any sequence with discount, `state.totalWithDiscount` = `total × (1 − discount/100)` | Discount sequence test + `discount` action tests | ❌ FAIL (Bug 3) |
| AC-08 | All existing tests continue to pass | — | ⏳ Verify after fix |
| AC-09 | `updateProductAmount` flow (removeItem + addItem) doesn't inflate total | `updateProductAmount` flow test | ❌ FAIL (Bug 1 + Bug 3) |

---

## Test Cases

| # | Test Name | Action(s) | Expected Assertions | Current Status | Bug Exposed |
|---|-----------|-----------|---------------------|----------------|-------------|
| 1 | addItem: new product | `addItem(p1: $100 × 2)` | total = 200, totalWithDiscount = 200 | ❌ FAIL | Bug 3 |
| 2 | addItem: existing product | `addItem(p1: +3)` on p1(×2) | total = 500, totalWithDiscount = 500 | ❌ FAIL | Bug 3 |
| 3 | addItem: with discount 10% | `addItem(p1: $200 × 3)`, discount=10 | total = 600, totalWithDiscount = 540 | ❌ FAIL | Bug 3 |
| 4 | addItem: multiple new products | addItem(p1), addItem(p2) | total = 350, 2 products | ✅ PASS | — |
| 5 | addUnit: no discount | `addUnit(p1: $100 × 2)` on p1(×2) | total = 300 (3×100), amount = 3 | ❌ FAIL | Bug 3 (payload.amount used) |
| 6 | addUnit: with discount 10% | `addUnit(p1: $100 × 2)` on p1(×2), discount=10 | total = 300, totalWithDiscount = 270 | ❌ FAIL | Bug 3 |
| 7 | removeUnit: decrement amount & total | `removeUnit(p1)` on p1(×3, $100) | total = 200, amount = 2 | ❌ FAIL | Bug 4 |
| 8 | removeUnit: minimum 1 (no change) | `removeUnit(p1)` on p1(×1, $100) | total = 100, amount = 1 | ✅ PASS | — |
| 9 | removeUnit: with discount 10% | `removeUnit(p1)` on p1(×3, $100), discount=10 | total = 200, totalWithDiscount = 180 | ❌ FAIL | Bug 4 |
| 10 | removeItem: removes product & updates total | `removeItem(p1)` from [p1($100×2), p2($50×3)] | total = 150, 1 product (p2) | ❌ FAIL | Bug 1 |
| 11 | removeItem: last product → total = 0 | `removeItem(p1)` from [p1($100×2)] | total = 0, products = [] | ❌ FAIL | Bug 1 |
| 12 | removeItem: with discount 10% | `removeItem(p1)` from [p1($100×2), p2($50×3)], discount=10 | total = 150, totalWithDiscount = 135 | ❌ FAIL | Bug 1 |
| 13 | changeUnit: changes amount & recalculates total | `changeUnit(p1: amount=5)` on p1(×2, $100) | total = 500, amount = 5 | ❌ FAIL | Bug 2 |
| 14 | changeUnit: with discount 10% | `changeUnit(p1: amount=5)` on p1(×2, $100), discount=10 | total = 500, totalWithDiscount = 450 | ❌ FAIL | Bug 2 |
| 15 | total action: recalculates from scratch | `total` action with stale total=999 | total = 200 (from products) | ✅ PASS | — |
| 16 | discount action: sets discount & recalculates | `discount(15)` on total=200 | discount=15, totalWithDiscount=170 | ✅ PASS | — |
| 17 | discount action: discount = 0 | `discount(0)` on previous discount=10 | discount=0, totalWithDiscount=200 | ✅ PASS | — |
| 18 | discount action: discount = 100 | `discount(100)` on total=200 | discount=100, totalWithDiscount=0 | ✅ PASS | — |
| 19 | removeAll: resets everything | `removeAll` on state with products | products=[], total=0, discount=0 | ✅ PASS | — |
| 20 | Sequence: add A → add B → remove A | addItem(A: $100×2) → addItem(B: $50×3) → removeItem(A) | total = 150 (= B only) | ❌ FAIL | Bug 1 |
| 21 | Sequence: add → changeUnit → removeUnit | addItem(p1: $100×2) → changeUnit(5) → removeUnit | total = 400 (= 4×100) | ❌ FAIL | Bugs 2, 4 |
| 22 | Sequence: add → discount → addUnit → removeUnit | addItem → discount(10) → addUnit → removeUnit | totalWithDiscount consistent at each step | ❌ FAIL | Bug 3, 4 |
| 23 | **updateProductAmount flow**: removeItem + addItem | removeItem(p1×2) → addItem(p1×5) | total = 500, not inflated (not 700) | ❌ FAIL | Bug 1 + Bug 3 |
| 24 | Edge: discount = 0 ⇒ totalWithDiscount = total | addItem with discount=0 | totalWithDiscount == total | ❌ FAIL | Bug 3 |
| 25 | Edge: zero salePrice product | addItem(salePrice=0, amount=5) | total = 0 | ✅ PASS | — |
| 26 | Edge: floating point prices | addItem($10.50×3) with discount=10 | total ≈ 31.50, totalWithDiscount ≈ 28.35 | ❌ FAIL (totalWithDiscount) | Bug 3 |
| 27 | Edge: multiple add/remove cycles | add→remove, add→add→remove | total consistent = computed total | ❌ FAIL | Bug 1 |
| 28 | Edge: many operations with discount change | 3 products → changeUnit → removeUnit → discount → removeItem | totals always match computed values | ❌ FAIL | Bugs 1,2,3,4 |

---

## Bug-to-Test Mapping

| Bug | Description | Failing Tests |
|-----|-------------|---------------|
| **Bug 1** | `removeItem` doesn't update `total` or `totalWithDiscount` (lines 95-101) | 10, 11, 12, 20, 23, 27, 28 |
| **Bug 2** | `changeUnit` doesn't update `total` or `totalWithDiscount` (lines 131-141) | 13, 14, 21, 28 |
| **Bug 3** | `totalWithDiscount` formula in `addItem` and `addUnit` uses `× state.discount` instead of `× (1 − discount/100)` (lines 44-46, 61-63, 73-75) | 1, 2, 3, 5, 6, 22, 23, 24, 26, 28 |
| **Bug 4** | `removeUnit` doesn't update `total` or `totalWithDiscount` (lines 84-93) | 7, 9, 21, 22, 28 |

---

## How to Verify

1. **Before fix**: Run `npm run test -- src/__tests__/context/BillReducer.test.ts` — tests marked ❌ FAIL should fail
2. **After fix**: Run the same command — all tests should pass
3. **Regression**: Run full test suite `npm run test` — no existing tests should break (AC-08)

### Running specific tests

```bash
# Run all BillReducer tests
npm run test -- src/__tests__/context/BillReducer.test.ts

# Run a specific test by name pattern
npm run test -- src/__tests__/context/BillReducer.test.ts --testNamePattern="removeItem"
```
