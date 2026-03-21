# Bug Analysis: TotalPanel Not Updating After Payment

---

## Bug 1: Account Ledger Payment Flow

### Bug Description

When a user makes a payment in `/src/app/(protected)/account-ledger/[id]/`, the movement appears in `CashRegister.tsx` but `TotalPanel.tsx` does not show the updated balance total.

### Root Cause Analysis

#### Issue 1: Pusher Event Mismatch

The `registerPayment` action in `src/actions/unpaid-orders.ts:172-234` creates a `cashMovement` record but **does not trigger the correct Pusher event** for the CashRegister to receive updates.

| Location | Channel | Event |
|----------|---------|-------|
| `registerPayment` (line 225) | `orders-{businessId}` | `orders-update` |
| `CashRegister` subscribes (line 47) | `movements-{businessId}` | `new-movement` |

The payment triggers `orders-update` on `orders-{businessId}`, but CashRegister listens for `new-movement` on `movements-{businessId}`. These channels/events do not match.

#### Issue 2: CashBox Balance Not Updated

`TotalPanel` fetches the balance via `getBusinessBalanceAction()` which reads from the `CashBox` model (`src/actions/billing.ts:158-171`).

However, `registerPayment` only creates a `cashMovement` record - it does **NOT** update the `CashBox.total` balance. Therefore, even if the Pusher event were correct, the balance would still show stale data.

#### Code Flow Diagram

```
AddPaymentForm → registerPayment → db.cashMovement.create()
                                      ↓
                              pusherServer.trigger(
                                `orders-{id}`,      ← WRONG CHANNEL
                                "orders-update"     ← WRONG EVENT
                              )
                                      ↓
                              CashBox.total NOT updated
                                      ↓
CashRegister (listening on `movements-{id}` for `new-movement`) ← NEVER RECEIVES EVENT
                                      ↓
TotalPanel.refreshCount never increments
                                      ↓
TotalPanel does NOT re-fetch balance
```

### Expected Behavior

1. When a payment is registered via `AddPaymentForm`, a `new-movement` Pusher event should be triggered on the `movements-{businessId}` channel
2. `CashRegister` should receive this event and increment `refreshTotal`
3. `TotalPanel` should receive the updated `refreshCount` prop and re-fetch the balance
4. The `CashBox.total` balance should be updated when payments are registered

### Acceptance Criteria

- [ ] When a payment is registered, `CashRegister` receives a Pusher event and displays the new movement
- [ ] `TotalPanel` updates immediately after a payment is registered
- [ ] The balance shown in `TotalPanel` reflects all registered payments
- [ ] Both direct cash movements (via AddButton) and payments on orders trigger the same Pusher event flow

### Proposed Solution

#### Fix 1: Trigger Correct Pusher Event in `registerPayment`

In `src/actions/unpaid-orders.ts`, add a Pusher trigger for the `new-movement` event on the `movements-{businessId}` channel after creating the cash movement:

```typescript
// After line 202 (cashMovement.create), add:
const movement = await tx.cashMovement.create({ data: cashMovementData });

await pusherServer.trigger(
  `movements-${businessId}`,
  "new-movement",
  movement
);
```

#### Fix 2: Update CashBox Balance or Calculate from Movements

The `CashBox` balance needs to be updated when payments are registered. Two options:

**Option A:** Update `CashBox` in `registerPayment`:
```typescript
await tx.cashBox.upsert({
  where: { businessId },
  update: { total: { increment: input.amount } },
  create: { businessId, total: input.amount },
});
```

**Option B:** Have `getBusinessBalanceAction` calculate the balance from `cashMovements` (recommended):
```typescript
export const getBusinessBalanceAction = async () => {
  const session = await auth();
  if (!session?.user?.businessId) return 0;

  try {
    const result = await db.cashMovement.aggregate({
      where: { businessId: session.user.businessId },
      _sum: { total: true },
    });
    return result._sum.total || 0;
  } catch (error) {
    console.error("Error fetching business balance:", error);
    return 0;
  }
};
```

Option B is preferred as it provides a real-time balance based on actual movements rather than a cached total.

### Files to Modify

| File | Changes |
|------|---------|
| `src/actions/unpaid-orders.ts` | Add Pusher trigger for `new-movement` event on `movements-{businessId}` channel |
| `src/actions/billing.ts` | Modify `getBusinessBalanceAction` to calculate from `cashMovements` aggregate |

---

## Bug 2: Mixed Payment (Pago Mixto) Cash Movement Real-time Update Failure

### Bug Description

When paying a bill with mixed payment (pago mixto) in `/src/app/(protected)/newBill/page.tsx`, if the second payment is in "efectivo" (cash), the movement is created and shown in `/src/components/CashRegister.tsx` but `/src/components/TotalPanel.tsx` doesn't update.

### Root Cause Analysis

#### Flow Trace

