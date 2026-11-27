# Tasks: Schema Plan Refactor

## Phase 1: Foundation

- [x] 1.1 `prisma/schema.prisma` — Add `PlanDefinition` model (id, name, features Json, limits Json, isDefault, displayOrder, isActive). Simplify `BusinessFeatures` to FK `planDefinitionId` + `overrides Json?`. Keep `Plan` enum unused. Drop 8 old columns (plan, hasAfipBilling, hasPublicCatalog, hasClientLedger, hasMultiCashbox, hasSupplierFilter, hasBudget, maxUsers, maxProducts)
- [x] 1.2 `src/types/plan.ts` — Create `ResolvedFeatures` interface (11 fields: plan, 6 booleans, 4 limits). Export `PLAN_SEEDS` constant with defaults for 5 plans
- [x] 1.3 `src/lib/plan-resolver.ts` — Create `resolveFeatures(planDef, overrides)` pure function with merge logic. `getEffectivePlan(businessId)` loads BusinessFeatures+PlanDefinition from DB. `getCachedPlan` wraps with `React.cache()`. Throw on missing PlanDefinition

## Phase 2: Seed & Migration

- [x] 2.1 `prisma/seed.ts` — Seed 5 PlanDefinition rows (BASIC, PRO, ENTERPRISE, DEMO, CUSTOM) via upsert by name, idempotent. Call from `npx prisma db seed`
- [x] 2.2 `scripts/migrate-plans.ts` — Migration script: SQL backup via `pg_dump`, then for each BusinessFeatures row diff current 8 fields vs plan defaults, write `overrides` (null if no diff), set `planDefinitionId`. Runs inside `db.$transaction`. Drop old columns after all rows migrated

## Phase 3: Core Wiring

- [x] 3.1 `auth.ts` — JWT callback: import resolver, call `resolvePlanFromBusiness()` after `getUserById`. Remove `Plan.BASIC` fallback. `token.business.features` keeps same shape
- [x] 3.2 `data/user.ts` — `getUserById` include chain: `features: { include: { planDefinition: true } }`
- [x] 3.3 `src/types/next-auth.d.ts` — `plan: string` (was `Plan`). Add `maxCashboxes`, `maxClients`, `dailySalesLimit` to features type. Keep `Plan` import for backward compat

## Phase 4: Action Refactors

- [x] 4.1 `src/actions/superadmin.ts` — `updateBusinessFeaturesAction` new payload `{ businessId, planDefinitionId, overrides? }`. Upsert `overrides` field only. Validate override keys exist in PlanDefinition features/limits
- [x] 4.2 `src/actions/catalog.ts` — `getPublicProductsByBusinessId` replace `db.businessFeatures.findUnique()` with `getEffectivePlan(businessId)`. Same error behavior for missing/deleted feature

## Phase 5: Tests

- [x] 5.1 `tests/actions/superadmin.test.ts` — Update payload shape to `{ businessId, planDefinitionId, overrides }`. Mock PlanDefinition exists. Verify override upsert not 8-field write
- [x] 5.2 `src/__tests__/actions/catalog.test.ts` — Mock `getEffectivePlan` from plan-resolver instead of `db.businessFeatures.findUnique`. All existing tests must pass with identical assertions
- [x] 5.3 Final verify — `tsc --noEmit`, `npx prisma generate`, `npm run test`. Confirm DEMO plan defaults: 2 users, 10 products, 2 cashboxes, 2 clients, 2 sales/day
