# Tasks: Fix Edit Sales (FR-011)

## Phase 1: Implementation

- [x] 1.1 `ProductsTable.tsx` — Add `isEditing={isEditing} orderId={orderId}` to `<BillButtons>` component call (line ~36)
- [x] 1.2 `process.ts` — In `updateOrderAction`, add `clientIvaCondition: updatedData.clientIvaCondition` and `clientDocumentNumber: updatedData.clientDocumentNumber` to `tx.order.update({ data: { ... } })` payload (lines ~434-455)
- [x] 1.3 `process.ts` — In `updateOrderAction`, after finding existingOrder (after line ~336), add CAE guard: if `existingOrder.CAE` is truthy, throw Error("Esta venta ya fue facturada. No se puede editar. Genere una nota de crédito.")

## Phase 2: Testing

- [x] 2.1 `processSaleAction.test.ts` — Test: calling `updateOrderAction` on a sale WITHOUT CAE succeeds and updates IVA fields (R2 Scenario B + R5 Scenario D)
- [x] 2.2 `processSaleAction.test.ts` — Test: calling `updateOrderAction` on a sale WITH CAE returns error and does NOT update DB (R5 Scenario C)
