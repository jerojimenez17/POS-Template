# QA checklist — sales history and credit-note safety (G2)

**Test-only scope:** maintain the existing deterministic Vitest suites and add a gated PostgreSQL row-lock integration test. Unit/action/UI tests mock auth, Prisma, AFIP, Pusher, and UI boundaries. The integration test only connects when an explicit disposable `TEST_DATABASE_URL` passes safety checks; it never falls back to `DATABASE_URL`. No production source or schema is changed.

**Status vocabulary:** `RED / authored` means an executable regression assertion exists and currently fails against the checked-in implementation; it is not an acceptance pass. `Release check` requires the implementation or a non-unit verification step.

**Gate G2 outcome:** the current serial feature-suite rerun is green for all runnable mock/unit cases. Keep rollout **blocked** until the gated PostgreSQL race test has actually run against a disposable test database, and the other release checks below pass.

## Automated regressions authored

| Spec criteria | Verification | Original G2 authoring status (historical) |
|---|---|---|
| 1, 2, 3, 9 — tenant paid history; null `billType` invoice recovery from valid CAE plus voucher 1/6/11; object/serialized CAE metadata; recovered display mapping retains CAE, invoice number and POS | `src/__tests__/actions/sales-history-credit-notes.test.ts`: `historical sales fiscal classification` and `getSalesAction invoice recovery...` | RED / authored |
| 4, 5 — CAE-only, missing/placeholder/invalid CAE, unsupported/conflicting metadata, QR non-inference, explicit Remito evidence, and unknown rows with/without a document filter | Same file: unknown-class parameter cases, Remito case, no-document-filter action case, and unknown candidate before a filtered logical page | RED / authored |
| 6, 8 — payment-method either field, inclusive dates, seller, `FACTURA_C` and `FACTURA` compatibility, filter snapshot preserved on subsequent cursor requests | Same file: fake deterministic Prisma matcher applies every query predicate to both pages; each query's tenant/paid/seller/payment/date predicates are asserted | RED / authored |
| 7 — cursor continuation, stable ordering, no duplicate recovered IDs across 250 candidate rows (36 historical matches) | Same file: `iterates a large filtered history...`; same-date ID tie is included in the focused two-page test | RED / authored |
| 12 — ADMIN-only direct credit-note permission, including explicit SUPER_ADMIN denial, no reservation and no AFIP side effect for non-admin | `src/__tests__/actions/credit-note-safety.test.ts`: role parameterized cases | RED / authored |
| 12 — UI role visibility while fiscal diagnostic remains readable | `src/__tests__/components/SaleDetailCreditNoteRole.test.tsx`: ADMIN, USER and SUPER_ADMIN detail page cases | RED / authored |
| 13 — cashbox session selected by authenticated user and tenant before reservation/AFIP | `src/__tests__/actions/credit-note-safety.test.ts`: absent-session preflight case and exact actor/business/status query assertion | RED / authored |
| 26 — persisted `Business.features.hasAfipBilling === false` rejects before any reservation create/claim or AFIP voucher creation | `src/__tests__/actions/credit-note-safety.test.ts`: direct ADMIN request uses a disabled persisted Business fixture; asserts a clear NOT_ELIGIBLE result, tenant-scoped Business lookup, zero SaleReturn writes/claim transactions, and no `createAfipVoucherAction` invocation | RED / supplemental authored |
| 26 — failed read-only `getLastVoucher`/last-number preflight must not create, update, claim, or reserve a SaleReturn; `createVoucher` issuance remains untouched | `src/__tests__/actions/credit-note-safety.test.ts`: last-number lookup fails with `issuanceNotStarted`; asserts zero top-level and transactional SaleReturn writes, zero reservation transactions, one read-only preflight, and zero `createVoucher` mock calls | RED / supplemental authored; 3 assertions fail against current reserve-before-last-voucher ordering |
| 14 — unpaid sale is rejected before AFIP or reservation; order lookup is tenant-scoped | Same action suite: unpaid sale and `id + businessId` query assertion | RED / authored |
| 17–19 — AFIP success saved on PENDING before local transaction; injected failure after staged return-item, stock, cashbox, and status changes rolls back every local effect while preserving the response; retry completes locally without another AFIP invocation | `src/__tests__/actions/credit-note-safety.test.ts`: transaction mock stages mutations and commits only when the callback resolves; failed first finalization and successful local-only retry | Authored; currently passes checked assertions |
| 16 — authoritative rejection vs uncertainty: an explicit AFIP 400 rejection may become REJECTED; HTTP 503, thrown timeout/transport failure, and malformed/missing-CAE response must remain PENDING | `src/__tests__/actions/credit-note-safety.test.ts`: authoritative response test and parameterized uncertain-outcome cases, checking persisted status, result state, and rejection updates | RED / authored for HTTP 503; other added cases currently pass |
| 14, 16, 18 — retry after ambiguous PENDING does not invoke AFIP again | Same action suite: each uncertain outcome is retried with the same request and AFIP invocation count must remain one | RED / authored for HTTP 503 (the current action marks it REJECTED and reissues on retry); timeout and malformed response cases currently pass |
| 11 — direct public AFIP actions fail closed without a session and ignore forged ADMIN/tenant actor data; public voucher request stays two-argument; trusted-actor helpers are no longer public exports | `src/__tests__/actions/public-afip-action-boundary.test.ts` | RED / authored (forged actor still selects tenant and trusted helpers remain exports) |
| 11 — ARCA management direct calls deny unauthenticated and cross-tenant ADMIN access while preserving SUPER_ADMIN management; returned data exposes credential presence only | Same public action boundary suite | Authored; current targeted assertions pass |
| 22 — daily reports include manual PENDING/AUTHORIZED and credit-note AUTHORIZED only, exclude rejected/pending credit notes, and apply the shared tenant/date window | `src/__tests__/actions/sales-history-report-returns.test.ts` | RED / authored for manual-return inclusion; date/business query boundary passes |
| 15 — manual-return flow locks the tenant-scoped order before reading returns and creates no effects when a pending credit note exists | `src/__tests__/actions/manual-return-lock.test.ts` | RED / authored; current flow reads before locking and permits a conflicting partial manual return |
| 15 — reciprocal reservation lock and deterministic race with two independent transactions, explicit lock-wait barrier, and committed row/inventory/cash effects | `src/__tests__/integration/return-order-lock.postgres.test.ts`: both manual-return-first and credit-note-first orderings | Authored / **not executed**: `TEST_DATABASE_URL` is not configured in this environment; remains a rollout gate |
| 22 — deferred load-more response racing with Pusher replacement cannot append stale rows or overwrite the new cursor/total | `src/__tests__/components/SalesTableGeneration.test.tsx`: Pusher replacement followed by stale-page resolution; subsequent page request must use Pusher cursor | Authored; currently passes checked assertions |
| 23 — obsolete request `finally` cannot clear a newer generation's loading state | Same component suite: deferred old request, filter replacement, current-generation load, then resolve old request | RED / authored |

