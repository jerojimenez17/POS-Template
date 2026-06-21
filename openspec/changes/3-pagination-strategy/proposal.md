# Change: pagination-strategy

**Source:** C-03 (docs/enhancements/03-cons.md)  
**Phase:** 3 — Data & Architecture  
**Effort:** ~3 days  
**Risk:** High  

## Problem

Several queries return unbounded datasets:
- `getProducts()` returns ALL products — dangerous for 50k+ inventories
- `getSalesAction()` has hardcoded `take: 1100`
- `getProductsBySearch()` has hardcoded `take: 20`
- No cursor-based pagination for large historical queries

## Scope

`src/actions/stock.ts`, `src/actions/sales.ts`, components consuming these.

## Solution

1. Remove `getProducts()` — replace callers with `getProductsPaginated()`
2. Implement cursor-based pagination for sales/orders queries
3. Move magic numbers to constants file (`src/lib/constants.ts`)
4. Add pagination UI components (load more, page navigation)

## Rollback

Revert paginated queries, restore original function signatures.

## Affected Files

- `src/actions/stock.ts` — `getProducts()`, `getProductsBySearch()`
- `src/actions/sales.ts` — `getSalesAction()`
- `src/lib/constants.ts` (new)
- Components consuming these actions
