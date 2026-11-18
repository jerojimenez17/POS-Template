# AFIP partial-payment voucher — QA checklist

This checklist is derived from `SPEC.md` and the confirmed behavior: each persisted payment is invoiced independently as an advance/partial payment, using one generic **“Pago parcial”** line; the operator explicitly selects Factura A, B, or C; positive ARS amounts normalize to whole pesos using `Math.round` (halves up); and each payment row offers print or create/retry as appropriate.

## Automated acceptance checks

- [ ] **Whole-peso payment normalization:** normalize positive payment proposals and legacy order/movement amounts with `Math.round` before validation, balance calculations, persistence, voucher request/snapshot, authorized total comparison, history, and print. `10.5 → 11`, `10.49 → 10`, `0.5 → 1`; reject `0.49` and `0.1 + 0.2` because their normalized amount is below one peso. Keep NaN/Infinity invalid and reject unsafe-range values.
- [ ] **Fresh payment DTO:** use only the selected persisted movement and server-trusted order/client/business context. Emit exactly one line (`Pago parcial`, quantity `1`, amount equal to the payment, no discount); request total and total-without-discount equal that amount. Do not copy order products, order total, amount paid-to-date, or remaining balance.
- [ ] **Explicit type mapping:** Factura A/B/C are selectable and map to WSFE `1/6/11`. Reject Remito, Presupuesto, credit notes, unknown types, and forged AFIP type codes before any create call. Do not silently default to the order's invoice type.
- [ ] **Authentication and isolation:** unauthenticated and missing-business sessions, missing payments, cross-business movements, inconsistent parent-order tenant, disabled AFIP billing/feature, invalid configured POS/credentials, and unauthorized attempts fail safely and make zero create calls. Derive tenant/actor from the session; ignore caller-supplied business, actor, amount, order/client, fiscal snapshot, POS, CAE, invoice number, products, and credentials.
- [ ] **Per-payment association and order preservation:** two distinct movements on the same order, including equal-amount movements, can have distinct vouchers; a single movement has at most one association. Create, definite failure, retry, reconciliation, and print do not mutate any order invoice fields or attach payment fiscal metadata to the order.
- [ ] **Transaction/network boundary:** reservation/claim commits before sequence lookup or external issuance; no database transaction is open during either network call; final status/voucher is persisted in a separate short transaction.
- [ ] **Payment survives AFIP failure:** once payment registration commits, preflight or AFIP failure leaves the payment and order balances intact. Report payment success separately from voucher failure/unknown, and leave that payment row recoverable.
- [ ] **Duplicate and retry safety:** concurrent/replayed requests for a payment with an active attempt cause at most one remote create call and return current state. An authorized payment returns the same voucher, even if another type is proposed, and never creates again. Definite failure permits an explicitly requested, revalidated attempt with a durable incremented attempt number; no browser/network auto-retry.
- [ ] **Ambiguous outcomes fail closed:** timeout/reset after possible dispatch, malformed/indeterminate response, stale `ISSUING`, and persistence failure after possible success result in `UNKNOWN`/reconciliation-required state. No create/retry call is made until authoritative reconciliation confirms absence/rejection. A confirmed existing voucher is attached without reissue.
- [ ] **Definite failures:** pre-issue validation and unambiguous provider rejection are safe, non-printable `FAILED` results; retry is available only after revalidation. Do not expose raw provider messages or imply no CAE where that is not established.
- [ ] **Authorized total verification:** compare the trusted returned total to the immutable stored movement amount as the same whole-peso integer. Mismatch must not become ordinary `AUTHORIZED`/printable or permit reissue; preserve enough safe metadata for reconciliation without changing the payment/order.
- [ ] **Payment-row action states and accessibility:** each individual payment row (not just its order) has an accessible, labeled action. Missing/definite failure allows create/retry and explicitly requires selecting A/B/C; `PENDING`/`ISSUING` disables duplicate submission and announces progress; `UNKNOWN` gives verification guidance but no retry; `AUTHORIZED` provides print. Display monetary values with no fractional digits.
- [ ] **Independent, repeatable printing:** authorized print uses only that payment voucher's own type, POS, number, date, CAE/QR data, fiscal snapshot, and one exact `Pago parcial` line. Reprinting does not mutate data or call AFIP. It never substitutes the order CAE, and the order invoice never receives the payment CAE.
- [ ] **Privacy/minimal DTO:** client results, UI errors, print props, and logs exclude credentials, keys/tokens, raw AFIP payloads/responses, unrestricted Prisma rows, raw errors/stacks, CAE in logs, and full customer fiscal identifiers. Error codes and user-facing text are safe/allowlisted.
- [ ] **Legacy compatibility:** old movements without a voucher remain visible and actionable; there is no fabricated backfill and no change to existing order-invoice behavior.
- [ ] **Configured POS on initial payment and retry:** the initial form and retry dialog display only the authenticated business's configured POS values, default to the first value, and submit the explicit selection. Empty, malformed, unconfigured, and stale POS proposals fail before claim/preparation/remote creation; retries use the current configuration and preserve each attempt's selected POS.
- [ ] **POS action boundary:** the payment-voucher action accepts only movement id, supported invoice type, POS proposal, and explicit retry intent; forged tenant, amount, client identity, order, voucher, product, or credential data is rejected without calling the service.
- [ ] **Persistent fiscal Client edit:** an accessible button opens a populated edit dialog for the linked Client, including IVA condition and a single CUIT-or-DNI selector plus one text document number. Saving persists through the tenant-scoped Client action only; it does not mutate Order relation/fiscal data or treat unsaved form input as an issuance snapshot.
- [ ] **Identity pair invariant:** both identity fields may be absent or both present; type-only/number-only and extra simultaneous identity fields are rejected. CUIT/DNI numbers remain strings, including leading zeroes. Factura A identity entry remains available when saved IVA is Consumidor Final; application acceptance is not a claim of AFIP legal acceptance.
- [ ] **Factura B recipient projection:** the gateway request, immutable attempt/voucher print snapshot, and rendered print condition use exactly `Consumidor Final` regardless of saved Client IVA, while the persistent Client retains its saved condition.
- [ ] **Immutable recipient printing:** authorized print/reprint labels the selected document type and number and uses recipient name/IVA/identity exclusively from the authorized attempt snapshot after later Client edits. Factura B print shows `Consumidor Final`; print remains read-only and does not issue another voucher.
- [ ] **Clientless order:** no linked Client results in a safe actionable customer-required failure before reservation or AFIP calls; no Client is fabricated/attached and no Order fiscal data is used as a substitute.

## Manual / isolated integration release blocker (not an automated live-AFIP test)

- [ ] Obtain current documentation or confirmation from the external gateway owner that the generic one-line `Pago parcial` payload uses the approved existing invoice-path IVA/tax treatment for the selected A/B/C and persisted customer IVA condition.
- [ ] Verify in a sandbox or isolated gateway contract check—not against live AFIP—that the gateway's authorized gross total equals the submitted normalized whole-peso amount for each supported A/B/C case, and that the trusted response exposes a total suitable for this comparison.
- [ ] Record evidence/owner/date and the supported cases. If the behavior or exact total cannot be proven, keep fiscal sign-off blocked; request the narrow tax-treatment decision from the fiscal/API owner. Do not invent a VAT rate, alter the payment total, or claim this criterion passes based on a fabricated automated mock.

## Test-run notes

- Repository convention/configuration: Vitest 4 is already configured in `vitest.config.ts`; React tests use jsdom, `vitest.setup.ts`, and React Testing Library. No test framework/setup changes are needed.
- Run the focused contract specs with `npm run test -- --pool=threads --maxWorkers=1 ai/features/afip-partial-payment-voucher` (the default fork pool timed out starting workers in the QA environment).
- The feature service and row action are implemented. Focused tests passed against them; they are mocked contract tests and do not constitute a database-backed concurrency/migration test or an external gateway contract test.
- Automated tests must mock all persistence and AFIP boundaries. Never contact live AFIP.

## Step 4 independent verification — 2026-11-04

### Results

- **Focused feature tests — PASS:** `npm run test -- --pool=threads --maxWorkers=1 ai/features/afip-partial-payment-voucher`; **2 files passed, 37 tests passed** (18.81s). No live AFIP call was made.
- **Historical feature behavior review — superseded amount presentation:** the earlier QA recorded fractional ARS conversion and fractional-digit display. Current acceptance uses whole-peso normalization; earlier status/retry/order-invoice/print findings remain historical only where they do not contradict the revised amount rules.
- **Schema — PASS:** `npx prisma validate` passed. Reviewed `schema.prisma` and `20261104000000_add_payment_vouchers/migration.sql`: the voucher is uniquely associated with `CashMovement`, amounts are `DECIMAL(12,2)`, durable attempt/status and observed-mismatch fields exist, fiscal-record relations use `RESTRICT`, and the migration creates no backfill. No migration was applied to a database. A `prisma migrate diff --from-migrations ...` comparison was not completed because Prisma requires a shadow database URL for that mode.
- **Changed-file ESLint — PASS:** `npx eslint` on the seven changed TS/TSX implementation files returned no errors or warnings. `git diff --check` found no whitespace errors (Git only reported LF-to-CRLF notices).
- **Full repository tests — INCOMPLETE:** `npm run test` did not finish within the 240-second QA timeout. The output showed numerous unrelated failing legacy suites; no final aggregate is available, so this run cannot establish a repository-wide pass/fail count. The focused feature run above completed successfully.
- **Legacy payment-related suites — FAIL, with test harness evidence:** serial run of `register-payment.test.ts`, `unpaid-orders/actions.test.ts`, `mixed-payment.test.ts`, and `cashbox-balance.test.ts` ended **23 failed / 19 passed (4 files)**. All seven `register-payment` cases fail before reaching the action body because their `auth()` resolves through NextAuth `headers()` outside a request scope (`next-dynamic-api-wrong-context`). Five unrelated unpaid-order action cases fail because their transaction mocks omit required Prisma members (`tx.product.findMany`/`findFirst`, `$executeRaw`, or relation data). Ten mixed-payment cases fail because fixture transactions omit `db.cashMovement.findFirst`, preventing the action from reaching the asserted Pusher calls. One cashbox case similarly lacks the mocked `db.cashBox.findFirst`. These failures are harness/fixture failures, not demonstrated feature regressions; however, the old register-payment suite currently provides no regression evidence until its NextAuth mock is corrected.
- **Project TypeScript check — FAIL, baseline test typing:** `npx tsc --noEmit --pretty false` reported errors in existing test/fixture files including `src/__tests__/actions/codebar.test.ts`, `getProductsPaginated.test.ts`, component tests, and `tests/actions/{arca,security,seed-debts,shortcuts,voucher}.test.ts`. Errors include incomplete Prisma mock records, obsolete/missing imported component, NextAuth mock typed as `NextMiddleware`, and invalid test context fixtures. No error was reported from the feature implementation files in this run.
- **Repository lint:** not rerun repository-wide. Developer-reported baseline remains 49 unrelated errors / 21 warnings; the scoped changed-file lint above passes.

### Gaps / remediation required before G4

