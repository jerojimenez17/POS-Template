# Design: fix-edit-sales (FR-011)

## Overview

Fix the broken edit sale flow — three surgical changes that restore the "Actualizar Venta" button, persist IVA condition/document changes on update, and block editing of already-invoiced sales for ARCA compliance.

**Type:** Bug fixes + server-side validation. No new capabilities, no UI redesign, no credit note flow.

## Architecture

### Data Flow (Edit → Update)

```
EditSalePage (RSC)
  └─ BillProvider (context)
      └─ EditSaleWrapper (client)
          ├─ dispatches sale data → BillContext.set(billState)
          ├─ renders BillParametersForm (reads billState, updates via setState)
          └─ renders ProductsTable(isEditing=true, orderId=sale.id)
                └─ BillButtonsDefault
                      └─ "Actualizar Venta" button (visible ONLY when isEditing=true)
                            └─ Confirmation Dialog
                                  └─ createSale(false, true) → updateOrderAction(orderId, updatedData)
                                        └─ Prisma transaction → order.update()
```

### Files Changed

| File | Change | Type |
|------|--------|------|
| `src/components/Billing/ProductsTable.tsx` | Forward `isEditing` + `orderId` to `<BillButtons>` | 1-line add |
| `src/actions/sales/process.ts` — `updateOrderAction` | Add `clientIvaCondition` + `clientDocumentNumber` to `order.update()` payload | 2-line add |
| `src/actions/sales/process.ts` — `updateOrderAction` | Add CAE guard after `existingOrder` fetch | 3-line add |

### No Other Files Modified

The following already work correctly and need NO changes:
- `EditSaleWrapper.tsx` — already passes `isEditing={true}` and `orderId={sale.id}` to `ProductsTable`
- `BillButtons.tsx` — `BillButtonsDefault` already renders "Actualizar Venta" when `isEditing=true`
- `BillParametersForm.tsx` — already dispatches `clientIvaCondition` and `clientDocumentNumber` via `setState`

---

## Change 1: ProductsTable.tsx — Forward Props

**Location:** `src/components/Billing/ProductsTable.tsx`, line 36

**Problem:** `ProductsTable` receives `isEditing` and `orderId` from `EditSaleWrapper` but never passes them to `<BillButtons>`. The `BillButtonsDefault` component checks `isEditing` to render "Actualizar Venta" — without it, the button is never visible.

**Fix:** Add the two props to the existing `<BillButtons>` JSX call.

**Current (lines 36-40):**
```tsx
<BillButtons
  session={session}
  handlePrint={handlePrint}
  ptoVentas={ptoVentas}
/>
```

**After:**
```tsx
<BillButtons
  session={session}
  handlePrint={handlePrint}
  ptoVentas={ptoVentas}
  isEditing={isEditing}
  orderId={orderId}
/>
```

**Downstream behavior (BillButtonsDefault):**
- `isEditing` → controls conditional rendering at line 288: if `true`, renders only "Actualizar Venta" button (hides create buttons: Facturar, Remito, A cuenta, Presupuesto)
- `orderId` → passed to `createSale(false, true)` at line 253 for the update call

**Verification:** "Actualizar Venta" button renders when navigating to `/sales/[id]/edit`. The create buttons (Facturar, Remito, etc.) are hidden.

---

## Change 2: process.ts — Add IVA Fields to Update Payload

**Location:** `src/actions/sales/process.ts`, lines 432-456 (`updateOrderAction` — the `tx.order.update()` call)

**Problem:** The `updateOrderAction` updates `total`, `seller`, `paymentMethod`, `items`, etc. but omits `clientIvaCondition` and `clientDocumentNumber`. Changes to these fields in `BillParametersForm` are silently dropped — the DB retains old values.

The `ProcessSaleInput` interface already defines both fields (lines 34-35):
```typescript
clientIvaCondition?: string;
clientDocumentNumber?: string;
```

And the original `processSaleAction` (order creation) already saves them (lines 90-91):
```typescript
clientIvaCondition: billState.clientIvaCondition,
clientDocumentNumber: billState.clientDocumentNumber,
```

**Fix:** Add both fields to the `tx.order.update({ data: { ... } })` payload.

