/*
  Migration: add-plan-definition

  Aligns the production database with prisma/schema.prisma by:
  - Creating PlanDefinition and DailyUsage tables
  - Seeding 5 plans matching PLAN_SEEDS (BASIC, PRO, ENTERPRISE, DEMO, CUSTOM)
  - Migrating BusinessFeatures from the old flat-column model to planDefinitionId + overrides
  - Adding Business.trialEndsAt, Client.cuit, Client.ivaCondition
  - Adding DEMO to the Plan enum
*/

-- AlterEnum: add DEMO to Plan enum
ALTER TYPE "Plan" ADD VALUE IF NOT EXISTS 'DEMO';

-- AlterTable: Business
ALTER TABLE "Business" ADD COLUMN IF NOT EXISTS "trialEndsAt" TIMESTAMP(3);

-- CreateTable: PlanDefinition
CREATE TABLE IF NOT EXISTS "PlanDefinition" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "features" JSONB NOT NULL,
    "limits" JSONB NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PlanDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable: DailyUsage
CREATE TABLE IF NOT EXISTS "DailyUsage" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "salesCount" INTEGER NOT NULL DEFAULT 0,
    "productsCreated" INTEGER NOT NULL DEFAULT 0,
    "clientsCreated" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "DailyUsage_pkey" PRIMARY KEY ("id")
);

-- AlterTable: BusinessFeatures — drop old columns, add new structure
-- We use a temp column approach to preserve existing data during the transition
ALTER TABLE "BusinessFeatures" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "BusinessFeatures" ADD COLUMN IF NOT EXISTS "overrides" JSONB;
ALTER TABLE "BusinessFeatures" ADD COLUMN IF NOT EXISTS "planDefinitionId" TEXT;

-- AlterTable: Client
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "cuit" TEXT;
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "ivaCondition" TEXT;

-- ============================================================================
-- CreateIndex — PlanDefinition name unique (must exist before INSERT ON CONFLICT)
-- ============================================================================

CREATE UNIQUE INDEX IF NOT EXISTS "PlanDefinition_name_key" ON "PlanDefinition"("name");

-- ============================================================================
-- SEED: Insert the 5 plan definitions matching PLAN_SEEDS in src/types/plan.ts
-- ============================================================================

INSERT INTO "PlanDefinition" ("id", "name", "description", "features", "limits", "isActive", "isDefault", "displayOrder", "createdAt", "updatedAt") VALUES
('plan_basic', 'BASIC', 'Plan básico para negocios pequeños',
 '{"hasAfipBilling":false,"hasPublicCatalog":false,"hasClientLedger":false,"hasMultiCashbox":false,"hasSupplierFilter":false,"hasBudget":false,"hasNegativeStock":false}'::jsonb,
 '{"maxUsers":1,"maxProducts":100,"maxCashboxes":1,"maxClients":50,"dailySalesLimit":999999,"dailyProductsLimit":999999,"dailyClientsLimit":999999}'::jsonb,
 true, true, 1, NOW(), NOW()),
('plan_pro', 'PRO', 'Plan profesional para negocios en crecimiento',
 '{"hasAfipBilling":true,"hasPublicCatalog":true,"hasClientLedger":true,"hasMultiCashbox":true,"hasSupplierFilter":true,"hasBudget":true,"hasNegativeStock":false}'::jsonb,
 '{"maxUsers":5,"maxProducts":1000,"maxCashboxes":3,"maxClients":500,"dailySalesLimit":999999,"dailyProductsLimit":999999,"dailyClientsLimit":999999}'::jsonb,
 true, false, 2, NOW(), NOW()),
('plan_enterprise', 'ENTERPRISE', 'Plan empresarial sin límites',
 '{"hasAfipBilling":true,"hasPublicCatalog":true,"hasClientLedger":true,"hasMultiCashbox":true,"hasSupplierFilter":true,"hasBudget":true,"hasNegativeStock":true}'::jsonb,
 '{"maxUsers":999999,"maxProducts":999999,"maxCashboxes":999999,"maxClients":999999,"dailySalesLimit":999999,"dailyProductsLimit":999999,"dailyClientsLimit":999999}'::jsonb,
 true, false, 3, NOW(), NOW()),
('plan_demo', 'DEMO', 'Plan de prueba gratuito por 30 días',
 '{"hasAfipBilling":true,"hasPublicCatalog":true,"hasClientLedger":true,"hasMultiCashbox":true,"hasSupplierFilter":true,"hasBudget":true,"hasNegativeStock":false}'::jsonb,
 '{"maxUsers":2,"maxProducts":10,"maxCashboxes":2,"maxClients":2,"dailySalesLimit":3,"dailyProductsLimit":5,"dailyClientsLimit":2}'::jsonb,
 true, false, 0, NOW(), NOW()),
('plan_custom', 'CUSTOM', 'Plan personalizado con configuración a medida',
 '{"hasAfipBilling":true,"hasPublicCatalog":true,"hasClientLedger":true,"hasMultiCashbox":true,"hasSupplierFilter":true,"hasBudget":true,"hasNegativeStock":true}'::jsonb,
 '{"maxUsers":999999,"maxProducts":999999,"maxCashboxes":999999,"maxClients":999999,"dailySalesLimit":999999,"dailyProductsLimit":999999,"dailyClientsLimit":999999}'::jsonb,
 true, false, 99, NOW(), NOW())
