# Proposal: Schema Plan Refactor

## Intent

`BusinessFeatures` has 8 hardcoded fields per business. No DEMO/CUSTOM plans, no seedable defaults. Refactor to `PlanDefinition`-driven model: features come from a plan template, per-business overrides in JSON. Enables future Plan ABM without migrations.

## Scope

### In Scope
- `PlanDefinition` model seeded with 5 plans (BASIC, PRO, ENTERPRISE, DEMO, CUSTOM)
- `BusinessFeatures` → FK to `PlanDefinition` + `overrides Json?`
- Drop `Plan` enum (replaced by `PlanDefinition.name`)
- Migration: diff current values vs plan defaults → `overrides`
- `plan-resolver.ts` — merges plan defaults + overrides
- Update `auth-gates.ts`, JWT callback, 3 server actions, types, tests

### Out of Scope
- PlanDefinition ABM admin UI + CRUD actions (future)

## Capabilities

### New
- `plan-definition`: PlanDefinition schema only — ABM deferred

### Modified
- None — pure refactor, spec-level behavior unchanged

## Approach

1. **Schema**: `PlanDefinition { id, name, features Json, limits Json, isActive }` seeded. `BusinessFeatures { id, businessId, planDefinitionId, overrides Json? }`.
2. **Migration**: Read inline values → diff vs plan defaults → `overrides`. Null if no diff. SQL backup first.
3. **Resolver** (`plan-resolver.ts`): `resolveFeatures(planDef, overrides)` → merged defaults+overrides. Cached via `React.cache()`.
4. **Auth gates**: `requireFeature()`/`assertLimit()` call resolver. JWT callback also resolves at login.
5. **Backward compat**: JWT carries same `features.*` shape. All existing consumers unchanged.

## Affected Areas

| File | Change |
|------|--------|
| `prisma/schema.prisma` | New `PlanDefinition`, simplified `BusinessFeatures` |
| `prisma/seed.ts` | New — seed 5 plans |
| `src/lib/plan-resolver.ts` | New — resolve effective features |
| `src/lib/auth-gates.ts` | Use resolver |
| `src/actions/superadmin.ts` | Write overrides |
| `src/actions/catalog.ts` | Use resolver |
| `auth.ts` | JWT uses resolver |
| `data/user.ts` | Include plan def |
| `src/types/next-auth.d.ts` | Shape unchanged |
| `src/hooks/useFeatures.ts` | Unchanged |
| *tests* | Mock PlanDefinition |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Data loss during migration | Low | Read-only dry-run + SQL backup |
| Stale JWT after plan change | Medium | `updatedAt` check, re-issue on mismatch |
| Extra query per auth check | Low | `React.cache()` + eager join |

## Rollback Plan

1. Run backup SQL: rename tables back
2. `git revert` schema + code
3. Re-deploy

## Dependencies

- None

## Success Criteria

- [ ] All existing businesses show identical effective features post-migration
- [ ] `requireFeature("hasAfipBilling")` returns same results as before
- [ ] DEMO plan defaults: 2 users, 10 products, 2 cashboxes, 2 clients, 2 sales/day
- [ ] All tests pass + `tsc --noEmit`
- [ ] No server action errors after migration
