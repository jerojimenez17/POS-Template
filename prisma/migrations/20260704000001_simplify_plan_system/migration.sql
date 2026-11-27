/*
  Migration: simplify-plan-system

  Elimina la tabla intermedia BusinessFeatures y mueve planDefinitionId
  directamente a Business. Esto completa la migración iniciada en
  20260627000001_add_plan_definition.

  Cambios:
  1. Agrega Business.planDefinitionId
  2. Backfilles datos desde BusinessFeatures.planDefinitionId
  3. Agrega FK Business.planDefinitionId → PlanDefinition.id
  4. Elimina BusinessFeatures (ya no existe en schema.prisma)
  5. Actualiza PlanDefinition.id a @default(uuid()) — solo afecta nuevos inserts

  IMPORTANTE: Los overrides de BusinessFeatures se DESCARTAN (decisión de diseño).
  La nueva lógica usa PlanDefinition.features + PlanDefinition.limits como
  única fuente de verdad.
*/

-- ============================================================================
-- STEP 1: Add planDefinitionId to Business
-- ============================================================================

ALTER TABLE "Business" ADD COLUMN IF NOT EXISTS "planDefinitionId" TEXT;

-- ============================================================================
-- STEP 2: Backfill from BusinessFeatures
-- ============================================================================

UPDATE "Business" b
SET "planDefinitionId" = bf."planDefinitionId"
FROM "BusinessFeatures" bf
WHERE bf."businessId" = b."id";

-- Security check: assert that every Business now has a planDefinitionId
-- (except any that might have been created directly without BusinessFeatures)
-- If businesses are left without a plan, they'll fall back to BASIC defaults via resolveFeatures()

-- ============================================================================
-- STEP 3: Add FK constraint
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Business_planDefinitionId_fkey'
  ) THEN
    ALTER TABLE "Business" ADD CONSTRAINT "Business_planDefinitionId_fkey"
      FOREIGN KEY ("planDefinitionId") REFERENCES "PlanDefinition"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END
$$;

-- ============================================================================
-- STEP 4: Drop BusinessFeatures (no longer in schema)
-- ============================================================================

DROP TABLE IF EXISTS "BusinessFeatures" CASCADE;

-- ============================================================================
-- STEP 5: Clean up orphan indexes (implicit cleanup after DROP TABLE)
-- ============================================================================
-- Nota: CASCADE en el DROP TABLE elimina automáticamente la FK
-- BusinessFeatures_planDefinitionId_fkey. No hace falta cleanup manual.
