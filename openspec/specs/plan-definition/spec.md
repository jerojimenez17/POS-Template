# Plan Definition Specification

## Purpose

Define how business feature sets and operational limits are derived from plan templates with per-business overrides. Replaces hardcoded feature columns with a `PlanDefinition`-driven model.

## Requirements

### Requirement: PlanDefinition Seeding

The system **MUST** seed exactly 5 plans with their defaults on first deploy.

| Plan | Features | Limits |
|------|----------|--------|
| BASIC | All `false` | maxUsers:1, maxProducts:100, maxCashboxes:1, maxClients:50 |
| PRO | All `true` | maxUsers:5, maxProducts:1000, maxCashboxes:3, maxClients:500 |
| ENTERPRISE | All `true` | maxUsers:999999, maxProducts:999999, maxCashboxes:999999, maxClients:999999 |
| DEMO | All `true` | maxUsers:2, maxProducts:10, maxCashboxes:2, maxClients:2, dailySalesLimit:2 |
| CUSTOM | All `true` | maxUsers:999999, maxProducts:999999, maxCashboxes:999999, maxClients:999999 |

Features: `hasAfipBilling`, `hasPublicCatalog`, `hasClientLedger`, `hasMultiCashbox`, `hasSupplierFilter`, `hasBudget`.

#### Scenario: Seed runs once

- GIVEN a fresh database
- WHEN `prisma db push` + `node prisma/seed.ts` runs
- THEN 5 `PlanDefinition` rows exist with names BASIC, PRO, ENTERPRISE, DEMO, CUSTOM
- AND each row has correct features/limits per table above

#### Scenario: Idempotent seed

- GIVEN plans already exist
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

The migration **MUST** preserve all existing business feature configurations with no data loss.

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

#### Scenario: Migration rollback capable

- GIVEN migration has not run yet
- WHEN a SQL backup of `BusinessFeatures` table is taken
- THEN the backup can restore all 8 columns + plan enum exactly
