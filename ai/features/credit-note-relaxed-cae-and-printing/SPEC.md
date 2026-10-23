# CAE histórico flexible y visualización/impresión de Notas de Crédito

## Estado y alcance

- **Estado:** especificación arquitectónica. Esta entrega no implementa código ni tests.
- **Objetivo:** completar el flujo de Nota de Crédito para ventas históricas sin confundir el CAE original con el CAE nuevo de ARCA, permitir completar únicamente datos originales ausentes, registrar diagnósticos seguros y mostrar/imprimir la Nota de Crédito autorizada sin crear una segunda venta.
- **Fuera de alcance:** migraciones o backfill de datos inciertos, emisión parcial, modificación de credenciales ARCA, exposición de payloads fiscales, creación de una segunda `Order`, o reemplazo del comprobante original.

## Evidencia del estado actual

El repositorio contiene trabajo previo relacionado que debe conservarse y no sobrescribirse:

- `ai/features/credit-note-cae-eligibility/`, `credit-note-missing-data-modal/`, `credit-note-eligibility-diagnostics/`, `credit-note-loading-context-fix/` y `nota-de-credito/` ya documentan normalización, recuperación e idempotencia.
- `src/services/afip/credit-note.ts` actualmente exige `^\d{14}$` tanto al normalizar el CAE histórico como al validar la respuesta de Nota de Crédito. También ya contiene mapeos A/B/C → 3/8/13, `CbtesAsoc`, diagnóstico y recuperación.
- `src/actions/sales/credit-note.ts` reconsulta la venta por `id + businessId`, usa Zod estricto, crea/reutiliza `SaleReturn`, llama a ARCA y finaliza stock/caja en transacción. La respuesta nueva ya se valida estrictamente con 14 dígitos.
- `prisma/schema.prisma` ya tiene en `Order` la metadata original (`billType`, `afipVoucherType`, `invoiceNumber`, `invoicePointOfSale`, `invoiceIssuedAt`) y en `SaleReturn` el snapshot de la Nota de Crédito, su estado, CAE, número/punto y asociación original. No se requiere una entidad `Order` adicional.
- `src/actions/sales/history.ts` separa `BillState.CAE` del objeto `creditNote`, pero la página de venta sólo muestra el control/estado de emisión y no ofrece una representación imprimible específica de la Nota de Crédito autorizada.
- `src/lib/print/receipt-data.ts`, `pdf-templates.ts`, `PrintableTable.tsx` y `PrintOptionsPopover.tsx` están orientados a factura/remito/presupuesto; no existe todavía un `DocumentPrintKind` de Nota de Crédito ni una política que bloquee impresión de pendientes/rechazadas.
- El logging existente de elegibilidad usa campos allowlisted, pero falta un evento seguro y útil para las fases de solicitud, autorización y finalización de la Nota de Crédito.

Los artefactos existentes deben tratarse como trabajo ajeno: no borrar, renombrar ni convertir sus tests/checklists en implementación. Esta especificación integra sus contratos y resuelve las diferencias de alcance indicadas aquí.

## Requisitos funcionales

### RF-01 — CAE original flexible, CAE nuevo estricto

1. Un CAE original histórico se considera presente si, luego de eliminar espacios externos, es un valor textual no vacío. No se debe exigir longitud 14 ni una expresión numérica para decidir elegibilidad de una venta histórica.
2. Se deben conservar ceros, texto y la representación fiscal original; no convertir el CAE original a número ni sustituirlo por el CAE de la Nota de Crédito.
3. Un CAE original ausente, `null`, `undefined`, cadena vacía, placeholder o fuente conflictiva sigue bloqueando la emisión. La relajación es de formato, no una autorización para inventar el dato.
4. El CAE nuevo retornado por ARCA continúa requiriendo exactamente 14 dígitos ASCII, y también deben ser enteros positivos válidos el número y el punto de venta nuevos. Cualquier respuesta incompleta/rechazada no autoriza ni habilita impresión.
5. La asociación `CbtesAsoc` debe usar el tipo AFIP, punto de venta y número del comprobante original. El CAE original flexible debe conservarse sólo como dato de asociación/auditoría, nunca como `creditNoteCAE`.

### RF-02 — Datos faltantes del comprobante original

