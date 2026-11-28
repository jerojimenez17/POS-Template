import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const MIGRATIONS = join(process.cwd(), "prisma", "migrations");
const PRIOR_GRANT_MIGRATION = "20261127000000_add_authorized_arca_qr_grant";

describe("additive AuthorizedArcaQrGrant.orderId migration contract", () => {
  it("adds a nullable unique Order FK without rewriting the applied grant migration or backfilling links", async () => {
    const directories = await readdir(MIGRATIONS, { withFileTypes: true });
    const candidates = directories
      .filter((entry) => entry.isDirectory() && entry.name > PRIOR_GRANT_MIGRATION)
      .map((entry) => entry.name);
    const sqlCandidates = await Promise.all(candidates.map(async (directory) => ({
      directory,
      sql: await readFile(join(MIGRATIONS, directory, "migration.sql"), "utf8").catch(() => ""),
    })));
    const additive = sqlCandidates.find(({ sql }) => /AuthorizedArcaQrGrant[\s\S]*?orderId/.test(sql));
    const priorSql = await readFile(join(MIGRATIONS, PRIOR_GRANT_MIGRATION, "migration.sql"), "utf8");
    const schema = await readFile(join(process.cwd(), "prisma", "schema.prisma"), "utf8");

    expect(additive, "a new migration after the applied grant migration must add orderId").toBeDefined();
    expect(priorSql).not.toMatch(/\borderId\b/);
    expect(additive?.sql).toMatch(/ADD COLUMN\s+"orderId"\s+TEXT\b/i);
    expect(additive?.sql).toMatch(/CREATE UNIQUE INDEX[^;]*AuthorizedArcaQrGrant[^;]*orderId/i);
    expect(additive?.sql).toMatch(/FOREIGN KEY\s*\("orderId"\)\s*REFERENCES\s*"Order"\s*\("id"\)/i);
    expect(additive?.sql).not.toMatch(/UPDATE\s+"AuthorizedArcaQrGrant"[\s\S]*?"orderId"\s*=/i);
    expect(schema).toMatch(/model AuthorizedArcaQrGrant \{[\s\S]*?orderId\s+String\?\s+@unique/);
    expect(schema).toMatch(/model Order \{[\s\S]*?authorizedArcaQrGrant\s+AuthorizedArcaQrGrant\?/);
  });
});
