# Factura A receipt client tax data

## Status

Proposed. This document specifies the fix only; implementation and tests are intentionally out of scope for this task.

## Problem statement

When an existing sale is billed as **Factura A**, `BillingModal` collects the client's IVA condition and DNI/CUIT and sends the values to the AFIP voucher action. The voucher can be authorized, but the subsequently persisted/printed sale does not reliably carry the complete client tax identity to the receipt PDF.

The current flow has several integrity gaps:

- `BillingModal` builds a temporary `BillState`, but does not consistently pass the client document type and client-specific fields through the post-CAE persistence contract.
- `updateOrderCaeAction` persists `Order.clientIvaCondition` and `Order.clientDocumentNumber`, but has no persisted document-type field.
- Historical mapping in `src/actions/sales/history.ts` assigns `typeDocument` from the IVA condition, so a receipt can label a CUIT/DNI incorrectly.
- `buildPDFHTML` and the thermal HTML/ESC-POS renderers already have client-data slots, but depend on the upstream state being complete and use inconsistent condition normalization.

The fix must make the authorized voucher's client tax data a durable receipt snapshot and keep the PDF and thermal representations consistent.

## Goals

1. Persist the client IVA condition, document type, and identifier selected during Factura A authorization.
2. Carry the same values through new-sale and historical-sale flows into every receipt renderer.
3. Show the values in the generated receipt PDF, including the receipt's thermal layout/fallback path.
4. Preserve existing receipts and non-fiscal documents without changing their current behavior.
5. Avoid exposing missing, stale, or unrelated business tax data as client data.

## Non-goals

- Changing AFIP/ARCA voucher calculation or validation rules.
- Changing the business's own CUIT or IVA condition display.
- Adding client master-data editing or automatically updating `Client` records from a voucher.
- Reworking the PDF layout, page size, QR generation, or payment calculations.
- Backfilling historical orders with values that were never stored.

## Existing architecture and data flow

### New sale

`BillParametersForm` writes `clientCondition`, `clientDocumentType`, and `documentNumber` into `BillState`; `afip.ts` forwards the tax fields to the external AFIP service; `BillButtons.tsx` calls `processSaleAction`; `Order` already stores `clientIvaCondition`, `clientDocumentNumber`, and `CAE`.

### Existing-sale billing

`BillingModal` creates the AFIP request, then calls `updateOrderCaeAction`. That action is the authoritative persistence point for the selected values after CAE authorization. The action must remain authenticated and business-scoped, as required for a Next.js Server Function.

### Printing

`getSalesAction`/`getSaleByIdAction` map Prisma `Order` records to `BillState`. `PrintOptionsPopover` and `PrintableTable` create `ThermalReceiptData`, then call either:

- `buildPDFHTML` + `exportToPDF` for the generated PDF, or
- `printThermalReceipt`, which supports ESC/POS and a thermal HTML fallback.

No database schema change is required for the IVA condition or identifier; a new optional persisted document-type field is recommended because the current schema cannot distinguish CUIT from DNI.

## Functional requirements

### FR-1: Canonical client tax identity

Define one shared, strictly typed receipt-facing shape (or equivalent existing model extension) containing:

```ts
interface ReceiptClientTaxData {
  name?: string | null;
  ivaCondition?: string | null;
  documentType?: "CUIT" | "DNI" | null;
  documentNumber?: string | null;
}
```

The receipt input must use the normalized string identifier, not a numeric value. Leading zeroes must be preserved and no JavaScript number conversion may occur in the print pipeline.

### FR-2: Persist authorization-time values

Extend the order billing snapshot with an optional `clientDocumentType String?` field. The field is nullable for backward compatibility.

`updateOrderCaeAction` must accept and persist, atomically with the CAE update:

- `CAE`
- `clientIvaCondition`
- `clientDocumentType`
- `clientDocumentNumber`
- the selected payment method

The action must validate the document type as `CUIT` or `DNI` when present, normalize blank values to `null`, keep the existing business authorization check, and return a typed success/error result. It must not overwrite a valid identifier with an empty value when the selected IVA condition requires a document.

