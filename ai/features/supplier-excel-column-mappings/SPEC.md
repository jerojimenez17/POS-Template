# Supplier-Specific Excel Column Mappings

## Goal

Persist the effective stock-import field-to-column mapping per supplier, scoped to the active business. When a supplier is selected, its saved mapping is the source of truth over recognizable Excel headers. If no mapping exists, existing header detection should suggest editable column values; users may correct them before preview. Preserve the current fallback defaults and all unrelated supplier/import behavior.

## Scope and Existing Behavior

- The modal is `src/components/stock/excel-upload-modal.tsx` and imports stock actions through `@/actions/stock`. In this repository that alias resolves to **`src/actions/stock.ts`**, not the sibling `src/actions/stock/` directory. Put new action exports there unless an explicit re-export is added.
- The active fields are required `code`, `description`, `price`, and optional `amount`, `brand`, `category`, `subCategory`, `codebar`, and `iva`.
- Current defaults are Code=A, Description=B, Price=C, and blank optional fields. Current row defaults are start row 2 and no end row.
- Existing header keywords, current IVA behavior, preview/import behavior, supplier discount/IVA/gain settings, and product processing are not part of this change and must remain unchanged.
- The current parser can auto-detect columns while previewing and otherwise falls back to the configured/default column letters. The implementation must make the effective mapping visible/editable before relying on it so saved or detected values are what the user previews.

## Functional Requirements

1. Store one optional mapping for each supplier. A mapping is specific to the supplier and therefore inherits the supplier's business scope.
2. On supplier selection, load its mapping using a server-side action. If found, populate the modal fields from it and do not let recognizable headers replace it. The fields remain editable; explicit user edits take effect for that preview and can replace the stored mapping after a successful preview.
3. If no mapping is stored, use the existing header keyword detection to suggest/prefill editable fields when all three required fields (`code`, `description`, `price`) are detected. Include any optional fields detected by the existing keyword list. Header suggestions must not overwrite user edits.
4. If required headers are not all detected, retain the current A/B/C and blank optional fallbacks, and retain the existing manual/start-row fallback behavior. Partial detection must not silently create a persisted mapping from defaults.
5. Parse and apply a single active column mapping to the workbook consistently. The effective mapping used to construct `BulkProductInput[]` must be exactly the mapping shown in the editable fields (saved mapping first, otherwise detected/manual/fallback mapping). No automatic header match may supersede a saved mapping.
6. After `previewProductsBulk` returns a successful preview, persist the effective mapping for the selected supplier only if it is valid and not merely untouched fallback defaults after failed detection. Do not persist when there is no selected supplier, no products were parsed, preview returns an error, or required mapping fields are invalid.
7. A complete header-detected mapping is eligible to persist after successful preview. A mapping entered/changed manually is eligible when all required columns are valid. Track mapping provenance/dirty state sufficiently to distinguish those cases from untouched A/B/C fallbacks after failed detection. If persistence fails, keep the valid preview available and report a non-blocking save error; do not fail or roll back product preview.
8. Supplier selection/deselection, supplier creation, file changes, and asynchronous mapping loads must not leak a previous supplier's mapping into another supplier or apply a stale response to a newer selection. Existing discount/IVA/gain prefills and user adjustments must continue to work as they do now.
9. Both mapping reads and writes must derive `businessId` from `auth()`. A caller-supplied supplier ID must be verified as belonging to that business before reading/writing. A cross-business/nonexistent supplier must never be written; return the existing user-facing unauthorized/error style used by stock actions.
10. Do not change supplier discount/IVA/gain persistence or its formula. Do not change import batching, product matching, metadata-only/update-only modes, or confirm-import semantics.

## Mapping Contract

Use Excel column letters as stored/UI values, normalized by trimming and uppercasing. Empty optional inputs represent unmapped columns. Required values must be non-empty valid column letters. Keep the mapping vocabulary aligned across UI, Zod validation, server actions, persistence, and tests.

```ts
export interface SupplierExcelColumnMapping {
  code: string;
  description: string;
  price: string;
  amount: string | null;
  brand: string | null;
  category: string | null;
  subCategory: string | null;
  codebar: string | null;
  iva: string | null;
}
```

Optional strings may be normalized to `null` in storage and rendered as `""` in inputs. Validation must reject malformed letters and missing required values; server actions must not trust client-side validation. Avoid `any` and validate persisted JSON before returning it to the client.

## Data Model and Migration

Recommended minimal schema change: add nullable `excelColumnMapping Json? @db.JsonB` to `Supplier` in `prisma/schema.prisma`. The JSON value has the `SupplierExcelColumnMapping` shape above. Existing suppliers remain unmapped (`NULL`) and require no data backfill. Keeping the value on `Supplier` makes the supplier/business ownership relationship explicit and avoids a detached mapping table.

