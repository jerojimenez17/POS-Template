# Credit-note issuance point of sale — Technical Specification

## Status and scope

- **Stage:** G1 architecture/specification only; no production source or test files are part of this deliverable.
- **Goal:** issue a credit note using a valid, tenant-configured emission point of sale (POS), while preserving the distinct POS and number of the original invoice in the associated-voucher data.
- **No schema/dependency change:** current `Business.ptoVenta`, `Order.invoicePointOfSale`, and `SaleReturn` voucher metadata are sufficient.
- **Out of scope:** POS administration/default selection UX, changing invoice POS selection, AFIP credential/transport redesign, partial credit notes, and any change to the existing credit-note recovery/reconciliation policy.

## Repository findings and root cause

The checked-out implementation has two different POS roles, but the credit-note state currently carries only the associated invoice POS:

1. `createCreditNoteAction` authenticates an `ADMIN`, takes `businessId` from the session, reads the order with `{ id, businessId }`, and normalizes persisted fiscal metadata. `NormalizedSaleFiscalMetadata.invoicePointOfSale` is the original invoice POS, sourced from the persisted `Order.invoicePointOfSale` (or an allowed missing-field recovery proposal where that fiscal field is missing).
2. Its local billing-configuration preflight currently passes that original POS as `puntoVenta`. `preflightCreditNoteBillingConfiguration` validates the argument against the session business's `Business.ptoVenta`. That is the wrong POS role: an original invoice need not have been issued at the tenant's currently configured emission POS.
3. `buildCreditNoteVoucherState` in `src/services/afip/credit-note.ts` currently sets `nroAsociado` and `ptoVentaAsociado`, and builds `CbtesAsoc[0].PtoVta` from `ptoVentaAsociado`, but it never sets `ptoVenta`.
4. The actual `prepareAfipVoucherForActor` implementation in `src/lib/server/afip-voucher.ts` reads **only** `Number(billState.ptoVenta)` at line 115. It does not fall back to `ptoVentaAsociado`. With the state built above, that is `NaN`; `validatePointSaleRequest` rejects it before calling `getVoucherNumberForActor` / remote `getLastVoucher`. The existing unit mock's `billState.ptoVenta ?? billState.ptoVentaAsociado` fallback is not present in production and masks this missing-field boundary.
5. The opaque prepared payload stores the validated `ptoVenta` and uses it as `arca.puntoVenta` for `createVoucher`. `issuePreparedAfipVoucher` removes `ptoVenta` from the nested outgoing `billState`, but intentionally retains `ptoVentaAsociado`, `nroAsociado`, `caeAsociado`, and `CbtesAsoc`. Therefore fixing the emitter POS must not overwrite or reuse the associated original POS.

**Root cause:** the credit-note builder creates an associated-document POS but omits the required emission `BillState.ptoVenta`; preflight and issuance each interpret the *emission* POS as `billState.ptoVenta`. Separately, the earlier configuration preflight has been given the original invoice POS and incorrectly treats it as the POS to issue from. `Number(undefined)` becomes `NaN`, so the real preparation rejects before `getLastVoucher` and before any `createVoucher` call.

## POS decision and trusted sources

Maintain these as separate values throughout the flow:

| Purpose | Canonical field / wire location | Authoritative source | Example |
|---|---|---|---:|
| POS that issues the new credit note | `BillState.ptoVenta`; remote `arca.puntoVenta`; argument to `getLastVoucher` | The authenticated tenant's persisted `Business.ptoVenta[0]` | `9` |
| POS of the original invoice being reversed | `BillState.ptoVentaAsociado`; `CbtesAsoc[0].PtoVta`; persisted `SaleReturn.originalPointOfSale` | Validated original fiscal metadata from the tenant-scoped `Order.invoicePointOfSale` (or the existing allowed recovery input only when the value is actually missing) | `3` |

The existing billing UI chooses `ptoVentas[0]` as its default (`BillParametersForm` and `newBill/page.tsx`), and no separate persisted credit-note default exists. To avoid introducing a new selection contract, credit-note issuance must use the **first configured entry** in the current authenticated business's `Business.ptoVenta` list. It must not derive the emission POS from the original order or from `ptoVentaAsociado`. If the list is empty or its first entry is invalid, fail closed; do not silently skip invalid entries, fall back to the original invoice's POS, or choose a client-proposed value. Multi-POS selection/default policy is a separate feature.

