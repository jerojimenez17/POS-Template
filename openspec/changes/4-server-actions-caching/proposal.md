# Change: server-actions-caching

**Source:** C-01 (docs/enhancements/03-cons.md)  
**Phase:** 4 — Caching & Images  
**Effort:** ~3 days  
**Risk:** High  

## Problem

Server Actions have no caching strategy:
1. `auth()` called at the start of EVERY action — each call decodes JWT + may query DB
2. No Data Cache for read-only queries (products, categories, brands)
3. `revalidatePath()` is overly aggressive — up to 5 paths revalidated per sale
4. No granular cache invalidation

## Scope

`src/lib/auth.ts`, all Server Actions in `src/actions/`

## Solution

1. **React.cache() for auth**: Wrap `auth()` with `cache()` so repeated calls in same request reuse result
2. **revalidateTag instead of revalidatePath**: Tag-based invalidation per domain
3. **Data Cache for reads**: Use Next.js `unstable_cache` for read-only queries where appropriate

```typescript
// lib/auth.ts
import { cache } from "react";
export const getSession = cache(async () => await auth());

// In actions, replace:
//   const session = await auth();
// With:
//   const session = await getSession();
```

## Rollback

Revert to direct `auth()` calls. Remove cache wrapper.

## Affected Files

- `src/lib/auth.ts` — Add getSession with React.cache()
- All `src/actions/*.ts` — Replace auth() with getSession()
- Cache invalidation in action mutations
