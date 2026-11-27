# Delta Spec: Schema Plan Refactor

## Context

This change replaces 8 hardcoded columns + `Plan` enum in `BusinessFeatures` with a `PlanDefinition`-driven model. No user-facing behavior changes — all existing consumers continue to work identically.

New domain spec: `openspec/specs/plan-definition/spec.md`

## Migration Requirements

### Requirement: Migration Algorithm

The migration **MUST** transform each existing `BusinessFeatures` row without data loss:

1. Read current `plan` enum (BASIC/PRO/ENTERPRISE)
2. Match to new `PlanDefinition` by name
3. For each field: compare current value vs plan default
4. If different → store in `BusinessFeatures.overrides` (Json)
5. If same → leave null (inherit from plan)
6. Set `BusinessFeatures.planDefinitionId`
7. Drop the 8 old columns and `Plan` enum

A read-only SQL backup **MUST** be taken before migration.

#### Scenario: Full migration with mixed businesses

- GIVEN 3 businesses: BASIC (all defaults), PRO (hasAfipBilling=false override), ENTERPRISE (all defaults)
- WHEN migration runs
- THEN BASIC row: `overrides=null`, `planDefinitionId=BASIC`
- AND PRO row: `overrides={"hasAfipBilling":false}`, `planDefinitionId=PRO`
- AND ENTERPRISE row: `overrides=null`, `planDefinitionId=ENTERPRISE`
- AND resolved features exactly match pre-migration values for all 3

#### Scenario: Rollback restores data

- GIVEN a SQL backup was taken before migration
- WHEN rollback script executes
- THEN all 8 columns + Plan enum are restored with identical values
- AND no business loses feature configuration

### Requirement: Migration Idempotency

The migration **SHOULD** be safe to run multiple times (no duplicate overrides or broken FKs).

#### Scenario: Re-run safety

- GIVEN migration has already run once
- WHEN migration runs again
- THEN no rows are duplicated
- AND existing overrides are not overwritten

## Backward Compatibility Requirements

### Requirement: Server Actions Unchanged

All server actions that use `requireFeature()` or `assertLimit()` **MUST** continue to work without code changes.

#### Scenario: requireFeature unchanged

- GIVEN `src/actions/cashbox.ts` calls `requireFeature("hasMultiCashbox")`
- WHEN the check runs for a PRO business
- THEN it returns `ok()` (same as before)
- AND when it runs for a BASIC business with no override
- THEN it returns `fail("FORBIDDEN")` (same as before)

#### Scenario: Direct DB read in catalog

- GIVEN `src/actions/catalog.ts` reads `BusinessFeatures` directly
- WHEN `getPublicProductsByBusinessId()` is called
- THEN it **MUST** use the resolver or eager join with `PlanDefinition` to get `hasPublicCatalog`
- AND the behavior is identical: returns products or throws

### Requirement: JWT Features Shape

The JWT `business.features` object **MUST** expose the same 9 fields as before.

#### Scenario: Login with each plan

- GIVEN businesses with BASIC, PRO, and ENTERPRISE plans (no overrides)
- WHEN a user from each logs in
- THEN each JWT `business.features` has all 9 fields with correct defaults per plan

### Requirement: useFeatures Hook Unchanged

`src/hooks/useFeatures.ts` **MUST** work without code changes (reads from session only).

#### Scenario: isOverLimit with new limits

- GIVEN a DEMO business with `maxCashboxes=2`
- WHEN `isOverLimit("maxCashboxes", 2)` is called client-side
- THEN it returns `true` (at limit)

*Note: `isOverLimit` currently only handles `maxUsers`/`maxProducts` — this SHOULD be updated to handle all limit names generically.*

## Affected Files Acceptance Criteria

| File | Acceptance |
|------|-----------|
| `prisma/schema.prisma` | `PlanDefinition` model created, `BusinessFeatures` has `planDefinitionId + overrides Json?`, `Plan` enum removed, 8 columns removed |
| `prisma/seed.ts` | Seeds 5 plans via upsert, idempotent |
| `src/lib/plan-resolver.ts` | NEW — exports `resolveFeatures(planDef, overrides)` + `resolvePlanFromBusiness(businessId)`, uses `React.cache()` |
| `src/lib/auth-gates.ts` | Uses resolver instead of `session.user.business.features` directly. `requireFeature()` + `assertLimit()` behavior identical |
| `src/actions/superadmin.ts` | `updateBusinessFeaturesAction` writes `overrides` Json instead of 8 columns |
| `src/actions/catalog.ts` | Uses resolver or eager-joined `PlanDefinition` instead of direct DB read |
| `auth.ts` | JWT callback uses resolver to produce same `features.*` shape |
| `data/user.ts` | Includes `PlanDefinition` in `getUserById` query |
| `src/types/next-auth.d.ts` | Shape unchanged — `features` type stays flat |

## Files That MUST NOT Change

`src/actions/cashbox.ts`, `src/actions/orders.ts`, `src/actions/unpaid-orders.ts`, `src/actions/afip.ts`, `src/actions/sales/process.ts`, `src/hooks/useFeatures.ts`

## DEMO Plan Behavior

| Aspect | Value |
|--------|-------|
| Duration | 30-day trial from creation |
| Features | All `true` |
| Limits | 2 users, 10 products, 2 cashboxes, 2 clients |
| Daily sales | 2 sales/day (`dailySalesLimit=2`) |

## CUSTOM Plan Behavior

All features `true`, all limits `999999`. Any field overridable via `BusinessFeatures.overrides`.
