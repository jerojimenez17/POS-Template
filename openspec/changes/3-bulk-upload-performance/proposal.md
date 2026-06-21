# Change: bulk-upload-performance

**Source:** C-04 (docs/enhancements/03-cons.md)  
**Phase:** 3 — Data & Architecture  
**Effort:** ~2 days  
**Risk:** Medium  

## Problem

`createProductsBulk()` processes products in a `for...of` loop with individual DB queries per product:
- ~4-5 queries per product
- 1000 products = 4000-5000 sequential queries
- No batch operations

## Scope

`src/actions/stock.ts` (or `src/actions/stock/bulk.ts` after split)

## Solution

1. **Phase 1 — Batch lookups**: Single query for all brands, categories, subcategories
2. **Phase 2 — Batch creates**: `createMany` for new brands/categories
3. **Phase 3 — Batch upserts**: Process products in batches of 100 within `$transaction`

Estimated query reduction: 5000 → ~50 for 1000 products.

## Rollback

Revert to original sequential processing. No data loss risk.

## Affected Files

- `src/actions/stock.ts` — `createProductsBulk()` and `previewProductsBulk()`