**Current payload (lines 434-455):**
```typescript
data: {
  total,
  seller: updatedData.seller,
  paymentMethod: updatedData.paidMethod || "Efectivo",
  paymentMethod2: /* ... */,
  totalMethod2: /* ... */,
  discountPercentage: discountPercent,
  discountAmount,
  clientId: updatedData.clientId,
  items: { deleteMany: {}, create: /* ... */ },
}
```

**After:**
```typescript
data: {
  total,
  seller: updatedData.seller,
  paymentMethod: updatedData.paidMethod || "Efectivo",
  paymentMethod2: /* ... */,
  totalMethod2: /* ... */,
  discountPercentage: discountPercent,
  discountAmount,
  clientId: updatedData.clientId,
  clientIvaCondition: updatedData.clientIvaCondition,
  clientDocumentNumber: updatedData.clientDocumentNumber,
  items: { deleteMany: {}, create: /* ... */ },
}
```

**Verification:** Change IVA condition / document number in BillParametersForm, click "Actualizar Venta", confirm — query DB directly to verify fields persisted.

**Why not `CAE`:** Not included intentionally. The CAE is only set during invoicing (via `createAfipVoucherAction` + `updateOrderCaeAction`), never during edit. Adding it here would let edits overwrite the CAE — the guard in Change 3 prevents editing invoiced sales entirely.

---

## Change 3: process.ts — Add CAE Validation Guard

**Location:** `src/actions/sales/process.ts`, between lines 341 and 343 (`updateOrderAction` — after `existingOrder` fetch, before version calculation)

**Problem:** `updateOrderAction` performs NO validation on whether the order already has a CAE. A user can edit an invoiced sale, changing items, totals, and IVA condition — all of which affect the ARCA invoice — without any notification to ARCA. The CAE in the DB becomes stale and invalid.

**Fix:** After fetching `existingOrder` and checking it exists, add a guard that throws if `existingOrder.CAE` is truthy.

**Insert after line 341 (`if (!existingOrder) throw...`):**
```typescript
// Block editing invoiced sales — ARCA compliance
if (existingOrder.CAE) {
  throw new Error("Esta venta ya fue facturada. No se puede editar. Genere una nota de crédito.");
}
```

**Error handling:** The existing try/catch (lines 490-493) catches the error and returns `{ error: "Error al actualizar la venta" }`. The message is generic but sufficient — the specific error is logged server-side.

**Verification:**
1. Take a sale WITH CAE (facturada) → navigate to edit page → change something → "Actualizar Venta" → expect error toast: "Error al actualizar la venta"
2. Take a sale WITHOUT CAE (remito) → navigate to edit page → change something → "Actualizar Venta" → expect success

**Edge case — error message visibility:** The generic `fail("Error al actualizar la venta")` hides the specific ARCA message from the user. To show the actual message, the catch block needs modification. If the error has a `.message`, forward it:

```typescript
// Proposed catch improvement (optional, line 491-492):
} catch (error) {
  console.error("Error updating sale:", error);
  const message = error instanceof Error ? error.message : "Error al actualizar la venta";
  return fail(message);
}
```

This change is NOT in scope but is RECOMMENDED. Without it, the user sees a generic error instead of the informative ARCA message.

---

## Sequence Diagram

