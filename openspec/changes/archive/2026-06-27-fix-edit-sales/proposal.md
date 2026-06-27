# Proposal: fix-edit-sales (FR-011)

## Intent

Fix the broken edit sale flow — restore the "Actualizar Venta" button, persist IVA condition changes, and block editing of already-invoiced sales (ARCA compliance).

## Scope

**In:**
1. Forward `isEditing` + `orderId` from ProductsTable → BillButtons (P0)
2. Add `clientIvaCondition` + `clientDocumentNumber` to Prisma update in `updateOrderAction` (P0)
3. ARCA validation: block edit if `existingOrder.CAE` exists, show warning (P1)

**Out:** Credit note generation flow, audit diff tracking, type duality cleanup (`documentNumber` vs `clientDocumentNumber`)

## Capabilities

### New Capabilities

None — pure bug fixes + server-side validation.

### Modified Capabilities

- `invoice-flow`: add R5 — editing a sale with existing CAE MUST be blocked with message "Esta venta ya fue facturada. No se puede editar. Genere una nota de crédito."

## Approach

| # | Fix | File | Change |
|---|-----|------|--------|
| 1 | Prop forwarding | `ProductsTable.tsx` | Add `isEditing={isEditing} orderId={orderId}` to `<BillButtons>` |
| 2 | IVA save | `process.ts` — `updateOrderAction` | Add `clientIvaCondition`, `clientDocumentNumber` to `order.update()` data |
| 3 | ARCA block | `process.ts` — `updateOrderAction` | After `existingOrder` fetch: throw if `existingOrder.CAE` is set |

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `ProductsTable.tsx` | Modified | Forward `isEditing`/`orderId` to `BillButtons` |
| `process.ts` — updateOrderAction | Modified | +IVA fields in update payload |
| `process.ts` — updateOrderAction | Modified | +ARCA validation guard |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| ARCA block breaks workflows for users editing facturadas | Med | Intended fix — non-compliant behavior. Credit note flow is next feature. |
| IVA save type mismatch (`documentNumber: number` vs `clientDocumentNumber: string`) | Low | Already converts via `String(documentNumber)` in BillParametersForm — works |

## Rollback Plan

Per-commit revert on feature branch. No data changes (fixes are read-side validation + write-side field addition). Revert in order: #3, #2, #1.

## Success Criteria

- [ ] "Actualizar Venta" button renders when editing a sale
- [ ] Changing IVA condition / document and clicking "Actualizar Venta" persists changes in DB
- [ ] Editing a sale WITH CAE returns error: "Esta venta ya fue facturada..."
- [ ] Editing a sale WITHOUT CAE (remito) proceeds normally