- **Release blocker remains:** no external gateway documentation/owner confirmation or isolated sandbox contract evidence was supplied for IVA treatment and exact authorized gross total for A/B/C. The implementation correctly fails closed on a missing/mismatched trusted total, but mocks cannot prove the gateway contract. Keep AC-17 and fiscal sign-off BLOCKED; do not call live AFIP.
- **Privacy contract gap to remediate:** the payment print action returns `fiscalSnapshot` to the browser, and the snapshot includes `clientDocumentNumber`. The print HTML does not currently render that value, so it is not needed in this client DTO. Return a print-safe allowlisted snapshot that omits full customer fiscal identifiers (or otherwise document and approve the exception) to satisfy R6/AC-15.
- **New-payment action contract gap to resolve:** the ledger form requires A/B/C, but public `registerPayment` accepts an omitted `billType` and deliberately returns `voucherStatus: "MISSING"` without attempting issuance. Confirm and enforce the intended server-side contract for new payments; if invoice issuance is mandatory for this flow, reject missing type or require explicit opt-out rather than silently bypassing automatic issuance. If this is a deliberate legacy path, document that exception and add action-level coverage.
- **Reconciliation remains manual/unavailable in product UI:** `UNKNOWN` correctly blocks retry and displays support guidance, but the production reconciliation adapter always returns `unresolved`; the mocked “authorized reconciliation” test does not prove a usable authoritative lookup exists. Keep UNKNOWN blocked until the support/reconciliation procedure and owner are documented; never enable blind retry.
- **Migration verification follow-up:** schema validation passed and the SQL was manually reviewed, but database migration application/drift validation was not run. Apply/verify using the deployment's approved shadow/staging database workflow before release; do not use production as a QA target.

**Gate decision: G4 cannot pass yet.** The feature-focused checks pass and UNKNOWN/order-invoice separation/payment-specific printing were verified, but remediation of the print DTO privacy gap and the missing-type server-action contract is needed, old payment regression tests need valid auth/Prisma harness mocks, and the external IVA/exact-total contract remains a release blocker. Repository-wide test/lint/tsc failures are not attributed to this feature based on available evidence, but they remain separate baseline failures.

## Step 4 re-verification after developer iteration 1 — 2026-11-04

No implementation or test code was edited in this QA pass. Only this checklist was updated. All AFIP boundaries remained mocked; **no live AFIP call was made**.

### Focused feature result

- **PASS — focused feature tests:** `npm run test -- --pool=threads --maxWorkers=1 ai/features/afip-partial-payment-voucher` completed with **2 files passed, 37 tests passed** (24.62s).
- **PASS by implementation inspection — `registerPayment` bill-type guard:** `src/actions/unpaid-orders.ts` parses a strict Zod input requiring `billType` to be exactly Factura A/B/C. Missing or unsupported values return `success: false` with `Seleccione Factura A, Factura B o Factura C` directly from the parse-failure branch, before session authorization, transaction, or `cashMovement.create`. This protects the payment write as well as issuance. The two focused feature files do not directly exercise `registerPayment`'s malformed-input boundary.
- **PASS — payment commit before issuance / payment survives AFIP failure:** `registerPayment` awaits and exits its payment transaction before calling `issuePaymentVoucherForSession`; an issuance exception is caught afterward and returns payment success separately. The focused contract test for definite AFIP rejection asserts `paymentRecorded: true`, `voucherStatus: FAILED`, payment-row survival, and persisted failure state. This is mocked service-contract evidence, not a DB integration test of the server action transaction.
- **PASS by implementation inspection — print DTO privacy for legacy snapshots:** `authorizedPrintDto` builds `fiscalSnapshot` from only `client` and `clientIvaCondition`, rather than spreading the persisted object. Therefore even a legacy fiscal snapshot containing `clientDocumentNumber`, document type/number, or other extra fields does not copy those fields into the returned print DTO. **Coverage caveat:** the existing print contract test checks payment-specific/read-only output but does not inject a legacy snapshot containing a full document number; this privacy edge is currently source-inspected rather than directly asserted by a feature test.
- **PASS — retry/UNKNOWN safety:** focused tests cover concurrent/active request suppression, authorized replay, explicit retry after definite failure with a higher attempt number, ambiguous issue result, persistence failure after possible remote success, total mismatch, and reconciliation of an existing voucher without reissue. Service inspection confirms existing `UNKNOWN` returns before claim/issue even if retry is requested; the UI exposes verification guidance and no retry action. Production reconciliation remains unresolved and returns `unresolved`, so UNKNOWN remains safely blocked rather than recoverable through the product UI.
- **Unchanged external blocker:** AC-17's remote IVA treatment and exact authorized-total contract remain unverified. Automated mocks cannot establish the gateway's fiscal contract; do not claim fiscal sign-off or contact live AFIP.

### Repository gates and remaining failures

- **G4 repository-wide gates — FAIL / incomplete, not a pass:** `npm run test` ran for the 360-second timeout and terminated without a final aggregate summary. Many unrelated suites reported failures before timeout. Repository-wide `npm run lint` failed with **49 errors and 21 warnings**, in unrelated pre-existing source/test locations; the changed payment-voucher implementation files passed scoped ESLint. `npx tsc --noEmit --pretty false` failed on existing test/fixture typing errors (Prisma fixtures, obsolete/missing component import, auth mock types, and incomplete context records); no payment-voucher implementation error appeared in the emitted diagnostics. `git diff --check` passed (only line-ending notices). Thus G4's repo-wide quality gates do not pass, separately from feature behavior and fiscal sign-off.
- **Legacy payment action suite — 7/7 fail because fixtures predate the required-type contract:** `npm run test -- --pool=threads --maxWorkers=1 src/__tests__/unpaid-orders/register-payment.test.ts` fails all seven tests at assertions expecting `success: true`. Every fixture omits `billType`, so the new required A/B/C guard rejects them before database creation as intended. These failures are in a feature-adjacent legacy regression suite and should be distinguished from the focused feature result (37/37 pass); the existing tests need to supply a supported bill type, and an action-level test should explicitly assert missing/unsupported type produces zero transaction/create calls. This is a test-fixture/test-coverage follow-up, not evidence that invalid type reaches payment creation.
- Other repository-suite failures/timeouts, lint findings, and TypeScript fixture diagnostics are separate baseline issues; they are not reported as payment-voucher feature failures. The full suite did not complete, so no repository-wide passing status or aggregate count can be inferred.

### Updated gate decision

The two previously noted implementation gaps are resolved by iteration 1 on inspection: missing/unsupported A/B/C is rejected before payment creation, and the print DTO allowlists snapshot fields so it strips full customer document numbers even from legacy snapshots. **No failures remain in the focused payment-voucher feature tests.** The adjacent legacy `registerPayment` suite still has seven outdated missing-type fixtures, leaving the new action boundary without dedicated passing action-level test evidence. G4 remains **not passed** because repository-wide tests timed out with unrelated failures and repository lint/typecheck fail; fiscal release also remains blocked independently by the unverified remote IVA/exact-total contract and unavailable authoritative reconciliation for UNKNOWN.

## Step 4 final verification after QA-only test updates — 2026-11-04

No implementation files were changed during this verification. The only QA change since the previous status is the `register-payment.test.ts` coverage update. No live AFIP call was made.

### Verification results

- **PASS — `register-payment.test.ts`:** `npm run test -- --pool=threads --maxWorkers=1 src/__tests__/unpaid-orders/register-payment.test.ts`; **1 file passed, 9 tests passed**. The added missing and unsupported (`Remito`) `billType` cases both assert the exact validation error and that `db.$transaction` is never called, so invalid bill types cannot persist a payment.
- **PASS — focused voucher feature suite:** `npm run test -- --pool=threads --maxWorkers=1 ai/features/afip-partial-payment-voucher`; **2 files passed, 37 tests passed**. The definite AFIP rejection test verifies separate payment success (`paymentRecorded: true`), `voucherStatus: FAILED`, an extant payment row, and persisted voucher-failure state. This is mocked contract evidence, not a DB-backed integration test.
- **Aggregate focused test result — PASS:** **3 files passed, 46 tests passed, 0 failed.** The missing/unsupported bill-type guard and payment survival behavior are covered; no feature regression was demonstrated in these runs.
- **PASS — changed implementation and register-payment-file ESLint:** ESLint passed for the changed payment actions, account-ledger UI, payment-voucher service/component files, and `register-payment.test.ts`.
- **FAIL — feature-folder ESLint:** including the two existing focused feature test files reports two `@next/next/no-assign-module-variable` errors (`payment-voucher-row-action.test.tsx:28` and `payment-voucher.contract.test.ts:70`). No implementation-file lint error was reported by the separate changed-implementation lint run.
- **PASS — Prisma schema validation:** `npx prisma validate` succeeded.
- **PASS — tracked diff whitespace check:** `git diff --check` returned no whitespace errors; Git emitted only LF-to-CRLF notices. (Untracked files are not included in this check.)

### Open gates

- The full repository test suite, repository-wide lint, and TypeScript check were **not rerun** in this verification and remain open with the previously reported failures/timeouts; this focused run does not establish their resolution.
- Fiscal gateway sign-off remains **BLOCKED**: no external evidence establishes the approved IVA treatment and exact authorized gross total for A/B/C. Production authoritative reconciliation for `UNKNOWN` remains unavailable. Do not contact live AFIP or infer fiscal correctness from mocks.

**Final Step 4 result:** the focused feature tests and the revised action regression tests pass, with no demonstrated feature regression. Repository-wide gates and fiscal release blockers remain unresolved; feature-folder ESLint also retains the two test-file lint findings above.

## Step 4 verification after print-validation changes — 2026-11-04

No source or test files were modified during this verification; only this checklist was updated. All AFIP boundaries remained mocked. **No live AFIP call was made.**

### Verification results

- **PASS — focused payment-voucher tests:** `npm run test -- --pool=threads --maxWorkers=1 ai/features/afip-partial-payment-voucher`; **2 files passed, 45 tests passed, 0 failed** (25.54s). This includes all **8 print-integrity cases** in `payment-voucher.contract.test.ts` for empty/malformed CAE, unsupported invoice type, mismatched AFIP type code, invalid invoice number/POS/date, and payment-total mismatch.
- **PASS — changed-file ESLint:** `npx eslint` over the changed payment-registration test/action, payment-voucher action/service, account-ledger payment UI/page/form, and both focused feature test files completed with no errors or warnings.
- **Historical source inspection — superseded amount comparison:** the earlier print validator compared fractional ARS values. Current acceptance requires whole-peso normalization and a whole-peso match to the persisted movement; the historical result does not verify that revised behavior.
- **PASS by source inspection — client fiscal-ID privacy:** `authorizedPrintDto()` constructs the returned snapshot from only `client` and `clientIvaCondition`; it does not spread persisted voucher/fiscal-snapshot data. Thus `clientDocumentNumber` and other full customer document identifiers cannot enter this print DTO, including when present in a legacy snapshot. `PaymentVoucherRowActionClient` renders only those allowlisted snapshot properties. No direct test injects a legacy full document ID and asserts its absence; the privacy conclusion is source-inspected.
- **PASS — print remains payment-specific/read-only:** the validated DTO is derived from the authorized payment voucher, includes its own CAE/number/POS/date/amount and one `Pago parcial` line, and does not use order invoice metadata. The focused repeat-print test continues to assert equal consecutive print results and no AFIP issue or authorization persistence call.

### Open release blockers / gate decision

- **Fiscal gateway contract remains BLOCKED:** no authoritative contract evidence establishes the generic-line IVA treatment or exact authorized gross total for A/B/C. Passing mocks do not satisfy this requirement; do not infer fiscal sign-off or contact live AFIP.
- **Authoritative UNKNOWN reconciliation remains BLOCKED:** production reconciliation still returns `unresolved`; there is no verified authoritative lookup proving an UNKNOWN attempt absent or authorized. Keep UNKNOWN non-retryable until an approved authoritative process is available.
- This focused verification does not rerun or resolve repository-wide tests, lint, typecheck, migration application/drift checks, or the previously documented unrelated baseline findings.

