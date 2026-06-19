# Tasks: error-handling-unification

**Source:** C-12  
**Phase:** 1 — Quick Wins  

## Task Breakdown

### T1: Create ActionResult type
- **File**: Create `src/lib/action-result.ts`
- **Content**: `ActionResult<T>`, `ErrorCode`, `ok()`, `fail()` helpers
- **Verification**: Importable from other files

### T2: Migrate auth-gates.ts
- **File**: `src/lib/auth-gates.ts`
- **Action**: Return `ActionResult<User>` instead of throw
- **Update callers**: All ~100 action files that import from auth-gates

### T3: Migrate throw to return in actions
- **Files**: `src/actions/*.ts` (all throw sites)
- **Action**: Replace `throw new Error(...)` with `return fail("...")` in user-facing validation contexts
- **Keep**: Throws for truly unexpected programming errors only

### T4: Standardize silent returns
- **Files**: Action files that return `[]` or `null`
- **Action**: Wrap in `{ success: true, data: result }`

### T5: Update client components
- **Files**: Consumer components that call actions
- **Action**: Handle `ActionResult` discriminated union, replace try/catch with `if (!result.success)` pattern
- **Verification**: Toast errors still display correctly

### T6: Final verification
- `npx tsc --noEmit` — zero errors
- `npm run build` — success
- `npm run test` — no regressions

## Workload Forecast

- Total files touched: ~30+ (1 new + 20+ actions + 10+ components)
- Review risk: **Medium** — many files changed, but mechanical pattern
- Commit strategy: 3 work-unit commits (type → actions → consumers)
