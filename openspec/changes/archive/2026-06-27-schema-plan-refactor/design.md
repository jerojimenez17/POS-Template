# Design: Schema Plan Refactor

## Technical Approach

Replace 8 hardcoded `BusinessFeatures` columns + `Plan` enum with `PlanDefinition`-driven model. Features/limits stored as JSON templates, per-business overrides in JSON. Migration diffs current values vs plan defaults. Resolver merges at runtime. JWT carries resolved flat shape — zero consumer code changes.

## Architecture Decisions

### Remove `Plan` enum?
| Option | Tradeoff |
|--------|----------|
| Remove from Prisma schema | Breaks `useFeatures.ts` import from `@prisma/client` (spec says MUST NOT change) |
| Keep unused in schema | Harmless; satisfies backward compat. Future cleanup can delete it independently |

**Decision**: Keep `Plan` enum in `schema.prisma` but unused by any model. `@prisma/client` continues exporting it. Consumer code unchanged. No model references it.

### Resolution level: JWT vs per-call
| Option | Queries/check | Freshness | auth-gates.ts changes |
|--------|--------------|-----------|----------------------|
| JWT-level | 0 (at login only) | Stale until re-login | None |
| Per-call (auth-gates) | 1 `findUnique` | Always fresh | Uses resolver |

**Decision**: **JWT-level** resolution. `auth.ts` JWT callback calls `resolvePlanFromBusiness()` after `getUserById`. `auth-gates.ts` stays IDENTICAL — reads `session.user.business.features` as before. Staleness is acceptable: plan changes are SUPER_ADMIN operations, user re-login is the refresh mechanism.

### Error behavior when PlanDefinition not found
| Option | Risk |
|--------|------|
| Throw | Crashes login; data integrity issue must be fixed |
| Fallback to BASIC | Silent data problem; hard to debug |

**Decision**: **Throw** on missing `PlanDefinition`. If a BusinessFeatures row has no valid PlanDefinition, something is fundamentally broken and must be caught early.

### `isPlanAtLeast` in `useFeatures.ts`
Current code uses `Plan` enum hierarchy (BASIC=1, PRO=2, ENTERPRISE=3). After refactor, DEMO/CUSTOM plans exist. The `Plan` enum (kept in schema) won't include DEMO/CUSTOM. Feature is for backward compat only — **leave as-is** since spec says "MUST NOT change". DEMO/CUSTOM plans are ADMIN-set, not user-selectable.

## Data Flow

