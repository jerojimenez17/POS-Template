# Nota de Crédito desde el detalle de una venta

## Estado y alcance

Propuesta de arquitectura. Esta tarea solo define la implementación; no incluye código, migraciones aplicadas ni tests implementados.

El alcance está limitado a `D:\Documents\Jero\POS-Template\pos-template`. No se debe modificar `stock-ia-function`: se consumirá el contrato existente de `createVoucher`. Solo se coordinaría un cambio externo si una prueba de integración demuestra que el contrato documentado no acepta el payload especificado aquí.

## Problema

La aplicación puede emitir facturas, pero no puede emitir una Nota de Crédito desde `/sales/[id]`. Además:

- `Order` no persiste de forma confiable el `billType` original.
- `nroAsociado` existe en `BillState`, pero no está respaldado por metadatos persistidos del comprobante original.
- La validación local de AFIP solo acepta 1/6/11 (Factura A/B/C).
- El detalle de la venta no ofrece una acción de devolución fiscal.
- `SaleReturn` registra devoluciones operativas, pero no su estado fiscal, CAE, comprobante asociado ni idempotencia.

Una Nota de Crédito debe anular/revertir el comprobante original completo: restaurar todas sus unidades al stock y devolver el importe total en efectivo. No se permiten devoluciones parciales en esta primera versión.

## Decisiones de negocio

1. Solo se puede generar una Nota de Crédito para una venta fiscal autorizada con CAE válido y tipo Factura A, B o C.
2. La Nota de Crédito siempre es una reversión completa: todos los `OrderItem` activos, el total final cobrado y la identidad fiscal del comprador se toman del snapshot de la venta.
3. La Nota de Crédito se asocia al comprobante original mediante `CbtesAsoc`; el CAE original se conserva literalmente y nunca se reemplaza por el CAE de la Nota de Crédito.
4. Una venta con una Nota de Crédito autorizada no puede volver a devolverse. Una operación pendiente puede reintentarse de forma idempotente, pero nunca crear un segundo voucher autorizado.
5. La devolución monetaria se registra como salida de caja en efectivo, aun cuando la venta original haya usado uno o dos medios. La UI debe mostrar explícitamente esta decisión antes de confirmar.
6. Stock y caja solo se revierten después de recibir un CAE válido. Un rechazo/error de AFIP no modifica inventario, caja ni el estado contable de la venta.
7. Las ventas sin `billType` histórico son elegibles únicamente si el sistema puede determinar inequívocamente A/B/C desde el snapshot compatible existente; de lo contrario, la acción se bloquea con un mensaje de reparación de datos. Nunca se debe asumir Factura C silenciosamente para emitir una Nota de Crédito.

## Contrato AFIP/stock-ia-function

El adapter POS debe conservar el contrato `createVoucher` actual (`action`, credenciales ARCA, `arca`, `billState`) y enviar una `billState` mínima sin CAE ni credenciales.

Para una Nota de Crédito, `billState` debe incluir:

```ts
interface CreditNoteVoucherState {
  billType: "Factura A" | "Factura B" | "Factura C";
  nroAsociado: number;
  ptoVentaAsociado: number;
  caeAsociado: string;
  products: Array<{
    id: string;
    code: string;
    description: string;
    price: number;
    salePrice: number;
    amount: number;
  }>;
  total: number;
  totalWithDiscount: number;
  IVACondition: string;
  clientDocumentType?: "CUIT" | "DNI";
  clientDocumentNumber?: string;
}
```

El adapter debe convertir el tipo original a tipo AFIP de Nota de Crédito solo en este flujo:

| Comprobante original | Tipo AFIP NC |
| --- | ---: |
| Factura A | 3 |
| Factura B | 8 |
| Factura C | 13 |

El payload debe incluir `CbtesAsoc` con, como mínimo, `Tipo` (1/6/11 del comprobante original), `PtoVta`, `Nro` y `CbteFch` cuando el contrato lo requiera. `Nro` debe ser el número fiscal original, no el ID de Prisma ni el número de la Nota de Crédito. La implementación debe usar el comportamiento ya analizado del function: `billState.nroAsociado` activa la conversión y la inclusión de `CbtesAsoc`.

El POS debe ampliar sus tipos y validaciones locales para aceptar 3/8/13 en el request de Nota de Crédito, sin permitirlos en el flujo de factura normal. El preflight `getVoucherNumberAction` debe usar el tipo 3/8/13 correspondiente, y el parser de respuesta debe conservar CAE, vencimiento, número y punto de venta de la Nota de Crédito.

## Modelo de datos

### Snapshot persistente del comprobante original