1. Si falta únicamente o faltan varios de `billType`, `invoicePointOfSale` o `invoiceNumber`, y el CAE original no vacío es inequívoco, la UI solicita exactamente esos campos.
2. `billType` sólo acepta `Factura A`, `Factura B` o `Factura C`; el código original se deriva como 1/6/11. Punto y número son enteros positivos.
3. El cliente sólo transporta propuestas efímeras de campos faltantes. Nunca puede enviar CAE, total, productos, cliente, negocio, tipo AFIP de Nota, stock o importe como autoridad.
4. Antes de reservar `SaleReturn` o llamar a ARCA, la Server Action debe volver a leer Prisma, combinar persistido + propuesta sólo para campos ausentes y normalizar nuevamente.
5. Un valor persistido inválido/conflictivo no es “faltante” y no puede ser corregido desde el modal. Si la venta cambió entre render y submit, se devuelve un error controlado sin efectos.

### RF-03 — Logging seguro de la solicitud

Debe existir un evento server-only, con esquema allowlist, para permitir depurar asociación fiscal, totales y datos de la Nota sin registrar secretos. Como mínimo puede incluir:

```text
event: "credit_note_request"
phase: "validated" | "pending" | "arca_response" | "authorized" | "rejected" | "finalization_failed"
orderId, businessId, saleReturnId?: string
status: "PENDING" | "AUTHORIZED" | "REJECTED" | "FAILED"
originalBillType?: "Factura A" | "Factura B" | "Factura C"
originalVoucherType?: 1 | 6 | 11
originalInvoiceNumber?: number
originalPointOfSale?: number
creditNoteBillType?: "Nota de Crédito A" | "Nota de Crédito B" | "Nota de Crédito C"
creditNoteVoucherType?: 3 | 8 | 13
total: number
itemCount: number
associationPresent: boolean
hasOriginalCae: boolean
hasNewCae: boolean
hasNewNumber: boolean
hasNewPointOfSale: boolean
errorCode?: "NOT_ELIGIBLE" | "CONFLICT" | "AFIP_ERROR" | "INTERNAL_ERROR"
```

Nunca se deben registrar, ni completos ni truncados: certificados, claves privadas, access/refresh tokens, internal keys, cookies, headers de autenticación, `arca`, `Order.CAE` crudo, QR/URL, payloads de request/response, CAE original completo, CAE nuevo completo, stack/error de proveedor o datos serializados de Prisma. Los errores deben reducirse a códigos internos allowlisted. `NON_FISCAL` no debe generar ruido de request.

### RF-04 — Asociación visible e impresión

1. Una Nota de Crédito `AUTHORIZED` debe aparecer dentro del detalle de la venta original, claramente separada de la factura original, mostrando: estado, tipo de Nota, número, punto de venta, CAE nuevo, y comprobante original asociado (tipo, número, punto de venta y CAE original no reinterpretado).
2. `PENDING` debe mostrar estado pendiente y no ofrecer imprimir. `REJECTED` debe mostrar estado rechazado y no ofrecer imprimir. Sólo `AUTHORIZED` habilita la impresión.
3. La impresión debe representar una Nota de Crédito, no una factura: `DocumentPrintKind` debe distinguirla y el encabezado debe mostrar tipo/número/punto de venta/CAE de la Nota. Debe incluir una sección “Comprobante original asociado” con sus datos.
4. La impresión debe reutilizar los productos, cantidades, total, cliente y datos del negocio de la `Order` original, pero el CAE, número, punto y tipo del documento impreso deben provenir del `SaleReturn` autorizado.
5. La acción de imprimir es de lectura/presentación; no crea `Order`, no crea una segunda venta, no decrementa stock, no altera caja y no vuelve a llamar a ARCA.
6. La venta original debe seguir imprimiéndose como factura con su CAE original. Nunca debe mostrarse el CAE de la Nota como si fuera el de la factura.

## Arquitectura propuesta

### 1. Normalización y contratos fiscales

Extender `normalizeSaleFiscalMetadata` en `src/services/afip/credit-note.ts` para separar:

- `originalCae`: presencia/no vacío y conservación textual, sin regex de 14 dígitos.
- `newCae`: validación estricta exclusivamente en `parseCreditNoteResponse` o helper equivalente, con `^\d{14}$` sin trim/coerción de respuesta autorizada.
- validación independiente de tipo/código/número/punto y detección de conflictos.

