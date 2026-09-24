# Modal de datos fiscales faltantes para Nota de Crédito

## Estado, causa y alcance

- **Estado:** especificación arquitectónica; esta entrega no implementa código ni pruebas.
- **Gate:** G1 — confirmado al final de este documento.
- **Objetivo:** permitir que una factura histórica con CAE válido pero metadata fiscal incompleta pueda solicitar los datos estrictamente faltantes en un modal y continuar con una Nota de Crédito completa.
- **Fuera de alcance:** inventar o solicitar un CAE, emitir Notas de Crédito parciales, editar la venta histórica, modificar datos del cliente, migrar Prisma, cambiar credenciales/ARCA o alterar devoluciones manuales.

## Contexto investigado

`src/app/(protected)/sales/[id]/page.tsx` obtiene la venta mediante `getSaleByIdAction`, muestra `CreditNoteEligibilityNotice` para `fiscalDiagnostic` y muestra `CreditNoteButton` sólo cuando existe `fiscalContext`. El mapper está en `src/actions/sales/history.ts` y normaliza con `normalizeSaleFiscalMetadata` en `src/services/afip/credit-note.ts`.

La acción `src/actions/sales/credit-note.ts` vuelve a leer `Order` restringiendo por `businessId`, normaliza server-side, reserva un `SaleReturn` `CREDIT_NOTE`, llama a `createAfipVoucherAction` y finaliza en una transacción con stock/caja. La acción actual no puede continuar si el normalizador devuelve algo distinto de `VALID`.

`Order.CAE` es `Json?`; las columnas históricas relevantes son `billType`, `afipVoucherType`, `invoiceNumber`, `invoicePointOfSale` e `invoiceIssuedAt`. `SaleReturn` ya tiene snapshot de CAE, tipo, número y punto de venta, por lo que no se requiere una migración para esta feature.

El botón actual tiene una confirmación inline y un contrato que sólo acepta `{ orderId, confirmed, idempotencyKey }`. El cambio debe conservar la idempotencia, la reserva condicional y la barrera que impide llamar a AFIP con datos no autorizables.

## Regla de seguridad principal

El cliente puede **proponer únicamente valores de campos faltantes**. Nunca es fuente de verdad. La acción debe:

1. autenticar y obtener el negocio de la sesión;
2. leer la venta desde Prisma con `id + businessId`;
3. volver a normalizar el CAE y toda la metadata persistida;
4. comprobar que el CAE sea válido (exactamente 14 dígitos, no URL, QR, placeholder ni dato alfanumérico);
5. combinar sólo los campos faltantes con la propuesta validada;
6. verificar tipo/código/número/punto y contenido completo antes de reservar o llamar a AFIP.

Un `eligibleForFullCreditNote` enviado por navegador, valores de productos, total, cliente, CAE o comprobante asociado no tienen autoridad y no deben formar parte del contrato de recuperación.

## Datos solicitables y datos que nunca se solicitan

### Solicitables, sólo si están ausentes

| Campo | Contrato | Regla |
|---|---|---|
| Tipo original | `Factura A \| Factura B \| Factura C` | Select cerrado; no texto libre. |
| Punto de venta | entero positivo | Input numérico; debe ser un punto de venta permitido por las credenciales al emitir. |
| Número de comprobante | entero positivo | Input numérico; no se aceptan decimales, cero, negativos o separadores ambiguos. |

`afipVoucherType` no se pide como un cuarto campo: se deriva de tipo (`A → 1`, `B → 6`, `C → 11`). Si ya existe un código válido, el tipo elegido debe ser compatible. Si existe sólo el código 1/6/11, el normalizador puede resolver el tipo sin modal.

### Nunca solicitables

- **CAE original:** no se captura, completa, confirma ni reemplaza desde el cliente. Si falta, es inválido o hay conflicto entre fuentes, se bloquea la emisión (`CAE_INVALID` o diagnóstico equivalente) y se indica revisar el comprobante original.
- Total, productos, cantidades, IVA, identidad del cliente, credenciales, certificado, clave o respuesta ARCA: se obtienen de Prisma/servidor.
- Un campo presente pero inválido o conflictivo no se trata como faltante. Debe bloquearse para evitar que el usuario lo “corrija” silenciosamente.

## Arquitectura propuesta

### 1. Normalizador y diagnóstico

Extender el contrato de `normalizeSaleFiscalMetadata` sin relajar sus validaciones. Debe distinguir:

