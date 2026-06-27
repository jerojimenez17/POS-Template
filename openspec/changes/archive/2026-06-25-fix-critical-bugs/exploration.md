# Exploration: fix-critical-bugs

> Phase 2 bug batch — FR-003 through FR-010
> PRD ref: `prd-pos-stabilization.md`

---

## FR-003: Feature disabled — Modal consistente

### Root Cause
**`src/lib/auth-gates.ts:32`** — `requireFeature()` returns `fail("Esta función no está habilitada en tu plan actual.", "FORBIDDEN")`.

Multiple callers handle this error **inconsistently**:
- ✅ `BillButtons.tsx:247` — uses unified modal `openFeatureBlockedModal` (AFIP flow only)
- ❌ `BillButtons.tsx:189` — `handleSaveSale` uses `toast.error()` (ledger/budget flow)
- ❌ `BillButtons.tsx:147` — `handleCreateVoucher` uses `toast.error()`
- ❌ `src/actions/unpaid-orders.ts:92` — returns `{ success: false, error: ... }` handled via toast in `ClientSelectionModal`
- ❌ `src/actions/cashbox.ts:40-41` — returns `fail()` → propagated to caller

**Existing modal** already exists at `BillButtons.tsx:620-636` with WhatsApp contact info, but only wired for AFIP flow.

### Fix
1. Extract `FeatureBlockedModal` as reusable component (or keep inline Dialog)
2. Replace all `toast.error()` for feature errors with `setOpenFeatureBlockedModal(true)`
3. Track which features are blocked to show a meaningful message

### Files Affected
- `src/components/Billing/BillButtons.tsx` — lines 147, 189 (toast → modal)
- `src/components/ledger/ClientSelectionModal.tsx` — error from createUnpaidOrder
- `src/actions/sales/process.ts` — line 52 error return (already returns error, fix is client-side)

### Complexity: **Medium**

---

## FR-004: Catálogo — Crash when not available

### Root Cause
**`src/actions/catalog.ts:33`** throws `new Error("El catálogo público no está habilitado...")` when `hasPublicCatalog` is false.

**`src/app/[business]/catalogo/page.tsx:16`** calls `getPublicProductsByBusinessId(business.id)` without `try/catch`. The thrown error propagates to Next.js error boundary → crash / 500 page instead of user-friendly message.

