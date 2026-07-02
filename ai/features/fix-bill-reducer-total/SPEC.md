# SPEC.md — Fix BillReducer Total Calculation Bugs

## Feature Name
`fix-bill-reducer-total`

## Goal
Fix four bugs in `BillReducer.ts` that cause `BillState.total` and `BillState.totalWithDiscount` to become incorrect after add/remove/change operations. The symptom is a mismatch between the total displayed in the `PrintableTable` table (recalculated via `products.reduce()`) and the total shown in the "A cuenta" `ClientSelectionModal` (read from `BillState.total` / `BillState.totalWithDiscount`).

---

## Bug Description

### Bug 1: `removeItem` action (line 95-101) does NOT update `total` or `totalWithDiscount`

```typescript
case "removeItem":
  return {
    ...state,
    products: state.products.filter(
      (product: Product) => product.id !== action.payload.id
    ),
  };
```

When a product is removed from the `products` array, the reducer returns `...state` with the product filtered out, but `total` and `totalWithDiscount` remain at their old (inflated) values.

**Most severe trigger**: `updateProductAmount()` in `PrintableTable.tsx` (line 191-198) does this:
```typescript
const updateProductAmount = (productId: string, newAmount: number) => {
  const product = state.products.find((p) => p.id === productId);
  if (!product) return;
  const updatedProduct = { ...product, amount: newAmount };
  removeItem(product);    // ← total NOT decremented (Bug 1)
  addItem(updatedProduct); // ← total incremented by new amount
};
```

Every time a user changes a product's quantity, the old product is removed (total unchanged) and the new product is added (total increases by the new amount). The total **cumulates** with each quantity change instead of staying accurate.

### Bug 2: `changeUnit` action (line 131-141) does NOT update `total` or `totalWithDiscount`

```typescript
case "changeUnit":
  return {
    ...state,
    products: state.products.map(({ ...product }) => {
      if (product.id === action.payload.id) {
        product.amount = action.payload.amount;
      }
      return product;
    }),
  };
```

When a product's `amount` is changed directly, `total` and `totalWithDiscount` remain at their old values, diverging from the actual sum of `salePrice * amount`.

### Bug 3: `totalWithDiscount` formula in `addItem` and `addUnit` is incorrect

Current code in both `addItem` and `addUnit`:
```typescript
state.totalWithDiscount +
  action.payload.salePrice * action.payload.amount * state.discount
```

- If `state.discount = 10` (meaning 10%), this adds `price * qty * 10` instead of `price * qty * 0.9`
- The discount fraction is multiplied instead of the discounted remainder
- The correct formula should be `salePrice * amount * (1 - discount / 100)`

### Bug 4: `removeUnit` action (line 84-93) does NOT update `total` or `totalWithDiscount`

```typescript
case "removeUnit":
  return {
    ...state,
    products: state.products.map(({ ...product }) => {
      if (product.id === action.payload.id && product.amount > 1) {
        product.amount = product.amount - 1;
      }
      return product;
    }),
  };
```

When a unit is decremented, `total` and `totalWithDiscount` stay the same. The total should decrease by `salePrice` (and adjusted by discount for `totalWithDiscount`).

---

## Technical Analysis: How Bugs Cause the Symptom

The `PrintableTable` component (line 205-208) calculates its displayed total by reducing over `state.products`:

```typescript
const totals = useMemo(() => {
  const subtotal = state.products.reduce((sum, p) => sum + p.salePrice * p.amount, 0);
  const discountAmount = state.discount > 0 ? subtotal * (state.discount / 100) : 0;
  const total = state.totalWithDiscount || subtotal * (1 - state.discount / 100);
  return { subtotal, discountAmount, total };
}, [state.products, state.discount, state.totalWithDiscount]);
```

This recalculates the total **from scratch** using `state.products` — so it always shows the correct sum.

However, the `ClientSelectionModal` reads `BillState.total` directly (the stale/incorrect accumulated value). Because `removeItem`, `removeUnit`, and `changeUnit` never update `BillState.total`, the value diverges from the true sum.

