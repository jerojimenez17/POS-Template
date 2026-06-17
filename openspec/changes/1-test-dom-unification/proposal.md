# Change: test-dom-unification

**Source:** C-16 (docs/enhancements/03-cons.md)  
**Phase:** 1 — Quick Wins  
**Effort:** ~1 day  
**Risk:** Low  

## Problem

Both `happy-dom` and `jsdom` are configured in `vitest.config.mts`. Having two DOM environments can cause inconsistent test results and increases maintenance burden.

## Scope

`vitest.config.mts`, `package.json`

## Solution

1. Choose `jsdom` as the standard DOM environment (more faithful to browser behavior)
2. Remove `happy-dom` from config and dependencies
3. Verify all tests pass

## Rollback

Re-add `happy-dom` config and dependency.

## Affected Files

- `vitest.config.mts`
- `package.json`
