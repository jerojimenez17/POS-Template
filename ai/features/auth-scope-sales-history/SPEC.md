# Auth scope for sales history

## Status and scope

- **Status:** architecture specification only. Production source changes and tests are intentionally out of scope for this step.
- **Goal:** remove the request-scope failure raised by `auth()` while loading `/searchBill`, without allowing a caller to select another business or bypass authentication.
- **In scope:** the `getSalesAction` server boundary, its authentication scope, the `/searchBill` server component call site, client-side pagination/live-refresh callers, and compatibility exports.
- **Out of scope:** changes to the Prisma schema, JWT/session fields, login providers, route protection policy, sales filtering semantics, or visual table behavior.

## Current behavior and root cause

`src/app/(protected)/searchBill/page.tsx` is a Server Component. It calls `auth()` to obtain the session needed by `SalesTable`, then calls `getSalesAction()` and `getBusinessPrintSettingsAction()` in parallel. `getSalesAction` is currently implemented in `src/actions/sales/history.ts`, a mixed module that also exports the synchronous `mapOrderToBillState` mapper.

`SalesTable.tsx` is a Client Component and imports/calls `getSalesAction` for Pusher refreshes and cursor pagination. Because the action lives in a mixed module without a module-level Server Action boundary, the client import does not establish a reliable server invocation boundary. In that path, `auth()` can execute without a request context and fail with `headers was called outside a request scope`. The same module is also reached by the initial server render, making the failure surface appear on `/searchBill`.

Adding a module-level `"use server"` to `history.ts` is unsafe: the file intentionally exports `mapOrderToBillState` as a synchronous, directly callable mapper and is covered by an existing compatibility test. Passing the page's `session` into `getSalesAction` is also unsafe: values crossing a Client Component/server-action boundary are caller-controlled and must not be used as the authorization source.

## Architectural decision

Create a dedicated `src/actions/sales/get-sales.ts` module whose first executable statement is `"use server"`. Move the `getSalesAction` implementation there. The action itself must call `auth()` during each server-side action invocation and derive `businessId` only from `session.user.businessId`.

Keep the page's `auth()` call only for the presentation/session prop required by `SalesTable`. It is not an authorization input to the action. The page may invoke the dedicated action for initial data; the client component must import the dedicated action module directly for refresh and pagination. This gives every invocation a real server request/action scope while retaining defense in depth when the action is called outside the protected page.

Keep `history.ts` without a `"use server"` directive. It may re-export `getSalesAction` for existing server-side/barrel consumers, but must not duplicate the implementation. The sales barrel must preserve its current named export.

## Authorization and request-scope requirements

1. `getSalesAction` is a public Server Action endpoint from a security perspective and must authenticate internally on every invocation.
2. No session, no user, or no `session.user.businessId` returns the existing safe empty result (`{ sales: [], nextCursor: null }`) and performs no Prisma order query.
3. The query must retain `where: { businessId, paidStatus: "pago" }`; `businessId` must come exclusively from the authenticated session.
4. No action parameter may accept a business id, user id, or session object. The optional input remains pagination-only: `cursor` and `take`.
5. Cursor pagination must retain the current ordering, `take + 1` lookahead, `skip: 1`, and `nextCursor` behavior.
6. Database failures remain server-logged and return the current sanitized empty result rather than exposing Prisma details.
7. The page may pass the authenticated session to `SalesTable` for seller filtering, Pusher channel selection, printing, and UI behavior, but that prop must never replace action-side authentication.

## Interfaces and contracts

### Dedicated Server Action

```ts
export interface GetSalesParams {
  cursor?: string;
  take?: number;
}

export interface GetSalesResult {
  sales: BillState[];
  nextCursor: string | null;
}

export async function getSalesAction(
  params?: GetSalesParams,
): Promise<GetSalesResult>;
```

The implementation may retain the existing inline parameter/result types if project conventions favor them, but the public behavior and serialized result must not change. `BillState` values returned to Client Components must remain serializable in the same way as today, including their existing `Date` fields under the current framework boundary.

### Session ownership

- `src/app/(protected)/searchBill/page.tsx`: calls `auth()` in the Server Component because it needs the session as a rendering prop.
- `src/actions/sales/get-sales.ts`: calls `auth()` in the Server Action because it owns authorization for every initial, refresh, and pagination request.
- `SalesTable.tsx`: receives `Session | null` only as display/client behavior data and never calls `auth()` directly.

There must not be an API that accepts a session supplied by `SalesTable` or the browser and treats it as trusted authorization.

## Recommended file changes

### Required

