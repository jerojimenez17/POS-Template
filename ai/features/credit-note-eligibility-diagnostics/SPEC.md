# Diagnóstico de elegibilidad de Nota de Crédito

## Estado y alcance

- **Estado:** especificación arquitectónica. No implementa código ni pruebas.
- **Objetivo:** explicar de forma segura por qué una venta que parece tener CAE no muestra el control de Nota de Crédito, sin convertir una venta no fiscal en un caso de error.
- **Fuera de alcance:** cambios de esquema Prisma, emisión de comprobantes, reparación automática de datos históricos, exposición del JSON `Order.CAE` o modificación de secretos/credenciales.

## Hallazgos actuales

1. `normalizeSaleFiscalMetadata` devuelve únicamente un objeto normalizado o `undefined`. Por tanto, ausencia de CAE, CAE mal formado, campos incompletos y conflictos entre columnas y JSON quedan indistinguibles.
2. El normalizador exige CAE de 14 dígitos, tipo A/B/C coherente con 1/6/11, número positivo y punto de venta positivo. Lee columnas y algunos nombres del JSON histórico, pero no comunica qué requisito falló.
3. `mapOrderToBillState` crea actualmente un `fiscalContext` de fallback incluso cuando la normalización falla. Ese fallback tiene CAE vacío y `eligibleForFullCreditNote: false`; `CreditNoteButton` lo oculta silenciosamente.
4. La página de detalle sólo renderiza `CreditNoteButton`; no existe una superficie para diagnóstico.
5. `CreditNoteButton` debe seguir siendo una barrera de presentación, no la fuente de verdad. La Server Action vuelve a leer y validar la venta.
6. `fiscalContext` no debe depender de `BillContext`: el detalle recibe el DTO producido por el mapper de historial. `BillContext` es estado de facturación del cliente y no debe recibir CAE ni diagnósticos nuevos.

## Decisiones funcionales

### Estados de fiscalidad

La normalización debe separar resultado y diagnóstico mediante una función pura, por ejemplo:

```ts
type SaleFiscalMetadataResult =
  | { status: "VALID"; metadata: NormalizedSaleFiscalMetadata }
  | { status: "NON_FISCAL" }
  | {
      status: "INVALID_OR_INCOMPLETE";
      reason: FiscalDiagnosticReason;
      hasCaeSignal: true;
    };

type FiscalDiagnosticReason =
  | "CAE_INVALID"
  | "FISCAL_FIELDS_INCOMPLETE"
  | "FISCAL_TYPE_CONFLICT"
  | "FISCAL_TYPE_UNSUPPORTED";
```

`NON_FISCAL` significa que no existe un valor CAE reconocible en columnas ni en el JSON histórico: `null`, `undefined`, cadena vacía o placeholder (`undefined`, `null`, `nan`, `none`) después de trim. Una venta manual, remito, presupuesto o venta aún no autorizada permanece silenciosa: no se registra diagnóstico y no se muestra aviso.

`INVALID_OR_INCOMPLETE` significa que sí existe una señal no vacía de CAE, pero el conjunto no puede probarse como comprobante AFIP inequívoco. Incluye CAE con formato inválido, número/punto ausente o no positivo, tipo ausente/no soportado y conflicto entre el tipo visible y el código AFIP. Nunca habilita emisión.

Un CAE válido con una Nota de Crédito `AUTHORIZED` sigue siendo fiscalmente identificado, pero no accionable. El detalle debe mostrar un estado no accionable breve (por ejemplo, “La venta ya tiene una Nota de Crédito autorizada”), no ocultar la razón. Un CAE válido cuya venta carezca de productos válidos también debe quedar no accionable y mostrar un diagnóstico neutral; la action continúa siendo la autoridad final.

### Compatibilidad histórica sin relajar validación

El normalizador debe aceptar únicamente variaciones documentadas de almacenamiento, no valores fiscales más débiles:

- `Order.CAE` como objeto o JSON serializado.
- CAE bajo `CAE` o `cae`, preservando trim y ceros iniciales.
- Número bajo `invoiceNumber`, `nroComprobante` o `number` y punto de venta bajo `invoicePointOfSale`, `ptoVenta` o `pointOfSale`, tanto en columnas como en el objeto histórico.
- Tipo bajo `billType` o `afipVoucherType` y sus valores históricos equivalentes ya persistidos.
- Números representados como strings decimales se convierten sólo si son enteros positivos; no se aceptan decimales, signos, exponentes, cero, negativos ni texto libre.
- El CAE sigue requiriendo exactamente 14 dígitos ASCII después de trim. Un valor numérico se acepta sólo si es un entero seguro y su representación decimal tiene 14 dígitos; no se debe convertir a número un CAE de texto porque podría perder ceros iniciales.
- Si columnas y JSON contienen valores distintos, no se elige arbitrariamente: el resultado es `FISCAL_TYPE_CONFLICT` o `FISCAL_FIELDS_INCOMPLETE` según el conflicto detectado. Los campos no conflictivos pueden completarse desde el JSON histórico.

