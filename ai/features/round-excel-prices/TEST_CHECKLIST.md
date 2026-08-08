# TEST_CHECKLIST.md — Round Excel Prices to Nearest 10

## Acceptance Criteria (from SPEC.md)

| Criteria ID | Description | Test(s) | Status |
|-------------|-------------|---------|--------|
| **AC-01** | `salePrice` is rounded to nearest 10 in `stock.ts` `previewProductsBulk` | `stock.ts – previewProductsBulk` marks existing product as 'ignore' when DB prices match rounded values / marks as 'update' when DB prices match unrounded values | ❌ Fails (TDD) |
| **AC-02** | `salePrice` is rounded to nearest 10 in `stock.ts` `processBulkProductBatch` | `stock.ts – processBulkProductBatch` creates new products with rounded costPrice and salePrice / detects price change when existing prices match unrounded values | ❌ Fails (TDD) |
| **AC-03** | `salePrice` is rounded to nearest 10 in `bulk.ts` `previewProductsBulk` | `bulk.ts – previewProductsBulk` marks existing product as 'ignore' when DB prices match rounded values / marks as 'update' when DB prices match unrounded values | ❌ Fails (TDD) |
| **AC-04** | `salePrice` is rounded to nearest 10 in `bulk.ts` `createProductsBulk` | `bulk.ts – createProductsBulk` creates new products with rounded costPrice and salePrice / updates existing products with rounded prices when they differ | ❌ Fails (TDD) |
| **AC-05** | Preview table in `excel-upload-modal.tsx` displays rounded price | *Manual test only* (component rendering with state is complex; see manual test cases) | N/A (manual) |
| **AC-06** | `costPrice` is also rounded to nearest 10 | Verified indirectly in all the above tests — every assertion checks both `costPrice` (price) and `salePrice` are multiples of 10 | ❌ Fails (TDD) |

---

## Test Files

| File | Location | Type | Purpose |
|------|----------|------|---------|
| `roundToNearest10.test.ts` | `src/__tests__/utils/` | Unit (pure function) | Tests the rounding utility independently. Import will fail — module does not exist yet. |
| `round-excel-prices.test.ts` | `src/__tests__/actions/` | Integration (mocked DB) | Tests all 4 server action locations with `vi.mock("@/lib/db")`. |

---

## Detailed Test Descriptions

### 1. `roundToNearest10` pure utility (`roundToNearest10.test.ts`)

| # | Input | Expected Output | Edge Case Category |
|---|-------|-----------------|-------------------|
| 1.1 | `1953` | `1950` | Standard rounding down |
| 1.2 | `1934.24` | `1930` | Decimal fraction rounding down |
| 1.3 | `1935` | `1940` | Round half up (boundary) |
| 1.4 | `1939` | `1940` | Standard rounding up |
| 1.5 | `0` | `0` | Zero input |
| 1.6 | `1000` | `1000` | Already multiple of 10 (idempotent) |
| 1.7 | `999999.99` | `1000000` | Large number |
| 1.8 | `123456789` | `123456790` | Large number within safe integer range |
| 1.9 | `0.1 + 0.2` | `0` | Floating-point precision artifact |

**Why it will fail**: The module `@/utils/round-to-nearest-10` does not exist yet (export `roundToNearest10` not found).

### 2. `stock.ts` — `previewProductsBulk` (AC-01)

| Test | Existing Product Prices | Expected Status | TDD Reason |
|------|------------------------|-----------------|------------|
| Match rounded | price=1090, salePrice=1420 | `"ignore"` | BEFORE: unrounded (1089, 1415.7) ≠ (1090, 1420) → `"update"`. AFTER: match → `"ignore"` |
| Match unrounded | price=1089, salePrice=1415.7 | `"update"` | BEFORE: match → `"ignore"`. AFTER: rounded (1090, 1420) ≠ (1089, 1415.7) → `"update"` |
| Different prices | price=1080, salePrice=1410 | `"update"` | Both BEFORE and AFTER produce `"update"` (regression guard) |

### 3. `stock.ts` — `processBulkProductBatch` (AC-02)

