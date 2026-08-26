# TDD checklist: `account-ledger-paid-orders-performance`

- [ ] `pago` adds `paidStatus: "pago"` and excludes `status: "pendiente"`.
- [ ] `pendiente`, `inpago`, `pagado` and `all` preserve their existing status semantics.
- [ ] Non-empty search is pushed to `client.name` in Prisma with `contains` and `mode: "insensitive"`.
- [ ] Empty/whitespace search does not add a relational filter.
- [ ] List reads use an explicit minimum `select` (including only `client.id` and `client.name`).
- [ ] List reads do not use `include: { client: true }`, `findUnique`, or per-order queries.
- [ ] Ordering is client name ascending, null client as empty name, with `date desc` as deterministic tie-break.
- [ ] The session `businessId` has precedence over input and missing session/business returns `{ success: false, error: "No autorizado" }`.
- [ ] Database failures preserve the existing `ActionResult` error contract and safe logging.
- [ ] The ledger page forwards `search` and does not filter all rows in JavaScript.
- [ ] Existing empty-state text and actions remain unchanged.
- [ ] The composite ledger index is present in schema and a versioned PostgreSQL migration.
- [ ] Page-level behavior keeps default `inpago`, query-string navigation, refresh, Suspense, and Pusher behavior.
