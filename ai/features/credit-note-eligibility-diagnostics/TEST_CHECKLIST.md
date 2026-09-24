# Credit-note eligibility diagnostics — QA checklist

- [ ] Normalization returns discriminated `NON_FISCAL`, `INVALID_OR_INCOMPLETE`, or `VALID` results.
- [ ] Null, empty, and trimmed placeholders are silent non-fiscal values.
- [ ] CAE accepts exactly 14 ASCII digits, preserving string zeros; numeric CAE is accepted only when safe and representable.
- [ ] Historical JSON object/string and documented aliases for CAE, number, point of sale, and fiscal type are supported.
- [ ] Numeric/string number aliases accept only positive integers; decimal, sign, exponent, zero, negative, unsafe, and free text values fail.
- [ ] Missing number/POS, unsupported type, and visible-vs-historical type conflicts receive stable reason codes.
- [ ] Alphanumeric CAE, QR, URL, payload, and test placeholders never become eligible.
- [ ] Mapper omits fabricated empty `fiscalContext`, emits only serializable `fiscalDiagnostic`, and computes the fiscal result once.
- [ ] Non-fiscal sales have no diagnostic, no notice, and no console noise.
- [ ] Fixed safe notice copy is visible for every non-actionable reason, with no retry/action button or sensitive interpolation.
- [ ] Eligible sales retain `CreditNoteButton`; pending and authorized returns preserve their distinct states.
- [ ] Valid sales with authorized returns or incomplete products are diagnosed as non-actionable.
- [ ] Server action re-reads and revalidates tenant-scoped fiscal data, returning `NOT_ELIGIBLE` before AFIP for invalid data.
- [ ] Browser payload/eligibility cannot bypass action-side validation.
- [ ] Diagnostic logs are server-side and allowlisted only; no complete/partial CAE, QR, JSON, URL, token, key, secret, credential, cookie, or header appears.
- [ ] No schema migration or dependency is introduced; existing printing/history/manual-return behavior remains intact.

## Targeted red run

Command: `npm run test -- ai/features/credit-note-eligibility-diagnostics`

Expected TDD state: failing until the production implementation adds the diagnostic normalization contract, mapper DTO, notice, and safe logging behavior.