Agregar a `Order` campos aditivos y nullable:

```prisma
billType             String? // "Factura A" | "Factura B" | "Factura C" | legacy nullable
afipVoucherType      Int?    // 1, 6 o 11
invoiceNumber        Int?    // nroCbte autorizado
invoicePointOfSale   Int?    // ptoVenta autorizado
invoiceIssuedAt      DateTime?
```

`Order.CAE` sigue siendo el snapshot original completo. Los campos normalizados permiten asociar el comprobante sin interpretar JSON histórico. La persistencia debe ocurrir tanto en el alta (`processSaleAction`) como en `updateOrderCaeAction`, en la misma actualización que CAE; no se debe inferir `billType` al imprimir.

### Metadatos separados de devolución/Nota de Crédito

Extender `SaleReturn` para que sea el registro de negocio idempotente de la reversión:

```prisma
enum SaleReturnStatus {
  PENDING
  AUTHORIZED
  REJECTED
}

enum SaleReturnKind {
  CREDIT_NOTE
}

model SaleReturn {
  // campos existentes
  kind                 SaleReturnKind   @default(CREDIT_NOTE)
  status               SaleReturnStatus @default(PENDING)
  idempotencyKey       String
  authorizedAt         DateTime?
  requestedById        String?
  creditNoteBillType   String? // "Nota de Crédito A/B/C"
  creditNoteAfipType   Int?    // 3, 8 o 13
  creditNoteCAE        String?
  creditNoteNumber     Int?
  creditNotePointOfSale Int?
  originalCAE          String?
  originalVoucherType  Int?
  originalNumber       Int?
  originalPointOfSale  Int?
  refundMethod         String? // "Efectivo"

  @@unique([orderId, kind])
  @@unique([businessId, idempotencyKey])
}
```

Add `requestedById` relation to `User` if the project convention requires it. Add `orderId` to the refund `CashMovement` so the audit trail identifies the reversal. Add `orderId` to return-created `StockMovement` (or use the existing nullable relation) and include the return ID in `reason`.

`SaleReturnItem` remains the immutable quantity/amount snapshot. For a full reversal, it must contain one row per original item, including deleted products where possible; a missing product must cause a safe failure before authorization, not a silently partial refund.

The unique `(orderId, kind)` constraint is the database backstop against duplicate full returns. The action must also lock/re-read the order and existing return within a transaction before any finalization.

### BillState and return-facing interfaces

Extend `BillState` without breaking legacy consumers:

```ts
interface OriginalVoucherMetadata {
  billType: "Factura A" | "Factura B" | "Factura C";
  afipVoucherType: 1 | 6 | 11;
  cae: string;
  number: number;
  pointOfSale: number;
  issuedAt?: Date;
}

interface CreditNoteMetadata {
  status: "PENDING" | "AUTHORIZED" | "REJECTED";
  billType?: "Nota de Crédito A" | "Nota de Crédito B" | "Nota de Crédito C";
  afipVoucherType?: 3 | 8 | 13;
  cae?: string;
  number?: number;
  pointOfSale?: number;
  originalCae: string;
  originalNumber: number;
  originalPointOfSale: number;
}
```

Recommended optional fields are `originalVoucher` and `creditNote` on `BillState`; retain `CAE` as the original voucher field for compatibility. Historical mapping must populate `billType` from the persisted field and expose the credit-note metadata separately.

## Server actions and transaction protocol

Create a dedicated action, preferably `createCreditNoteAction`, rather than overloading `processReturnAction`. It must:

1. Validate a strict Zod input containing only `orderId`, a client-generated idempotency key, and an explicit confirmation token/boolean. No client-supplied prices, quantities, CAE, bill type, business ID, or cash amount are trusted.
2. Authenticate with `auth()`, require a business ID, and optionally require the same billing feature gate used by `createAfipVoucherAction`.
3. Load the order by `{ id: orderId, businessId }`, including items, original CAE, original fiscal metadata and existing returns. Reject non-fiscal, missing/invalid CAE, missing number/point of sale, unsupported type, already authorized return, incomplete product snapshot, or non-positive total.
4. Return the existing pending/authorized result for the same idempotency key. Reject a different key when an authorized return already exists.
5. Create/reuse a `PENDING` `SaleReturn` snapshot before calling AFIP. The snapshot must freeze original CAE, A/B/C type, AFIP type, number, point of sale, total, reason, items and `refundMethod = "Efectivo"`.
6. Call the shared server-side voucher service with the persisted snapshot, not with arbitrary UI data. Do not expose encrypted certificates, internal keys, or raw upstream errors to the browser.
7. On valid CAE, execute one database transaction that conditionally changes `PENDING` to `AUTHORIZED`, stores only the Note de Crédito response fields, creates all `SaleReturnItem` rows if not already present, increments stock for every item, creates `RETURN` movements, decrements the active cashbox by the full refund, and creates one negative `CashMovement` linked to the return/order. If the conditional update affects zero rows, another request won and no side effects may run twice.
8. On AFIP rejection, mark the pending record `REJECTED` with a sanitized error/audit message and leave stock/cash untouched. A retry must use a new idempotency key only after the rejected attempt is explicitly allowed by policy; the same key must remain replay-safe.
9. Revalidate stock, cashbox, orders and sales tags and publish the existing business-scoped Pusher events after commit. Background notifications must not determine financial success.