With Bug 1 + Bug 3, the divergence is amplified: every `updateProductAmount` call triggers `removeItem` (total unchanged) + `addItem` (total increased by entire new amount), causing the total to **double** or become wildly inflated after repeated quantity changes.

**User-visible symptom**: Table shows `510069.86` (correct, from `products.reduce()`), but the ClientSelectionModal shows `1342305.098` (incorrect, from stale `BillState.total`).

---

## Solution Design

### Strategy: Recalculate Totals from Scratch

For all mutating actions (`removeItem`, `removeUnit`, `changeUnit`, `addUnit`), recalculate `total` and `totalWithDiscount` using `products.reduce()` on the new products array instead of incremental arithmetic. This guarantees totals are always derived from the actual products in state, eliminating any accumulation/divergence bugs.

For `addItem` and `addUnit`, the incremental approach is acceptable **if and only if** the formula is correct — but to be consistent and defensive, these should also use a reduce-based recalculation. This completely eliminates the class of bugs where incremental updates go out of sync.

### Detailed Changes

#### 1. Fix `removeItem` (line 95-101)

Recalculate totals from the filtered products array:

```typescript
case "removeItem": {
  const updatedProducts = state.products.filter(
    (product) => product.id !== action.payload.id
  );
  const newTotal = updatedProducts.reduce(
    (acc, cur) => acc + cur.salePrice * cur.amount, 0
  );
  const newTotalWithDiscount = state.discount > 0
    ? newTotal * (1 - state.discount / 100)
    : newTotal;
  return {
    ...state,
    products: updatedProducts,
    total: newTotal,
    totalWithDiscount: newTotalWithDiscount,
  };
}
```

#### 2. Fix `changeUnit` (line 131-141)

Recalculate totals after updating the amount:

```typescript
case "changeUnit": {
  const updatedProducts = state.products.map((product) => {
    if (product.id === action.payload.id) {
      return { ...product, amount: action.payload.amount };
    }
    return product;
  });
  const newTotal = updatedProducts.reduce(
    (acc, cur) => acc + cur.salePrice * cur.amount, 0
  );
  const newTotalWithDiscount = state.discount > 0
    ? newTotal * (1 - state.discount / 100)
    : newTotal;
  return {
    ...state,
    products: updatedProducts,
    total: newTotal,
    totalWithDiscount: newTotalWithDiscount,
  };
}
```

#### 3. Fix `removeUnit` (line 84-93)

Recalculate totals after decrementing (with minimum of 1):

```typescript
case "removeUnit": {
  const updatedProducts = state.products.map((product) => {
    if (product.id === action.payload.id && product.amount > 1) {
      return { ...product, amount: product.amount - 1 };
    }
    return product;
  });
  const newTotal = updatedProducts.reduce(
    (acc, cur) => acc + cur.salePrice * cur.amount, 0
  );
  const newTotalWithDiscount = state.discount > 0
    ? newTotal * (1 - state.discount / 100)
    : newTotal;
  return {
    ...state,
    products: updatedProducts,
    total: newTotal,
    totalWithDiscount: newTotalWithDiscount,
  };
}
```

#### 4. Fix `addItem` (line 35-69)

Recalculate totals instead of incremental math. This also fixes the incorrect `totalWithDiscount` formula:

```typescript
case "addItem": {
  const isPresent = state.products.find(
    (product) => product.id === action.payload.id
  );
  let updatedProducts;
  if (isPresent) {
    updatedProducts = state.products.map((product) => {
      if (product.id === action.payload.id) {
        return { ...product, amount: product.amount + action.payload.amount };
      }
      return product;
    });
  } else {
    updatedProducts = state.products.concat({ ...action.payload });
  }
  const newTotal = updatedProducts.reduce(
    (acc, cur) => acc + cur.salePrice * cur.amount, 0
  );
  const newTotalWithDiscount = state.discount > 0
    ? newTotal * (1 - state.discount / 100)
    : newTotal;
  return {
    ...state,
    products: updatedProducts,
    total: newTotal,
    totalWithDiscount: newTotalWithDiscount,
  };
}
```

#### 5. Fix `addUnit` (line 70-83)

