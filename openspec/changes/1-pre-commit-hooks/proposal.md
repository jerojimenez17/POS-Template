# Change: pre-commit-hooks

**Source:** C-18 (docs/enhancements/03-cons.md)  
**Phase:** 1 — Quick Wins  
**Effort:** ~1 day  
**Risk:** Low  

## Problem

No pre-commit hooks configured. Commits can bypass TypeScript checks, linting, and tests, leading to inconsistent code quality.

## Scope

Root project configuration.

## Solution

1. Install `husky` and `lint-staged`
2. Configure `lint-staged` to run on staged `.ts`/`.tsx` files:
   - TypeScript check (`tsc --noEmit`)
   - ESLint (`next lint`)
   - Tests for affected files
3. Set up `husky` pre-commit hook

## Rollback

`npm uninstall husky lint-staged`, remove config files.

## Affected Files

- `package.json` (scripts + devDependencies)
- `.husky/pre-commit`
- `.lintstagedrc.js`
