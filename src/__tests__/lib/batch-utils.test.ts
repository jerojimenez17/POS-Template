import { describe, it, expect, vi } from "vitest";
import { processInBatches } from "@/lib/batch-utils";

describe("processInBatches", () => {
  // AC5: works with empty arrays (no-op)
  it("should do nothing with empty array", async () => {
    const fn = vi.fn();
    await processInBatches([], 10, fn);
    expect(fn).not.toHaveBeenCalled();
  });

  // AC1: processes all items exactly once
  it("should process all items exactly once", async () => {
    const items = [1, 2, 3, 4, 5];
    const calls: number[] = [];

    await processInBatches(items, 10, (item) => {
      calls.push(item);
      return [Promise.resolve()];
    });

    expect(calls).toEqual([1, 2, 3, 4, 5]);
  });

  // AC1 + AC2: with batch size smaller than item count
  it("should process items in batches of specified size", async () => {
    const items = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
    const processed: number[] = [];
    let maxConcurrent = 0;
    let currentConcurrent = 0;

    await processInBatches(items, 5, (item) => {
      currentConcurrent++;
      maxConcurrent = Math.max(maxConcurrent, currentConcurrent);

      return [
        new Promise<void>((resolve) => {
          setTimeout(() => {
            processed.push(item);
            currentConcurrent--;
            resolve();
          }, 5);
        }),
      ];
    });

    // All items should be processed exactly once
    expect(processed.sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    // Each batch should have at most 5 concurrent operations
    expect(maxConcurrent).toBeLessThanOrEqual(5);
  });

  // AC3: preserves order — batch 1 finishes before batch 2 starts
  it("should complete batches sequentially (batch order preserved)", async () => {
    const items = [1, 2, 3, 4, 5, 6];
    const batchTimestamps: number[] = [];

    await processInBatches(items, 3, (item) => {
      return [
        new Promise<void>((resolve) => {
          setTimeout(() => {
            batchTimestamps.push(item);
            resolve();
          }, item === 1 ? 50 : 5); // First item in first batch is slow
        }),
      ];
    });

    // Items 1,2,3 are in batch 1. Item 1 is slow, but items 2,3 can finish fast.
    // However, items 4,5,6 (batch 2) should not start until ALL of batch 1 is done.
    // So items 4,5,6 should have timestamps >= when item 1 finished.
    const batch1MaxIndex = batchTimestamps.indexOf(1) !== -1
      ? batchTimestamps.indexOf(Math.max(...batchTimestamps.slice(0, 3)))
      : 2;
    const batch2MinIndex = batchTimestamps.indexOf(4);

    // All batch 1 items should complete before any batch 2 item starts
    expect(batch2MinIndex).toBeGreaterThan(batch1MaxIndex);
  });

  // AC2: with multiple operations per item
  it("should run multiple operations per item concurrently", async () => {
    const items = ["a", "b"];
    const executedOps: string[] = [];

    await processInBatches(items, 10, (item) => {
      return [
        new Promise<void>((resolve) => {
          executedOps.push(`${item}-op1`);
          resolve();
        }),
        new Promise<void>((resolve) => {
          executedOps.push(`${item}-op2`);
          resolve();
        }),
      ];
    });

    expect(executedOps).toContain("a-op1");
    expect(executedOps).toContain("a-op2");
    expect(executedOps).toContain("b-op1");
    expect(executedOps).toContain("b-op2");
    expect(executedOps.length).toBe(4);
  });

  // AC4: propagates errors
  it("should propagate error when a batch fails", async () => {
    const items = [1, 2, 3, 4, 5];

    await expect(
      processInBatches(items, 2, (item) => {
        if (item === 4) {
          return [Promise.reject(new Error("Batch error"))];
        }
        return [Promise.resolve()];
      }),
    ).rejects.toThrow("Batch error");
  });

  // AC4: error in one item stops subsequent batches
  it("should stop subsequent batches after a batch error", async () => {
    const items = [1, 2, 3, 4, 5, 6, 7, 8];
    const processed: number[] = [];

    await expect(
      processInBatches(items, 3, (item) => {
        if (item === 4) {
          return [Promise.reject(new Error("Fail"))];
        }
        processed.push(item);
        return [Promise.resolve()];
      }),
    ).rejects.toThrow("Fail");

    // Items 1,2,3 should have been processed (first batch)
    expect(processed).toContain(1);
    expect(processed).toContain(2);
    expect(processed).toContain(3);
    // Item 4 fails in batch 2. Items 5,6 are in the SAME batch so they
    // might have already started. But batch 3 [7,8] should NOT be processed.
    expect(processed).not.toContain(7);
    expect(processed).not.toContain(8);
  });

  // Works with a single item
  it("should work with a single item", async () => {
    const items = [42];
    const result: number[] = [];

    await processInBatches(items, 10, (item) => {
      result.push(item);
      return [Promise.resolve()];
    });

    expect(result).toEqual([42]);
  });

  // Works with batch size larger than item count
  it("should process all items in one batch when batchSize > items.length", async () => {
    const items = [1, 2, 3];
    const result: number[] = [];

    await processInBatches(items, 100, (item) => {
      result.push(item);
      return [Promise.resolve()];
    });

    expect(result).toEqual([1, 2, 3]);
  });
});
