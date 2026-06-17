# Change: billprovider-refactor

**Source:** C-11 (docs/enhancements/03-cons.md)  
**Phase:** 2 — Bundle & Performance  
**Effort:** ~2 days  
**Risk:** Low  

## Problem

`BillProvider.tsx` has 20 individual dispatch wrapper functions, each doing:
```typescript
const addItem = (product: Product) => { dispatch({ type: "addItem", payload: product }); };
const addUnit = (product: Product) => { dispatch({ type: "addUnit", payload: product }); };
// ... 18 more
```

This is verbose boilerplate. Every new action requires a new wrapper.

## Scope

`src/context/BillProvider.tsx`, `src/context/BillContext.tsx`, consumers.

## Solution

1. Expose `dispatch` directly from context instead of 20 wrappers
2. Keep named action creator functions as thin wrappers (or export action types directly)
3. Update consumers to use `dispatch` or simpler pattern

## Rollback

Restore the 20 wrapper functions. Consumer changes are minimal.

## Affected Files

- `src/context/BillProvider.tsx`
- `src/context/BillContext.tsx`
- `src/components/Billing/*.tsx` (consumers)
