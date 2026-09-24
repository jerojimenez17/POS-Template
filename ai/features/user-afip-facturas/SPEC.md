# USER role AFIP/ARCA invoice issuance

## Status and scope

- **Status:** architectural specification only; this deliverable does not implement code or add tests.
- **Approved feature:** users with the `USER` role may issue AFIP/ARCA invoices (`Factura A`, `Factura B`, or `Factura C`) for their authenticated business.
- **In scope:** the public invoice-issuance Server Action, its trusted server-side preparation/issuance path, and the invoice-number preview lookup used by `BillParametersForm` on `/newBill`. Preserve the existing billing interface and safeguards.
- **Out of scope:** credit-note permissions or behavior; changing voucher lookups unrelated to the invoice form; ARCA credential management; changing invoice payload or fiscal-calculation semantics; schema/migration changes; authorizing users to issue other voucher types.

## Current behavior and architectural context

- `src/actions/afip.ts:createAfipVoucherAction` reads `auth()` and the current implementation admits `USER`, `ADMIN`, and `SUPER_ADMIN` for the ordinary invoice path before validating the invoice payload and calling the trusted preparation/issue functions; tenant and actor context must remain session-derived.
- `src/lib/server/afip-voucher.ts:prepareAfipVoucherForActor` independently checks the actor role, requires `hasAfipBilling`, validates credentials, point of sale, invoice type and positive amount, and obtains the current sequence number. `issuePreparedAfipVoucher` consumes a one-use opaque prepared handle and rechecks `hasAfipBilling` before the external issuance call.
- `src/lib/server/arca-billing.ts:getVoucherNumberForActor` has an additional role gate. Its `operation` argument distinguishes invoice lookup from credit-note lookup.
- `src/actions/voucher.ts:getVoucherNumberAction` is called by `BillParametersForm` to display the next invoice number. The current implementation admits `USER`, derives the business from `auth()`, and invokes only the `invoice` operation. This read is not the issuance preflight: preparation separately performs the authoritative lookup before issuance.
- `src/app/(protected)/newBill/page.tsx` reads `ptoVenta` and `condicionIva` for the authenticated session business and passes the configured points and invoice default to `BillParametersForm`. The form maps Factura A/B/C to AFIP voucher types 1/6/11, requests a lookup when the watched POS/type changes, and displays `lastVoucher + 1` on success.
- `getVoucherNumberForActor` validates invoice type and persisted configured POS and requires business CUIT/credentials plus AFIP service configuration. Unlike invoice preparation/issuance, its current business query does **not** load or enforce `features.hasAfipBilling`; the preview must not become a way to call ARCA for a business lacking the AFIP entitlement.
- The current form displays a generic `Error` beside the POS and an alert when the action returns an error, but labels that alert as a CAE rejection even though this is only a read. Its effect has no `try/catch`, so a rejected action/network call can leave the loading indicator indefinitely; an empty/undefined POS also returns before clearing loading state. Existing automated lookup tests cover authorization/tenant selection and invoice-versus-credit-note helper access, but do not cover entitlement or this page/form's preview and failure states.
- `src/components/Billing/BillButtons.tsx` currently renders the invoice action without role hiding. Its interface uses the active-cashbox-session check before opening the invoice flow and a confirmation dialog before issuing.
- Prisma defines `USER`, `ADMIN`, and `SUPER_ADMIN`; no schema change is needed. The authenticated session provides the user id, role, business id, and business feature snapshot.

## Authorization and issuance requirements

### R1. Authenticated actor and tenant binding

- Continue to call `auth()` inside the public Server Action. Actor identity, role, and business id must come only from that session; never trust caller-provided identity or tenant fields.
- An invoice request is eligible only when the session has a user id, a business id, and an accepted role. A `USER` may proceed only for an ordinary invoice request. Preserve current `ADMIN`/`SUPER_ADMIN` invoice access.
- Continue to reject unauthenticated sessions, missing identity/business context, unsupported roles, and forged actor/business context before any external ARCA call.

### R2. Strict invoice-only scope for `USER`

