# SPEC — Sincronización del tipo inicial de factura

## Estado y alcance

- **Estado:** especificación arquitectónica; no incluye implementación ni pruebas.
- **Ruta:** `src/app/(protected)/newBill/page.tsx`.
- **Objetivo:** que el tipo mostrado inicialmente, el `BillContext` y todos los payloads de alta/ARCA usen exactamente el mismo tipo, desde el primer envío.

## 1. Hallazgo y causa raíz

El valor inicial se calcula en el Server Component (`newBill/page.tsx`) mediante `getDefaultBillType` y se entrega tanto a `BillProvider` como a `BillParametersForm`. Sin embargo, el flujo tiene varias fuentes de verdad y sincronizaciones posteriores:

1. `BillProvider` tiene un fallback interno distinto (`"Remito"`), mientras que la página usa `Factura C`/el valor de negocio.
2. `BillParametersForm` crea un `useForm` cuyo `defaultValues` sólo se aplican durante la primera inicialización; además vuelve a consultar `getBusinessBillingInfoAction()` en cliente y corrige valores mediante efectos.
3. El `BillContext` se actualiza en un efecto basado en `watchBillType`, no como una operación atómica con la construcción del envío. El primer render/primer evento puede observar un valor distinto del formulario corregido.
4. El alta de la factura (`BillButtons`) envía directamente el snapshot `BillState` a `createAfipVoucherAction`; el envío no recibe explícitamente el valor que la UI muestra.
5. Existe un input oculto de compatibilidad cuyo `value` es siempre `Factura C` cuando la UI muestra `Factura B`. No es una fuente válida de estado y puede hacer que integraciones, serializaciones o futuras modificaciones vuelvan a introducir el valor incorrecto.

Por tanto, el defecto es una carrera/duplicación de fuentes entre el valor SSR inicial, `useForm`, efectos de sincronización y el snapshot usado por el botón de confirmar; no es un problema de Prisma ni de la consulta del último comprobante. Cambiar el selector fuerza una actualización del formulario y del reducer, ocultando el defecto.

## 2. Requisitos funcionales

### RF-1 — Una única identidad inicial

- `newBill/page.tsx` debe calcular una sola vez el tipo inicial efectivo por solicitud.
- El valor debe ser una etiqueta canónica soportada: `Factura A`, `Factura B` o `Factura C`; ante ausencia/error se usa `Factura C`.
- Ese valor debe ser entregado al proveedor y al formulario; el formulario no debe volver a decidir otro default desde una consulta duplicada.

### RF-2 — Estado listo antes de interactuar

- En el primer render hidratado, `BillContext.BillState.billType` debe ser igual a `initialBillType`.
- La UI compacta y el selector deben mostrar el mismo valor.
- No se debe depender de un `useEffect` posterior para que el primer envío sea correcto.
- El fallback interno del proveedor no debe ser `Remito` para una factura nueva.

### RF-3 — Sincronización explícita del formulario

- El selector debe ser controlado por el contrato del formulario y sincronizar el cambio con el contexto en el mismo flujo de cambio.
- `defaultValues` no debe depender de `BillState` mutable ni de datos asíncronos duplicados.
- El reset posterior a una venta debe usar el default recibido por la página/proveedor y dejar formulario y contexto iguales.
- Debe eliminarse o neutralizarse el control oculto que contiene `Factura C`; no puede existir una segunda representación contradictoria.

### RF-4 — Payload autoritativo

- Antes de llamar a `createAfipVoucherAction` y `processSaleAction`, debe construirse un snapshot de checkout cuyo `billType` sea el valor canónico actualmente seleccionado.
- La misma identidad debe viajar al cálculo/consulta de comprobante, al payload ARCA y al payload de persistencia.
- Si el contexto y el formulario difieren, el flujo debe resolverlo determinísticamente (preferentemente el valor controlado por el selector) o bloquear el envío con un error visible; nunca enviar silenciosamente el fallback.
- El cambio manual A/B/C debe mantenerse en el primer envío, sin requerir cambiar a otra opción y volver.

### RF-5 — Compatibilidad

- Remito, Presupuesto, edición de ventas y `BillingModal` no deben cambiar su comportamiento fuera del alcance, salvo que compartan el helper explícito de snapshot.
- No se deben modificar secretos, credenciales ARCA, URLs ni el esquema Prisma: este defecto no requiere migración.

## 3. Interfaces y datos relevantes

### 3.1 Contrato recomendado de tipo

```typescript
type BillType = "Factura A" | "Factura B" | "Factura C" | "Remito" | "Presupuesto";

interface BillTypeSyncInput {
  initialBillType: BillType;
}

interface BillCheckoutSnapshot {
  billType: BillType;
  // resto de BillState y productos mínimos según cada Server Action
}
```

Si se conserva `string` por compatibilidad, debe existir un normalizador/guard explícito y el valor no puede quedar `undefined`, `""` o `"Remito"` en el checkout de factura.

### 3.2 Contratos existentes que deben respetarse

- `BillProvider({ children, initialBillType, qzTrayEnabled })` inicializa `BillState.billType`.
- `BillState.billType?: string` es consumido por `BillButtons`, `createAfipVoucherAction`, impresión y acciones de venta.
- `BillAction` contiene `{ type: "billType"; payload: string }` y `setState` reemplaza el estado al guardar parámetros.
- `BillParametersSchema` contiene `billType: z.string()`.
- `getDefaultBillType(condicionIva)` es la fuente de la regla `RESPONSABLE_INSCRIPTO → Factura B`, resto/fallback → Factura C.

La implementación puede endurecer estos tipos, pero no debe romper llamadas existentes a las acciones.