El resultado recuperable debe seguir expresando `missingFields` y `canCompleteFromUser`; el CAE original nunca aparece en `missingFields`. La compatibilidad con `qrData` como metadata auxiliar se mantiene, sin tratarla como CAE. QR, URL o payload sólo deben bloquearse si se presentan como el valor del CAE o si impiden identificar un valor original no vacío; nunca deben entrar en logs/DTOs.

### 2. Mapper seguro de historial

`src/actions/sales/history.ts` calcula fiscalidad una vez para la vista, conserva `BillState.CAE` original, `originalVoucher` y el objeto `creditNote` separado. Debe mapear el `SaleReturn` completo sólo a un DTO serializable y mínimo, sin JSON fiscal crudo. La elegibilidad de emisión sigue requiriendo contenido completo, total positivo y ausencia de devolución autorizada.

Para impresión, el mapper debe producir un `creditNotePrintContext` sólo cuando existe una Nota autorizada y todos sus datos mínimos son válidos. El contexto debe incluir productos/cliente/negocio necesarios, metadata de la Nota y `originalVoucher`; no debe incluir credenciales ni respuesta ARCA cruda.

### 3. Server Action e idempotencia

`src/actions/sales/credit-note.ts` mantiene el orden: schema estricto → autenticación/tenant → lectura de `Order` + `returns` → normalización y merge → reserva/reintento de `SaleReturn` → llamada ARCA → validación estricta de respuesta nueva → transacción de autorización/stock/caja.

El snapshot de `SaleReturn` será la única fuente para `CbtesAsoc`, tipo de Nota, CAE/número/punto nuevos y vista posterior. La transacción no crea ni duplica `Order`. La carrera perdedora no ejecuta efectos locales. El logging ocurre en fases controladas y usa únicamente el esquema allowlisted.

### 4. Presentación e impresión

Extender sin romper consumidores existentes:

- `src/models/CreditNote.ts` y `src/models/BillState.ts` para separar metadata original, Nota y contexto de impresión.
- `CreditNoteStatusCard` o equivalente en la página de detalle para el estado y datos de asociación.
- `CreditNotePrintButton` o extensión de `PrintOptionsPopover`, visible sólo para `AUTHORIZED`.
- `src/lib/print/receipt-data.ts` con `"credit-note"` y una función de política que rechace pendientes/rechazadas.
- `src/lib/print/pdf-templates.ts` y la ruta térmica para encabezado, CAE nuevo y bloque de comprobante asociado.

La UI no decide autorización a partir de la presencia de un CAE: debe usar `status === "AUTHORIZED"` y campos validados server-side.

## Interfaces previstas

```ts
type MissingFiscalData = {
  billType?: "Factura A" | "Factura B" | "Factura C";
  invoicePointOfSale?: number;
  invoiceNumber?: number;
};

interface CreditNoteMetadata {
  status: "PENDING" | "AUTHORIZED" | "REJECTED";
  billType?: "Nota de Crédito A" | "Nota de Crédito B" | "Nota de Crédito C";
  afipVoucherType?: 3 | 8 | 13;
  cae?: string;
  number?: number;
  pointOfSale?: number;
  originalBillType: "Factura A" | "Factura B" | "Factura C";
  originalVoucherType: 1 | 6 | 11;
  originalCae: string;
  originalNumber: number;
  originalPointOfSale: number;
}

type CreditNotePrintContext = {
  documentKind: "credit-note";
  creditNote: CreditNoteMetadata & {
    status: "AUTHORIZED";
    cae: string;
    number: number;
    pointOfSale: number;
  };
  original: {
    billType: "Factura A" | "Factura B" | "Factura C";
    cae: string;
    number: number;
    pointOfSale: number;
  };
  products: Array<{ description: string; amount: number; unitPrice: number; subtotal: number }>;
  total: number;
};
```

El tipo real debe adaptarse a los nombres ya existentes y a la serialización de Server Components; el ejemplo no autoriza `any` ni payloads Prisma.

## Archivos previstos

### Obligatorios

