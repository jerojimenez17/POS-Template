# SPEC.md — Apply Rounding to All Prices and Totals

## Feature Name
`apply-rounding`

## Goal
Round all prices, subtotals, and totals to whole numbers using `Math.round()` throughout the billing flow. After this feature, no decimal fractions will appear in displayed prices, line-item subtotals, cart totals, or any downstream total passed to modals, receipts, or server actions.

---

## Background

The POS system currently works with decimal prices (e.g., `1849.3`, `510069.86`). All totals and display values should be whole numbers (integers). The rounding layer must be applied consistently in two places:

1. **Reducer layer** — `BillReducer.ts` applies `Math.round()` to every `total` and `totalWithDiscount` calculation, ensuring `BillState` always holds integer values.
2. **Display layer** — `PrintableTable.tsx` rounds individual price/subtotal cells and totals-section values for rendering.

Downstream consumers (`ClientSelectionModal`, `BillButtons`, receipt data) will receive pre-rounded values from `BillState` or recalculate with `Math.round()`.

---

## Detailed Changes

### 1. BillReducer.ts — Round totals in all mutating actions

Wrap every `total` assignment and `totalWithDiscount` assignment with `Math.round()`.

#### Actions to modify:

| Action | What to round |
|--------|--------------|
| `addItem` | `newTotal = Math.round(updatedProducts.reduce(...))` |
| | `newTotalWithDiscount = state.discount > 0 ? Math.round(newTotal * (1 - state.discount / 100)) : newTotal` |
| `addUnit` | Same as `addItem` above |
| `removeUnit` | Same as `addItem` above |
| `removeItem` | Same as `addItem` above |
| `changeUnit` | Same as `addItem` above |
| `total` | `total: Math.round(state.products.reduce(...))` |
| `discount` | `totalWithDiscount: Math.round(...)` |

#### Pattern for each action (example — `addItem`):

```typescript
case "addItem": {
  // ... product merging logic unchanged ...
  const newTotal = Math.round(
    updatedProducts.reduce((acc, cur) => acc + cur.salePrice * cur.amount, 0)
  );
  const newTotalWithDiscount = state.discount > 0
    ? Math.round(newTotal * (1 - state.discount / 100))
    : newTotal;
  return {
    ...state,
    products: updatedProducts,
    total: newTotal,
    totalWithDiscount: newTotalWithDiscount,
  };
}
```

The `discount` action currently computes `totalWithDiscount` as:
```typescript
totalWithDiscount:
  state.products.reduce(...) -
  state.products.reduce(...) * action.payload * 0.01,
```
Wrap the final result with `Math.round()`.

---

### 2. PrintableTable.tsx — Round display values

#### 2a. Individual product rows

**Line 339-343** — `product.salePrice` display:
```typescript
// Before:
${product.salePrice.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
// After:
${Math.round(product.salePrice).toLocaleString("es-AR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
```

**Line 345-349** — Product subtotal display (`salePrice * amount`):
```typescript
// Before:
${(product.salePrice * product.amount).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
// After:
${Math.round(product.salePrice * product.amount).toLocaleString("es-AR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
```

#### 2b. Totals section (lines 386-422)

**`totals` useMemo (lines 205-210)** — Apply `Math.round()` inside the memo:
```typescript
const totals = useMemo(() => {
  const subtotal = Math.round(state.products.reduce((sum, p) => sum + p.salePrice * p.amount, 0));
  const discountAmount = state.discount > 0 ? Math.round(subtotal * (state.discount / 100)) : 0;
  const total = state.totalWithDiscount !== undefined
    ? Math.round(Number(state.totalWithDiscount))
    : Math.round(subtotal * (1 - state.discount / 100));
  return { subtotal, discountAmount, total };
}, [state.products, state.discount, state.totalWithDiscount]);
```

Then update the display format in lines 392-395, 403-406, 414-417 to use `minimumFractionDigits: 0, maximumFractionDigits: 0` (or keep as-is since the values are already integers, the formatter with 2 decimal places will show `1850.00` — which is acceptable but not ideal). Decision: **change to 0 fraction digits** for whole-number display.

#### 2c. `handlePrint` receipt data (lines 106-171)

The receipt data is sent to thermal/PDF printing. These values should also be integers:

- Line 108: `const subtotal = Math.round(state.products.reduce(...))`
- Line 129: `subtotal: Math.round(p.salePrice * p.amount)`
- Line 133: `discountAmount: state.discount > 0 ? Math.round(subtotal * (state.discount / 100)) : undefined`
- Line 134: `total: Math.round(Number(state.totalWithDiscount || subtotal * (1 - state.discount / 100)))`

---

### 3. ClientSelectionModal.tsx — No changes needed

This modal receives `total` from `BillButtons.tsx`, which passes `BillState.total`. Since `BillState.total` will already be rounded by the reducer, the displayed value will be an integer.

The total displayed at line 418:
```typescript
${total.toLocaleString("es-AR")}
```
This will naturally show `1.850` instead of `1.849,3` because `total` is already `Math.round()`'d.

---

### 4. BillButtons.tsx — Round locally computed values