No se aceptan CAE alfanuméricos, etiquetas de prueba como `ORIGINAL-CAE`, QR completo, URL, payload AFIP completo ni un texto que sólo “parezca” una autorización. No se deben agregar aliases especulativos sin un fixture de producción anonimizado y una regla explícita.

### Diagnóstico visible

Agregar un DTO serializable y mínimo, separado del contexto usado para emitir:

```ts
interface SaleFiscalDiagnostic {
  status: "INVALID_OR_INCOMPLETE" | "INELIGIBLE";
  reason:
    | "CAE_INVALID"
    | "FISCAL_FIELDS_INCOMPLETE"
    | "FISCAL_TYPE_CONFLICT"
    | "FISCAL_TYPE_UNSUPPORTED"
    | "ALREADY_AUTHORIZED"
    | "SALE_CONTENT_INCOMPLETE";
  message: string;
}
```

`BillState.fiscalContext` debe existir sólo para metadata `VALID`; no debe fabricarse un contexto con CAE vacío. `BillState.fiscalDiagnostic` sólo debe existir cuando hay una señal fiscal que requiere explicación. Para `NON_FISCAL`, ambos pueden omitirse, conservando el comportamiento silencioso.

La página `/sales/[id]` debe renderizar un componente no accionable, preferentemente `CreditNoteEligibilityNotice`, cuando exista `fiscalDiagnostic`. Debe usar texto fijo seleccionado por `reason`, no interpolar CAE, JSON, secretos ni mensajes de excepción. El aviso debe indicar que no se puede ofrecer la Nota de Crédito desde esa venta y, cuando corresponda, sugerir revisar los datos fiscales; no debe ofrecer un botón de reintento ni llamar a la action. El botón actual conserva sus estados de revisión, pendiente y emisión para ventas elegibles.

## Contrato de normalización y mapeo

- `normalizeSaleFiscalMetadata` debe conservar su salida válida y su firma de consumo existente, o introducir un helper diagnóstico sin romper los consumidores. La action debe usar el resultado validado, nunca un diagnóstico para emitir.
- El mapper debe calcular una sola vez el resultado fiscal y reutilizarlo para `fiscalContext`, `originalVoucher`, `eligibleForFullCreditNote` y `fiscalDiagnostic`; no debe duplicar reglas en la página.
- La elegibilidad es `true` sólo si metadata es `VALID`, no hay devolución autorizada y la venta tiene total positivo y detalle/productos suficiente para la reversión completa. Una devolución pendiente se representa en el contexto y mantiene el aviso de pendiente existente.
- `createCreditNoteAction` debe repetir la normalización con datos leídos de Prisma, dentro del tenant autenticado. Si falla debe devolver `NOT_ELIGIBLE` con mensaje seguro, aunque el navegador haya recibido un diagnóstico o contexto anterior.
- El DTO enviado al componente cliente sólo contiene `orderId`, tipo fiscal, números, total, productos mínimos, estado de devolución, booleano de elegibilidad y diagnóstico. Nunca contiene `Order.CAE` crudo, `qrData`, certificado, token, clave privada o configuración AFIP.

## Logging seguro

Debe existir un único evento de diagnóstico, preferentemente en el boundary servidor del mapper/action, con campos allowlisted:

```ts
{
  event: "credit_note_eligibility_diagnostic",
  orderId: string,
  businessId: string,
  status: "NON_FISCAL" | "INVALID_OR_INCOMPLETE" | "VALID",
  reason?: FiscalDiagnosticReason,
  source: "columns" | "historical_json" | "mixed" | "none",
  hasCaeSignal: boolean,
  hasValidCae: boolean,
  hasInvoiceNumber: boolean,
  hasPointOfSale: boolean,
  hasBillType: boolean,
  hasVoucherType: boolean,
}
```

No log, error, warning, telemetry attribute ni client prop puede contener CAE completo o parcial, hash reversible, `Order.CAE`, QR, URL de QR, certificados, API keys, tokens, cookies, headers o credenciales. Si se necesita correlación, usar `orderId`/`businessId` ya autorizados; no registrar el objeto de error completo. `NON_FISCAL` no debe generar `console.*` para evitar ruido. Logging debe ser server-only y no convertir un dato faltante en una excepción.

