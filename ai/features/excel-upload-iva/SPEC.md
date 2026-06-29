# SPEC.md - Optional IVA Column in Excel Import

## Goal
Implement an optional column mapping "IVA" in the Excel bulk product import modal.
This column can contain a letter ("A") or a percentage directly ("21%", "10.5%", "0%").
- Letter "A" (case-insensitive) -> Add 21% IVA to the parsed product price. Do not apply the supplier's default IVA.
- Explicit percentage (e.g. "21%", "10.5%", "0%" or numbers like `21`, `10.5`, `0`) -> Add that percentage directly to the parsed product price. Do not apply the supplier's default IVA.
- Empty or invalid string -> Add 0% from Excel, but apply the supplier's default IVA instead.

## Acceptance Criteria
1. **Column Mapping UI**: The upload modal UI should feature an optional "IVA" column input field.
2. **Auto-detection**: The system should automatically match Excel columns named "iva", "alícuota", "alicuota", "tasa" to this field.
3. **IVA Value Parsing**:
   - "A" or "a" must parse to `21%` IVA.
   - Values like "21%", "10.5%", "0%", or numeric values like 21, 10.5, 0 must parse to the respective numeric percentage.
   - Empty values or non-matching inputs must parse to `null` (no Excel-specific IVA).
4. **IVA Application Logic**:
   - If Excel-specific IVA is parsed (is not `null`), apply it to the product cost price calculation:
     `costPrice = originalPrice * (1 - discount/100) * (1 + excelIva/100)`
   - If Excel-specific IVA is not parsed (is `null`), apply the selected supplier's general IVA setting (or 0% if no supplier/general IVA is defined):
     `costPrice = originalPrice * (1 - discount/100) * (1 + supplierIva/100)`
5. **Client-Side Preview**: The client-side table rendering in the upload modal must calculate and display preview prices exactly matching this logic.
6. **Server Actions Compatibility**: The server actions `previewProductsBulk` and `processBulkProductBatch` must parse and handle this field per-row.

## Recommendations
- Create a shared utility function `parseExcelIva(ivaVal)` in `src/utils/iva-parser.ts` to ensure consistency between client and server.
- Add `iva?: string` to `BulkProductInput`.
