# Main Specs

## schema-plan-refactor (archived 2026-06-27)

### Purpose
Replace 8 hardcoded `BusinessFeatures` columns + `Plan` enum with a `PlanDefinition`-driven model. Features/limits stored as JSON templates, per-business overrides in JSON. Enables future Plan ABM without schema migrations.

### Key Requirements
- **PlanDefinition model**: 5 seeded plans (BASIC, PRO, ENTERPRISE, DEMO, CUSTOM) with `features Json` and `limits Json`
- **Feature resolution**: Merge `PlanDefinition.defaults` with `BusinessFeatures.overrides` — overrides win, null overrides = full defaults
- **Backward compatibility**: JWT `business.features` shape unchanged (9 original fields + 3 new), `auth-gates.ts` reads from JWT, `useFeatures.ts` unchanged
- **Migration**: Diff current vs plan defaults → overrides. SQL backup first. Zero data loss.
- **DEMO plan**: All features true, limits: 2 users, 10 products, 2 cashboxes, 2 clients, 2 sales/day
- **CUSTOM plan**: All features true, all limits 999999, fully overridable

### Key Design Decisions
- `Plan` enum kept in schema (unused by models) for backward compat with `@prisma/client` exports
- JWT-level resolution: auth.ts resolves at login, auth-gates.ts reads from session (zero changes)
- Throw on missing PlanDefinition (fail fast, no silent BASIC fallback)
- Override keys validated against PlanDefinition features/limits