## 4. Diseño recomendado

1. Mantener la resolución de negocio en `newBill/page.tsx` y pasar el resultado como prop única.
2. Inicializar el reducer directamente con esa prop y exponer, si resulta necesario, una acción/helper de `setBillType` que sea la única vía de actualización.
3. Inicializar `useForm` con el mismo valor recibido. El selector debe actualizar el formulario y el contexto sin esperar una consulta cliente.
4. Extraer una función pura de construcción/normalización de `BillCheckoutSnapshot`; `BillButtons` debe usarla inmediatamente antes de ambos envíos para evitar snapshots obsoletos de closures/render.
5. Mantener el mapeo de tipo a código AFIP ya existente (A=1, B=6, C=11) en una utilidad compartida, validando el tipo antes de consultar voucher o crear CAE.
6. Mantener `removeAll` parametrizado por el default efectivo para que el siguiente comprobante vuelva al mismo tipo inicial.

## 5. Archivos recomendados

### Cambios principales

- `src/app/(protected)/newBill/page.tsx`: resolver y propagar la identidad única.
- `src/context/BillProvider.tsx`: eliminar el default contradictorio y garantizar inicialización determinista.
- `src/context/BillContext.tsx` y `src/context/billActions.ts`: ajustar el contrato si se añade una operación explícita de sincronización.
- `src/models/BillState.ts` y `src/models/billType.ts`: centralizar/estrechar el tipo canónico sin romper compatibilidad.
- `src/components/Billing/BillParametersForm.tsx`: usar el default recibido, quitar la consulta duplicada y el input oculto contradictorio, y sincronizar selector/reset.
- `src/components/Billing/BillButtons.tsx`: construir el snapshot autoritativo antes de `createAfipVoucherAction` y `processSaleAction`.
- `src/utils/billing.ts`: centralizar normalización y mapeo de etiqueta a código ARCA.

### Revisión de regresión

- `src/actions/afip.ts`: verificar que conserva `billType` del snapshot enviado al servicio externo.
- `src/actions/sales/process.ts`: verificar que el contrato actual tolera el campo y no lo elimina.
- `src/components/Billing/PrintableTable.tsx`: comprobar impresión inicial y post-CAE.
- `src/components/Billing/BillingModal.tsx`: no mezclar esta inicialización con el flujo de venta nueva.
- `src/context/BillReducer.ts`: revisar `removeAll` y `setState`.

## 6. Criterios de aceptación medibles

- **CA-01:** Con negocio `RESPONSABLE_INSCRIPTO`, tras cargar `/newBill`, en el primer render interactivo `BillParametersForm`, `BillState.billType` y el selector muestran `Factura B`, sin esperar una consulta o cambio de selector.
- **CA-02:** Con negocio `MONOTRIBUTO` o condición ausente, los tres valores iniciales son `Factura C`.
- **CA-03:** En una prueba de primer checkout con tipo inicial B, la primera llamada a `createAfipVoucherAction` contiene `billType: "Factura B"`; no se permite una llamada previa con C, Remito, `undefined` o cadena vacía.
- **CA-04:** La primera llamada a `processSaleAction` del mismo checkout contiene exactamente el mismo `billType` que la llamada ARCA y que el selector.
- **CA-05:** Seleccionar A, B o C y confirmar sin volver a seleccionar produce un payload con el valor seleccionado en el 100% de los casos.
- **CA-06:** Cambiar el selector varias veces deja `form`, `BillContext` y payload final en el último valor seleccionado; no hay divergencia después de un rerender.
- **CA-07:** Después de `removeAll`/reset, formulario, resumen y contexto vuelven al default inicial de la página; el valor no vuelve a `Remito` ni queda en el tipo anterior.
- **CA-08:** El primer `getVoucherNumberAction` recibe el código correspondiente al tipo inicial: A=1, B=6, C=11.
- **CA-09:** Los flujos Remito, Presupuesto, edición y `BillingModal` conservan sus tipos y no reciben el snapshot de factura por error.
- **CA-10:** `npm run lint` y `npm run build` pasan; no se agregan dependencias ni cambios de esquema.

## 7. Escenarios de regresión

1. Responsable Inscripto, carga limpia, producto, Facturar, confirmar inmediatamente.
2. Monotributo, carga limpia, primer envío como C.
3. Selección inicial B → A → confirmar; selección inicial B → C → confirmar.
4. El formulario se abre/cierra y se confirma sin guardar manualmente los parámetros.
5. Rerender por agregar producto, cambiar precio, descuento o medio de pago antes de confirmar.
6. Error de `getBusinessBillingInfoAction` o negocio sin condición: fallback C consistente en UI, contexto y payload.
7. Venta completada y reset: el comprobante siguiente conserva el default de negocio.
8. Consulta de voucher para A/B/C y verificación de códigos 1/6/11.
9. Crear Remito y Presupuesto: no deben enviar tipo de factura ni alterar el default posterior.
10. Facturación de una venta existente desde `BillingModal`: debe conservar su contrato independiente.

## 8. Riesgos y decisiones

- **Riesgo:** conservar efectos de corrección asíncronos puede reintroducir carreras. La implementación debe eliminar la duplicación o hacerla sólo de validación, nunca de inicialización.
- **Riesgo:** `BillButtons` puede cerrar sobre un render anterior. El snapshot debe construirse desde una fuente actualizada en el handler o desde un ref sincronizado de forma comprobable.
- **Decisión:** no persistir nada nuevo en Prisma; `Order` no participa en la causa raíz del primer envío.
- **Decisión:** no usar la etiqueta del input oculto ni inferir el tipo desde CAE; el selector/contexto son la identidad de la operación.
