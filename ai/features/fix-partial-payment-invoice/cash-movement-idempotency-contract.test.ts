import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repositoryRoot = process.cwd();
const schema = readFileSync(resolve(repositoryRoot, "prisma/schema.prisma"), "utf8");
const paymentAction = readFileSync(resolve(repositoryRoot, "src/actions/unpaid-orders.ts"), "utf8");
const idempotencyMigration = readFileSync(
  resolve(repositoryRoot, "prisma/migrations/20261122000000_add_cash_movement_idempotency_key/migration.sql"),
  "utf8",
);

describe("CashMovement idempotency repository contract", () => {
  it("declares the nullable key and matching composite unique constraint in Prisma schema", () => {
    const cashMovementModel = schema.match(/model CashMovement\s*\{([\s\S]*?)\n\}/)?.[1] ?? "";

    expect(cashMovementModel).toMatch(/\bidempotencyKey\s+String\?/);
    expect(cashMovementModel).toMatch(/@@unique\(\[\s*businessId\s*,\s*idempotencyKey\s*\]\)/);
  });

  it("uses the schema's compound unique selector for the durable Prisma lookup", () => {
    const lookup = paymentAction.match(/async function findPaymentByIdempotencyKey[\s\S]*?\n\}/)?.[0] ?? "";

    expect(lookup).toMatch(/findUnique\.call\(delegate,\s*\{[\s\S]*?where:\s*\{\s*businessId_idempotencyKey:\s*\{\s*businessId,\s*idempotencyKey\s*\}/);
  });

  it("adds the queried column and matching unique database index in the checked-in migration", () => {
    expect(idempotencyMigration).toMatch(
      /ALTER\s+TABLE\s+"CashMovement"\s+ADD\s+COLUMN\s+"idempotencyKey"\s+TEXT\s*;/i,
    );
    expect(idempotencyMigration).toMatch(
      /CREATE\s+UNIQUE\s+INDEX\s+"CashMovement_businessId_idempotencyKey_key"\s+ON\s+"CashMovement"\s*\(\s*"businessId"\s*,\s*"idempotencyKey"\s*\)\s*;/i,
    );
  });
});
