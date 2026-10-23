// @vitest-environment node

import { randomUUID } from "node:crypto";
import { Prisma, PrismaClient } from "@prisma/client";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

const configuredTestUrl = process.env.TEST_DATABASE_URL?.trim();
const developerDatabaseUrl = process.env.DATABASE_URL?.trim();

function databaseIdentity(value: string): string | null {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") return null;
    return `${parsed.hostname.toLowerCase()}:${parsed.port || "5432"}${decodeURIComponent(parsed.pathname)}`;
  } catch {
    return null;
  }
}

function getSkipReason(): string | null {
  if (!configuredTestUrl) return "TEST_DATABASE_URL is not explicitly configured";
  const testIdentity = databaseIdentity(configuredTestUrl);
  if (!testIdentity) return "TEST_DATABASE_URL must be a valid PostgreSQL URL";
  const databaseName = decodeURIComponent(new URL(configuredTestUrl).pathname.slice(1));
  if (!/(^|[-_])(test|testing|qa|disposable)([-_]|$)/i.test(databaseName)) {
    return "TEST_DATABASE_URL database name must identify a disposable test/QA database";
  }
  if (developerDatabaseUrl && testIdentity === databaseIdentity(developerDatabaseUrl)) {
    return "TEST_DATABASE_URL points to the same PostgreSQL database as DATABASE_URL";
  }
  return null;
}

const skipReason = getSkipReason();

interface Deferred<T = void> {
  promise: Promise<T>;
  resolve: (value: T) => void;
}

function deferred<T = void>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

type Operation = "MANUAL_RETURN" | "CREDIT_NOTE";
type OperationResult = "committed" | "reserved" | "conflict";

const ORDER_ID = "qa-order";
const BUSINESS_ID = "qa-business";