**Step 4 result:** focused payment-voucher tests and changed-file ESLint pass. Print DTO validation and document-ID exclusion are confirmed by implementation inspection, with the explicit direct-test coverage caveats above. **Release remains blocked** on the fiscal gateway contract and authoritative UNKNOWN reconciliation; no live AFIP was used.

## Step 2 — updated decisions, test-first coverage

- Extended `payment-voucher.contract.test.ts` and the row-action tests for current-business POS membership, stale/empty/invalid POS fail-closed behavior, selected retry POS, Factura B's `Consumidor Final` projection without Client mutation, Factura A's single CUIT/DNI text identity with leading-zero preservation, clientless safe pre-issue failure, and print recipient snapshot stability after a Client edit.
- Added scoped UI/action contracts for initial-payment POS selection, the populated persistent Client fiscal-edit dialog, authorized print recipient labels, the strict payment-voucher POS proposal boundary, and tenant-scoped `updateClient` persistence plus identity-pair validation. Tests use mocked data/action/persistence boundaries only; no live AFIP request is performed.
- QA run: `npm run test -- --pool=threads --maxWorkers=1 ai/features/afip-partial-payment-voucher` — **7 files, 74 tests; 48 passed, 26 failed** against the current implementation. The failures expose the not-yet-implemented POS proposal/configuration flow, persistent fiscal identity schema/action, client edit dialog, recipient snapshot print mapping, and Factura B recipient projection. Existing baseline contract cases and fail-closed clientless behavior passed. `npx tsc --noEmit --pretty false` fails on unrelated existing test fixture/type diagnostics in `src/__tests__` and `tests`; it reported no diagnostics under this feature directory. All scoped feature tests transpiled and ran in Vitest.
- **G2 status: NOT PASSED / implementation follow-up required.** These are intentional red acceptance tests for the updated decisions, not production fixes; production files were not changed in this QA step. Keep the IVA/tax-treatment and exact-authorized-total gateway blocker and Factura A identifier legal-acceptance blocker as manual fiscal/API-owner gates. No automated test can clear those blockers, and live AFIP must not be called.

## Step 4 independent QA — 2026-11-05

No implementation or test files were edited in this QA pass; only this checklist was updated. AFIP boundaries remained mocked. **No live AFIP call was made.**

### Executed verification

- **PASS — seven current feature specs plus payment-registration regression:**
  `npm run test -- --pool=threads --maxWorkers=1 ai/features/afip-partial-payment-voucher/payment-voucher-pos-selection.test.tsx ai/features/afip-partial-payment-voucher/client-fiscal-identity-action.test.ts ai/features/afip-partial-payment-voucher/payment-voucher.contract.test.ts ai/features/afip-partial-payment-voucher/payment-voucher-print-ui.test.tsx ai/features/afip-partial-payment-voucher/payment-voucher-action-boundary.test.ts ai/features/afip-partial-payment-voucher/payment-voucher-row-action.test.tsx ai/features/afip-partial-payment-voucher/payment-voucher-client-edit.test.tsx src/__tests__/unpaid-orders/register-payment.test.ts`
  Result: **8 files passed, 83 tests passed, 0 failed** (40.91s). This combined run includes all seven named feature files and `register-payment.test.ts`; stable single-thread worker options were used.
- **PASS — Prisma schema:** `npx prisma validate` reported `The schema at prisma\schema.prisma is valid`. The migration SQL was inspected: additive Client identity fields, unique CashMovement-to-PaymentVoucher association, Decimal(12,2) amounts, attempt history, restrictive fiscal-record FKs, and no voucher backfill. Migration application/drift validation was not run.
- **PASS — implementation-only ESLint:** `npx eslint` on the changed implementation files (AFIP/client/payment actions, ledger page/form, server AFIP/payment-voucher services, schema/utilities, and ledger components) exited successfully with no diagnostics.
- **FAIL — expanded changed-scope ESLint:** including feature tests reports **3 errors / 0 warnings**, all in test code: `payment-voucher-client-edit.test.tsx:35`, `payment-voucher-pos-selection.test.tsx:34`, and `payment-voucher-print-ui.test.tsx:37`, each `@next/next/no-assign-module-variable`. No implementation-file lint issue was reported.
- **PASS — tracked-diff `git diff --check`:** no whitespace errors in tracked diffs; Git emitted line-ending conversion notices only. (The command does not inspect untracked files.)

### Spec-path review and concrete defects

- **POS selection, retries, Factura B, customer edit, and independent printing — mostly conform on inspection.** The UI presents configured POS values and invoice types; the service re-fetches current business POS/customer/payment context, snapshots recipient/POS/type/amount per attempt, projects Factura B to `Consumidor Final` without updating Client, and prints from payment-voucher data instead of order invoice fields. Automated tests passed for the tested paths. The production UNKNOWN reconciliation adapter remains deliberately unresolved and fail-closed.
- **DEFECT — initial POS proposal is not mandatory at the server boundary (AC-21).** `registerPayment` defines `ptoVenta` as optional (`src/actions/unpaid-orders.ts`, schema around line 315), and the voucher service chooses `configured[0]` when the proposal is omitted (`src/lib/server/payment-voucher.ts`, around line 181). Consequently a direct Server Action call without the operator's selected proposal can persist a payment and automatically start issuance on an implicit default POS. The form normally submits a selected POS, but the public action does not enforce that contract. The focused POS tests exercise the voucher retry/action and form paths, not omission of POS from `registerPayment`.
- **DEFECT — an incomplete/missing fiscal recipient snapshot is still printable (R5/AC-14/AC-24).** `validateAuthorizedPrintRecord()` verifies authorization, voucher fields and exact amount, but does not require or validate `fiscalSnapshot.recipient`; `authorizedPrintDto()` then supplies blank name/IVA and null identity when those fields are absent or malformed. Such a record can produce a successful print DTO despite the spec requiring recipient identity/effective IVA from the immutable authorized-attempt snapshot. Current positive print tests use a complete snapshot; the negative print cases do not cover this case.

### Baseline and release gates

- **Repository-wide baseline — not rerun in this targeted pass.** Earlier checklist entries document the full suite timing out with unrelated legacy failures, repository lint findings, and TypeScript test-fixture diagnostics. The present 83-test focused pass does not establish repository-wide health or show those baseline findings are resolved. Changed-scope ESLint's three failures above are separate and specifically attributable to the named new feature test files.
- **Fiscal release blockers remain BLOCKED:** no authoritative gateway documentation/owner confirmation or isolated sandbox contract evidence proves the approved IVA treatment for the generic `Pago parcial` line and exact authorized gross total for A/B/C (AC-17); Factura A acceptance of CUIT versus DNI also remains unconfirmed (AC-19). Mocks cannot clear these blockers; do not use live AFIP.
- **Separate operational reconciliation blocker:** production reconciliation always returns `unresolved`, so UNKNOWN attempts correctly remain non-retryable but cannot be reconciled in product. Do not enable retries without an authoritative per-payment reconciliation procedure.

**Step 4 decision:** targeted tests and Prisma validation pass; implementation-only lint passes. G4 is **not passed** because of the two spec defects, the three feature-test lint errors, and unresolved repository-wide baseline gates. Fiscal release remains independently blocked by the gateway/tax-total and Factura A identity confirmations; UNKNOWN reconciliation is a separate fail-closed operational blocker.

## Step 4 re-verification after POS and print fail-closed remediation — 2026-11-05

No tests or implementation files were changed in this QA pass; only this checklist was updated. All AFIP boundaries remained mocked. **No live AFIP call was made.**

### Executed verification

- **Feature tests + payment registration — PARTIAL PASS:**
  `npm run test -- --pool=threads --maxWorkers=1 ai/features/afip-partial-payment-voucher src/__tests__/unpaid-orders/register-payment.test.ts`
  Result: **8 files, 80 passed, 14 failed (94 total)**. Seven files passed, including the payment-registration suite; all 14 failures are isolated to `payment-voucher.contract.test.ts` and fail at the expected configured-POS validation before their intended behavior assertions.
- **Failure classification — stale contract fixtures, not implementation failures:** the shared `payment()` test fixture has no `business.ptoVenta`, and the default `findPayment` mock returns that fixture. Production now correctly requires a configured business POS. In addition, the contract helper's `buildInvoice` calls still use the obsolete two-argument signature, omitting the now-required POS proposal. The test's mocked remote issuance result also places a `business` field on the AFIP response rather than on the payment fixture; that does not configure the payment's POS.
  - Missing `business.ptoVenta` on the shared payment fixture blocks: **“re-fetches by session tenant, ignores forged client context, and issues outside transactions”; “preserves the parent order's original invoice metadata”; “validates the proposed POS against the current tenant configuration before any AFIP call”** (despite proposing POS 8); **“uses the selected POS on a retry and retains it on the new attempt”; “forces Factura B's recipient IVA projection to Consumidor Final without changing Client data”; “keeps the committed payment when AFIP gives a definite rejection”; “allows an explicit revalidated retry after definite failure with a new durable attempt number”; “marks ambiguous remote outcomes UNKNOWN and does not automatically retry”; “does not issue again for active or already-authorized payments”; “treats failure to persist a possible remote success as UNKNOWN, never as retryable failure”;** and **“records a mismatched trusted total as reconciliation-required, not printable success.”** Each fails with `No hay puntos de venta válidos configurados para facturar` before the covered behavior runs; several also omit `ptoVenta` from the service input.
  - The remaining three failures are **“builds one generic line from the movement amount, never from order products or total”** plus **“preserves a single Factura A CUIT identity as text”** and **“preserves a single Factura A DNI identity as text.”** These call `buildInvoice(payment(), billType)` without its required POS argument, and use the same payment fixture without configured POS. They stop at POS validation rather than disproving the DTO/identity behavior.
  - Thus **all 14 are explained by the fixture/API-contract mismatch; none demonstrates a product defect.** The intended fixture correction is to supply the currently configured business POS and explicit proposal to these contract calls. No test changes were made per instruction.
- **PASS — POS selection and server no-default validation:** the initial-payment UI tests pass for defaulting to the first configured POS, submitting an explicitly selected alternative, and preventing submission when none are configured. The `registerPayment` tests pass with missing and stale/unconfigured POS proposals rejected before `$transaction` and without voucher issuance. Source inspection confirms `registerPayment` requires a positive integer POS, re-reads the authenticated business's current `ptoVenta`, checks membership before payment persistence, and passes that exact proposal to issuance. The voucher action also requires a POS, while the service rejects absent/unconfigured proposals rather than silently choosing a default. No implementation defect was found in the no-default server contract.
- **PASS — recipient snapshot print fail-closed behavior:** contract tests passed for print rejection when the recipient snapshot/recipient is missing, or recipient name/effective IVA is empty, whitespace-only, or malformed. They also pass for invalid identifier-pair shape and missing/malformed voucher fields/total. An absent document pair remains permitted as specified, but recipient name and effective IVA are required; Factura B must carry `Consumidor Final`. Source inspection confirms validation occurs before constructing the print DTO, which is sourced from the authorized stored snapshot, not the current Client or Order. Reprint remains read-only and does not issue against AFIP. These print checks passed in the same run; they are not among the 14 failures.
- **PASS — scoped ESLint:** `npx eslint` over the feature directory, related changed action/service/UI/schema/utility files, and `register-payment.test.ts` exited successfully with no diagnostics.
- **PASS — Prisma validation:** `npx prisma validate` reported `The schema at prisma\\schema.prisma is valid`. No database migration was applied; migration application/drift validation was not run.

