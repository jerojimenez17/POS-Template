# Tasks: Simplify Plan System — TDD Plan

## Priority Order (dependency-driven)

### P0 — Core Plan Resolution (test-first)

- [ ] **A. resolveFeatures() — null input** `tests/plan/limits.test.ts`
  - Old: tests pass `planDefinition` + optional overrides → merge
  - New: pass `undefined`/`null` → `resolveFeatures()` returns BASIC defaults
  - Also: DEMO plan with expired `trialEndsAt` auto-downgrades to BASIC
- [ ] **B. getEffectivePlan() — refactor mocks** `tests/plan/limits.test.ts`
  - Old: mocks `db.businessFeatures.findUnique({ where: { businessId }, include: { planDefinition } })`
  - New: mocks `db.business.findUnique({ where: { id }, include: { planDefinition } })` → `{ planDefinition, trialEndsAt }`
  - Edge: business not found → return BASIC defaults
- [ ] **C. Daily limits — refactor mocks** `tests/plan/daily-limits.test.ts`
  - Old: mocks `db.businessFeatures` queries
  - New: mocks `db.business.findUnique` with `planDefinition` include
- [ ] **H. Null plan fallback** `tests/plan/null-plan.test.ts` (NEW)
  - Mock `db.business.findUnique` returning `{ planDefinition: null }`
  - Expect `resolveFeatures()` → BASIC defaults
  - Expect JWT callback does not crash

### P1 — Actions & Auth Integration

- [ ] **D. Superadmin action — rename + refactor** `tests/actions/superadmin.test.ts`
  - Old: `updateBusinessFeaturesAction`, mocks `db.businessFeatures.upsert`, payload includes overrides
  - New: `updateBusinessPlanAction`, mocks `db.business.update({ data: { planDefinitionId } })`, no overrides
- [ ] **E. Auth JWT callback — refactor** `tests/actions/security.test.ts`
  - Old: mocks `db.businessFeatures.findUnique` for plan resolution
  - New: mocks `db.business.findUnique`; verify null planDefinitionId still resolves to BASIC
- [ ] **F. ARCA billing test — refactor include** `tests/actions/arca.test.ts`
  - Old: Prisma `include: { businessFeatures: { include: { planDefinition } } }`
  - New: `include: { planDefinition }` directly on business

### P2 — Migration & Client Verification

- [ ] **G. Migration verification** `tests/plan/migration.test.ts` (NEW)
  - Run custom SQL migration on test DB
  - Assert `BusinessFeatures` table does not exist
  - Assert every Business with former features has non-null `planDefinitionId`
  - Assert businesses without features remain null
- [ ] **I. useFeatures hook — update types** `tests/hooks/useFeatures.test.ts`
  - Session carries new `business.features` shape (same public API)
  - Verify `hasFeature()`, `isPlanAtLeast()` return identical values

## Execution Order

```
P0 (A → B → C → H) ──→ P1 (D → E → F) ──→ P2 (G → I)
```

P0 must pass before any P1 work. P2 is independent — migration and hook tests can run in parallel with P1 if needed. Each test file gets RED (write failing test) → GREEN (make pass) cycle; no code changes outside the test until all REDs are written.
