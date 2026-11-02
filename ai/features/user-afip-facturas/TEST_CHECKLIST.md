# USER AFIP/ARCA invoice test checklist

Focused automated coverage is in the three Vitest suites in this directory. Checks marked **manual/out-of-scope for these focused tests** are listed for acceptance verification without changing UI or implementation in this QA-only step.

## Authorization and tenant binding

- [ ] An authenticated `USER` with a session user id and business id can use the public AFIP invoice action for Factura A, Factura B, and Factura C.
- [ ] The action passes only actor identity, role, and tenant from `auth()` into trusted preparation; caller-supplied actor/role/business fields cannot select another tenant or elevate privileges.
- [ ] Missing session, user id, business id, or role and unsupported roles fail before trusted preparation, sequence lookup, or voucher creation.
- [ ] An authenticated `USER` can request the invoice number preview through the existing two-number-argument Server Action, which selects the session business and invoice operation only.
- [ ] `USER` is denied credit-note sequence lookup at the shared helper before DB/ARCA operations; unsupported roles remain denied.
- [ ] Existing ADMIN/SUPER_ADMIN invoice access and ADMIN credit-note lookup remain compatible.

## Invoice-only restrictions

- [ ] A USER invoice request containing `nroAsociado`, `ptoVentaAsociado`, `caeAsociado`, non-empty `CbtesAsoc`, `fiscalSnapshot`, or `fiscalBreakdown` is rejected before preparation/sequence lookup and issuance.
- [ ] A direct USER call to shared prepared-voucher logic with associated-voucher fields is rejected before credentials, sequence lookup, or issuance.
- [ ] No USER credit-note permission is added to the public credit-note action, unrelated voucher operations, or other voucher types.

## Entitlement and pre-issue safeguards

- [ ] `hasAfipBilling` denial prevents preparation/issuance for USER, ADMIN, and SUPER_ADMIN.
- [ ] The entitlement is rechecked against freshly persisted business features when consuming the prepared handle (independent of the actor's in-memory feature snapshot); revocation after preparation rejects issuance and prevents the external create-voucher request.
- [ ] Invalid/unsupported invoice data, unconfigured POS, non-positive total, missing credentials/secrets, and failed authoritative sequence preflight are marked `issuanceNotStarted` and do not call createVoucher.
- [ ] Invoice issuance obtains its own authoritative sequence via the trusted preparation helper; preview output is advisory and cannot override that sequence.
- [ ] The prepared capability remains opaque and single-use; forged/replayed handles cannot cause a second external issuance.
- [ ] Existing account delinquency/write blocking, server-side credential handling, POS/type validation, payload projection/sanitization, and secret handling are preserved.

## UI acceptance

- [ ] **Manual/out-of-scope for these server-focused tests:** USER can still access the existing invoice button/keyboard flow only when the existing AFIP feature and active-cashbox checks pass, and issuing still requires the existing confirmation UX.

## AC-13 through AC-19: `/newBill` invoice-number preview

- [ ] **AC-13 — Session-bound page/action context:** the public lookup keeps its two-argument contract, requires the session user/business, queries only the session business, and has no caller-selected tenant path. Page POS/IVA defaults come from the authenticated page context (page rendering is not directly covered by the focused tests).
- [ ] **AC-14 — Configured invoice POS/type:** valid invoice voucher types 1, 6, and 11 with a configured POS can proceed; an unconfigured POS, unsupported/credit-note type, or missing POS is rejected before any external last-voucher request.
- [ ] **AC-15 — Persisted entitlement:** persisted `features.hasAfipBilling === true` allows one USER invoice lookup; false, absent, or otherwise missing entitlement denies it before the external request. The persisted lookup is scoped to the session business and does not rely on session feature snapshots.
- [ ] **AC-16 — Preview display:** a successful response `N` displays `N + 1`, paired with the configured POS and selected invoice type. Preview values remain display-only and do not alter the issuance preparation lookup.
- [ ] **AC-17 — Safe failure feedback:** returned errors and rejected/thrown lookup actions stop loading, clear any stale number, and expose an accessible preview-specific recovery/error state; missing POS does not leave loading stuck. Failure wording does not claim CAE generation/rejection, and raw sensitive error details are not rendered or logged.
- [ ] **AC-18 — Latest request wins:** when POS/type selections create overlapping requests, only the newest current selection may update the number, error, or pending state.
- [ ] **AC-19 — Regression coverage:** existing USER invoice lookup authorization, administrator lookup behavior, credit-note denial, configured POS/type rules, and prior issuance/prepared-voucher suites remain covered and unchanged in policy.

The AC-13–AC-15 server/helper cases are in `user-invoice-number-lookup.test.ts`; AC-16–AC-18 UI behaviors are in `user-invoice-form-preview.test.tsx`. Existing action and prepared-voucher coverage remains in the other two suites.

## Commands

- Focused: `npm run test -- ai/features/user-afip-facturas`
- Preview focused: `npm run test -- ai/features/user-afip-facturas/user-invoice-number-lookup.test.ts ai/features/user-afip-facturas/user-invoice-form-preview.test.tsx`
- Repository: `npm run test`