### FR-3: Preserve the data in both billing entry paths

- `BillingModal` must pass the selected `documentType` and the exact entered `documentNumber` to both the AFIP request state and the post-CAE update action.
- The new-sale path must pass `clientDocumentType` through `processSaleAction` and persist it on `Order` when supplied.
- `BillParametersForm` must keep `clientDocumentType` and the string form of `documentNumber` synchronized with `BillState`; numeric fields may remain where required by existing AFIP contracts, but persistence/printing must use the string.
- Do not infer the document type from the IVA condition. IVA condition and document type are independent fields.

### FR-4: Correct historical mapping

`mapOrderToBillState` must map:

- `Order.clientIvaCondition` → `IVACondition` and `clientIvaCondition`
- `Order.clientDocumentType` → `typeDocument`
- `Order.clientDocumentNumber` → `clientDocumentNumber` and, only where legacy code requires it, `documentNumber`

For old rows with no `clientDocumentType`, use a documented compatibility fallback: `CUIT` for an 11-digit stored identifier, otherwise `DNI` when an identifier exists. If no identifier exists, leave the type empty rather than inventing a value.

### FR-5: PDF client section

For an official invoice, including Factura A, the generated PDF must render a `Datos del Cliente` section containing:

- client name when available;
- `Cond. IVA` with the normalized human-readable condition when available;
- the document label (`CUIT` or `DNI`) and exact identifier when both are available.

The section must render condition and identifier independently: a condition must not disappear merely because the document type is absent, and an identifier must not be silently dropped because the condition uses a variant such as `consumidor_final`.

For `Consumidor Final`, preserve the existing compact behavior unless a non-empty identifier was explicitly stored. Never print `undefined`, `null`, `NaN`, or an empty label/value pair.

All user-controlled values must remain HTML-escaped. Existing business CUIT and business IVA rows must remain clearly separate from client rows.

### FR-6: Thermal parity

The same normalized client values must be rendered by:

- `generateThermalReceipt` (ESC/POS text), and
- `buildThermalPrintHTML` (browser thermal fallback).

The order should be stable and readable: client name, document type/number, then `Cond. IVA`. Thermal output must sanitize text and must not contain HTML markup or unescaped user input.

### FR-7: Print-source consistency

`PrintableTable` and `PrintOptionsPopover` must construct the same receipt-facing client data from the current/historical `BillState`. A receipt printed immediately after authorization and the same sale printed later from history must show identical client IVA/document values.

The implementation should centralize normalization/formatting rather than adding separate condition checks to each renderer.

## Interfaces and data contracts

### Prisma model change

```prisma
model Order {
  // existing fields
  clientIvaCondition   String?
  clientDocumentType   String? // "CUIT" | "DNI"; nullable for legacy rows
  clientDocumentNumber String?
  CAE                  Json?
}
```

Add a backward-compatible Prisma migration and regenerate the client. Do not make the new column required.

### Billing update input

Recommended shape (preserving existing names only where compatibility requires them):

```ts
interface UpdateCaeInput {
  CAE: CaeSnapshot;
  IVACondition: string;
  documentType?: "CUIT" | "DNI" | "";
  documentNumber?: string | number;
  paidMethod: string;
  billType?: string;
}
```

The action should normalize `documentNumber` once at the boundary and persist the resulting string. Existing callers that omit `documentType` must continue to work.

### BillState compatibility

Extend `BillState` with:

```ts
clientDocumentType?: "CUIT" | "DNI";
```

Keep `typeDocument` and `documentNumber` during the transition for callers that still use them, but define `clientDocumentType`/`clientDocumentNumber` as the canonical receipt fields.

### Receipt input

Prefer replacing duplicated anonymous client fields in `ThermalReceiptData` and `buildPDFHTML` with a shared `client?: ReceiptClientTaxData` object. If a broad refactor is not appropriate, add a shared adapter that produces the existing fields and is used by both print entry points.

## Recommended file structure and responsibilities