Because an external AFIP call cannot participate in a PostgreSQL transaction, the pending-record/finalization protocol is mandatory. Never hold a DB transaction open while calling AFIP and never mutate stock before authorization.

The existing generic `processReturnAction` must either be restricted to non-fiscal/manual returns with an explicit policy, or delegate through the same duplicate/quantity safeguards. It must not allow a second full return around the new unique constraint.

## UI from `/sales/[id]/`

The Server Component page should load the sale and its return eligibility/status. Add a client component, recommended name `CreditNoteButton` or `CreditNoteDialog`, near the existing edit action.

Required behavior:

- Render only for an eligible Factura A/B/C with valid persisted original metadata; show disabled explanatory text for legacy/non-fiscal sales.
- Show original invoice type, point of sale/number, CAE (masked only if the product convention requires it), total, all items and the exact stock/cash effects.
- Require an explicit confirmation: “Emitir Nota de Crédito completa, restaurar stock y devolver $X en efectivo”.
- Disable controls during submission, preserve the idempotency key across retries, and prevent double clicks/parallel requests.
- Display pending, authorized and rejected outcomes. On success show the new NC type/number/CAE and refresh the page/history. Never show the new CAE as if it were the original CAE.
- Do not expose credentials or let the browser choose AFIP types, amounts, item quantities, original CAE or business scope.

The page should retain its existing edit action and responsive layout. The action must be accessible by keyboard, have a destructive confirmation affordance, and provide a non-color-only status indication.

## Exact file recommendations

### Required changes

```text
prisma/schema.prisma
prisma/migrations/<timestamp>_add_credit_note_metadata/migration.sql

src/models/BillState.ts
src/models/CreditNote.ts                         # shared input/result/metadata interfaces
src/models/billType.ts                            # explicit original and NC type helpers
src/schemas/index.ts                              # strict credit-note input and metadata schemas

src/actions/afip.ts                               # NC type mapping, preflight, CbtesAsoc-safe payload
src/actions/sales/process.ts                      # persist original billType/AFIP number metadata
src/actions/sales/update.ts                       # persist billType/number/point-of-sale with CAE
src/actions/sales/credit-note.ts                  # authenticated idempotent action
src/actions/sales/history.ts                      # map original and separate return metadata

src/services/afip/credit-note.ts                  # pure A/B/C -> 3/8/13 and association builder
src/services/afip/point-sale-validation.ts        # allow 3/8/13 only for NC requests
src/services/afip/voucher-response.ts             # typed response reuse; no original CAE overwrite

src/app/(protected)/sales/[id]/page.tsx            # eligibility/status and action placement
src/components/Billing/CreditNoteButton.tsx       # client confirmation/submission UI
src/components/Billing/CreditNoteDialog.tsx       # optional if separated from button
```

### Recommended test files (to be added by QA/developer, not by this task)

```text
ai/features/nota-de-credito/credit-note-contract.test.ts
ai/features/nota-de-credito/credit-note-action.test.ts
ai/features/nota-de-credito/credit-note-mapping.test.ts
ai/features/nota-de-credito/credit-note-ui.test.tsx
ai/features/nota-de-credito/credit-note-history.test.ts
```

No new dependency is required. Use the existing Prisma singleton, Zod, Auth.js, action-result conventions, `bulkUpdateStock`, cache tags and Pusher integration.

## Acceptance criteria

