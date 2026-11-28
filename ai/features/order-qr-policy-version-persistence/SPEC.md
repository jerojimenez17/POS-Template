# Order QR policy version: Prisma persistence failure

## Status and scope

- **Status:** Architecture/root-cause specification only. No application code, schema, migration, or tests are changed by this work.
- **Feature/bug:** `newBill` can obtain an externally authorized AFIP/ARCA CAE and then fail to persist the sale because `tx.order.create` rejects `qrDataPolicyVersion` with `PrismaClientValidationError: Unknown argument`.
- **In scope:** Confirm the field's canonical purpose; align the Prisma schema, generated client, deployed runtime and database migration; specify regression coverage and safe handling of the potentially issued-but-unrecorded voucher.
- **Out of scope:** Reissuing/reconciling a voucher automatically, changing the QR attestation contract, changing fiscal snapshot contents, or altering unrelated order/payment schemas.

## Root cause and repository evidence

### Confirmed source contract

1. `prisma/schema.prisma`, `Order` model, declares `qrDataPolicyVersion Int @default(1)`.
2. The checked-in migration `prisma/migrations/20261127000000_add_authorized_arca_qr_grant/migration.sql` adds the column, explicitly backfills existing rows to `0`, then sets default `1` and `NOT NULL`. The same migration also creates `AuthorizedArcaQrGrant` and its indexes/FK.
3. `src/actions/sales/process.ts` writes `qrDataPolicyVersion: 1` whenever a CAE is being persisted. `src/actions/sales/update.ts` also writes version `1` when it adds/updates a CAE.
4. `src/lib/server/authorized-arca-qr-grant.ts` reads the field when resolving print data: version `0` and no grant permits only the narrowly defined legacy raw QR path; version `1` without a grant resolves to no QR. The version is therefore a persisted trust-boundary marker, not redundant CAE metadata.
5. `ai/features/afip-arca-qr-data/SPEC.md` and its checklist explicitly require legacy rows to be migrated as `0` and new CAE writes to be `1`, including writes without a QR grant.

### Failure mechanics

`PrismaClientValidationError: Unknown argument qrDataPolicyVersion` means the Prisma client runtime validating `OrderCreateInput` does not know that scalar. This happens before PostgreSQL can report a missing column. A database that has not received the column migration, when used with a current generated client, would instead fail later at the database layer (for example, an unknown-column error); applying SQL alone does not teach a stale generated client about the field.

The best-supported root cause is thus a **schema/generated-client/runtime version mismatch**: deployed code supplies a field that the deployed generated Prisma Client metadata does not contain. The checked-in schema and migration already encode the intended field, so deleting the write or moving the value into `Order.CAE` JSON is not a correct repair. Relocation would break the resolver's version-based legacy/new authorization policy and would leave other readers/writers with no canonical policy marker.

Repository inspection cannot prove which generated client is running in the reported deployment or whether its database has applied the migration. Generated client artifacts are not checked into this repository, dependencies are not present in the inspected workspace, and no live database / `_prisma_migrations` state was available. The migration timestamp is `20261127000000`, one day later than the environment date at inspection; timestamp alone is not evidence that the migration is or is not applied. Confirm the deployed artifact and database migration history during rollout.

### Issuance-before-persistence sequence and exposure

`src/app/(protected)/newBill/page.tsx` renders the billing flow. In `src/components/Billing/BillButtons.tsx`, `createSale(true, false)` calls `createAfipVoucherAction` first and then calls `processSaleAction` to save the sale. The public AFIP action delegates to the issue path and returns CAE data before local order creation. `processSaleAction` then consumes fiscal-snapshot and optional QR grants within its Prisma transaction and calls `tx.order.create`.

If `order.create` rejects the unknown field, the sale transaction fails and rolls back its local writes, including transactional grant consumption; there is no successful `orderId`, and the normal immediate print path is not reached. This does **not** undo an AFIP authorization that already happened in the prior action. The externally issued voucher may consequently exist without an `Order` row, stock movement, or other sale-side effects. The current catch/result is a generic sale failure, which does not itself tell an operator that the CAE could already be valid. Retrying the invoice-confirm action can call the external issuance path again; it must not be treated as a safe persistence retry.

## Minimal durable remediation

1. **Keep `Order.qrDataPolicyVersion` as the canonical scalar.** Do not remove it from `processSaleAction`/`updateOrderCaeAction`, put it only in `CAE` JSON, or weaken/remove the version-aware print resolver.
2. **Generate the Prisma Client from the checked-in schema used to build the application.** Run `npx prisma generate` after the exact source/schema checkout in the build/release pipeline; ensure the deployed server bundle contains that generated client and is not reusing a stale client/build cache. `package.json` has a `postinstall` hook for `prisma generate`, but the release must not assume that hook ran if install scripts are skipped or generated artifacts are cached/copied across revisions.
3. **Check and deploy the existing migration, not a duplicate.** Inspect `npx prisma migrate status` and the target database's `_prisma_migrations`. If `20261127000000_add_authorized_arca_qr_grant` is pending, apply through the normal production migration stage (`npx prisma migrate deploy`) before running code that depends on it. If it is already recorded, verify the actual column/default/nullability and resolve drift through the established migration process. Do not use `prisma db push` as a production substitute and do not edit an already-applied migration.
4. **Release the generated application and migration as a coordinated compatible rollout.** A current generated client paired with a database missing the column exposes a database error rather than this validation error; do not declare the issue fixed until both client and database states are verified.
5. **Do not add a new migration solely for this bug.** The field and its legacy backfill/default are already represented by the checked-in schema and migration. Add a new migration only if deployment inspection proves the existing migration is absent/incorrect for a legitimate schema change; do not duplicate it preemptively.

