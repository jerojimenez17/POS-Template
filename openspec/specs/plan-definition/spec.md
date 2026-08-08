# Plan Definition Specification

## Purpose

Define how business feature sets and operational limits are derived from plan templates with per-business overrides. Replaces hardcoded feature columns with a `PlanDefinition`-driven model.

## Requirements

### Requirement: PlanDefinition Seeding

The system **MUST** produce exactly 5 `PlanDefinition` rows with their defaults on first deploy. The migration's DDL section inserts the rows so the catalog is identical on fresh `prisma migrate dev` and migrated production databases. The seed script additionally upserts them for idempotency.

| Plan | Features | Limits |
|------|----------|--------|
| BASIC | All `false` | maxUsers:1, maxProducts:100, maxCashboxes:1, maxClients:50 |
| PRO | All `true` | maxUsers:5, maxProducts:1000, maxCashboxes:3, maxClients:500 |
| ENTERPRISE | All `true` | maxUsers:999999, maxProducts:999999, maxCashboxes:999999, maxClients:999999 |
| DEMO | All `true` | maxUsers:2, maxProducts:10, maxCashboxes:2, maxClients:2, dailySalesLimit:3 |
| CUSTOM | All `true` | maxUsers:999999, maxProducts:999999, maxCashboxes:999999, maxClients:999999 |

Features: `hasAfipBilling`, `hasPublicCatalog`, `hasClientLedger`, `hasMultiCashbox`, `hasSupplierFilter`, `hasBudget`.

#### Scenario: Migration produces the plan catalog

- GIVEN a database that has never been seeded
- WHEN `prisma migrate deploy` runs
- THEN 5 `PlanDefinition` rows exist with names BASIC, PRO, ENTERPRISE, DEMO, CUSTOM
- AND each row matches both the table above AND `PLAN_SEEDS` in `src/types/plan.ts`

#### Scenario: Seed runs once

- GIVEN a fresh database
- WHEN `prisma db push` + `node prisma/seed.ts` runs
- THEN 5 `PlanDefinition` rows exist with the same data as the migration-inserted rows

#### Scenario: Idempotent seed

- GIVEN plans already exist (from migration or prior seed)
- WHEN seed runs again
- THEN no duplicate plans are created (upsert by name)

### Requirement: Feature Resolution

The system **MUST** resolve effective features by merging `PlanDefinition.defaults` with `BusinessFeatures.overrides`.

- Fields present in `overrides` override the plan default
- Fields absent from `overrides` inherit the plan default
- Null `overrides` means 100% plan defaults

#### Scenario: No overrides

- GIVEN a business with plan BASIC and no overrides
- WHEN `resolveFeatures()` is called
- THEN all features match BASIC defaults (`hasAfipBilling=false`, `maxUsers=1`, etc.)

#### Scenario: Partial overrides

- GIVEN a business with plan BASIC and overrides `{ maxUsers: 5 }`
- WHEN `resolveFeatures()` is called
- THEN `maxUsers=5` and all other fields match BASIC defaults

#### Scenario: Full overrides (CUSTOM plan)

- GIVEN a business with plan CUSTOM
- WHEN `resolveFeatures()` is called
- THEN all features default to `true` and all limits to `999999`
- AND any override field changes the resolved value

### Requirement: Backward Compatible Shape

The resolved features **MUST** expose the same shape as the old `BusinessFeatures` model: flat object with `plan`, `hasAfipBilling`, `hasPublicCatalog`, `hasClientLedger`, `hasMultiCashbox`, `hasSupplierFilter`, `hasBudget`, `maxUsers`, `maxProducts`.

#### Scenario: JWT token shape

- GIVEN a user logging in with plan BASIC
- WHEN JWT is generated
- THEN `token.business.features` contains all 9 fields with correct BASIC defaults

#### Scenario: useFeatures hook unchanged

- GIVEN a client component using `useFeatures()`
- WHEN it calls `hasFeature("hasAfipBilling")`
- THEN it returns the resolved value from the new system
- AND `isPlanAtLeast(Plan.BASIC)` continues working via plan hierarchy

### Requirement: Migration — Zero Data Loss

The migration **MUST** preserve all existing business feature configurations with no data loss. Two migrations are applied: (1) `{ts}_add_plan_definition` (DDL + seed + backfill), (2) `20260626000001_add_pg_trgm_search` (extension + indexes).

The backfill algorithm maps each old `(plan, hasAfipBilling, ..., maxProducts)` row to a `(planDefinitionId, overrides)` pair such that `resolveFeatures(planDefinitionId, overrides)` returns byte-equivalent `ResolvedFeatures` vs the old columns. Rows matching plan defaults get `overrides = NULL`.

#### Scenario: Exact match migrates to no overrides

- GIVEN a business with BASIC plan and default BASIC features
- WHEN migration runs
- THEN `BusinessFeatures.overrides` is null
- AND `planDefinitionId` points to BASIC

#### Scenario: Customized features migrate to overrides

- GIVEN a business with BASIC plan but `maxUsers=10` (overridden from default 1)
- WHEN migration runs
- THEN `BusinessFeatures.overrides` contains `{ maxUsers: 10 }`
- AND resolved `maxUsers` remains 10

#### Scenario: Backfill verification passes

- GIVEN the 5 production businesses with known pre-migration feature columns
- WHEN `.agents/local/verify-plan-backfill.mjs` runs after migration
- THEN it asserts byte-equivalent `ResolvedFeatures` per business
- AND zero mismatches are reported

#### Scenario: Migration rollback capable

- GIVEN migration has not run yet
- WHEN a SQL backup of `BusinessFeatures` table is taken
- THEN the backup can restore all 8 columns + plan enum exactly

### Requirement: Plan Catalog Consistency (REQ-PLAN-DELTA-003)

Any change to `PLAN_SEEDS` in `src/types/plan.ts` **MUST** be paired with a new migration that updates the `PlanDefinition` rows to match. Conversely, any migration change to `PlanDefinition` defaults **MUST** update `PLAN_SEEDS`.

#### Scenario: Drift detection

- GIVEN `PLAN_SEEDS` is modified (e.g. BASIC maxProducts changed to 200)
- WHEN no corresponding migration update was authored
- THEN the two sources are out of lockstep — a spec violation

### Requirement: Orphan Migration Reconciliation (REQ-PLAN-DELTA-004)

The orphan migration `0001_add_pos_core_models` — physically applied to production but absent from `_prisma_migrations` — **MUST** be reconciled with `prisma migrate resolve --applied` before or during deploy so `prisma migrate status` reports no drift.

#### Scenario: Orphan resolved cleanly

- GIVEN `0001_add_pos_core_models` row is missing from `_prisma_migrations`
- WHEN `prisma migrate resolve --applied 0001_add_pos_core_models` runs
- THEN `_prisma_migrations` contains the row
- AND `prisma migrate status` reports all migrations applied

*Note: The existing spec previously had `dailySalesLimit: 2` for DEMO. This was corrected to `3` to match `PLAN_SEEDS`. The migration and PLAN_SEEDS are now consistent.*