1. **NewBill Page** (`newBill/page.tsx:13`) wraps content with `BillProvider`
2. **BillParametersForm** (`BillParametersForm.tsx:186-241`) allows selecting "Dividir pago" (split payment) with two payment methods
3. **processSaleAction** (`sales.ts:41-197`) is called when a sale is submitted

#### Critical Finding

In `processSaleAction` (`sales.ts:147-180`), cash movements are created for both single and mixed payments:

```typescript
// Lines 147-180 in sales.ts
if (isTwoMethods) {
  if (total - totalSecondMethodParsed > 0) {
    await tx.cashMovement.create({ /* first payment */ });
  }
  if (totalSecondMethodParsed > 0) {
    await tx.cashMovement.create({ /* second payment */ });
  }
} else {
  await tx.cashMovement.create({ /* single payment */ });
}
```

**However**, after creating these movements, ONLY the orders Pusher event is triggered:

```typescript
// Line 185 in sales.ts
await pusherServer.trigger(`orders-${businessId}`, "orders-update", {});
```

**Missing**: No `pusherServer.trigger()` for `movements-${businessId}` channel with `"new-movement"` event.

#### CashRegister Pusher Subscription

In `CashRegister.tsx:47-59`:
```typescript
const channel = pusherClient.subscribe(`movements-${session.user.businessId}`);
channel.bind("new-movement", (data: Movement) => {
  setMovements((prev) => [newMovement, ...prev]);
  setRefreshTotal((prev) => prev + 1);  // Triggers TotalPanel refresh
});
```

#### Why TotalPanel Fails

1. `CashRegister` receives no `new-movement` Pusher event
2. `refreshTotal` state is never incremented
3. `TotalPanel` depends on `refreshCount` prop to trigger balance re-fetch
4. Without `refreshCount` change, `TotalPanel` never calls `getBusinessBalanceAction()`

#### Comparison with Working Flows

| Action | Pusher Trigger for Movements |
|--------|------------------------------|
| `createMovement` (movements.ts:29-33) | ✅ `pusherServer.trigger("movements-{id}", "new-movement", movement)` |
| `registerPayment` (unpaid-orders.ts:225) | ✅ `pusherServer.trigger("movements-{id}", "new-movement", movement)` |
| `processSaleAction` (sales.ts) | ❌ **MISSING** - only triggers `orders-{id}` |

#### Why Movement Appears in CashRegister Table

`revalidatePath("/cashRegister")` is called at line 188, causing server-side re-render. The movement appears in the table because the server data is refreshed, but the **real-time state update chain is broken**.

#### Expected vs Actual Behavior

| Scenario | Expected | Actual |
|----------|----------|--------|
| Single cash payment | `new-movement` Pusher event fires, CashRegister updates, TotalPanel updates | Movement appears in table (revalidatePath), but TotalPanel does NOT update |
| Mixed payment (cash + digital) | Both movements trigger `new-movement`, both components update | Movements in table (revalidatePath), TotalPanel does NOT update |
| Mixed payment (digital + cash) | Both movements trigger `new-movement`, both components update | Movements in table (revalidatePath), TotalPanel does NOT update |

#### Affected Components

1. `src/components/CashRegister.tsx` - Receives movements via revalidation but no real-time state update
2. `src/components/TotalPanel.tsx` - Never receives `refreshCount` update, balance stale

### Acceptance Criteria

1. When `processSaleAction` creates any cash movement (single or mixed payment), `pusherServer.trigger()` must fire on `movements-{businessId}` channel with `"new-movement"` event
2. `CashRegister.tsx` must receive the Pusher event and update both `movements` state and `refreshTotal` state
3. `TotalPanel.tsx` must receive the `refreshCount` update and re-fetch the balance
4. All three payment scenarios must work identically:
   - Single payment (efectivo)
   - Mixed payment (efectivo + another method)
   - Mixed payment (another method + efectivo)

### Proposed Solution

#### Modify `src/actions/sales.ts`

After creating cash movements (around line 180), add Pusher triggers for each movement created:

```typescript
// Store created movements
const createdMovements = [];

if (isTwoMethods) {
  if (total - totalSecondMethodParsed > 0) {
    const m1 = await tx.cashMovement.create({
      data: {
        total: total - totalSecondMethodParsed,
        seller: billState.seller,
        paidMethod: billState.paidMethod || "Efectivo",
        businessId: businessId,
        date: now,
      },
    });
    createdMovements.push(m1);
  }
  if (totalSecondMethodParsed > 0) {
    const m2 = await tx.cashMovement.create({
      data: {
        total: totalSecondMethodParsed,
        seller: billState.seller,
        paidMethod: billState.secondPaidMethod || "Efectivo",
        businessId: businessId,
        date: now,
      },
    });
    createdMovements.push(m2);
  }
} else {
  const m = await tx.cashMovement.create({
    data: {
      total: total,
      seller: billState.seller,
      paidMethod: billState.paidMethod || "Efectivo",
      businessId: businessId,
      date: now,
    },
  });
  createdMovements.push(m);
}

// Trigger Pusher for each movement created
for (const movement of createdMovements) {
  await pusherServer.trigger(
    `movements-${businessId}`,
    "new-movement",
    movement
  );
}
```

