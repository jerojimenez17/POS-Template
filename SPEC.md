# SPEC: Fix Transaction Failures with 25+ Products

## Problem Statement

When creating a Remito (via `processSaleAction`) or an "A cuenta" order (via `createUnpaidOrder` / `addItemsToOrder`), the transaction fails with `"An unexpected response was received from the server"` when the bill contains **25 or more distinct products**.

The same products work correctly when creating a Presupuesto (via `createBudgetAction`).

## Root Cause (Two Independent Issues)

### Issue 1: Prisma Transaction Overwhelmed (SOLVED)
Inside a Prisma interactive transaction, `Promise.all` fires **N × 3** simultaneous database queries (product.update + stockMovement.create + productRanking.upsert for each product). With 25+ products, this results in 75+ concurrent queries over a single PostgreSQL connection, which overwhelms the connection.

**Fix:** Created `processInBatches` helper that processes in batches of 10, limiting concurrency to 30 operations per batch.

### Issue 2: `auth()` Outside try/catch (SOLVED)
In `process.ts`, the `auth()` call in `processSaleAction` (line 44), `processReturnAction` (line 227), and `updateOrderAction` (line 326) was **outside** the try/catch block. If `auth()` throws (e.g., session deserialization error, DB connection blip), the error propagates as an uncaught exception, which Next.js wraps as `"An unexpected response was received from the server"`.

**Fix:** Moved `try/catch` up to wrap `auth()` in all 3 functions.

### Remaining Hypothesis: Serverless Function Timeout (UNCONFIRMED)
With 30+ products, `processInBatches` runs 3 batches × 30 concurrent queries = 90 DB operations. The total execution time (~10-15s) may exceed the Vercel Hobby default timeout (10s), or the Prisma transaction `maxWait: 10000` (10s to acquire a connection).

**Recommended if deployed on Vercel:** Add `export const maxDuration = 120;` to the Server Action file, or upgrade to a plan with higher timeout limits.

## Solution

Extract a reusable `processInBatches` helper that splits items into chunks of a configurable `batchSize` (default 10). Each batch runs its queries in parallel via `Promise.all`, but batches execute sequentially via `for...of`. Also wrap all pre-business-logic code (including `auth()`) in try/catch.

## Requirements

### R1: `processInBatches` utility

- Create a generic `processInBatches<T>` async function
- Parameters: `items: T[]`, `batchSize: number`, `fn: (item: T) => Promise<unknown>[]`
- Splits `items` into chunks of `batchSize`
- Runs `Promise.all(batch.flatMap(fn))` for each chunk
- Chunks are processed sequentially (for...of / for loop)

### R2: Fix `processSaleAction`

- Replace the `Promise.all` block (stock update + movement + ranking) with `processInBatches`
- Default batch size: 10
- Behavior must be identical — same stock, movement, and ranking records created
- Move `auth()` inside try/catch

### R3: Fix `createUnpaidOrder`

- Replace the `Promise.all` block with `processInBatches`
- Default batch size: 10

### R4: Fix `addItemsToOrder`

- Replace the `Promise.all` block with `processInBatches`
- Default batch size: 10

### R5: Fix `processReturnAction` and `updateOrderAction`

- Move `auth()` inside try/catch in both functions

### R6: Fix `updateOrderStatus` in orders.ts

- Replace sequential `for...of` with `processInBatches` for stock writes

## Acceptance Criteria

| ID | Criteria |
|----|----------|
| AC1 | `processInBatches` processes all items exactly once |
| AC2 | `processInBatches` limits concurrency to `batchSize * operationsPerItem` |
| AC3 | `processInBatches` preserves order — batch 1 finishes before batch 2 starts |
| AC4 | `processInBatches` propagates errors from any batch |
| AC5 | `processInBatches` works with empty arrays (no-op) |
| AC6 | `processSaleAction` works with 1, 10, 25, 50 products |
| AC7 | `createUnpaidOrder` works with 25+ products |
| AC8 | `addItemsToOrder` works with 25+ products |
| AC9 | Budget creation is NOT affected |
| AC10 | `auth()` is inside try/catch in all process.ts Server Actions |

## Data Models & Interfaces

```typescript
// New utility — file: src/lib/batch-utils.ts
export async function processInBatches<T>(
  items: T[],
  batchSize: number,
  fn: (item: T) => Promise<unknown>[]
): Promise<void>;
```

## File Structure

| File | Action |
|------|--------|
| `src/lib/batch-utils.ts` | NEW — batch processing utility |
| `src/actions/sales/process.ts` | MODIFY — use `processInBatches` + move `auth()` inside try/catch |
| `src/actions/unpaid-orders.ts` | MODIFY — use `processInBatches` in 2 places |
| `src/actions/orders.ts` | MODIFY — use `processInBatches` in `updateOrderStatus` |
| `src/__tests__/lib/batch-utils.test.ts` | NEW — 9 unit tests (all pass) |
| `src/__tests__/actions/processSaleAction.test.ts` | EXISTING — 17 tests (all pass after mock fix) |

## Test Results

- `batch-utils.test.ts`: **9/9** passing
- `processSaleAction.test.ts`: **17/17** passing
- Lint: clean on all modified files
- Typecheck: no new errors (pre-existing test mock errors remain)
