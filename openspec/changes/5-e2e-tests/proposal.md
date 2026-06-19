# Change: e2e-tests

**Source:** C-10 (docs/enhancements/03-cons.md), F4 (Performance General)  
**Phase:** 5 — Quality & Security  
**Effort:** ~4 days  
**Risk:** Low  

## Problem

No end-to-end tests exist. Current test coverage is limited to unit and integration tests. Critical business flows (login → sell → close session) are not validated as complete user journeys.

## Scope

New `tests/e2e/` directory.

## Solution

1. Install Playwright
2. Create E2E test structure
3. Write tests for critical flows:
   - User login/logout
   - Open cash session → process sale → close session
   - Product CRUD
   - Search and view sales
4. Add E2E script to `package.json`
5. Document how to run E2E tests

## Rollback

Remove Playwright config and test files. No production impact.

## Affected Files

- `tests/e2e/` (new directory)
- `playwright.config.ts` (new)
- `package.json` (scripts + devDependencies)
