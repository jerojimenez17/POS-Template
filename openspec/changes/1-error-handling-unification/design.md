# Design: error-handling-unification

**Source:** C-12  
**Phase:** 1 — Quick Wins  

## Audit Results

### Current Patterns

| Pattern | Where | Count |
|---------|-------|-------|
| `throw FeatureAccessError` | `auth-gates.ts` | 3 throw sites |
| `throw new Error(...)` | actions/\*.ts | ~35 throw sites (orders.ts, sales.ts, stock.ts, unpaid-orders.ts, etc.) |
| `return { error: "..." }` | actions/\*.ts | ~100+ return sites (standard pattern for Server Actions) |
| `return []` / `return null` | Various getters | ~10+ sites |

### ActionResult<T> Definition

```typescript
// src/lib/action-result.ts
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

## Execution Plan

### Phase A: Foundation (step 1)
1. Create `src/lib/action-result.ts` with ActionResult<T> and ErrorCode
2. Add `authResult()` and `errorResult()` helper functions
3. Audit all return types across actions to plan migration

### Phase B: Core migration (step 2-3)
1. Migrate `auth-gates.ts` from throw to return pattern
2. Update all callers of auth-gates (actions that use `assertWritePermission`, `requireFeature`, `assertLimit`)
3. Migrate throw statements in all action files to return ActionResult
4. Standardize silent returns (`[]`/`null` → `{ success: true, data: [] }`)

### Phase C: Consumer updates (step 4)
1. Update client components to handle `ActionResult` discriminated union
2. Replace try/catch with `if (!result.success)` pattern
3. Ensure toast.error is called on failure

### Phase D: Verify
1. `npx tsc --noEmit`
2. `npm run build`
3. `npm run test`

## Key Decisions

### AD-01: Preserve error messages
Keep existing Spanish error messages verbatim. Only change the return shape.

### AD-02: Two helper functions
```typescript
export const ok = <T>(data?: T, message?: string): ActionResult<T> => ({ success: true, data, message });
export const fail = (error: string, code?: ErrorCode): ActionResult<never> => ({ success: false, error, code });
```

### AD-03: auth-gates return type
`assertWritePermission`, `requireFeature`, `assertLimit` now return `ActionResult<User>` instead of `User` / `throw`.

## Rollback

```bash
git checkout -b rollback/1-error-handling-unification 1-error-handling-unification
git revert HEAD --no-edit
```