Trusted identity and source rules:

- Business identity is `auth().user.businessId`, not a request field. Preserve the existing `ADMIN`-only credit-note policy and tenant-scoped order lookup.
- Resolve the emission POS from the persisted `Business` row for exactly that business. `Business.ptoVenta` is the allowlist/configuration (`Int[]`); it is not replaced by order fiscal history or browser state.
- The original POS remains the normalizer's validated `invoicePointOfSale`. Missing-fiscal-data recovery remains limited to fields already allowed by `missingFiscalDataSchema`; it can never choose the emission POS, CAE, order, tenant or price/content.
- A caller-supplied `BillState.ptoVenta` is not authority for a credit-note operation. Internal state must be built from the resolved Business setting. If a public generic voucher action accepts an explicitly marked credit-note request, it must derive/validate its emission POS server-side under the same rule (or reject direct credit-note requests and leave credit-note issuance to the server-owned credit-note action); it must never let a browser override the credit-note emission POS. Normal invoice caller contracts remain backward compatible and continue server-side allowlist validation.

## Validation and conversion contract

Both POS values must be concrete numeric values before entering AFIP helpers; there is no coercion at the boundary from arbitrary strings, booleans, `null`, `undefined`, empty strings, fractions, or non-finite numbers.

- Validate each POS with `typeof value === "number"`, `Number.isSafeInteger(value)`, and `value > 0`.
- The configured emission POS must additionally equal the selected persisted `Business.ptoVenta[0]` and be present in the persisted configured list. Use the first entry as the deterministic selection; reject an invalid first entry or a changed/mismatched selection rather than falling back.
- The original POS must already pass the sale fiscal normalizer's positive-safe-integer validation and remain the same value used by `nroAsociado`/`CbtesAsoc` and persisted original metadata.
- Do not use `Number(value)` as validation. If a legacy value reaches normalization as a string, only the existing strict digit-only, safe-positive-integer fiscal parser may normalize it; convert once after that parser has accepted it. Prisma `Business.ptoVenta` and `Order.invoicePointOfSale` are `Int` fields.
- `validatePointSaleRequest` currently tests positive integer and configured-list membership; retain this check for both the emission POS and credit-note voucher type. Make the safe-integer requirement explicit at the credit-note trust boundary even if Prisma's `Int` range is narrower.
- No database schema change is needed. The `SaleReturn` original POS fields continue to mean the original invoice POS; the returned credit note POS fields continue to mean the newly issued voucher POS.

## Request, state and payload contracts

### Public credit-note request

Keep `createCreditNoteAction` input as the existing strict contract:

```ts
{
  orderId: string;
  idempotencyKey: string;
  confirmed: true;
  missingFiscalData?: {
    billType?: "Factura A" | "Factura B" | "Factura C";
    invoicePointOfSale?: number; // original invoice only, only if actually missing
    invoiceNumber?: number;      // original invoice only, only if actually missing
  };
}
```

There is deliberately **no emission POS field** in this request. Reject extra keys under the existing strict Zod contract. Products, totals, client fields, tenant/actor context, original fiscal values already persisted, and both voucher POS values are recomputed/read server-side.

### Internal builder/preparation contract

- Resolve an explicit trusted `{ emissionPointOfSale, originalPointOfSale }` pair before building voucher state. The emission value comes from Business configuration; original value comes from normalized Order fiscal metadata.
- `buildCreditNoteVoucherState` must set `ptoVenta = emissionPointOfSale` in addition to the existing original fields. It must preserve `ptoVentaAsociado = originalPointOfSale` and set `CbtesAsoc[0].PtoVta = originalPointOfSale`, with the original invoice type and number.
- Validate both numbers before producing usable state. Do not let a `Record<string, unknown>` or a generic cast bypass these invariants; prefer a typed builder input/result or return a controlled validation failure.
- `prepareAfipVoucherForActor` continues to validate actor/feature/tenant configuration and issue an opaque, single-use, in-process prepared handle. For a credit note it must verify the supplied emission POS equals the persisted tenant-selected POS; the associated POS is association metadata only and must never be used for `getLastVoucher`.
- The opaque payload's emission `ptoVenta` is the sole source for both `getLastVoucher(emissionPOS, creditNoteType, ...)` and outgoing `arca.puntoVenta`. It is not exposed to the client and cannot be edited after preparation.

