# Auth scope for sales history — QA checklist

## Automated acceptance coverage

- [ ] **AC-01:** `get-sales.ts` exists, starts with exactly one module-level `"use server"`, and exports `getSalesAction`.
- [ ] **AC-02/03:** each invocation calls `auth()`, derives `businessId` only from `session.user.businessId`, and ignores caller tenant/session data.
- [ ] **AC-04:** null, incomplete, or missing business sessions return `{ sales: [], nextCursor: null }` without querying orders.
- [ ] **AC-05:** paid-only query includes items/client/returns, descending date ordering, `take + 1`, cursor `skip: 1`, mapping, and final/non-final cursor behavior.
- [ ] **AC-06:** `SalesTable` imports the dedicated action path and uses it for refresh and load-more without auth/Prisma imports.
- [ ] **AC-07:** the search page retains its own `auth()` call and uses the dedicated initial action path.
- [ ] **AC-08:** `history.ts` remains synchronous/importable without a module-level server directive; the sales barrel preserves the action export.
- [ ] **AC-09:** database failures are server-logged and return a sanitized empty result without Prisma details.

## Manual / release verification

- [ ] **AC-10:** existing compatibility tests, new tests, lint, `npx tsc --noEmit`, and production build pass.
- [ ] **AC-11:** authenticated initial render, Pusher refresh, and cursor loading produce no request-scope (`headers was called outside a request scope`) error.
- [ ] **AC-11:** unauthenticated protected-route behavior remains unchanged; direct action calls cannot return another tenant’s sales.

## Expected pre-implementation status

The new tests are intentionally red before the Developer step: the dedicated action module does not yet exist, the page/table imports still use the old paths, and the history action has not yet been moved. Existing tests must not be weakened to make these failures pass.
