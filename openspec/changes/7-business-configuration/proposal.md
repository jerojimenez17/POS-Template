# Change: business-configuration

**Source:** F2 (docs/enhancements/04-incoming-features.md)  
**Phase:** 7 — New Features  
**Effort:** ~5 days  
**Risk:** High  

## Problem

Business configuration is hardcoded in Prisma schema. There is no admin panel for:
- Toggling features per business (hasClientLedger, hasAfipBilling, etc.)
- Configuring branding (colors, logo)
- Managing users and roles
- Viewing subscription/plan status

## Scope

Prisma schema, `src/app/(protected)/admin/`, `src/actions/business.ts`

## Solution

1. **Schema Extension**: Add `brandColor`, `accentColor`, `timezone`, `currency` to Business model
2. **BusinessFeatures Extension**: Add `hasCustomBranding`, `hasDashboardReports`, `hasApiAccess` toggles
3. **Admin Panel UI**: Tab-based panel (General → Branding → Features → Users → Subscription)
4. **Server Actions**: CRUD for business settings with Zod validation
5. **Layout Integration**: Apply saved branding to UI

## Rollback

Revert schema changes. Remove admin panel routes. Schema migration may need rollback.

## Affected Files

- `prisma/schema.prisma` — Business + BusinessFeatures extensions
- `src/actions/business.ts` — new CRUD actions
- `src/app/(protected)/admin/page.tsx` — admin dashboard
- `src/app/(protected)/admin/branding/page.tsx`
- `src/app/(protected)/admin/features/page.tsx`
- Layout files — apply branding
