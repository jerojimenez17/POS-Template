# Sale history Server Action boundary

## Status and scope

- **Status:** architecture specification only. Production code and tests are intentionally out of scope for this change.
- **Goal:** prevent `headers was called outside a request scope` when opening `/sales/[id]` by ensuring the sale-history database/auth call is invoked through an explicit Next.js Server Action boundary.
- **In scope:** the history action module boundary, the client import, client loading/error state, and compatibility exports.
- **Out of scope:** changes to the sale-history query, Prisma schema, authorization policy, `mapOrderToBillState`, or the visual history markup beyond an error state.

## Problem and root cause

`src/actions/sales/history.ts` is a mixed module. It contains the synchronous `mapOrderToBillState` mapper and several server-only functions, including `getSaleHistoryAction`, which calls `auth()` and Prisma. `SaleHistory.tsx` is a Client Component but currently imports that mixed module through `@/actions/sales` and invokes the function in `useEffect`.

That import does not provide a reliable explicit Server Action boundary. The client can end up invoking the mixed implementation without a request context, causing `auth()` to call `headers()` outside a request scope. The mapper must remain importable and synchronous, so adding a module-level server directive to the mixed mapper module is not an acceptable fix.

## Architectural decision

Create a dedicated module, `src/actions/sales/get-sale-history.ts`, whose first directive is `"use server"`. Move the implementation of `getSaleHistoryAction` there without changing its name or input. The action must authenticate and scope the query by the authenticated business on every invocation, then return the same history array shape used by the component.

`SaleHistory.tsx` must import `getSaleHistoryAction` directly from the dedicated action module, never from `@/actions/sales` or `history.ts`. `history.ts` must retain the mapper and all current history exports; it may re-export the action solely to preserve existing server-side/barrel consumers. No client code may import `history.ts` for the action.

The action preserves the successful return contract (`Promise<OrderUpdateWithUser[]>`). Authentication, validation, and database failures are represented by rejected promises with sanitized user-facing messages. The client catches failures and always clears `loading` in a `finally` block, so a failed request cannot leave the spinner mounted indefinitely.

## Requirements

### R1. Explicit server boundary

- Add `src/actions/sales/get-sale-history.ts` with module-level `"use server"` as its first executable statement.
- The module must contain the complete `auth()` and Prisma access for sale history.
- Do not import `auth`, `db`, Prisma runtime values, or server-only credentials into `SaleHistory.tsx`.
- Do not add `"use server"` to `history.ts`; `mapOrderToBillState` remains a synchronous, directly callable function.

### R2. Action contract and security

- Preserve the named export `getSaleHistoryAction` and parameter `(orderId: string)`.
- Reject an empty/invalid order id with a controlled error before querying.
- Call `auth()` inside the Server Action request execution. If there is no session or no `session.user.businessId`, reject with the existing Spanish authorization message (`"No autorizado"` or an equivalent stable message).
- Query `orderUpdate` using both `orderId` and the authenticated business relation (`order: { businessId }`), include only `updatedBy.name` and `updatedBy.email`, and order by `date desc`, matching current behavior.
- Do not trust a business id or user id supplied by the client.
- Log the underlying database error server-side, but expose only a sanitized error to the client.

### R3. Compatibility and module exports

- Keep `mapOrderToBillState` synchronous and behaviorally unchanged.
- Keep `getDailyReportAction`, `getSalesAction`, `getSaleByIdAction`, and `OrderUpdateWithUser` available from their existing sales-history/barrel paths.
- Keep `getSaleHistoryAction` available from `@/actions/sales` for existing non-client consumers by re-exporting the dedicated action if needed; do not duplicate its implementation.
- The new direct client import path is `@/actions/sales/get-sale-history`.
- Do not move the mapper into the Server Action module or make the Client Component import Prisma-generated types from a server-only module. Use the existing `OrderUpdateWithUser` type/model or another type-only, serializable contract.

### R4. Client failure handling

- Keep the existing fetch triggered by `useEffect` and keyed by `saleId`.
- On success, set the returned history and stop loading.
- On rejected action/auth/request failure, set a user-visible error state and stop loading.
- Use `try/catch/finally` (or equivalent) so loading is cleared for success, rejection, and unexpected thrown values.
- Preserve the empty-history state for a successful empty array; it must not be used as the failure state.
- Avoid setting state after unmount or after a stale `saleId` request completes; use the project’s established cancellation/active-request pattern if present.

