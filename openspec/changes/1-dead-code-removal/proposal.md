# Change: dead-code-removal

**Source:** C-17 (docs/enhancements/03-cons.md)  
**Phase:** 1 — Quick Wins  
**Effort:** ~2 days  
**Risk:** Low  

## Problem

The codebase has accumulated dead code:
- Commented `<SeedButton />` in `newBill/page.tsx:36`
- Legacy Firebase files in `src/firebase/stock/`, `orders/`, `clients/` that duplicate Prisma functionality
- Unused imports and unreferenced exports

## Scope

- `src/app/(protected)/newBill/page.tsx` — Remove commented SeedButton
- `src/firebase/` — Audit and remove legacy files that are not actively used
- Various component files — Remove unused imports

## Solution

1. Remove commented code blocks
2. Audit Firebase legacy directory and remove files not referenced anywhere
3. Run `npx tsc --noEmit` to verify no broken imports

## Rollback

`git revert` of the feature branch. No data changes — deletions only.

## Affected Files

- `src/app/(protected)/newBill/page.tsx`
- `src/firebase/stock/newProduct.ts`, `getProduct.ts`, etc. (multiple files)
- `src/firebase/orders/` (multiple files)
- `src/firebase/clients/` (multiple files)
