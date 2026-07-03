# Proposal: add-plan-definition-and-pg-trgm

## Intent

The production database (and the `posdemo_bkp` restore used to simulate it) is on the **old** `BusinessFeatures` model (columns `plan`, `hasAfipBilling`, `hasPublicCatalog`, `hasClientLedger`, `hasMultiCashbox`, `hasSupplierFilter`, `maxUsers`, `maxProducts`). The repo's `prisma/schema.prisma` is on the **new** model (`planDefinitionId` FK + `overrides` JSON + `createdAt`), and the runtime code (`src/lib/plan-resolver.ts`, `src/lib/auth-gates.ts`, `src/actions/superadmin.ts`, `src/components/actions/register.ts`, `src/types/plan.ts`) reads only the new shape.

Deploying this code without a migration breaks `/register`, `/login`, every server action that calls `requireFeature` / `assertLimit`, and `getEffectivePlan` — Prisma will fail to compile the client because the DB lacks the columns the generated client expects.

This change authors the missing migration that takes production from the old shape to the new shape, plus applies the `20260626000001_add_pg_trgm_search` migration and reconciles the orphan `0001_add_pos_core_models` row in `_prisma_migrations`.

## Scope

### In Scope

- New `prisma/migrations/{ts}_add_plan_definition_and_pg_trgm/migration.sql` that:
  - Creates `PlanDefinition` and `DailyUsage` tables.
  - Inserts the 5 `PlanDefinition` rows (BASIC, PRO, ENTERPRISE, DEMO, CUSTOM) so the catalog is identical on fresh and migrated DBs.
  - Adds `Business.trialEndsAt`.
  - Drops the 8 legacy `BusinessFeatures` columns and adds `planDefinitionId` (FK) + `overrides` (JSON) + `createdAt`.
  - Backfills `BusinessFeatures.overrides` per-row for the 5 production rows that diverge from `PLAN_SEEDS` (see Risks).
  - Adds `Client.cuit` and `Client.ivaCondition`.
  - Adds `Plan` enum value `DEMO`.
- Apply `20260626000001_add_pg_trgm_search` (extension + GIN indexes) — currently present in repo, absent from `_prisma_migrations`.
- Mark orphan `0001_add_pos_core_models` as applied with `prisma migrate resolve --applied` (it was already physically applied to prod; we are silencing the drift warning, not re-running it).
- Verification script (Node, ad-hoc — checked in under `.agents/local/`) that recomputes the effective features for each of the 5 businesses and asserts byte-equivalence with the pre-migration column values.

### Out of Scope

- Code changes to `plan-resolver.ts`, `auth-gates.ts`, `superadmin.ts`, `register.ts`, or `plan.ts` — runtime is already on the new model and works against it.
- `prisma/seed.ts` changes — `PlanDefinition` rows are inserted by the migration itself so a fresh `prisma migrate deploy` produces the same catalog as a migrated prod.
- The larger schema refactor from `openspec/prd-pos-stabilization.md` (FR-100) which will eventually collapse `BusinessFeatures` into `Business` itself — this change is the minimum migration to get the *current* repo schema into the *current* prod DB. The two are sequential, not parallel.
- Removal of the legacy `seed-business-features.ts` seed path (kept for back-compat until FR-100 lands).
- `DATABASE_URL_UNPOOLED` (referenced by `schema.prisma` but missing from `.env`) — pre-existing config gap, not blocking this change.

## Capabilities

### New Capabilities

- `pg-trgm-search`: Adds the `pg_trgm` extension and GIN/trigram indexes for trigram-accelerated product/client search. Capability is new at the spec level because the existing `account-ledger` and `invoice-flow` specs do not cover trigram-based search behaviour.

### Modified Capabilities

- `plan-definition`: Requirements must be amended to:
  - Cover the **backfill algorithm** that maps each old `BusinessFeatures` column set to a `(planDefinitionId, overrides)` pair so the post-migration `ResolvedFeatures` equals the pre-migration columns.
  - State that `PlanDefinition` rows are inserted by the migration (not by `prisma db seed`) so the catalog is identical on fresh and migrated databases.
  - Note the two-sources-of-truth coupling with `PLAN_SEEDS` in `src/types/plan.ts` as a documented follow-up risk (the spec will gain a "Plan catalog consistency" requirement that the seed/migration values **MUST** be kept in lockstep).

