# Test checklist — Nota de Crédito

## Step 2 scope

- [ ] **AC-01 / AC-05 — Snapshot and CAE preservation:** authorized A/B/C sales retain original type, AFIP type, fiscal number, point of sale and original CAE; the NC CAE is stored separately.
- [ ] **AC-02 — Eligibility:** only authenticated, business-scoped, authorized A/B/C sales with complete metadata can start a full reversal; legacy ambiguity and non-fiscal sales are blocked.
- [ ] **AC-03 — Mapping:** Factura A/B/C map exactly to NC AFIP 3/8/13, while normal invoice validation continues to accept only 1/6/11.
- [ ] **AC-04 — Association/contract:** `nroAsociado` is numeric and `CbtesAsoc` uses the original type, point and fiscal number. Credentials, internal keys, client financial overrides and replacement CAE fields are absent.
- [ ] **AC-06 / AC-07 — Full reversal:** every original item, including decimal quantities, is restored; refund total equals the order total and uses exactly one linked `Efectivo` cash movement.
- [ ] **AC-08 / AC-10 — Failure safety:** invalid input, missing CAE/metadata/products, unauthorized/cross-business orders, AFIP rejection and local finalization errors produce sanitized errors without partial stock/cash effects.
- [ ] **AC-09 / AC-11 — Idempotency/concurrency:** same-key pending/authorized calls replay safely; a different key cannot authorize an already authorized return; only one voucher, return, stock restoration and refund occur.
- [ ] **AC-12 — Sale detail UI:** eligible sales show original invoice information, all items, exact cash/stock effects, explicit destructive confirmation, loading/error/success states, keyboard-accessible controls and distinct original/new CAE fields.
- [ ] **AC-13 / AC-14 — History/reporting:** history keeps original invoice metadata separate from NC metadata; original printing/auditing uses the original CAE and the refund is reported once.
- [ ] **AC-15 / AC-16 — Security/regression:** server-side auth/business scoping and input validation cannot be bypassed by client financial fields; normal invoicing, editing, printing, QR, tax data and supported manual returns remain unchanged.
- [ ] **AC-17 — Trusted AFIP ordering/capability:** the server-only `getLastVoucher` preflight completes before any `SaleReturn` reservation or claim; a failed lookup causes zero return writes/claims and zero `createVoucher` calls; after successful preflight, reservation commits before issuance. Issuance accepts only the actor/business-bound opaque prepared handle, which cannot be forged or replayed; actor and tenant are derived from auth.

## Deterministic test files

- `credit-note-mapping.test.ts` — pure A/B/C mapping, association, minimal state and response parsing.
- `credit-note-contract.test.ts` — outbound `createVoucher` payload and invoice-vs-NC type validation.
- `credit-note-action.test.ts` — mocked auth/database/AFIP behavior, validation, success, rejection, idempotency and secret sanitization.
- `src/__tests__/actions/credit-note-safety.test.ts` — action ordering, no-reservation on last-number failure, auth-derived actor/tenant and reservation-before-issue using the private prepare/issue boundary.
- `src/__tests__/actions/afip-prepared-voucher.test.ts` — the real private prepared-handle boundary rejects forged and replayed handles without a second `createVoucher` request.
- `credit-note-history.test.ts` — original versus credit-note history mapping.
- `credit-note-ui.test.tsx` — eligibility, confirmation, double-click protection and distinct CAE presentation.

The tests intentionally target the Step 2 contracts and remain compilable as test source before the production modules exist; they are expected to fail red until those modules and behaviors are implemented.