### Files to Modify

| File | Changes |
|------|---------|
| `src/actions/sales.ts` | Add `pusherServer.trigger()` calls for each cash movement created in `processSaleAction` |

### Test Case to Add

In `tests/pusher-payment-flow.test.ts`, add verification that `processSaleAction` triggers `new-movement` events for each cash movement created.

---

## Feature: Reset BillParametersForm on Order Creation

### Feature Description

When a user creates an order (Factura or Remito) in `/src/app/(protected)/newBill/page.tsx`, the `BillParametersForm` should automatically reset to its default values:
- `paidMethod`: EFECTIVO
- `clientCondition`: CONSUMIDOR_FINAL
- `discount`: 0
- `twoMethods`: false
- `billType`: C

### Current Behavior

1. User opens `/newBill` page
2. User edits `BillParametersForm` (changes payment method, IVA condition, discount, etc.)
3. User adds products and clicks "Facturar" or "Remito"
4. Order is created successfully via `createSale()` in `BillButtons.tsx`
5. `removeAll()` clears products after success
6. **Bug**: `BillParametersForm` retains the modified values instead of resetting

### Root Cause Analysis

The `BillParametersForm` uses `react-hook-form` with local state (`editParamters`) and updates `BillContext` via `setState()`. After order creation, `removeAll()` is called in `BillButtons.tsx:309` and `BillButtons.tsx:393`, but there's no mechanism to reset the form's local state.

The form maintains its own state independent of `BillContext` - the `form.reset()` method from react-hook-form is never called after order completion.

### Acceptance Criteria

- [ ] After successful order creation (Factura or Remito), `BillParametersForm` resets to default values
- [ ] Form should reset after `removeAll()` is called (within the 5-second timeout)
- [ ] If user cancels the order creation, form should retain current values
- [ ] The `editParamters` state should be `false` after reset

### Proposed Solution

#### Architecture Pattern: Event Callback via Context

Extend the existing `BillContext` pattern to support an `onOrderReset` callback.

#### Implementation Steps

**1. Update `src/context/BillContext.tsx` Interface**

Add new optional callback properties:

```typescript
export default interface BillContextProps {
  // ... existing props
  onOrderReset?: () => void;
  setOnOrderReset?: (callback: (() => void) | null) => void;
}
```

**2. Update `src/context/BillProvider.tsx`**

Add state and handlers for the reset callback:

```typescript
const [onOrderReset, setOnOrderReset] = useState<(() => void) | null>(null);

// In values object:
onOrderReset: onOrderReset,
setOnOrderReset: setOnOrderReset,
```

**3. Update `src/components/Billing/BillParametersForm.tsx`**

Subscribe to the reset callback using `useEffect`, call `form.reset()` and set `setEditParameters(false)`:

```typescript
useEffect(() => {
  if (setOnOrderReset) {
    setOnOrderReset(() => {
      form.reset({
        paidMethod: PaidMethods.EFECTIVO,
        clientCondition: ClientConditions.CONSUMIDOR_FINAL,
        discount: 0,
        twoMethods: false,
        billType: BillTypes.C,
        totalSecondMethod: 0,
        secondPaidMethod: PaidMethods.DEBITO,
      });
      setEditParameters(false);
    });
  }
}, [form, setOnOrderReset]);
```

**4. Update `src/components/Billing/BillButtons.tsx`**

In the Factura confirmation handler (around line 308-310), call the reset callback after `removeAll()`:

```typescript
onSuccess={() => {
  removeAll();
  if (BillState.onOrderReset) {
    BillState.onOrderReset();
  }
}}
```

Apply the same change to the Remito handler (around line 392-394).

### Files to Modify

| File | Changes |
|------|---------|
| `src/context/BillContext.tsx` | Add `onOrderReset` and `setOnOrderReset` to interface |
| `src/context/BillProvider.tsx` | Implement callback state and handlers |
| `src/components/Billing/BillParametersForm.tsx` | Subscribe to callback, call `form.reset()` on trigger |
| `src/components/Billing/BillButtons.tsx` | Invoke callback after successful order |

### Alternative: Direct Ref Approach

Instead of callbacks, use a `useImperativeHandle` pattern to expose a `resetForm()` method from `BillParametersForm`, accessed via ref in the parent page. This requires restructuring `newBill/page.tsx` to manage refs between components.

**Recommendation**: Use the callback approach as it follows existing context patterns, is minimally invasive, keeps components decoupled, and works well with the current component hierarchy.