- A `USER` may issue only `Factura A`, `Factura B`, or `Factura C` through the invoice pathway.
- `USER` must remain unable to submit a credit note, including by directly invoking an action/helper with associated-voucher fields or otherwise reaching the credit-note branch of the shared voucher service.
- Keep the existing public action rejection of credit-note association fields and client-supplied trusted fiscal fields. Preserve the existing admin/super-admin credit-note path without granting it to `USER`.
- Do not change `createCreditNoteAction` role policy or credit-note eligibility, reservation, fiscal-snapshot, POS, or finalization rules.

### R3. Business eligibility and safeguards

- The `hasAfipBilling` business entitlement remains mandatory for preparation and is rechecked immediately before the irreversible issuance call; changing the role allowlist must not bypass either check.
- Preserve delinquent-account write blocking through the existing authorization/feature gate.
- Preserve server-side ARCA credential retrieval, configured point-of-sale validation, supported invoice-type mapping, amount/product/date normalization, untrusted-input projection, and server-only secrets.
- Preserve the opaque, actor/tenant-bound, single-use preparation handle and existing result/error semantics, including the guarantee that validation and preflight failures are marked `issuanceNotStarted` and make no `createVoucher` call.
- Preserve the client-side active cashbox-session check and invoice confirmation flow. This feature does not create a new cashbox bypass.

### R4. Invoice-number preview required by the invoice form

- Permit a `USER` with an authenticated business context to use `getVoucherNumberAction` for its existing invoice-number preview, because `BillParametersForm` invokes it during the invoice flow.
- Keep the existing two-number-argument public contract and constrain the trusted helper invocation to `operation: "invoice"`; do not grant this action any credit-note operation or arbitrary business selection.
- In `getVoucherNumberForActor`, permit `USER` only for `operation: "invoice"`. Keep credit-note lookup unavailable to `USER`; preserve current admin/super-admin behavior for both operations.
- The preview is advisory only. The issuance preparation must continue to perform its own validated sequence lookup; the client preview result must not be trusted as the issued invoice number.

### R5. User interface

- Keep the existing invoice button and keyboard path available to `USER`; do not make client-side visibility the authorization boundary.
- Keep existing feature gating, active cashbox-session checks, and confirmation UX. No new role-based hiding is required because the current invoice button is not role-hidden.

### R6. `/newBill` USER invoice-number preview

- For the preview on `/newBill`, use only the authenticated session business. The page's `ptoVenta` and IVA-condition-derived invoice default are display/form inputs, not authorization evidence; the Server Action must continue to derive the tenant from `auth()` and the trusted helper must query that tenant.
- The preview request must use a configured point of sale belonging to that session business and one of the invoice voucher type codes mapped from Factura A/B/C (1/6/11). Reject/return a safe failure for missing or invalid POS/type before calling the external last-voucher service.
- Require the persisted business `hasAfipBilling === true` entitlement for the preview, checked server-side for the session business before the external request. Do not rely on the page, session feature snapshot, or client inputs to establish entitlement.
- The preview remains advisory: display the configured POS and the next number (`lastVoucher + 1`) only after a valid successful response; issuance preparation continues to fetch its own authoritative sequence.

### R7. Preview failures and user feedback

- A returned lookup error, thrown/rejected Server Action/network failure, missing configured POS, or invalid response must leave the page interactive and stop the pending/loading state; it must not leave a stale number displayed for a different POS/type.
- Show a visible, accessible, user-safe preview failure state in the form, with an appropriate retry/edit route. Do not imply that invoice issuance/CAE generation was attempted or rejected by a read-only preview failure.
- Keep sensitive credentials, tokens, CUIT, raw request/response payloads, and unfiltered upstream diagnostics out of rendered errors and client logs. Safe structured diagnostic details may be used for support; preserve sanitization and do not expose secrets.
- If POS/type inputs change while requests are pending, only the latest matching request may update the visible preview or error state.

## Compatibility and architectural decisions

