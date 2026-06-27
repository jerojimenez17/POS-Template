# Edit Sales Specification

## Requirements

### Requirement: R1 — Forward edit mode to BillButtons

ProductsTable MUST forward `isEditing` and `orderId` props to BillButtons when rendering in edit mode, so the "Actualizar Venta" button renders instead of create buttons (Facturar/Remito).

#### Scenario A — Edit mode shows update button

- GIVEN user is on the edit sale page (`/sales/[id]/edit`)
- WHEN ProductsTable renders BillButtons
- THEN BillButtons receives `isEditing={true}` and `orderId={sale.id}`
- AND "Actualizar Venta" button is visible
- AND create buttons (Facturar/Remito) are NOT visible

### Requirement: R2 — Persist IVA condition on update

`updateOrderAction` MUST persist `clientIvaCondition` and `clientDocumentNumber` in the order update payload when the sale is edited.

#### Scenario B — IVA condition updated

- GIVEN user edits a sale and changes IVA condition or document number
- WHEN "Actualizar Venta" is clicked
- THEN the order's `clientIvaCondition` and `clientDocumentNumber` are updated in DB
- AND other order fields remain unchanged
