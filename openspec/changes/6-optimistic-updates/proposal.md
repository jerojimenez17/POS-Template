# Change: optimistic-updates

**Source:** C-05 (docs/enhancements/03-cons.md), F4 (Performance General)  
**Phase:** 6 — Legacy & UX  
**Effort:** ~3 days  
**Risk:** Medium  

## Problem

Billing cart operations require full server roundtrip before UI updates. Each product add, quantity change, or removal must:
1. Dispatch to context (fast)
2. Call Server Action (slow)
3. Wait for response
4. Update UI

This creates perceived latency in the most critical user flow.

## Scope

`src/context/BillProvider.tsx`, `src/context/BillReducer.ts`, `src/components/Billing/`

## Solution

1. Update UI state optimistically on user action
2. Queue Server Action in background
3. On success: no-op (already updated)
4. On error: rollback UI state + show error toast

Use `useOptimistic` hook (React 19) or manual optimistic pattern in the reducer.

```typescript
// Flow:
// 1. User clicks "add product"
// 2. dispatch({ type: "addItem", payload }) → immediate UI update
// 3. processSaleAction() called in background
// 4. If error: dispatch({ type: "rollback", payload: previousState })
```

## Rollback

Revert to synchronous dispatch-only pattern.

## Affected Files

- `src/context/BillProvider.tsx`
- `src/context/BillReducer.ts`
- `src/components/Billing/ProductsTable.tsx`
- `src/components/Billing/BillButtons.tsx`