## Archivos afectados previstos

- `src/services/afip/credit-note.ts`: resultado discriminado, aliases históricos permitidos, validación estricta y reason codes.
- `src/actions/sales/history.ts`: consumir el resultado una vez; omitir el contexto falso y adjuntar diagnóstico seguro al `BillState`.
- `src/models/BillState.ts`: contrato opcional `fiscalDiagnostic` y tipos serializables.
- `src/components/Billing/CreditNoteButton.tsx`: mantener emisión sólo para contexto canónico/elegible; no reconstruir ni registrar fiscalidad.
- `src/components/Billing/CreditNoteEligibilityNotice.tsx` (nuevo): aviso no accionable y accesible.
- `src/app/(protected)/sales/[id]/page.tsx`: renderizar aviso sólo cuando el DTO indique fiscalidad presente pero no elegible.
- `src/actions/sales/credit-note.ts`: conservar validación independiente y mensajes `NOT_ELIGIBLE`; adoptar el helper sin filtrar datos.
- `src/__tests__` y/o `ai/features/credit-note-eligibility-diagnostics/`: pruebas especificadas abajo.
- `prisma/schema.prisma`: sin cambios ni migración esperada.

## Criterios de aceptación

- **AC-01:** Una venta sin CAE, con CAE nulo/vacío o sólo placeholder produce `NON_FISCAL`, no `fiscalDiagnostic`, no aviso, no consola y no control de Nota de Crédito.
- **AC-02:** Una venta con CAE no vacío pero inválido/incompleto produce `INVALID_OR_INCOMPLETE` con un reason code estable, no `fiscalContext` accionable, un aviso no accionable y nunca permite llamar a la action desde la UI.
- **AC-03:** Una venta histórica con JSON serializado, aliases documentados y CAE de 14 dígitos más número/punto positivos se normaliza igual que una venta con columnas actuales y muestra el control.
- **AC-04:** CAE alfanumérico, CAE de longitud distinta, QR/URL, número o punto no entero positivo y conflictos tipo/código son rechazados; ninguna relajación de la regex permite emitir.
- **AC-05:** Si columnas y JSON difieren, el caso es diagnosticado como conflicto y no se elige silenciosamente un valor. El mismo criterio es aplicado por el mapper y la Server Action.
- **AC-06:** Una venta válida con devolución autorizada o detalle insuficiente muestra explicación no accionable; una venta válida con devolución pendiente conserva el estado pendiente actual.
- **AC-07:** La action vuelve a consultar la venta y rechaza un payload manipulado o un dato fiscal que dejó de ser válido, con `NOT_ELIGIBLE` y sin llamar a AFIP.
- **AC-08:** Los logs de diagnóstico sólo contienen los campos allowlisted; pruebas de espía demuestran que nunca aparece el CAE completo/parcial, JSON CAE, QR, secreto, token, key o credencial.
- **AC-09:** La renderización de `/sales/[id]` no ejecuta `auth`, headers ni cookies desde el componente cliente o helpers diferidos; el DTO es serializable y no incluye objetos Prisma.
- **AC-10:** No hay migración ni dependencia nueva; se mantienen impresión, historial, ventas no fiscales y devoluciones manuales.

## Estrategia de pruebas para QA (no implementar en esta entrega)

1. **Normalizador:** ausencia, placeholders, JSON string/object, aliases permitidos, espacios, CAE de 14 dígitos, número seguro/string, ceros iniciales, valores inválidos y conflictos.
2. **Mapper:** `NON_FISCAL` silencioso, diagnóstico por cada reason code, contexto canónico válido, devolución pendiente/autorizada y productos incompletos.
3. **Componente/página:** aviso visible sólo con diagnóstico, texto fijo sin datos sensibles, botón ausente para no elegibles y control intacto para elegibles.
4. **Action:** revalidación server-side, tenant, rechazo sin llamada AFIP y regresión de idempotencia/estado pendiente.
5. **Logging:** spy de logger/console que inspeccione argumentos y pruebe ausencia de CAE, QR y secretos, incluidos valores truncados o serializados.
6. **Regresión:** suite existente, `npm run lint`, `npx tsc --noEmit` y render/build de la ruta con Next 16 instalado.

## Restricciones de implementación

- No mostrar el botón para “cualquier cosa que contenga CAE”.
- No usar el aviso como autorización ni confiar en un booleano enviado por el navegador.
- No loguear valores sensibles para facilitar el diagnóstico; los reason codes y flags booleanos son suficientes.
- No usar `any`, no propagar el JSON fiscal completo y no añadir una migración para un diagnóstico derivable.
