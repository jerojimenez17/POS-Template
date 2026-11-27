import { Prisma } from "@prisma/client";

// Minimum interface needed from the transaction client for bulkUpdateStock
interface TransactionClient {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  $executeRaw: (...args: any[]) => Promise<number>;
}

/**
 * Utility to process an array of items in sequential batches,
 * running each item's operations in parallel within a batch.
 *
 * This prevents overwhelming a Prisma interactive transaction connection
 * by limiting the number of concurrent queries to `batchSize * operationsPerItem`.
 *
 * @param items     - Array of items to process
 * @param batchSize - Max number of items to process concurrently per batch
 * @param fn        - Function that returns an array of Promises for each item
 */
export async function processInBatches<T>(
  items: T[],
  batchSize: number,
  fn: (item: T) => Promise<unknown>[],
): Promise<void> {
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    await Promise.all(batch.flatMap(fn));
  }
}

/**
 * FASE 2: Bulk-update product stock using a single raw SQL query.
 * Replaces N individual `product.update` calls with 1 query.
 *
 * `changes` is an array of { id, change } where change is:
 *   - NEGATIVE for decrement (sale)   → amount = amount + (-N)
 *   - POSITIVE for increment (return) → amount = amount + (+N)
 *
 * Usage inside an interactive transaction:
 *   await bulkUpdateStock(tx, products.map(p => ({ id: p.id, change: -p.amount })));
 *
 * @param tx      - Prisma interactive transaction client
 * @param changes - Array of { id, change } to apply
 */
export async function bulkUpdateStock(
  tx: TransactionClient,
  changes: { id: string; change: number }[]
): Promise<void> {
  if (changes.length === 0) return;

  const values = changes.map(c =>
    Prisma.sql`(${c.id}, ${c.change})`
  );

  await tx.$executeRaw`
    UPDATE "Product" AS p
    SET "amount" = p.amount + v.change,
        "last_update" = NOW()
    FROM (VALUES ${Prisma.join(values)}) AS v(id, change)
    WHERE p.id = v.id
  `;
}