## Approach

Author a single timestamped Prisma migration whose SQL is the exact `prisma migrate diff --from-url $DATABASE_URL --to-schema-datamodel prisma/schema.prisma --script` output, then **hand-edit** the generated SQL to add (a) the `INSERT INTO "PlanDefinition" ...` statements for the 5 seed rows and (b) the per-row `UPDATE "BusinessFeatures" SET "overrides" = ...::jsonb WHERE "businessId" = '...'` backfills derived from the 5 production rows.

The migration is split into three logical sections via `--BEGIN / --COMMIT` boundaries inside the file (not separate migrations) so a single `migrate deploy` is atomic:

1. **DDL** — `CREATE TABLE` PlanDefinition/DailyUsage, `ALTER TABLE` BusinessFeatures, `ALTER TABLE` Business, `ALTER TABLE` Client, `ALTER TYPE Plan ADD VALUE 'DEMO'`, FK + indexes.
2. **Seed** — `INSERT INTO "PlanDefinition"` the 5 rows in dependency order (no inter-row FKs, so order is cosmetic).
3. **Backfill** — `UPDATE "BusinessFeatures" SET "planDefinitionId" = (SELECT id FROM "PlanDefinition" WHERE name = ...), "overrides" = ...::jsonb` for each of the 5 rows whose current values diverge from their plan's defaults. Rows that already match their plan defaults get `overrides = NULL`.

Apply the `20260626000001_add_pg_trgm_search` migration as a follow-up `migrate deploy` (or fold it in — the spec phase will decide; this proposal just calls out that it MUST be applied).

