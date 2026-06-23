# Budget (Presupuesto) — Test Checklist

## AC-1: Superadmin can toggle `hasBudget` on/off per business
- [ ] **Positive:** Superadmin sees `hasBudget` toggle on business features page
- [ ] **Positive:** Toggling `hasBudget` ON saves `true` to BusinessFeatures
- [ ] **Positive:** Toggling `hasBudget` OFF saves `false` to BusinessFeatures
- [ ] **Negative:** Non-superadmin does NOT see the `hasBudget` toggle
- [ ] **Edge:** After saving, page refreshes and reflects the persisted value

## AC-2: When `hasBudget` is ON, a "Presupuesto" button appears in BillButtons
- [ ] **Positive:** `session.user.business.features.hasBudget === true` → button renders
- [ ] **Positive:** Button label reads "Presupuesto"
- [ ] **Negative:** Button does NOT render when `hasBudget` is OFF
- [ ] **Edge:** Button renders correctly after a session refresh with new features

## AC-3: When `hasBudget` is OFF, the button is hidden
- [ ] **Positive:** `hasBudget === false` → no budget button in DOM
- [ ] **Positive:** `hasBudget === undefined/null` → no budget button in DOM
- [ ] **Edge:** Rapid toggle OFF → button disappears without page reload

## AC-4: Clicking "Presupuesto" without products shows disabled state
- [ ] **Positive:** `products.length === 0` → button is `disabled`
- [ ] **Positive:** Disabled button has `cursor-not-allowed` / muted styling
- [ ] **Negative:** `products.length > 0` → button is enabled
- [ ] **Edge:** Products added then all removed → button becomes disabled again

## AC-5: Clicking "Presupuesto" with products opens confirmation dialog
- [ ] **Positive:** Click enabled "Presupuesto" → confirmation dialog opens
- [ ] **Positive:** Dialog title confirms budget creation intent
- [ ] **Positive:** Dialog has Confirm and Cancel buttons
- [ ] **Negative:** Cancel closes dialog, no action performed
- [ ] **Edge:** Pressing Escape key closes dialog without creating budget

## AC-6: On confirm, budget order is created with status "pendiente"
- [ ] **Positive:** `db.order.create` called with `status: "pendiente"`
- [ ] **Positive:** `db.order.create` called with `paidStatus: "inpago"`
- [ ] **Positive:** Order has correct products, total, seller
- [ ] **Positive:** Returned data includes the new order ID
- [ ] **Negative:** Calling action without auth → throws / returns error
- [ ] **Edge:** Very large product list still creates successfully

## AC-7: Creating a budget does NOT decrement stock
- [ ] **Positive:** `db.stockMovement.create` is NOT called
- [ ] **Negative:** Confirm by comparing with sale action which DOES call it
- [ ] **Edge:** Products with `trackStock: true` are also not decremented

## AC-8: Creating a budget does NOT require an open cash session
- [ ] **Positive:** `createBudgetAction` succeeds without any cash session
- [ ] **Negative:** Sale action without cash session fails
- [ ] **Edge:** Budget created while cash session is also active (no conflict)

## AC-9: Creating a budget does NOT create cash movements
- [ ] **Positive:** `db.cashMovement.create` is NOT called
- [ ] **Positive:** No cashbox balance update occurs
- [ ] **Edge:** Budget with `total > 0` still skips cash movements

## AC-10: Budget appears in account-ledger under "Por Confirmar" tab
- [ ] **Positive:** Budget order with `status: "pendiente"` shows in ledger query
- [ ] **Positive:** Ledger list distinguishes budgets from confirmed orders
- [ ] **Negative:** Orders with `status: "confirmado"` do NOT appear in budgets tab
- [ ] **Edge:** Business-scoped query — budgets from other businesses are hidden

## AC-11: Budget can be printed at creation time with "Presupuesto" label
- [ ] **Positive:** `getBillTypeDisplay("Presupuesto")` returns "Presupuesto"
- [ ] **Positive:** Print handler receives `billType: "Presupuesto"`
- [ ] **Negative:** Existing bill types (Remito, Factura) are unaffected
- [ ] **Edge:** Budget print reuses same thermal-print flow as other bill types

## AC-12: From account-ledger list, each row has a print button
- [ ] **Positive:** Each pending-order row renders a print icon/button
- [ ] **Positive:** Clicking print button opens print dialog
- [ ] **Negative:** Confirmed orders in list do NOT show budget print button
- [ ] **Edge:** Print button handles orders with no client gracefully

## AC-13: From account-ledger detail, there is a print button
- [ ] **Positive:** Single order detail page shows a print button
- [ ] **Positive:** Print button calls `PrintOptionsPopover` with converted BillState
- [ ] **Negative:** Non-budget orders still show their own print mechanism
- [ ] **Edge:** Order detail print works with and without `clientId`