- `VALID`: todos los campos fiscales obligatorios son inequívocos.
- `INVALID_OR_INCOMPLETE` recuperable: CAE válido, sin conflictos, contenido fiscal seguro y sólo faltan `billType`, `invoicePointOfSale` y/o `invoiceNumber`.
- `INVALID_OR_INCOMPLETE` no recuperable: CAE faltante/inválido, campo presente inválido, conflicto entre columna/JSON, tipo no soportado o tipo/código incompatible.
- `NON_FISCAL`: venta manual sin señal fiscal; permanece silenciosa y no muestra modal.

El diagnóstico serializable debe incluir sólo una lista tipada de `missingFields` y un booleano `canCompleteFromUser` para el caso recuperable. No debe incluir el JSON `Order.CAE`, QR, tokens ni secretos. La lista debe calcularse server-side en `mapOrderToBillState`; React no debe inferirla por presencia de propiedades.

La recuperación sólo está permitida cuando el CAE ya fue normalizado y es válido. La ausencia del tipo puede ser recuperable; un CAE inválido nunca lo es.

### 2. DTO de página y presentación

Agregar un DTO seguro, por ejemplo `creditNoteRecovery`, junto al diagnóstico, con:

```text
{ orderId, missingFields, known: { billType?, invoiceNumber?, invoicePointOfSale? },
  total, products, creditNoteStatus }
```

`known` sirve para mostrar qué valores vienen de la venta y debe ser de sólo lectura. No incluir CAE crudo si el DTO no lo necesita; si se muestra en la confirmación, usar únicamente el CAE normalizado ya existente en el contexto seguro.

`CreditNoteButton` debe renderizarse para el caso `eligibleForFullCreditNote` y para el caso recuperable. Al intentar continuar en el segundo caso abre `CreditNoteMissingDataModal`; después de completar los campos pasa a la confirmación fiscal existente. No se debe emitir automáticamente al cerrar el modal.

Usar los primitives Radix existentes de `src/components/ui/dialog.tsx`, con foco inicial, cierre con Escape, foco atrapado, labels/descripción asociados, navegación por teclado y diseño usable en móvil. No agregar dependencia.

### 3. Transporte temporal

Los valores del modal viven sólo en estado React durante la interacción. Al confirmar, se envían como parte de una única invocación de Server Action:

```text
createCreditNoteAction({
  orderId,
  confirmed: true,
  idempotencyKey,
  missingFiscalData?: {
    billType?: "Factura A" | "Factura B" | "Factura C",
    invoicePointOfSale?: number,
    invoiceNumber?: number
  }
})
```

No usar URL, `localStorage`, cookies ni un draft persistido. El payload es transporte efímero, no una autorización ni un snapshot fiscal. La acción debe aceptar sólo el shape Zod estricto y rechazar campos desconocidos. Si se necesita reintentar una solicitud `REJECTED`, se reutiliza la misma clave y se vuelven a validar los datos; no se conserva input del navegador implícitamente.

### 4. Acción y combinación con Prisma

En `createCreditNoteAction`:

1. Validar el envelope Zod antes de `auth()` y rechazar tipos, claves o rangos inválidos sin tocar DB/AFIP.
2. Autenticar, conservar la comprobación de feature/bloqueo existente delegada a `createAfipVoucherAction`, y leer `Order` con `businessId`, items y returns.
3. Normalizar nuevamente desde Prisma. Resolver cada campo con esta precedencia: valor persistido inequívoco; si está ausente, propuesta del modal; nunca reemplazar un valor persistido.
4. Revalidar que la propuesta sólo complete campos reportados como faltantes. Una propuesta para un campo ya presente debe ser igual al valor persistido o devolver conflicto; no debe sobrescribirlo.
5. Validar A/B/C, códigos 1/6/11, mapeo de Nota A/B/C 3/8/13, enteros positivos, CAE válido, contenido y total. Rechazar antes de crear `SaleReturn` si algo falla.
6. Crear el `SaleReturn` con el snapshot resuelto (`originalCAE`, `originalVoucherType`, `originalNumber`, `originalPointOfSale`, `creditNoteBillType`, `creditNoteAfipType`). No actualizar `Order` ni el cliente. El snapshot debe ser el que se usa para construir `CbtesAsoc` y `billState`.
7. Mantener la reserva/idempotencia y finalización transaccional actuales. Una segunda llamada no debe disparar AFIP si ya hay `PENDING` o `AUTHORIZED`; una carrera perdedora no realiza efectos locales.