## Compatibility and data constraints

- Preserve the migration's compatibility semantics exactly: existing `Order` rows are classified as policy version `0`; rows inserted after migration default to `1`; the column is non-null. Do not backfill historical rows to `1`, infer history from `createdAt`, or allow a newly authorized CAE to become legacy due to a missing QR grant.
- Version `0` may use only the existing DB-persisted legacy raw value when there is no attestation reference; it must never be upgraded into a locally constructed/verified QR by this fix. Version `1` with no valid grant remains QR `none`, while preserving ordinary CAE/invoice data.
- Keep `qrDataPolicyVersion` independent of `fiscalSnapshot`. A fiscal snapshot proves fiscal breakdown for its own use; it is not the QR policy marker and must not be moved or substituted.
- Continue to consume grants transactionally with order persistence. A failed `order.create` must not leave grant consumption or partial stock/cash/order mutations committed. Do not create a cross-service transaction assumption that would pretend the prior AFIP request can roll back.
- Keep the rollout additive and compatible with existing order readers, legacy orders and old QR print behavior. No CAE/invoice field names or public action contracts need to change for this fix.

## Required tests and verification (for implementation)

1. **Generated-client contract:** after `npx prisma generate`, compile/type-check an `OrderCreateInput` containing `qrDataPolicyVersion: 1`; generated Prisma metadata must accept the field. Run `npx prisma validate` and the application typecheck/build against that generated client.
2. **Sale action regression:** exercise `processSaleAction` with a CAE and authorized fiscal snapshot (and, separately, a QR grant where applicable); assert `order.create` receives `qrDataPolicyVersion: 1` plus the existing CAE, bill type, AFIP voucher type, invoice number/POS/issued-at and fiscal snapshot fields. The action must return a persisted `orderId` when persistence succeeds.
3. **Non-CAE compatibility:** a non-invoiced sale continues to create successfully without supplying CAE policy data; the database default leaves the new row at version `1` as declared by the schema/migration.
4. **Migration/backfill contract:** apply the migration to a database containing pre-existing orders. Assert all old orders receive version `0`, new rows default to `1`, the column is `NOT NULL`, and the QR grant schema/indexes/FK remain present. This is migration integration verification, not merely a mocked Prisma unit test.
5. **Transactional failure:** force `order.create` to fail after grant validation/consumption and assert the transaction rejects/rolls back without committed order, stock/cash changes, or grant consumption. Do not assert that the external authorization is reverted.
6. **Runtime/deployment verification:** in the deployed build, verify its generated Prisma client is from the same schema revision as the application and verify `migrate status`/database column state. The regression is not closed by passing mocked action tests alone.
7. Run focused sale-action tests (including `src/__tests__/actions/processSaleAction.test.ts` and related QR attestation tests), then the repository's Prisma validation, typecheck/build and relevant regression suite. No test implementation is part of this specification-only task.

## Already-issued-voucher incident handling and communication

For any occurrence where CAE authorization succeeded but sale persistence failed:

- **Do not click the invoice/create-voucher action again and do not automatically re-call the AFIP gateway.** This path issues before saving; another click may create another voucher rather than retry only the database write.
- Verify the exact CAE and invoice status with the authorized AFIP/ARCA source using the business's normal fiscal procedure. Preserve the returned voucher evidence and the original sale details. Treat status as **potentially issued** until verified; a client toast or missing order is not evidence of non-issuance.
- Reconcile the authorized voucher to the sale through an approved, audited operator/support procedure. Do not fabricate a replacement CAE, silently insert an order that skips stock/cash invariants, issue a credit note, or assume the authorization can be cancelled; those actions require explicit fiscal/accounting verification.
- Communicate to the operator in plain language: **“The invoice authorization may have succeeded, but the sale was not saved. Do not issue again. Verify the CAE with AFIP/ARCA and contact support/reconcile before retrying.”** This may be an operational incident message for the immediate deployment; the generic error alone is insufficient communication.
- Record affected businesses/transactions from safe operational evidence and reconcile each one before enabling a user to retry. Avoid logging or broadcasting full CAE, CUIT, credentials, QR payload/token or recipient personal data.

This remediation prevents the specific stale-client validation failure, but it does not make external issuance and local persistence atomic. General issuance idempotency/recovery is deliberately not claimed as solved by adding the marker or regenerating the client.

## Measurable acceptance criteria

- **AC-01:** The generated Prisma Client used by the shipped application recognizes `Order.qrDataPolicyVersion`; a focused TypeScript contract and `processSaleAction` regression pass with an invoice input.
- **AC-02:** Target database migration history and live column state are verified; the column is non-null, historical rows are `0`, and new rows default to `1`.
- **AC-03:** A successful CAE sale persists its policy marker and existing invoice/fiscal snapshot data in the same order transaction, returning an `orderId`; the reported `Unknown argument qrDataPolicyVersion` does not recur.
- **AC-04:** Existing QR behavior remains unchanged: only version `0` with no grant can take the legacy-raw branch; version `1` without grant does not expose QR; valid grants continue to resolve under the established policy.
- **AC-05:** A local persistence rollback leaves no partial order/stock/cash/grant-consumption effects, while documentation and operator communication explicitly recognize that an earlier external CAE authorization may remain issued.
- **AC-06:** No code path automatically repeats AFIP issuance as a response to this persistence error, and affected vouchers are directed to verified operator reconciliation rather than blind retry.
- **AC-07:** The fix is delivered without deleting/relocating the canonical scalar, rewriting an applied migration, changing legacy classification, or introducing a replacement schema field.
