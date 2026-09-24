# Factura A receipt client data — QA checklist

- [ ] AC-01: Authenticated BillingModal/post-CAE persists CAE, IVA condition, CUIT type, and exact CUIT in one business-scoped update.
- [ ] AC-02: DNI remains DNI and is not inferred from IVA.
- [ ] AC-03: String identifiers, including leading zeroes, survive persistence, history mapping, PDF, ESC/POS, and browser thermal output.
- [ ] AC-04: New-sale `processSaleAction` accepts and persists `clientDocumentType` with the other client snapshot fields.
- [ ] AC-05: History maps persisted IVA, explicit type, and identifier independently; no IVA-to-document-type mapping.
- [ ] AC-06: Official PDF renders escaped client name, normalized IVA, document label/number, and separate business tax data.
- [ ] AC-07: ESC/POS and browser thermal HTML render the same client values in name → document → IVA order, with sanitized text.
- [x] AC-08: Missing values produce no undefined/null/NaN text or empty document rows; Consumidor Final remains compact.
- [x] Review gap: A non-Consumidor Final CAE update with a blank document is rejected before mutation and cannot retain stale client document identity.
- [x] Review gap: PDF and thermal renderers do not invent a DNI label when the document type is absent, including when an identifier is present.
- [ ] AC-09: Mutations authenticate, scope by business, validate CUIT/DNI, and cannot update another business's order.
- [x] AC-10: Legacy 11-digit identifiers fall back to CUIT; other non-empty identifiers to DNI; empty identifiers have no type.
- [ ] AC-11: Immediate and historical print sources produce equivalent client receipt data; direct PrintableTable/PrintOptionsPopover parity is covered where feasible.
- [ ] AC-12: Existing CAE, QR, invoice number, totals, payment, business tax, remito, presupuesto, and non-Factura-A behavior regressions remain covered.

## TDD execution

Run `npm run test -- ai/features/factura-a-receipt-client-data`. These tests are intentionally red against the current implementation: the persisted document-type field, canonical string mapping, shared receipt adapter, and thermal HTML client section are not implemented yet.