- No database schema, Prisma model, migration, new dependency, or public request-shape change is expected.
- Preserve current `createAfipVoucherAction` input/result contract, `getVoucherNumberAction(puntoVenta, tipoFactura)` signature/result contract, and current invoice payload DTO.
- Use operation-aware authorization in the shared server-side voucher sequence helper: the new privilege is specifically `USER + invoice`, not a general role relaxation.
- Keep the public credit-note Server Action and its direct role checks unchanged.
- Relevant Next.js guidance was read from the installed Next.js docs: Server Actions are public endpoints, must authenticate/authorize on the server, and client UI restrictions are not sufficient. Installed `package.json` resolves Next.js `^16.2.7`; this is newer than the version stated in the top-level `AGENTS.md`, so implementation should follow installed docs and existing repository patterns.

## Files expected to be affected during implementation

- `src/actions/afip.ts` — accept the `USER` role for ordinary invoices while preserving session-derived identity and invoice-only guards.
- `src/lib/server/afip-voucher.ts` — permit `USER` for ordinary invoice preparation/issuance only; preserve feature checks and all credit-note restrictions.
- `src/lib/server/arca-billing.ts` — operation-aware `USER` authorization for invoice sequence lookup only.
- `src/actions/voucher.ts` — allow the authenticated `USER` invoice form to request the existing invoice-number preview without changing its public contract.
- `src/components/Billing/BillParametersForm.tsx` — show and safely handle the preview result/failure state. `src/app/(protected)/newBill/page.tsx` remains the source of the session business's configured POS list and IVA-derived initial invoice type.
- Existing AFIP action/helper tests should be extended by the QA/Developer workflow; no test files are added in this specification-only step.
- `src/components/Billing/BillButtons.tsx` is expected to remain unchanged: the invoice button is already available without role hiding and already checks the cashbox session before opening the flow.

## Acceptance criteria

- **AC-01 — USER invoice:** Given an authenticated `USER` session with an assigned business and `hasAfipBilling` enabled, a valid `Factura A`, `Factura B`, or `Factura C` request completes the existing preparation path and can reach `createVoucher` after all existing validations pass.
- **AC-02 — Required session fields:** A missing session, user id, business id, or role returns an authorization/pre-issue error; neither invoice sequence lookup nor voucher creation is called.
- **AC-03 — Server-derived actor:** A forged actor, role, or business id in the submitted payload cannot change the session-derived identity/tenant used for feature, credential, and voucher operations.
- **AC-04 — Feature remains mandatory:** A business with `hasAfipBilling` disabled is denied before issuance for `USER`, `ADMIN`, and `SUPER_ADMIN`; the second feature check still prevents `createVoucher` if eligibility is revoked after preparation.
- **AC-05 — Role isolation:** `USER` requests containing credit-note association data or trusted fiscal snapshot/breakdown fields are rejected before the sequence or issuance call. Direct shared-helper credit-note preparation/lookup remains denied for `USER`.
- **AC-06 — Existing administrative policy:** Existing `ADMIN`/`SUPER_ADMIN` invoice behavior remains available, and the existing admin credit-note policy remains unchanged.
- **AC-07 — Invoice number preview:** `getVoucherNumberAction` retains its two-argument contract, allows a session-bound `USER` to request the invoice preview for that session's business, and uses only `operation: "invoice"`.
- **AC-08 — Lookup isolation:** `USER` cannot invoke credit-note sequence lookup; unsupported roles remain denied. The invoice preview does not supply or override the authoritative sequence result used during preparation.
- **AC-09 — Input/ARCA safeguards:** Invalid invoice DTOs, unsupported invoice types, unconfigured points of sale, missing credentials, non-positive totals, or failed preflight are rejected without a `createVoucher` call. Existing sanitizer/projection and secret-handling behavior is retained.
- **AC-10 — One-use issuance capability:** A prepared invoice capability remains opaque and single-use; replayed/forged capabilities cannot trigger a second ARCA issuance.
- **AC-11 — UI safeguards:** The existing invoice button remains visible/usable for a `USER`, subject to existing AFIP feature and active cashbox-session checks and confirmation behavior.
- **AC-12 — No unrelated policy changes:** No change is made to credit-note roles, unrelated voucher lookup operations, Prisma schema, or external ARCA request contracts.
- **AC-13 — Session-bound page preview:** Given an authenticated `USER` with session user id/business id and an entitled business, loading `/newBill` uses that session business's persisted `ptoVenta` and `condicionIva` to initialize the POS and invoice type. The client cannot select a different business, and direct action calls continue to use the session business regardless of caller-supplied context.
- **AC-14 — Configured invoice POS/type:** For each preview request, the action/helper accepts only the selected POS if it is in the session business's persisted configured POS list and only invoice voucher codes 1, 6, or 11. Missing/invalid POS or unsupported type fails before `getLastVoucher` is called; credit-note codes remain denied to `USER`.
- **AC-15 — Entitlement enforced on preview:** With `hasAfipBilling` true on the persisted session business, a valid USER invoice preview may make exactly one last-voucher request. With the entitlement false or absent, the lookup returns a failure and makes zero external requests. Entitlement checks use the session business, not a caller-selected tenant or stale client/session data.
- **AC-16 — Preview number display:** For a valid successful last-voucher response `N`, show the next voucher number `N + 1` with the matching configured POS and selected invoice type. The preview never changes or supplies the authoritative number used by invoice preparation.
- **AC-17 — Safe visible failures:** For returned errors, thrown/rejected actions, invalid responses, or no configured POS, the form exits loading, clears any stale preview number, and renders an accessible visible safe error/recovery state. The message must identify a preview/number lookup problem and must not claim a CAE was generated or rejected. No secret or raw sensitive upstream payload is rendered or logged client-side.
- **AC-18 — Latest request wins:** If POS/type changes produce overlapping requests, only the newest request for the current selection can update the displayed number, pending state, or error.
- **AC-19 — Existing preview authorization tests remain valid:** The existing session-bound USER invoice lookup, two-argument action signature, configured POS/type checks, USER credit-note denial, and administrator lookup coverage continue to pass; focused tests additionally cover entitlement, page/form success, returned failure, rejected action, and missing POS states.

