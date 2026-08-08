# SPEC.md — Round Product Prices to Nearest 10 During Excel Bulk Upload

## Feature Name
`round-excel-prices`

## Goal
Round all computed `salePrice` and `costPrice` values to the nearest multiple of 10 during the Excel bulk product import flow. After this feature, prices calculated from the formula `salePrice = costPrice * (1 + gain/100)` (where `costPrice = filePrice * (1 - discount/100) * (1 + iva/100)`) will always be multiples of 10 (e.g., `1930`, `1940`, `1950`) instead of containing cents (e.g., `1934.24`, `1953.86`).

---

## Background

During bulk Excel product import, sale prices are derived through a multi-step formula:

```
costPrice   = filePrice * (1 - discount/100) * (1 + iva/100)
salePrice   = costPrice * (1 + gain/100)
```

This produces prices with arbitrary decimal fractions (e.g., `1934.24`, `1953.86`). The business requires these prices to be rounded to the nearest multiple of 10 for cleaner shelf pricing.

The rounding function used is the standard JavaScript "round to nearest 10":

```typescript
const roundToNearest10 = (value: number): number => Math.round(value / 10) * 10;
```

Examples:
| Input | Rounded |
|-------|---------|
| 1953 | 1950 |
| 1934.24 | 1930 |
| 1935 | 1940 |
| 1939 | 1940 |
| 0 | 0 |

The rounding must be applied at the point of calculation in both the **preview** functions (which show the user what prices will look like before confirming) and the **batch creation/update** functions (which persist the data). Additionally, the preview display in the modal must reflect the rounded value.

---

## Detailed Changes

### 1. `src/actions/stock.ts` — `previewProductsBulk` function

**Lines 198-203** — Price formula computation:

```typescript
// Before:
costPrice = filePrice * (1 - d / 100) * (1 + rowIva / 100);
salePrice = costPrice * (1 + g / 100);

// After:
costPrice = Math.round(filePrice * (1 - d / 100) * (1 + rowIva / 100) / 10) * 10;
salePrice = Math.round(costPrice * (1 + g / 100) / 10) * 10;
```

Note: `costPrice` is rounded first (to nearest 10), then `salePrice` is calculated from the rounded `costPrice` and rounded again (to nearest 10). This avoids accumulating two levels of decimals.

**Lines 205-207** — Price comparison (uses `Math.abs(...) < 0.001` tolerance):
No change needed. The tolerance of `0.001` still works correctly with multiples of 10 (e.g., `Math.abs(1930 - 1930) < 0.001` is `true`).

### 2. `src/actions/stock.ts` — `processBulkProductBatch` function

**Lines 417-423** — Price formula computation:

```typescript
// Before:
costPrice = filePrice * (1 - d / 100) * (1 + rowIva / 100);
salePrice = costPrice * (1 + g / 100);
gainValue = g;

// After:
costPrice = Math.round(filePrice * (1 - d / 100) * (1 + rowIva / 100) / 10) * 10;
salePrice = Math.round(costPrice * (1 + g / 100) / 10) * 10;
gainValue = g;
```

Apply identical rounding as in `previewProductsBulk`. The `gainValue` assignment is unchanged.

**Lines 431-434** — Price comparison:
No change needed. Same tolerance-based comparison logic works correctly.

### 3. `src/actions/stock/bulk.ts` — `previewProductsBulk` function

**Lines 83-89** — Price formula computation:

```typescript
// Before:
if (applyPriceFormula) {
  const d = discount ?? 0;
  const i = iva ?? 0;
  const g = gain ?? 0;
  costPrice = filePrice * (1 - d / 100) * (1 + i / 100);
  salePrice = costPrice * (1 + g / 100);
}

// After:
if (applyPriceFormula) {
  const d = discount ?? 0;
  const i = iva ?? 0;
  const g = gain ?? 0;
  costPrice = Math.round(filePrice * (1 - d / 100) * (1 + i / 100) / 10) * 10;
  salePrice = Math.round(costPrice * (1 + g / 100) / 10) * 10;
}
```

Identical rounding pattern.

### 4. `src/actions/stock/bulk.ts` — `createProductsBulk` function

**Lines 270-277** — Price formula computation:

