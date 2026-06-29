import { PrismaClient, Prisma } from "@prisma/client";
import { PLAN_SEEDS } from "../src/types/plan";

const prisma = new PrismaClient();

// Mapping from old DB column → feature/limit key in PLAN_SEEDS defaults
const FEATURE_FIELDS = [
  "hasAfipBilling",
  "hasPublicCatalog",
  "hasClientLedger",
  "hasMultiCashbox",
  "hasSupplierFilter",
  "hasBudget",
] as const;

const LIMIT_FIELDS = ["maxUsers", "maxProducts"] as const;

async function main() {
  console.log("🚀 Starting plan migration...\n");
  console.log("╔══════════════════════════════════════════════════════════════╗");
  console.log("║  ⚠️  MAKE SURE YOU HAVE A SQL BACKUP BEFORE RUNNING THIS!   ║");
  console.log("║                                                             ║");
  console.log(`║  pg_dump --table="BusinessFeatures" > backup.sql            ║`);
  console.log("╚══════════════════════════════════════════════════════════════╝\n");

  // ── 1. Verify PlanDefinitions exist ──────────────────────────────────
  const planDefs = await prisma.planDefinition.findMany();
  if (planDefs.length === 0) {
    console.error("❌ No PlanDefinitions found in DB.");
    console.error("   Run `npx tsx prisma/seed.ts` (or `npx prisma db seed`) first.\n");
    process.exit(1);
  }
  console.log(`📋 Found ${planDefs.length} PlanDefinitions.`);

  // Build lookup maps: plan name → PlanDefinition id
  const planDefMap = new Map(planDefs.map((p) => [p.name, p]));
  const defaultMap = new Map(PLAN_SEEDS.map((p) => [p.name, p]));

  // ── 2. Read old BusinessFeatures columns via raw SQL ─────────────────
  // These columns still exist in the DB until the new schema is pushed.
  let rows: Record<string, unknown>[];
  try {
    rows = await prisma.$queryRawUnsafe(`
      SELECT id, "businessId", plan,
             "hasAfipBilling", "hasPublicCatalog", "hasClientLedger",
             "hasMultiCashbox", "hasSupplierFilter", "hasBudget",
             "maxUsers", "maxProducts"
      FROM "BusinessFeatures"
    `);
  } catch (err) {
    console.error("❌ Failed to read old BusinessFeatures columns.");
    console.error("   The schema may have already been migrated (columns no longer exist).\n");
    console.error(err);
    process.exit(1);
  }

  console.log(`📊 Found ${rows.length} BusinessFeatures rows to migrate.\n`);

  if (rows.length === 0) {
    console.log("No rows to migrate. Exiting.");
    await prisma.$disconnect();
    return;
  }

  // ── 3. Compute updates for every row ─────────────────────────────────
  const planNameMap: Record<string, string> = {
    BASIC: "BASIC",
    PRO: "PRO",
    ENTERPRISE: "ENTERPRISE",
  };

  const updates: Array<{ id: string; planName: string; overrides: Record<string, unknown> | null }> = [];
  const skipped: string[] = [];
  const errors: Array<{ businessId: string; reason: string }> = [];

  for (const row of rows) {
    const planEnum: string = row.plan;

    // Map old Plan enum value to PlanDefinition name
    const planName = planNameMap[planEnum];
    if (!planName) {
      errors.push({ businessId: row.businessId, reason: `Unknown plan enum: ${planEnum}` });
      continue;
    }

    const planDef = planDefMap.get(planName);
    if (!planDef) {
      errors.push({ businessId: row.businessId, reason: `No PlanDefinition for: ${planName}` });
      continue;
    }

    const defaults = defaultMap.get(planName);
    if (!defaults) {
      errors.push({ businessId: row.businessId, reason: `No PLAN_SEEDS entry for: ${planName}` });
      continue;
    }

    // Build overrides: only fields that differ from plan defaults
    const overrides: Record<string, unknown> = {};

    for (const field of FEATURE_FIELDS) {
      const dbValue = row[field];
      const defaultVal = defaults.features[field];
      if (dbValue !== defaultVal) {
        overrides[field] = dbValue;
      }
    }

    for (const field of LIMIT_FIELDS) {
      const dbValue = row[field];
      const defaultVal = defaults.limits[field];
      if (dbValue !== defaultVal) {
        overrides[field] = dbValue;
      }
    }

    updates.push({
      id: row.id,
      planName,
      overrides: Object.keys(overrides).length > 0 ? overrides : null,
    });
  }

  // Fail fast if there are any mapping errors
  if (errors.length > 0) {
    console.error("❌ Errors found during plan mapping:\n");
    for (const err of errors) {
      console.error(`   - ${err.businessId}: ${err.reason}`);
    }
    console.error("\nAborting migration. Fix the data and try again.\n");
    await prisma.$disconnect();
    process.exit(1);
  }

  if (updates.length === 0 && skipped.length > 0) {
    console.log("All rows already have planDefinitionId set. Nothing to do.");
    await prisma.$disconnect();
    return;
  }

  // ── 4. Run all updates in a transaction ──────────────────────────────
  console.log(`Updating ${updates.length} BusinessFeatures rows...`);

  await prisma.$transaction(async (tx) => {
    for (const update of updates) {
      await tx.businessFeatures.update({
        where: { id: update.id },
        data: {
          planDefinitionId: planDefMap.get(update.planName)!.id,
          overrides: update.overrides ?? Prisma.DbNull,
        },
      });
    }
  });

  // ── 5. Report results ────────────────────────────────────────────────
  const withOverrides = updates.filter((u) => u.overrides !== null).length;
  const withoutOverrides = updates.length - withOverrides;

  console.log(`\n✅ Migration successful:\n`);
  console.log(`   - ${updates.length} rows migrated`);
  console.log(`   - ${withOverrides} with custom overrides`);
  console.log(`   - ${withoutOverrides} inheriting plan defaults\n`);

  // ── 6. Drop old columns (optional step, requires confirmation) ───────
  console.log("╔══════════════════════════════════════════════════════════════╗");
  console.log("║  NEXT STEPS:                                                ║");
  console.log("║                                                             ║");
  console.log("║  1. Verify the data looks correct:                          ║");
  console.log('║     SELECT "planDefinitionId", overrides FROM "BusinessFeatures";  ║');
  console.log("║                                                             ║");
  console.log("║  2. Apply the new schema to DROP old columns:               ║");
  console.log("║     npx prisma db push    (or npx prisma migrate dev)       ║");
  console.log("║                                                             ║");
  console.log("║  3. Or manually drop columns with:                          ║");
  console.log("║     ALTER TABLE \"BusinessFeatures\"                          ║");
  console.log('║       DROP COLUMN "plan",                                    ║');
  console.log('║       DROP COLUMN "hasAfipBilling",                          ║');
  console.log('║       DROP COLUMN "hasPublicCatalog",                        ║');
  console.log('║       DROP COLUMN "hasClientLedger",                         ║');
  console.log('║       DROP COLUMN "hasMultiCashbox",                         ║');
  console.log('║       DROP COLUMN "hasSupplierFilter",                       ║');
  console.log('║       DROP COLUMN "hasBudget",                               ║');
  console.log('║       DROP COLUMN "maxUsers",                                ║');
  console.log('║       DROP COLUMN "maxProducts";                             ║');
  console.log("╚══════════════════════════════════════════════════════════════╝\n");
}

main()
  .catch((e) => {
    console.error("\n❌ Migration failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
