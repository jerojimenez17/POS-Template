# Delta for plan-definition — Simplify Plan System

## MODIFIED Requirements

### Requirement: PlanDefinition Seeding

The system **MUST** produce exactly 5 `PlanDefinition` rows with their defaults on first deploy. `PlanDefinition.id` **SHALL** use `@default(uuid())` (UUIDv4) instead of `cuid()`. No behavioral change — all references are string-based and opaque.
(Previously: `PlanDefinition.id` used `@default(cuid())`)

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
- THEN 5 `PlanDefinition` rows exist with UUID primary keys
- AND each row matches `PLAN_SEEDS` in `src/types/plan.ts`

#### Scenario: Idempotent seed

- GIVEN plans already exist (from migration or prior seed)
- WHEN seed runs again
- THEN no duplicate plans are created (upsert by name)

### Requirement: Feature Resolution (direct — no overrides)

The system **MUST** resolve effective features directly from the `Business.planDefinitionId` → `PlanDefinition` relation. No overrides exist. The complete feature set comes from `PlanDefinition.features` and `PlanDefinition.limits` alone.
(Previously: resolved by merging `PlanDefinition.defaults` with `BusinessFeatures.overrides`)

#### Scenario: Business with assigned plan resolves correctly

- GIVEN a business with `planDefinitionId` pointing to BASIC
- WHEN `resolveFeatures()` is called
- THEN all features match BASIC defaults (`hasAfipBilling=false`, `maxUsers=1`, etc.)

#### Scenario: Business with null planDefinitionId resolves to BASIC

- GIVEN a business with `planDefinitionId = null`
- WHEN `resolveFeatures()` is called
- THEN the system falls back to BASIC defaults
- AND no error is raised

### Requirement: Backward Compatible Shape

The resolved features **MUST** expose the same `ResolvedFeatures` shape: `plan`, `hasAfipBilling`, `hasPublicCatalog`, `hasClientLedger`, `hasMultiCashbox`, `hasSupplierFilter`, `hasBudget`, `maxUsers`, `maxProducts`. Source changes from `BusinessFeatures` + `PlanDefinition` merge to direct `PlanDefinition` only, but the output shape is identical.
(Previously: source was `BusinessFeatures` + `PlanDefinition` merge)

#### Scenario: JWT token shape unchanged

- GIVEN a user logging in with plan BASIC
- WHEN JWT is generated
- THEN `token.business.features` contains all 9 fields with correct BASIC defaults

#### Scenario: useFeatures hook returns identical values

- GIVEN a client component using `useFeatures()`
- WHEN it calls `hasFeature("hasAfipBilling")`
- THEN it returns the resolved value from the new system
- AND `isPlanAtLeast(Plan.BASIC)` continues working via plan hierarchy

### Requirement: Migration — Zero Data Loss

The migration **MUST** preserve all business-to-plan assignments with zero data loss. Steps:
1. Add `planDefinitionId String?` to `Business` with FK to `PlanDefinition`
2. For each `Business` with a `BusinessFeatures` record, copy `BusinessFeatures.planDefinitionId` → `Business.planDefinitionId`
3. Discard `BusinessFeatures.overrides` entirely (NOT migrated)
4. Verify: `COUNT(Business.planDefinitionId IS NOT NULL)` = `COUNT(BusinessFeatures)`
5. Drop `BusinessFeatures` table
(Previously: backfilled `BusinessFeatures` with overrides from old columns)

#### Scenario: Business with features gets planDefinitionId

- GIVEN a business with an existing `BusinessFeatures` record referencing BASIC
- WHEN migration runs
- THEN `Business.planDefinitionId` is set to BASIC's UUID
- AND no overrides are preserved

#### Scenario: Business without features gets null planDefinitionId

- GIVEN a business with NO `BusinessFeatures` record
- WHEN migration runs
- THEN `Business.planDefinitionId` is null

#### Scenario: Overrides are discarded

- GIVEN a business with `BusinessFeatures.overrides = { "maxUsers": 10 }`
- WHEN migration runs
- THEN `Business.planDefinitionId` references the same plan
- BUT the override value is NOT migrated — resolved features match plan defaults

#### Scenario: Backfill verification passes

- GIVEN production businesses with pre-migration feature records
- WHEN migration completes
- THEN every Business with a former `BusinessFeatures` record has `planDefinitionId` set
- AND zero mismatches are reported between expected and actual plan references

#### Scenario: Migration rollback capable

- GIVEN migration has not run yet
- WHEN a SQL backup of `Business` and `BusinessFeatures` tables is taken
- THEN the backup can restore both tables exactly

## ADDED Requirements

### Requirement: JWT Token Compatibility During Migration

The system **MUST** accept JWT tokens minted before the migration that carry the old `business.features` shape. Tokens remain valid until natural expiry — no forced logout or invalidation.
(Reason: JWTs are self-contained and not revoked on schema change.)

#### Scenario: Pre-migration JWT still valid

- GIVEN a user with a JWT minted before migration (old shape under `BusinessFeatures`)
- WHEN the user makes an API request post-migration
- THEN the request is authenticated (token is still valid)
- AND the old `business.features` values are used until token refresh

#### Scenario: Token refresh produces new shape

- GIVEN a user with a pre-migration JWT that expires
- WHEN `auth()` JWT callback runs on refresh
- THEN the new token contains `business.features` sourced from `Business.planDefinition`
- AND the shape matches the new direct resolution

### Requirement: Graceful Null Plan Fallback

The system **MUST** tolerate `Business.planDefinitionId = null` at every layer: plan resolver, auth JWT callback, auth gates, and frontend hooks. A null plan **SHALL** resolve to BASIC defaults silently.
(Reason: Businesses without plan assignment exist pre-migration and must not break.)

#### Scenario: New business without plan

- GIVEN a newly created business with no `planDefinitionId`
- WHEN `resolveFeatures()` is called
- THEN it returns BASIC defaults
- AND no error is raised

#### Scenario: Auth gate allows null plan

- GIVEN a user whose business has `planDefinitionId = null`
- WHEN the user accesses any protected route
- THEN the auth gate resolves features to BASIC defaults
- AND the user is not blocked by plan-level checks