### Gate decision and remaining blockers

- The earlier POS-selection and print-snapshot defects recorded above are **resolved on implementation inspection and covered by the passing targeted UI/action/print checks**. The 14 contract-suite failures are stale fixtures only; no implementation defect remains demonstrated by this verification. The contract suite still needs fixture updates and a rerun before it can provide evidence for those 14 behavior cases.
- This targeted run does not establish repository-wide test, lint, or typecheck health; prior entries document unrelated baseline failures/timeouts, which were not rerun here.
- **Fiscal/legal blockers remain in force:** AC-17 lacks authoritative gateway evidence for approved IVA treatment and exact authorized gross total for A/B/C. Factura A acceptance of CUIT versus DNI remains unconfirmed (AC-19). The production UNKNOWN reconciliation path remains unresolved and fail-closed. Do not claim fiscal/legal sign-off, invent tax behavior, or contact live AFIP.

**Step 4 decision:** targeted UI, registration, print fail-closed, Prisma validation, and scoped lint checks pass. Contract-suite failures are stale fixture failures and not evidence of remaining implementation defects; the contract suite must be rerun after fixtures are corrected. Fiscal/legal and authoritative UNKNOWN-reconciliation release blockers remain open.

## Step 5 follow-up — configured POS contract fixtures — 2026-11-05

Only `payment-voucher.contract.test.ts` fixtures/direct calls and this checklist were changed; no production code was modified. The shared authenticated-business payment fixture now carries its configured `ptoVenta` values, and valid `buildInvoice`/`issue` calls provide an explicit POS proposal per the updated service contract. The invalid, empty-configuration, and stale-POS cases and their validation assertions remain intact; POS validation was not relaxed.

### Verification results

- **PASS — all feature tests plus registration regression:** `npm run test -- --pool=threads --maxWorkers=1 ai/features/afip-partial-payment-voucher src/__tests__/unpaid-orders/register-payment.test.ts` — **8 files passed, 94 tests passed, 0 failed** (30.42s).
- **PASS — feature-test ESLint:** `npx eslint ai/features/afip-partial-payment-voucher` exited successfully with no diagnostics.
- **Scope:** AFIP and persistence boundaries remain mocked by the feature tests; no live AFIP call or database migration was run. Fiscal/API contract and UNKNOWN-reconciliation blockers recorded above remain unresolved.

**Step 5 result:** the 14 configured-POS fixture/signature failures are resolved by updating test inputs only. Feature and registration tests, and feature-folder ESLint, pass.

## Step 4 verification after reviewer-iteration-1 fix — 2026-11-05

No source or test files were modified during this verification; only this checklist was updated. All AFIP boundaries remained mocked. **No live AFIP call was made.**

### Executed verification

- **PASS — all seven current feature specs plus register-payment regression:** ran the seven named feature tests (`payment-voucher-pos-selection`, `client-fiscal-identity-action`, `payment-voucher.contract`, `payment-voucher-print-ui`, `payment-voucher-action-boundary`, `payment-voucher-row-action`, and `payment-voucher-client-edit`) together with `src/__tests__/unpaid-orders/register-payment.test.ts` using `npm run test -- --pool=threads --maxWorkers=1 <paths>`. Result: **8 files passed, 95 tests passed, 0 failed** (38.15s). The row-action cases include prior-type proposal editing, explicit confirmation, no implicit type for MISSING, and no retry for UNKNOWN/in-progress states.
- **PASS — scoped ESLint:** `npx eslint ai/features/afip-partial-payment-voucher src/__tests__/unpaid-orders/register-payment.test.ts src/actions/{afip,clients,unpaid-orders,payment-voucher}.ts "src/app/(protected)/account-ledger/[id]/{AddPaymentForm,page}.tsx" src/lib/server/{afip-voucher,payment-voucher}.ts src/schemas/index.ts src/utils/billing.ts src/components/account-ledger` completed with no diagnostics. (The actual command supplied each file path explicitly rather than using brace expansion.)
- **PASS — Prisma schema:** `npx prisma validate` reported `The schema at prisma\\schema.prisma is valid`. No database migration was applied; migration application/drift validation was not run.

### Reviewer-iteration-1 behavior inspection

- **PASS — prior bill type is proposed only for definite FAILED:** `getPaymentVoucherForSession` first normalizes the persisted voucher status and returns `{ status, proposedBillType }` only when that status is `FAILED` and the latest failed attempt's type is one of Factura A/B/C. The repository selects that type from an attempt whose persisted status is `FAILED`; stale PENDING/ISSUING is converted to UNKNOWN and has no proposal. Other states return only `{ status }`.
- **PASS — failure proposal is editable and still requires operator confirmation:** the row action accepts the failed proposal as an editable preselection, exposes all three invoice-type radio choices, and invokes issuance only when the operator presses the confirmation button with a valid configured POS. The wrapper requests `retry: true` only while the effective state is `FAILED`.
- **PASS — MISSING does not default a bill type:** the component initializes the selected type to empty; the previous proposal is considered only for FAILED. Opening the MISSING action does not check any A/B/C option, and confirmation is disabled until the operator selects a type.
- **PASS — no retry action for other states:** `PENDING`/`ISSUING` render disabled progress, `UNKNOWN` shows verification guidance without an action, and `AUTHORIZED` offers print only. Only MISSING exposes create and only FAILED exposes retry.

### Gate decision / remaining blockers

- Focused feature/action regression tests, scoped lint, and Prisma schema validation pass. These mocked tests do not establish database-backed migration/concurrency behavior or the external fiscal contract.
- **Fiscal/legal release blockers remain BLOCKED:** authoritative evidence for the generic `Pago parcial` IVA treatment and exact authorized total for A/B/C is still absent; Factura A CUIT/DNI acceptance is unconfirmed; and production UNKNOWN reconciliation remains unresolved and fail-closed. Do not claim fiscal sign-off or contact live AFIP.
- Repository-wide tests, lint, and typecheck were not rerun in this targeted pass. Prior checklist entries document outstanding repository-wide baseline failures/timeouts; this run does not establish their resolution.

**Step 4 result:** all requested targeted tests, scoped ESLint, and Prisma validation pass. The prior-type retry proposal is restricted to definite FAILED and remains editable/explicitly confirmed; MISSING has no invoice-type default and other states do not offer retry. Fiscal and UNKNOWN-reconciliation release blockers remain open.

## Final rerun after UNKNOWN wording adjustment — 2026-11-06

No implementation or test files were changed. AFIP boundaries remained mocked; **no live AFIP/ARCA endpoint was contacted**. No development server was started or stopped, and no process was killed.

- **PASS — all payment-voucher feature tests:** `npm run test -- --pool=threads --maxWorkers=1 --testTimeout=30000 ai/features/afip-partial-payment-voucher` — **7 files, 84 tests passed, 0 failed**. The UNKNOWN guidance assertion now passes against the adjusted wording, resolving the earlier matcher mismatch for this run.
- **PASS — row-action QR test:** `npm run test -- --pool=threads --maxWorkers=1 --testTimeout=30000 src/components/account-ledger/PaymentVoucherRowActionClient.test.tsx` — **1 file, 1 test passed**.
- **PASS — account-ledger detail reliability tests:** `npm run test -- --pool=threads --maxWorkers=1 --testTimeout=30000 ai/features/account-ledger-detail-reliability` — **4 files, 9 tests passed**.
- **PASS — aggregate requested tests:** **12 files, 94 tests passed, 0 failed**.
- **PASS — scoped ESLint:** `npx eslint src/components/account-ledger/PaymentVoucherRowActionClient.tsx src/components/account-ledger/PaymentVoucherRowActionClient.test.tsx ai/features/account-ledger-detail-reliability ai/features/afip-partial-payment-voucher` exited 0 with no diagnostics.
- **PASS — Prisma validation:** `npx prisma validate` reported the schema is valid. No database migration was applied.
- **Not run — production build:** omitted because it is unnecessary for this wording-only verification and could contend for shared `.next` output if a dev server is running.
- **Dev compile-hang status — UNVERIFIED:** no authenticated dev request was directly measured or correlated with Turbopack compile output. These test/lint/schema checks do not establish dev-server compilation behavior.

**Final rerun result:** the payment-voucher tests, row-action test, and all reliability tests passed. Scoped ESLint and Prisma validation passed. The dev compile-hang remains explicitly unverified until an authenticated dev request is directly measured; prior run results remain as historical evidence only.

## Step 2 follow-up — registerPayment precision and post-commit coverage — 2026-11-16

Only `src/__tests__/unpaid-orders/register-payment.test.ts` and this checklist were updated for this QA step; production code was not changed. Pusher, persistence, cache and voucher boundaries are mocked. No live AFIP call or database access was made.

### Added direct action cases

- Sub-cent payment proposals `1.001` and `1.005` must be rejected before `$transaction`, cash movement/order/client writes, Pusher, and voucher issuance.
- With order total `10.05` and prior movement `0.01`, payment `10.03` must leave status `inpago`; `10.04` must transition to `pago` and preserve the exact movement amount; `10.05` must be rejected as one cent over the exact remaining balance.
- When Pusher rejects after the mocked transaction has committed, all three cache tags (Orders, Clients, Cashbox) must still be revalidated, voucher issuance must still be called, and the action must retain `{ success: true, paymentRecorded: true }`.

### Verification

- **Test file compiles/transforms — PASS:** Vitest loaded and executed the entire `register-payment.test.ts` file (17 tests); no syntax/transform errors. `npx eslint src/__tests__/unpaid-orders/register-payment.test.ts` also passed with no diagnostics.
- **Project TypeScript check — FAIL on unrelated baseline diagnostics:** `npx tsc --noEmit --pretty false` reports existing errors in other action/component/test fixtures; it emits no diagnostic for `register-payment.test.ts`.
- **Historical focused suite (prior amount policy):** the then-current fractional input/balance cases and observed failures are superseded by the whole-peso rules and are not current acceptance evidence. Post-commit behavior findings remain a separate criterion.
- Existing assertions remain in place. This is intentional failing acceptance coverage for the production implementation step, not a request to change production code in this QA step.

**G2 status: NOT PASSED.** The requested regression tests are in place and deterministic, but five expected failures demonstrate the outstanding amount-validation, integer-cent balance, and independent post-commit cache invalidation behaviors. The implementer should address those failures before G2 can pass; rerun this same focused suite afterward. No live fiscal endpoint was contacted.

## Step 4 independent rerun — transport boundary and payment regressions — 2026-11-17

No application source or test files were changed during this QA pass; only this checklist and the related account-ledger reliability checklist were updated. AFIP and persistence boundaries in the tests are mocked. **No live AFIP/ARCA call or database write/migration was made.**

### Executed verification

- **PASS — current transport, payment registration, voucher, identity/edit, whole-peso ledger and route suites:**
  `npm run test -- --pool=threads --maxWorkers=1 --testTimeout=60000 --reporter=dot ai/features/afip-partial-payment-voucher src/__tests__/unpaid-orders/register-payment.test.ts ai/features/account-ledger-detail-reliability src/components/account-ledger/PaymentVoucherRowActionClient.test.tsx`
  Result: **16 files passed, 152 tests passed, 0 failed** (165.56s). Stable single-thread workers and an extended 60-second per-test timeout were used. The run includes `payment-voucher-transport-boundary.test.ts`, voucher contract/action tests, account-level Client identity/edit/placement tests, register-payment, whole-peso detail tests, route loading/error/concurrency tests, and the payment-row action test.