#### 4a. `createSale` function (lines 223-228):
```typescript
const totalAmount = Math.round(
  BillState.products.reduce((acc, act) => acc + act.salePrice * act.amount, 0) *
  (1 - BillState.discount * 0.01)
);
```
This is used only for validation (total > 0). The rounding ensures the validation check is consistent with the rounded state.

#### 4b. Budget `totalWithDiscount` computation (lines 445-448):
```typescript
totalWithDiscount={Math.round(
  BillState.products.reduce((acc, act) => acc + act.salePrice * act.amount, 0) *
  (1 - BillState.discount * 0.01)
)}
```

---

### 5. BillingModal.tsx — Already covered

Line 123:
```typescript
const totalToDisplay = sale.totalWithDiscount || sale.total;
```
Since `sale` is a `BillState` and its values are already rounded by the reducer, `totalToDisplay` will be an integer. No change needed.

---

### 6. Test file — Update and add rounding tests

#### 6a. Update existing expectations

In `src/__tests__/context/BillReducer.test.ts`, any test that expects a fractional total must be updated to expect the rounded integer.

Key changes:
- Test "should handle floating point prices correctly" (line 607): currently expects `result.total` to be `31.5` — after rounding, it should be `32` (since `Math.round(31.5) = 32`).
- Test "should calculate totalWithDiscount correctly when a discount is set" (line 95): currently expects `totalWithDiscount` `540` — this stays `540` because `600 * 0.9 = 540` is already an integer. No change needed.
- Test "should calculate totalWithDiscount correctly when discount is set" in `addUnit` (line 153): `300 * 0.9 = 270` — stays `270`. No change.
- Any test with `toBeCloseTo` should now use `toBe` for integer comparisons, or continue using `toBeCloseTo` with tolerance since `Math.round` guarantees integer.

#### 6b. Add new rounding-specific test cases

| # | Test | Expected |
|---|------|----------|
| 1 | Add product with `salePrice: 1849.3, amount: 1` | `total` = **1849** (round down) |
| 2 | Add product with `salePrice: 1849.5, amount: 1` | `total` = **1850** (round up at .5) |
| 3 | Add product with `salePrice: 1849.7, amount: 1` | `total` = **1850** (round up) |
| 4 | Add product with `salePrice: 0.5, amount: 1` | `total` = **1** (.5 goes up) |
| 5 | Add product with `salePrice: 0.4, amount: 1` | `total` = **0** (.4 goes down) |
| 6 | Discount with decimal: total = 100, discount = 10.5 → `totalWithDiscount` = `Math.round(100 * (1 - 10.5/100))` = `Math.round(89.5)` = **90** |
| 7 | Multiple products with mixed decimals: `(1.3 + 2.7) * 1` = 4.0, but `Math.round(1.3 * 1) + Math.round(2.7 * 1)` = 1 + 3 = 4. Verify that total rounds after `reduce()`, not per-product. |

---

## Data Models / Interfaces

No changes to existing models (`BillState`, `Product`, `BillAction`) are required. The `total` and `totalWithDiscount` fields remain `number` in TypeScript — they will simply always hold integer values after rounding.

---

## File Structure

| Action | File | Description |
|--------|------|-------------|
| **MODIFY** | `src/context/BillReducer.ts` | Wrap all `total` and `totalWithDiscount` calculations with `Math.round()` |
| **MODIFY** | `src/components/Billing/PrintableTable.tsx` | Round individual price/subtotal display cells, totals section, and receipt data |
| **MODIFY** | `src/components/Billing/BillButtons.tsx` | Round locally computed `totalAmount` and budget `totalWithDiscount` |
| **MODIFY** | `src/__tests__/context/BillReducer.test.ts` | Update fractional expectations; add rounding-specific tests |

---

## Acceptance Criteria

### AC-01: `total` is always an integer after any add/remove/change operation
- **Given** any sequence of `addItem`, `addUnit`, `removeUnit`, `removeItem`, `changeUnit` with prices containing decimals
- **Then** `state.total` is always an integer (`Number.isInteger(state.total) === true`)

### AC-02: `totalWithDiscount` is always an integer after any operation with discount
- **Given** any discount value (including decimals like 10.5%)
- **Then** `state.totalWithDiscount` is always an integer after any state mutation

### AC-03: Individual product `salePrice` is rounded to integer in the table display
- **Given** a product with `salePrice: 1849.3`
- **When** rendered in `PrintableTable`
- **Then** the price cell displays `1.849` (rounded down), not `1.849,3`

### AC-04: Individual product subtotal (`salePrice × amount`) is rounded to integer in the table display
- **Given** a product with `salePrice: 510069.86, amount: 1`
- **When** rendered in `PrintableTable`
- **Then** the subtotal cell displays `510.070` (rounded up), not `510.069,86`

### AC-05: The totals section subtotal, discount, and total display rounded values
- **Given** products and discount in the cart
- **When** the totals section renders in `PrintableTable`
- **Then** `totals.subtotal`, `totals.discountAmount`, and `totals.total` are all displayed as integers

