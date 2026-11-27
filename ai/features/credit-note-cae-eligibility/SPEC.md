# Elegibilidad de Nota de Crédito para ventas con CAE histórico

## Estado y alcance

- **Estado:** especificación arquitectónica. Esta entrega no implementa código ni pruebas.
- **Objetivo:** hacer visible la opción de Nota de Crédito únicamente cuando la venta tiene fiscalidad AFIP normalizable y suficiente para una reversión completa, incluyendo ventas antiguas cuyo `Order.CAE` está persistido como JSON.
- **Fuera de alcance:** migración de datos, cambio del esquema Prisma, emisión parcial, modificación de devoluciones manuales, cambios de credenciales o relajación de la validación AFIP.

## Evidencia investigada

La página `src/app/(protected)/sales/[id]/page.tsx` no decide la elegibilidad. Sólo renderiza:

1. `CreditNoteEligibilityNotice` si existe `sale.fiscalDiagnostic`.
2. `CreditNoteButton` si existe `sale.fiscalContext`.

`CreditNoteButton` además exige el contrato canónico y retorna `null` si `eligibleForFullCreditNote !== true` o si la devolución ya está autorizada. Por tanto, una venta sin botón no demuestra que el componente esté fallando: significa que el mapper no produjo un contexto fiscal válido/accionable.

El flujo servidor actual es:

1. `getSaleByIdAction` consulta `Order` con `items`, `client` y `returns`.
2. `mapOrderToBillState` llama a `normalizeSaleFiscalMetadata` y construye `fiscalContext` únicamente cuando el resultado es `VALID`.
3. `createCreditNoteAction` vuelve a consultar la venta y vuelve a normalizarla antes de llamar a AFIP.
4. `Order.CAE` es `Json?`; las ventas nuevas guardan allí el objeto de respuesta de facturación, además de columnas nuevas como `billType`, `afipVoucherType`, `invoiceNumber` e `invoicePointOfSale`.

El arreglo previo de propagación de CAE (`CAE: parseCAE(order.CAE)` en `mapOrderToBillState`) resolvió la pérdida del CAE para búsqueda/impresión, pero no resuelve la elegibilidad de Nota de Crédito: `parseCAE` sólo entrega la forma de CAE y no puede completar el tipo fiscal requerido por el contexto de UI.

## Causa raíz

Hay dos incompatibilidades relacionadas en el normalizador actual:

1. **El JSON histórico válido contiene `qrData`.** `processSaleAction` persiste el objeto CAE completo, que incluye `qrData`. Sin embargo, `normalizeSaleFiscalMetadata` trata la presencia de `qrData` como `CAE_INVALID` (igual que un payload QR o una URL). Esto confunde metadatos auxiliares legítimos de un CAE persistido con un valor que pretende ser el CAE.
2. **El contrato de la UI exige más que un CAE.** Para construir `SaleFiscalContext` se requieren `billType`, el código AFIP compatible, número y punto de venta. El log reportado confirma la segunda falla: `hasCaeSignal: true`, `hasValidCae: false`, `hasInvoiceNumber: true`, `hasPointOfSale: true`, pero `hasBillType: false`, `hasVoucherType: false`, `status: INVALID_OR_INCOMPLETE`, `reason: CAE_INVALID`, `source: historical_json`. La UI no puede elegir entre Nota A/B/C sólo a partir del CAE; habilitarla por `hasCaeSignal` sería inseguro.

En consecuencia, `CreditNoteButton` no recibe el DTO canónico. La ausencia del botón es un efecto correcto de la barrera de UI, pero el diagnóstico `CAE_INVALID` es demasiado amplio y el lector histórico no reconoce toda la forma que se persiste actualmente. El caso debe distinguir “CAE válido con metadata auxiliar” de “CAE inválido”; si después de leer columnas y JSON sigue sin existir un tipo A/B/C o código 1/6/11 inequívoco, debe continuar rechazándose como incompleto.

## Solución mínima aprobada

### 1. Normalización única y compatible

Modificar `src/services/afip/credit-note.ts` para que `normalizeSaleFiscalMetadata`:

