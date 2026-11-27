# TEST_CHECKLIST.md — Fix Account Ledger Payment Rounding

## Acceptance Criteria

| ID | Description | Verification | Status |
|----|-------------|-------------|--------|
| AC-01 | `registerPayment` marks order as `"pago"` when rounded remaining balance ≤ 0 | Unit test: `debe marcar como pago cuando el pago cubre el total redondeado aunque haya decimales residuales` | ❌ FAILS (will pass after fix) |
| AC-02 | `registerPayment` keeps order as `"inpago"` when rounded remaining balance > 0 | Unit test: `debe mantener la orden como 'inpago' cuando el balance remaining es mayor a 0` (existing test, passes with integer values) | ✅ PASSES |
| AC-03 | `registerPayment` uses `Math.round()` for excess validation check | Unit test: `debe permitir pago cuando el monto redondeado no excede el saldo pendiente redondeado` | ❌ FAILS (will pass after fix) |
| AC-04 | Display page shows `remainingBalance` as rounded integer | Code inspection: `Math.round()` applied to `remainingBalance` computation in `page.tsx` | ⏳ PENDING |
| AC-05 | Display page shows `order.total` as rounded integer | Code inspection: `Math.round(order.total)` on display line | ⏳ PENDING |
| AC-06 | `AddPaymentForm` defaults to rounded remaining balance | Code inspection: `Math.round(remainingBalance).toString()` in form | ⏳ PENDING |
| AC-07 | All existing tests pass after changes | `npm run test` — existing tests continue to pass | ✅ PASSES (4 of 4) |

## Test Cases

### File: `src/__tests__/unpaid-orders/register-payment.test.ts`

#### Existing Tests (must continue to pass)

| # | Test Name | Expected | Status |
|---|-----------|----------|--------|
| E1 | `debe marcar la orden como 'pago' cuando el balance remaining es 0 después del pago (con pagos anteriores)` | `success: true`, `paidStatus: "pago"` | ✅ PASSES |
| E2 | `debe marcar la orden como 'pago' cuando el pago actual cubre el total sin pagos anteriores` | `success: true`, `paidStatus: "pago"` | ✅ PASSES |
| E3 | `debe mantener la orden como 'inpago' cuando el balance remaining es mayor a 0` | `success: true`, `paidStatus: "inpago"` | ✅ PASSES |
| E4 | `debe incluir todos los cashMovements existentes en el cálculo del balance remaining` | `success: true`, `paidStatus: "pago"` | ✅ PASSES |

#### New Tests (fail now, pass after fix)

| # | Test Name | Input | Expected | Current Status | After Fix |
|---|-----------|-------|----------|---------------|-----------|
| N1 | `debe marcar como pago cuando el pago cubre el total redondeado aunque haya decimales residuales` | `total: 1342305.098`, `cashMovements: []`, `amount: 1342305` | `paidStatus: "pago"` (remaining = `Math.round(1342305.098) - (0 + Math.round(1342305)) = 0`) | ❌ `"inpago"` (raw remaining `0.098 > 0`) | ✅ `"pago"` |
| N2 | `debe marcar como pago cuando los pagos acumulados con decimales cubren el total redondeado` | `total: 100.4`, `cashMovements: [{total: 50.2}]`, `amount: 50` | `paidStatus: "pago"` (remaining = `Math.round(100.4) - (Math.round(50.2) + Math.round(50)) = 0`) | ❌ `"inpago"` (raw remaining `0.2 > 0`) | ✅ `"pago"` |
| N3 | `debe permitir pago cuando el monto redondeado no excede el saldo pendiente redondeado` | `total: 1500.6`, `cashMovements: []`, `amount: 1501` | `success: true`, `paidStatus: "pago"` (`1501 ≤ Math.round(1500.6) - 0 = 1501`) | ❌ throws "El pago no puede exceder el saldo remaining" (raw `1501 > 1500.6`) | ✅ `success: true` |

## Edge Cases

| # | Case | Expected Behavior | Test Coverage |
|---|------|-------------------|---------------|
| 1 | Order total is already an integer (e.g., `100`) | `Math.round(100) = 100` — no-op | E1, E2, E3, E4 |
| 2 | Order total is 0 | `Math.round(0) = 0` — validation prevents paying 0 or negative | Not covered (separate validation) |
| 3 | Multiple cash movements with decimal totals | Each `cashMovement.total` summed, then rounded via `Math.round()` | N2 |
| 4 | Full payment with exact integer amount | `remaining = 0 → "pago"` | E2 |
| 5 | Overpayment prevented | Validation `roundedInput > roundedTotal - roundedPaidBefore` throws error | N3 (opposite: allowed after fix), existing excess tests |
| 6 | Very small remaining balance (e.g., `total: 0.4`) | `Math.round(0.4) = 0`, any payment yields `remaining ≤ 0 → "pago"` | Not covered (edge case, < $1) |
| 7 | Negative amounts | Not possible via UI | Not covered |
| 8 | Very large totals (e.g., `999999999.999`) | `Math.round()` works within safe integer range | N1 (1342305.098) |

## Implementation Checklist

### Server Action — `src/actions/unpaid-orders.ts`

- [ ] Round `order.total` with `Math.round()` before remaining balance calculation
- [ ] Round `totalPaidBefore` with `Math.round()` before remaining balance calculation
- [ ] Round `input.amount` with `Math.round()` before remaining balance calculation
- [ ] Round all three values in the excess validation check (`if (input.amount > order.total - totalPaidBefore)`)
- [ ] Update error message from `"saldo remaining"` to `"saldo pendiente"`

### Display Page — `src/app/(protected)/account-ledger/[id]/page.tsx`

- [ ] Round `remainingBalance` computation (line ~101): `Math.round(order.total) - Math.round(totalPaid)`
- [ ] Round `order.total` display (line ~281): `Math.round(order.total).toLocaleString()`
- [ ] Round `totalPaid` display (line ~286): `Math.round(totalPaid).toLocaleString()`
- [ ] Round each `payment.total` in payment history (line ~258): `Math.round(payment.total).toLocaleString()`

### Payment Form — `src/app/(protected)/account-ledger/[id]/AddPaymentForm.tsx`

- [ ] Round default amount (line ~33): `Math.round(remainingBalance).toString()`
- [ ] Round `max` attribute (line ~100): `Math.round(remainingBalance)`

### Tests — `src/__tests__/unpaid-orders/register-payment.test.ts`

- [x] Add `revalidateTag: vi.fn()` to `next/cache` mock (fix pre-existing mock issue)
- [x] Add test N1: decimal total, single payment covering rounded total → `"pago"`
- [x] Add test N2: decimal total with decimal previous payments, covering rounded total → `"pago"`
- [x] Add test N3: amount that only passes rounded excess check → `success: true`
