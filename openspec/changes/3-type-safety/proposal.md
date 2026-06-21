# Change: type-safety

**Source:** C-09 (docs/enhancements/03-cons.md)  
**Phase:** 3 — Data & Architecture  
**Effort:** ~2 days  
**Risk:** Low  

## Problem

TypeScript safety violations that disable the type system:
- `@ts-expect-error` in `cashbox.ts:127` — session.user.cashboxId not typed
- `as unknown as BillState` in `sales.ts:457,508` — cast forcing incompatible types
- `as any` in `auth.ts:69` — token.business cast to any

## Scope

`src/types/next-auth.d.ts`, `cashbox.ts`, `sales.ts`, `auth.ts`

## Solution

1. Extend NextAuth type declarations in `next-auth.d.ts` to include `cashboxId`
2. Fix `BillState` type to match actual DB return shape
3. Replace `as any` with proper typed interface for `token.business`

## Rollback

Revert type declarations. Only type-level changes — no runtime impact.

## Affected Files

- `src/types/next-auth.d.ts`
- `src/actions/cashbox.ts`
- `src/actions/sales.ts`
- `auth.ts`