### AFIP payload semantics

For a fixture with `Business.ptoVenta = [9, 12]` and original invoice `Order.invoicePointOfSale = 3`, original number `45`, original type `Factura B`:

```ts
// Read-only sequence request
getLastVoucher(9, 8, "credit-note", { businessId, role: "ADMIN" });

// createVoucher HTTP body
{
  arca: { puntoVenta: 9, tipoFactura: 8, /* server credentials */ },
  billState: {
    nroAsociado: 45,
    ptoVentaAsociado: 3,
    CbtesAsoc: [{ Tipo: 6, PtoVta: 3, Nro: 45 }],
    // ...existing credit-note bill state
  }
}
```

As today, `ptoVenta` is not required in the minimal outgoing nested `billState` if the cloud service reads emission POS from `arca.puntoVenta`; do not move the original POS into `arca.puntoVenta`. Preserve the current minimal payload/credential boundary and verify the Cloud Function's `createVoucher` contract consumes `arca.puntoVenta` for issuance and associated voucher fields for the original invoice.

## Required ordering, authorization and safe pending behavior

Keep the existing security and issuance ordering intact while correcting POS resolution:

1. Validate the strict request; authenticate; require `ADMIN`; derive user/business from session; fetch paid Order under `{ id, businessId }`; normalize original metadata and content.
2. Preserve existing authorized/pending/idempotency/manual-return/cashbox behavior. An already-authorized matching request returns saved data. A pending row with saved, valid voucher data can only finalize locally; unresolved pending state must not call AFIP again.
3. Load/validate persisted `Business.features.hasAfipBilling`, ARCA credentials/configuration and `Business.ptoVenta`; resolve and validate its first configured emission POS. Separately validate the original POS. The local credit-note configuration preflight must validate the **resolved emission POS**, not `normalized.invoicePointOfSale`, and should return/use that server-derived POS rather than accept it as client authority.
4. Build the bill state with both POS fields. Run `prepareAfipVoucherForActor`; it repeats trusted actor/configuration/allowlist/type checks, then calls read-only `getLastVoucher` using the emission POS. A failed/invalid lookup stops before new reservation/claim and before createVoucher.
5. Only after deterministic preflight and cashbox checks, reserve/claim under the existing tenant-scoped order lock. Re-read the tenant's persisted Business POS configuration inside the reservation transaction where feasible; if its first configured POS no longer matches the validated emission POS, abort before writing a reservation. Commit a valid reservation before the external issuance call.
6. After reservation commit and immediately before `createVoucher`, retain a final persisted-Business POS guard. If configuration changed after preflight/reservation, consume/finalize the reservation as definitively not issued (`REJECTED`), do not call `createVoucher`, and return a safe configuration-changed result. This is a known non-issuance, not an ambiguous outcome: it must not remain `PENDING`. A reservation may already have existed because the configuration change can occur concurrently after its commit; do not claim that this race guarantees zero reservation writes. Do not automatically retry in the same request. A later retry is allowed only under the existing definitive-nonissuance retry policy and after rerunning every local/configuration/cashbox/read-only `getLastVoucher` preflight.
7. Consume the prepared handle once. `issuePreparedAfipVoucher` uses its opaque emission POS to call `createVoucher` only after the final guard passes; never reconstruct the emission POS from the outgoing associated-voucher metadata.
8. Preserve all current response persistence/finalization rules: persist valid CAE/number/issued POS on `SaleReturn` as `PENDING` before local finalization; local resume does not call AFIP; an ambiguous outcome or persistence gap remains safely pending and is not automatically reissued; only proven pre-issuance failure or authoritative rejection may be released under the existing policy. A final-guard configuration change is an additional explicitly proven non-issuance case and must be recorded `REJECTED`, not `PENDING`.