- **PASS — transport phase assertions:** the adapter test observes the ordered events `dispatch-marker`, then `axios.post`, and verifies the callback is invoked once after request preparation. A deterministic pre-callback adapter validation failure persists `FAILED` and makes no POST. A dispatch-marker persistence failure also returns `FAILED` and makes no POST. A POST/socket-reset exception after the durable callback is classified `UNKNOWN`; retry returns `UNKNOWN` without another claim or POST.
- **PASS — automatic and manual flow mapping:** `registerPayment` calls `issuePaymentVoucherForSession` only after its payment transaction commits; the manual create/retry action calls that same service entry point. Tests cover automatic pre-dispatch `FAILED` and ambiguous `UNKNOWN`, and manual pre-dispatch `FAILED` and preserved `UNKNOWN`. The service classifies exceptions before the callback as `FAILED` and after successful durable marker persistence as `UNKNOWN`.
- **PASS — scoped ESLint:** `npx eslint ai/features/afip-partial-payment-voucher ai/features/account-ledger-detail-reliability src/__tests__/unpaid-orders/register-payment.test.ts src/components/account-ledger src/actions/afip.ts src/actions/clients.ts src/actions/unpaid-orders.ts src/actions/payment-voucher.ts "src/app/(protected)/account-ledger/[id]" src/lib/money.ts src/lib/server/afip-voucher.ts src/lib/server/payment-voucher.ts src/lib/server/payment-voucher-outcome.ts src/schemas/index.ts src/utils/billing.ts` exited 0 with no diagnostics.
- **PASS — focused TypeScript:** TypeScript compiler-API program reported **68 project diagnostics total, 0 diagnostics in the scoped payment/account-ledger implementation and focused test files**. This is a scoped result, not a repository-wide TypeScript pass.
- **PASS — Prisma validation:** `npx prisma validate` reported `The schema at prisma\schema.prisma is valid`. Validation did not apply a migration or write to a database.
- **PASS — diff whitespace:** `git diff --check` exited 0 with no whitespace errors; Git printed only LF-to-CRLF conversion notices for existing modified tracked files.

### Result and limits

The transport callback is located at the final adapter boundary after invoice/request preparation and immediately before `axios.post`; no request construction or validation remains between the durable marker callback and POST. A marker-write failure prevents transport. The tested phase mapping is shared by automatic registration and manual create/retry. These mocked checks do not establish external fiscal correctness, production reconciliation availability for `UNKNOWN`, PostgreSQL migration/concurrency behavior, or repository-wide TypeScript health. The IVA/exact-authorized-total and authoritative reconciliation blockers above remain open; no live AFIP/ARCA endpoint was contacted.

**Focused Step 4 result: PASS.** The requested transport and payment/ledger regression tests and scoped quality checks passed; no source or test defect was demonstrated, so none was changed.

## Historical Step 4 independent QA — prior fractional-ARS policy — 2026-11-16

Only the three obsolete whole-unit-rounding cases in `src/__tests__/unpaid-orders/register-payment.test.ts` and this checklist were changed in this QA pass. No production code was modified. Persistence, Pusher, cache and voucher boundaries in the registration tests are mocked; no database or live AFIP/ARCA endpoint was contacted.

### Legacy assertion updates

- That historical iteration asserted fractional-ARS balances and rejected fractional submissions. Those amount assertions are superseded by the current nearest-whole-peso contract. Configured bill type/POS validation and independent post-commit side-effect assertions remain separate behaviors.

### Verification results

- **PASS — registration suite:** `npm run test -- --pool=threads --maxWorkers=1 src/__tests__/unpaid-orders/register-payment.test.ts` — **1 file passed, 17 tests passed, 0 failed**.
- **PASS — key voucher contract/action tests:** ran `payment-voucher.contract.test.ts`, `payment-voucher-action-boundary.test.ts`, and `client-fiscal-identity-action.test.ts` with `npm run test -- --pool=threads --maxWorkers=1 <paths>` — **3 files passed, 70 tests passed, 0 failed**.
- **Aggregate requested tests — PASS:** **4 files passed, 87 tests passed, 0 failed** across the separate registration and voucher contract/action runs.
- **PASS — scoped ESLint:** `npx eslint` on the registration test, the three key contract/action test files, and the related payment/client actions and payment-voucher/AFIP services completed with no errors or warnings.
- These are mocked tests only. Fiscal gateway IVA/exact-authorized-total sign-off and authoritative UNKNOWN reconciliation remain release blockers documented above; this QA pass made **no live AFIP call**.

**Historical Step 4 result:** the recorded fractional-ARS result below is retained for history only and does not match the revised whole-peso SPEC. No production code was changed during that historical QA pass.

## Step 2 follow-up — reviewer-blocker regressions — 2026-11-16

This QA scope adds test-only regressions for AC-29 through AC-31. No production code is changed. Database behavior is represented by deterministic transaction mocks; no real database or AFIP/ARCA endpoint is used.

### Acceptance checklist

- [x] **Historical AC-29 — fractional account-ledger values:** the former `10.04` amount/form assertions are superseded by the current whole-peso requirements and are not current acceptance criteria.
- [x] **AC-30 — Per-order serialization contract:** inside the same transaction, `registerPayment` must acquire a PostgreSQL parent-order row lock (`SELECT ... FOR UPDATE`, or a behaviorally equivalent per-order serialization primitive) before reading the order balance, and hold it through movement, client-balance, and paid-status writes. A controlled transaction mock starts both same-order requests before releasing either; for two `6.00` requests against `10.00`, at most one commits and all persisted mock balances/statuses agree. No sleep, real DB, or AFIP call is used. Verified by deterministic transaction mocks in the 2026-11-16 focused run; not a PostgreSQL integration test.
- [x] **AC-31 — Safe unexpected failures:** unexpected transaction/database exceptions return only `No se pudo registrar el pago. Intente nuevamente.` without raw message, name, or stack. Known domain validation (including overpayment) remains user-readable. Verified in the 2026-11-16 focused run.
- **Historical Step 2 boundary:** timing-helper deletion was excluded from that test-only follow-up; its current removal is separately verified in Step 4 below. Preserve the existing account-ledger route loading/error regressions (`ai/features/account-ledger-detail-reliability/route-loading-error.test.tsx`); they remain in scope and must not be removed.

### Test evidence

- **Focused Vitest run — RED as requested:** `npm run test -- --pool=threads --maxWorkers=1 --testTimeout=30000 src/__tests__/unpaid-orders/register-payment.test.ts ai/features/account-ledger-detail-reliability/page-concurrency.test.tsx ai/features/account-ledger-detail-reliability/route-loading-error.test.tsx ai/features/afip-partial-payment-voucher/payment-voucher-pos-selection.test.tsx` — **4 files, 24 passed, 5 failed (29 total)**. The five failing test cases are the intended implementation blockers; no source implementation was changed.
- **Historical AC-29 evidence:** the earlier `10.04` assertions are retained as dated history only. Whole-peso page/form behavior is covered by the current G2 tests below.
- **AC-30 evidence:** the lock-order assertion observes `balance-read` without an order lock. The deterministic two-request transaction mock starts both same-order calls before proceeding; both `6.00` requests currently succeed and commit, demonstrating a `12.00` overpayment against `10.00`. The test requires a parent-row `SELECT ... FOR UPDATE` (or equivalent per-order serialization) before the balance read and checks committed movement, client balance, paid status, and safe losing result.
- **AC-31 evidence:** expected overpayment remains readable (`El pago no puede exceder el saldo pendiente`), but an injected database exception is returned publicly as `DB_SECRET: customer_table connection string` rather than the generic safe failure message.
- **Route loading/error non-regression — PASS:** the retained `route-loading-error.test.tsx` checks both passed in this run. The diagnostic timing helper/test is excluded from temporary cleanup scope and neither route loading/error test was removed.
- **Scoped lint and whitespace check — PASS:** ESLint on the three changed regression-test files completed with no diagnostics; `git diff --check` exited successfully (Git emitted only existing line-ending conversion notices for unrelated worktree files).
- **No external services:** all persistence and action boundaries in this run are mocked. No real database or AFIP/ARCA request was made. Production files were not modified.

**G2 status: NOT PASSED.** The regression suite is in place and produces deterministic red evidence for the three reviewer blockers; implementation and a passing rerun are still required. Test-only lint was checked separately; repository-wide checks were not run for this test-first step.

## Step 4 independent validation — developer fixes — 2026-11-16

No production or test files were changed during this QA pass; only the relevant checklists were updated. Persistence and AFIP calls in tests are mocked. **No live AFIP/ARCA call or real database transaction was made.**

### Executed verification

- **PASS — payment registration, account-ledger route reliability, and voucher tests:**
  `npm run test -- --pool=threads --maxWorkers=1 --testTimeout=30000 src/__tests__/unpaid-orders/register-payment.test.ts ai/features/account-ledger-detail-reliability ai/features/afip-partial-payment-voucher src/components/account-ledger/PaymentVoucherRowActionClient.test.tsx`
  Result: **13 files passed, 117 tests passed, 0 failed** (153.81s). This historical run included the route loading/error tests, prior fractional-amount page/form tests, deterministic same-order locking, voucher issuance/action/UI tests, and the voucher QR row-action test. It predates and does not verify the revised whole-peso policy. An initial invocation supplied unsupported Vitest option `--minWorkers=1`; the successful rerun omitted it and used `--maxWorkers=1`.
- **PASS — scoped ESLint:** `npx eslint` over the affected payment/client/AFIP actions, ledger detail page/form/loading/error boundaries, payment-voucher services/components, `src/__tests__/unpaid-orders/register-payment.test.ts`, and both relevant feature-test directories exited successfully with no diagnostics.
- **PASS — focused TypeScript check:** TypeScript compiler-API diagnostics filtered to the affected payment actions, ledger detail page/form/loading/error boundaries, payment-voucher and AFIP services, schemas/billing utility, account-ledger components, registration test, and both relevant test directories: **0 scoped diagnostics**. This is a focused check, not a claim that all repository tests typecheck.
- **PASS — Prisma validation:** `npx prisma validate` reported `The schema at prisma\\schema.prisma is valid`. No migration was applied.
- **PASS — timing instrumentation cleanup:** no `account-ledger-detail-timing.ts` helper or `account-ledger-detail-timing.test.ts` file exists; a source search found no timing helper/log marker references under `src`. The detail route loading and safe-error UI files remain, and their reliability tests passed in the focused test run.
- **PASS — whitespace check:** `git diff --check` reported no whitespace errors; Git emitted only LF-to-CRLF conversion notices.

### Requirement evidence and limits

- **Historical amount evidence (superseded):** the prior run's `10.04` page/form and fractional-input assertions do not represent current monetary acceptance. Whole-peso normalization, balance/status, and payment validation are re-covered in G2 below.
- **Same-order serialization:** tests verify the parent-order `SELECT ... FOR UPDATE` request precedes the balance read and use a controlled transaction mock for two concurrent `6.00` payments against `10.00`; only one succeeds and persisted mock movement/client/status values remain consistent. This is deterministic mock evidence, not a PostgreSQL integration/concurrency run.
- **Safe errors and independent post-commit effects:** unexpected DB exceptions return only `No se pudo registrar el pago. Intente nuevamente.`; known overpayment stays user-readable. A simulated Pusher rejection after commit still exercises all cache-tag revalidations and attempts voucher issuance while preserving the committed-payment success result.
- Fiscal gateway IVA/exact-authorized-total sign-off, Factura A identifier acceptance, authoritative `UNKNOWN` reconciliation, and real PostgreSQL migration/concurrency validation remain outside these mocked checks and remain release blockers where previously documented. No live fiscal endpoint was contacted.

