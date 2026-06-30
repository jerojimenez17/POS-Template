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
