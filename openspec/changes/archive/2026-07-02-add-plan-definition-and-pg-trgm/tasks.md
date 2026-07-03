# Tasks: Add PlanDefinition and pg_trgm Search

## Phase 1: Foundation

- [ ] 1.1 Reconcile orphan: `npx prisma migrate resolve --applied 0001_add_pos_core_models`
- [ ] 1.2 Apply pg_trgm: `npx prisma migrate deploy` to apply `20260626000001_add_pg_trgm_search`
- [ ] 1.3 Verify pg_trgm: query `pg_extension` for `pg_trgm` + confirm 5 GIN indexes via `\di`
- [ ] 1.4 Compute backfill: query 5 `BusinessFeatures` rows from `posdemo_bkp`, diff each vs `PLAN_SEEDS` defaults, write per-row overrides JSON + `planDefinitionId` mapping

Effort: ~0.5h — CLI commands + DB queries

## Phase 2: Core

- [ ] 2.1 Generate `prisma/migrations/{ts}_add_plan_definition/migration.sql` — DDL (CREATE PlanDefinition/DailyUsage, ALTER BusinessFeatures/Client/Business, ALTER TYPE), 5 PlanDefinition INSERTs matching PLAN_SEEDS, per-row UPDATE backfill with overrides from 1.4
- [ ] 2.2 Apply migration: `npx prisma migrate deploy`
- [ ] 2.3 Regenerate client: `npx prisma generate`
- [ ] 2.4 Write `.agents/local/verify-plan-backfill.mjs` — re-derives `resolveFeatures()` per business, asserts byte-equivalence with pre-migration column values

Effort: ~1.5h — most complex phase (migration SQL authoring)

## Phase 3: Verification

- [ ] 3.1 Run verification: `node .agents/local/verify-plan-backfill.mjs` — assert 0 mismatches
- [ ] 3.2 Schema alignment: `npx prisma migrate diff` returns empty, `npx prisma migrate status` shows all applied with no drift
- [ ] 3.3 Catalog check: `SELECT count(*) FROM "PlanDefinition"` = 5 rows (BASIC/PRO/ENTERPRISE/DEMO/CUSTOM)
- [ ] 3.4 Smoke test: `npm run dev` starts cleanly, `/login` + `/register` render without errors

Effort: ~0.5h — verification scripts + manual checks
