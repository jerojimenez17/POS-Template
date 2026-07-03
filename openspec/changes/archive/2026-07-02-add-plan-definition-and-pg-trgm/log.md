# Change Log — add-plan-definition-and-pg-trgm

## Spec Phase Decisions

| # | Decision | Rationale | Date |
|---|----------|-----------|------|
| D1 | **Two migrations, not one** (Opción B). Existing `20260626000001_add_pg_trgm_search` applied as-is; new `{ts}_add_plan_definition_and_pg_trgm` carries DDL + seed + backfill. | Keeps pg_trgm migration unchanged and independently revertible (`DROP EXTENSION pg_trgm CASCADE`). The plan refactor migration already has enough complexity. | 2026-07-02 |
| D2 | **Backfill algorithm described abstractly** in spec — no hardcoded per-row overrides in spec text. Concrete per-row values belong in design/tasks. | The proposal's P1 concern: individual business overrides are implementation data, not spec behaviour. Spec describes what backfill must produce (byte-equivalent `ResolvedFeatures`), not how. | 2026-07-02 |
| D3 | **Verification script** kept as `.agents/local/verify-plan-backfill.mjs` (ad-hoc, gitignored). Referenced in spec scenario but not checked in. | P4 confirmed: verification is a safety net, not part of the deliverable. | 2026-07-02 |
| D4 | **PlanDefinition rows inserted by migration**, not only by seed. Spec modified to require dual source (migration + seed) with lockstep constraint. | Fresh `prisma migrate deploy` and migrated prod must produce identical catalogs. Seed alone doesn't cover migrated databases. | 2026-07-02 |
| D5 | **Orphan reconciliation required** before or during deploy. `prisma migrate resolve --applied 0001_add_pos_core_models`. | Spec covers it as REQ-PLAN-DELTA-004. Without this, `prisma migrate status` shows drift and blocks CI checks. | 2026-07-02 |

## Findings

| # | Finding | Severity | Status |
|---|---------|----------|--------|
| F1 | **DEMO dailySalesLimit mismatch**: Spec table says `dailySalesLimit: 2` for DEMO, but `PLAN_SEEDS` in `src/types/plan.ts` does NOT set `dailySalesLimit`. | P3 — Non-blocking | Documented as open question in delta spec requirement |
| F2 | **Existing spec `Migration — Zero Data Loss`** already has good scenarios (exact match → no overrides, customized → partial overrides). These are preserved verbatim in the MODIFIED block, with new backfill-verification scenario added. | — | Handled |
| F3 | **Plan catalog table in existing spec** (BASIC/PRO/ENTERPRISE/DEMO/CUSTOM rows and limits) stays identical. No plan-level values changed in this change. | — | Confirmed |

## Deviations from Original Plan

| # | Deviation | Reason |
|---|-----------|--------|
| V1 | Delta spec placed at `openspec/specs/plan-definition/delta-spec.md` (not at `openspec/changes/{change}/specs/plan-definition/spec.md` as skill default). | Explicit user instruction. The `delta-spec.md` naming alongside existing `spec.md` makes the delta relationship obvious. |

## Completion Entry

**Date**: 2026-07-02
**Archived by**: sdd-archive

**Summary**: All 12 tasks across 3 phases completed. Migration applied, backfill verified (5/5 businesses), dev server starts, schema up to date. No CRITICAL issues in verify report — PASS WITH WARNINGS (pre-existing lint/TS errors, Prisma `migrate diff` limitation).

**Key results**:
- ✅ `20260626000001_add_pg_trgm_search` migration applied (extension + 5 GIN indexes)
- ✅ `20260627000001_add_plan_definition` migration applied (DDL + 5 seed rows + per-business backfill)
- ✅ Orphan `0001_add_pos_core_models` reconciled (row deleted from `_prisma_migrations`)
- ✅ 5 PlanDefinition rows seeded (BASIC, PRO, ENTERPRISE, DEMO, CUSTOM)
- ✅ Backfill verified byte-equivalent for all 5 businesses
- ✅ Legacy 8 columns dropped from BusinessFeatures
- ✅ Delta spec merged into main spec: 2 MODIFIED + 3 ADDED requirements
- ✅ `openspec/specs/pg-trgm-search/spec.md` unchanged (already final)

**Archive**: Moved to `openspec/changes/archive/2026-07-02-add-plan-definition-and-pg-trgm/`
