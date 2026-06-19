# Change: n-plus-one-fixes

**Source:** C-07 (docs/enhancements/03-cons.md)  
**Phase:** 2 — Bundle & Performance  
**Effort:** ~2 days  
**Risk:** Low  

## Problem

`bulkUpdatePrices` and `bulkUpdateAmounts` in `stock.ts` fetch products individually:

```typescript
// N+1: N individual queries
const products = await Promise.all(
  productIds.map((id) => db.product.findUnique({ where: { id } }))
);
```

This should be a single query: `findMany({ where: { id: { in: productIds } } })`.

## Scope

`src/actions/stock.ts`

## Solution

1. Replace `Promise.all(productIds.map(...findUnique))` with single `findMany`
2. Use `Map<id, product>` for O(1) lookup
3. Audit for same pattern elsewhere

## Rollback

Revert the query changes. Logic is identical — no functional impact.

## Affected Files

- `src/actions/stock.ts` — `bulkUpdatePrices()`, `bulkUpdateAmounts()`