```typescript
// Before:
if (applyPriceFormula) {
  const d = discount ?? 0;
  const i = iva ?? 0;
  const g = gain ?? 0;
  costPrice = filePrice * (1 - d / 100) * (1 + i / 100);
  salePrice = costPrice * (1 + g / 100);
  gainValue = g;
}

// After:
if (applyPriceFormula) {
  const d = discount ?? 0;
  const i = iva ?? 0;
  const g = gain ?? 0;
  costPrice = Math.round(filePrice * (1 - d / 100) * (1 + i / 100) / 10) * 10;
  salePrice = Math.round(costPrice * (1 + g / 100) / 10) * 10;
  gainValue = g;
}
```

Identical rounding pattern.

### 5. `src/components/stock/excel-upload-modal.tsx` — Preview table display

**Lines 597-604** — Preview price calculation for display:

```typescript
// Before:
${(() => {
  const parsed = parseExcelIva(item.iva);
  const rowIva = parsed.percent !== null ? parsed.percent : parseFloat(adjustmentIva);
  const withDiscount = item.price * (1 - adjustmentDiscount / 100);
  const withIva = withDiscount * (1 + rowIva / 100);
  const withGain = withIva * (1 + adjustmentGain / 100);
  return withGain.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
})()}

// After:
${(() => {
  const parsed = parseExcelIva(item.iva);
  const rowIva = parsed.percent !== null ? parsed.percent : parseFloat(adjustmentIva);
  const withDiscount = item.price * (1 - adjustmentDiscount / 100);
  const withIva = withDiscount * (1 + rowIva / 100);
  const withGain = withIva * (1 + adjustmentGain / 100);
  return Math.round(withGain / 10) * 10.toLocaleString("es-AR", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
})()}
```

Two changes:
1. Wrap `withGain` with `Math.round(withGain / 10) * 10` before formatting.
2. Change fraction digits from `2` to `0` since the value is now a multiple of 10 (no decimals to show).

**Important**: Use parentheses correctly to avoid operator precedence issues. Correct expression:
```typescript
return (Math.round(withGain / 10) * 10).toLocaleString("es-AR", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
```

---

## Data Models / Interfaces

No changes to existing models or interfaces. All affected fields (`costPrice`, `salePrice`, `price`) remain `number` in TypeScript — they will simply always hold multiples of 10 after rounding.

---

## File Structure

| Action | File | Lines | Description |
|--------|------|-------|-------------|
| MODIFY | `src/actions/stock.ts` | 201-202 | Round `costPrice` and `salePrice` in `previewProductsBulk` |
| MODIFY | `src/actions/stock.ts` | 420-421 | Round `costPrice` and `salePrice` in `processBulkProductBatch` |
| MODIFY | `src/actions/stock/bulk.ts` | 87-88 | Round `costPrice` and `salePrice` in `previewProductsBulk` |
| MODIFY | `src/actions/stock/bulk.ts` | 274-275 | Round `costPrice` and `salePrice` in `createProductsBulk` |
| MODIFY | `src/components/stock/excel-upload-modal.tsx` | 602-604 | Round `withGain` in preview display and remove decimal fraction digits |

---

## Acceptance Criteria

### AC-01: `salePrice` is rounded to nearest 10 in `stock.ts` `previewProductsBulk`
- **Given** an Excel row with `filePrice = 1000`, `discount = 10`, `iva = 21`, `gain = 30`
- **When** `previewProductsBulk` computes prices
- **Then** `costPrice` = `Math.round(1000 * 0.9 * 1.21 / 10) * 10` = `Math.round(108.9) * 10` = `1090`
- **Then** `salePrice` = `Math.round(1090 * 1.3 / 10) * 10` = `Math.round(141.7) * 10` = `1420`

### AC-02: `salePrice` is rounded to nearest 10 in `stock.ts` `processBulkProductBatch`
- **Given** the same Excel row as AC-01
- **When** `processBulkProductBatch` computes prices
- **Then** `costPrice` and `salePrice` match the same rounded values as AC-01

### AC-03: `salePrice` is rounded to nearest 10 in `bulk.ts` `previewProductsBulk`
- **Given** the same Excel row as AC-01
- **When** `bulk.ts` `previewProductsBulk` computes prices
- **Then** `costPrice` and `salePrice` match the same rounded values as AC-01

### AC-04: `salePrice` is rounded to nearest 10 in `bulk.ts` `createProductsBulk`
- **Given** the same Excel row as AC-01
- **When** `createProductsBulk` computes prices
- **Then** `costPrice` and `salePrice` match the same rounded values as AC-01

### AC-05: Preview table in `excel-upload-modal.tsx` displays rounded price
- **Given** Excel data that produces `withGain = 1417` after rounding
- **When** the preview table renders
- **Then** the sale price column displays `1.417` (not `1.417,00`)

