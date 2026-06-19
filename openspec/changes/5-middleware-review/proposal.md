# Change: middleware-review

**Source:** C-15 (docs/enhancements/03-cons.md)  
**Phase:** 5 — Quality & Security  
**Effort:** ~2 days  
**Risk:** High  

## Problem

Auth middleware configuration in `routes.ts` and `auth.config.ts` needs auditing. Risk of:
- Unprotected routes behind `/(protected)/`
- Over-protected public routes (catalog, public orders)
- Missing redirect logic for unauthenticated users

## Scope

`routes.ts`, `auth.config.ts`, `src/middleware.ts` (if exists)

## Solution

1. Read and document current route protection matrix
2. Verify public catalog routes are accessible without auth
3. Verify all `/(protected)/*` routes require auth
4. Add/remove protections as needed
5. Test all route categories

## Rollback

Revert route config changes. Auth changes are config-only.

## Affected Files

- `routes.ts`
- `auth.config.ts`