## Affected files

### Required implementation changes

- `src/actions/sales/get-sale-history.ts` — new explicit Server Action module; owns auth, validation, query, and sanitized failure behavior.
- `src/actions/sales/history.ts` — remove the in-file `getSaleHistoryAction` implementation and preserve the mapper and existing exports; optionally re-export the new action for compatibility.
- `src/actions/sales/index.ts` — verify the existing barrel still exposes all prior sales-history exports, including `getSaleHistoryAction`.
- `src/components/Billing/SaleHistory.tsx` — import directly from the dedicated action module; add error state and guaranteed loading cleanup.

### Files to inspect, but do not change unless required by type checking

- `src/app/(protected)/sales/[id]/page.tsx` — confirms the page can continue rendering the client history component without changing its server-side sale lookup.
- `src/models/OrderUpdateWithUser.ts` — source of the client-safe history item type.
- Existing action mocks/consumers found by searching `getSaleHistoryAction` — retain compatible imports and successful result shape.

### Explicitly unchanged

- `prisma/schema.prisma` and migrations.
- `mapOrderToBillState` behavior and signature.
- Sale detail routing, authentication configuration, and environment variables.
- History rendering and `OrderUpdateChanges` semantics, except for a failure message/state.

## Contracts

### Server Action

```ts
export async function getSaleHistoryAction(
  orderId: string,
): Promise<OrderUpdateWithUser[]>;
```

Success returns the current descending-by-date history array. Failure rejects with a sanitized `Error`; callers must not receive Prisma error details.

### Client state

```ts
const [history, setHistory] = useState<OrderUpdateWithUser[]>([]);
const [loading, setLoading] = useState(true);
const [error, setError] = useState<string | null>(null);
```

The component renders the spinner only while `loading` is true, an error message when `error` is non-null after loading, the existing empty state for successful empty data, and the existing timeline for successful non-empty data.

## Acceptance criteria

- **AC-01:** `get-sale-history.ts` exists and has exactly one module-level `"use server"` directive; the action is exported from that module.
- **AC-02:** `SaleHistory.tsx` imports `getSaleHistoryAction` from `@/actions/sales/get-sale-history`, not from `@/actions/sales` or `@/actions/sales/history`.
- **AC-03:** `auth()` and the `orderUpdate.findMany` call used by history occur only in the dedicated action implementation and execute server-side.
- **AC-04:** `mapOrderToBillState` remains synchronous and its current imports, signature, and mapping behavior remain intact.
- **AC-05:** Existing imports of `getSaleHistoryAction` from `@/actions/sales` continue to resolve, and the successful return value remains an array of `OrderUpdateWithUser` ordered newest first.
- **AC-06:** A missing session/business causes the action to reject with a sanitized authorization error and does not query another business’s records.
- **AC-07:** A database/request failure is logged server-side and reaches the client as a sanitized rejection; no Prisma internals are rendered.
- **AC-08:** For success, auth failure, database failure, and an unexpected thrown value, the history spinner stops. A successful empty result still renders the existing empty-history message.
- **AC-09:** Opening `/sales/[id]` no longer produces `headers was called outside a request scope` from the sale-history request, and the page does not expose `auth`, Prisma, or credentials to the client bundle.
- **AC-10:** TypeScript, ESLint, and production build pass with no unresolved export/import errors.

## Test strategy (for the implementation phase)

1. **Action unit tests:** mock `auth` and Prisma; verify missing-session rejection, business-scoped `findMany` arguments, selected `updatedBy` fields, descending ordering, successful array return, and sanitized database failure.
2. **Boundary/static test:** verify the dedicated module has module-level `"use server"`, the client imports the dedicated path, and `history.ts` still exports the mapper and compatibility action.
3. **Client component tests:** mock the Server Action and render `SaleHistory`; verify spinner termination on resolve, empty result, rejection, and non-`Error` thrown values, plus the visible error state.
4. **Regression tests:** preserve existing mapper tests and add/retain a test proving `mapOrderToBillState` is synchronous and unaffected by the module split.
5. **Verification commands:** run the relevant Vitest tests, `npm run lint`, and `npm run build`; manually open a protected sale detail page while authenticated and unauthenticated to confirm request-scope behavior and failure UX.
