## Exploration: FR-001 — fix-invoice-flow

### 1. Bug Flow Analysis (exact code path with line numbers)

```
ProductsTable.tsx:36  →  <BillButtons ...>  (default import)
BillButtons.tsx:317   →  Button onClick → setOpenFacturaModal(true)
CheckoutModal.tsx:540 →  onConfirm → handleConfirm() → dispatch() → onConfirm()
BillButtons.tsx:496   →  onConfirm → const caeResult = await createSale(true, false)
```

**Inside `createSale(afip=true, isUpdate=false)`** (line 201):
```
Line 240  →  if (afip && !isUpdate)
Line 241  →    caeData = await handleCreateVoucher()
```

**`handleCreateVoucher()`** (line 139):
```
Line 143 →  const resp = await createAfipVoucherAction(BillState)
```

**`createAfipVoucherAction()`** at `src/actions/afip.ts:13`:
```
Line 13 →  const featureResult = await requireFeature("hasBilling")
Line 14 →  if (!featureResult.success) { return { error: featureResult.error } }
         →  RETURNS { error: "Esta función no está habilitada..." }
```

**Back in `handleCreateVoucher()`** (line 145):
```
Line 145 →  if (resp.error) { toast.error(resp.error); return null }
         →  RETURNS null
```

**BUG — Back in `createSale()`** (line 244):
```
Line 244 →  if (isUpdate && orderId) { ... }  ← Bypassed (isUpdate=false)
Line 257 →  await handleSaveSale({
              ...BillState,
              CAE: caeData || localCAE,       ← localCAE is empty {CAE:"", nroComprobante:0, ...}
              totalWithDiscount: totalAmount,
            })
Line 262 →  toast.success("Factura guardada correctamente")  ← Wrong success toast
```

**`handleSaveSale()` → `processSaleAction()`** at `src/actions/sales/process.ts:43`:
```
Line 44  →  const session = await auth()
Line 60  →  const result = await db.$transaction(async (tx) => {
Line 68  →    const order = await tx.order.create({... with CAE: billState.CAE (EMPTY) ...})
Line 100 →    for ... stock decrement, ranking upsert
Line 150 →    cashBox update, cashMovement creation
            })
         →  ORDER SAVED WITH EMPTY CAE, STOCK DECREMENTED, CASH MOVEMENT RECORDED
```

**Back in `createSale()`** (line 264):
```
Line 264 →  return caeData || localCAE  ← returns empty localCAE
```

**Back in CheckoutModal onConfirm** (line 497):
```
Line 497 →  if (!caeResult) { ...  setBlockButton(false); return }
Line 503 →  handlePrint(caeResult, targetWin)  ← Prints with empty CAE
Line 505 →  dispatch({ type: "removeAll", payload: null })  ← CLEARS CART
```

---

### 2. Root Cause

**Primary cause:** `createSale()` at `BillButtons.tsx:201` does NOT check the return value of `handleCreateVoucher()` before proceeding to `handleSaveSale()`. The code structure is:

```typescript
let caeData: CAE | null = null;
if (afip && !isUpdate) {
  caeData = await handleCreateVoucher();  // Returns null on failure
}

// ⚠ NO null check on caeData before this block
if (isUpdate && orderId) {
  // ...
} else {
  await handleSaveSale({
    ...BillState,
    CAE: caeData || localCAE,   // Falls back to empty localCAE
  });
}
```

The `handleCreateVoucher()` function correctly gates the AFIP call and returns `null` on failure (with toast), but the caller in `createSale()` treats `null` as "no AFIP data, continue with local default CAE" rather than "abort entire operation."

**Contributing factor:** `localCAE` is initialized with all empty/default values (line 45):
```typescript
const [localCAE, setLocalCAE] = useState<CAE>({
  CAE: "", nroComprobante: 0, vencimiento: "", qrData: ""
});
```

This means even when `caeData` is null, the `||` fallback produces a "valid" (but empty) CAE object that passes through to the DB.

---

### 3. Existing Defenses and Why They Fail

