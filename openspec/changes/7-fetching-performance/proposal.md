# Change: fetching-performance

**Source:** F3 (docs/enhancements/04-incoming-features.md)  
**Phase:** 7 — New Features  
**Effort:** ~3 days  
**Risk:** Medium  

## Problem

Combined data fetching optimization after caching (Phase 4), pagination (Phase 3), and image optimization (Phase 4) are in place. Now it's time to:
- Add prefetching for high-traffic pages
- Implement streaming with Suspense boundaries
- Optimize waterfall requests with `Promise.all()`
- Add loading skeletons for better perceived performance

## Scope

All data-fetching components and pages.

## Solution

1. **Suspense Boundaries**: Add `Suspense` with skeleton fallbacks for async sections
2. **Prefetching**: Prefetch common queries (active session, products list) on page hover/navigation
3. **Waterfall Elimination**: Audit parallelizable requests and use `Promise.all()`
4. **Loading States**: Add skeleton components for tables, product lists, reports

## Rollback

Remove Suspense boundaries, restore synchronous loading. No data loss.

## Affected Files

- Server Components fetching data
- Layout components
- Loading components (new skeleton components)
