import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();

describe("Business print settings schema and migration", () => {
  it("adds a non-nullable qzTray boolean with database default false without changing address", async () => {
    const schema = await readFile(path.join(root, "prisma/schema.prisma"), "utf8");
    const migration = await readFile(
      path.join(root, "prisma/migrations/20260813000000_add_business_qz_tray/migration.sql"),
      "utf8",
    );

    expect(schema).toMatch(/qzTray\s+Boolean\s+@default\(false\)/);
    expect(migration).toMatch(/ADD COLUMN\s+"qzTray"\s+BOOLEAN\s+NOT NULL\s+DEFAULT\s+false/i);
    expect(migration).not.toMatch(/DROP COLUMN\s+"address"/i);
  });

  it("exposes authenticated settings actions with a safe DTO and ADMIN-only update", async () => {
    const source = await readFile(path.join(root, "src/actions/business-print-settings.ts"), "utf8");
    expect(source).toMatch(/getBusinessPrintSettingsAction/);
    expect(source).toMatch(/updateBusinessPrintSettingsAction/);
    expect(source).toMatch(/role\s*!==\s*["']ADMIN["']/);
    expect(source).toMatch(/address.*null/);
    expect(source).not.toMatch(/select[\s\S]*cert[\s\S]*key/);
  });

  it("rejects unauthenticated, cross-business, USER and SUPER_ADMIN writes", async () => {
    const source = await readFile(path.join(root, "src/actions/business-print-settings.ts"), "utf8");
    expect(source).toMatch(/session/);
    expect(source).toMatch(/businessId/);
    expect(source).toMatch(/ADMIN/);
    expect(source).not.toMatch(/SUPER_ADMIN/);
  });
});