- Add the corresponding Prisma migration under `prisma/migrations/` (e.g. `add_supplier_excel_column_mapping`) to add nullable JSONB. Do not reset or destructively rewrite supplier data.
- Reads must query by both `{ id: supplierId, businessId: session.user.businessId }` and select only the mapping field.
- Before writing, verify supplier ownership in the active business; update using a predicate constrained by both supplier ID and business ID (Prisma's extended unique filter where supported), or an equivalent ownership-safe transaction. Never update `Supplier` by ID alone from this feature.
- Existing suppliers and deployments with no mapping retain current defaults. No new dependency is required.

## Server Interfaces (Recommended)

Implement these exports in `src/actions/stock.ts`, following its `"use server"`, `auth()`, `db`, error-return, and Zod-validation conventions:

```ts
getSupplierExcelColumnMapping(supplierId: string): Promise<{
  mapping?: SupplierExcelColumnMapping | null;
  error?: string;
}>;

saveSupplierExcelColumnMapping(
  supplierId: string,
  mapping: SupplierExcelColumnMapping,
): Promise<{ success?: boolean; error?: string }>;
```

The read returns `null` for an authorized supplier with no mapping. Unauthenticated requests and suppliers outside the caller's business must not disclose or modify mapping data. The save action validates/normalizes the complete mapping, checks supplier ownership, then writes only the mapping field; it must not alter discount, IVA, gain, or other supplier values.

## File Recommendations

- `prisma/schema.prisma`: nullable supplier mapping field.
- `prisma/migrations/<timestamp>_add_supplier_excel_column_mapping/migration.sql`: nullable JSONB column.
- `src/actions/stock.ts`: authenticated, validated, business-scoped mapping read/write actions. Do not put exports only in `src/actions/stock/` without a re-export because the modal's existing alias resolves to the file.
- `src/components/stock/excel-upload-modal.tsx`: resolve selected supplier mapping; reset/reload mapping state on supplier/file changes; fill editable fields from saved mapping or detection; use those fields as effective mapping; persist only after a successful preview and only when eligible.
- A small shared mapping type/schema module may be introduced if needed, but avoid duplicating client/server validation rules or introducing a dependency.

## Measurable Acceptance Criteria

1. Selecting a supplier with a saved mapping fills all nine corresponding inputs (including blank optional fields), and a workbook with conflicting recognizable headers is parsed using the saved values.
2. Editing one or more saved fields changes the mapping used for preview; after a successful preview, the edited valid mapping replaces the stored mapping.
3. Selecting a supplier without a mapping and loading a workbook whose first header row contains the existing required keywords prefills the required fields and every recognized optional field. Each field remains editable and an edit is the value used by preview.
4. When required headers cannot all be detected, the modal retains Code=A, Description=B, Price=C, blank optionals and current manual row fallback. A successful fallback preview with no deliberate mapping edit does not write those defaults to the supplier.
5. A valid manually configured mapping with no detectable headers is saved after successful preview. A failed preview, empty parse result, invalid required mapping, no supplier selection, or mapping-save failure does not prevent/masquerade as a successful persistence operation; save failure leaves the preview usable.
6. Selecting supplier B after supplier A never displays or saves A's mapping for B, including when A's mapping request resolves after B is selected. Clearing supplier selection clears supplier-specific mapping state.
7. An authenticated business can read/write mappings only for its own suppliers. An unauthenticated caller, nonexistent supplier, or foreign-business supplier cannot read a mapping or cause any supplier row to be modified.
8. Database migration adds only the nullable mapping storage; existing supplier records remain valid and have no mapping until saved.
9. Regression coverage confirms unchanged discount/IVA/gain supplier prefills, Excel IVA parsing/price preview, configured start/end row fallback, and import preview/confirm behavior.

## Testing Constraints and Suggested Coverage

- Add tests with the repository's configured Vitest setup (do not add a second test framework). Keep tests focused on mapping resolution/provenance, action ownership/validation, and modal interactions; mock workbook/database/auth boundaries using existing project conventions.
- Cover precedence (saved mapping > headers), no-saved-map detection and editable override, detection failure and fallback non-persistence, successful-save timing, stale supplier request handling, malformed mapping rejection, and cross-business write denial.
- Include a regression case that confirms mapping persistence does not change `discount`, `iva`, or `gain` fields on Supplier and does not change parsed IVA or effective price calculations.
- Validate schema/client generation and apply the migration in the project-standard development/deployment workflow. Do not use a destructive database reset for migration verification.
- Before implementing UI/server-action changes, follow the repository's Next.js documentation requirement by reading the relevant installed docs under `node_modules/next/dist/docs/`; no implementation is included in this specification task.

## Out of Scope

- Persisting row ranges, file templates, worksheet names, or supplier price adjustments as part of the column mapping.
- Changing header keyword definitions, the IVA parser, supplier pricing formulas, import/update rules, or the upload modal's overall workflow.
- Sharing mappings between businesses, suppliers, or users who do not share the same business.