## Implementation verification guidance

1. Add/update focused tests for authenticated `USER` invoice success path, role/tenant forgery, disabled feature, invalid invoice payloads, and pre-issue no-call guarantees.
2. Add/update helper tests proving operation-aware lookup permissions (`USER + invoice` allowed; `USER + credit-note` denied), persisted preview entitlement enforcement, configured POS/type validation, and preserving existing administrator behavior.
3. Add/update focused form/page-preview coverage for next-number formatting and current POS/type pairing, visible safe returned/rejected failures, empty POS, and stale overlapping requests.
4. Verify the second feature recheck, one-use prepared capability, and cashbox/confirmation UI behavior remain intact.
5. Run the relevant Vitest suites, lint, TypeScript/build checks, and inspect the changed-file scope to confirm no credit-note or schema changes slipped in.

## Blockers and known considerations

- No architectural blocker identified.
- `requireFeature` has a pre-existing fallback that allows a barebones actor with no loaded business/features object. This specification requires preserving the current feature gate and never weakening it for `USER`; if implementation tests reveal an actual session path where missing feature data can bypass the entitlement, resolve that narrowly in the issuance path rather than broadening this feature into a global auth-gate refactor.
- The UI preview lookup and the authoritative issuance lookup are separate remote reads. The feature permits the former for the invoice form but must not make its client response authoritative for issuing a voucher.
- The reported runtime's exact error is unknown without its visible alert text or corresponding server/ARCA diagnostics. Source inspection does not support attributing the failure to a USER role denial: the current action/helper already allow `USER + invoice`. Likely failure areas are the preview's ARCA/configuration preconditions or upstream lookup response; the separate code-level gaps are missing persisted entitlement enforcement and unhandled/reported-failure UI paths. A sanitized UI error and relevant server log are needed to name the exact production cause, but are not blockers to specifying or implementing the measurable preview behavior above.
