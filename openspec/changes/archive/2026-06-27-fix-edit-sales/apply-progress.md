# Apply Progress: Fix Edit Sales (FR-011)

## Summary
Implemented and verified all changes for the edit sales feature including history tracking improvements.

## What was done

### Phase 1 — Core implementation
- [x] 1.1 `ProductsTable.tsx` — Pass `isEditing`/`orderId` to BillButtons
- [x] 1.2 `process.ts` — Update IVA fields in `updateOrderAction`
- [x] 1.3 `process.ts` — CAE guard for invoiced sales

### Phase 2 — Change detection & history tracking (batch 2-4)
- [x] Extended `OrderUpdateChanges` type with `ivaChanged`, `paymentChanged`, `discountChanged`, `billTypeChanged`, `billTypeTo`
- [x] Added `norm()` comparison helper for string normalization (fixes false positives on casing)
- [x] Added `ivaChanged` detection in `updateOrderAction`
- [x] Added `billTypeChanged` detection with history-based baseline (skips first edit, works on subsequent edits)
- [x] Fixed `paymentChanged` — `toSecond` forced to `null` when `twoMethods=false`
- [x] Added `discountChanged` detection
- [x] SaleDetailActions component — print button, invoice/CAE panel
- [x] SaleHistory — products as single card, billType section, improved structure
- [x] `getSaleByIdAction` resolves `billType` from last history entry

### Fixed bugs
- ✅ CAE Json? truthy check — replaced `if (orderCae)` with `if (orderCae?.CAE)`
- ✅ BillParametersForm sync from BillContext in cards layout
- ✅ DNI/CUIT validation before update
- ✅ False `paymentChanged` when only billType changes
- ✅ Products in SaleHistory as cards (not table)
- ✅ BillType selector shows correct initial value (resolved from history)
