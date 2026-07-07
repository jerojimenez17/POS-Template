# SPEC.md — Fix Account Ledger Payment Rounding

## Feature Name
`fix-ledger-payment-rounding`

## Goal
Fix the account ledger payment flow so users can complete payments on orders whose `total` values contain decimal fractions (legacy data from the `BillReducer` bug). After this feature, all rounding is handled in the payment registration server action, the display page, and the payment form so that:
- `registerPayment` correctly marks orders as `"pago"` when the rounded remaining balance is `≤ 0`.
- Displayed values (`remainingBalance`, `order.total`, `cashMovement.total`) always show integers.
- The payment form defaults to an integer amount.

---

## Background

A previous bug in `BillReducer` caused `Order.total` values in the database to store decimal numbers (e.g., `1342305.098` instead of `1342305`). This creates three problems in the account ledger payment flow:

1. **Display shows decimals** — The detail page computes `remainingBalance` as `order.total - totalPaid`, producing values like `$1,342,305.098`.
2. **Payment form shows decimals** — `AddPaymentForm` defaults the amount input to the raw `remainingBalance.toString()`, showing `1342305.098`.
3. **registerPayment can't mark as paid** — The paid status check `remainingBalance <= 0` fails because a user paying a round number (e.g., `1342305`) leaves a remaining balance of `0.098 > 0`, so the order stays `"inpago"` forever.

The fix applies `Math.round()` at three strategic points: the server action's paid-status check, the display page's computed values, and the form's default amount. Importantly, **the stored `cashMovement.total` data is not rounded** — rounding only affects the status determination and display.

---

## Detailed Changes

### 1. `src/actions/unpaid-orders.ts` — `registerPayment` function (lines 228–291)

#### 1a. Round the remaining balance check for paid status determination (lines 245, 247, 267–268)

Round `order.total`, `totalPaidBefore`, and `input.amount` to integers before performing the paid status comparison. The `input.amount` stored in `cashMovement.create` remains unrounded.

**Current code (lines 245, 247, 267–268):**
```typescript
const remainingBalance = order.total - (totalPaidBefore + input.amount);

if (input.amount > order.total - totalPaidBefore) {
  throw new Error("El pago no puede exceder el saldo remaining");
}

// ...
const newPaidStatus: PaidStatus =
  remainingBalance <= 0 ? "pago" : "inpago";
```

**Replace with:**
```typescript
// Round all values to integers to handle legacy decimal data
const roundedTotal = Math.round(order.total);
const roundedPaidBefore = Math.round(totalPaidBefore);
const roundedInput = Math.round(input.amount);

// Use rounded values for validation
if (roundedInput > roundedTotal - roundedPaidBefore) {
  throw new Error("El pago no puede exceder el saldo pendiente");
}

// remainingBalance is now an integer
const remainingBalance = roundedTotal - (roundedPaidBefore + roundedInput);
const newPaidStatus: PaidStatus = remainingBalance <= 0 ? "pago" : "inpago";
```

**Important:** The `if (input.amount > order.total - totalPaidBefore)` check on line 247 must also be rounded to be consistent. Otherwise a user could still get the "exceeds" error on a valid input due to decimal precision mismatches.

#### 1b. No changes to `cashMovement.create` data

The `input.amount` stored on line 252 remains as-is (no rounding applied). Only the validation and status-determination logic receives rounded values.

---

### 2. `src/app/(protected)/account-ledger/[id]/page.tsx` — Display page

#### 2a. Round `remainingBalance` computation (line 101)

**Current:**
```typescript
const remainingBalance = order.total - totalPaid;
```

**Replace with:**
```typescript
const remainingBalance = Math.round(order.total) - Math.round(totalPaid);
```

*Note: Using `Math.round(order.total - totalPaid)` would also work, but rounding each term individually is more robust against floating-point artifacts and consistent with the registerPayment approach.*

#### 2b. Round `order.total` display (line 281)

**Current:**
```typescript
<span className="font-medium">${order.total.toLocaleString("es-AR")}</span>
```

**Replace with:**
```typescript
<span className="font-medium">${Math.round(order.total).toLocaleString("es-AR")}</span>
```

#### 2c. Round `totalPaid` display (line 286)

