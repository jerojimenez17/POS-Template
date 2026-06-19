# Master Enhancement Plan — Specification

## Overview

This document defines the specification for the entire enhancements plan. Each individual change within a phase will have its own detailed spec, design, and tasks.

## Sources

- `docs/enhancements/03-cons.md` — 18 identified codebase issues
- `docs/enhancements/04-incoming-features.md` — 4 planned feature areas
- `docs/enhancements/02-pros.md` — 11 strengths to preserve

## Functional Requirements

### FR-01: Phased Execution
The plan MUST be executed in 7 sequential phases. Each phase MUST complete before the next begins.
Exception: Phase 7 changes MAY run in parallel.

### FR-02: Isolated Changes
Each C-## or F# issue MUST be implemented as an independent SDD change with:
- Dedicated feature branch
- Independent proposal, spec, design, tasks
- Its own verify and archive phases

### FR-03: Branch Convention  
All branches MUST follow the pattern `{phase-number}-{change-name}`.
All commits MUST use conventional commits with scope matching the change.

### FR-04: Preservation
No change MAY break existing functionality. All tests MUST pass after each change.
Backward compatibility MUST be maintained within each phase.

### FR-05: User Consent
Each phase requires explicit user consent before execution begins. Each change within a phase requires explicit user consent before apply.

## Non-Functional Requirements

### NFR-01: Testing
| Change Type | Required Verification |
|-------------|---------------------|
| Bug fix (C-*) | Existing tests MUST pass |
| Refactor (C-*) | TypeScript MUST compile clean |
| New feature (F*) | New tests covering the feature |
| Dependency change | Build MUST succeed |

### NFR-02: Performance Budget
| Metric | Threshold |
|--------|-----------|
| Bundle size reduction for Phase 2 | ≥ 1MB JS reduction |
| Paginated queries | No query returns > 100 rows without cursor |
| Image size | No image served > 300KB (thumbnails) |
| API response time | Server Actions < 500ms p95 |

## Phase Specifications

### Phase 1: Quick Wins — Code Hygiene
**Duration:** ~1 week | **Changes:** 4

#### Change 1.1: dead-code-removal (C-17)
- **Problem**: Commented code blocks, unused Firebase legacy imports, seed buttons
- **Scope**: All `src/` files
- **Action**: Remove dead code, no functional changes

#### Change 1.2: error-handling-unification (C-12)
- **Problem**: Three error patterns coexist (throw, {error}, [])
- **Scope**: All Server Actions
- **Action**: Define `ActionResult<T>` type, migrate all actions

#### Change 1.3: pre-commit-hooks (C-18)
- **Problem**: No pre-commit hooks, inconsistent commit quality
- **Scope**: Root project
- **Action**: Husky + lint-staged, TypeScript check on commit

#### Change 1.4: test-dom-unification (C-16)
- **Problem**: Both happy-dom and jsdom configured
- **Scope**: vitest.config.mts
- **Action**: Pick jsdom, remove happy-dom

### Phase 2: Bundle & Performance
**Duration:** ~1 week | **Changes:** 3

#### Change 2.1: bundle-optimization (C-14)
- **Problem**: moment, xlsx, jspdf, html2canvas, framer-motion, dual toasts
- **Scope**: package.json, components
- **Action**: Remove moment (→ date-fns), dynamic imports, unify toasts

#### Change 2.2: n-plus-one-fixes (C-07)
- **Problem**: Individual findUnique per product in bulk operations
- **Scope**: stock.ts bulkUpdatePrices, bulkUpdateAmounts
- **Action**: Replace with findMany { in: ids }

#### Change 2.3: billprovider-refactor (C-11)
- **Problem**: 20 individual dispatch wrapper functions
- **Scope**: BillProvider.tsx
- **Action**: Expose dispatch directly, reduce boilerplate

### Phase 3: Data & Architecture
**Duration:** ~1.5 weeks | **Changes:** 4

#### Change 3.1: pagination-strategy (C-03)
- **Problem**: getProducts() returns all, getSalesAction take:1100 hardcoded
- **Scope**: stock.ts, sales.ts
- **Action**: Paginate all list endpoints, cursor-based for large sets

#### Change 3.2: type-safety (C-09)
- **Problem**: @ts-expect-error, as unknown as, as any
- **Scope**: cashbox.ts, sales.ts, auth.ts
- **Action**: Fix types, extend NextAuth types, remove casts

#### Change 3.3: action-files-split (C-08)
- **Problem**: stock.ts (854 lines), sales.ts (749 lines)
- **Scope**: stock.ts, sales.ts
- **Action**: Split into domain subdirectories

#### Change 3.4: bulk-upload-performance (C-04)
- **Problem**: Sequential for...of in createProductsBulk
- **Scope**: stock.ts
- **Action**: Batch lookups, batch creates, reduce 5000 queries → ~50

### Phase 4: Caching & Images
**Duration:** ~1 week | **Changes:** 2

#### Change 4.1: server-actions-caching (C-01)
- **Problem**: auth() called every action, no Data Cache, aggressive revalidatePath
- **Scope**: All Server Actions, lib/auth.ts
- **Action**: React.cache() for auth, revalidateTag(), granular invalidation

#### Change 4.2: image-optimization (C-06)
- **Problem**: No next/image optimization, no thumbnails, no lazy loading
- **Scope**: next.config.ts, components, firebase
- **Action**: next/image, thumbnail generation, lazy loading

### Phase 5: Quality & Security
**Duration:** ~1.5 weeks | **Changes:** 3

#### Change 5.1: middleware-review (C-15)
- **Problem**: Auth middleware configuration uncertain
- **Scope**: routes.ts, auth.config.ts
- **Action**: Audit and harden route protection

#### Change 5.2: rate-limiting (C-13)
- **Problem**: Public catalog/orders have no rate limiting
- **Scope**: catalog.ts, public-orders.ts
- **Action**: Add rate limiting with configurable thresholds

#### Change 5.3: e2e-tests (C-10)
- **Problem**: No E2E tests for critical flows
- **Scope**: tests/e2e/
- **Action**: Playwright setup, test login→sale→close session flow

### Phase 6: Legacy & UX
**Duration:** ~1 week | **Changes:** 2

#### Change 6.1: firebase-migration (C-02)
- **Problem**: Legacy Firebase code duplicates Prisma
- **Scope**: src/firebase/stock/, orders/, clients/
- **Action**: Audit, remove unused, migrate active code to Prisma

#### Change 6.2: optimistic-updates (C-05)
- **Problem**: Cart operations require full roundtrip
- **Scope**: BillProvider.tsx, BillButtons.tsx
- **Action**: Optimistic cart updates with rollback on error

### Phase 7: New Features
**Duration:** ~3 weeks | **Changes:** 4

#### Change 7.1: ui-enhancements (F1)
- **Problem**: No design system, no consistent branding
- **Scope**: globals.css, components/ui/, layout
- **Action**: Design tokens via CSS variables, CVA variants, minimalist refresh

#### Change 7.2: business-configuration (F2)
- **Problem**: No admin panel for business settings
- **Scope**: Prisma schema, src/app/admin/, src/actions/business.ts
- **Action**: Admin panel for branding, features, user management

#### Change 7.3: fetching-performance (F3)
- **Problem**: Combined caching + image + pagination optimization
- **Scope**: All data-fetching code
- **Action**: Implement full data fetching strategy with prefetching

#### Change 7.4: overall-performance (F4)
- **Problem**: Final performance tuning
- **Scope**: Global
- **Action**: Lighthouse audit, Web Vitals optimization, monitoring setup