Reconcile the orphan migration by reading its `_prisma_migrations` row (checksum + name) and running `prisma migrate resolve --applied 0001_add_pos_core_models`.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `prisma/migrations/{ts}_add_plan_definition_and_pg_trgm/migration.sql` | New | The migration file itself |
| `prisma/schema.prisma` | Unchanged | Already on the target shape (verified line-by-line) |
| `prisma/seed.ts` | Unchanged | Will continue to upsert `PlanDefinition` rows for idempotency; the migration just guarantees they exist on first apply |
| `src/lib/plan-resolver.ts` | Unchanged | Already consumes `planDefinitionId` + `overrides` |
| `src/lib/auth-gates.ts` | Unchanged | Already calls `getEffectivePlan` |
| `src/types/plan.ts` | Unchanged | `PLAN_SEEDS` remains the canonical TypeScript-side catalog (see Risks) |
| `openspec/specs/plan-definition/spec.md` | Modified | Delta spec covers the backfill algorithm + migration-as-catalog-source requirements |
| `openspec/specs/pg-trgm-search/spec.md` | New | Capability spec for the trigram search behaviour |
| `.agents/local/verify-plan-backfill.mjs` | New | Ad-hoc verification script (gitignored, not part of the change) |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| `overrides` JSON backfill is wrong → `getEffectivePlan` returns different features than the old columns → tenants silently lose access (e.g. `hasAfipBilling` flips from `true` to `false`) | Med | (1) For each of the 5 prod rows, hand-compute the expected `overrides` object, write it into the migration, and run the verification script that re-derives `ResolvedFeatures` and asserts equality. (2) Migration is wrapped in a single transaction; if any `UPDATE` violates an assertion, the whole `migrate deploy` rolls back. (3) Rollback is restoring the pre-migration `pg_dump` (see Rollback Plan). |
| `PLAN_SEEDS` in `src/types/plan.ts` drifts from the `PlanDefinition` rows inserted by the migration | Med | Spec adds a "Plan catalog consistency" requirement that any change to `PLAN_SEEDS` MUST be paired with a new migration that updates the `PlanDefinition` rows. The PRD-driven FR-100 refactor is the eventual cure (single source of truth). |
| `ALTER TYPE "Plan" ADD VALUE 'DEMO'` fails because Postgres 16 disallows adding enum values inside a transaction with other DDL on the same enum | Low | Postgres 16 actually permits this; if it fails, split the `ALTER TYPE` into its own pre-migration file and chain it. The diff is already separated from the other DDL in the source script. |
| `DATABASE_URL_UNPOOLED` unset → Prisma client generation fails | Low | Unrelated to this change; pre-existing. The `prisma generate` step will warn but `migrate deploy` does not require it. |
| Orphan migration `0001_add_pos_core_models` cannot be resolved if its stored checksum does not match the on-disk SQL (which doesn't exist) | Low | The `--applied` flag bypasses checksum verification by design; we accept it on faith that prod already has those tables. Verified by `pg_dump --table=_prisma_migrations` against `posdemo_bkp` showing the row exists. |
| The `posdemo_bkp` DB is a pg_dump 17 export, but the production target runs Postgres 16 → some SQL is incompatible | Low | Verified `posdemo_bkp` restored cleanly into the local 16 container; no 17-only features in the diff script. The container also runs 16. |
| `Client.cuit` / `Client.ivaCondition` columns are added but no code path uses them yet → dead columns | Low | Both columns are nullable, so they do not block existing code. The change proposal does not add server-action reads for them — that is a separate future change. |

## Rollback Plan

This migration is **destructive** (`DROP COLUMN` × 8 on `BusinessFeatures`). The rollback strategy is a database restore, not a reverse migration.

1. **Local / staging** (`posdemo_bkp`): A pre-migration `pg_dump` snapshot was saved at `C:\Users\Lautaro\Desktop\Projects\POS-Jero\POS-Template\.agents\local\schema_before.sql`. To roll back:
   ```bash
   docker exec pos-postgres dropdb -U postgres posdemo_bkp
   docker exec pos-postgres createdb -U postgres posdemo_bkp
   docker exec -i pos-postgres psql -U postgres -d posdemo_bkp < .agents/local/schema_before.sql
   ```
2. **Production**: Before the deploy, a manual `pg_dump --schema-only --data-only` snapshot of the production database MUST be taken and archived off-box. Rollback = restore that snapshot into a new DB, point the app at it via `DATABASE_URL`, revert the deploy.
3. **No code rollback**: The runtime code is already on the new model and is not changing in this change, so there is no app-side revert. If the migration succeeds and the app still errors, the bug is in the migration data, not the code.

If the `20260626000001_add_pg_trgm_search` migration was already applied, its rollback is `DROP EXTENSION pg_trgm CASCADE;` — safe because the indexes it created depend on the extension and `CASCADE` removes them.

## Dependencies

- `prisma` CLI available locally (already in `devDependencies`).
- Local `posdemo_bkp` reachable on the configured `DATABASE_URL` (already configured in `.env`).
- Postgres 16 in container `pos-postgres` (already running).
- Pre-migration `pg_dump` snapshot at `.agents/local/schema_before.sql` (already taken).

## Success Criteria

- [ ] `npx prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel prisma/schema.prisma --script` returns an empty script (no pending diff).
- [ ] `npx prisma migrate status` reports all migrations applied, with no drift warning for `0001_add_pos_core_models`.
- [ ] `SELECT count(*) FROM "PlanDefinition"` returns 5 with names BASIC, PRO, ENTERPRISE, DEMO, CUSTOM.
- [ ] The verification script (Node) computes `getEffectivePlan` for each of the 5 businesses and asserts it equals the pre-migration column-derived feature set.
- [ ] `npm run dev` starts without Prisma client errors and `/login` + `/register` render.
- [ ] `git grep "BusinessFeatures\.hasAfipBilling\|BusinessFeatures\.hasPublicCatalog\|BusinessFeatures\.hasClientLedger\|BusinessFeatures\.hasMultiCashbox\|BusinessFeatures\.hasSupplierFilter\|BusinessFeatures\.maxUsers\|BusinessFeatures\.maxProducts\|BusinessFeatures\.plan"` returns zero non-migration matches (i.e. no live code path reads the dropped columns).