Si entre el render y la acción aparece un valor diferente, falta el CAE, cambia el tipo o hay conflicto de fuentes, devolver un código controlado (`NOT_ELIGIBLE` para datos no autorizables o `CONFLICT` para estado/idempotencia), sin enviar datos sensibles en el mensaje y sin llamar a AFIP.

## UX y mensajes

### Aviso en la venta

Para el caso recuperable, `CreditNoteEligibilityNotice` debe comunicar: “Faltan datos del comprobante original para emitir la Nota de Crédito.” Debe listar sólo campos faltantes (“Tipo de factura”, “Punto de venta”, “Número”) y explicar: “El CAE no puede completarse desde aquí.” Debe existir una acción “Completar datos y revisar”.

Para CAE inválido, conflicto o tipo no soportado, mantener un aviso no accionable: “No se puede emitir la Nota de Crédito porque los datos fiscales no son válidos o son inconsistentes. Revisá el comprobante original.” No mostrar modal ni permitir override.

### Modal

- Título: “Completar datos del comprobante original”.
- Descripción: “Ingresá únicamente los datos que faltan. Se validarán nuevamente antes de emitir.”
- Campos obligatorios sólo para `missingFields`, con `label`, ayuda y error inline.
- Tipo: opciones A, B y C, sin valor por defecto inventado.
- Punto/número: `inputMode="numeric"`, sin aceptar vacío al confirmar, decimal, signo, cero o texto.
- Aviso persistente: “El CAE original no se solicita ni se genera automáticamente.”
- Botones: “Cancelar” (no cambia DB) y “Continuar a confirmación”. Mientras valida, deshabilitar doble envío.
- La confirmación posterior debe mostrar que se emitirá una Nota de Crédito completa, el tipo asociado, número/punto original, total, restauración de stock y devolución en efectivo, igual que el flujo actual.

Mensajes específicos, sin eco de input peligroso:

- vacío: “Completá este dato”;
- tipo inválido: “Elegí Factura A, B o C”;
- punto/número inválido: “Ingresá un número entero mayor que cero”;
- conflicto server-side: “La venta cambió o sus datos fiscales son inconsistentes. Actualizá la página y revisá el comprobante original.”;
- CAE inválido/faltante: “No se puede emitir: el CAE original no es válido. No se puede completar automáticamente.”

## Archivos previstos

### Obligatorios

- `src/services/afip/credit-note.ts`: resultado recuperable, extracción de faltantes y validación/merge seguro.
- `src/actions/sales/history.ts`: DTO seguro, diagnóstico y clasificación de recuperabilidad.
- `src/actions/sales/credit-note.ts`: schema de input, merge server-side, revalidación, snapshot Prisma y códigos de error.
- `src/components/Billing/CreditNoteButton.tsx`: abrir modal, conservar confirmación/idempotencia y enviar propuesta tipada.
- `src/components/Billing/CreditNoteEligibilityNotice.tsx`: copy y CTA sólo para recuperación segura.
- `src/components/Billing/CreditNoteMissingDataModal.tsx`: componente cliente basado en Dialog/Radix.
- `src/models/BillState.ts` y/o tipos co-localizados: transportar el DTO serializable sin JSON fiscal crudo.
- `src/app/(protected)/sales/[id]/page.tsx`: pasar el nuevo DTO/acción si el contrato del mapper lo requiere.

### No cambiar salvo incompatibilidad demostrada

- `prisma/schema.prisma`: no migración; reutilizar columnas de `SaleReturn`.
- `src/actions/afip.ts`: conservar validación de punto de venta, mapeo, preflight, credenciales y contrato externo.
- modelos de cliente y totales: no aceptar datos del modal ni modificar la venta.

## Edge cases y decisiones

