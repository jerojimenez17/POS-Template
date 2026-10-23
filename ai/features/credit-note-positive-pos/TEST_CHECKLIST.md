# Credit-note emission POS test checklist

## POS role separation and AFIP wire contract

- [ ] The credit-note state builder receives a trusted emission POS and original invoice POS as distinct values.
- [ ] `BillState.ptoVenta` is the persisted authenticated tenant selection `Business.ptoVenta[0]` (fixture: `9`).
- [ ] `BillState.ptoVentaAsociado` remains the validated original `Order.invoicePointOfSale` (fixture: `3`).
- [ ] `nroAsociado` and `CbtesAsoc[0]` retain the original invoice number `45`, original invoice type `Factura B`/AFIP type `6`, and original POS `3`.
- [ ] Real server preparation calls `getLastVoucher(9, 8, "credit-note", { businessId: "business-1", role: "ADMIN" })`; it never uses associated POS `3` for sequence lookup.
- [ ] Actual `createVoucher` transport has `arca.puntoVenta === 9`, and it is a numeric, safe positive integer.
- [ ] Actual transport association fields retain original POS `3`; emission POS `9` is not copied into `ptoVentaAsociado` or `CbtesAsoc[0].PtoVta`.
- [ ] `ptoVenta` is not required in the outgoing minimal nested `billState`; transport uses `arca.puntoVenta` for emission.
- [ ] Original POS `3` is allowed as fiscal association even though it is absent from configured emission list `[9, 12]`.

## Trust boundary and invalid configuration

- [ ] Credit-note public request remains strict and has no emission POS field; extra `ptoVenta` is rejected before database/AFIP/reservation work.
- [ ] Public generic voucher handling cannot make a caller-supplied credit-note POS override tenant configuration: reject the request or use persisted `Business.ptoVenta[0]`.
- [ ] Only the first configured POS is considered; the implementation does not skip an invalid first value, fall back to the original POS, or trust a browser-selected value.
- [ ] Missing Business, empty POS list, zero, negative, fractional, unsafe integer, `NaN`, and infinity emission configuration fail closed.
- [ ] Invalid original POS fails independently while valid emission configuration remains configured.
- [ ] Local invalid configuration/original POS failures make zero reservation/claim writes and zero `getLastVoucher`/`createVoucher` calls.
- [ ] A failed `getLastVoucher` makes one read-only lookup, zero reservation/claim writes, and zero `createVoucher` calls.
- [ ] If persisted `Business.ptoVenta` changes after successful lookup and reservation commit but before the final issuance guard, the guard observes the change, `createVoucher` is not called, and the committed reservation is set to `REJECTED` (never left `PENDING`).
- [ ] The final-guard configuration-change result is safe and does not expose credentials or transport details; this post-commit race does not incorrectly assert that no reservation was written.
- [ ] The configuration-change action does not retry automatically in the same execution.
- [ ] If retry is exercised after definitive non-issuance, the same-key retry reruns local/configuration/cashbox/read-only `getLastVoucher` preflight before reclaiming or issuing, and issuance occurs at most once across both attempts.

## Existing behavior retained

- [ ] All AFIP work is performed through the real server preparation and single-use prepared transport path; tests do not simulate a fallback from `ptoVenta` to `ptoVentaAsociado`.
- [ ] Same-key idempotency, already-authorized recovery, and pending reconciliation/local-finalization tests remain in place and unchanged.
- [ ] Failures return safe action results without disclosing credential values or raw upstream payloads.