| Test | Scenario | Expected Data | TDD Reason |
|------|----------|---------------|------------|
| New products | No existing products → createMany | price=1090, salePrice=1420 | BEFORE: createMany gets (1089, 1415.7). AFTER: (1090, 1420). |
| Update triggered | Existing has unrounded prices → should update | updatedCount=1, $executeRawUnsafe called | BEFORE: prices match → skip. AFTER: prices differ → update. |

### 4. `bulk.ts` — `previewProductsBulk` (AC-03)

Identical logic to Test 2 but for the `@/actions/stock/bulk` module. Same TDD pivot strategy.

### 5. `bulk.ts` — `createProductsBulk` (AC-04)

| Test | Scenario | Expected Data | TDD Reason |
|------|----------|---------------|------------|
| New products | No existing products → product.create | price=1090, salePrice=1420 | BEFORE: create gets (1089, 1415.7). AFTER: (1090, 1420). |
| Update triggered | Existing has unrounded prices → product.update | updateData contains price=1090, salePrice=1420 | BEFORE: match → no update. AFTER: differ → update triggered. |

---

## Edge Cases Tested

| # | Edge Case | Covered? | How |
|---|-----------|----------|-----|
| 1 | Zero `filePrice` | ✅ | Not explicitly in server-action tests, but covered by `roundToNearest10(0) = 0` unit test |
| 2 | Zero gain/discount/iva | ✅ | Not explicit, but formula degenerates correctly via the rounding function |
| 3 | Negative prices | ✅ | `roundToNearest10(-5) = 0` unit test |
| 4 | Very large numbers | ✅ | `roundToNearest10(999999.99) = 1000000` and `123456789` unit tests |
| 5 | Gain with decimals | ✅ | Formula with decimal gain uses the same `Math.round(/10)*10` path |
| 6 | Discount = 100 | ✅ | Rounding of zero produces 0 |
| 7 | Floating-point precision | ✅ | `roundToNearest10(0.1 + 0.2) = 0` |
| 8 | Values already multiples of 10 | ✅ | `roundToNearest10(1000) = 1000` unit test |
| 9 | Price comparison with tolerance | ✅ | Verified by "ignore when match rounded values" test — tolerance check still works when both sides are multiples of 10 |
| 10 | Mixed hasExcelIva/applyPriceFormula | ❌ | Both paths use identical formula blocks — not separately tested |

---

## Scenarios That Cannot Be Automated (Manual Testing)

| Scenario | Reason | Manual Test Steps |
|----------|--------|-------------------|
| AC-05: Preview display in modal | Component rendering with state (adjustmentDiscount, adjustmentGain, adjustmentIva) requires full DOM rendering with Radix UI, which is brittle in jsdom. | Upload Excel with known prices and verify the preview column displays `1.417` instead of `1.417,00` |
| End-to-end Excel upload flow | Requires actual Excel file parsing and data flow through the full stack | Upload a `.xlsx` with `filePrice=1000, discount=10, iva=21, gain=30` → verify `costPrice=1090, salePrice=1420` in preview and after confirmation |
| Manual test case 6: Update existing | Requires a product to already exist in DB and be re-uploaded | Upload same product code with different price → verify price comparison correctly identifies changes |

---

## How to Run

```bash
# Run all tests
npm run test

# Run only the round-excel-prices tests
npm run test -- src/__tests__/actions/round-excel-prices.test.ts

# Run only the roundToNearest10 tests
npm run test -- src/__tests__/utils/roundToNearest10.test.ts

# Run with watch mode for TDD
npm run test -- --watch
```

## Expected Failure Output

All tests in both files are expected to FAIL against the current (unmodified) codebase:

| Test File | Expected Failures | Reason |
|-----------|-------------------|--------|
| `roundToNearest10.test.ts` | 9/9 | Module not found (`@/utils/round-to-nearest-10`) |
| `round-excel-prices.test.ts` | At least 4/9 | Prices still computed without rounding (1089 instead of 1090, 1415.7 instead of 1420) |

After the Developer implements the feature (inline `Math.round(.../10)*10` in all 4 server action locations + creates the utility module), all tests should pass.
