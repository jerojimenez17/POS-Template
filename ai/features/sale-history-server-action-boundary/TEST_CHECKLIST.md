# Sale history Server Action boundary checklist

- [ ] Dedicated `get-sale-history.ts` has exactly one module-level `"use server"` directive.
- [ ] `getSaleHistoryAction(orderId)` preserves the array return contract and rejects invalid ids safely.
- [ ] Missing session or business rejects with a stable sanitized authorization error without querying.
- [ ] History query scopes by `orderId` and authenticated `businessId`, selects only `updatedBy.name/email`, and orders by `date desc`.
- [ ] Database failures are logged server-side but reject without exposing Prisma/database details.
- [ ] `SaleHistory` imports only `@/actions/sales/get-sale-history`; no auth, Prisma, db, or credentials enter the client module.
- [ ] Client loading ends after non-empty success, empty success, rejected `Error`, and non-`Error` throws.
- [ ] Client failures render a visible error; successful empty results retain the existing empty-history message.
- [ ] `mapOrderToBillState` remains synchronous and unchanged; `history.ts` has no server directive.
- [ ] Existing history actions, `OrderUpdateWithUser`, and the `@/actions/sales` compatibility export remain available.
- [ ] Relevant Vitest tests pass, then lint, typecheck, and production build pass.
