# Change: firebase-migration

**Source:** C-02 (docs/enhancements/03-cons.md)  
**Phase:** 6 — Legacy & UX  
**Effort:** ~3 days  
**Risk:** High  

## Problem

The `src/firebase/` directory contains legacy code that duplicates Prisma functionality:
- `src/firebase/stock/` — newProduct, getProduct, editProduct, etc.
- `src/firebase/orders/` — newOrder, getOrders
- `src/firebase/clients/` — newClient, getClient

Some of these may still be referenced from older components. Firebase Storage (for images) MUST be preserved.

## Scope

`src/firebase/` directory (excluding `config.ts` and Storage-related code).

## Solution

1. Audit every file in `src/firebase/` for active references
2. Document which files are actively used vs legacy
3. Remove all files with zero active references
4. For any actively-used Firebase code, migrate logic to Prisma equivalents
5. Keep `src/firebase/config.ts` for Firebase Storage access only
6. Clean up `src/firebase/auth/` if using NextAuth exclusively

## Rollback

Restore deleted files from git. No data migration needed.

## Affected Files

- `src/firebase/stock/*.ts` (multiple files)
- `src/firebase/orders/*.ts` (multiple files)
- `src/firebase/clients/*.ts`
- `src/firebase/cashMovements/*.ts`
- `src/firebase/auth/*.ts`
- `src/firebase/config.ts` (preserve)