| Defense | Location | Why It Fails |
|---------|----------|--------------|
| `requireFeature("hasBilling")` | `src/actions/afip.ts:13` | Only gates the AFIP cloud function call. The caller (`createSale`) ignores the failure and continues to `handleSaveSale`. |
| `if (resp.error)` check | `BillButtons.tsx:145` | Correctly returns `null` from `handleCreateVoucher`, but the caller ignores `null` return values. |
| "Facturar" button disabled prop | `BillButtons.tsx:318` | Only checks `hasActiveSession` and `products.length` — NO feature check. |
| `useFeatures()` / `hasFeature("hasAfipBilling")` | `BillButtons.tsx:635` (newer component) | The NEWER `BillButtons` (named export) has correct feature gating but is **NOT USED** — `ProductsTable.tsx:4` imports the default export (`BillButtonsDefault`). |
| No test coverage | N/A | Existing tests at `src/__tests__/actions/processSaleAction.test.ts` (20 tests) only cover billing fields formatting/type checks, not feature gates. `BillButtons` has NO test file for the abort behavior. |

#### Critical Secondary Bug: Feature Name Mismatch

`createAfipVoucherAction` at `src/actions/afip.ts:13` calls `requireFeature("hasBilling")`, but the Prisma schema field at `prisma/schema.prisma:545` is `hasAfipBilling`. This means `features["hasBilling"]` is always `undefined` in production, so the gate ALWAYS returns "FORBIDDEN" — even for users who DO have AFIP billing enabled.

**Impact:** AFIP voucher creation via the server action has literally never worked in production through this code path. The existing test at `tests/actions/security.test.ts:139-154` passes because it mocks `hasBilling: false` directly, creating a self-consistent but misleading test (the mock key matches the wrong key in the production code).

---

### 4. Fix Recommendations

#### 4A. Client-side abort (CRITICAL — PRIMARY FIX)

**Where:** `src/components/Billing/BillButtons.tsx` — inside `createSale()`, after line 241.

**What:** Add a null check on `caeData` immediately after `handleCreateVoucher()` returns:

```typescript
let caeData: CAE | null = null;
if (afip && !isUpdate) {
  caeData = await handleCreateVoucher();
}

// NEW: Abort if AFIP feature is disabled
if (afip && !caeData) {
  setBlockButton(false);
  setOpenFeatureBlockedModal(true);  // New state
  return undefined;
}
```

**Why before line 244:** The current code enters the `if (isUpdate && orderId)` branch at line 244. The abort check must come BEFORE that to prevent both update and save paths.

**UI feedback:** Show a blocking modal (`Dialog` already imported) with title "Funcionalidad no disponible" and message "Esta función no está habilitada en tu plan actual. Contactanos vía WhatsApp para activarla." — matching the existing pattern in the codebase.

#### 4B. Server-side gate (DEFENSE-IN-DEPTH)

**Where:** `src/actions/sales/process.ts` — after the `businessId` check (line 46), before `try` block (line 48).

**What:** Add a conditional feature gate that only checks when the payload includes CAE data:

```typescript
import { requireFeature } from "@/lib/auth-gates";

// After: if (!businessId) return { error: "No autorizado" };
// Before: try {
if (billState.CAE) {
  const featureCheck = await requireFeature("hasAfipBilling");  // ← CORRECT FEATURE NAME
  if (!featureCheck.success) {
    return { error: featureCheck.error || "Esta función no está habilitada en tu plan actual." };
  }
}
```

**Why conditional:** Sales without CAE (remitos/A-cuenta) should NOT be blocked — only invoiced sales that include CAE data need the feature. The `billState.CAE` object is the clearest signal of an invoiced sale.

#### 4C. Fix Feature Name in `createAfipVoucherAction` (SECONDARY FIX)

**Where:** `src/actions/afip.ts:13`

**What:** Change `requireFeature("hasBilling")` → `requireFeature("hasAfipBilling")`

This is technically a separate bug, but it blocks the ENTIRE AFIP billing feature for all users. Without this fix, even if the client-side abort and server-side gate work, no user can actually create AFIP vouchers.

#### 4D. Migrate ProductsTable to use the new BillButtons (OPTIMIZATION)

**Where:** `src/components/Billing/ProductsTable.tsx:4` and `BillButtons.tsx`

