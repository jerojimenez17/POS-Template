# SPEC: Budget (Presupuesto) Feature

## Overview
Add a "Presupuesto" feature toggleable by superadmin. Budgets are unconfirmed orders (status: "pendiente") that appear in account-ledger and can be printed.

## Requirements

### 1. Feature Flag: `hasBudget`
- New Boolean field on `BusinessFeatures` model
- Toggleable from superadmin features page
- BASIC: false, PRO: false, ENTERPRISE: true
- Session type must include `hasBudget`

### 2. Server Action: `createBudgetAction`
- Creates Order with `status: "pendiente"`, `paidStatus: "inpago"`
- No cash session required
- No stock decrement
- No cash movements
- No client balance update
- Client is optional
- Triggers pusher + revalidation

### 3. UI: Budget Button on NewBill page
- New "Presupuesto" button in `BillButtonsDefault` component
- Guarded by `session?.user?.business?.features?.hasBudget`
- Opens confirmation dialog (like Facturar/Remito)
- On confirm: call `createBudgetAction`, print, reset products
- No client required
- Sets `billType: "Presupuesto"` for print display

### 4. Print: "Presupuesto" label
- Update `getBillTypeDisplay` to return "Presupuesto" when billType === "Presupuesto"

### 5. Account-Ledger: Print capability
- Add print button per row in account-ledger list
- Add print button in account-ledger detail view
- Reuse `PrintOptionsPopover` with order-to-BillState conversion

## Acceptance Criteria

1. Superadmin can toggle `hasBudget` on/off per business
2. When `hasBudget` is ON, a "Presupuesto" button appears in BillButtons
3. When `hasBudget` is OFF, the button is hidden
4. Clicking "Presupuesto" without products shows disabled state
5. Clicking "Presupuesto" with products opens confirmation dialog
6. On confirm, budget order is created with status "pendiente"
7. Creating a budget does NOT decrement stock
8. Creating a budget does NOT require an open cash session
9. Creating a budget does NOT create cash movements
10. Budget appears in account-ledger under "Por Confirmar" tab
11. Budget can be printed at creation time with "Presupuesto" label
12. From account-ledger list, each row has a print button
13. From account-ledger detail, there is a print button

## Data Model Changes

```prisma
// BusinessFeatures additions
hasBudget Boolean @default(false)
```

## File Changes

| File | Action |
|------|--------|
| `prisma/schema.prisma` | Add `hasBudget` field |
| `src/types/next-auth.d.ts` | Add `hasBudget` to type |
| `auth.ts` | Add default `hasBudget: false` |
| `src/actions/superadmin.ts` | Add `hasBudget` to payload/upsert |
| `src/app/superadmin/businesses/[id]/features/page.tsx` | Add default |
| `src/app/superadmin/businesses/[id]/features/FeaturesForm.tsx` | Add toggle UI |
| `src/actions/budget.ts` | **NEW** — `createBudgetAction` |
| `src/lib/utils/bill-type.ts` | Handle "Presupuesto" |
| `src/components/Billing/BillButtons.tsx` | Add budget button + dialog |
| `src/app/(protected)/account-ledger/page.tsx` | Add print per row |
| `src/app/(protected)/account-ledger/[id]/page.tsx` | Add print on detail |
| `src/app/(protected)/account-ledger/[id]/PrintOrderButton.tsx` | **NEW** — client print wrapper |