Distinguish configuration failures by timing:

- **Before reservation:** any missing, invalid, or mismatched POS detected during local preflight or the read-only `getLastVoucher` preparation/preflight must cause zero `SaleReturn` reservation/claim writes and zero `createVoucher` calls. The POS lookup is read-only; do not reserve first and then validate it.
- **After successful preflight/reservation, before issuance:** if persisted `Business.ptoVenta` changes such that the resolved emission POS is no longer the valid current selection, the reservation transaction recheck should abort before creating a reservation when it observes the change. The mandatory final issuance guard covers a later race after transaction commit: mark the existing reservation `REJECTED` as definitively not issued, do not call `createVoucher`, and return the safe configuration-changed result. A write/reservation may have committed before the concurrent change, so zero reservation writes cannot be guaranteed for this timing.

Do not move the AFIP call inside the database transaction, make an opaque prepared voucher reusable, or weaken the cross-request/idempotency guard. Continue not logging certificates, keys, tokens, CAE, or full AFIP payloads.

## Error behavior

- Missing Business, disabled AFIP feature, absent/empty configured list, invalid configured emission POS, non-membership/mismatch, invalid original POS, unsupported credit-note voucher type, or incomplete credentials/configuration detected in local preflight or read-only `getLastVoucher`: return a safe eligibility/configuration error before a new reservation/claim, with zero `SaleReturn` reservation/claim writes and zero `createVoucher` calls. Do not substitute the original invoice POS.
- Invalid local POS/type rejected by preparation has `issuanceNotStarted: true`; surface a safe actionable configuration/eligibility error. Do not represent it as an uncertain issuance and do not reserve a row.
- A `getLastVoucher` transport/ARCA/invalid-number failure returns the existing safe AFIP error path; it is a read-only preflight failure and must result in zero reservation writes and zero `createVoucher` calls.
- If persisted Business POS configuration changes after successful preflight/reservation but before the final issuance guard, do not call `createVoucher`; persist the reservation as `REJECTED` (definitive non-issuance, never `PENDING`) and return a safe configuration-changed result. This result may report issuance did not start. It cannot promise that no reservation existed, because the concurrent configuration change may happen after reservation commit. Permit a later attempt only through the existing definitive-nonissuance retry policy, and only after rerunning every preflight; do not retry automatically in the same execution.
- A failure after createVoucher may have started retains the existing safe `PENDING`/reconciliation behavior unless a trusted structured result proves authoritative rejection or issuance never started. No new error handling may permit a duplicate retry.
- Preserve existing `CreateCreditNoteResult` public shape and codes unless a distinct configuration code is necessary; no raw upstream payload or server secrets are returned.

## Implementation file responsibilities (for later stages)

- `src/actions/sales/credit-note.ts`: resolve emission POS from the authenticated tenant's persisted Business configuration; pass that value to local configuration preflight and builder; do not add emission POS to the public request. Keep original `invoicePointOfSale` in original metadata / SaleReturn original fields.
- `src/lib/server/arca-billing.ts`: expose an internal credit-note configuration result that contains the resolved trusted emission POS, or provide an equivalent server-only resolver; validate exact tenant feature, configuration, safe-positive-integer POS and allowlist. Preflight's current request POS must represent emission POS.
- `src/services/afip/credit-note.ts`: add emission `ptoVenta` to built state while preserving original `ptoVentaAsociado` and associated voucher fields; define a typed/safe contract.
- `src/lib/server/afip-voucher.ts`: treat prepared payload `ptoVenta` as emission POS, verify the credit-note case against persisted configuration, use it for getLastVoucher and `arca.puntoVenta`, and retain associated original POS when composing the minimal nested bill state.
- `src/actions/afip.ts`: retain session-derived authorization and the existing invoice contract; if it permits direct credit-note requests, do not accept client-selected emission POS as authority.
- `src/__tests__/actions/credit-note-safety.test.ts`, AFIP preparation/transport tests: update unrealistic fallback mocks and prove production-equivalent behavior. QA authors tests in the later test stage; none are added in G1.

## Measurable acceptance criteria / test requirements

