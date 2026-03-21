# TEST_CHECKLIST.md - Cuenta Corriente (Unpaid Orders)

## Acceptance Criteria Verification

| ID | Criterion | Status |
|----|-----------|--------|
| AC1 | "A cuenta" creates unpaid order with paidStatus:inpago | [ ] |
| AC2 | Client balance updates on create (increases by total) | [ ] |
| AC3 | Stock deducted on create (StockMovement SALE created) | [ ] |
| AC4 | Partial payment creates CashMovement with correct amount/method | [ ] |
| AC5 | Client balance updates on payment (decreases by amount) | [ ] |
| AC6 | Order status changes to pago when fully paid | [ ] |
| AC7 | Cancel reverses stock (StockMovement RETURN created) | [ ] |
| AC8 | Cancel updates client balance (decreases by order total) | [ ] |
| AC9 | List shows unpaid orders with correct filters | [ ] |
| AC10 | Detail shows payments history (CashMovement) | [ ] |

---

## Error Handling Tests

| ID | Scenario | Expected Error | Status |
|----|----------|----------------|--------|
| EH1 | Insufficient stock | "Stock insuficiente para el producto..." | [ ] |
| EH2 | Client not found | "Cliente no encontrado" | [ ] |
| EH3 | Payment exceeds remaining | "El pago no puede exceder el saldo restante..." | [ ] |
| EH4 | Unauthorized | "No autorizado" | [ ] |
| EH5 | Order not found | "Pedido no encontrado" | [ ] |
| EH6 | Cancel already paid order | "El pedido ya está pagado" | [ ] |

---

## Test Function Coverage

| Function | Description | Tests Written |
|----------|-------------|---------------|
| `createUnpaidOrder` | Creates unpaid order, deducts stock, updates client balance | AC1, AC2, AC3, EH1 |
| `registerPayment` | Registers partial/full payment, updates order status | AC4, AC5, AC6, EH3, EH5 |
| `cancelUnpaidOrder` | Cancels unpaid order, reverses stock, updates balance | AC7, AC8, EH6 |
| `getUnpaidOrders` | Lists unpaid orders with filters and payment history | AC9, AC10 |

---

# TEST_CHECKLIST.md - BillParametersForm Reset on Order Creation

## Feature Description

When a user creates an order (Factura or Remito), the `BillParametersForm` should automatically reset to its default values.

## Default Form Values

| Field | Default Value |
|-------|---------------|
| paidMethod | EFECTIVO (Efectivo) |
| clientCondition | CONSUMIDOR_FINAL (Consumidor Final) |
| discount | 0 |
| billType | Factura C |
| twoMethods | false |
| totalSecondMethod | 0 |

## Acceptance Criteria Verification

| ID | Criterion | Status |
|----|-----------|--------|
| FR1 | BillContext interface includes onOrderReset property | [ ] |
| FR2 | BillContext interface includes setOnOrderReset property | [ ] |
| FR3 | Default paidMethod is EFECTIVO | [x] |
| FR4 | Default clientCondition is CONSUMIDOR_FINAL | [x] |
| FR5 | Default discount is 0 | [x] |
| FR6 | Default billType is Factura C | [x] |
| FR7 | Default twoMethods is false | [x] |
| FR8 | Default totalSecondMethod is 0 | [x] |
| FR9 | Form resets after successful Factura creation | [ ] |
| FR10 | Form resets after successful Remito creation | [ ] |
| FR11 | editParameters state is false after reset | [ ] |
| FR12 | Form reset happens within 5-second timeout | [ ] |

## Context Interface Requirements

| ID | Requirement | Status |
|----|-------------|--------|
| CTX1 | BillContext exports BillContext context object | [x] |
| CTX2 | BillProvider provides setOnOrderReset handler | [ ] |
| CTX3 | BillParametersForm subscribes to onOrderReset callback | [ ] |
| CTX4 | BillButtons invokes onOrderReset after order creation | [ ] |

## Integration Tests

| ID | Test Scenario | Status |
|----|---------------|--------|
| INT1 | Form reset callback is called after order creation | [ ] |
| INT2 | Form reset uses correct default values | [x] |
| INT3 | setOnOrderReset is available in context | [ ] |

## Files to Modify for Implementation

| File | Required Changes |
|------|------------------|
| `src/context/BillContext.tsx` | Add `onOrderReset` and `setOnOrderReset` to interface |
| `src/context/BillProvider.tsx` | Implement callback state and handlers |
| `src/components/Billing/BillParametersForm.tsx` | Subscribe to callback, call `form.reset()` on trigger |
| `src/components/Billing/BillButtons.tsx` | Invoke callback after successful order |

---

## Running Tests

```bash
# Run unpaid orders tests
npm run test -- tests/unpaid-orders.test.ts

# Run bill form reset tests
npm run test -- tests/bill-form-reset.test.ts

# Run all tests
npm run test
```

---

## Notes

- Tests marked with [x] are passing (testing constants/enums that already exist)
- Tests marked with [ ] need implementation to pass
- Tests are designed to FAIL initially (TDD approach)
- The source files need implementation for the feature to be complete
- Bill form reset feature: See SPEC.md section "Feature: Reset BillParametersForm on Order Creation"
