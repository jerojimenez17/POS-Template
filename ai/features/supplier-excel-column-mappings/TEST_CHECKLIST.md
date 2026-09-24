# Supplier Excel Column Mappings — QA Checklist

This checklist follows `SPEC.md`. The automated test files are authored in the QA/TDD step; the implementation and regression runs remain pending until the feature is developed.

## Mapping contract and resolution

- [ ] Store exactly one mapping per supplier, with the supplier's business as its scope.
- [ ] Mapping vocabulary is exactly `code`, `description`, `price`, `amount`, `brand`, `category`, `subCategory`, `codebar`, `iva`.
- [ ] Normalize column letters by trimming and uppercasing; accept multi-letter Excel columns (for example `AA`).
- [ ] Reject missing/empty required columns and any malformed required or optional column values.
- [ ] Normalize blank optional columns to `null` in storage and render them as blank editable inputs.
- [ ] Validate persisted JSON before returning it to the client; malformed saved JSON is not exposed as a valid mapping.
- [ ] Saved mapping fills all nine fields, including empty optional fields, and is authoritative over conflicting recognizable headers.
- [ ] Header suggestions use the existing keyword set, include every detected optional field, require all three required fields, and remain editable.
- [ ] Header detection does not overwrite later user edits; the effective mapping shown in inputs is the mapping used to build `BulkProductInput[]`.
- [ ] When required header detection fails, preserve Code=A, Description=B, Price=C, blank optionals, configured start/end row behavior, and manual fallback parsing.
- [ ] Untouched fallback defaults after failed/partial detection are not persisted.
- [ ] Deliberately edited valid manual mappings and complete header-detected mappings are eligible for persistence.

## Preview and persistence lifecycle

- [ ] Persist only after a successful, non-empty `previewProductsBulk` result and only for the currently selected supplier.
- [ ] Do not save for absent supplier, no parsed products, failed/error preview, thrown parsing/preview error, or invalid required mapping.
- [ ] A failed mapping save is reported non-blockingly and leaves the successful preview available for review/confirmation.
- [ ] While the selected supplier's mapping request is pending, preview is blocked: do not parse/preview or save fallback or auto-detected columns. Once the saved mapping resolves, preview and persistence use only that saved mapping.
- [ ] Reject malformed optional column letters (for example Brand=A1) before workbook parsing or `previewProductsBulk`; show a user-facing validation message and do not save.
- [ ] Supplier A → B, supplier deselection, and supplier creation reset or load the correct mapping and cannot leak another supplier's mapping.
- [ ] A delayed response for an earlier supplier selection cannot overwrite a later selection or be saved to the wrong supplier.
- [ ] File changes do not reuse stale detected/mapping provenance or stale mapping state.

## Server action security and storage

- [ ] Read and write actions require an authenticated session with an active `businessId` derived from `auth()`.
- [ ] Mapping reads constrain the supplier lookup by both supplier ID and authenticated business ID and select only the mapping field.
- [ ] Writes verify ownership first and update with a supplier-ID + business-ID predicate; no write occurs for nonexistent or foreign suppliers.
- [ ] Server-side validation rejects malformed input even if client-side validation is bypassed.
- [ ] Saving mapping updates only `excelColumnMapping`; supplier `discount`, `iva`, `gain`, and all other values remain unchanged.
- [ ] Unauthorized/foreign-supplier results follow the stock actions' user-facing error conventions without disclosing foreign mapping data.

## Regression and migration

- [ ] Supplier discount, IVA, and gain prefills and user adjustments remain unchanged.
- [ ] Excel IVA parsing and effective price calculation (row IVA overrides supplier IVA; blank row IVA uses supplier IVA) remain unchanged.
- [ ] Import batching, product matching, metadata-only/update-only behavior, preview, and confirm-import behavior remain unchanged.
- [ ] Configured start/end row fallback remains unchanged when headers are not fully detected.
- [ ] Prisma schema adds only nullable JSONB mapping storage; existing suppliers remain unmapped without backfill or destructive changes.
- [ ] Migration is applied/verified using the normal development/deployment workflow; do not reset the database.
- [ ] Prisma client generation, test suite, lint, and typecheck pass after implementation.

## Automated coverage authored in this step

- `excel-upload-modal.test.tsx`: saved-map precedence, all editable fields, header prefill/edit override, fallback behavior, pending mapping-load preview blocking and saved-map retention, malformed optional-column validation before preview, persistence eligibility, failure/empty/invalid/no-supplier cases, save failure, stale supplier response, clearing selection, and supplier adjustment prefills.
- `stock-mapping-actions.test.ts`: authenticated business scoping, read/write payloads, nullable reads, malformed persisted/input JSON, malformed columns, unauthorized/foreign supplier denial, normalization, and mapping-only supplier updates.
- Existing `tests/excel-upload.test.ts`: regression checks for supplier discount/IVA/gain formula/persistence and Excel IVA parsing/price behavior.

## Known verification limitations at QA step

- Automated migration verification and live Prisma client/database migration validation are deployment-time checks, not run by these feature tests.
- Existing tests exercise stock IVA/pricing behavior, but exact preview-table adjusted-price rendering and every import-confirm mode remain regression checks for the full suite rather than new isolated mapping tests.
