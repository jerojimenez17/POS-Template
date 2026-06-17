# Tasks: dead-code-removal

**Source:** C-17  
**Phase:** 1 — Quick Wins  

## Task Breakdown

### Task 1: Remove commented SeedButton
- **Files**: `src/app/(protected)/newBill/page.tsx`
- **Action**: Remove commented import (line 10) and commented JSX (line 36)
- **Verification**: Visual check — no commented code remains
- **Commit message**: `chore(newBill): remove commented SeedButton code`

### Task 2: Delete Firebase legacy files (20 files)
- **Files**:
  - `src/firebase/auth/logOut.ts`, `signIn.ts`, `signUp.ts`
  - `src/firebase/cashMovements/newMovement.ts`
  - `src/firebase/clients/newClient.ts`
  - `src/firebase/orders/deleteOrderDoc.tsx`, `getOrders.ts`, `getSuppliers.ts`
  - `src/firebase/stock/editProduct.ts`, `getBrands.ts`, `getCategories.ts`, `getProduct.ts`, `getProductBySearch.ts`, `getSubCategories.ts`, `newBrand.ts`, `newCategory.ts`, `newProduct.ts`, `newSubCategory.ts`, `newSuplier.ts`, `updateAmount.ts`
- **Action**: Delete each file; remove empty parent directories after
- **Verification**: `npx tsc --noEmit` passes (ensures no dangling imports from outside)
- **Commit message**: `chore(firebase): remove 20 legacy Firebase files with zero external references`

### Task 3: Clean up unused imports
- **Files**: Scan the codebase for remaining unused imports
- **Action**: Remove unused import declarations across all affected files
- **Precaution**: Verify each removal isn't a type-only import; restore if `tsc` complains
- **Verification**: `npx tsc --noEmit` passes
- **Commit message**: `chore: remove unused imports across codebase`

### Task 4: Final verification
- **Actions**:
  - `npx tsc --noEmit` — zero type errors
  - `npm run build` — successful production build
  - `npm run lint` — clean lint output
- **Verification**: All three pass with zero errors

## Workload Forecast

- Total changed lines: ~0 (deletions only — files removed, no new code)
- Review risk: **Low** — pure deletions, safe rollback
- Delivery strategy: `single-pr` (all tasks in one branch, one PR)
- Commit strategy: 3 work-unit commits → 1 PR

## Commit Strategy

| # | Scope | Message | Files |
|---|-------|---------|-------|
| 1 | newBill | `chore(newBill): remove commented SeedButton code` | 1 file |
| 2 | firebase | `chore(firebase): remove 20 legacy Firebase files` | 20 files |
| 3 | misc | `chore: remove unused imports across codebase` | various |