1. CAE válido + número/punto válidos + tipo ausente: pedir sólo tipo.
2. CAE válido + tipo válido + número ausente: pedir sólo número.
3. CAE válido + tipo válido + punto ausente: pedir sólo punto.
4. Varios faltantes: pedir todos en un solo modal, sin defaults.
5. Sólo `afipVoucherType` válido: derivar A/B/C; no pedir tipo.
6. Tipo existente y código ausente: conservar el tipo y derivar código.
7. Tipo y código incompatibles, dos valores distintos, o campo presente inválido: bloquear; no permitir “corregir” desde el modal.
8. CAE ausente, placeholder, URL, QR, alfanumérico o no numérico de 14 dígitos: bloquear sin modal.
9. Venta no fiscal sin señal CAE: no aviso, no botón y no modal.
10. Cambio de Prisma entre render y submit: revalidar; aceptar sólo si la propuesta completa exactamente el nuevo faltante y todo sigue inequívoco; de otro modo devolver conflicto.
11. `PENDING`, `AUTHORIZED` o `REJECTED`: conservar la política actual de idempotencia; nunca emitir una segunda Nota autorizada ni repetir AFIP por doble click.
12. Punto de venta positivo pero no habilitado por ARCA: la acción/`createAfipVoucherAction` rechaza antes de emitir y muestra error operativo, sin restaurar stock ni caja.
13. AFIP rechaza o no devuelve CAE/número/punto válidos: marcar rechazo según flujo actual; no presentar la operación como autorizada.
14. El usuario cancela o recarga: no hay persistencia temporal ni efectos fiscales.

## Criterios de aceptación medibles

- **AC-01:** Una venta con CAE válido y exactamente uno o más campos faltantes permitidos muestra aviso accionable y un modal que contiene exactamente esos campos, sin valores inventados.
- **AC-02:** Una venta con CAE faltante/inválido, conflicto, tipo no soportado o campo presente inválido no muestra modal ni botón de emisión; nunca llama a AFIP.
- **AC-03:** El modal permite únicamente Factura A/B/C y enteros positivos para punto/número; bloquea vacío, cero, negativo, decimal y texto.
- **AC-04:** En una emisión recuperable, la action recibe la propuesta, vuelve a consultar Prisma y genera el mismo snapshot resuelto en `SaleReturn`, `CbtesAsoc` y `billState`; `Order` y `Client` permanecen sin cambios.
- **AC-05:** Un payload que intenta cambiar un campo ya persistido, CAE, total, items, cliente, negocio o tipo/código incompatible devuelve error controlado antes de crear la reserva o llamar a AFIP.
- **AC-06:** El cliente no puede forzar emisión enviando `eligibleForFullCreditNote: true`, un CAE inventado o fiscalidad del formulario; la action ignora/rechaza esos campos por schema estricto.
- **AC-07:** La action consulta siempre `where: { id: orderId, businessId: session.user.businessId }` y no puede acceder a una venta de otro negocio.
- **AC-08:** CAE válido + tipo A/B/C resuelve 1/6/11 y emite Nota A/B/C 3/8/13; el código existente y el tipo elegido deben coincidir.
- **AC-09:** Una carrera, doble submit o reintento con una clave diferente no produce dos Notas, dos devoluciones, doble stock ni doble movimiento de caja.
- **AC-10:** Ningún mensaje, log o DTO al cliente contiene CAE inválido crudo, QR, credenciales, tokens, claves, JSON Prisma o datos que no sean necesarios para la UI.
- **AC-11:** Cancelar, cerrar o recargar el modal no crea/actualiza `SaleReturn` ni modifica `Order`.
- **AC-12:** No se agregan dependencias ni migraciones; la implementación conserva el contrato de AFIP y pasa lint, typecheck, build y regresión existente.

## Plan de pruebas para la implementación (no ejecutado en esta entrega)

- Normalizador: cada combinación de campos faltantes, CAE inválido, conflicto, alias histórico, QR/URL y tipo/código.
- Mapper: DTO recuperable seguro, campos conocidos sólo lectura, `NON_FISCAL` silencioso y estados de devolución.
- Modal: accesibilidad, campos dinámicos, validación inline, cancelación, copy seguro y envío sólo después de completar.
- Action boundary: autenticación, scope de negocio, schema estricto, merge sin override, rechazo antes de AFIP y payload cliente manipulado.
- Persistencia/flujo: snapshot `SaleReturn`, idempotencia, carreras, rechazo AFIP, punto no permitido y ausencia de efectos parciales.
- Regresión: ventas completas, histórico válido con `qrData`, ventas manuales, impresión/búsqueda y tests existentes de Nota de Crédito.

## Gate G1 — Arquitectura aprobada

**Confirmado.** G1 queda satisfecho: se investigaron page, botón, avisos, acciones, normalizador, modelos Prisma y componentes UI; se limitaron los datos solicitables a tipo/punto/número; se prohibió solicitar o inventar CAE; se definieron transporte efímero, merge y revalidación server-side, conflictos, UX, edge cases, archivos y criterios medibles sin implementar código ni tests.