**Current Step 4 result: PASS for the requested automated checks and focused quality gates; no defect was demonstrated, so no production or test change was made.** The fiscal/reconciliation release blockers and live route timing measurement remain unverified and are not cleared by this run.

## Historical Step 3 verification — AC-33 legacy amount validation — 2026-11-16

- The recorded shared-helper and UI findings below applied to the prior fractional-cent contract and are superseded for monetary normalization. Rejection of non-finite/unsafe values remains required by the current SPEC.
- **PASS — scoped ESLint and focused typecheck:** ESLint passed for the shared helper, payment action, ledger detail page, registration test, and account-ledger reliability tests. A TypeScript compiler-API check filtered to the shared helper and affected source modules reported no diagnostics.
- **Baseline caveat:** the full `npx tsc --noEmit --pretty false` check still reports existing diagnostics in unrelated test/fixture files; it reported no diagnostics for the affected implementation sources. No tests were modified, no database migration was run, and no live AFIP/ARCA call was made.

**Historical AC-33 result:** the earlier fractional-cent validation claim is superseded by whole-peso normalization. Fiscal gateway and UNKNOWN-reconciliation release blockers above are unchanged.

## Step 4 independent verification — legacy amounts and payment safety — 2026-11-16

No production or test files were changed in this verification; the account-ledger reliability and payment-voucher checklists were updated. All persistence and voucher boundaries were mocked. No live AFIP/ARCA call, database migration, or authenticated live-route request was made.

### Executed checks

- **PASS — complete requested focused suites:**
  `npm run test -- --pool=threads --maxWorkers=1 --testTimeout=30000 ai/features/account-ledger-detail-reliability src/__tests__/unpaid-orders/register-payment.test.ts ai/features/afip-partial-payment-voucher src/components/account-ledger/PaymentVoucherRowActionClient.test.tsx`
  Result: **14 files passed, 124 tests passed, 0 failed** (166.75s). This includes the new legacy stored-amount page regression, all route reliability specs, the payment-registration suite, the payment-voucher feature specs, and the payment-voucher row QR test. Tests ran with one stable thread worker.
- **PASS — scoped ESLint:** account-ledger route, payment/client/AFIP actions and services, shared money helper, schemas/billing utility, account-ledger components, registration test, and both relevant feature-test directories all linted with no diagnostics.
- **PASS — focused TypeScript check:** compiler-API diagnostics filtered to the affected ledger/payment code and test paths returned **0 scoped diagnostics**; 67 diagnostics remain outside the selected scope. This is not a full-project typecheck pass.
- **PASS — Prisma validation:** `npx prisma validate` confirmed the Prisma schema is valid. No migration was applied.

### Independent behavior review

- Historical monetary assertions in this prior verification used fractional cents and are superseded by G2 below. The lock/transaction, controlled same-order serialization, generic unexpected-error handling, and allowlisted overpayment requirements remain separate concerns.
- **PASS — post-commit isolation:** simulated Pusher failure after commit still allows all cache-tag revalidations and voucher issuance, while the action preserves the committed-payment success result.
- **PASS — route and voucher regression coverage:** the route loading/error and tenant-scoped page-read tests and the selected voucher contract/action/row/UI tests passed in the combined run. These mocks do not prove PostgreSQL locking/migration behavior or the external fiscal gateway contract.

**Historical Step 4 result:** prior fractional-cent assertions are superseded by G2 below. Route, transaction-safety, and voucher findings remain historical; AC-17 fiscal gateway confirmation, Factura A identifier acceptance, and authoritative UNKNOWN reconciliation remain unresolved release blockers.

## Step 2 — revised whole-peso and fiscal-identity transition coverage (G2)

### Current acceptance checklist

- [ ] Submitted payment values use `Math.round` before validation and persistence: `10.5 → 11`, `10.49 → 10`, and `0.5 → 1`.
- [ ] `0.49` and floating `0.1 + 0.2` are rejected because their normalized amount is below one peso. NaN and Infinity remain invalid.
- [ ] Normalize source order total, each prior movement, submitted payment, remaining balance, paid status, voucher request/snapshot/response comparison, and print to whole pesos. Legacy `10.005` rounds to `10`.
- [ ] The voucher amount equals the normalized stored movement amount; the trusted authorized total must match that integer peso amount.
- [ ] Account-ledger history, payment form, voucher dialog and print display whole pesos with no fractional digits.
- [ ] CUIT↔DNI selection immediately clears the previous number; a newly selected type cannot be saved until its new number is entered.
- [ ] Server update rejects half-updates/type changes reusing the old effective number, and accepts an explicit atomic clear with both identity values absent.
- [ ] Mock persistence/AFIP boundaries only; do not contact live AFIP/ARCA or use a real database.

### G2 test-run result

- Revised the existing registration, ledger, voucher, payment-form, client-edit UI and client-update action assertions; no production source was modified.
- **Focused run — RED / G2 NOT PASSED:** the 7-file monetary/client batch reported **86 passed, 23 failed**. A separate stable fork-worker run of `payment-voucher-row-action.test.tsx`, `payment-voucher-print-ui.test.tsx`, and `payment-voucher-action-boundary.test.ts` passed **3 files, 15 tests**. Aggregate focused result: **10 files, 101 passed, 23 failed (124 total)**. The 7-file batch printed its summary, followed by a Windows worker-termination `EPERM/timeout` warning for the payment-registration worker.
- **Payment action failures (6):** `0.49` and `0.1 + 0.2` are currently committed rather than rejected pre-transaction; `10.5 → 11`, `10.49 → 10`, and `0.5 → 1` persist the original decimal amount; and the normalized `10.005` order / `1.5` prior movement / `7.5` payment case returns `INVALID_BALANCE` rather than completing with whole-peso status.
- **Voucher failures (8):** `buildInvoice` leaves `10.5`, `10.49`, and `0.5` fractional; rejects legacy `10.005`; accepts `0.49`; and cannot issue the legacy `10.005` movement at normalized amount 10. Retry cases assert whole-peso amount while current claim payload supplies `amountCents`.
- **Ledger failures (5):** `10.49` is rendered/passed at its fractional value, legacy `10.005` order and movement values remain invalid, and order/prior/payment/remaining/status calculations retain fractional values. **Form failure (1):** the payment input still displays `10.00` rather than `10`.
- **Client identity failures (3):** CUIT→DNI and DNI→CUIT modal transitions retain the old number; `updateClient` accepts a type change reusing the persisted legacy CUIT number. Explicit pair clearing and existing schema both-or-neither cases pass.
- NaN/Infinity rejection, the tested floating input rejection at voucher build, and the remaining identity/payment UI/action cases passed. No production source was modified and no live fiscal service or database was used.
- **G2 status: NOT PASSED.** These tests establish implementation gaps; the fiscal/API-owner and authoritative UNKNOWN-reconciliation blockers remain separate.
- Fiscal/API owner confirmation and authoritative `UNKNOWN` reconciliation remain independent release blockers; mocked tests cannot clear them.

## Step 4 independent verification — latest whole-peso and identity rerun — 2026-11-16

No source or test files were changed in this QA pass; only this checklist and the companion account-ledger reliability checklist were updated. Persistence and AFIP boundaries are mocked. **No live AFIP/ARCA call or database write/migration was made.**

### Executed verification

- **PASS — stable focused run:** `npm run test -- --pool=threads --maxWorkers=1 --testTimeout=30000 ai/features/account-ledger-detail-reliability src/__tests__/unpaid-orders/register-payment.test.ts src/__tests__/unpaid-orders/actions.test.ts ai/features/afip-partial-payment-voucher src/components/account-ledger/PaymentVoucherRowActionClient.test.tsx` — **14 files passed, 1 file failed; 137 passed and 5 failed (142 total)**. The payment registration, form/POS, all payment-voucher contract/action/print/row/client identity cases, account-ledger cases, and row QR test passed. The only red file is the separately requested legacy order-item `src/__tests__/unpaid-orders/actions.test.ts`; details below and in the companion checklist.
- **PASS — nearest whole-peso policy:** registration and voucher contracts cover positive half-up cases (`10.5 → 11`, `0.5 → 1`), below-half values (`10.49 → 10`), legacy `10.005 → 10`, and rejection of `0.49`, floating `0.1 + 0.2`, NaN, and Infinity. Invalid amounts are rejected before transaction/AFIP side effects. Ledger and form tests verify whole-peso rendering and matching defaults/maximum/validation. The voucher contract checks that normalized legacy movement amount, one-line invoice request, persisted voucher amount, and trusted authorized total agree; mismatched totals are not treated as printable success.
- **PASS — client fiscal identity:** UI tests verify switching CUIT↔DNI immediately clears the old number and requires a new number before save; complete strings preserve leading zeroes; paired clearing submits both fields absent. Action tests verify a requested type change cannot reuse the persisted effective legacy CUIT number and that explicit pair clearing succeeds. The Client update boundary is tenant-scoped and does not update Order. Source inspection confirms unexpected Client-update logging contains only a fixed diagnostic code and error type, not raw client/database error text or object.
- **PASS — order lock and safe error behavior:** registration tests verify the parent order lock is requested before the balance read and use a deterministic concurrent same-order mock, plus assert allowlisted domain failures and generic handling of unexpected database errors. This remains mocked behavioral evidence, not PostgreSQL integration evidence.
- **PASS — route reset and unchanged searchBill:** the companion reliability test verifies the error-boundary retry invokes `reset()` and hides secret-bearing error details. `searchBill` has no working-tree status or diff and was not changed.

### Legacy action-suite classification

- The five failures in `src/__tests__/unpaid-orders/actions.test.ts` are stale test fixtures for unrelated order-item operations: their transaction mocks omit `tx.product.findMany`, `tx.product.findFirst`, related included item data used by a reducer, or `tx.$executeRaw`. Failure output shows these `TypeError`s occur before the test's intended state assertions. The file's other five tests pass. The failures do not exercise `registerPayment`; that payment-specific suite passed in this run. Do not attribute these stale mocks to the latest monetary/client-identity behavior.

**Current Step 4 result:** all requested whole-peso payment, ledger/form, voucher, client-identity, order-lock/safe-error, and reset tests pass. The previous G2 red whole-peso/client-transition findings are superseded by this passing rerun. The only five failures are the stale mocks in the legacy order-item action suite. Fiscal/API-owner confirmation for IVA and exact AFIP gross totals, Factura A identifier acceptance, authoritative `UNKNOWN` reconciliation, and database-backed migration/concurrency validation remain open; no live fiscal service was contacted.

## Step 2 — account-level Client editing and remaining reviewer blockers — 2026-11-17

Test-only update for the revised `SPEC.md`. Existing tests were preserved. All Prisma, payment transaction, and AFIP boundaries are mocked; no database or live AFIP/ARCA call was made.

### Added acceptance checks