Same approach — recalculate from scratch:

```typescript
case "addUnit": {
  const updatedProducts = state.products.map((product) => {
    if (product.id === action.payload.id) {
      return { ...product, amount: product.amount + 1 };
    }
    return product;
  });
  const newTotal = updatedProducts.reduce(
    (acc, cur) => acc + cur.salePrice * cur.amount, 0
  );
  const newTotalWithDiscount = state.discount > 0
    ? newTotal * (1 - state.discount / 100)
    : newTotal;
  return {
    ...state,
    products: updatedProducts,
    total: newTotal,
    totalWithDiscount: newTotalWithDiscount,
  };
}
```

#### 6. Fix `total` action (line 142-149) — Already correct

The existing "total" action already uses `products.reduce()`. No change needed.

#### 7. Fix `discount` action (line 150-165) — Already correct

The existing "discount" action recalculates correctly. No change needed.

---

## Data Models / Interfaces

No changes to existing models are required. The following interfaces remain unchanged:
- `BillState` at `@/models/BillState.ts`
- `Product` at `@/models/Product.ts`
- `BillAction` at `@/context/billActions.ts`

---

## File Structure

| Action | File | Description |
|--------|------|-------------|
| **MODIFY** | `src/context/BillReducer.ts` | Fix all 4 bugs in the reducer |
| **CREATE** | `src/__tests__/context/BillReducer.test.ts` | New test file for the reducer |

---

## Acceptance Criteria

### AC-01: `removeItem` correctly updates totals
- **Given** a `BillState` with products `[{id:"p1", salePrice:100, amount:2}, {id:"p2", salePrice:50, amount:3}]` (total = 350, totalWithDiscount = 350)
- **When** `removeItem({id:"p1"})` is dispatched
- **Then** `state.products` has only `p2`, `state.total` = 150, `state.totalWithDiscount` = 150

### AC-02: `changeUnit` correctly recalculates totals
- **Given** a `BillState` with product `{id:"p1", salePrice:100, amount:2}` (total = 200)
- **When** `changeUnit({id:"p1", salePrice:100, amount:5})` is dispatched
- **Then** `state.total` = 500, `state.totalWithDiscount` = 500

### AC-03: `removeUnit` correctly recalculates totals
- **Given** a `BillState` with product `{id:"p1", salePrice:100, amount:3}` (total = 300)
- **When** `removeUnit({id:"p1"})` is dispatched
- **Then** `state.total` = 200 (one unit at $100 removed)
- **When** `removeUnit({id:"p1"})` is dispatched again
- **Then** `state.total` = 100
- **When** `removeUnit({id:"p1"})` is dispatched again (amount would go to 0)
- **Then** `state.total` = 100 (amount stays at minimum 1, no change)

### AC-04: `addItem` with discount correctly calculates `totalWithDiscount`
- **Given** a `BillState` with `discount = 10` and no products
- **When** `addItem({id:"p1", salePrice:200, amount:3})` is dispatched
- **Then** `state.total` = 600, `state.totalWithDiscount` = 540 (600 * 0.9)

### AC-05: `addUnit` with discount correctly calculates `totalWithDiscount`
- **Given** a `BillState` with `discount = 10` and product `{id:"p1", salePrice:100, amount:2}` (total=200, totalWithDiscount=180)
- **When** `addUnit({id:"p1", salePrice:100, amount:2})` is dispatched
- **Then** `state.total` = 300, `state.totalWithDiscount` = 270

### AC-06: After any sequence of operations, `state.total` equals the sum of `product.salePrice * product.amount`
- **Given** a sequence of operations (addItem, addUnit, removeUnit, removeItem, changeUnit, discount changes)
- **Then** at every step, `state.total` === `state.products.reduce((sum, p) => sum + p.salePrice * p.amount, 0)`
- **Test scenarios**:
  1. Add product A (2 units at $100) → add product B (3 units at $50) → remove product A → total should be 150
  2. Add product A (2 units at $100) → changeUnit to 5 → total should be 500
  3. Add product A (2 units at $100) → removeUnit → addUnit → removeItem → addItem → total always consistent
  4. Add product A (2 units at $100) → set discount 10 → addUnit → removeUnit → totalWithDiscount always equals total * (1 - discount/100)