- **AC-01 Original snapshot:** A new authorized Factura A/B/C stores `billType`, original AFIP type (1/6/11), fiscal number, point of sale and CAE in the `Order`; updating CAE later cannot erase these values.
- **AC-02 Eligibility:** The detail page enables the action only for an authenticated business-scoped, authorized A/B/C sale with complete original metadata; legacy ambiguity is blocked with an actionable message.
- **AC-03 Mapping:** A/B/C map exactly to NC AFIP 3/8/13. Invoice flows still reject 3/8/13.
- **AC-04 Association:** The outbound `createVoucher` payload contains `nroAsociado` and `CbtesAsoc` with the original type, point of sale and number; it contains the original CAE only as association/audit data and never as the new voucher CAE.
- **AC-05 CAE preservation:** After authorization, `Order.CAE` and `originalCAE` remain byte-for-byte equal to the original CAE, while `SaleReturn.creditNoteCAE` contains the new CAE.
- **AC-06 Full quantity reversal:** Authorization creates one return item for every original item and restores exactly the original quantities, including decimal quantities; no partial or silently omitted item is possible.
- **AC-07 Full cash refund:** Authorization decrements the active cashbox by exactly `Order.total`, creates exactly one linked negative cash movement with method `Efectivo`, and stores the same total on `SaleReturn`.
- **AC-08 Atomic finalization:** If any stock, cash, item, or metadata write fails, the transaction rolls back all of those writes and the pending record remains retryable; AFIP success is never reported as local financial success without finalization.
- **AC-09 Duplicate protection:** Two concurrent requests for one order result in at most one authorized `SaleReturn`, one AFIP authorization attempt per idempotency key, one stock restoration, and one cash refund. A second key is rejected after authorization.
- **AC-10 Failure safety:** AFIP rejection, missing CAE, invalid original metadata, missing product, closed cash session, unauthorized user, and cross-business order produce no stock/cash mutation and no leaked credentials.
- **AC-11 Retry safety:** Repeating a pending request returns its existing state; repeating an authorized request returns the same NC metadata without issuing another voucher.
- **AC-12 UI:** From `/sales/[id]/`, a user can review and explicitly confirm the complete reversal, sees loading/error/success states, and sees original and new CAE/number in distinct fields.
- **AC-13 Historical parity:** Reloading the sale after authorization shows original invoice metadata and separate NC/return metadata; printing or auditing the original still uses the original CAE.
- **AC-14 Reporting:** Existing daily/cashbox reports include the refund once, linked to the session/order, while the sale is not counted as a second sale and stock activity shows one return per item.
- **AC-15 Security:** Every server action validates input and authorization internally, scopes every read/write by authenticated `businessId`, ignores client-supplied financial metadata, and returns sanitized user-facing errors.
- **AC-16 Regression:** Normal Factura A/B/C creation, existing manual returns where still supported, editing, printing, QR data, client tax data, and non-fiscal documents retain current behavior.

## Test scenarios

### Pure contract/mapping tests

1. Map Factura A/B/C to 3/8/13 and reject Remito, Presupuesto and unknown types.
2. Assert `CbtesAsoc` uses original AFIP type, point of sale and number, and `nroAsociado` is numeric.
3. Assert minimal payload excludes internal key, certificate, private key, original `CAE` as a replacement field, and arbitrary client financial values.
4. Parse a valid NC response and retain its CAE/number/point of sale independently from original metadata.

### Server action tests

1. Unauthenticated and cross-business calls are rejected.
2. Missing CAE, unsupported/missing `billType`, missing fiscal number/point of sale, non-positive total, empty items and missing product are rejected without writes.
3. Successful A, B and C flows create the correct pending snapshot, call AFIP with the correct type, then atomically create item/movement/cash records and restore stock/refund total.
4. AFIP rejection marks the attempt rejected and leaves product amount, cashbox total, cash movements and stock movements unchanged.
5. Failure during stock/cash finalization rolls back every local side effect.
6. Concurrent duplicate requests exercise the unique constraint/conditional status update and prove one authorization and one refund.
7. Same idempotency key returns the existing pending/authorized result; a second key after authorization is rejected.
8. Closed cash session fails before AFIP is called, unless product policy explicitly supports a safe pending workflow.
9. Original CAE and original invoice metadata remain unchanged after success.

### UI/history tests

1. Eligible sale renders the action and confirmation text; ineligible legacy/non-fiscal/authorized-return sales do not offer a second action.
2. Double click submits once, preserves idempotency key, and displays sanitized rejection/success states.
3. Success distinguishes original invoice CAE from credit-note CAE and refreshes the detail page.
4. History mapping exposes separate original and credit-note metadata and does not overwrite `BillState.CAE`.
5. Existing sale detail, edit link, product totals and normal invoice rendering regressions remain green.

## Rollout and compatibility

Use an additive nullable migration first, deploy code that writes new metadata for new/updated sales, and keep old sales printable. Do not backfill an uncertain `billType` or fiscal number. Monitor rejected/pending `SaleReturn` rows and provide an admin reconciliation path before allowing manual cleanup; deletion of an authorized return must never be used to permit a second fiscal reversal.