```
User                   EditSalePage           EditSaleWrapper          ProductsTable          BillButtons          updateOrderAction
 │                         │                       │                       │                     │                     │
 │  Navigate /sales/id/edit                         │                       │                     │                     │
 │────────────────────────>│                       │                       │                     │                     │
 │                         │  Load sale data       │                       │                     │                     │
 │                         │──────────────────────>│                       │                     │                     │
 │                         │                       │  dispatch billState   │                     │                     │
 │                         │                       │──────────────────────>│                     │                     │
 │                         │                       │                       │  render with         │                     │
 │                         │                       │                       │  isEditing=true       │                     │
 │                         │                       │                       │  orderId=sale.id      │                     │
 │                         │                       │                       │──────────────────────>│                     │
 │  User sees form        │                       │                       │                     │                     │
 │  + "Actualizar Venta"   │                       │                       │                     │                     │
 │<─────────────────────────────────────────────────────────────────────────────────────────────│                     │
 │                         │                       │                       │                     │                     │
 │  User edits IVA/doc     │                       │                       │                     │                     │
 │  Clicks "Actualizar"    │                       │                       │                     │                     │
 │──────────────────────────────────────────────────────────────────────────────────────────────>│                     │
 │                         │                       │                       │                     │                     │
 │  Confirmation Dialog    │                       │                       │                     │                     │
 │<──────────────────────────────────────────────────────────────────────────────────────────────│                     │
 │                         │                       │                       │                     │                     │
 │  User confirms          │                       │                       │                     │                     │
 │──────────────────────────────────────────────────────────────────────────────────────────────>│                     │
 │                         │                       │                       │                     │  createSale(         │
 │                         │                       │                       │                     │    false, true)      │
 │                         │                       │                       │                     │─────────────────────>│
 │                         │                       │                       │                     │                     │
 │                         │                       │                       │                     │  updateOrderAction   │
 │                         │                       │                       │                     │                     │
 │                         │                       │                       │                     │   Find existingOrder │
 │                         │                       │                       │                     │   ────────────────   │
 │                         │                       │                       │                     │                     │
 │                         │                       │                       │                     │   existingOrder.CAE? │
 │                         │                       │                       │                     │   ├─ YES → THROW     │
 │                         │                       │                       │                     │   └─ NO  → Continue  │
 │                         │                       │                       │                     │                     │
 │                         │                       │                       │                     │   Update order      │
 │                         │                       │                       │                     │   (+ IVA fields)    │
 │                         │                       │                       │                     │   Revert old stock  │
 │                         │                       │                       │                     │   Apply new stock   │
 │                         │                       │                       │                     │   Record audit      │
 │                         │                       │                       │                     │   Return success    │
 │                         │                       │                       │                     │<────────────────────│
 │  Success/Error toast    │                       │                       │                     │                     │
 │<──────────────────────────────────────────────────────────────────────────────────────────────│                     │
```

---

## Decision Records

| ID | Decision | Options | Chosen | Rationale |
|----|----------|---------|--------|-----------|
| D1 | CAE blocking mechanism | `throw Error` vs `return { error }` | `throw Error` | `updateOrderAction` already wraps in try/catch with `fail()`. Throwing is consistent with existing pattern (e.g., `if (!existingOrder) throw...`). Avoids duplicating error paths. |
| D2 | IVA fields update mechanism | Add to existing `order.update()` payload vs separate action | Add to payload | Single Prisma transaction. Matches `processSaleAction` pattern exactly. No need for atomicity across two calls. |
| D3 | CAE included in update payload? | Yes vs No | No | CAE is set by invoice flow (`createAfipVoucherAction`), not by edit. Including it would let edits overwrite the CAE — counter to ARCA compliance. The guard in Change 3 prevents editing CAE sales entirely. |
| D4 | Catch block message forwarding | Current `fail("Error...")` vs `fail(error.message)` | Out of scope (recommended) | The generic message hides the specific ARCA warning from users. Forwarding the error message is a 1-line change but is NOT part of this fix scope — noted as improvement. |

---

## Rollback Plan

Per-commit revert on feature branch. No data migration needed (fixes are code-only).

| Revert order | Change | Risk |
|---|---|---|
| 1st | Change 3 (CAE guard) | Users can edit invoiced sales again (rollback to current behavior) |
| 2nd | Change 2 (IVA fields) | IVA changes silently dropped again (rollback to current behavior) |
| 3rd | Change 1 (prop forwarding) | Edit flow entirely broken again (rollback to current behavior) |

**Data safety:** None of these changes modify the DB schema. All changes are runtime logic only.

---

## Test Scenarios

| # | Scenario | Expected | Change Tested |
|---|----------|----------|---------------|
| T1 | Navigate to `/sales/[id]/edit` for non-CAE sale | "Actualizar Venta" button visible, create buttons hidden | #1 |
| T2 | Navigate to `/sales/[id]/edit` for CAE sale | Same as T1 (button visibility is independent of CAE) | #1 |
| T3 | Change IVA condition to "Responsable Inscripto", click "Actualizar Venta" | DB reflects new `clientIvaCondition` | #2 |
| T4 | Change document number to "20-12345678-9", click "Actualizar Venta" | DB reflects new `clientDocumentNumber` | #2 |
| T5 | Edit sale WITH CAE → change item quantity → click "Actualizar Venta" | Error response: "Esta venta ya fue facturada..." | #3 |
| T6 | Edit sale WITHOUT CAE → change item quantity → click "Actualizar Venta" | Success, DB updated | #1, #2, #3 |
| T7 | Edit sale WITH CAE → only change discount → click "Actualizar Venta" | Error blocked at CAE guard (no partial update) | #3 |