## Full acceptance/release checklist

- [ ] **History scope:** all returned rows are paid and belong to the authenticated business, both with empty and active filters. Automated fixtures assert tenant/paid predicates and include foreign/unpaid candidates; repeat against implementation after it is updated.
- [ ] **Document classification:** A/B/C persisted labels remain supported; valid CAE + consistent 1/6/11 metadata recovers a null label; JSON/serialized metadata supported; no guessed invoice/remito for unsupported, absent, invalid, placeholder, conflicting or QR-only evidence.
- [ ] **Unknown filtering:** unfiltered unknown paid rows remain available; active invoice/remito filters exclude unknowns; explicit Remito is accepted only without positive/conflicting official fiscal evidence.
- [ ] **Logical pagination:** document classification occurs before the logical page is returned; page fill, cursor continuation, same-date ID ordering, no duplicates, bounded query batches, max `take`, and `take + 1` behavior hold. The authored 250-row test checks the dataset outcome and a batch ceiling.
- [ ] **Ordinary filters:** seller, either payment field, inclusive start/end dates, and every filter/cursor batch stay server-side; compare query args in both first/subsequent requests.
- [ ] **Filter compatibility:** `FACTURA_C` and `FACTURA` mean A/B/C; Remito, date, seller, and payment selections remain compatible with current client serialization/defaults.
- [ ] **Display parity:** recovered sales retain CAE, canonical bill type, number/POS, client/return/credit-note metadata; display-only recovery does not make an incomplete invoice eligible for issuing a credit note.
- [ ] **Server permission:** re-authenticate; only exact `ADMIN` can invoke; USER and SUPER_ADMIN direct calls fail before SaleReturn writes or AFIP calls; tenant/user identity is session-derived (not browser input).
- [ ] **UI permission:** only ADMIN sees the actionable control; other authorized users retain read-only fiscal diagnostics and issued-credit-note status.
- [ ] **Credit-note preflight:** paid, tenant-scoped eligible full reversal; valid/conflict-free fiscal data; complete items/product IDs/positive quantities/total; no manual/authorized/unresolved duplicate; open cashbox selected by both actor and business before reservation/AFIP.
- [ ] **Persisted AFIP feature gate:** query the authenticated tenant's persisted `Business.features.hasAfipBilling`; when false (regardless of missing/stale session feature snapshot), return a clear ineligible/configuration result before creating or claiming any `SaleReturn/PENDING` reservation and before invoking AFIP voucher creation.
- [ ] **Last-voucher preflight ordering:** when the read-only `getLastVoucher`/last-number lookup fails before issuance, do not create/update/claim/reserve any `SaleReturn` and do not invoke `createVoucher`; distinguish this deterministic pre-issuance failure from an ambiguous post-issuance outcome.
- [ ] **AFIP reconciliation:** only the reservation owner calls AFIP; definitive non-issuance alone may become REJECTED; ambiguous/timeout/malformed outcomes remain pending; no automatic AFIP re-issue for ordinary pending rows.
- [ ] **Durability and finalization:** valid CAE/number/POS saved to PENDING before a separate atomic local transaction; injected transaction failure rolls back every local effect but preserves the voucher fields; cashbox is rechecked in transaction; saved-response retry is local-only and idempotent.
- [ ] **Persistence gap:** if saving an AFIP success response fails, reservation stays pending, is reconciliation-required, and cannot be retried automatically. There is no in-product manual ARCA response-entry/reconciliation path in this feature; escalate outside the product using a separately approved operational procedure. This persistence-failure procedure is not safely simulated by the current in-memory unit harness.
- [ ] **Pending UI distinction:** ordinary unresolved pending is non-reissuable and says reconciliation is required; a pending row with complete saved response exposes local-only ADMIN recovery. This requires the implementation to expose an explicit actionable-vs-unknown state contract; the checked-in button props currently do not carry that distinction, so no speculative prop contract was added in this test-only stage.
- [ ] **Terminal/idempotent behavior:** success only after local commit; repeat authorized response is idempotent; later cache revalidation failure cannot reverse success.
- [ ] **Table state:** ID dedupe and pagination remain; totals/page counts/visible rows remain stable after removing the identity `filteredSales` alias.
- [ ] **No-op memo:** no behavior-only assertion is appropriate for an identity `useMemo`; its removal is an implementation-level cleanup and is intentionally not tested as an internal source-shape detail.
- [ ] **Parity / rollout:** compare the shared fixtures and behavior with main/production before rollout; no separate production branch/deployment is available in this workspace.
- [ ] **Release gates after implementation:** rerun targeted tests and `npm run test`; then `npm run lint` and `npx tsc --noEmit`; use mocked AFIP/DB only in automated tests and do not provide credentials.
- [ ] **Public action boundary:** run `src/__tests__/actions/public-afip-action-boundary.test.ts`; all direct public action calls must derive actor identity from `auth()` and must not expose credentials or public trusted-actor helpers.
- [ ] **Cross-kind concurrency:** the mocked manual-return assertion is only an action-level ordering/guard regression test. The gated PostgreSQL suite uses two independent Prisma clients/transactions, waits until the contender is observed in PostgreSQL's lock wait state, forces both winner orders, and checks committed return rows, return/stock/cash effects, balances, and AFIP-call ownership. The test uses UUID-named isolated tables and only an explicit `TEST_DATABASE_URL`; its database name must identify test/QA/disposable, and it skips if the configured URL identifies the same database as `DATABASE_URL`. **Do not approve rollout until both integration cases have run against an available disposable PostgreSQL instance.**
- [ ] **Report parity:** run `src/__tests__/actions/sales-history-report-returns.test.ts` and verify `totalReturns`/`returnCount` apply the required kind/status partition with shared business/date filters.