describe.skipIf(Boolean(skipReason))(
  `PostgreSQL cross-kind return row-lock race${skipReason ? ` (skipped: ${skipReason})` : ""}`,
  () => {
    let observer: PrismaClient;
    let manualClient: PrismaClient;
    let creditNoteClient: PrismaClient;
    let tableSuffix: string;
    let orderTable: string;
    let returnTable: string;
    let effectsTable: string;
    let balancesTable: string;
    let afipCallCount: number;

    const quoteTable = (name: string) => `"${name}"`;

    beforeAll(async () => {
      // Every client gets the explicit test URL. DATABASE_URL is never used as a fallback.
      const options = { datasources: { db: { url: configuredTestUrl! } } };
      observer = new PrismaClient(options);
      manualClient = new PrismaClient(options);
      creditNoteClient = new PrismaClient(options);
      await Promise.all([observer.$connect(), manualClient.$connect(), creditNoteClient.$connect()]);
    });

    afterAll(async () => {
      await Promise.all([observer?.$disconnect(), manualClient?.$disconnect(), creditNoteClient?.$disconnect()]);
    });

    beforeEach(async () => {
      tableSuffix = randomUUID().replaceAll("-", "");
      orderTable = quoteTable(`qa_order_${tableSuffix}`);
      returnTable = quoteTable(`qa_return_${tableSuffix}`);
      effectsTable = quoteTable(`qa_effect_${tableSuffix}`);
      balancesTable = quoteTable(`qa_balance_${tableSuffix}`);
      afipCallCount = 0;

      // Names are generated from a UUID; all row values below use SQL parameters.
      await observer.$executeRawUnsafe(`CREATE TABLE ${orderTable} ("id" TEXT PRIMARY KEY, "businessId" TEXT NOT NULL)`);
      await observer.$executeRawUnsafe(`CREATE TABLE ${returnTable} ("id" TEXT PRIMARY KEY, "orderId" TEXT NOT NULL, "kind" TEXT NOT NULL, "status" TEXT NOT NULL)`);
      await observer.$executeRawUnsafe(`CREATE TABLE ${effectsTable} ("id" BIGSERIAL PRIMARY KEY, "effect" TEXT NOT NULL)`);
      await observer.$executeRawUnsafe(`CREATE TABLE ${balancesTable} ("id" TEXT PRIMARY KEY, "inventory" INTEGER NOT NULL, "cash" INTEGER NOT NULL)`);
      await observer.$executeRawUnsafe(`INSERT INTO ${orderTable} ("id", "businessId") VALUES ($1, $2)`, ORDER_ID, BUSINESS_ID);
      await observer.$executeRawUnsafe(`INSERT INTO ${balancesTable} ("id", "inventory", "cash") VALUES ($1, 0, 100)`, "product-and-cashbox");
    });

    afterEach(async () => {
      await observer.$executeRawUnsafe(`DROP TABLE IF EXISTS ${effectsTable}, ${returnTable}, ${balancesTable}, ${orderTable}`);
    });

    async function runOperation(
      client: PrismaClient,
      operation: Operation,
      hooks: {
        beforeLock?: (pid: number) => void;
        afterWrites?: (result: OperationResult) => Promise<void>;
      } = {},
    ): Promise<OperationResult> {
      return client.$transaction(async (tx) => {
        const [{ pid }] = await tx.$queryRaw<Array<{ pid: number }>>`SELECT pg_backend_pid() AS pid`;
        hooks.beforeLock?.(pid);

        // Same tenant-scoped, parameterized Order FOR UPDATE contract as production.
        await tx.$queryRawUnsafe(
          `SELECT "id" FROM ${orderTable} WHERE "id" = $1 AND "businessId" = $2 FOR UPDATE`,
          ORDER_ID,
          BUSINESS_ID,
        );
        const currentReturns = await tx.$queryRawUnsafe<Array<{ kind: string; status: string }>>(
          `SELECT "kind", "status" FROM ${returnTable} WHERE "orderId" = $1`,
          ORDER_ID,
        );

        let result: OperationResult;
        if (operation === "MANUAL_RETURN") {
          const creditNoteBlocksManualReturn = currentReturns.some((row) => row.kind === "CREDIT_NOTE"
            && (row.status === "PENDING" || row.status === "AUTHORIZED"));
          if (creditNoteBlocksManualReturn) {
            result = "conflict";
          } else {
            await tx.$executeRaw`INSERT INTO ${PrismaTable(returnTable)} ("id", "orderId", "kind", "status") VALUES (${"manual-return"}, ${ORDER_ID}, ${"MANUAL_RETURN"}, ${"PENDING"})`;
            await tx.$executeRaw`INSERT INTO ${PrismaTable(effectsTable)} ("effect") VALUES (${"return_item"}), (${"stock_movement"}), (${"cash_movement"})`;
            await tx.$executeRaw`UPDATE ${PrismaTable(balancesTable)} SET "inventory" = "inventory" + 1, "cash" = "cash" - 100 WHERE "id" = ${"product-and-cashbox"}`;
            result = "committed";
          }
        } else {
          const manualReturnBlocksCreditNote = currentReturns.some((row) => row.kind === "MANUAL_RETURN"
            && (row.status === "PENDING" || row.status === "AUTHORIZED"));
          if (manualReturnBlocksCreditNote) {
            result = "conflict";
          } else {
            await tx.$executeRaw`INSERT INTO ${PrismaTable(returnTable)} ("id", "orderId", "kind", "status") VALUES (${"credit-note"}, ${ORDER_ID}, ${"CREDIT_NOTE"}, ${"PENDING"})`;
            result = "reserved";
          }
        }

        await hooks.afterWrites?.(result);
        return result;
      });
    }

    async function waitUntilBackendIsBlocked(pid: number): Promise<void> {
      const deadline = Date.now() + 10_000;
      while (Date.now() < deadline) {
        const [activity] = await observer.$queryRaw<Array<{ waitEventType: string | null }>>`
          SELECT wait_event_type AS "waitEventType" FROM pg_stat_activity WHERE pid = ${pid}
        `;
        if (activity?.waitEventType === "Lock") return;
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      throw new Error("Contending PostgreSQL transaction never entered a lock wait");
    }

    async function assertEffects(expected: {
      returnKinds: string[];
      effectCount: number;
      inventory: number;
      cash: number;
      afipCalls: number;
    }): Promise<void> {
      const returns = await observer.$queryRawUnsafe<Array<{ kind: string }>>(`SELECT "kind" FROM ${returnTable} ORDER BY "id"`);
      const effects = await observer.$queryRawUnsafe<Array<{ count: bigint }>>(`SELECT COUNT(*) AS count FROM ${effectsTable}`);
      const [balances] = await observer.$queryRawUnsafe<Array<{ inventory: number; cash: number }>>(
        `SELECT "inventory", "cash" FROM ${balancesTable} WHERE "id" = $1`,
        "product-and-cashbox",
      );

      expect(returns.map((row) => row.kind).sort()).toEqual([...expected.returnKinds].sort());
      expect(Number(effects[0]?.count ?? 0)).toBe(expected.effectCount);
      expect(balances).toEqual({ inventory: expected.inventory, cash: expected.cash });
      expect(afipCallCount).toBe(expected.afipCalls);
    }

    it("lets a committed manual return win without credit-note reservation or AFIP effects", async () => {
      await runWinnerRace("MANUAL_RETURN");
      await assertEffects({ returnKinds: ["MANUAL_RETURN"], effectCount: 3, inventory: 1, cash: 0, afipCalls: 0 });
    }, 30_000);

    it("lets a committed credit-note reservation win without manual-return effects", async () => {
      await runWinnerRace("CREDIT_NOTE");
      await assertEffects({ returnKinds: ["CREDIT_NOTE"], effectCount: 0, inventory: 0, cash: 100, afipCalls: 1 });
    }, 30_000);

    async function runWinnerRace(winner: Operation): Promise<void> {
      const winnerClient = winner === "MANUAL_RETURN" ? manualClient : creditNoteClient;
      const loserClient = winner === "MANUAL_RETURN" ? creditNoteClient : manualClient;
      const releaseWinner = deferred();
      const winnerHasLock = deferred<OperationResult>();
      const loserLockAttempt = deferred<number>();
      let loserPromise: Promise<OperationResult> | undefined;

      const winnerPromise = runOperation(winnerClient, winner, {
        afterWrites: async (result) => {
          winnerHasLock.resolve(result);
          await releaseWinner.promise;
        },
      });

      try {
        const winnerResult = await winnerHasLock.promise;
        expect(winnerResult).toBe(winner === "MANUAL_RETURN" ? "committed" : "reserved");

        const loser: Operation = winner === "MANUAL_RETURN" ? "CREDIT_NOTE" : "MANUAL_RETURN";
        loserPromise = runOperation(loserClient, loser, {
          beforeLock: (pid) => loserLockAttempt.resolve(pid),
        });
        const losingBackendPid = await loserLockAttempt.promise;
        await waitUntilBackendIsBlocked(losingBackendPid);

        releaseWinner.resolve();
        const [winnerOutcome, loserOutcome] = await Promise.all([winnerPromise, loserPromise]);
        expect(winnerOutcome).toBe(winner === "MANUAL_RETURN" ? "committed" : "reserved");
        expect(loserOutcome).toBe("conflict");

        // AFIP is outside the reservation transaction and belongs only to its winner.
        if (winner === "CREDIT_NOTE" && winnerOutcome === "reserved") afipCallCount += 1;
      } finally {
        releaseWinner.resolve();
        await Promise.allSettled([winnerPromise, ...(loserPromise ? [loserPromise] : [])]);
      }
    }
  },
);

function PrismaTable(identifier: string) {
  // Prisma.sql binds values while the identifier is a generated, quoted UUID-based table name.
  return Prisma.raw(identifier);
}