- `src/services/afip/credit-note.ts`: CAE original no vacío, CAE nuevo estricto, asociación y tipos.
- `src/actions/sales/credit-note.ts`: revalidación server-side, merge de faltantes, logging seguro y snapshot único.
- `src/actions/sales/history.ts`: DTO de estado/asociación/impresión sin secretos.
- `src/models/CreditNote.ts`, `src/models/BillState.ts`: interfaces separadas original/Nota/impresión.
- `src/app/(protected)/sales/[id]/page.tsx` y componentes Billing: tarjeta de estado, asociación y CTA de impresión sólo autorizado.
- `src/lib/print/receipt-data.ts`, `src/lib/print/pdf-templates.ts` y consumidor térmico: documento Nota de Crédito y datos de asociación.

### Condicionales, sólo si la inspección de consumidores lo exige

- `src/lib/print/BrowserPrint.ts`, `src/lib/print/index.ts`, `PrintOptionsPopover.tsx` o `PrintableTable.tsx` para transportar el nuevo contexto sin alterar facturas/remitos.
- `src/schemas/index.ts` si el schema compartido existente debe centralizar el envelope estricto.

### Protegidos

- `prisma/schema.prisma`: no cambiar ni agregar `Order`.
- `src/actions/afip.ts`: no relajar la validación de la respuesta nueva ni exponer credenciales.
- Flujos de ventas, stock y devoluciones manuales: no deben reinterpretar una Nota como venta.
- Directorios `ai/features` existentes: no borrar ni reescribir artefactos ajenos.

## Criterios de aceptación medibles

- **AC-01:** Un histórico con CAE original no vacío de longitud distinta de 14, incluyendo texto preservable, puede llegar a la validación de tipo/número/punto y no es rechazado sólo por la longitud del CAE original.
- **AC-02:** CAE original vacío/ausente, conflicto fiscal, tipo no soportado, número/punto inválidos o contenido incompleto no reserva `SaleReturn` ni llama a ARCA.
- **AC-03:** Cada respuesta ARCA con CAE nuevo distinto de exactamente 14 dígitos ASCII, número cero/no entero o punto cero/no entero termina en `AFIP_ERROR`/rechazo y nunca queda `AUTHORIZED` ni imprimible.
- **AC-04:** Si faltan uno, dos o tres campos permitidos, el modal muestra exactamente esos campos; no muestra ni solicita CAE y no inventa valores.
- **AC-05:** La action reconsulta `Order` por `id + businessId`, acepta sólo propuestas de faltantes, rechaza override/conflicto y revalida antes de reserva/ARCA.
- **AC-06:** El snapshot persistido, `CbtesAsoc`, `billState` y la UI usan el mismo tipo A/B/C, tipo AFIP 1/6/11, Nota 3/8/13, número y punto originales; `Order` no se duplica ni se modifica para representar la Nota.
- **AC-07:** Dos solicitudes concurrentes para la misma venta producen como máximo un `SaleReturn` autorizado, una restauración de stock y un movimiento negativo de caja; la segunda no crea una `Order`.
- **AC-08:** Cada evento de logging contiene sólo campos allowlisted de asociación, totales, conteos, fase y códigos; pruebas de inspección de argumentos demuestran ausencia de CAE completo/parcial, certificados, claves, tokens, internal keys, QR, payloads, headers y errores crudos.
- **AC-09:** Una venta con Nota `PENDING` o `REJECTED` muestra estado y no tiene botón de impresión habilitado; una venta con Nota `AUTHORIZED` muestra tipo, número, punto, CAE, estado y comprobante original asociado.
- **AC-10:** La impresión autorizada identifica inequívocamente “Nota de Crédito”, usa el CAE/número/punto nuevos, incluye la asociación original y no presenta el CAE nuevo como CAE de la factura original.
- **AC-11:** Imprimir o recargar una Nota autorizada no crea/actualiza `Order`, `SaleReturn`, stock, caja ni realiza llamadas ARCA.
- **AC-12:** Ventas normales, remitos, presupuestos, facturas históricas, impresión original, devoluciones manuales y ventas no fiscales mantienen su comportamiento previo.
- **AC-13:** No se agregan migraciones ni dependencias; la implementación futura pasa lint, typecheck, build y regresión completa.

## Decisión de implementación

La fuente de verdad de una Nota autorizada es `SaleReturn` asociado a la `Order` original. El CAE original sólo relaja su validación de formato cuando ya existe un valor no vacío; el CAE nuevo permanece estricto. La presentación y la impresión consumen DTOs server-side separados, y la emisión conserva el protocolo pendiente → autorización transaccional existente.