- acepte `Order.CAE` como objeto Prisma o string JSON;
- lea `CAE`/`cae`, número (`invoiceNumber`, `nroComprobante`, `number`) y punto (`invoicePointOfSale`, `ptoVenta`, `pointOfSale`) desde columnas y JSON histórico;
- trate `qrData` como metadata auxiliar permitida, sin usarla como fuente del CAE;
- continúe rechazando `qr` como payload, URLs, JSON cuyo valor raíz sea una URL, CAE alfanumérico y CAE que no sea exactamente de 14 dígitos ASCII;
- obtenga el tipo únicamente de campos documentados y confirmados por el modelo/datos (`billType` A/B/C o `afipVoucherType` 1/6/11, en columnas o JSON). Si sólo hay CAE, número y punto, el resultado sigue siendo `INVALID_OR_INCOMPLETE`; no se debe adivinar B/C ni usar un default de facturación;
- detecte conflictos entre fuentes y no elija silenciosamente una de ellas;
- devuelva `VALID` sólo con CAE, tipo, código compatible, número y punto positivos e inequívocos.

La corrección debe conservar `normalizeCae`, el mapeo A→1/B→6/C→11 y el rechazo de datos peligrosos. No se debe convertir un CAE textual a número ni eliminar ceros iniciales.

### 2. Contrato del mapper

Modificar `src/actions/sales/history.ts` para calcular la normalización una sola vez y:

- crear `fiscalContext` sólo para resultado `VALID`;
- conservar el contexto serializable con `originalCAE`, `billType`, `originalAfipVoucherType`, `invoiceNumber`, `invoicePointOfSale`, productos, estado de devolución y `eligibleForFullCreditNote`;
- mantener `CAE: parseCAE(order.CAE)` para el contrato de historial/búsqueda, sin pasar el JSON crudo al cliente;
- emitir `fiscalDiagnostic` para un CAE señalado pero inválido/incompleto;
- no emitir diagnóstico para `NON_FISCAL`;
- mantener el diagnóstico de devolución autorizada o contenido insuficiente para fiscalidad válida.

La page y el botón deben seguir consumiendo el contrato existente. No se debe añadir una segunda regla de elegibilidad en React ni hacer que la UI interprete `hasCaeSignal`.

### 3. Boundary de emisión

`src/actions/sales/credit-note.ts` debe seguir usando la misma normalización server-side con `Order.CAE` y columnas. Antes de reservar una devolución o llamar a AFIP debe rechazar cualquier resultado distinto de `VALID` con `NOT_ELIGIBLE`. El navegador no puede convertir un contexto histórico incompleto en una emisión.

## Contrato funcional de elegibilidad

Una venta muestra la opción accionable sólo si se cumplen simultáneamente:

- CAE de 14 dígitos válido;
- `billType` exactamente `Factura A`, `Factura B` o `Factura C`;
- código AFIP ausente o compatible, y si está presente dentro de 1/6/11;
- número y punto de venta enteros positivos;
- no existe devolución de Nota de Crédito `AUTHORIZED`;
- total positivo y detalle con productos, IDs y cantidades válidos.

Una venta con devolución `PENDING` conserva el estado pendiente. Una venta con CAE válido pero tipo ausente, conflicto, datos de comprobante inválidos o contenido insuficiente no puede emitir; debe mostrar aviso no accionable cuando corresponda.

## Archivos a cambiar

### Obligatorios

- `src/services/afip/credit-note.ts`: aceptar la forma histórica real con `qrData` auxiliar, completar la extracción documentada y mantener validación estricta/conflictos.
- `src/actions/sales/history.ts`: mapear el resultado normalizado al DTO canónico y al diagnóstico sin fabricar contexto vacío.

### Sólo si la implementación descubre una incompatibilidad de forma

- `src/lib/cae.ts`: únicamente para mantener `parseCAE` compatible con objeto/string JSON histórico y campos opcionales; no debe convertirse en la autoridad de elegibilidad.
- `src/models/BillState.ts`: sólo si el contrato TypeScript actual no alcanza para el DTO ya descrito; no agregar el JSON fiscal crudo.

### Pruebas a agregar o actualizar (la implementación futura, no esta entrega)

- `ai/features/credit-note-cae-eligibility/fiscal-normalization.test.ts`: normalización de objeto/string JSON, `qrData` permitido, aliases, conflicto, CAE inválido y tipo faltante.
- `ai/features/credit-note-cae-eligibility/mapper.test.ts`: contexto visible para histórico válido y diagnóstico/ausencia de contexto para histórico inválido.
- `ai/features/credit-note-cae-eligibility/presentation.test.tsx`: botón sólo con `eligibleForFullCreditNote`, aviso sin botón para diagnósticos.
- `ai/features/credit-note-cae-eligibility/action-boundary.test.ts`: rechazo `NOT_ELIGIBLE` antes de AFIP y regresión de caso válido.

Estas pruebas deben reutilizar el setup Vitest/RTL existente; no se autoriza agregar dependencia nueva.

## Archivos que no deben cambiar en el arreglo mínimo

