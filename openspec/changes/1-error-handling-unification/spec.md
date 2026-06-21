# Spec: error-handling-unification

**Source:** C-12  
**Phase:** 1 — Quick Wins  
**Effort:** ~2 days  
**Risk:** Medium  

## Requirements

### R1: Define ActionResult<T> type
- Add `ActionResult<T>` discriminated union in `src/lib/action-result.ts`
- Include `success: true` (with optional `data` and `message`) and `success: false` (with `error` string and optional `code`)
- Export `ErrorCode` union type
- Importable from any action file

### R2: Migrate auth-gates.ts to return pattern
- Replace `throw new FeatureAccessError(...)` with `return { success: false, error: "...", code: "FORBIDDEN" }`
- Remove `FeatureAccessError` class
- Keep same error messages and codes
- All callers updated to check `success` instead of try/catch

### R3: Migrate throw statements in actions
- All `throw new Error(...)` in action files must be replaced with `return { success: false, error: "..." }`
- Exceptions: throw only for truly unexpected programming errors, not user-facing validation

### R4: Standardize return format
- All mutations: `return { success: true, data: result }` or `return { success: false, error: "..." }`
- All reads: `return { success: true, data: items }` instead of `return []` / `return null`
- Unify error messages (Spanish, user-facing, without technical details)

### R5: Update consumers
- All client components consuming actions must handle `ActionResult` discriminated union
- Replace try/catch patterns where appropriate
- Toast errors consistently via `react-hot-toast`

## Acceptance Criteria

- [ ] `ActionResult<T>` type defined and exported
- [ ] `auth-gates.ts` returns ActionResult instead of throwing
- [ ] All `throw new Error` in actions replaced with ActionResult returns
- [ ] All actions return `{ success, data }` or `{ success, error }` consistently
- [ ] `npx tsc --noEmit` passes with zero errors
- [ ] `npm run build` passes
- [ ] `npm run test` — no regressions
