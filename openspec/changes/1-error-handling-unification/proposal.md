# Change: error-handling-unification

**Source:** C-12 (docs/enhancements/03-cons.md)  
**Phase:** 1 — Quick Wins  
**Effort:** ~2 days  
**Risk:** Medium  

## Problem

Three error handling patterns coexist:
- **Throw**: `FeatureAccessError` in auth-gates.ts
- **Return object**: `{ error: "..." }` in most Server Actions
- **Silent**: `return []` / `return null` in getters

This makes error handling unpredictable and client code inconsistent.

## Scope

All Server Actions in `src/actions/` and their consumers.

## Solution

1. Define `ActionResult<T>` type in `src/lib/action-result.ts`
2. Migrate all read actions from `[]`/`null` to `ActionResult`
3. Migrate all mutation actions to consistent `ActionResult`
4. Update client components to handle unified type

## Rollback

Revert the `ActionResult` type definition. Individual action migrations can be reverted per file.

## Affected Files

- `src/actions/*.ts` (all 19 files)
- `src/components/*.tsx` (consumers)
- `src/lib/auth-gates.ts`

## ActionResult Type (draft)

```typescript
export type ActionResult<T = void> =
  | { success: true; data?: T; message?: string }
  | { success: false; error: string; code?: ErrorCode };

export type ErrorCode =
  | "UNAUTHENTICATED"
  | "DELINQUENT"
  | "FORBIDDEN"
  | "LIMIT_EXCEEDED"
  | "NOT_FOUND"
  | "VALIDATION_ERROR"
  | "INTERNAL_ERROR";
```
