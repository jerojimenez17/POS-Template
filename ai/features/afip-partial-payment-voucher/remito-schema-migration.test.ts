import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const repositoryRoot = process.cwd();
const PAYMENT_VOUCHER_BASE_COMMIT = "7756eb0";
const PAYMENT_VOUCHER_BASE_MIGRATION = "20261104000000_add_payment_vouchers";

function normalizeLineEndings(value: string): string {
  return value.replace(/\r\n/g, "\n");
}

function migrationSql(): string {
  const migrationsDirectory = resolve(repositoryRoot, "prisma/migrations");
  return readdirSync(migrationsDirectory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const migrationFile = join(migrationsDirectory, entry.name, "migration.sql");
      try {
        return readFileSync(migrationFile, "utf8");
      } catch {
        return "";
      }
    })
    .join("\n");
}

function separateMigrationEntries(): Array<{ name: string; sql: string }> {
  return readdirSync(resolve(repositoryRoot, "prisma/migrations"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name !== PAYMENT_VOUCHER_BASE_MIGRATION)
    .filter((entry) => existsSync(join(repositoryRoot, "prisma/migrations", entry.name, "migration.sql")))
    .map((entry) => ({
      name: entry.name,
      sql: readFileSync(join(repositoryRoot, "prisma/migrations", entry.name, "migration.sql"), "utf8"),
    }));
}

describe("Remito payment-voucher persistence contract", () => {
  it("keeps the published payment-voucher base migration immutable", () => {
    const baseMigrationPath = resolve(repositoryRoot, "prisma/migrations", PAYMENT_VOUCHER_BASE_MIGRATION, "migration.sql");
    const checkedInBase = readFileSync(baseMigrationPath, "utf8");
    const committedBase = execFileSync("git", ["show", `${PAYMENT_VOUCHER_BASE_COMMIT}:prisma/migrations/${PAYMENT_VOUCHER_BASE_MIGRATION}/migration.sql`], {
      cwd: repositoryRoot,
      encoding: "utf8",
    });

    expect(normalizeLineEndings(checkedInBase)).toBe(normalizeLineEndings(committedBase));
  });

  it("adds NOT_REQUIRED with ALTER TYPE ... ADD VALUE IF NOT EXISTS in a later migration", () => {
    const migrationEntries = separateMigrationEntries();

    expect(migrationEntries.some(({ name, sql }) => name > PAYMENT_VOUCHER_BASE_MIGRATION
      && /ALTER\s+TYPE\s+"PaymentVoucherStatus"\s+ADD\s+VALUE\s+IF\s+NOT\s+EXISTS\s+'NOT_REQUIRED'/i.test(sql))).toBe(true);
  });

  it("defines NOT_REQUIRED in the payment voucher schema and current generated Prisma client, but not in attempt statuses", async () => {
    const schema = readFileSync(resolve(repositoryRoot, "prisma/schema.prisma"), "utf8");
    const voucherStatuses = schema.match(/enum PaymentVoucherStatus\s*\{([^}]*)\}/)?.[1] ?? "";
    const attemptStatuses = schema.match(/enum PaymentVoucherAttemptStatus\s*\{([^}]*)\}/)?.[1] ?? "";
    const generatedClient = await import("@prisma/client");
    const generatedStatuses = generatedClient.PaymentVoucherStatus as Record<string, string>;

    expect(voucherStatuses.split(/\s+/)).toContain("NOT_REQUIRED");
    // This deliberately checks the installed generated client, not a hand-written test enum.
    // If it is stale, the failure identifies the client that must be regenerated.
    expect(generatedStatuses.NOT_REQUIRED, "Generated Prisma client is stale: PaymentVoucherStatus.NOT_REQUIRED is missing; run prisma generate").toBe("NOT_REQUIRED");
    expect(attemptStatuses.split(/\s+/)).not.toContain("NOT_REQUIRED");
  });

  it("keeps Remito AFIP fields nullable and does not fabricate voucher, attempt, or CAE records in a migration", () => {
    const schema = readFileSync(resolve(repositoryRoot, "prisma/schema.prisma"), "utf8");
    const migrations = migrationSql();
    const paymentVoucher = schema.match(/model PaymentVoucher\s*\{([^}]*)\}/)?.[1] ?? "";

    expect(paymentVoucher).toMatch(/afipVoucherType\s+Int\?/);
    expect(paymentVoucher).toMatch(/invoiceNumber\s+Int\?/);
    expect(paymentVoucher).toMatch(/invoicePointOfSale\s+Int\?/);
    expect(paymentVoucher).toMatch(/cae\s+String\?/);
    expect(paymentVoucher).toMatch(/issuedAt\s+DateTime\?/);
    expect(paymentVoucher).toMatch(/fiscalSnapshot\s+Json\?/);
    expect(migrations).not.toMatch(/INSERT\s+INTO\s+"PaymentVoucher(?:Attempt)?"/i);
    expect(migrations).not.toMatch(/UPDATE\s+"PaymentVoucher"[\s\S]*?"cae"\s*=/i);
  });
});
