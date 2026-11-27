# Design: Simplify Plan System

## Technical Approach

Eliminate the `BusinessFeatures` bridge table by moving `planDefinitionId` directly onto `Business`. All plan resolution becomes a direct FK join: `Business → PlanDefinition`. Overrides are discarded — `PlanDefinition.features` + `PlanDefinition.limits` are the single source of truth. Migration runs as custom SQL inside a single Prisma migration file for atomicity and verifiability.

## Architecture Decisions

### Decision 1: Single Custom SQL Migration

| Option | Tradeoff | Decision |
|--------|----------|----------|
| Multiple `prisma migrate dev` steps | Safer per-step debugging but harder to roll back atomically | ❌ |
| Single migration with custom SQL | Atomic, verifiable, one reversible unit | ✅ |

**Rationale**: A single migration file (generated via `prisma migrate dev --create-only`, then edited) wraps all 5 steps in `BEGIN/COMMIT`. If any step fails, the entire migration rolls back. The interim `BusinessFeatures` table is never visible to the app without its data.

**SQL sequence inside the migration**:
1. `ALTER TABLE "Business" ADD COLUMN "planDefinitionId" TEXT REFERENCES "PlanDefinition"(id);`
2. `UPDATE "Business" SET "planDefinitionId" = "BusinessFeatures"."planDefinitionId" FROM "BusinessFeatures" WHERE "Business"."id" = "BusinessFeatures"."businessId";`
3. Verification via `RAISE EXCEPTION` if counts mismatch (DO block with ASSERT)
4. `DROP TABLE "BusinessFeatures";`
5. `ALTER TABLE "PlanDefinition" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();`

### Decision 2: Null Fallback in `resolveFeatures()`

| Option | Tradeoff | Decision |
|--------|----------|----------|
| Fallback at auth gate | Duplicates logic per consumer | ❌ |
| Fallback in `resolveFeatures()` | Single centralized point, `?? BASIC` | ✅ |

**Rationale**: `resolveFeatures()` already exists as a pure function. Adding `plan ?? PLAN_SEEDS.BASIC` at its entry keeps every downstream consumer protected — JWT callback, auth gates, hooks, all resolve through the same path. If `planDefinitionId` is null, the resolver returns BASIC defaults silently.

### Decision 3: Simplify JWT Shape Without Breaking Runtime

**Choice**: Keep `ExtendedUser.business.features` shape identical. Only internal source changes.
**Rationale**: The JWT is opaque to consumers — they read `user.business.features` and expect `ResolvedFeatures`. Pre-migration tokens remain valid until natural expiry. Post-refresh tokens resolve through the new path but produce the same shape. No `next-auth.d.ts` field removals — just change how `business` is typed: `{ features: ResolvedFeatures }` instead of `{ features: { planDefinition: ..., overrides: ... } }`.

## Data Flow

```
DB: Business.planDefinitionId ──FK──→ PlanDefinition
              │
              ▼
   plan-resolver.ts: getEffectivePlan()
   db.business.findUnique({ where: { id }, include: { planDefinition: true } })
              │
              ▼
   resolveFeatures(planDefinition) → ResolvedFeatures
              │
       ┌──────┴──────┐
       ▼             ▼
   auth.ts JWT    auth-gates.ts
   (session)      (per-request)
       │
       ▼
   useFeatures() hook (client, reads session)
```

Key difference from current: `Business → BusinessFeatures → PlanDefinition` (two hops) becomes `Business → PlanDefinition` (one hop). The JOIN chain shortens by one table.

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `prisma/schema.prisma` | Modify | Remove `BusinessFeatures` model; add `planDefinitionId String?` to Business; change `PlanDefinition.id` to `@default(uuid())` |
| `prisma/migrations/.../migration.sql` | Create | Custom SQL: add column, backfill, verify, drop table, change default |
| `src/lib/plan-resolver.ts` | Modify | `getEffectivePlan()` queries `business.findUnique({ include: { planDefinition } })`; null → BASIC fallback |
| `src/actions/superadmin.ts` | Modify | Rename to `updateBusinessPlanAction`; no overrides; direct `business.update()` |
| `auth.ts` | Modify | JWT callback reads `existingUser.business.planDefinition` directly |
| `src/lib/auth-gates.ts` | Modify | Remove `features.planDefinition` reference; use resolved `features` directly |
| `src/data/user.ts` | Modify | Prisma `include` removes `businessFeatures`, adds `planDefinition` |
| `src/types/next-auth.d.ts` | Modify | Simplify `business` type to `{ features: ResolvedFeatures }` |
| `tests/**/*.test.ts` | Modify | Replace `db.businessFeatures` mocks with `db.business` mocks |

## Interfaces / Contracts

```typescript
// src/lib/plan-resolver.ts
export async function getEffectivePlan(businessId: string) {
  const business = await db.business.findUnique({
    where: { id: businessId },
    include: { planDefinition: true },
  });
  return resolveFeatures(business?.planDefinition ?? PLAN_SEEDS.BASIC);
}

// src/actions/superadmin.ts — renamed signature
export const updateBusinessPlanAction = async (
  businessId: string,
  planDefinitionId: string
) => {
  // tx.business.update({ where: { id: businessId }, data: { planDefinitionId } })
};
```

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit | `resolveFeatures()` with null input | Pass `undefined` → expect BASIC defaults |
| Unit | `getEffectivePlan()` mocked | Mock `db.business.findUnique` returning null → expect BASIC |
| Integration | Migration backfill | Run migration, verify all Business rows have correct `planDefinitionId`, old table gone |
| Integration | Superadmin `updateBusinessPlan` | Call action, verify `Business.planDefinitionId` updated |
| Unit | Auth JWT callback | Mock `resolvePlanFromBusiness` returning new shape, verify JWT unchanged externally |

## Migration / Rollout

1. Backup database via `pg_dump`
2. Apply migration via `npx prisma migrate deploy`
3. Run `npx tsc --noEmit` to catch any stale type references
4. Run `vitest run` to validate all mocks
5. Deploy code alongside migration (same deploy)
6. Monitor for stale JWT errors — none expected since shape is backward compatible

JWT tokens minted pre-migration carry the old shape but remain valid. On token refresh (natural expiry), the JWT callback reads the new `Business.planDefinition` path. No forced invalidation needed.

## Open Questions

- [ ] Is `gen_random_uuid()` available in the target PostgreSQL, or should we use `uuid_generate_v4()` (requires `uuid-ossp` extension)? Prefer `gen_random_uuid()` as it's built-in since PG 13.
- [ ] Do any existing `Business` rows have a null `planDefinitionId` that needs a default assignment (e.g., assign BASIC)?
- [ ] Confirm no external services query the `BusinessFeatures` table directly.