- [x] **Single account-level Client control:** the account detail's linked Client name/fiscal identity is one accessible clickable/editable control; it opens one populated fiscal modal. Exactly one editor is present outside the payment-row map. Payment rows retain only their own create/print/retry controls and never mount a Client editor.
- [x] **Shared saved Client and immutable fiscal snapshots:** after the linked Client is saved once, creation for other payments and retry for a definite failure re-fetch current persisted Client data and freeze it in each new attempt. Earlier authorized attempt and reprint snapshots remain unchanged after later Client edits.
- [x] **Legacy CUIT resolution and atomic synchronization:** absent typed identity plus non-empty legacy `cuit` loads as CUIT and resolves as CUIT for voucher requests. A CUIT save writes typed CUIT/type-number and legacy `cuit` together; DNI writes typed DNI/type-number and null legacy `cuit`; explicit clear nulls type, number, and `cuit` together. Type/number partial updates and changing type while reusing the prior effective number (including legacy CUIT) are rejected before update. Once explicitly cleared, old legacy `cuit` is not restored as recipient fallback.
- [x] **Voucher Decimal amount upper bound:** normalized payment amount above 9,999,999,999 whole pesos is rejected before `$transaction`, movement insertion, voucher reservation, or AFIP preparation/dispatch.
- [x] **Phase-aware error outcome:** validation, missing/current Client, and reservation failures known before `createVoucher` return safe definite `FAILED`; no pre-dispatch error is mislabeled `UNKNOWN`. An error after possible remote dispatch remains `UNKNOWN`, requires reconciliation, and cannot be retried.

### Test-first run and findings

- **Focused run — RED as requested:** `npm run test -- --pool=threads --maxWorkers=1 --testTimeout=30000 ai/features/afip-partial-payment-voucher/payment-voucher.contract.test.ts ai/features/afip-partial-payment-voucher/client-fiscal-identity-action.test.ts ai/features/afip-partial-payment-voucher/payment-voucher-client-edit.test.tsx ai/features/afip-partial-payment-voucher/payment-voucher-account-client-placement.test.ts ai/features/afip-partial-payment-voucher/payment-voucher-action-boundary.test.ts src/__tests__/unpaid-orders/register-payment.test.ts` — **6 files; 109 passed, 5 failed (114 total)**.
- **Expected failures (5):** `client-fiscal-identity-action.test.ts` has two failures because `updateClient` does not synchronize legacy `cuit` to null for DNI or explicit clear. `payment-voucher-account-client-placement.test.ts` has two failures because the page does not mount one account-level editor and the payment-row client component still mounts its own editor. `register-payment.test.ts` has one failure because 10,000,000,000 is accepted/committed instead of rejected before transaction.
- **Passes covering remaining new behavior:** modal legacy-cuit prefill and immediate CUIT↔DNI clearing; legacy CUIT server resolution and no fallback after clear; fresh recipient snapshots for later payment creation/retry and immutable prior authorized print; partial/type-reuse validation; and action boundary mapping pre-dispatch errors to `FAILED` while preserving post-dispatch `UNKNOWN`.
- An initial focused run also showed one failure in the new snapshot test due to an invalid mocked CAE fixture; the mock was corrected to a valid 14-digit CAE and the focused rerun above passed that contract test. No production source was changed.
- **Scoped ESLint — INCOMPLETE:** `npx eslint` over the updated tests did not finish within 120 seconds. No lint pass is claimed. Repository-wide tests, typecheck, and build were not run.

**G2 status: NOT PASSED.** The intended red tests confirm remaining placement, Client legacy-field synchronization, and pre-transaction upper-bound defects. Tests remain deterministic/mocked; the developer implementation step must fix the failures and rerun this focused set. Fiscal/API-owner confirmation and authoritative `UNKNOWN` reconciliation remain separate release blockers.

## Historical Step 4 independent verification — current Client and phase classification — 2026-11-17

Only this checklist and a focused regression test in `src/__tests__/unpaid-orders/register-payment.test.ts` were changed in this QA pass. No production implementation was changed. Test persistence/Pusher/cache/AFIP boundaries are mocked. **No live AFIP/ARCA call, database write, or migration was made.**

### Executed checks

- **Focused test suite — PARTIAL PASS / one demonstrated failure:** ran the eight targeted `afip-partial-payment-voucher` specs (POS selection, Client identity action, service contract, print UI, action boundary, row action, Client edit modal, and account-level placement) plus `register-payment.test.ts` using `npm run test -- --pool=threads --maxWorkers=1 --testTimeout=30000 <paths>`. Result: **9 files, 127 passed, 1 failed (128 total)**. All eight feature specs pass. The sole failure is the new automatic-payment pre-dispatch classification regression described below.
- **PASS — account-level Client control / no row editor:** the Client modal is mounted once before the payment-row map; payment row actions contain no Client editor/update action. The UI test covers saved identity and IVA prefill, legacy `cuit`-to-CUIT prefill, CUIT↔DNI number clearing, leading-zero text, and explicit pair clearing.
- **PASS — current Client for later attempts / immutable prior authorized snapshot:** service contract tests re-fetch the linked Client for separate payments/retries and assert that a later saved Client edit does not change the earlier authorized fiscal/print snapshot.
- **PASS — typed/legacy identity updates:** action tests cover CUIT mirror to `cuit`, DNI clearing legacy `cuit`, explicit clearing of typed fields and legacy `cuit`, both-or-neither validation, tenant scoping, and rejection of a type change reusing the effective legacy CUIT. Voucher tests confirm legacy prefill and no revival after explicit clearing.
- **PASS — type-switch UI behavior:** selecting the other document type clears the current number immediately and blocks save until a replacement number is entered; clearing submits both identity values absent.
- **PASS — Decimal(12,2) whole-peso upper bound:** `register-payment.test.ts` verifies 10,000,000,000 pesos is rejected without opening the payment transaction or calling voucher issuance.
- **DEFECT — automatic registration mislabels known pre-dispatch voucher errors as `UNKNOWN`:** added `reports a known pre-dispatch voucher failure as FAILED without misreporting the committed payment`. It commits a mocked payment, injects the known no-linked-Client error thrown by `recipientFor()` before voucher reservation/preparation/dispatch, and expects `{ success: true, paymentRecorded: true, voucherStatus: "FAILED" }`. Actual result is `voucherStatus: "UNKNOWN"` with reconciliation required. `registerPayment`'s catch around `issuePaymentVoucherForSession` in `src/actions/unpaid-orders.ts` unconditionally converts every thrown voucher error to UNKNOWN, even when `issue()` failed before dispatch. The separate create/retry Server Action maps thrown errors to FAILED, but that does not fix the automatic `registerPayment` path. Classify/propagate the issuance phase (or return a definite failure result from the service) so known pre-dispatch failures stay FAILED; preserve UNKNOWN only after possible dispatch. Keep the committed payment successful in either case.
- **PASS — implemented post-dispatch ambiguity coverage:** service contract tests cover an ambiguous remote result and failure to persist possible remote success as UNKNOWN/reconciliation-required; row/action tests verify UNKNOWN has no retry action. These mocked tests do not prove a production reconciliation mechanism exists.
- **PASS — scoped ESLint:** `npx eslint` over the feature directory, payment-registration test, changed payment/client/AFIP actions and services, ledger page/form, schema/money/billing utilities, and account-ledger components returned no diagnostics.
- **PASS — Prisma validation:** `npx prisma validate` reported the schema valid. Migration application/drift validation was not run.
- **PASS — diff whitespace:** `git diff --check` reported no whitespace errors; Git emitted only LF-to-CRLF notices.
- **Project TypeScript check — FAIL on unrelated existing diagnostics:** `npx tsc --noEmit --pretty false --incremental false` reports legacy test/fixture errors in `src/__tests__/actions/{codebar,getProductsPaginated}.test.ts`, component tests, and `tests/actions`/`tests/context` fixtures. No diagnostics were emitted for the changed payment/client/ledger implementation, feature tests, or the added regression test.

### Gate decision

Historical result, superseded by the independent rerun below: account-level editing, current-client snapshots, synchronized identity, explicit clearing, and the pre-transaction maximum passed, while the automatic pre-dispatch classification regression was still failing at that time. The developer fix and current verification are recorded below; repository-wide type and separate fiscal/reconciliation/database gates remain open.

## Step 4 independent verification — automatic pre-dispatch classification fix — 2026-11-17

No application source or test files were changed during this verification; only this checklist and the companion account-ledger reliability checklist were updated. Persistence, Pusher/cache, and voucher/AFIP boundaries in automated tests are mocked. **No live AFIP/ARCA call, database transaction, or migration was made.**

### Executed verification

- **PASS — focused registration, voucher, action, row, account Client-edit, route, and whole-peso UI suites:**
  `npm run test -- --pool=threads --maxWorkers=1 --testTimeout=30000 ai/features/account-ledger-detail-reliability src/__tests__/unpaid-orders/register-payment.test.ts ai/features/afip-partial-payment-voucher src/components/account-ledger/PaymentVoucherRowActionClient.test.tsx`
  Result: **15 files passed, 147 tests passed, 0 failed** (172.84s). This includes `register-payment.test.ts`; all eight payment-voucher feature specs (service contract, manual action boundary, row actions, POS selection, print, and Client editing/identity); all five account-ledger reliability/whole-peso specs; and the payment-voucher QR row test.
- **PASS — automatic missing-client regression:** the committed mocked cash movement remains recorded and `registerPayment` returns `success: true`, `paymentRecorded: true`, and `voucherStatus: FAILED` for the known pre-dispatch missing-Client failure; it does not request reconciliation. The payment row is created exactly once.
- **PASS — manual action pre-dispatch classification:** action-boundary tests cover pre-dispatch validation, customer-resolution, and reservation failures as definite `FAILED`; they do not return `UNKNOWN` or reconciliation-required status.
- **PASS — post-dispatch ambiguity remains fail-closed:** service contract tests keep ambiguous remote outcomes and persistence failure after possible remote success at `UNKNOWN`/reconciliation-required. The manual action boundary preserves `UNKNOWN`; row-action tests provide verification guidance and no retry. Source inspection confirms the automatic registration catch uses the same typed `paymentVoucherIssueFailureOutcome` classification: only `PaymentVoucherIssueError("UNKNOWN")`, produced after possible dispatch, maps to `UNKNOWN`; ordinary/pre-dispatch errors map to `FAILED`. The automatic pre-dispatch regression is directly asserted; automatic post-dispatch routing is supported by the shared mapper and service contract tests rather than a dedicated end-to-end `registerPayment` test.
- **PASS — account-level Client editing and whole-peso UI:** the linked Client editor remains account-level, and the current Client edit/identity, payment history/form defaults and amounts, and legacy-value normalization cases passed in the combined focused run.
- **PASS — scoped ESLint:** ESLint on both focused feature directories, the payment-registration test, payment/client actions and services, account-ledger route/form/boundaries and components completed with no diagnostics.
- **PASS — focused TypeScript check:** compiler-API diagnostics filtered to the payment/account-ledger implementation, focused tests, and both feature directories reported **0 scoped diagnostics**. This is not a repository-wide `tsc` pass.
- **PASS — Prisma validation:** `npx prisma validate` reported the schema valid. No migration was applied.
- **PASS — `git diff --check`:** no whitespace errors; Git emitted only line-ending conversion notices for existing modified files.

### Gate decision