### AC-06: The `ClientSelectionModal` total display shows a rounded integer
- **Given** `BillState.total = 1342305.098` (before rounding)
- **After** the reducer rounds it to `1342305`
- **When** `ClientSelectionModal` renders `BillState.total`
- **Then** the display shows `1.342.305`, not `1.342.305,098`

### AC-07: Receipt/thermal print data contains integer values
- **Given** any state with decimal prices
- **When** `handlePrint` is called in `PrintableTable`
- **Then** `receiptData.subtotal`, `receiptData.products[*].subtotal`, `receiptData.discountAmount`, and `receiptData.total` are all integers

### AC-08: `Math.round()` is used (standard JavaScript rounding: 0.5 goes up)
- All rounding must use `Math.round()`, never `Math.floor()` or `Math.ceil()` or `Math.trunc()`
- Verify: `Math.round(1849.3) → 1849`, `Math.round(1849.5) → 1850`, `Math.round(1849.7) → 1850`, `Math.round(0.5) → 1`

### AC-09: All existing tests still pass with rounded values
- **Given** the existing test suite in `src/__tests__/context/BillReducer.test.ts`
- **When** `npm run test` is executed after changes
- **Then** all existing tests pass (after updating expectations for rounding)

---

## Edge Cases

| # | Case | Expected Behavior |
|---|------|-------------------|
| 1 | **Discount with decimals** (e.g., 10.5%) | `totalWithDiscount = Math.round(total * (1 - 10.5/100))` — e.g., `total=100` → `Math.round(89.5) = 90` |
| 2 | **Zero amounts** (product with `amount=0`) | `0 * anyPrice = 0`, `Math.round(0) = 0` — no issue |
| 3 | **Large numbers** (e.g., `1342305.098`) | `Math.round(1342305.098) = 1342305` — large numbers round correctly |
| 4 | **Single-item rounding** | Each line item's `salePrice` display is independently rounded. The `totals.subtotal` rounds the *sum*, not the sum of rounded values (i.e., round after `reduce`, not per-product). |
| 5 | **Discount = 0** | `totalWithDiscount = total` (both already integers) — no rounding needed, but `Math.round` on an integer is a no-op |
| 6 | **Discount = 100** | `totalWithDiscount = Math.round(total * 0) = 0` |
| 7 | **Empty cart** | `total = 0`, `totalWithDiscount = 0` — `Math.round(0) = 0` |
| 8 | **Negative values** | Not possible via the UI (amounts are positive). If a negative price somehow exists, `Math.round(-1.5) = -1` (rounds toward +∞). This is acceptable — the UI prevents negative prices. |
| 9 | **Floating point precision artifacts** | e.g., `0.1 + 0.2 = 0.30000000000000004`. `Math.round(0.30000000000000004) = 0`. This is correct — the sum is effectively 0.3 which rounds to 0. |
| 10 | **`updateProductAmount` flow** (removeItem + addItem) | Both actions round independently. The result is always consistent because both recalculate from scratch via `reduce()`. |

---

## Test Plan

### Test File: `src/__tests__/context/BillReducer.test.ts`

#### Updates to existing tests

| Test | Change |
|------|--------|
| "should handle floating point prices correctly" (line 607) | Change expected `total` from `31.5` to `Math.round(31.5)` = **32**, `totalWithDiscount` from `28.35` to `Math.round(28.35)` = **28** |

#### New rounding tests to add

| # | Test Name | Description | Covers AC |
|---|-----------|-------------|-----------|
| 1 | `should round 1849.3 down to 1849` | Add product with `salePrice: 1849.3, amount: 1` → expect `total: 1849` | AC-01, AC-08 |
| 2 | `should round 1849.5 up to 1850` | Add product with `salePrice: 1849.5, amount: 1` → expect `total: 1850` | AC-01, AC-08 |
| 3 | `should round 1849.7 up to 1850` | Add product with `salePrice: 1849.7, amount: 1` → expect `total: 1850` | AC-01, AC-08 |
| 4 | `should round 0.5 up to 1` | Add product with `salePrice: 0.5, amount: 1` → expect `total: 1` | AC-01, AC-08 |
| 5 | `should round 0.4 down to 0` | Add product with `salePrice: 0.4, amount: 1` → expect `total: 0` | AC-01, AC-08 |
| 6 | `should round totalWithDiscount with decimal discount` | Set `discount: 10.5`, add product with `salePrice: 100, amount: 1` → `total: 100`, `totalWithDiscount: Math.round(89.5) = 90` | AC-02 |
| 7 | `should round after reduce, not per-product` | Add 2 products: `{salePrice: 1.3, amount: 1}` + `{salePrice: 2.7, amount: 1}` → `total = Math.round(1.3 + 2.7) = Math.round(4.0) = 4`. Verify this, NOT `Math.round(1.3) + Math.round(2.7) = 1 + 3 = 4` (same result in this case, but the implementation must round after reduce). | AC-01, implementation correctness |
| 8 | `should ensure Number.isInteger(total) after complex sequence` | Run a sequence of ~10 operations with mixed decimals, verify `Number.isInteger(state.total)` at each step | AC-01 |

---

## Dependencies

No new dependencies required.