**Current:**
```typescript
-${totalPaid.toLocaleString("es-AR")}
```

**Replace with:**
```typescript
-${Math.round(totalPaid).toLocaleString("es-AR")}
```

#### 2d. Round each `payment.total` in payment history (line 258)

**Current:**
```typescript
+${payment.total.toLocaleString("es-AR")}
```

**Replace with:**
```typescript
+${Math.round(payment.total).toLocaleString("es-AR")}
```

---

### 3. `src/app/(protected)/account-ledger/[id]/AddPaymentForm.tsx` — Payment form

#### 3a. Round default amount (line 33)

**Current:**
```typescript
const [amount, setAmount] = useState(remainingBalance.toString());
```

**Replace with:**
```typescript
const [amount, setAmount] = useState(Math.round(remainingBalance).toString());
```

*Note: `remainingBalance` is already rounded in `page.tsx` before being passed as a prop, but adding `Math.round()` in the form provides defense-in-depth in case the component is reused elsewhere or receives an unrounded value.*

#### 3b. Round the `max` attribute on the input (line 100)

**Current:**
```typescript
max={remainingBalance}
```

**Replace with:**
```typescript
max={Math.round(remainingBalance)}
```

---

### 4. Test files — Update expectations for rounding

#### 4a. `src/__tests__/unpaid-orders/register-payment.test.ts`

No changes needed to existing test expectations. The existing tests use integer totals (`100`) and integer payment amounts (`20`, `25`, `50`, `100`), so `Math.round()` is a no-op and the tests continue to pass as-is.

However, **add a new test case** covering the decimal scenario:

| # | Test Name | Description | Covers AC |
|---|-----------|-------------|-----------|
| 1 | `debe marcar como pago cuando el total tiene decimales y el pago redondeado cubre el saldo` | Order with `total: 1342305.098`, existing payments sum to `0`, payment `amount: 1342305` → after rounding, remaining = `Math.round(1342305.098) - Math.round(0) - Math.round(1342305)` = `1342305 - 0 - 1342305` = `0` → paidStatus should be `"pago"` | AC-01 |
| 2 | `debe mantener inpago cuando el pago no cubre el total redondeado` | Order with `total: 100.5`, existing payments sum to `0`, payment `amount: 100` → after rounding, remaining = `Math.round(100.5) - 0 - Math.round(100)` = `101 - 100` = `1` > `0` → paidStatus should be `"inpago"` | AC-02 |
| 3 | `debe validar que el pago no exceda el saldo pendiente redondeado` | Order with `total: 100.3`, existing payments sum to `0`, payment `amount: 101` → `Math.round(101) > Math.round(100.3) - 0` → `101 > 100` → should throw error | AC-03 |

#### 4b. `tests/unpaid-orders.test.ts`

No changes needed to existing tests. All existing inputs use integer values, so `Math.round()` is a no-op.

---

## Files to Modify

| Action | File | Description |
|--------|------|-------------|
| **MODIFY** | `src/actions/unpaid-orders.ts` | Round values in `registerPayment` for paid-status check and validation (lines 245, 247, 267–268) |
| **MODIFY** | `src/app/(protected)/account-ledger/[id]/page.tsx` | Round `remainingBalance`, `order.total`, `totalPaid`, and `payment.total` for display (lines 101, 258, 281, 286) |
| **MODIFY** | `src/app/(protected)/account-ledger/[id]/AddPaymentForm.tsx` | Round default amount and `max` attribute (lines 33, 100) |
| **MODIFY** | `src/__tests__/unpaid-orders/register-payment.test.ts` | Add 3 new test cases for decimal rounding scenarios |

---

## Acceptance Criteria

### AC-01: `registerPayment` marks order as `"pago"` when rounded remaining balance ≤ 0
- **Given** an order with `total: 1342305.098` and no previous payments
- **When** a payment of `amount: 1342305` is submitted
- **Then** the order's `paidStatus` is updated to `"pago"`
- **Verification:** Unit test with decimal total → expect `orderUpdateSpy` called with `data: { paidStatus: "pago" }`

