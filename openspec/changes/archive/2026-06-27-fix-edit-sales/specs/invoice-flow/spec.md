# Delta for Invoice Flow

## ADDED Requirements

### Requirement: R5 — Block editing sales with CAE

`updateOrderAction` MUST verify if the order has a CAE before applying updates. If CAE exists, the action MUST return an error and MUST NOT modify the database.

#### Scenario C — Edit invoiced sale blocked

- GIVEN a sale that was already invoiced (has CAE)
- WHEN user tries to update it via `updateOrderAction`
- THEN the action returns error: "Esta venta ya fue facturada. No se puede editar. Genere una nota de crédito."
- AND no DB changes occur

#### Scenario D — Edit non-invoiced sale allowed

- GIVEN a sale that was NOT invoiced (no CAE, e.g. remito)
- WHEN user tries to update it
- THEN the update proceeds normally
