# Master Enhancement Plan — Tasks

## Meta-Tasks (Plan Definition)

- [x] 0.1 — Define source documents (03-cons.md, 04-incoming-features.md)
- [x] 0.2 — Group issues into 7 phases by dependency
- [x] 0.3 — Create openspec directory structure
- [x] 0.4 — Write master proposal.md
- [x] 0.5 — Write master spec (specs/plan/spec.md)
- [x] 0.6 — Write master design.md
- [ ] 0.7 — Define Phase 1 individual change proposals (DETAILED)
- [ ] 0.8 — Define Phase 2-7 change proposals (OUTLINE)
- [ ] 0.9 — Persist to Engram (this session)
- [ ] 0.10 — Present to user for consent

## Phase 1: Quick Wins — Code Hygiene

### 1.1 dead-code-removal (C-17)
- [ ] 1.1.1 — Create change folder + SDD artifacts
- [ ] 1.1.2 — Remove commented SeedButton in newBill/page.tsx
- [ ] 1.1.3 — Audit and remove unused Firebase imports (src/firebase/stock/*, orders/*, clients/*)
- [ ] 1.1.4 — Remove any unreferenced exports
- [ ] 1.1.5 — Verify no build errors
- [ ] 1.1.6 — Archive change

### 1.2 error-handling-unification (C-12)
- [ ] 1.2.1 — Create change folder + SDD artifacts
- [ ] 1.2.2 — Define ActionResult<T> type in shared lib
- [ ] 1.2.3 — Migrate all read actions from [] return to ActionResult
- [ ] 1.2.4 — Migrate all mutation actions to ActionResult
- [ ] 1.2.5 — Update clients to handle new return types
- [ ] 1.2.6 — Verify TypeScript + all tests pass
- [ ] 1.2.7 — Archive change

### 1.3 pre-commit-hooks (C-18)
- [ ] 1.3.1 — Create change folder + SDD artifacts
- [ ] 1.3.2 — Install husky + lint-staged
- [ ] 1.3.3 — Configure pre-commit: tsc --noEmit + lint + test
- [ ] 1.3.4 — Test hook works end-to-end
- [ ] 1.3.5 — Archive change

### 1.4 test-dom-unification (C-16)
- [ ] 1.4.1 — Create change folder + SDD artifacts
- [ ] 1.4.2 — Remove happy-dom from vitest config and deps
- [ ] 1.4.3 — Verify all tests pass with jsdom-only
- [ ] 1.4.4 — Archive change

## Phase 2: Bundle & Performance

### 2.1 bundle-optimization (C-14)
- [ ] 2.1.1 — Create change folder + SDD artifacts
- [ ] 2.1.2 — Migrate moment → date-fns (all imports)
- [ ] 2.1.3 — Dynamic import xlsx in bulk upload component
- [ ] 2.1.4 — Dynamic import jspdf + html2canvas in print components
- [ ] 2.1.5 — Unify toast: choose sonner, remove react-hot-toast
- [ ] 2.1.6 — Verify bundle size reduction with next/bundle-analyzer
- [ ] 2.1.7 — Archive change

### 2.2 n-plus-one-fixes (C-07)
- [ ] 2.2.1 — Create change folder + SDD artifacts
- [ ] 2.2.2 — Fix bulkUpdatePrices: replace individual findUnique with findMany
- [ ] 2.2.3 — Fix bulkUpdateAmounts: same pattern
- [ ] 2.2.4 — Audit other Promise.all(findUnique) patterns
- [ ] 2.2.5 — Verify tests pass, no regressions
- [ ] 2.2.6 — Archive change

### 2.3 billprovider-refactor (C-11)
- [ ] 2.3.1 — Create change folder + SDD artifacts
- [ ] 2.3.2 — Replace 20 dispatch wrappers with single dispatch prop
- [ ] 2.3.3 — Update context consumers to use dispatch directly
- [ ] 2.3.4 — Verify billing flow works end-to-end
- [ ] 2.3.5 — Archive change

## Phase 3: Data & Architecture

### 3.1 pagination-strategy (C-03)
- [ ] 3.1.1 — Create change folder + SDD artifacts
- [ ] 3.1.2 — Convert getProducts() to always use getProductsPaginated
- [ ] 3.1.3 — Implement cursor-based pagination for getSalesAction
- [ ] 3.1.4 — Replace hardcoded take:20 / take:1100 with configurable constants
- [ ] 3.1.5 — Add pagination UI to affected components
- [ ] 3.1.6 — Verify with large dataset
- [ ] 3.1.7 — Archive change

### 3.2 type-safety (C-09)
- [ ] 3.2.1 — Create change folder + SDD artifacts
- [ ] 3.2.2 — Fix @ts-expect-error in cashbox.ts by extending NextAuth types
- [ ] 3.2.3 — Remove as unknown as casts in sales.ts by aligning BillState
- [ ] 3.2.4 — Replace as any in auth.ts with typed Business
- [ ] 3.2.5 — Verify tsc --noEmit passes clean
- [ ] 3.2.6 — Archive change

### 3.3 action-files-split (C-08)
- [ ] 3.3.1 — Create change folder + SDD artifacts
- [ ] 3.3.2 — Split stock.ts → stock/products.ts, stock/suppliers.ts, stock/bulk.ts
- [ ] 3.3.3 — Split sales.ts → sales/process.ts, sales/returns.ts, sales/history.ts
- [ ] 3.3.4 — Update all imports across the codebase
- [ ] 3.3.5 — Verify all tests pass
- [ ] 3.3.6 — Archive change

### 3.4 bulk-upload-performance (C-04)
- [ ] 3.4.1 — Create change folder + SDD artifacts
- [ ] 3.4.2 — Batch lookup all brands, categories, subcategories in one query each
- [ ] 3.4.3 — Use createMany for new brands/categories
- [ ] 3.4.4 — Process products in batches of 100 with $transaction
- [ ] 3.4.5 — Benchmark: verify query reduction (5000 → ~50)
- [ ] 3.4.6 — Archive change

## Phase 4: Caching & Images

### 4.1 server-actions-caching (C-01)
- [ ] 4.1.1 — Create change folder + SDD artifacts
- [ ] 4.1.2 — Implement React.cache() for auth() in lib/auth.ts
- [ ] 4.1.3 — Replace revalidatePath with revalidateTag per domain
- [ ] 4.1.4 — Implement Data Cache for read-only queries
- [ ] 4.1.5 — Add cache tags to all Server Actions
- [ ] 4.1.6 — Verify cache invalidation works correctly
- [ ] 4.1.7 — Archive change

### 4.2 image-optimization (C-06)
- [ ] 4.2.1 — Create change folder + SDD artifacts
- [ ] 4.2.2 — Configure next/image with proper remotePatterns
- [ ] 4.2.3 — Replace <img> with next/image in product components
- [ ] 4.2.4 — Add lazy loading with sizes attribute
- [ ] 4.2.5 — Add placeholder blur while images load
- [ ] 4.2.6 — Archive change

## Phase 5: Quality & Security

### 5.1 middleware-review (C-15)
- [ ] 5.1.1 — Create change folder + SDD artifacts
- [ ] 5.1.2 — Audit current route protection in routes.ts
- [ ] 5.1.3 — Verify public catalog accessible without auth
- [ ] 5.1.4 — Verify all /(protected) routes require auth
- [ ] 5.1.5 — Add missing protections if any
- [ ] 5.1.6 — Archive change

### 5.2 rate-limiting (C-13)
- [ ] 5.2.1 — Create change folder + SDD artifacts
- [ ] 5.2.2 — Install rate limiting library (upstash or similar)
- [ ] 5.2.3 — Add rate limits to catalog.ts public endpoints
- [ ] 5.2.4 — Add rate limits to public-orders.ts
- [ ] 5.2.5 — Configure threshold limits
- [ ] 5.2.6 — Archive change

### 5.3 e2e-tests (C-10)
- [ ] 5.3.1 — Create change folder + SDD artifacts
- [ ] 5.3.2 — Install Playwright
- [ ] 5.3.3 — Write E2E test: login
- [ ] 5.3.4 — Write E2E test: open session → sell → close session
- [ ] 5.3.5 — Write E2E test: product CRUD
- [ ] 5.3.6 — Add to CI
- [ ] 5.3.7 — Archive change

## Phase 6: Legacy & UX

### 6.1 firebase-migration (C-02)
- [ ] 6.1.1 — Create change folder + SDD artifacts
- [ ] 6.1.2 — Audit src/firebase/ for active vs legacy code
- [ ] 6.1.3 — Remove unused Firebase files
- [ ] 6.1.4 — Migrate any active Firebase code to Prisma
- [ ] 6.1.5 — Verify no remaining Firebase dependencies beyond Storage
- [ ] 6.1.6 — Archive change

### 6.2 optimistic-updates (C-05)
- [ ] 6.2.1 — Create change folder + SDD artifacts
- [ ] 6.2.2 — Implement optimistic cart updates with useOptimistic
- [ ] 6.2.3 — Add rollback on error with toast notification
- [ ] 6.2.4 — Verify cart consistency across rapid interactions
- [ ] 6.2.5 — Archive change

## Phase 7: New Features

### 7.1 ui-enhancements (F1)
- [ ] 7.1.1 — Create change folder + SDD artifacts
- [ ] 7.1.2 — Define CSS custom properties for design tokens
- [ ] 7.1.3 — Create CVA variants for core UI components
- [ ] 7.1.4 — Apply minimalist design refinements
- [ ] 7.1.5 — Archive change

### 7.2 business-configuration (F2)
- [ ] 7.2.1 — Create change folder + SDD artifacts
- [ ] 7.2.2 — Extend Prisma schema with branding/config fields
- [ ] 7.2.3 — Build admin panel UI (General, Branding, Features, Users tabs)
- [ ] 7.2.4 — Implement save/load Server Actions
- [ ] 7.2.5 — Integrate branding into layout
- [ ] 7.2.6 — Archive change

### 7.3 fetching-performance (F3)
- [ ] 7.3.1 — Create change folder + SDD artifacts
- [ ] 7.3.2 — Implement data prefetching for high-traffic pages
- [ ] 7.3.3 — Add React.Suspense boundaries with fallbacks
- [ ] 7.3.4 — Optimize waterfall requests with Promise.all
- [ ] 7.3.5 — Archive change

### 7.4 overall-performance (F4)
- [ ] 7.4.1 — Create change folder + SDD artifacts
- [ ] 7.4.2 — Lighthouse audit and fix issues
- [ ] 7.4.3 — Add Web Vitals monitoring
- [ ] 7.4.4 — Final bundle size optimization
- [ ] 7.4.5 — Archive change
