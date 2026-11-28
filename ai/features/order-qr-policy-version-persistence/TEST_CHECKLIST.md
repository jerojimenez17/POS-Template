# Order QR policy version persistence — test checklist

Scope: QA Step 2 for `SPEC.md` AC-01–AC-07. Tests in this step cover the action contract and checked-in schema/migration source. They do not change production code, Prisma schema, migrations, or generated artifacts.

## Automated local coverage

- [x] **AC-01 / generated-client type contract:** `prisma-order-create-input.contract.ts` assigns `qrDataPolicyVersion: 1` to `Prisma.OrderUncheckedCreateInput`. Run TypeScript after generating the client; Vitest transpilation alone does not type-check this contract.
- [x] **AC-03 / CAE persistence:** the focused `processSaleAction` test asserts version `1`, CAE, bill type, AFIP voucher type, invoice number, POS, issued-at, and fiscal snapshot are sent together to `tx.order.create`; success returns the persisted `orderId`.
- [x] **AC-03 / fiscal snapshot grant:** the invoice action test asserts the authorized snapshot grant is consumed using the sale tenant, CAE, bill type, invoice number, POS and total, and that the returned snapshot is stored separately from the QR policy scalar.
- [x] **AC-03 / non-CAE compatibility:** a non-invoiced sale succeeds without `CAE` or an explicit policy version in create data, leaving version assignment to the schema/database default.
- [x] **AC-02 / source migration contract:** static source assertions require the `Order` scalar to occur once with `Int @default(1)` and require the existing migration to backfill old rows to `0`, then apply default `1` and `NOT NULL`.
- [x] **AC-02 / no duplicate migration:** static source assertion requires exactly one checked-in migration adding this column and checks that migration's existing `AuthorizedArcaQrGrant` table/index/FK contract remains present.
- [x] **AC-05 / local transaction failure:** simulated `order.create` rejection is returned as a sale failure; downstream stock, stock-movement, cash-box, cash-movement, and post-commit work are not run after the failure. The fiscal-snapshot grant operation is invoked before the failing order write, inside the transaction callback.

## Contract boundaries and manual/integration acceptance

- [ ] **Actual generated client:** generate from this exact checkout and type-check `prisma-order-create-input.contract.ts` (commands below). A mocked Prisma transaction and a source-level type contract do not establish which generated client is bundled in a deployment.
- [ ] **Live database migration (AC-02):** against an isolated PostgreSQL database with pre-existing `Order` rows, apply the existing migration and query `information_schema.columns` plus the rows. Verify historical rows are `0`, omitted values on new rows become `1`, and the column is non-null. Also verify `_prisma_migrations` records the existing migration and inspect the live `AuthorizedArcaQrGrant` indexes/FK. Do not add a duplicate migration for this scalar.
- [ ] **Real Prisma transaction rollback (AC-05):** integration-test against PostgreSQL with an injected `Order.create` failure after grant validation/consumption. Verify no order, stock, cash, or grant-consumption mutation commits. The mocked action test only verifies call order and that no later local writes execute; it does not prove database atomicity.
- [ ] **Deployment pairing (AC-01/02):** verify the shipped server bundle's generated Prisma Client corresponds to the application/schema revision and separately verify target migration status and live column definition. Passing unit tests or `prisma validate` is not proof of deployed state.
- [ ] **AC-04:** retain/run the existing QR attestation and print-resolver regression tests: version `0` without grant is legacy raw only, version `1` without grant resolves to no QR, and a valid grant resolves under the established policy. This feature's action test does not replace resolver coverage.
- [ ] **AC-06 / incident safety:** any pre-existing externally authorized CAE is not rollbackable by the sale database transaction. Do not automatically reissue or retry AFIP/ARCA authorization when persistence fails. Verify voucher status with the authorized fiscal source and reconcile through the approved audited operator/support process. The tests must not claim or assert that external authorization is undone.
- [ ] **AC-07:** preserve the canonical scalar, existing migration and legacy classification; do not move this marker into CAE JSON, add a replacement field, or rewrite an applied migration.

### Commands

Run from the repository root, with the intended environment configured:

```sh
npx prisma validate --schema prisma/schema.prisma
npx prisma generate --schema prisma/schema.prisma
npx tsc --noEmit
npx vitest run ai/features/order-qr-policy-version-persistence/order-qr-policy-version-persistence.test.ts
npx vitest run src/__tests__/actions/processSaleAction.test.ts ai/features/afip-arca-qr-data/qr-attestation-sales-actions.test.ts ai/features/afip-arca-qr-data/qr-attestation-print-resolver.test.ts
```

`npx tsc --noEmit` includes the focused `Prisma.OrderUncheckedCreateInput` assignment above. Run `npx prisma migrate status` and `npx prisma migrate deploy` only in the appropriate target environment/release procedure; deploy the existing migration only if it is pending. Do not use a mocked test as evidence that deployment has applied a migration or shipped a current generated client.

### QA run notes

- `npx prisma validate --schema prisma/schema.prisma`: passed.
- The focused generated-client contract command (shown above) passed against the currently installed `@prisma/client` and recognizes `qrDataPolicyVersion`.
- `npx prisma generate --schema prisma/schema.prisma`: attempted, but this Windows workspace returned `EPERM` renaming `node_modules/.prisma/client/query_engine-windows.dll.node.tmp*` over `query_engine-windows.dll.node`. Re-run after the file lock is cleared; do not claim this run regenerated the client.
- The new focused Vitest file and the existing sale-action/QR attestation/print-resolver tests passed (5 and 31 tests respectively).
- Repository-wide `npx tsc --noEmit` remains failing on unrelated existing test errors (product test fixtures/relations, auth mock types, shortcut action result unions, and related stale test types). It reported no errors in the new test or contract files after the input literal was narrowed. The repository-wide compile gate is therefore not green.
