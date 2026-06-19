# Change: action-files-split

**Source:** C-08 (docs/enhancements/03-cons.md)  
**Phase:** 3 — Data & Architecture  
**Effort:** ~2 days  
**Risk:** Medium  

## Problem

`stock.ts` (854 lines) and `sales.ts` (749 lines) are monoliths containing disparate operations. This causes:
- Difficult code navigation
- Merge conflicts
- Harder testing in isolation
- Cognitive load

## Scope

`src/actions/stock.ts`, `src/actions/sales.ts`, all importers.

## Solution

Split into domain subdirectories:

```
src/actions/stock/
├── products.ts     ← CRUD operations
├── suppliers.ts    ← Supplier CRUD
├── bulk.ts         ← Bulk upload + preview
└── categories.ts   ← Categories, brands, subcategories

src/actions/sales/
├── process.ts      ← processSaleAction
├── returns.ts      ← processReturnAction
├── history.ts      ← getSaleHistory, getSaleById
└── reports.ts      ← getDailyReport, getSalesAction
```

## Rollback

Revert to flat files. Update imports back.

## Affected Files

- `src/actions/stock.ts` — deleted, replaced by directory
- `src/actions/sales.ts` — deleted, replaced by directory
- `src/actions/stock/*.ts` (new files)
- `src/actions/sales/*.ts` (new files)
- All files importing from `stock.ts` or `sales.ts`