1. Given session business `business-1` with persisted `Business.ptoVenta = [9, 12]`, original paid order POS `3`, invoice number `45`, and `Factura B`, a successful credit-note path calls `getLastVoucher` exactly once with `(9, 8, "credit-note", { businessId: "business-1", role: "ADMIN" })` and calls `createVoucher` exactly once.
2. At the real `createVoucher` transport boundary, assert `arca.puntoVenta === 9`, `Number.isSafeInteger(arca.puntoVenta) === true`, and `arca.puntoVenta > 0`.
3. In the same transport assertion, prove original association remains intact: `billState.ptoVentaAsociado === 3`, `billState.CbtesAsoc[0].PtoVta === 3`, `billState.CbtesAsoc[0].Nro === 45`, and original type code is `6`. Assert emission POS is not copied over either associated field.
4. Use distinct values for emission/original POS in all primary integration fixtures (`9` and `3`); same-number fixtures alone cannot detect accidental aliasing.
5. The built credit-note state includes `ptoVenta` equal to the trusted Business selection and independent `ptoVentaAsociado` equal to the validated original. No public credit-note request includes a configurable emission POS; unknown `ptoVenta` request fields are rejected and a forged generic action value cannot override the trusted credit-note selection.
6. Test invalid configured emission candidates (missing Business, empty list, zero, negative, fractional, unsafe integer, NaN/infinity at a pure boundary), invalid original POS, and mismatched/unconfigured selected emission POS. Each fails closed before reservation/claim and before getLastVoucher/createVoucher where validation is local.
7. Test that the configuration preflight validates the resolved emission POS against the same tenant's persisted `Business.ptoVenta`; an original invoice POS not present in that list does **not** block issuance if original association is valid and configured emission POS is valid. Conversely, original POS is never used as fallback when emission configuration is absent/invalid.
8. If getLastVoucher fails or gives an invalid last number, assert one read-only lookup, zero SaleReturn reservation/claim writes, zero issuePrepared/createVoucher calls, and no pending row newly created.
9. For any missing/invalid/mismatched emission or original POS discovered in local preflight or the read-only `getLastVoucher` phase, assert zero `SaleReturn` reservation/claim writes and zero `createVoucher` calls. Include a failed read-only lookup case and verify it leaves no new reservation.
10. Simulate a POS configuration change between successful preflight and reservation: the reservation-transaction recheck must observe it where feasible and abort without creating a reservation; assert zero `createVoucher` calls.
11. Simulate a POS configuration change after reservation commit but before the final issuance guard: assert the final guard re-reads persisted Business configuration, `createVoucher` is never called, and the already-created reservation is persisted as `REJECTED` (not `PENDING`) with a safe configuration-changed result. Assert the behavior is classified as definitive non-issuance, while explicitly not asserting zero reservation writes for this concurrent-after-commit race.
12. For that final-guard case, assert there is no automatic retry in the same action execution. If a subsequent retry is exercised, prove it is admitted only by the existing definitive-nonissuance retry policy and reruns every local/configuration/cashbox/read-only `getLastVoucher` preflight before reserving or issuing; the final guard still runs before its `createVoucher` call.
13. Preserve existing behavior for actor/business authorization, ADMIN-only credit-note permission, same-key/idempotency handling, pending rows with/without saved AFIP response, authoritative rejection classification, and uncertain AFIP outcomes. An uncertain request is never issued a second time automatically; a saved successful response resumes only local finalization.
14. Ordinary invoice issuance retains its existing public request behavior and verifies any caller-provided POS against the authenticated tenant's configured list. No secrets or raw AFIP body appear in returned errors/logs.

## Gate G1 — verification

**G1 verified.** The current action/state/helper chain, Prisma `Business.ptoVenta`, `Order.invoicePointOfSale`, BillState fields, AFIP preflight/opaque prepared payload, outgoing `createVoucher` shape, existing credit-note safety tests and project G1 definition were inspected. The production root cause and existing test-mock discrepancy are documented; emission POS is separated from original association POS with trusted source, deterministic selection, validation, request/payload contracts, failure ordering and concrete measurable tests specified. No production source or test files were written; this is a specification-only G1 deliverable.
