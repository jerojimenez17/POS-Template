# Exploration: Edit Sale Flow — FR-011

## Current Edit Flow (Text Diagram)

```
Sales List (SaleAccordion)
  │
  ├─ "Facturar" button (opens BillingModal)
  │     └─ Creates CAE via createAfipVoucherAction + updateOrderCaeAction
  │        Updates: CAE, clientIvaCondition, clientDocumentNumber, paymentMethod
  │
  └─ Click row → Sales Detail (/sales/[id])
        │
        └─ "Editar Venta" button → /sales/[id]/edit
              │
              ├─ EditSalePage (server) — auth check (ADMIN only)
              ├─ BillProvider wraps EditSaleWrapper
              ├─ EditSaleWrapper dispatches sale data into BillContext via setState
              └─ Renders:
                    ├─ BillParametersForm (clientCondition, payment, discount)
                    └─ ProductsTable (isEditing={true}, orderId={sale.id})
                          │
                          └─ BillButtons (DEFAULT — BillButtonsDefault)
                                ├─ EXPECTED: "Actualizar Venta" button + update Dialog
                                └─ ACTUAL:  Shows Facturar / Remito / A cuenta / Presupuesto
                                              (isEditing NEVER reaches here — see Issue #2)
```

---

## Issue 1: ProductsTable doesn't forward `isEditing`/`orderId` to BillButtons

**Files/Lines:**
- `src/components/Billing/ProductsTable.tsx` lines 14, 36-40
- `src/app/(protected)/sales/[id]/edit/EditSaleWrapper.tsx` line 47

**Root Cause:**

`EditSaleWrapper` correctly passes `isEditing={true}` and `orderId={sale.id}` to `ProductsTable`:

```tsx
// EditSaleWrapper.tsx:47
<ProductsTable session={session} isEditing={true} orderId={sale.id} />
```

`ProductsTable` receives the props but NEVER passes them to the `BillButtons` component:

```tsx
// ProductsTable.tsx:36-40
<BillButtons
  session={session}
  handlePrint={handlePrint}
  ptoVentas={ptoVentas}
  // isEditing and orderId are MISSING
/>
```

**Impact:** The `isEditing` prop in `BillButtonsDefault` (line 288) is always `undefined`. The "Actualizar Venta" button is NEVER rendered. The edit page shows standard create buttons (Facturar, Remito, A cuenta, Presupuesto). Clicking "Facturar" calls `createSale(true, false)` which tries to CREATE a new order — NOT update the existing one.

**Severity:** CRITICAL — the entire edit-to-update pipeline is broken at the UI level.

---

## Issue 2: "Actualizar Venta" button is invisible (botón perdido)

**Files/Lines:**
- `src/components/Billing/BillButtons.tsx` lines 288-313 (the button), lines 564-610 (the dialog)

**Root Cause:**

When `isEditing` were working, the button exists (line 290-313) with `bg-blue-600` styling. The Confimación dialog (line 564-610) shows "¿Está seguro que desea sobreescribir esta venta?".

However, looking at the button styling independently: `bg-blue-600` is close to link colors and other interactive elements. The "Facturar" button uses `bg-slate-900` (dark slate). So colors ARE different, but the PRD reports users can't find it — likely because it's a single button among what should be a modal/confirmation context, not a full-page edit mode.

**Note:** This is hard to evaluate in isolation since Issue #1 completely masks it. The primary fix is Issue #1 first.

---

## Issue 3: `updateOrderAction` doesn't save IVA condition or document fields

**Files/Lines:**
- `src/actions/sales/process.ts` lines 321-494 (updateOrderAction)
- `src/actions/sales/process.ts` lines 432-456 (the actual order.update call)

**Root Cause:**

The `updateOrderAction` function updates the following fields on the order:

```tsx
// process.ts:432-456
await tx.order.update({
  where: { id: orderId },
  data: {
    total,
    seller: updatedData.seller,
    paymentMethod: updatedData.paidMethod || "Efectivo",
    paymentMethod2: ...,
    totalMethod2: ...,
    discountPercentage: discountPercent,
    discountAmount,
    clientId: updatedData.clientId,
    // ⚠️ MISSING: clientIvaCondition
    // ⚠️ MISSING: clientDocumentNumber
    // ⚠️ MISSING: CAE
    items: { deleteMany: {}, create: ... },
  },
});
```

Even though the `ProcessSaleInput` interface (line 23-42) has `clientIvaCondition`, `clientDocumentNumber`, and `CAE` fields, they are never destructured into the update payload.

Meanwhile, the original `processSaleAction` (line 77-107) DOES save these:

```tsx
// process.ts:90-92
clientIvaCondition: billState.clientIvaCondition,
clientDocumentNumber: billState.clientDocumentNumber,
CAE: billState.CAE,
```

**Impact:** When a user changes the IVA condition or document number in BillParametersForm and clicks "Actualizar Venta", those changes are silently dropped. The database retains the old values.

---

## Issue 4: Changes tracking is always `ITEMS_UPDATED`

**Files/Lines:**
- `src/actions/sales/process.ts` lines 352-365
- `src/models/OrderUpdateChanges.ts` lines 1-43

**Root Cause:**

The `changes` object is always hardcoded to `{ type: "ITEMS_UPDATED" }`:

```tsx
// process.ts:352-365
const changes: OrderUpdateChanges = {
  type: "ITEMS_UPDATED",
  items: updatedData.products.map((p) => ({
    productId: p.id,
    description: p.description,
    code: p.code,
    quantity: {
      from: existingOrder.items.find((i) => i.productId === p.id)?.quantity ?? 0,
      to: p.amount,
    },
  })),
};
```

