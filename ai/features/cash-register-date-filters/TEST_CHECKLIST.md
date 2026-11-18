# QA checklist — cash-register date filters

## Server action and query contract

- [x] Authenticate on every call; absent session, missing business ID, or empty business ID returns a typed non-success result without reading business or movement data.
- [x] Derive tenant exclusively from `session.user.businessId`; ignore/reject forged client tenant and timezone fields. Scope every movement query to that tenant.
- [x] Accept only method discriminators `CASH` and `ALL`; `CASH` uses exact `paidMethod: "Efectivo"`, while `ALL` has no method predicate (therefore includes other, empty, and `null` methods).
- [x] Validate real calendar dates in strict `YYYY-MM-DD` format. Reject impossible dates, timestamps, malformed dates, unsupported methods, and `fromDate > toDate` before movement query execution.
- [x] Resolve `Business.timezone` on the server. Use `America/Argentina/Buenos_Aires` if it is missing or invalid; do not use the browser timezone.
- [x] Convert `fromDate` to local-day start (`gte`) and inclusive `toDate` to the next local calendar-day start (`lt`). Test verifies the New York spring DST boundary (23-hour local day); the next date is calculated as a calendar date, not by adding 24 hours.
- [x] Support from-only (`gte` only), to-only (`lt` only), and both-empty (no `date` predicate) ranges.
- [x] Query only the movement fields used by the history and subtotal; order by `date desc`, then `id desc`. Keep the tenant/date/method predicate in one complete, non-paginated `CashMovement` query.
- [x] Calculate subtotal from exactly the returned movement rows, not a separate aggregate, orders, returns, vouchers, or voucher attempts.
- [x] Round each amount independently to whole pesos, with half ties away from zero. Preserve signs for withdrawals/refunds; `$0.49` rounds to zero and `-$2.50` to `-$3`.
- [x] Sum rounded signed integer row amounts with safe precision; subtotal equals the sum of displayed rows (including cases where rounding row values differs from rounding their unrounded sum).
- [x] A successful empty query returns empty rows plus numeric zero. A DB failure is a non-success/error result, not a successful empty list/zero; user-facing error omits SQL, stack, and private DB details.

## Client behavior and accessibility