### AC-02: `registerPayment` keeps order as `"inpago"` when rounded remaining balance > 0
- **Given** an order with `total: 100.5` and no previous payments
- **When** a payment of `amount: 100` is submitted
- **Then** the order's `paidStatus` remains `"inpago"` because `Math.round(100.5) - Math.round(100) = 101 - 100 = 1`
- **Verification:** Unit test → expect `orderUpdateSpy` called with `data: { paidStatus: "inpago" }`

### AC-03: `registerPayment` uses `Math.round()` for validation check
- **Given** an order with `total: 100.3` and no previous payments
- **When** a payment of `amount: 101` is submitted (which exceeds the rounded total of 100)
- **Then** the action throws an error `"El pago no puede exceder el saldo pendiente"`
- **Verification:** Unit test → expect `result.success === false` with appropriate error message

### AC-04: Display page shows `remainingBalance` as rounded integer
- **Given** an order with `total: 1342305.098` and `totalPaid: 0`
- **When** the detail page renders
- **Then** the displayed "Saldo Pendiente" is `$1,342,305` (not `$1,342,305.098`)
- **Verification:** Code inspection confirms `Math.round()` on the `remainingBalance` computation

### AC-05: Display page shows `order.total` as rounded integer
- **Given** an order with `total: 1342305.098`
- **When** the detail page renders the "Total Orden" line
- **Then** the displayed value is `$1,342,305` (not `$1,342,305.098`)
- **Verification:** Code inspection confirms `Math.round(order.total)` on line 281

### AC-06: `AddPaymentForm` defaults to rounded remaining balance
- **Given** `remainingBalance = 1342305.098`
- **When** the payment form opens
- **Then** the amount input defaults to `1342305`
- **Verification:** Code inspection confirms `Math.round(remainingBalance).toString()` on line 33

### AC-07: All existing tests pass
- **Given** the existing test suites in `src/__tests__/unpaid-orders/register-payment.test.ts` and `tests/unpaid-orders.test.ts`
- **When** `npm run test` is executed
- **Then** all existing tests pass with no changes to their expectations (existing tests use integer values, so `Math.round()` is a no-op)

---

## Edge Cases

| # | Case | Expected Behavior |
|---|------|-------------------|
| 1 | **Order total is already an integer** (e.g., `100`) | `Math.round(100) = 100` — no-op. Existing behavior preserved. |
| 2 | **Order total is 0** | `Math.round(0) = 0` — payment validation correctly prevents paying 0 or negative amounts. |
| 3 | **Multiple cash movements with decimal totals** | Each `cashMovement.total` may contain decimals (from legacy data). `totalPaidBefore` is the sum of these, then rounded with `Math.round()`. |
| 4 | **Full payment with exact integer amount** (e.g., total = `100`, paid = `100`) | Existing behavior preserved — `remaining = 0 → "pago"`. |
| 5 | **Overpayment** | The validation `roundedInput > roundedTotal - roundedPaidBefore` prevents paying more than the remaining balance. |
| 6 | **Very small remaining balance** (e.g., `total: 0.4`, no previous payments) | `Math.round(0.4) = 0`. Payment of any positive amount yields `remaining = 0 - amount < 0` → marked as `"pago"`. This is acceptable — the amount is < $1. |
| 7 | **Negative amounts** | Not possible via the UI. `Math.round(-1.5) = -1` but the UI prevents negative input. |
| 8 | **Very large totals** (e.g., `total: 999999999.999`) | `Math.round()` handles large numbers correctly within JavaScript's safe integer range (`Number.MAX_SAFE_INTEGER = 9,007,199,254,740,991`). All realistic totals are well within this range. |

---

## Dependencies

No new dependencies required. Only uses `Math.round()` — a standard JavaScript built-in.

---

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Data stored in `cashMovement.total` remains unrounded | Minimal — users see rounded values on screen; the raw decimal is stored in the database for auditing | This is intentional. The rounding only affects the display and the paid-status determination. |
| Future code paths that compute remaining balance from raw DB values will still see decimals | Low — any new code that reads `order.total` directly should apply `Math.round()` for consistency | Team awareness: always round when comparing or displaying financial totals from legacy data. |
| `Math.round()` on very large numbers beyond safe integer range | Low — POS totals are far below `Number.MAX_SAFE_INTEGER` | Acceptable risk; no realistic scenario reaches this limit. |
