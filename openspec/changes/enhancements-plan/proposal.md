# Master Enhancement Plan — Proposal

## Problem Statement

The POS-Template codebase was analyzed in `docs/enhancements/` and 18 distinct issues were identified (C-01 through C-18), plus 4 incoming feature requirements (F1-F4). These range from CRITICAL (no caching strategy, dual persistence, un-paginated queries) to LOW (dead code, missing pre-commit hooks).

Without a structured plan, fixes will be applied ad-hoc, risking regressions, duplicated effort, and missed dependencies between issues.

## Proposed Solution

A **7-phase iterative plan** where each issue is treated as an SDD change with proposal → spec → design → tasks → apply → verify → archive. Changes are grouped into phases by dependency and impact.

## Affected Modules

| Module | Issues |
|--------|--------|
| All Server Actions (`src/actions/`) | C-01, C-03, C-07, C-08, C-09, C-12 |
| Firebase (`src/firebase/`) | C-02, C-17 |
| Context (`src/context/`) | C-05, C-11 |
| Components (`src/components/`) | C-05, C-06, F1 |
| Config (`next.config.ts`, `package.json`) | C-06, C-14 |
| Testing (`src/__tests__/`) | C-10, C-16 |
| Security/Infra | C-13, C-15, C-18 |
| New Features | F1, F2, F3, F4 |

## Plan Overview

```mermaid
gantt
    title Enhancement Roadmap — 7 Phases
    dateFormat  YYYY-MM-DD
    axisFormat  %b %d
    
    section Phase 1: Quick Wins
    Dead Code Removal        :p1a, 2026-06-15, 2d
    Error Handling Unify     :p1b, after p1a, 2d
    Pre-commit Hooks         :p1c, after p1b, 1d
    Test DOM Unification     :p1d, after p1c, 1d

    section Phase 2: Bundle & Perf
    Bundle Optimization      :p2a, after p1d, 3d
    N+1 Fixes                :p2b, after p2a, 2d
    BillProvider Refactor    :p2c, after p2b, 2d

    section Phase 3: Data & Arch
    Pagination Strategy      :p3a, after p2c, 3d
    Type Safety              :p3b, after p3a, 2d
    Action Files Split       :p3c, after p3b, 2d
    Bulk Upload Perf         :p3d, after p3c, 2d

    section Phase 4: Caching & Images
    Server Actions Caching   :p4a, after p3d, 3d
    Image Optimization       :p4b, after p4a, 2d

    section Phase 5: Quality & Security
    Middleware Review        :p5a, after p4b, 2d
    Rate Limiting            :p5b, after p5a, 2d
    E2E Tests                :p5c, after p5b, 4d

    section Phase 6: Legacy & UX
    Firebase Migration       :p6a, after p5c, 3d
    Optimistic Updates       :p6b, after p6a, 3d

    section Phase 7: New Features
    UI Enhancements          :p7a, after p6b, 5d
    Business Configuration   :p7b, after p6b, 5d
    Fetching Performance     :p7c, after p6b, 3d
    Overall Performance      :p7d, after p7c, 3d
```

## Dependency Graph

```mermaid
flowchart TD
    P1["Phase 1: Quick Wins"] --> P2["Phase 2: Bundle & Perf"]
    P2 --> P3["Phase 3: Data & Arch"]
    P3 --> P4["Phase 4: Caching & Images"]
    P4 --> P5["Phase 5: Quality & Security"]
    P5 --> P6["Phase 6: Legacy & UX"]
    P6 --> P7["Phase 7: New Features"]

    subgraph P1Deps["Phase 1"]
        DCR["dead-code-removal"]
        EHU["error-handling-unification"]
        PCH["pre-commit-hooks"]
        TDU["test-dom-unification"]
    end

    subgraph P2Deps["Phase 2"]
        BO["bundle-optimization"]
        NF["n-plus-one-fixes"]
        BR["billprovider-refactor"]
    end

    subgraph P3Deps["Phase 3"]
        PS["pagination-strategy"]
        TS["type-safety"]
        AFS["action-files-split"]
        BUP["bulk-upload-performance"]
    end

    subgraph P4Deps["Phase 4"]
        SAC["server-actions-caching"]
        IO["image-optimization"]
    end

    subgraph P5Deps["Phase 5"]
        MR["middleware-review"]
        RL["rate-limiting"]
        E2E["e2e-tests"]
    end

    subgraph P6Deps["Phase 6"]
        FM["firebase-migration"]
        OU["optimistic-updates"]
    end

    subgraph P7Deps["Phase 7"]
        UE["ui-enhancements"]
        BC["business-configuration"]
        FP["fetching-performance"]
        OP["overall-performance"]
    end

    DCR --> BO
    EHU --> AFS
    PS --> SAC
    NF --> BUP
    BR --> OU
    SAC --> OP
    FM --> BC
    IO --> UE
    E2E --> OP
```

## Branch Strategy

Each change in every phase will be developed in its own branch following:
```
{phase-number}-{change-name}
```

Example: `1-dead-code-removal`, `3-pagination-strategy`

Conventional commits scoped by change name:
- `feat(actions): add ActionResult<T> unified return type`
- `fix(stock): batch queries in bulkUpdatePrices`
- `refactor(billing): simplify dispatch pattern in BillProvider`
- `chore(deps): remove moment, add dynamic imports`
- `test(e2e): add Playwright for sale flow`
- `docs(enhancements): archive phase report`

## Total Estimate

| Phase | Changes | Est. Duration |
|-------|---------|---------------|
| 1 — Quick Wins | 4 | ~6 days |
| 2 — Bundle & Perf | 3 | ~7 days |
| 3 — Data & Arch | 4 | ~9 days |
| 4 — Caching & Images | 2 | ~5 days |
| 5 — Quality & Security | 3 | ~8 days |
| 6 — Legacy & UX | 2 | ~6 days |
| 7 — New Features | 4 | ~16 days |
| **Total** | **22** | **~57 days** |

## Rollback Plan

If any change introduces regressions:
1. Revert the feature branch (`git revert`)
2. Document what failed in the change's archive report
3. Create a follow-up change with the fix

## Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Firebase migration breaks existing features | High | Phase 6, after all tests are in place |
| Caching introduces stale data | Medium | Short TTLs, revalidateTag() granular |
| UI redesign hurts productivity | Medium | CSS variables first, no layout changes in Phase 7 |