- [x] Initial `Desde`/`Hasta` values are empty; `Solo efectivo` is initially selected and all-history data remains visible.
- [x] Date fields are native/accessibly labeled date inputs, keyboard-operable, inclusive in their UI semantics; method choices expose accessible selected state.
- [x] Every valid date or method change submits the full current filter tuple and updates rows and subtotal together.
- [x] Invalid date or reversed range is visibly and accessibly associated with the fields; it does not issue an incomplete/invalid request or replace the previously loaded result.
- [x] An old, delayed response cannot overwrite the latest filter result after a filter change. Equivalent in-flight user/filter requests are coalesced by the component request map (code-reviewed).
- [x] A Pusher event during an unresolved request for the identical active filter key starts a second fresh server read instead of reusing the in-flight request; the event read updates both rows and subtotal, and the older response cannot overwrite either. Regression test resolves the Pusher read first, then the original request, and verifies newest rows/subtotal remain visible.
- [x] Loading is announced accessibly and does not flash an empty result; zero matches shows a clear empty state and `$ 0`.
- [x] Read errors preserve previously loaded rows/subtotal, show an accessible message, and provide a working retry action.
- [x] Pusher `new-movement` causes a fresh refetch for the current active filters even when an identical-key request is pending; it never directly prepends unfiltered data.
- [x] Filter changes do not create duplicate Pusher subscriptions/listeners. UI test observes one subscription and one listener bind across a filter change; implementation cleanup unsubscribes the business channel on unmount/business change.
- [x] While `CashRegister` remains mounted, changing the session `businessId` from A to B immediately removes A's rows and subtotal, issues a fresh read with only the active filters and shows B's rows/subtotal (tenant authorization remains derived from the server action's session), and ignores any stale A result. Pusher unsubscribes A and subscribes/binds B without duplicate listeners.
- [x] `TotalPanel` retains its current label, balance source, and refresh behavior; history filters and historical subtotal do not alter it.
- [x] `src/app/(protected)/searchBill/page.tsx` stays untouched and its behavior remains outside this feature.

## Reviewer iteration 1 — tenant session transition (TDD)

- [x] CashRegister session-business-change regression passes after implementation; `getFilteredMovements` receives only filters, and the server action derives tenant scope from the current `auth()` session.
- [x] Focused RED confirmation: `npm run test -- --maxWorkers=1 --no-file-parallelism --maxConcurrency=1 ai/features/cash-register-date-filters/cash-register-date-filters.test.tsx` — **1 failed, 10 passed**. The new regression reports A history was not cleared, no B read was issued, and the stale A result was applied; the Pusher unsubscribe/resubscribe lifecycle assertion passed.

## Step 4 independent verification

- [x] Full focused server-action and CashRegister UI suite, stable single-worker run:
  `npm run test -- --maxWorkers=1 --no-file-parallelism --maxConcurrency=1 ai/features/cash-register-date-filters/get-filtered-movements.test.ts ai/features/cash-register-date-filters/cash-register-date-filters.test.tsx`
  Result: **2 files passed, 30 tests passed**. Includes the same-filter Pusher in-flight regression, filter date/method contracts, response ordering, error/loading/empty behavior, and TotalPanel independence.
- [x] Scoped ESLint passed for `src/components/CashRegister.tsx`, `src/actions/movements.ts`, and both feature tests.
- [x] Scoped TypeScript check passed for the two production modules and feature tests, with `src/types/next-auth.d.ts` and `vitest.setup.ts` included.
- [x] Full `npx tsc --noEmit --pretty false` was also attempted; it remains blocked by existing unrelated test diagnostics in `src/__tests__` and `tests/` (e.g. stale fixtures/mocks and missing test-only types). It reported no CashRegister feature or action diagnostics.
- [x] `git diff --check` passed. `src/app/(protected)/searchBill/page.tsx` and `prisma/schema.prisma` have no changes.
- [x] Reviewed Pusher lifecycle: one business-channel subscription and one `new-movement` bind; cleanup calls `unsubscribe(channelName)`. Test verifies one subscription/bind persists across filter changes.
- [x] No DB writes, source edits, or test edits were made during this independent verification; only this checklist was updated.

## Reviewer iteration 2 — Step 4 re-verification after developer fix

- [x] Re-ran the focused date-filter/server-action suite, including mounted business A→B switch, immediate row/subtotal clearing, the stale A response, and Pusher channel transition:
  `npm run test -- --maxWorkers=1 --no-file-parallelism --maxConcurrency=1 ai/features/cash-register-date-filters/get-filtered-movements.test.ts ai/features/cash-register-date-filters/cash-register-date-filters.test.tsx`
  Result: **2 files passed, 31 tests passed**.
- [x] Verified the A→B regression assertions: old rows and `$101` subtotal are absent synchronously after rerender (before effects are flushed); the B request contains only `{ fromDate, toDate, paymentMethod }`; B rows and `$202` subtotal appear; and the delayed A result does not become visible.
- [x] Verified tenant authorization at the server-action boundary: the request takes only filter data, calls `auth()` per invocation, and uses `session.user.businessId` for both business timezone lookup and movement query scope. Client Pusher business ID is not used as read authorization.
- [x] Reviewed Pusher transition cleanup: the effect cleanup unbinds the exact `new-movement` listener from the old channel and unsubscribes that channel; the new business effect subscribes and binds one listener. The regression observes A unsubscribe, one A and one B subscription, and one bind for each.
- [x] Scoped ESLint passed with **0 errors** for the two production modules and feature tests; it reports one non-blocking existing test-mock warning (`_channelName` unused).
- [x] Scoped TypeScript check passed for `CashRegister`, the movements action, both feature tests, `src/types/next-auth.d.ts`, and `vitest.setup.ts`.
- [x] `git diff --check` passed. `searchBill/page.tsx` and `prisma/schema.prisma` remain unchanged.
- [x] No database writes were run. No source or test files were changed during re-verification; only this checklist records the results.