```text
prisma/
└── schema.prisma                         # Add nullable Order.clientDocumentType

src/
├── actions/
│   ├── afip.ts                            # Preserve validated client fields for AFIP
│   ├── sales/process.ts                   # Accept/persist new-sale document type
│   ├── sales/update.ts                    # Persist post-CAE client snapshot
│   └── sales/history.ts                   # Map persisted snapshot, with legacy fallback
├── components/Billing/
│   ├── BillingModal.tsx                   # Pass condition/type/identifier together
│   ├── BillParametersForm.tsx             # Maintain canonical BillState fields
│   ├── PrintableTable.tsx                 # Use shared receipt adapter
│   └── PrintOptionsPopover.tsx            # Use shared receipt adapter
├── lib/print/
│   ├── receipt-data.ts                    # Shared types and normalization adapter
│   ├── pdf-templates.ts                   # Render normalized client section
│   └── BrowserPrint.ts                    # Render equivalent thermal client section
├── models/BillState.ts                    # Add optional clientDocumentType
└── schemas/index.ts                       # Validate document type/identifier boundary
```

Migration directory name should describe the change, for example `add_order_client_document_type`.

## Acceptance criteria

- **AC-01 Persistence:** After authorizing a Factura A from `BillingModal` with `Responsable Inscripto`, `CUIT`, and `20123456789`, one authenticated `Order` row contains the CAE, `clientIvaCondition = "Responsable Inscripto"`, `clientDocumentType = "CUIT"`, and `clientDocumentNumber = "20123456789"`.
- **AC-02 DNI support:** The same flow with `DNI` persists `clientDocumentType = "DNI"` and the exact entered DNI; no CUIT inference changes it.
- **AC-03 String fidelity:** An identifier entered with leading zeroes remains byte-for-byte identical in the persisted string and generated receipt input; no print path converts it to a number.
- **AC-04 New-sale parity:** A Factura A created through the new-sale flow stores and later reloads the same three client tax fields.
- **AC-05 Historical mapping:** Reloading an authorized order maps its stored condition, type, and identifier into `BillState` without assigning the IVA condition to `typeDocument`.
- **AC-06 PDF output:** For an authorized Factura A, `buildPDFHTML` output contains the client name (when supplied), the normalized IVA condition, the exact document label, and the exact identifier in the client section; it also contains the separate business CUIT without confusing the two.
- **AC-07 Thermal output:** Both ESC/POS text and thermal HTML fallback contain the same client condition, document label, and identifier as the PDF, in a stable order.
- **AC-08 Missing-data safety:** For absent optional fields, output contains no `undefined`, `null`, `NaN`, empty document label, or empty identifier row, and existing Consumidor Final receipts remain valid.
- **AC-09 Security:** All server mutations authenticate the user, constrain the order by the authenticated business, validate the document type, and do not accept a client tax snapshot for an order belonging to another business.
- **AC-10 Backward compatibility:** Existing orders without `clientDocumentType` remain printable; an 11-digit legacy identifier displays as CUIT, another non-empty legacy identifier displays as DNI, and orders without an identifier display no invented document type.
- **AC-11 Renderer consistency:** Printing immediately after authorization and printing the same order from sales history produce equivalent client tax content for PDF and thermal modes.
- **AC-12 Regression:** Existing CAE, QR, invoice number, totals, payment, business tax data, remito, presupuesto, and non-Factura-A output remain unchanged except for the newly available client tax rows.

## Implementation notes and decisions

- No new dependency is required.
- Use the existing Zod validation conventions and Prisma singleton. Use a transaction only if the implementation performs more than one dependent database mutation; the CAE/client snapshot update itself should be one scoped update.
- Keep the `Order` snapshot authoritative for historical receipts. Do not re-read mutable `Client` master data when printing an already-issued voucher.
- Follow Next.js Server Function guidance: authenticate and authorize inside the server action, validate all client-provided arguments, and return only the fields required by the caller.
- The migration is additive and nullable, so existing records and deployments remain compatible while new Factura A receipts gain an explicit document type.
