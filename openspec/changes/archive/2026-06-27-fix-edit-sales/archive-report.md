# Archive Report: Fix Edit Sales (FR-011)

## Status: ✅ ARCHIVED

## What was delivered
- Reliable history change detection (norm comparison, toSecond guard, billType baseline)
- BillType resolution from history entries (selector shows correct value)
- Print + invoice/CAE panel in sale detail page
- Products as cards in SaleHistory (matching other sections)
- Sale detail page card layout redesign
- DNI/CUIT validation before edit save
- CAE Json? truthy guard (processSaleAction + updateOrderAction)
- Cancel button in red
- Printer icon blue

## Key decisions
- `billTypeChanged` only detects when `prevBillType !== null` (no baseline on first edit → no false positive). `billTypeTo` always saved for future reads
- `paymentChanged.toSecond` = `null` when `twoMethods = false` (form sends default "Débito" even when unused)
- `getSaleByIdAction` fetches last `orderUpdate.changes.billTypeTo` to resolve correct billType for form

## Files changed
- `src/actions/sales/process.ts` — Change detection, norm comparison, billType/billTypeTo
- `src/actions/sales/history.ts` — billType resolution in getSaleByIdAction
- `src/models/OrderUpdateChanges.ts` — Extended types
- `src/components/Billing/SaleHistory.tsx` — Products as cards, billType section
- `src/components/Billing/SaleDetailActions.tsx` — NEW: print + invoice/CAE panel
- `src/components/Billing/BillButtons.tsx` — ProcessSaleInput updates
- `src/app/(protected)/sales/[id]/page.tsx` — Added SaleDetailActions, cleaned layout
- ... and test/schema/config files
