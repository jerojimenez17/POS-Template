# Change: rate-limiting

**Source:** C-13 (docs/enhancements/03-cons.md)  
**Phase:** 5 — Quality & Security  
**Effort:** ~2 days  
**Risk:** Medium  

## Problem

Public-facing Server Actions (`catalog.ts`, `public-orders.ts`) have no rate limiting. Any client can:
- Call `getPublicProductsByBusinessId()` unlimited times
- Submit public orders without restrictions

## Scope

`src/actions/catalog.ts`, `src/actions/public-orders.ts`

## Solution

1. Install rate limiting library (Upstash Ratelimit or similar in-memory solution)
2. Apply rate limit middleware to public actions
3. Configure thresholds: e.g., 100 requests/min per IP for catalog
4. Return 429 with retry-after header when exceeded

## Rollback

Remove rate limit middleware from actions.

## Affected Files

- `src/actions/catalog.ts`
- `src/actions/public-orders.ts`
- `package.json` (new dependency)