```
Login flow:
  auth.ts JWT callback
    → getUserById (includes features.planDefinition)
    → resolvePlanFromBusiness()
    → token.business.features = { plan, hasAfipBilling, ... }

requireFeature("hasAfipBilling"):
  → auth() reads JWT
  → session.user.business.features.hasAfipBilling  ← unchanged

catalog.ts getPublicProductsByBusinessId:
  → getEffectivePlan(businessId)  ← NEW resolver
  → features.hasPublicCatalog

superadmin.ts updateBusinessFeaturesAction:
  → receives { businessId, planDefinitionId, overrides }
  → upserts BusinessFeatures.overrides as JSON
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `prisma/schema.prisma` | Modify | New `PlanDefinition` model. Simplified `BusinessFeatures` → FK + overrides Json? + createdAt. `Plan` enum kept (unused by models). Drop 8 columns |
| `prisma/seed.ts` | Create | Seed 5 plans via upsert by name. Idempotent |
| `prisma/migrations/*` | Create | Migration script (TS, via `npx tsx`) — backup, read, diff, write, drop |
| `src/lib/plan-resolver.ts` | Create | `resolveFeatures()` + `getEffectivePlan()` with `React.cache()` |
| `src/lib/auth-gates.ts` | None | No changes needed (reads from JWT) |
| `src/actions/superadmin.ts` | Modify | New payload shape: `{ businessId, planDefinitionId, overrides }`. Override validation |
| `src/actions/catalog.ts` | Modify | Replace `db.businessFeatures.findUnique()` with `getEffectivePlan()` |
| `auth.ts` | Modify | JWT callback: import resolver, call `resolvePlanFromBusiness(existingUser)`. Remove `Plan.BASIC` fallback |
| `data/user.ts` | Modify | `getUserById` includes `features.planDefinition` in the relation chain |
| `src/types/next-auth.d.ts` | Modify | `plan: string` (was `Plan`). Add `maxCashboxes`, `maxClients`, `dailySalesLimit` |
| `src/types/plan.ts` | Create | ResolvedFeatures interface + PLAN_SEEDS constant |
| `src/hooks/useFeatures.ts` | None | No changes (imports `Plan` from `@prisma/client` — still available) |

## Interfaces / Contracts

```typescript
// src/types/plan.ts
export interface ResolvedFeatures {
  plan: string;
  hasAfipBilling: boolean;
  hasPublicCatalog: boolean;
  hasClientLedger: boolean;
  hasMultiCashbox: boolean;
  hasSupplierFilter: boolean;
  hasBudget: boolean;
  maxUsers: number;
  maxProducts: number;
  maxCashboxes: number;
  maxClients: number;
  dailySalesLimit: number;
}

// src/lib/plan-resolver.ts
export function resolveFeatures(
  planDef: { features: Record<string, any>; limits: Record<string, any> },
  overrides: Record<string, any> | null
): ResolvedFeatures;

export function getEffectivePlan(businessId: string): Promise<ResolvedFeatures>;

// Wraps getEffectivePlan with React.cache() for request dedup
export const getCachedPlan = React.cache(getEffectivePlan);
```

**Merge logic**: `overrides[field] ?? planDef.features[field] ?? planDef.limits[field] ?? default`

## Plan Seed Data

```typescript
const PLAN_SEEDS = [
  { name: "BASIC",    features: { hasAfipBilling:false, hasPublicCatalog:false, hasClientLedger:false, hasMultiCashbox:false, hasSupplierFilter:false, hasBudget:false }, limits: { maxUsers:1, maxProducts:100, maxCashboxes:1, maxClients:50, dailySalesLimit:999999 }, isDefault:true, displayOrder:1 },
  { name: "PRO",      features: ALL_TRUE,  limits: { maxUsers:5, maxProducts:1000, maxCashboxes:3, maxClients:500, dailySalesLimit:999999 }, displayOrder:2 },
  { name: "ENTERPRISE", features: ALL_TRUE, limits: { maxUsers:999999, maxProducts:999999, maxCashboxes:999999, maxClients:999999, dailySalesLimit:999999 }, displayOrder:3 },
  { name: "DEMO",     features: ALL_TRUE,  limits: { maxUsers:2, maxProducts:10, maxCashboxes:2, maxClients:2, dailySalesLimit:2 }, displayOrder:0 },
  { name: "CUSTOM",   features: ALL_TRUE,  limits: { maxUsers:999999, maxProducts:999999, maxCashboxes:999999, maxClients:999999, dailySalesLimit:999999 }, displayOrder:99 },
];
```

## Migration Design

1. **SQL backup** — `pg_dump --table=BusinessFeatures > backup.sql`
2. **Seed PlanDefinitions** — run seed.ts (idempotent upsert)
3. **TS migration script** (`scripts/migrate-plans.ts`):
   - For each `BusinessFeatures` row:
     - Match `plan` enum → `PlanDefinition.name`
     - Compare each of 8 fields vs plan defaults
     - Write diff as `overrides` (null if no diff)
     - Set `planDefinitionId`
   - Drop old columns: `plan`, `hasAfipBilling`, `hasPublicCatalog`, `hasClientLedger`, `hasMultiCashbox`, `hasSupplierFilter`, `hasBudget`, `maxUsers`, `maxProducts`
   - Drop `Plan` enum from schema
4. Run inside `db.$transaction` for atomicity

## Server Action Changes

### `superadmin.ts` — `updateBusinessFeaturesAction`
```typescript
// New payload
{ businessId: string; planDefinitionId: string; overrides?: Record<string, any> }
// Upsert: BusinessFeatures.overrides = payload.overrides
// Validation: overrides keys must exist in PlanDefinition (features or limits)
// Switching plan? overrides may become invalid — keep them unless explicitly cleared
```

### `catalog.ts` — `getPublicProductsByBusinessId`
Replace `db.businessFeatures.findUnique()` with `getEffectivePlan(businessId)`. Same error behavior.

## Testing Strategy

| Layer | What | Approach |
|-------|------|----------|
| Unit | `resolveFeatures()` | Pure function: no overrides, partial overrides, full overrides, unknown fields |
| Unit | `getEffectivePlan()` | Mock `db.businessFeatures.findUnique` to return PlanDefinition+overrides |
| Integration | Migration script | Test with seeded BusinessFeatures rows, verify override generation |
| Integration | `updateBusinessFeaturesAction` | New payload shape, verify override upsert, verify validation |
| Integration | `getPublicProductsByBusinessId` | Mock `getEffectivePlan` instead of `db.businessFeatures.findUnique` |

### Test-specific changes
- `security.test.ts`: No changes needed — `auth()` mock returns same features shape
- `catalog.test.ts`: Change mock from `db.businessFeatures.findUnique` to `getEffectivePlan`
- `superadmin.test.ts`: Update payload shape, mock `PlanDefinition` exists

## Open Questions

- [ ] Migration script location: `scripts/` or `prisma/migrations/`? Recommend standalone `scripts/migrate-plans.ts` with `npx tsx`
- [ ] Should DEMO plan have an expiration mechanism? Spec says "30-day trial" but no enforcement — deferred