### AC-06: `costPrice` is also rounded to nearest 10
- **Given** any `filePrice`, `discount`, and `iva` that produce a fractional `costPrice`
- **Then** `costPrice` is always a multiple of 10 (verified via `costPrice % 10 === 0`)

---

## Edge Cases

| # | Case | Expected Behavior |
|---|------|-------------------|
| 1 | **Zero `filePrice`** (price = 0) | `costPrice = Math.round(0 / 10) * 10 = 0`; `salePrice = Math.round(0 / 10) * 10 = 0`. Both remain 0. |
| 2 | **Zero `gain` / `discount` / `iva`** | Formula reduces to `costPrice = Math.round(filePrice / 10) * 10` and `salePrice = Math.round(costPrice / 10) * 10`. If `filePrice` is already a multiple of 10, both are unchanged. |
| 3 | **Negative prices** | Not possible via the UI (Excel prices are positive). If a negative `filePrice` somehow exists, `Math.round(-5 / 10) * 10 = Math.round(-0.5) * 10 = 0` (rounds toward +∞). The UI prevents negative prices. |
| 4 | **Very large numbers** (e.g., `filePrice = 999999.99`) | `Math.round(999999.99 / 10) * 10 = Math.round(99999.999) * 10 = 100000 * 10 = 1,000,000`. Large numbers round correctly within JavaScript's safe integer range (±2³¹). |
| 5 | **`gain` with decimals** (e.g., `gain = 15.5`) | `salePrice = Math.round(costPrice * (1 + 15.5/100) / 10) * 10`. The intermediate value `costPrice * 1.155` may produce decimals, but the final `Math.round(... / 10) * 10` ensures the result is a multiple of 10. |
| 6 | **`discount = 100`** | `costPrice = Math.round(filePrice * 0 * (1 + iva/100) / 10) * 10 = 0`; `salePrice = Math.round(0 / 10) * 10 = 0`. Both are 0. |
| 7 | **Floating-point precision artifacts** (e.g., `0.1 + 0.2 = 0.30000000000000004`) | `Math.round(0.30000000000000004 / 10) * 10 = Math.round(0.030000000000000004) * 10 = 0 * 10 = 0`. Correct — the value is effectively 0. |
| 8 | **Values already multiples of 10** (e.g., `filePrice = 1000`, `discount = 0`, `iva = 0`, `gain = 0`) | `costPrice = Math.round(1000 / 10) * 10 = 1000`; `salePrice = Math.round(1000 / 10) * 10 = 1000`. No change. Rounding is idempotent for multiples of 10. |
| 9 | **Price comparison with tolerance** (lines `Math.abs(x - y) < 0.001`) | Since both sides are now multiples of 10, the comparison `Math.abs(1930 - 1930) < 0.001` is `true`. The tolerance check remains correct. |
| 10 | **Mixed `hasExcelIva` and `applyPriceFormula` scenarios** | Both code paths (line 198 in `stock.ts` and line 417 in `stock.ts`) use the same formula block guarded by `if (applyPriceFormula || hasExcelIva)`. Both paths will apply rounding identically. |

---

## Test Plan

Since the project does not currently have a testing framework configured for these server actions, the primary verification method is:

1. **Manual end-to-end test**: Upload an Excel file with known prices and verify the preview shows rounded values.
2. **Lint check**: Run `npm run lint` to ensure no TypeScript errors.
3. **Build check**: Run `npm run build` to ensure the production build succeeds.

### Manual Test Cases

| # | Test Case | Steps | Expected Result |
|---|-----------|-------|-----------------|
| 1 | Basic rounding | Upload Excel with `filePrice=1000, discount=10, iva=21, gain=30` | Preview shows `costPrice=1090, salePrice=1420` |
| 2 | Confirm and create | Same data after confirm | Product is created with `price=1090, salePrice=1420` |
| 3 | Rounding at boundary | `filePrice=1934.24, discount=10, iva=21, gain=30` | Preview shows `salePrice` rounded to nearest 10 (verify with calculator) |
| 4 | Zero gain | `filePrice=1000, discount=0, iva=0, gain=0` | `costPrice=1000, salePrice=1000` |
| 5 | Decimal gain | `filePrice=1000, discount=10, iva=21, gain=15.5` | Sale price is a multiple of 10 |
| 6 | Update existing | Upload same product with different price | Price comparison correctly identifies changes |

---

## Dependencies

No new dependencies required. Uses built-in `Math.round()` only.