### Fix
Wrap the call in a try/catch. On error, render "feature not available" UI (reuse FR-003's modal pattern for consistency). Alternatively, change the action to return `{ error }` instead of throwing.

### Files Affected
- `src/app/[business]/catalogo/page.tsx` — line 16 (add error handling)
- `src/actions/catalog.ts` — line 32-33 (optionally return error instead of throw)

### Complexity: **Simple**

---

## FR-005: Vender — Eliminar producto sin confirmación

### Root Cause
**`src/components/Billing/PrintableTable.tsx:397`** — delete button calls `removeItem(product)` directly with NO confirmation dialog.

**`src/context/BillProvider.tsx:55-57`** — `removeItem` immediately dispatches removal action.

### Fix
Wrap the delete `<button>` in `AlertDialog` (exists at `src/components/ui/alert-dialog.tsx`). Use the same pattern as user deletion in `src/components/admin/users-table.tsx:160-180`.

### Files Affected
- `src/components/Billing/PrintableTable.tsx` — lines 395-403

### Complexity: **Simple**

---

## FR-006: Cajas — Navegar hacia atrás

### Current State
**`src/components/CashRegister.tsx:88-89`** already has `<Link href="/">` for back navigation. The code appears correct.

The issue may be contextual: perhaps the back button works in some flows but not others, or the (protected) layout resolution affects it.

### Fix
If the button exists and links to "/", verify it works. If broken, switch to `router.push("/")` or add `prefetch`. If already working, consider this resolved.

### Files Affected
- `src/components/CashRegister.tsx` — line 88-89

### Complexity: **Simple**

---

## FR-007: Cuentas Corrientes — Muestra ventas

### Root Cause
**`src/app/(protected)/account-ledger/AccountLedgerContent.tsx`** calls `getUnpaidOrders({ businessId, status: "all" })` which fetches ALL orders (paid and unpaid). Displays them as individual order rows.

**`src/actions/unpaid-orders.ts:377-382`** — `status: "all"` query has NO filter on `paidStatus`, so it returns everything.

Expected: Fetch clients with `balance > 0` and show per-client summary (name, total debt, last activity). Not individual orders.

### Fix
Rewrite `AccountLedgerContent` to query clients with non-zero balance instead of orders. Keep the existing `[id]` detail page for per-order breakdown. The `Client` model already has a `balance` field (see `createUnpaidOrder` updates it).

### Files Affected
- `src/app/(protected)/account-ledger/AccountLedgerContent.tsx` — full rewrite needed
- `src/actions/unpaid-orders.ts` — `getUnpaidOrders` query (or new action to fetch clients with balance)

### Complexity: **Medium**

---

## FR-008: Ventas — Filtro del día

### Root Cause
**`src/components/Billing/FilterBillPanel.tsx:366`**:
```tsx
onChange={(e) => endDate(new Date(e.target.value + "T00:00:00"))}
```
End date is set to **midnight** (00:00:00) of the selected day instead of 23:59:59.

**`src/components/Billing/SalesTable.tsx:141`**:
```tsx
(!endDate.active || saleTime <= endDate.date.getTime())
```
If user picks the same day for both start and end, endDate is that day's midnight → excludes all sales from that day's 00:01 onwards.

**Default state** works by accident: `startOfTomorrow` (midnight of next day) includes all of today.

### Fix
Change line 366 from `T00:00:00` to `T23:59:59`.

### Files Affected
- `src/components/Billing/FilterBillPanel.tsx` — line 366

### Complexity: **Simple**

---

## FR-009: Stock — Foto del producto

### Root Cause
**Two issues:**

**1. Query** — `src/actions/stock/products.ts:234-237`:
```typescript
include: { supplier: true, brand: true, category: true, subCategory: true }
// Missing: images: true
```
The `images` relation (`ProductImage[]`) is not included.

**2. Display** — `src/components/ProductDataTable.tsx:71-74`:
```tsx
const imageUrl = row.original.image;
{imageUrl && imageUrl.includes("https") ? (...show...) : (...placeholder...)}
```
Only checks `Product.image` (single String?), not `Product.images[]` relation. When product-form uploads images via Firebase, they go into the `images` relation, leaving the `image` field empty.

### Fix
1. Add `images: { select: { url: true } }` to the Prisma query include
2. Update image check: `const imageUrl = row.original.image || row.original.images?.[0]?.url`

### Files Affected
- `src/actions/stock/products.ts` — line 236
- `src/components/ProductDataTable.tsx` — lines 71-74

### Complexity: **Simple**

---

## FR-010: Crear Vendedor — No limpia campos

### Root Cause
**`src/components/admin/user-modal.tsx:98-106`** — On successful creation:
```tsx
createBusinessUser(values).then((data) => {
  if (data.success) {
    toast.success(data.success);
    onClose();     // ← no form.reset() here
    router.refresh();
  }
});
```

`form.reset()` exists in the `onOpenChange` handler (line 116), which fires when Dialog closes via user interaction. But when `onClose()` is called programmatically from submit, the close flow may not trigger `onOpenChange` → `form.reset()` properly.

When dialog reopens for new user, `useEffect` (line 65, deps: `[user, form]`) doesn't re-run because `user` is still `null`. Form retains stale data.

### Fix
Add `form.reset()` in the success handler before `onClose()`.

### Files Affected
- `src/components/admin/user-modal.tsx` — lines 99-106

### Complexity: **Simple**

---

## Execution Priority

| # | Bug | Complexity | Why first |
|---|-----|-----------|-----------|
| 1 | **FR-004** Catalog crash | Simple | Prevents page crash, highest impact |
| 2 | **FR-005** Delete confirmation | Simple | Prevents accidental data loss |
| 3 | **FR-008** Day filter | Simple | Fixes broken core filter |
| 4 | **FR-010** Form not clearing | Simple | Affects all user creation |
| 5 | **FR-009** Product photo | Simple | Visual fix, easy win |
| 6 | **FR-006** Back navigation | Simple | Quick verify + fix |
| 7 | **FR-003** Feature modal | Medium | Needs reusable component |
| 8 | **FR-007** Ledger shows orders | Medium | Larger refactor needed |