Even if only discount, client, or payment method changed — the audit log says items were updated. There are no `DISCOUNT_CHANGED`, `CLIENT_CHANGED`, `PAYMENT_CHANGED`, or `IVA_CHANGED` change types actually being recorded, even though they exist in the `OrderUpdateChanges` type definition.

**Available types in `OrderUpdateChanges`:**

| Type | Available | Used in updateOrderAction |
|------|-----------|--------------------------|
| ITEMS_UPDATED | ✅ | ✅ (always) |
| ITEMS_ADDED | ✅ | ❌ |
| ITEMS_REMOVED | ✅ | ❌ |
| STATUS_CHANGED | ✅ | ❌ |
| DISCOUNT_CHANGED | ✅ | ❌ |
| CLIENT_CHANGED | ✅ | ❌ |

**Missing types (not in OrderUpdateChanges but needed):**
- PAYMENT_CHANGED (paymentMethod, twoMethods)
- IVA_CHANGED (clientIvaCondition, clientDocumentNumber)
- CAE_CHANGED (CAE set/updated)

---

## Issue 5: No ARCA policy for already-invoiced sales

**Files/Lines:**
- `src/actions/sales/process.ts` lines 321-494 (entire updateOrderAction)
- Prisma schema `prisma/schema.prisma` lines 337-375 (Order model)

**Root Cause:**

The `updateOrderAction` function performs NO validation on whether the order already has a CAE:

```tsx
// process.ts:336-341
const existingOrder = await tx.order.findFirst({
  where: { id: orderId, businessId },
  include: { items: true },
});
if (!existingOrder) throw new Error("Orden no encontrada");
// ⚠️ No check: if (existingOrder.CAE) ...
```

This means:
1. A user can edit a sale that was already invoiced with ARCA/CAE
2. The edit can change items, totals, IVA condition — all of which affect the ARCA invoice
3. The CAE in the DB remains the original one, now invalidated by the changes
4. No re-invoicing logic notifies ARCA of the changes or generates a credit note + new invoice
5. ARCA regulations require: if an already-invoiced sale changes, a credit note (nota de crédito) must be issued for the original amount AND a new invoice for the corrected amount if applicable

**What should happen vs what does happen:**

| Scenario | Should | Does |
|----------|--------|------|
| Edit sale w/o CAE (remito) | Allow edit freely | ✅ Works (if Issue #1 is fixed) |
| Edit sale WITH CAE (facturada) | Block with warning OR trigger credit note flow | ❌ Silently allows, CAE stays stale |
| Change IVA condition on CAE sale | Must cancel original invoice, re-invoice with new condition | ❌ No handling |

---

## Issue 6: `clientDocumentNumber` type mismatch (`number` vs `string`)

**Files/Lines:**
- `src/models/BillState.ts` line 13 — `documentNumber: number`
- `src/models/BillState.ts` line 27 — `clientDocumentNumber?: string`
- Prisma schema line 368 — `clientDocumentNumber String?`

**Root Cause:**

`BillState` has two document number fields with different types:
- `documentNumber: number` (used in UI, CheckoutModal, form fields)
- `clientDocumentNumber?: string` (used in DB storage)

The `updateOrderAction` tries to set `clientDocumentNumber` via `updatedData` which uses `ProcessSaleInput.clientDocumentNumber?: string`. But the `BillParametersForm` dispatches it via `setState` with `clientDocumentNumber: String(documentNumber)`. So while it works, the dual-type duality is fragile and the `mapOrderToBillState` (history.ts:51-52) does:

```tsx
typeDocument: order.clientIvaCondition || "DNI",
documentNumber: order.clientDocumentNumber ? Number(order.clientDocumentNumber) : 0,
```

This is fine but the `updateOrderAction` simply doesn't save either field.

---

## Risk Assessment

| Issue | Severity | Risk | Effort to Fix |
|-------|----------|------|---------------|
| #1: Props not forwarded | CRITICAL | Edit flow completely broken | 5 min (1 line) |
| #3: IVA not saved on update | HIGH | Data loss on every update | 5 min (add fields to update) |
| #4: Wrong change tracking | MEDIUM | Audit trail is misleading | 2-3 hours (diff logic + new types) |
| #5: No ARCA policy | HIGH | Regulatory non-compliance | 4-8 hours (new flow design) |
| #6: Type duality | LOW | Confusion, potential bugs | 30 min (unify to string) |

---

## Recommendation

**Fix order (priority):**

1. **Immediate fix (P0):** Forward `isEditing` and `orderId` from `ProductsTable` to `BillButtons` — restores the entire edit flow. Risk: minimal.
2. **Server fix (P0):** Add `clientIvaCondition`, `clientDocumentNumber` to the `updateOrderAction` update payload. Risk: minimal.
3. **Audit fix (P1):** Compare changed fields in `updateOrderAction` and emit correct `OrderUpdateChanges` type. Detect items/discount/client/IVA changes separately.
4. **ARCA policy (P1):** Add validation in `updateOrderAction` — if `existingOrder.CAE` exists, block edit with message "Esta venta ya fue facturada. Debe generar una nota de crédito." The credit note flow is a separate feature.
5. **Type cleanup (P2):** Decide on `documentNumber` vs `clientDocumentNumber` — unify.

### Ready for Proposal

Yes. The exploration is complete and the orchestator has enough detail to produce a proposal, spec, design, and tasks. The critical path is clear: fix prop forwarding → fix server action → add ARCA validation.
