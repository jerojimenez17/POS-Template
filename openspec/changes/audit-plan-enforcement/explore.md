# Exploration: FR-002 — Audit Plan Enforcement

## Current State

The POS system has feature-based plans (BASIC, PRO, ENTERPRISE) stored in `BusinessFeatures` model. Feature gates exist across 3 layers (DB schema, server actions, UI hooks), but enforcement is inconsistent — some features are gated at all layers, others at none.

## Schema Reference (prisma/schema.prisma)

**BusinessFeatures** (line 537-559):
- `plan`: Plan enum (BASIC | PRO | ENTERPRISE), default BASIC
- Feature booleans: `hasAfipBilling`, `hasPublicCatalog`, `hasClientLedger`, `hasMultiCashbox`, `hasSupplierFilter`, `hasBudget`
- Limits: `maxUsers` Int @default(1), `maxProducts` Int @default(100)
- No `PlanDefinition` model exists
- No `maxClients` field exists

**Business** (line 39-93):
- `accountStatus`: BusinessStatus enum (ACTIVO | MOROSO | DESACTIVADO), default ACTIVO
- `lastPaymentDate`: DateTime?

## Server Gate Functions (src/lib/auth-gates.ts)

| Function | What it checks | Gaps |
|----------|---------------|------|
| `assertWritePermission()` | Auth session + `accountStatus === "MOROSO"` | Does NOT check `DESACTIVADO` |
| `requireFeature(f)` | Calls `assertWritePermission` + `features[f]` truthy | If features is null/undefined, **silently passes** (line 26-28) |
| `assertLimit(n, v)` | Calls `assertWritePermission` + `value >= features[n]` | **Only used in tests**, never in production |

## Feature Gate Coverage Matrix

### 1. hasAfipBilling
- **Schema**: ✅ `hasAfipBilling Boolean @default(false)`
- **Server**: ✅ `requireFeature("hasAfipBilling")`
  - `src/actions/sales/process.ts:51` — conditional (only when CAE present)
  - `src/actions/afip.ts:13` — top of action
- **UI**: ✅ `hasFeature("hasAfipBilling")` via `useFeatures` hook in `BillButtons.tsx:678`
- **Verdict**: GATED ✅ — both layers protected

### 2. hasPublicCatalog
- **Schema**: ✅ `hasPublicCatalog Boolean @default(false)`
- **Server**: ⚠️ Direct DB check in `src/actions/catalog.ts:32` — does NOT use `requireFeature`, does NOT check auth/MOROSO
- **UI**: N/A (public-facing endpoint, no UI gate needed)
- **Verdict**: PARTIALLY GATED ⚠️ — functionally works but bypasses standard gate pattern, no MOROSO check

### 3. hasClientLedger
- **Schema**: ✅ `hasClientLedger Boolean @default(false)`
- **Server**: ✅ `requireFeature("hasClientLedger")` in:
  - `src/actions/orders.ts:41` — `createOrder` when paidStatus=inpago
  - `src/actions/orders.ts:298` — `updateOrderPaidStatus` when newStatus=inpago
  - `src/actions/unpaid-orders.ts:91` — `createUnpaidOrder`
- **Server MISSING** ❌ in `src/actions/unpaid-orders.ts` (7 sub-actions):
  - `registerPayment` (line 212) — only checks `auth()`, no requireFeature
  - `cancelUnpaidOrder` (line 277) — only checks `auth()`
  - `addItemsToOrder` (line 441) — only checks `auth()`
  - `updateOrderItem` (line 559) — only checks `auth()`
  - `removeOrderItem` (line 688) — only checks `auth()`
  - `getUnpaidOrders` (line 361) — only checks `auth()`
  - `getClientUnpaidOrder` (line 410) — only checks `auth()`
- **UI**: ✅ `hasFeature("hasClientLedger")` via `useFeatures` hook in `BillButtons.tsx:677`
- **Verdict**: PARTIALLY GATED ⚠️ — main entry points gated, but 7 ledger sub-actions have no gate

### 4. hasMultiCashbox
- **Schema**: ✅ `hasMultiCashbox Boolean @default(false)`
- **Server**: ✅ `requireFeature("hasMultiCashbox")` in:
  - `src/actions/cashbox.ts:40` — creating 2nd+ cashbox
  - `src/actions/cashbox.ts:138` — opening 2nd+ session
- **UI**: ❌ No UI gate (admin-only, no client-side check)
- **Verdict**: GATED ✅ — conditional gates correctly applied

### 5. hasSupplierFilter
- **Schema**: ✅ `hasSupplierFilter Boolean @default(false)`
- **Server**: ❌ **NO requireFeature call exists anywhere**
- **UI**: ⚠️ Direct session access (`session?.user?.business?.features?.hasSupplierFilter`)
  - `src/components/Billing/PrintableTable.tsx:219` — reads directly, NOT using useFeatures
  - `src/components/Billing/ProductSearchBar.tsx:16,41,350` — receives as prop, renders supplier dropdown
- **Verdict**: UNGATED ❌ — only client-side hiding, no server enforcement

### 6. hasBudget
- **Schema**: ✅ `hasBudget Boolean @default(false)`
- **Server**: ❌ **NO requireFeature call in `src/actions/budget.ts:31`** — `createBudgetAction` only checks `auth()`
- **UI**: ⚠️ Direct session access (`session?.user?.business?.features?.hasBudget`)
  - `src/components/Billing/BillButtons.tsx:39` — reads directly, NOT using useFeatures
