# Tasks: fix-critical-bugs

## Phase 1: Simple Bugfixes

- [x] 1.1 `src/components/Billing/FilterBillPanel.tsx:366` — Change `T00:00:00` → `T23:59:59` in endDate
- [x] 1.2 `src/components/admin/user-modal.tsx:99-106` — Add `form.reset()` before `onClose()` after user creation
- [x] 1.3 `src/actions/stock/products.ts:236` — Add `images: { select: { url: true } }` to Prisma `include`
- [x] 1.4 `src/components/ProductDataTable.tsx:71-74` — Change imageUrl to `row.original.images?.[0]?.url` with placeholder fallback
- [x] 1.5 `src/components/CashRegister.tsx:88` — Verify back link works (prefetch if needed) — confirm no change needed

## Phase 2: Medium Bugfixes

- [x] 2.1 `src/actions/catalog.ts:33` — Replace `throw new Error(...)` → `return { error: string }`
- [x] 2.2 `src/app/[business]/catalogo/page.tsx` — Wrap action call in try/catch; render error fallback JSX on failure
- [x] 2.3 `src/components/Billing/PrintableTable.tsx:395-403` — Wrap Trash2 button in AlertDialog with "¿Eliminar [producto] de la venta?" confirmation
- [x] 2.4 **Verify**: catalog page doesn't crash when `hasPublicCatalog=false`; delete confirmation works

## Phase 3: New Components & Rewrites

- [x] 3.1 `src/components/ui/feature-blocked-modal.tsx` — Create reusable modal with title, reason-based text, WhatsApp contact button
- [x] 3.2 `src/components/Billing/BillButtons.tsx:620-636` — Replace inline Dialog with imported FeatureBlockedModal
- [x] 3.3 `src/actions/clients.ts` — Create `getClientsWithBalance(businessId)` querying `Client.findMany({ where: { businessId, balance: { gt: 0 } } })`
- [x] 3.4 `src/app/(protected)/account-ledger/AccountLedgerContent.tsx` — Rewrite to show client cards with name, debt, last order date
- [x] 3.5 **Verify**: modal renders on feature-disabled state; ledger shows clients with balance > 0
