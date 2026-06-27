# Apply Progress: Fix Edit Sales (FR-011)

## Implementation Summary

All 5 tasks implemented and verified. 22/22 tests pass.

## Completed Tasks

- [x] 1.1 — Forwarded `isEditing={isEditing}` and `orderId={orderId}` props to `<BillButtons>` in ProductsTable.tsx
- [x] 1.2 — Added `clientIvaCondition` and `clientDocumentNumber` to the `tx.order.update({ data: { ... } })` payload in `updateOrderAction`
- [x] 1.3 — Added CAE validation guard in `updateOrderAction`: throws Error if `existingOrder.CAE` is truthy
- [x] 2.1 — Test: non-invoiced edit (no CAE) succeeds and IVA fields are persisted
- [x] 2.2 — Test: invoiced edit (CAE present) returns error, `order.update` is never called

## Files Changed

| File | Action | What Was Done |
|------|--------|---------------|
| `src/components/Billing/ProductsTable.tsx` | Modified | Added `isEditing` and `orderId` props to `<BillButtons>` call |
| `src/actions/sales/process.ts` | Modified | Added CAE validation guard after existingOrder check (line 343-346) |
| `src/actions/sales/process.ts` | Modified | Added `clientIvaCondition` and `clientDocumentNumber` to order update payload (lines 448-449) |
| `src/__tests__/actions/processSaleAction.test.ts` | Modified | Added 2 tests for CAE validation in `updateOrderAction` |

## Test Results

All 22 tests pass (20 existing + 2 new).

```
✓ src/__tests__/actions/processSaleAction.test.ts (22 tests) 20ms
```

## Build Status

Build fails with pre-existing TypeScript error in `src/components/ProductDataTable.tsx:203` — unrelated to these changes.

## Deviations from Design

None — implementation matches design.

- CAE guard uses `throw Error(...)` consistent with existing pattern
- IVA fields added to existing `order.update()` payload
- Generic catch message swallows specific ARCA warning (known limitation per design D4)

## Known Limitations

- The error message from CAE guard (`"Esta venta ya fue facturada..."`) is caught by the outer try/catch and returned as `"Error al actualizar la venta"`. Per design D4, this is a known improvement out of scope.
