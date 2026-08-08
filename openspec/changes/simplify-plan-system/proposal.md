# Proposal: Simplify Plan System

## Intent

Remove the `BusinessFeatures` bridge table. Currently every plan lookup forces a JOIN through Business → BusinessFeatures → PlanDefinition. The `overrides` column is unused, the indirection adds complexity across auth, plan-resolver, superadmin actions, and tests. Goal: direct `Business.planDefinitionId` → `PlanDefinition`, no bridge.

## Scope

### In Scope
- Delete `BusinessFeatures` model from Prisma schema
- Add `planDefinitionId` to `Business` model
- Change `PlanDefinition.id` from `cuid()` to `uuid()`
- Migrate existing data — copy `planDefinitionId`, discard overrides
- Update all Prisma queries, actions, types, hooks, and test mocks
- Rename `updateBusinessFeaturesAction` → `updateBusinessPlanAction`

### Out of Scope
- Changing `PlanDefinition.features`/`limits` shape
- Modifying `resolveFeatures()` pure function
- Adding new plan capabilities
- Removing old migration files from `prisma/migrations/`

## Capabilities

### New Capabilities
None.

### Modified Capabilities
- **plan-definition**: Feature Resolution requirement drops overrides merge (overrides are deleted). Migration scenarios update: backfill targets `Business.planDefinitionId`, not `BusinessFeatures`. All scenarios referencing `BusinessFeatures.overrides` are removed or rewritten.

## Approach

1. **Schema**: Remove `BusinessFeatures` model. Add `planDefinitionId String?` to Business with FK to PlanDefinition. Change `PlanDefinition.id` to `@default(uuid())`.
2. **Migration**: Multi-step SQL — add column → backfill from `BusinessFeatures.planDefinitionId` per Business → verify → drop `BusinessFeatures` table. Run inside a `$transaction` for atomicity.
3. **Backend**: Update `plan-resolver.ts` to query `db.business.findUnique({ include: { planDefinition: true } })`. Update `auth.ts` JWT callback, auth gates, and superadmin actions to remove bridge references.
4. **Frontend**: Update `useFeatures` hook types, `next-auth.d.ts`, and superadmin UI pages.
5. **Tests**: Replace `db.businessFeatures` mocks with `db.business` mocks across all test files.

## Affected Areas

| Area | Impact |
|------|--------|
| `prisma/schema.prisma` | Remove model, add field, change id type |
| `src/lib/plan-resolver.ts` | Query path changes |
| `src/lib/auth-gates.ts` | Type references update |
| `src/data/user.ts` | Prisma include changes |
| `auth.ts` | JWT callback types |
| `src/types/next-auth.d.ts` | `business.features` shape |
| `src/actions/superadmin.ts` | Action rename and update |
| `src/hooks/useFeatures.ts` | Reference updates |
| `tests/` | Mock changes across multiple files |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Data loss in migration | Low | Multi-step SQL: add column → backfill → verify row count → drop old table |
| Broken JWT tokens in flight | Medium | Session shape lives in JWT — tokens minted pre-migration still have old shape until refresh |
| Test coverage misses refactor | Medium | Run `vitest run` + `npx tsc --noEmit` after all changes |

## Rollback Plan

1. Restore database from snapshot taken before migration.
2. Revert all Prisma schema changes via `git revert`.
3. Re-run `npx prisma migrate dev` to realign.
4. All code changes are pure TypeScript + schema — fully reversible by reverting commits.

## Success Criteria

- [ ] `npx prisma validate` and `npx prisma generate` pass
- [ ] `npx tsc --noEmit` reports zero errors
- [ ] `vitest run` passes with updated mocks
- [ ] Migration backfills every Business with correct `planDefinitionId`
- [ ] Auth flow resolves plans without BusinessFeatures JOIN (verify via query log)
- [ ] `useFeatures` hook returns identical values pre/post migration for same Business