- `src/app/(protected)/sales/[id]/page.tsx`: su contrato condicional ya expresa correctamente el boundary server/client.
- `src/components/Billing/CreditNoteButton.tsx`: no debe reconstruir fiscalidad ni mostrar por señal CAE.
- `src/components/Billing/CreditNoteEligibilityNotice.tsx`: sólo cambiar si falta un reason code ya definido; no interpolar CAE/JSON.
- `src/actions/afip.ts`: no cambiar el mapeo ni el contrato de emisión como atajo.
- `src/actions/sales/process.ts`: no modificar la persistencia histórica en este bugfix.
- `prisma/schema.prisma`: no hay migración ni cambio de columnas.
- `src/components/Billing/SalesTable.tsx`, `SaleAccordion.tsx` y filtros de búsqueda: el bug es de elegibilidad del detalle, no de clasificación de ventas.

## Casos edge obligatorios

1. `CAE` como objeto y como JSON serializado, con `CAE` o `cae`.
2. `qrData` válido presente: debe aceptarse como metadata; `qr`/URL/payload QR debe rechazarse.
3. CAE válido con tipo/número/punto sólo en columnas; sólo en JSON; o distribuido entre ambos.
4. CAE válido con número/punto pero sin tipo en ninguna fuente: no mostrar opción accionable.
5. Tipo A/B/C con código incompatible, código no soportado, dos tipos distintos o columnas/JSON conflictivos: rechazar.
6. CAE vacío, placeholder, alfanumérico, de longitud incorrecta, URL o payload: rechazar sin excepción.
7. Devolución pendiente, autorizada y rechazada; contenido vacío, total cero, cantidad cero o producto sin ID.
8. `parseCAE` inválido o `Order.CAE` nulo/no objeto: no romper historial ni convertir una venta manual en fiscal.
9. Payload cliente manipulado o datos que cambian entre render y action: la action rechaza antes de AFIP.

## Criterios de aceptación medibles

- **AC-01:** Una venta histórica con JSON serializado que contenga CAE de 14 dígitos, `qrData` auxiliar, tipo A/B/C (o código compatible), número y punto positivos produce `VALID`, genera `fiscalContext` y, con contenido completo, renderiza exactamente una opción de Nota de Crédito.
- **AC-02:** El fixture que reproduce el log (`hasCaeSignal=true`, número/punto presentes, tipo ausente) no renderiza botón, devuelve diagnóstico no accionable y nunca llama a AFIP.
- **AC-03:** Un histórico con `qrData` legítimo deja de clasificarse como `CAE_INVALID`; un histórico con `qr`/URL/payload QR sigue siendo rechazado.
- **AC-04:** Venta manual/sin CAE permanece silenciosa: no contexto, no aviso, no botón y sin log diagnóstico.
- **AC-05:** CAE válido con tipo ausente, código incompatible, conflicto entre columna y JSON, CAE inválido, número no positivo, punto no positivo o contenido incompleto nunca habilita emisión.
- **AC-06:** La action vuelve a normalizar desde Prisma y devuelve `NOT_ELIGIBLE` sin invocar AFIP para cada caso no válido, incluso si el cliente envía `eligibleForFullCreditNote: true`.
- **AC-07:** A/B/C conserva los mapeos originales 1/6/11 y genera Nota A/B/C 3/8/13 sin cambios en el payload existente.
- **AC-08:** Devolución autorizada no muestra segunda emisión; pendiente muestra estado pendiente; rechazada conserva la política de reintento existente.
- **AC-09:** El DTO enviado a cliente no incluye `Order.CAE`, `qrData`, URL QR, credenciales, tokens ni objetos Prisma.
- **AC-10:** No se modifica Prisma, no se agregan dependencias y pasan lint, typecheck, build y la suite de regresión existente tras la implementación.

## Pruebas requeridas para QA

La suite debe demostrar explícitamente: (a) visibilidad sólo para venta elegible; (b) aceptación de CAE histórico JSON con `qrData` y metadata fiscal válida; (c) rechazo de CAE inválido/incompleto sin romper el mapper; (d) ausencia de llamada AFIP en el boundary; (e) regresión de ventas no fiscales, devoluciones pendientes/autorizadas y clasificación/impresión de ventas.

## Gate G1 — Arquitectura aprobada

**Confirmado.** G1 queda satisfecho: se identificó la causa raíz en la normalización histórica (`qrData` tratado como inválido y metadata de tipo ausente/no reconocida), se explicó el contrato que exige la UI, se definió un arreglo mínimo sin migración ni dependencia nueva, se separaron archivos obligatorios y protegidos, y se establecieron criterios y pruebas medibles sin implementar código ni tests.
