import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repositoryRoot = process.cwd();
const migrationSql = readFileSync(
  resolve(repositoryRoot, "prisma/migrations/20260813000000_add_business_qz_tray/migration.sql"),
  "utf8",
);
const schema = readFileSync(resolve(repositoryRoot, "prisma/schema.prisma"), "utf8");

function sqlStatements(sql: string): string[] {
  const withoutComments = sql
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/--[^\r\n]*/g, "");

  return withoutComments
    .split(";")
    .map((statement) => statement.trim().replace(/\s+/g, " "))
    .filter(Boolean);
}

describe("Business.qzTray migration contract (static checkout check)", () => {
  it("contains exactly one ADD COLUMN operation with the expected boolean contract", () => {
    const statements = sqlStatements(migrationSql);

    expect(statements).toHaveLength(1);
    expect(statements[0]).toMatch(
      /^ALTER TABLE "Business" ADD COLUMN "qzTray" BOOLEAN NOT NULL DEFAULT false$/i,
    );
  });

  it("matches the non-null Boolean default in the Business Prisma model", () => {
    const businessModel = schema.match(/model Business\s*\{([\s\S]*?)\n\}/)?.[1] ?? "";

    expect(businessModel).toMatch(/^\s*qzTray\s+Boolean\s+@default\(false\)\s*$/m);
  });
});