ON CONFLICT ("name") DO UPDATE SET
  description = EXCLUDED.description,
  features = EXCLUDED.features,
  limits = EXCLUDED.limits,
  "isActive" = EXCLUDED."isActive",
  "isDefault" = EXCLUDED."isDefault",
  "displayOrder" = EXCLUDED."displayOrder",
  "updatedAt" = NOW();

-- ============================================================================
-- BACKFILL: Set planDefinitionId and overrides for existing BusinessFeatures rows
-- ============================================================================

-- Business 1: cmo97af0x0000lg0aob15d67n → BASIC with hasPublicCatalog override
UPDATE "BusinessFeatures"
SET "planDefinitionId" = (SELECT "id" FROM "PlanDefinition" WHERE "name" = 'BASIC'),
    "overrides" = '{"hasPublicCatalog": true}'::jsonb
WHERE "businessId" = 'cmo97af0x0000lg0aob15d67n';

-- Business 2: cmorixy360000jr0ay0nl87uc → BASIC with hasPublicCatalog override
UPDATE "BusinessFeatures"
SET "planDefinitionId" = (SELECT "id" FROM "PlanDefinition" WHERE "name" = 'BASIC'),
    "overrides" = '{"hasPublicCatalog": true}'::jsonb
WHERE "businessId" = 'cmorixy360000jr0ay0nl87uc';

-- Business 3: cmmme8vgx0004u5e4t5f1pecm → ENTERPRISE with overrides
UPDATE "BusinessFeatures"
SET "planDefinitionId" = (SELECT "id" FROM "PlanDefinition" WHERE "name" = 'ENTERPRISE'),
    "overrides" = '{"hasClientLedger": false, "hasSupplierFilter": false, "maxUsers": 999, "maxProducts": 99999}'::jsonb
WHERE "businessId" = 'cmmme8vgx0004u5e4t5f1pecm';

-- Business 4: cmpnoh05v0001u53k8zzs1vyw → ENTERPRISE with overrides
UPDATE "BusinessFeatures"
SET "planDefinitionId" = (SELECT "id" FROM "PlanDefinition" WHERE "name" = 'ENTERPRISE'),
    "overrides" = '{"hasSupplierFilter": false, "maxUsers": 20, "maxProducts": 30000}'::jsonb
WHERE "businessId" = 'cmpnoh05v0001u53k8zzs1vyw';

-- Business 5: cmq2esesr0000jq0anpiq0izz → PRO with overrides
UPDATE "BusinessFeatures"
SET "planDefinitionId" = (SELECT "id" FROM "PlanDefinition" WHERE "name" = 'PRO'),
    "overrides" = '{"hasPublicCatalog": false, "maxProducts": 109999}'::jsonb
WHERE "businessId" = 'cmq2esesr0000jq0anpiq0izz';

-- ============================================================================
-- Now make planDefinitionId NOT NULL (safe after backfill)
-- ============================================================================

ALTER TABLE "BusinessFeatures" ALTER COLUMN "planDefinitionId" SET NOT NULL;

-- ============================================================================
-- Drop old columns (safe after backfill — code already uses the new model)
-- ============================================================================

ALTER TABLE "BusinessFeatures" DROP COLUMN IF EXISTS "plan",
DROP COLUMN IF EXISTS "hasAfipBilling",
DROP COLUMN IF EXISTS "hasPublicCatalog",
DROP COLUMN IF EXISTS "hasClientLedger",
DROP COLUMN IF EXISTS "hasMultiCashbox",
DROP COLUMN IF EXISTS "hasSupplierFilter",
DROP COLUMN IF EXISTS "maxUsers",
DROP COLUMN IF EXISTS "maxProducts";

-- ============================================================================
-- CreateIndex — DailyUsage composite unique + index
-- ============================================================================

CREATE INDEX IF NOT EXISTS "DailyUsage_businessId_date_idx" ON "DailyUsage"("businessId", "date");
CREATE UNIQUE INDEX IF NOT EXISTS "DailyUsage_businessId_date_key" ON "DailyUsage"("businessId", "date");

-- ============================================================================
-- AddForeignKey — BusinessFeatures → PlanDefinition
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'BusinessFeatures_planDefinitionId_fkey'
  ) THEN
    ALTER TABLE "BusinessFeatures" ADD CONSTRAINT "BusinessFeatures_planDefinitionId_fkey"
      FOREIGN KEY ("planDefinitionId") REFERENCES "PlanDefinition"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END
$$;

-- ============================================================================
-- AddForeignKey — DailyUsage → Business
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'DailyUsage_businessId_fkey'
  ) THEN
    ALTER TABLE "DailyUsage" ADD CONSTRAINT "DailyUsage_businessId_fkey"
      FOREIGN KEY ("businessId") REFERENCES "Business"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$$;