**Step 4 focused verification: PASS.** The prior automatic-action regression is resolved: payment success is preserved while a pre-dispatch missing-Client error is classified `FAILED`; only a potentially dispatched/ambiguous outcome remains `UNKNOWN` and reconciliation-required. Manual action and row behavior also remain fail-closed. Whole-peso and account-level Client-edit suites passed. The external fiscal IVA/exact-total contract, Factura A identifier acceptance, authoritative production reconciliation for `UNKNOWN`, and database-backed migration/concurrency checks remain separate open release gates. No live AFIP service was contacted.

## Step 2 — AFIP transport-boundary classification — 2026-11-17

Added test-only transport acceptance coverage. Production source was not modified. `axios.post`, AFIP preparation dependencies, feature/tenant persistence reads, voucher persistence, payment transaction, cache/Pusher and action/service boundaries are mocked. **No live AFIP/ARCA call or real database access was made.**

### Added acceptance checks

- [ ] A deterministic exception during final pre-POST AFIP validation/preparation must classify the payment voucher as `FAILED`; it must not invoke or durably persist the dispatch marker, must not call `axios.post`, and must not become retry-ambiguous.
- [ ] The adapter must await the durable dispatch callback as its final operation immediately before `axios.post`; a POST/transport exception after that marker must persist/return `UNKNOWN`, require reconciliation, and block another manual retry/POST.
- [x] If dispatch-marker persistence itself fails, do not call `axios.post` and classify the attempt as definite `FAILED`.
- [x] Automatic `registerPayment` remains successful after its payment transaction when the mocked voucher outcome is `UNKNOWN`; it passes the committed movement id/type/POS to voucher issuance. Existing manual action-boundary tests continue to assert pre-dispatch `FAILED` and `UNKNOWN` preservation. These are entry-point mapping tests; transport-phase classification is exercised separately through the service/adapter tests.

### G2 test-first run

- **Focused run — RED / G2 NOT PASSED:**
  `npm run test -- --pool=threads --maxWorkers=1 --testTimeout=30000 ai/features/afip-partial-payment-voucher/payment-voucher-transport-boundary.test.ts ai/features/afip-partial-payment-voucher/payment-voucher-action-boundary.test.ts src/__tests__/unpaid-orders/register-payment.test.ts`
  Result: **3 files, 34 passed, 2 failed (36 total)**. The manual action-boundary and automatic registration suites passed, including the post-commit ambiguous-outcome mapping assertion.
- **Expected failure 1 — pre-POST deterministic exception is misclassified:** the injected final-adapter `requireFeature` exception occurs before mocked transport, but the service returns `UNKNOWN`/reconciliation-required rather than `FAILED`. The durable dispatch marker is recorded before entering the AFIP issue adapter, and the failure path does not persist a definite `FAILED` state. The expected evidence is zero marker writes, zero `axios.post` calls, and retryable-after-revalidation `FAILED`.
- **Expected failure 2 — callback not at adapter transport boundary:** calling `issuePreparedAfipVoucher(prepared, callback)` produces only the `axios.post` event; the callback is never invoked. The expected ordered events are exactly `dispatch-marker`, then `axios.post`. The adapter needs to own this final callback placement so no deterministic validation/preparation step can be mistaken for possible dispatch.
- **PASS — post-dispatch fail-closed and retry suppression:** the mocked post call throws after marker, the service returns `UNKNOWN`, and a manual retry request results in no second claim or POST.
- **PASS — marker persistence failure:** a thrown marker-persistence mock does not reach `axios.post` and yields `FAILED`.
- **Entry-point scope:** the direct action test confirms manual FAILED/UNKNOWN mapping. The `registerPayment` test confirms automatic payment success remains committed for an UNKNOWN result; this verifies payment/voucher outcome separation, not another invocation of AFIP transport. All boundaries were mocked; no live AFIP call was made.
- **PASS — scoped test lint:** `npx eslint ai/features/afip-partial-payment-voucher/payment-voucher-transport-boundary.test.ts src/__tests__/unpaid-orders/register-payment.test.ts` completed without diagnostics.
- No production source was edited. Repository-wide test/lint/typecheck and fiscal/API-owner release gates were not run or changed by this G2 test-first pass.

**G2 status: NOT PASSED.** Two intentional red tests identify the transport-phase marker placement and pre-POST classification defects. Keep the failing tests and checklist evidence for the implementation iteration; do not change production in this QA step. Fiscal treatment/exact-total confirmation and authoritative `UNKNOWN` reconciliation remain independent release blockers.

## Step 2 — AC-36 exact trusted amount and reconciliation evidence — 2026-11-18

Added test-only acceptance coverage for exact AFIP/reconciliation amount comparisons. Payment, repository, AFIP issue/reconciliation, persistence, and print boundaries are mocked. **No production files were changed and no live AFIP/ARCA call or database access was made.**

### Added acceptance checks

- [x] Keep payment-input normalization distinct from trusted fiscal evidence: `payment-voucher.contract.test.ts` still verifies positive payment inputs normalize to whole ARS pesos with `Math.round` semantics (including `10.5 → 11`, `10.49 → 10`, and `0.5 → 1`). This normalization is not an acceptable comparison for AFIP response/reconciliation totals.
- [x] A stored movement amount of 123 and exact AFIP totals `123`, `123.0`, and `123.00` may authorize; no mismatch or failure persistence should occur.
- [x] AFIP total `123.4`, both numeric and decimal text, must remain `UNKNOWN`/reconciliation-required, persist the safe observed fractional amount and allowlisted `TOTAL_MISMATCH`, not persist an authorized voucher, remain non-printable after reload/replay, and block retry/another issue attempt. Movement/order totals remain unchanged.
- [x] Later authoritative reconciliation must keep numeric/text `123.4` `UNKNOWN` and unattached, preserve the safe fractional evidence without provider payload/debug fields, and stay non-printable/non-reissuable; exact `123`, `123.0`, or `123.00` may attach/authorize. Movement/order values remain unchanged.
- [x] No new status enum/name, schema field, migration, or raw AFIP/reconciliation payload persistence/return is required for the AC.

### G2 test-first result

- **Focused run — RED / G2 NOT PASSED:**
  `npm run test -- --pool=threads --maxWorkers=1 --testTimeout=30000 --reporter=dot ai/features/afip-partial-payment-voucher/payment-voucher.contract.test.ts ai/features/afip-partial-payment-voucher/payment-voucher.service.test.ts ai/features/afip-partial-payment-voucher/payment-voucher.reconciliation.test.ts`
- Result: **3 files; 67 passed, 10 failed (77 total)**. All existing contract cases, including whole-peso payment-input normalization, passed. AC-36's expected-red failures are confined to the new trusted amount service/reconciliation coverage. An earlier 10-second-timeout rerun had one additional transient test timeout; the 30-second focused rerun completed with the expected 10 red assertions.
- Expected failures demonstrate trusted-total rounding/normalization defects: service currently authorizes numeric `123.4` after rounding it to 123, loses the original value (`observedTotalPesos` becomes `-1`), and rejects exact decimal strings; reconciliation currently rounds numeric `123.4` to an authorized result and errors for textual totals rather than comparing their exact numeric value. The tests also assert UNKNOWN status/reconciliation-required handling, exact safe observed evidence, raw diagnostic exclusion, no print/retry, and no authorization/attachment for a fractional reconciliation result.
- The pre-existing input-normalization contract cases are retained; they are deliberately not weakened to make trusted evidence pass.
- Implementation, persistence schema, migration, and gateway/network code were not modified. **G2 remains NOT PASSED pending the Developer implementation and rerun.**

## Step 4 independent verification — developer AC-36 fix — 2026-11-18

No source or test files were edited during this QA pass; only this checklist was updated. The test fixtures mock persistence and AFIP issue/reconciliation. **No live AFIP/ARCA call, real database access, database write, or migration was made.**

### Executed verification

- **PASS — complete focused voucher, whole-peso payment, account-level Client identity, row-action, and route reliability run:**
  `npm run test -- --pool=threads --maxWorkers=1 --testTimeout=60000 --reporter=dot ai/features/account-ledger-detail-reliability src/__tests__/unpaid-orders/register-payment.test.ts ai/features/afip-partial-payment-voucher src/components/account-ledger/PaymentVoucherRowActionClient.test.tsx`
  Result: **18 files passed, 164 tests passed, 0 failed** (73.36s). The three AC-36 specs—`payment-voucher.contract.test.ts`, `payment-voucher.service.test.ts`, and `payment-voucher.reconciliation.test.ts`—ran in this batch with one stable thread worker and a 60-second per-test timeout.
- **PASS — exact trusted totals on initial authorization:** numeric `123` and textual `123`, `123.0`, and `123.00` authorize against the persisted 123-peso movement; mismatch persistence is not called. The existing payment-input normalization contract remains separate and still covers whole-peso rounding (`10.5 → 11`, `10.49 → 10`, `0.5 → 1`).
- **PASS — fractional AFIP totals fail closed:** numeric and textual `123.4` return `UNKNOWN` with reconciliation-required status, persist observed `123.4` with allowlisted `TOTAL_MISMATCH`, and do not call authorized persistence. Tests verify payment and parent-order totals remain 123 and 900, respectively; provider debug data is neither returned nor persisted; print rejects the persisted UNKNOWN state; and replay/retry does not claim or issue a second time.
- **PASS — exact reconciliation gate:** numeric/textual `123.4` remain `UNKNOWN`, unattached, non-printable, and non-reissuable; only exact `123`, `123.0`, or `123.00` reconciliation evidence attaches and authorizes. Reconciliation tests also assert unchanged payment/order totals, no provider debug persistence, and no replacement issue call.
- **PASS — scoped ESLint:** ESLint on both feature directories, the payment registration test, account-ledger components/actions/route, and related payment-voucher, AFIP, schema, and money modules exited successfully with no diagnostics.
- **FAIL — focused TypeScript including tests:** the TypeScript compiler-API program reports **68 project diagnostics total, 1 diagnostic in scope**. The sole scoped error is `TS2322` at `ai/features/afip-partial-payment-voucher/payment-voucher.reconciliation.test.ts:83`: its generic `transaction` Vitest mock is inferred as returning `Promise<unknown>`, not `Promise<T>`. No files were changed to address this test typing issue, per instruction. A clean focused implementation-only result is not claimed until rerun separately.
- **PASS — focused implementation TypeScript:** rerunning the compiler-API filter over the payment/account-ledger implementation only reports **0 scoped diagnostics** (68 project diagnostics remain outside this implementation scope). This does not clear the reconciliation-test typing error or establish a repository-wide typecheck pass.
- **PASS — Prisma validation:** `npx prisma validate` reports `prisma/schema.prisma` is valid. This did not connect to or write to a database.
- **PASS — `git diff --check`:** no whitespace errors were reported; Git emitted only LF-to-CRLF conversion notices for existing modified tracked files. The command does not include untracked files.

### Limits and result

- The service parser accepts exact whole-peso decimal forms and rejects fractional trusted totals without rounding. Observed evidence is bounded by the implementation parser (maximum 32 characters, at most two fractional digits, and the configured peso ceiling); the tests exercise the safe `123.4` observation.
- The reconciliation tests inject an authoritative result into the service boundary. The production adapter still returns `unresolved` because no authoritative per-payment gateway lookup is available. Thus the exact comparison behavior is verified, but production reconciliation availability remains blocked.
- **AC-36 behavior: PASS in the exercised mocked contracts. Focused TypeScript gate: NOT PASSED** due to the one diagnostic in the new reconciliation test mock. The combined focused test suites pass. Fiscal gateway contract confirmation, production authoritative reconciliation, and database-backed migration/concurrency checks remain separate open gates. No live AFIP/ARCA or database writes were used.
