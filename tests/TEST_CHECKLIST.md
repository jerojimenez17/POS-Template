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

## Running Tests

```bash
npm run test -- tests/unpaid-orders.test.ts
```

---

## Notes

- Tests are designed to FAIL initially (TDD approach)
- The source file `src/actions/unpaid-orders.ts` needs to be implemented
- All acceptance criteria must pass for the feature to be complete