- `src/actions/sales/get-sales.ts` — new explicit Server Action module; owns `auth()`, business scoping, pagination, Prisma access, and sanitized failure behavior.
- `src/actions/sales/history.ts` — remove the in-file `getSalesAction` implementation; retain the mapper and other history actions; optionally re-export the dedicated action for compatibility. Do not add `"use server"`.
- `src/actions/sales/index.ts` — retain the existing `getSalesAction` barrel export, preferably by re-exporting the dedicated module without duplicating code.
- `src/app/(protected)/searchBill/page.tsx` — keep `auth()` for the `SalesTable` session prop, and use the explicit action path for the initial sales request if needed to make the boundary unambiguous.
- `src/components/Billing/SalesTable.tsx` — import `getSalesAction` directly from `@/actions/sales/get-sales`, not from the mixed barrel/history module.

### Inspect and preserve

- `src/actions/business-print-settings.ts` remains independently authenticated; do not remove its `auth()` call to hide the error.
- `src/auth.ts` and `auth.config.ts` remain unchanged. The existing JWT/session callback is the source of `businessId` and must continue to populate it.
- `src/proxy.ts`/protected route behavior remains unchanged. Middleware protection is not a substitute for action authorization.
- `mapOrderToBillState` and the existing `getDailyReportAction`/`getSaleByIdAction` contracts remain unchanged.

## Acceptance criteria

- **AC-01 — Explicit boundary:** `src/actions/sales/get-sales.ts` exists, begins with exactly one module-level `"use server"` directive, and exports `getSalesAction`.
- **AC-02 — Correct auth scope:** every `getSalesAction` invocation calls `auth()` inside the dedicated Server Action; no caller-provided session/business id is accepted or trusted.
- **AC-03 — Tenant isolation:** an authenticated user only receives paid orders whose `businessId` equals the `businessId` in that authenticated session; another business's id cannot be selected through params, cursor, or client props.
- **AC-04 — Unauthenticated safety:** missing session/user/business id returns `{ sales: [], nextCursor: null }`, does not call `db.order.findMany`, and does not throw a request-scope error.
- **AC-05 — Query compatibility:** successful results preserve `paidStatus: "pago"`, included `items`, `client`, and `returns`, descending `date` order, maximum-page behavior, cursor skipping, mapping, and `nextCursor` semantics.
- **AC-06 — Client boundary:** `SalesTable.tsx` imports the dedicated action module and can invoke it for both Pusher refresh and “Cargar más” without importing `auth`, Prisma, or the mixed history implementation into the client bundle.
- **AC-07 — Initial page behavior:** `/searchBill` still obtains a session for `SalesTable`, loads sales and print settings, and renders the same table for an authorized user. Removing the page-level session call is not an acceptable fix because the table uses it for seller/channel/printing behavior.
- **AC-08 — Compatibility:** existing imports from `@/actions/sales` continue to resolve `getSalesAction`; `history.ts` remains importable for `mapOrderToBillState`, which remains synchronous and behaviorally unchanged.
- **AC-09 — Error hygiene:** Prisma/request failures are logged only on the server and return the existing sanitized empty result; no database or auth internals reach the browser.
- **AC-10 — Regression/build quality:** existing sale-history compatibility tests pass, new auth-boundary tests pass, `npm run lint` passes, `npx tsc --noEmit` passes, and `npm run build` passes.
- **AC-11 — Runtime verification:** while authenticated, opening `/searchBill`, triggering live refresh, and loading another cursor page produces no `headers was called outside a request scope` error; while unauthenticated, protected-route behavior remains unchanged and direct action calls cannot return another tenant's sales.

## Test scenarios for the implementation phase

1. **Static boundary test:** assert the dedicated module has the module-level directive; assert `SalesTable.tsx` imports the dedicated path; assert `history.ts` has no module-level directive and still exposes the synchronous mapper/barrel compatibility.
2. **Authenticated action test:** mock `auth()` with a session containing `businessId`; mock Prisma; assert the exact business-scoped paid-order query and mapped result.
3. **Unauthenticated action test:** mock `auth()` as `null`, with a session lacking `user` or `businessId`; assert the safe empty result and zero order queries.
4. **Tampering/isolation test:** pass pagination-only input while mocking a session for business A; assert no input or client session field can alter the `businessId` filter to business B.
5. **Pagination regression test:** verify no-cursor, cursor, `take + 1`, `skip: 1`, and final/non-final `nextCursor` cases.
6. **Failure sanitization test:** make Prisma reject; assert a sanitized empty result and no Prisma message in the returned value.
7. **Client caller test:** mock the dedicated Server Action and verify Pusher refresh and load-more invoke it without request-scope errors; preserve existing session-dependent channel and seller behavior.
8. **Integration/manual test:** authenticated `/searchBill` initial render plus refresh/load-more, and unauthenticated protected-route access.

## Non-goals and rejected alternatives

- Do not delete `auth()` from `getSalesAction`; that would make a public Server Action depend on middleware/page protection and weaken authorization.
- Do not pass `session` or `businessId` from `searchBill/page.tsx` into the action as an authorization mechanism; browser-visible action arguments are untrusted.
- Do not add `"use server"` to `history.ts`; it would break the mapper/module compatibility boundary.
- Do not remove authentication from `getBusinessPrintSettingsAction`; it has an independent tenant-scoped query and is not the source of authorization for sales.
