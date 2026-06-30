# SPEC: Fix Transaction Failures with 25+ Products

## Problem Statement

When creating a Remito (via `processSaleAction`) or an "A cuenta" order (via `createUnpaidOrder` / `addItemsToOrder`), the transaction fails with `"An unexpected response was received from the server"` when the bill contains **25 or more distinct products**.

The same products work correctly when creating a Presupuesto (via `createBudgetAction`).

## Root Cause

Inside a Prisma interactive transaction, `Promise.all` fires **N × 3** simultaneous database queries (product.update + stockMovement.create + productRanking.upsert for each product). With 25+ products, this results in 75+ concurrent queries over a single PostgreSQL connection, which overwhelms the connection.

## Solution

Extract a reusable `processInBatches` helper that splits items into chunks of a configurable `batchSize` (default 10). Each batch runs its queries in parallel via `Promise.all`, but batches execute sequentially via `for...of`.

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

### R3: Fix `createUnpaidOrder`

- Replace the `Promise.all` block with `processInBatches`
- Default batch size: 10

### R4: Fix `addItemsToOrder`

- Replace the `Promise.all` block with `processInBatches`
- Default batch size: 10

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
| `src/actions/sales/process.ts` | MODIFY — use `processInBatches` |
| `src/actions/unpaid-orders.ts` | MODIFY — use `processInBatches` in 2 places |
| `src/__tests__/lib/batch-utils.test.ts` | NEW — unit tests |
