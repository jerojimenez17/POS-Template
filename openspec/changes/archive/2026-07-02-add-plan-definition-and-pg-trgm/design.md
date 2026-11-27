# Design: add-plan-definition-and-pg-trgm

## Technical Approach

Two independent migrations bring the production database from the legacy `BusinessFeatures` column-per-field model to the new `PlanDefinition` + `overrides` JSON model, and enable trigram-accelerated fuzzy search. The first migration (`20260626000001_add_pg_trgm_search`) already exists in the repo as a standalone file and is applied verbatim. The second migration (`{ts}_add_plan_definition`) is newly authored — a single `.sql` file with three logical sections (DDL, Seed, Backfill) in one transaction. Plan catalog consistency is enforced by a spec-level lockstep constraint between `PLAN_SEEDS` and migration-inserted rows.

## Architecture Decisions

| Decision | Choice | Alternatives | Rationale |
|----------|--------|-------------|-----------|
| **Two migrations** | Existing pg_trgm kept separate; new `{ts}_add_plan_definition` carries DDL+seed+backfill | Single monolithic migration | pg_trgm is independently revertible (`DROP EXTENSION pg_trgm CASCADE`). Plan refactor already has enough complexity. |
| **Plan rows in migration** | `INSERT INTO "PlanDefinition"` inside the migration SQL | Seed-only approach | Fresh `prisma migrate deploy` and migrated production must produce identical catalogs. Seed doesn't run on deploy. |
| **Backfill = diff algorithm** | `overrides = diff(old_row, plan_defaults)` computed per-row; NULL when no diff | Hardcoded overrides in SQL | Avoids hardcoding business-specific values in migration. Algorithm is deterministic: for each column, if `old_value != plan_default` → include in `overrides`. |
| **Single transaction** | All DDL+seed+backfill wrapped in one `BEGIN/COMMIT` | Separate migration files | Atomicity: if any UPDATE fails, entire migration rolls back. `ALTER TYPE "Plan" ADD VALUE` is permitted inside transaction in PG16. |
| **Orphan resolved via CLI** | `prisma migrate resolve --applied 0001_add_pos_core_models` | Manual `_prisma_migrations` INSERT | `--applied` bypasses checksum verification by design; the migration was physically applied to prod but has no SQL file in repo. |
| **Drop columns, not soft-retire** | `DROP COLUMN` for the 8 legacy `BusinessFeatures` columns | Keep + deprecate | Dead columns would diverge from schema and confuse future developers. Rollback is DB restore (destructive, but safe with pre-migration dump). |

## Data Flow

```
prisma migrate deploy
│
├── Migration 1: 20260626000001_add_pg_trgm_search
│   └── CREATE EXTENSION pg_trgm
│   └── CREATE INDEX ... USING GIN (gin_trgm_ops)  × 5
│
├── Migration 2: {ts}_add_plan_definition
│   ├── DDL: CREATE TABLE PlanDefinition, DailyUsage
│   │       ALTER TABLE Business ADD trialEndsAt
│   │       ALTER TABLE BusinessFeatures DROP 8 columns
│   │       ADD planDefinitionId (FK), overrides (JSON), createdAt
│   │       ALTER TABLE Client ADD cuit, ivaCondition
│   │       ALTER TYPE Plan ADD VALUE 'DEMO'
│   │
│   ├── Seed: INSERT 5 PlanDefinition rows (BASIC..CUSTOM)
│   │
│   └── Backfill: for each BusinessFeatures row
│         overrides = diff(old_columns, plan_seed_defaults)
│         UPDATE SET planDefinitionId = ..., overrides = ...::jsonb
│
└── prisma generate
    └── Generated client matches schema → app works
```

**Backfill algorithm detail:**

```
for each (business_id, old_plan, hasAfipBilling, ..., maxProducts):
  plan_defaults ← PLAN_SEEDS[old_plan]  # features ∪ limits
  overrides ← {}
  for each field in (hasAfipBilling..maxProducts):
    if old_value ≠ plan_defaults[field]:
      overrides[field] ← old_value
  plan_def_id ← (SELECT id FROM "PlanDefinition" WHERE name = old_plan)
  if overrides is empty:
    UPDATE SET planDefinitionId = plan_def_id, overrides = NULL
  else:
    UPDATE SET planDefinitionId = plan_def_id, overrides = to_jsonb(overrides)
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `prisma/migrations/{ts}_add_plan_definition/migration.sql` | **Create** | New migration: DDL + 5 PlanDefinition seed rows + per-business backfill UPDATEs |
| `prisma/migrations/20260626000001_add_pg_trgm_search/migration.sql` | Unchanged | Already exists; applied verbatim |
| `prisma/schema.prisma` | Unchanged | Already reflects target shape |
| `.agents/local/verify-plan-backfill.mjs` | **Create** | Ad-hoc verification script (gitignored, not committed) |

## Interfaces / Contracts

No new interfaces. Runtime already consumes the new shape:
- `PlanDefinition.features` + `PlanDefinition.limits` = `Json` → parsed as `ResolvedFeatures`
- `BusinessFeatures.overrides` = `Json?` → merged via `resolveFeatures()`
- `PLAN_SEEDS` in `src/types/plan.ts` = canonical TypeScript-side defaults (lockstep with migration)

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Verification | Post-migration feature parity | Ad-hoc script: recompute `resolveFeatures()` per business, assert byte-equivalent with pre-migration columns |
| Drift | `prisma migrate status` | Visual check: no pending migrations, no drift warnings |
| Enum | `ALTER TYPE Plan ADD VALUE 'DEMO'` | `SELECT enum_range(NULL::"Plan")` returns `{BASIC,PRO,ENTERPRISE,DEMO}` |
| Catalog | PlanDefinition rows | `SELECT count(*)` = 5 with correct names |

## Migration / Rollout

**Order of operations:**

1. Take pre-migration snapshot: `pg_dump --schema-only --data-only` (production) or use existing `.agents/local/schema_before.sql` (local/staging).
2. Apply pg_trgm migration: `npx prisma migrate deploy` — applies `20260626000001_add_pg_trgm_search`.
3. Resolve orphan: `npx prisma migrate resolve --applied 0001_add_pos_core_models`.
4. Copy new migration into `prisma/migrations/{ts}_add_plan_definition/`.
5. Apply plan migration: `npx prisma migrate deploy` — runs DDL + seed + backfill atomically.
6. Generate client: `npx prisma generate`.
7. Verify: run `.agents/local/verify-plan-backfill.mjs`, check `prisma migrate status`, check `/login` + `/register` render.

**Rollback:**

Destructive migration. Rollback = database restore:
- **Local/staging**: `docker exec pos-postgres psql -U postgres -d posdemo_bkp < .agents/local/schema_before.sql`
- **Production**: Restore pre-migration `pg_dump` snapshot into new DB, point `DATABASE_URL` at it.
- pg_trgm rollback: `DROP EXTENSION pg_trgm CASCADE;` (safe — indexes depend on extension).

## Open Questions

- [ ] **DEMO `dailySalesLimit` mismatch**: Spec says `dailySalesLimit: 2` for DEMO but `PLAN_SEEDS` sets `dailySalesLimit: 3`. Flagged as P3 non-blocking — resolve in follow-up (either correct spec to 3 or update PLAN_SEEDS to 2).
- [ ] **Backfill values for the 5 production businesses**: Concrete override JSON values will be determined during apply phase by inspecting the `posdemo_bkp` database. The migration SQL will be hand-edited with those exact values before deploy.