**What:** Change import from default (`BillButtonsDefault`) to the named `BillButtons` export, which already has proper `useFeatures()` checks. This would require wiring `onStandardCheckout`, `onLedgerCheckout`, and `onAfipCheckout` callbacks.

**Risk:** The new `BillButtons` has a completely different UI (3-card layout vs single row of buttons) — this is a UX change, not a bug fix. Defer to a separate task.

---

### 5. Test Plan

#### Unit / Integration Tests for `processSaleAction` gate

**File:** `src/__tests__/actions/processSaleAction.test.ts`

Add a new describe block with 3 tests:

1. **Feature disabled + CAE present → returns error, no DB write**
   - Mock `requireFeature` to return `{ success: false, error: "...", code: "FORBIDDEN" }`
   - Call `processSaleAction` with valid CAE in payload
   - Assert: `result.error` exists, `db.$transaction` NOT called

2. **Feature enabled + CAE present → sale persists**
   - Mock `requireFeature` to return `{ success: true, data: {...} }`
   - Call `processSaleAction` with valid CAE in payload
   - Assert: `result.success` is true, `db.$transaction` WAS called

3. **Feature disabled + no CAE (remito) → sale persists**
   - Mock `requireFeature` to return `{ success: false }`
   - Call `processSaleAction` without CAE
   - Assert: `result.success` is true, `db.$transaction` WAS called (gate skipped)

#### Component Tests for `BillButtons` abort

**File:** `src/__tests__/components/BillButtons.test.tsx` (new file)

Two tests:

1. **Gate fails → `processSaleAction` NOT called**
   - Mock `createAfipVoucherAction` → `{ error: "..." }`
   - Trigger Facturar flow
   - Assert: `processSaleAction` not called, cart intact

2. **Gate passes → `processSaleAction` called**
   - Mock `createAfipVoucherAction` → valid CAE data
   - Trigger Facturar flow
   - Assert: `processSaleAction` called, cart cleared

#### Update Existing Security Tests

**File:** `tests/actions/security.test.ts`

- Fix the mock to use `hasAfipBilling` instead of `hasBilling` (or update to match the production feature name)
- Add a test case for the new `processSaleAction` server-side gate

---

### 6. Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `src/components/Billing/BillButtons.tsx` | Modify | Add null check + abort in `createSale()` after `handleCreateVoucher()`, add `openFeatureBlockedModal` state + Dialog |
| `src/actions/sales/process.ts` | Modify | Add conditional `requireFeature("hasAfipBilling")` gate before `db.$transaction` |
| `src/actions/afip.ts` | Modify | Fix feature name: `requireFeature("hasBilling")` → `requireFeature("hasAfipBilling")` |
| `src/__tests__/actions/processSaleAction.test.ts` | Add tests | 3 tests for server-side gate with different scenarios |
| `src/__tests__/components/BillButtons.test.tsx` | New file | 2 tests for client-side abort behavior |
| `tests/actions/security.test.ts` | Modify | Fix mock to use `hasAfipBilling` instead of `hasBilling` |

---

### 7. Previously Archived Design (relevant context)

An archived SDD change exists at `openspec/changes/archive/2026-06-25-fix-invoice-flow/` containing a complete proposal, spec, design, tasks, and verification report. The verification report states **24 tests passed** and **5/5 scenarios compliant**, but the actual source code was never modified. The archive provides:

- **Design doc**: Two-layer defense (client abort + server gate), decisions on conditional gate vs unconditional, inline Dialog vs FeatureBlockedModal
- **Spec**: 5 scenarios (A-E) covering disabled/enabled feature, direct API calls, and remito bypass
- **Tasks**: T1 (client abort), T2 (server gate), T3 (processSaleAction tests), T4 (BillButtons tests)
- **Verify report**: All tasks complete, 24 tests pass

**Design decision from archive:** Use inline `Dialog` (already imported in BillButtons.tsx) instead of `<FeatureBlockedModal>` (which doesn't exist yet). Conditional gate on `billState.CAE` only, not on `clientIvaCondition`.

**Note:** The archived design uses `requireFeature("hasBilling")` in both the server-side gate and the existing AFIP action. The exploration found this to be a bug — the correct feature name is `hasAfipBilling`.
