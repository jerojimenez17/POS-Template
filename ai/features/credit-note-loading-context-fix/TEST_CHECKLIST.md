# Test checklist — credit note loading/context fix

## Fiscal DTO and historical data

- [ ] Normalize `Factura A`, `Factura B`, and `Factura C` to original AFIP types `1`, `6`, and `11`.
- [ ] Normalize credit-note AFIP types to `3`, `8`, and `13`.
- [ ] Prefer validated persisted fiscal columns, with a documented fallback to equivalent values in historical `Order.CAE` JSON.
- [ ] Reject empty, `undefined`, malformed, non-positive, fractional, or inconsistent CAE/number/point/type values.
- [ ] Produce a serializable DTO containing only the canonical fiscal fields and product summary; do not expose the complete CAE payload or credentials.
- [ ] Mark manual, non-fiscal, incomplete, and already-authorized sales as ineligible.

## Client visibility and interaction

- [ ] Show the credit-note control for an eligible A/B/C sale, including a historical sale reconstructed from CAE metadata.
- [ ] Hide the control for ineligible sales and authorized credit notes.
- [ ] Show an unambiguous pending state without offering a second emission.
- [ ] Allow a rejected credit note to be retried with a new interaction/idempotency key.
- [ ] Keep the review/confirmation flow accessible and unambiguous.
- [ ] Prevent two rapid activations from making concurrent action calls.
- [ ] Return loading to `false` after success, a resolved failure, a rejected action, a synchronous throw, and a serialization exception.
- [ ] Release the re-entry guard in every completion path and allow a later retry.
- [ ] Render controlled error text without leaking credentials, tokens, keys, or full AFIP payloads.

## Server action and request context

- [ ] Validate `orderId`, `confirmed: true`, and `idempotencyKey` before database or AFIP work.
- [ ] Resolve authentication at action entry and scope the order lookup to the authenticated business.
- [ ] Re-read and validate fiscal data server-side; browser-provided fiscal values cannot authorize a note.
- [ ] Return controlled results for unauthenticated access, tenant mismatch, missing fiscal data, closed cashbox, AFIP failure, invalid AFIP response, and conflicts.
- [ ] Return a stable authorized result for the same idempotency key without a second AFIP call or local reversal.
- [ ] Reject a different idempotency key after authorization and do not create another return.
- [ ] Keep pending requests from creating another pending return.
- [ ] Perform stock/cash reversal once, only after a new CAE is obtained.
- [ ] Call request-bound APIs only at the page/action boundary; no helper, deferred callback, or background path calls `auth`, `headers`, or `cookies`.
- [ ] Keep page-to-client props serializable.

## Regression gates

- [ ] Existing manual-return, sales-history, printing, and new-invoice behavior remains intact.
- [ ] `npm run lint`, `npx tsc --noEmit`, and the complete Vitest suite pass after production implementation.