### AC-07: After any sequence of operations with a discount set, `state.totalWithDiscount` equals `state.total * (1 - discount/100)`
- **Given** a `discount` value D (0 ≤ D ≤ 100)
- **After** any sequence of mutations
- **Then** `state.totalWithDiscount` === `state.total * (1 - state.discount / 100)` (within floating point tolerance)

### AC-08: All existing tests continue to pass
- **Given** the current test suite
- **When** `npm run test` (or equivalent) is executed after changes
- **Then** all existing tests still pass (no regressions)

### AC-09: `updateProductAmount` (removeItem + addItem) works correctly
- **Given** a product with id="p1", salePrice=100, amount=2 in the cart (total=200)
- **When** `updateProductAmount("p1", 5)` is called (dispatches removeItem then addItem)
- **Then** `state.total` = 500 (5 * 100), not inflated (e.g., not 200 + 500 = 700)

---

## Test Plan

### Test File: `src/__tests__/context/BillReducer.test.ts`

All tests should be unit tests against the `BillReducer` function directly:

```typescript
import { BillReducer } from "@/context/BillReducer";
import BillState from "@/models/BillState";
import Product from "@/models/Product";
```

| # | Test | Covers AC |
|---|------|-----------|
| 1 | `removeItem` removes product and decrements total | AC-01 |
| 2 | `removeItem` on single product results in total=0 | AC-08 |
| 3 | `changeUnit` changes amount and recalculates total | AC-02 |
| 4 | `removeUnit` decrements amount and total | AC-03 |
| 5 | `removeUnit` does not go below 1 and keeps total unchanged if amount=1 | AC-03 |
| 6 | `addItem` new product calculates correct total | implicit |
| 7 | `addItem` existing product increments amount and total | implicit |
| 8 | `addItem` with discount calculates `totalWithDiscount` correctly | AC-04 |
| 9 | `addUnit` increments amount and total | implicit |
| 10 | `addUnit` with discount calculates `totalWithDiscount` correctly | AC-05 |
| 11 | Sequence: add A, add B, remove A → total matches reduce | AC-06 |
| 12 | Sequence: add A, changeUnit A, removeUnit A → total always consistent | AC-06 |
| 13 | Sequence: add, set discount, addUnit, removeUnit → totalWithDiscount consistent with formula | AC-07 |
| 14 | `updateProductAmount` flow (removeItem + addItem) doesn't inflate total | AC-09 |
| 15 | `discount` action still works correctly after reducer changes | AC-07 |
| 16 | `total` action still works correctly after reducer changes | AC-06 |
| 17 | `removeAll` resets everything correctly | regression |

---

## Edge Cases

1. **Empty cart**: Removing the last product via `removeItem` should set total to 0.
2. **`removeUnit` at amount=1**: Should not decrement below 1 (existing behavior preserved).
3. **Discount = 0**: `totalWithDiscount` should equal `total` (not multiplied by zero).
4. **Discount = 100**: `totalWithDiscount` should be 0.
5. **Floating point precision**: Use `expect(result.total).toBeCloseTo(expected, 2)` for decimal comparisons.
6. **Rapid `updateProductAmount` calls**: `removeItem` + `addItem` in sequence from the same synchronous handler — the reducer handles each dispatch sequentially, so the second dispatch sees the state from the first. Since both actions recalculate from scratch, there is no race condition within React's synchronous dispatch.
7. **Multiple products with same `salePrice`**: Each product has a unique `id` (Product class defaults `id = ""`, but in practice IDs are unique identifiers). The reducer must handle products with the same price correctly since it identifies by `id`.
8. **Zero `salePrice`**: Products with `salePrice = 0` contribute nothing to totals (corner case, but should not break anything).
9. **`changeUnit` with amount = 0 or negative**: Not validated in the reducer (handled at UI level). The reducer just sets the amount as given. If amount becomes 0 or negative, total could become incorrect. This is acceptable — the UI should prevent this.

---

## Dependencies

No new dependencies required.