- **Verdict**: UNGATED ❌ — only client-side hiding, no server enforcement

## Limits Enforcement

| Limit | Schema | Server Enforcement | Used Anywhere |
|-------|--------|-------------------|---------------|
| `maxUsers` | ✅ Int @default(1) | ❌ `assertLimit` never called | Only in superadmin config + auth.ts fallback |
| `maxProducts` | ✅ Int @default(100) | ❌ `assertLimit` never called (only in test file) | Only in superadmin config + auth.ts fallback |
| `maxClients` | ❌ doesn't exist | ❌ | Not tracked at all |

`assertLimit()` is defined in `auth-gates.ts` but **never called in any production action**. It only appears in `tests/actions/security.test.ts:129`.

## Account Status Enforcement

| Status | Server | UI | Notes |
|--------|--------|----|-------|
| `MOROSO` | ✅ `assertWritePermission()` blocks | ✅ `isDelinquent` in useFeatures | But several actions bypass assertWritePermission |
| `DESACTIVADO` | ❌ Not checked anywhere in auth-gates | ❌ | Only business.ts handles it (returns message) |

**Actions that bypass `assertWritePermission`** (use `auth()` directly):
- `processSaleAction` (sales/process.ts:44) — only auth() check
- `processReturnAction` (sales/process.ts:229) — only auth() check
- `updateOrderAction` (sales/process.ts:321) — only auth() check
- `createBudgetAction` (budget.ts:31) — only auth() check
- `registerPayment` (unpaid-orders.ts:212) — only auth() check
- `cancelUnpaidOrder` (unpaid-orders.ts:277) — only auth() check
- `addItemsToOrder` (unpaid-orders.ts:441) — only auth() check
- `updateOrderItem` (unpaid-orders.ts:559) — only auth() check
- `removeOrderItem` (unpaid-orders.ts:688) — only auth() check
- `getUnpaidOrders` (unpaid-orders.ts:361) — only auth() check
- `getClientUnpaidOrder` (unpaid-orders.ts:410) — only auth() check
- `getPublicProductsByBusinessId` (catalog.ts) — no auth check at all
- `getPublicProductById` (catalog.ts) — no auth check at all

## JWT Token Fallbacks (auth.ts:87-98)

When `business.features` is null, the JWT token hardcodes BASIC defaults:
```
plan: Plan.BASIC, hasAfipBilling: false, hasPublicCatalog: false,
hasClientLedger: false, hasMultiCashbox: false, hasSupplierFilter: false,
hasBudget: false, maxUsers: 1, maxProducts: 100
```

This means new businesses without a `BusinessFeatures` record get all features blocked.

## Affected Areas

- `prisma/schema.prisma` — BusinessFeatures model, Plan enum, Business.accountStatus
- `src/lib/auth-gates.ts` — assertWritePermission, requireFeature, assertLimit
- `src/hooks/useFeatures.ts` — client-side feature/limit checking hook
- `src/actions/afip.ts` — hasAfipBilling gate
- `src/actions/sales/process.ts` — hasAfipBilling gate (conditional)
- `src/actions/orders.ts` — hasClientLedger gates
- `src/actions/unpaid-orders.ts` — hasClientLedger gate only in createUnpaidOrder; 7 sub-actions MISSING
- `src/actions/cashbox.ts` — hasMultiCashbox gates, assertWritePermission calls
- `src/actions/catalog.ts` — hasPublicCatalog check (direct DB, not requireFeature)
- `src/actions/budget.ts` — NO hasBudget gate
- `src/actions/stock.ts` — getSuppliersForFilter (NO hasSupplierFilter gate)
- `src/actions/business.ts` — accountStatus business logic
- `src/components/Billing/BillButtons.tsx` — client-side feature checks
- `src/components/Billing/PrintableTable.tsx` — direct features access
- `src/components/Billing/ProductSearchBar.tsx` — supplier filter rendering
- `auth.ts` — JWT token feature fallbacks
- `src/types/next-auth.d.ts` — ExtendedUser type definition

## Approaches for Remediation

1. **Complete the missing server gates** — Add `requireFeature` calls for `hasBudget` and `hasSupplierFilter` to their respective server actions; add `hasClientLedger` gate to 7 unprotected sub-actions; add `assertWritePermission` to all actions that bypass it
2. **Add limit enforcement** — Add `assertLimit` calls to user creation and product creation actions
3. **Fix assertWritePermission gaps** — Add `DESACTIVADO` check; fix null-features silent pass in requireFeature/assertLimit
4. **Standardize public catalog checks** — Migrate catalog.ts to use `requireFeature` pattern
5. **Fix client-side access** — Migrate direct `session.user.business.features` reads to use `useFeatures` hook

## Risks

- Adding gates to un-gated actions (budget, supplier filter, ledger sub-actions) could break existing functionality for PRO/BASIC users currently accessing paid features
- `assertWritePermission` checks MOROSO but not DESACTIVADO — delinquent users are blocked but deactivated users can still operate
- The null-features silent pass in requireFeature/assertLimit means tests without proper session setup won't catch missing features
- No `maxClients` field exists, so client count can't be limited even if desired

## Ready for Proposal

**Yes** — the audit is complete with exact file/line references. Remediation can proceed as multiple focused change proposals.