## G2 commands and current result

Run the targeted regression suite (single worker avoids this workspace's fork-start timeout under parallel startup):

```sh
npm run test -- --maxWorkers=1 src/__tests__/actions/sales-history-credit-notes.test.ts src/__tests__/actions/credit-note-safety.test.ts src/__tests__/components/SaleDetailCreditNoteRole.test.tsx src/__tests__/components/SalesTableGeneration.test.tsx
```

Latest pre-supplemental run: **4 test files collected; 18 failed and 8 passed (26 total)**. Failures were the expected regressions described above: missing null-type classification/logical pages (10), missing server role/cashbox/durable retry protections (5), missing ADMIN UI gate (2), and stale load-more `finally` ownership (1). The Pusher stale-response/cursor test passed, as did the unknown/no-filter classification cases and ADMIN visibility. No transform errors or unhandled errors occurred in the serial run. An initial parallel run hit Vitest fork startup timeouts; rerunning with `--maxWorkers=1` completed normally.

### Supplemental pre-Step-5 run

Command:

```sh
npm run test -- --maxWorkers=1 src/__tests__/actions/credit-note-safety.test.ts
```

Final supplemental focused run: **the test file compiles and collects all 9 tests; 8 passed and 1 failed**. The expected production regression is the HTTP 503 parameterized case: current code converts any `diagnostic.reason === "afip-error"` to `REJECTED`, and after retry it invokes AFIP a second time. Its soft assertions provide evidence of both the incorrect non-pending state/result and duplicate AFIP invocation (5 related assertion failures within that one test case). The authoritative 400 rejection, timeout/transport error, malformed response and safe retry behavior, and transaction rollback/durable-response assertions pass with current code. The final serial run used `npm run test -- --pool=threads --maxWorkers=1 src/__tests__/actions/credit-note-safety.test.ts`; it completed with no TypeScript/Vitest transform errors or worker teardown issue. The earlier fork-pool run also reported the same test result but logged a Windows worker `kill EPERM` during teardown. An initial test-only assertion issue around an omitted `pending` property was corrected before the final run. This remains a deliberate red test; do not weaken it.

`npx eslint` on the four added test files passed. `npx tsc --noEmit` reports existing errors in unrelated legacy tests (including codebar, product tests, auth actions, and shortcuts); it reports no diagnostics in these four added test files. Production lint/typecheck and full-suite release checks remain for after implementation.

### Review-blocking criteria supplemental run

Command:

```sh
npm run test -- --pool=threads --maxWorkers=1 src/__tests__/actions/public-afip-action-boundary.test.ts src/__tests__/actions/sales-history-report-returns.test.ts src/__tests__/actions/manual-return-lock.test.ts
```

Result: **3 test files, 14 tests; 9 passed and 5 failed as intended against the checked-in implementation**. Failures show forged actor use and still-public trusted helpers, missing manual-return locking/pending-credit-note protection, and omitted qualifying manual returns in the daily report. Unauthenticated direct ARCA/report/manual-return calls, report date/business query scope, and permitted ARCA management assertions pass. These mocked unit regressions do not prove PostgreSQL row-lock semantics; a real two-transaction race remains a release blocker requiring a disposable test database.

### QA maintenance rerun — lock-surface mock and PostgreSQL gate

The feature's transaction mock now models `tx.$queryRaw` for the parameterized order lock, re-reads the tenant-scoped order/returns through the transaction client, stages reservations inside that transaction, and only publishes them when the mocked transaction commits. Assertions for AFIP-response persistence before *local finalization* still compare against the finalization transaction (the new short reservation transaction now precedes the AFIP call). No production file or expected behavior assertion was changed.

The gated PostgreSQL test is intentionally safer than reusing the application DB configuration: Prisma clients receive only `TEST_DATABASE_URL`; there is no fallback to `DATABASE_URL`. It skips when that variable is absent/invalid, the DB name does not identify a test/QA/disposable DB, or its host/port/database identity matches `DATABASE_URL`. The test creates UUID-named tables in that disposable DB and cleans them up; it uses separate Prisma clients, transaction barriers plus an observed `pg_stat_activity` lock wait, and verifies actual committed transaction rows/effect rows/balance changes for both winner orders. This is a PostgreSQL lock-contract integration test using isolated fixture tables, not a claim that action-level unit mocks exercise a live DB.

Environment check: `TEST_DATABASE_URL` is **not configured**. Therefore the integration file is collected but both PostgreSQL cases are skipped; no real database race has been run or passed. The precise blocker is that this workspace supplies no explicitly configured disposable PostgreSQL URL meeting the safety checks. Configure such a DB and run `npm run test -- --pool=threads --maxWorkers=1 src/__tests__/integration/return-order-lock.postgres.test.ts` before rollout.

Serial feature-suite command:

```sh
npm run test -- --pool=threads --maxWorkers=1 src/__tests__/actions/sales-history-credit-notes.test.ts src/__tests__/actions/credit-note-safety.test.ts src/__tests__/actions/public-afip-action-boundary.test.ts src/__tests__/actions/sales-history-report-returns.test.ts src/__tests__/actions/manual-return-lock.test.ts src/__tests__/components/SaleDetailCreditNoteRole.test.tsx src/__tests__/components/SalesTableGeneration.test.tsx src/__tests__/integration/return-order-lock.postgres.test.ts
```

Result: **8 files collected; 7 passed and 1 skipped. Of 46 tests, 44 passed, 2 PostgreSQL tests were skipped, and 0 failed.** The focused credit-note suite also passed: **1 file, 9 tests passed**. Thus, no test remains failing as evidence of a real behavior bug in these suites; the database-concurrency assertion remains unverified until run against disposable PostgreSQL.

`npx eslint` was run against all eight feature test files. The first run reported one unused-variable warning in the new integration file; that unused declaration was removed, and the rerun completed with **0 errors and 0 warnings**. The earlier recorded G2 red-phase totals above are historical and are superseded for these suites by the serial rerun just recorded; they are retained as test-development history, not current status.

### Supplemental last-voucher preflight ordering regression

Added a direct ADMIN action regression where the AFIP action boundary performs a mocked read-only `getLastVoucher` lookup that fails with a trusted `issuanceNotStarted` result. The test requires no direct or transactional SaleReturn create/update/claim/reservation writes and no `createVoucher` issuance call; it also confirms that the last-number read is attempted. The test isolates this scenario with test-only AFIP configuration environment variables so it reaches the currently unsafe reservation/issuance ordering deterministically.

Focused serial command:

```sh
npm run test -- --pool=threads --maxWorkers=1 src/__tests__/actions/credit-note-safety.test.ts
```

Result: **1 test file, 11 tests; 10 passed and 1 failed**. The failed regression has three relevant soft-assertion failures: the action created a PENDING `SaleReturn` inside one reservation transaction, then updated it to `REJECTED` after the `getLastVoucher` failure. The read-only lookup was called once and the `createVoucher` issuance mock was not called, confirming the observed reserve-before-last-voucher ordering despite AFIP issuance not having begun. All other tests in the focused file passed. No production source was changed.

### Supplemental persisted AFIP feature-gate test

Added a deterministic direct-action test for the revised SPEC criterion 26. The mocked authenticated actor is an ADMIN without a session feature snapshot, while the persisted `Business` fixture explicitly returns `features.hasAfipBilling: false`. The test requires a clear `NOT_ELIGIBLE` result, a lookup scoped to the authenticated business, no SaleReturn create/update/claim transaction, and no call to the mocked `createAfipVoucherAction` boundary (the action that initiates `createVoucher`).

Focused serial command:

```sh
npm run test -- --pool=threads --maxWorkers=1 src/__tests__/actions/credit-note-safety.test.ts
```

Result: **the file compiled/collected all 10 tests; 9 passed and the new disabled-feature test failed as expected**. Its seven soft-assertion failures show the checked-in action never queried persisted `Business` configuration, returned success instead of a clear ineligible result, updated the return, created a `PENDING` return inside the reservation transaction, claimed/finalized it, and invoked the mocked `createAfipVoucherAction` boundary once. No transform/TypeScript collection errors occurred. This is expected red evidence for the revised criterion; no production code or existing assertion was changed.
