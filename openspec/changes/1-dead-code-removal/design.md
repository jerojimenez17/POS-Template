# Design: dead-code-removal

**Source:** C-17  
**Phase:** 1 — Quick Wins  

## Audit Results

### 1. Commented SeedButton — `newBill/page.tsx`

```typescript
// line 10: // import SeedButton from "@/components/Billing/SeedButton";
// line 36: {/* <SeedButton /> */}
```

Both lines are commented out. Safe to remove.

### 2. Firebase Legacy — Active Files (KEEP)

| File | External Consumer | Reason |
|------|------------------|--------|
| `config.ts` | stock.ts, newProduct.ts, SaleAccordion.tsx, AccountLedgerModal.tsx, AuthContext.tsx, firebaseService.ts | Firebase Storage + Firestore init |
| `orders/newOrder.ts` | `AccountLedgerModal.tsx` | Active discountStock |
| `stock/updateRanking.tsx` | `AccountLedgerModal.tsx` | Active updateMonthlyRanking |
| `stock/getProductsRanking.ts` | `product-ranking.tsx` | Active product ranking |
| `clients/getClient.ts` | `models/OrderFirebaseAdapter.ts` | Active client lookup |

### 3. Firebase Files to DELETE (20 files)

| Directory | Files | Reason |
|-----------|-------|--------|
| `auth/` | logOut.ts, signIn.ts, signUp.ts | No external imports — app uses NextAuth. Firebase auth SDK is still available via `config.ts` for AuthContext if needed |
| `cashMovements/` | newMovement.ts | No external imports |
| `clients/` | newClient.ts | No external imports |
| `orders/` | deleteOrderDoc.tsx, getOrders.ts, getSuppliers.ts | No external imports |
| `stock/` | editProduct.ts, getBrands.ts, getCategories.ts, getProduct.ts, getProductBySearch.ts, getSubCategories.ts, newBrand.ts, newCategory.ts, newProduct.ts, newSubCategory.ts, newSuplier.ts, updateAmount.ts | No external imports |

### 4. Unused Imports

- `src/app/(protected)/newBill/page.tsx` — commented import + JSX (target of R1)
- Other files will be scanned via `tsc --noEmit` after removals

## Execution Plan

### Step 1: Remove commented SeedButton
- Edit `src/app/(protected)/newBill/page.tsx`
- Remove line 10 (commented import) and line 36 (commented JSX)

### Step 2: Delete Firebase legacy files
- Delete 20 files from `src/firebase/` (listed above)
- Remove empty directories after deletions

### Step 3: Remove unused imports
- Run `npx tsc --noEmit` to identify import errors
- Fix any broken imports (restore needed ones)
- Remove remaining unused imports

### Step 4: Verify
- `npx tsc --noEmit` — zero errors
- `npm run build` — success
- `npm run lint` — clean

## Risk Mitigation

- **Over-deletion**: `npx tsc --noEmit` catches missing imports immediately
- **Auth**: If auth file deletion breaks something, `git restore` the file
- **Config preservation**: `config.ts` is explicitly kept for Storage access

## Rollback

```bash
git checkout -b rollback/1-dead-code-removal 1-dead-code-removal
git revert HEAD --no-edit
git push origin rollback/1-dead-code-removal
```
