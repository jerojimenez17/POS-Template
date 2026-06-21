# Change: overall-performance

**Source:** F4 (docs/enhancements/04-incoming-features.md)  
**Phase:** 7 — New Features  
**Effort:** ~3 days  
**Risk:** Low  

## Problem

Final performance optimization pass after all other phases are complete. This catches remaining issues, measures results, and sets up monitoring.

## Scope

Global — all modules.

## Solution

1. **Lighthouse Audit**: Run full Lighthouse audit, fix remaining issues
2. **Web Vitals Monitoring**: Add `web-vitals` library or Next.js built-in analytics
3. **Final Bundle Analysis**: Run `next/bundle-analyzer`, verify target bundle size
4. **Performance Budget**: Set up CI to fail if performance regressions
5. **Documentation**: Document performance targets and current scores

## Rollback

Revert monitoring setup. No production impact.

## Affected Files

- `package.json` — bundle analyzer script
- Monitoring setup
- CI config
- `docs/enhancements/` — update with final scores
