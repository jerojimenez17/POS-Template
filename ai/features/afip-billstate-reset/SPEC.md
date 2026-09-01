# SPEC: Reset seguro de `BillState` después de Factura AFIP

## 1. Objetivo

Corregir el arrastre del checkout anterior en la pantalla de nueva venta cuando
se genera una Factura AFIP. El reset debe ejecutarse una sola vez por operación
exitosa, no debe reinyectar el estado anterior mediante `setState`, y no debe
limpiar una venta nueva iniciada mientras se imprime.

La solución debe conservar la impresión térmica/PDF y los flujos de Remito,
A cuenta y Presupuesto.

## 2. Hallazgos del código actual

- `src/app/(protected)/newBill/page.tsx` monta un único `BillProvider` alrededor
  de `BillParametersForm` y `ProductsTable`.
- `BillButtonsDefault` crea la factura mediante `createSale(true, false)`.
  Después de recibir un CAE, llama a `handlePrint` y programa un `setTimeout`
  de 5 segundos que despacha `removeAll` y ejecuta `onOrderResetRef.current()`.
- El mismo patrón de timer existe en Remito y Presupuesto; A cuenta limpia en
  línea y no imprime.
- `BillParametersForm` registra `onOrderResetRef`. Su callback hace
  `form.reset`, pero después despacha `setState({ ...BillState, ptoVenta,
  billType })`. Ese `BillState` puede ser el snapshot renderizado antes del
  reset y vuelve a introducir productos, importes, cliente, descuentos o CAE.
- `BillReducer.removeAll` ya acepta `defaultBillType`, pero solo resetea una
  parte de los campos de `BillState`; además conserva campos opcionales que
  pueden pertenecer a la venta anterior (`client`, `clientId`, datos de cliente,
  `twoMethods`, `seller`, etc.).
- `PrintableTable` imprime de forma asíncrona al cambiar `printTrigger` y
  actualmente lee el estado del contexto. Limpiar el contexto antes de que el
  efecto de impresión capture los datos puede romper la impresión.
- `BillProvider` ya conoce el tipo predeterminado de negocio mediante
  `effectiveInitialBillType`, por lo que el reset no debe volver a hardcodear
  `Factura C`.
- El botón `Confirmar` de Factura ejecuta `createSale(true, false)` de forma
  asíncrona, pero `blockButton` no constituye actualmente un lock de
  reentrada: se actualiza con `setState` (por lo tanto no protege dos eventos
  síncronos antes del siguiente render), el botón no se deshabilita usando ese
  valor y `handleCreateVoucher` lo vuelve a poner en `false` antes de que
  termine el guardado. No hay una comprobación atómica al entrar al handler.
- Cada invocación de `createSale` llama una sola vez a
  `processSaleAction`, a través de `handleSaveSale`; la duplicación real de
  persistencia, si ocurre, proviene de dos o más invocaciones concurrentes de
  `createSale`, no de una segunda llamada interna dentro de la misma
  invocación.
- El `setTimeout` de reset tardío puede producir arrastre visual o borrar una
  venta nueva si el token/revisión no la invalida. Ese efecto no equivale por
  sí mismo a duplicar registros en la base de datos: la duplicación real debe
  distinguirse verificando las invocaciones de AFIP y de
  `processSaleAction`.

## 3. Alcance

### Incluido

1. Sustituir el reset retrasado no protegido por un mecanismo de reset asociado
   a la operación de checkout que no pueda afectar una operación posterior.
2. Separar el snapshot inmutable usado para imprimir del estado vivo del
   contexto, de modo que el estado pueda limpiarse sin perder el documento.
3. Hacer que el callback de formulario solo resetee la UI del formulario y sus
   referencias de configuración; nunca debe reconstruir `BillState` con un
   snapshot capturado.
4. Completar el contrato de `removeAll` para limpiar todos los datos de la
   venta, conservando únicamente los defaults de una nueva venta, en especial
   `defaultBillType` y el punto de venta configurado cuando corresponda.
5. Mantener sin cambios funcionales la creación, impresión y persistencia de
   Factura, Remito, Presupuesto y A cuenta.
6. Agregar una protección de idempotencia/reentrada exclusivamente en el
   cliente para los handlers de confirmación. Mientras una confirmación está
   pendiente debe existir como máximo un checkout AFIP/remito en curso; al
   finalizar (éxito o fallo recuperable) el lock debe liberarse para permitir
   una venta posterior o un reintento.

### Fuera de alcance

- Cambios en acciones AFIP, acciones de ventas, Prisma, migraciones o esquema
  de base de datos.
- Cambios en el contrato de AFIP, numeración, CAE o validaciones de AFIP.
- Cambios en la plantilla visual o en el formato térmico/PDF, salvo el paso de
  un snapshot explícito necesario para imprimir.
- Cambios al flujo de edición de ventas (`isEditing`/`orderId`).
- Bloquear al usuario durante 5 segundos o introducir una nueva dependencia.
- Idempotencia durable entre pestañas, recargas, pérdida de respuesta después
  de un efecto remoto o múltiples dispositivos; esa garantía requeriría
  cambios de servidor/AFIP y está expresamente fuera de alcance.

## 4. Diseño propuesto

### 4.1. Snapshot de impresión

`ProductsTable`/`PrintableTable` debe recibir un trabajo de impresión que
contenga, como mínimo, un `BillState` serializable capturado antes del reset,
el `CAE` efectivo y la ventana destino. El snapshot debe incluir el tipo del
documento que se va a imprimir; por ejemplo, Presupuesto no debe depender de
que un dispatch posterior haya terminado.

Contrato conceptual (los nombres concretos pueden adaptarse a las
convenciones existentes):

```ts
interface PrintJob {
  state: BillState;
  cae?: CAE;
  targetWindow?: Window | null;
  sequence: number;
}
```

El `printTrigger` debe identificar cada trabajo. `PrintableTable` debe imprimir
el `PrintJob.state`/`PrintJob.cae`, no el `BillState` vivo después del reset.
Los trabajos viejos no deben volver a imprimirse si llega un trigger posterior.

### 4.2. Reset protegido por operación

Se recomienda centralizar en `BillProvider` una operación de reset de checkout
(por ejemplo `resetOrder` o `completeCheckout`) que:

- capture/reciba un identificador de operación o revisión del checkout;
- invalide/cancele cualquier reset pendiente anterior;
- solo aplique `removeAll` si la revisión sigue correspondiendo a la venta que
  terminó;
- sea segura al desmontar el provider;
- no dependa de un cierre (`closure`) obsoleto de `BillButtons`.

La implementación preferida es limpiar el estado inmediatamente después de
encolar el snapshot de impresión, eliminando el timer de 5 segundos. Si por
compatibilidad se conserva una espera para la impresora, debe existir una
revisión/token de checkout: al detectarse cualquier acción de una nueva venta,
el callback pendiente se cancela o se convierte en no-op. Un `setTimeout` sin
token no cumple esta especificación.

El reset debe ejecutarse después de una creación/guardado exitoso y después de
que exista un `PrintJob`; no debe ejecutarse cuando AFIP rechaza, no devuelve un
CAE válido, falla el guardado, el usuario cancela o la venta tiene un error.

### 4.3. Protección de confirmación en `BillButtons`

La protección debe usar un `useRef` como lock síncrono de la operación, además
del estado visual `blockButton`. El handler de cada confirmación debe intentar
adquirir el lock antes de abrir la ventana, cambiar modales o llamar a
`createSale`; si ya está adquirido, debe devolver sin ejecutar ninguna acción.
El ref es necesario porque dos eventos pueden entrar antes de que React
procese el `setState` de `blockButton`. El estado visual puede reflejar el lock,
pero no reemplazarlo.

El lock debe cubrir toda la operación pendiente: en Factura, desde antes de
`createSale(true, false)` hasta la resolución del guardado y la creación del
`PrintJob`/programación del reset; en Remito, la ruta equivalente. Un resultado
exitoso libera el lock al terminar esa operación, sin esperar un delay
arbitrario de impresión. Un rechazo AFIP, CAE inválido, fallo de guardado,
excepción o pérdida de conexión libera el lock sin resetear, de modo que el
usuario pueda reintentar. Cancelar el modal antes de confirmar nunca adquiere
el lock ni inicia AFIP o persistencia.

La protección debe ser por instancia/checkout de `BillButtons`, no un lock
global permanente: no debe bloquear una venta posterior luego de finalizar la
operación. Todo callback de reset o impresión seguirá protegido por la
revisión/token descrita en 4.2. La solución no agrega parámetros a las Server
Actions ni modifica Prisma; por ello la garantía es de no reentrada del
cliente mientras la confirmación está pendiente, no una idempotencia durable
del servidor.

### 4.4. Callback de `BillParametersForm`

El callback registrado en `onOrderResetRef` debe:

- llamar a `form.reset` con los valores iniciales del nuevo checkout;
- restablecer `editParamters` y actualizar `billTypeRef` al default;
- conservar el punto de venta inicial configurado para el formulario;
- no despachar `setState` con `...BillState`;
- no reintroducir productos, totales, cliente, descuentos, medios de pago,
  documentos ni CAE.

El estado global debe ser limpiado por el reducer/provider, no por un efecto de
sincronización que mezcle el estado anterior con defaults.

### 4.5. Contrato de `removeAll`

`removeAll` debe aceptar el default de tipo de comprobante resuelto por el
provider (`Factura A`, `Factura B` o `Factura C`) y producir un estado nuevo con
estas invariantes:

- `products = []`.
- `total = 0`, `totalWithDiscount = 0`, `discount = 0`.
- `CAE` vacío (`CAE`, número, vencimiento y QR).
- `documentNumber = 0`, `typeDocument = ""`, `nroAsociado = 0` y `entrega = 0`.
- `client`, `clientId`, `clientIvaCondition` y `clientDocumentNumber` ausentes
  o vacíos.
- `pago = false`, `twoMethods = false`, `totalSecondMethod = 0`/`null` y
  `paidMethod = "Efectivo"`.
- `id` y los datos propios de la venta anterior no se conservan.
- `billType = defaultBillType`; si no se entrega, el provider usa su
  `effectiveInitialBillType` (fallback `Factura B` en el contexto aislado).
- `ptoVenta` conserva únicamente el punto de venta default/configurado para la
  nueva venta, nunca uno proveniente de un snapshot de la venta terminada.
- `date` se renueva para la nueva venta.

El `seller` puede conservarse solo si el producto lo considera configuración de
sesión; no puede conservarse como parte accidental del snapshot. La decisión
debe quedar explícita en la implementación y en sus pruebas; la opción
preferida para un checkout limpio es `seller = ""`, dado que los botones lo
vuelven a asignar al iniciar la operación.

## 5. Flujos que deben preservarse

- **Factura AFIP:** `createSale(true, false)` → CAE válido → snapshot de
  impresión → guardado exitoso → reset seguro. Con error o CAE inválido no se
  limpia la venta.
- **Remito:** `createSale(false, false)` mantiene impresión y reset seguro; no
  se agrega invocación AFIP.
- **Presupuesto:** conserva `billType = "Presupuesto"` solo en el snapshot y
  mantiene su impresión y limpieza posterior; el siguiente checkout usa el
  `defaultBillType` del negocio.
- **A cuenta:** mantiene su modal, guardado y reset sin impresión.
- **Edición:** el flujo de actualización no debe activar el reset de nueva
  venta ni alterar la redirección existente.
- **Cancelación:** cancelar cualquier modal no guarda, no imprime y no limpia.

## 6. Criterios de aceptación verificables

- [ ] **AC1:** Tras una Factura AFIP exitosa con al menos un producto, el
  `BillState` global queda en un checkout vacío en como máximo un ciclo de
  actualización posterior a la confirmación; `products`, ambos totales,
  descuento, cliente, medios de pago, documento y CAE no contienen valores de
  la venta terminada.
- [ ] **AC2:** El formulario visible queda con sus valores iniciales, pero su
  callback `onOrderResetRef.current()` no despacha `setState` y no puede
  reinyectar el `BillState` previo.
- [ ] **AC3:** En una venta con default `Factura B`, `removeAll` deja
  `billType === "Factura B"`; con default `Factura C`, deja
  `billType === "Factura C"`. Nunca usa el tipo de la venta anterior.
- [ ] **AC4:** `removeAll` limpia todos los campos enumerados en la sección 4.5,
  incluyendo CAE, cliente, pago dividido, documento, entrega, descuento e
  identificador de venta; el punto de venta queda únicamente en su default.
- [ ] **AC5:** La impresión de Factura AFIP contiene los productos, totales, tipo,
  punto de venta, número y CAE capturados antes del reset, tanto en modo
  térmico como PDF. La limpieza global no cambia el contenido del documento.
- [ ] **AC6:** Si se agrega un producto o se inicia una nueva venta antes de que
  finalice la impresión, ningún callback pendiente de la venta anterior borra
  productos, totales, cliente, CAE o tipo de la nueva venta. Este escenario no
  puede depender de esperar exactamente 5 segundos.
- [ ] **AC7:** Existe como máximo un reset pendiente por trabajo de checkout y
  se cancela/invalida al completar, reemplazar o desmontar el provider; no hay
  timers huérfanos que ejecuten `removeAll` sobre una venta posterior.
- [ ] **AC8:** Ante rechazo AFIP, CAE ausente/inválido, fallo de guardado,
  pérdida de conexión o excepción de creación, la venta permanece disponible y
  no se invoca el reset exitoso.
- [ ] **AC9:** Remito continúa usando la ruta no AFIP, imprime sus datos y luego
  limpia de forma segura; no se modifica su título ni modal.
- [ ] **AC10:** Presupuesto continúa imprimiendo el documento correcto y luego
  inicia el nuevo checkout con el default de negocio, no con `Presupuesto`.
- [ ] **AC11:** A cuenta continúa abriendo el selector de cliente, guardando y
  limpiando una sola vez; no se agrega impresión ni AFIP.
- [ ] **AC12:** Cancelar Factura, Remito, Presupuesto o A cuenta no invoca
  `removeAll`, no crea registros y no imprime.
- [ ] **AC13:** La suite existente de reducer, formulario, impresión, botones,
  shortcuts y flujos de venta sigue pasando; no se requieren cambios en Prisma
  ni en Server Actions.
- [ ] **AC14:** `npx tsc --noEmit` y `npm run lint` terminan sin errores nuevos
  relacionados con la solución.
- [ ] **AC15 — doble clic:** dos clics sobre `Confirmar` de Factura o Remito,
  incluidos clics síncronos antes del siguiente render, producen una sola
  operación de checkout; el segundo handler no abre otra ventana ni ejecuta
  AFIP, `createSale` o persistencia.
- [ ] **AC16 — reentrada:** mientras la primera confirmación está pendiente,
  cualquier reentrada por teclado, evento duplicado o activación programática
  es un no-op. `blockButton` puede representar el estado visual, pero el lock
  de `useRef` es la protección efectiva.
- [ ] **AC17 — AFIP una sola vez:** una confirmación de Factura exitosa llama a
  `createAfipVoucherAction` como máximo una vez y solo continúa al guardado
  cuando recibe un CAE válido.
- [ ] **AC18 — persistencia una sola vez:** una confirmación que llega al
  guardado invoca `processSaleAction` exactamente una vez; `createSale` no
  debe duplicar esa llamada internamente. El doble clic tampoco puede generar
  una segunda persistencia.
- [ ] **AC19 — fallos y reintento:** rechazo AFIP, CAE ausente/inválido, fallo
  de `processSaleAction`, pérdida de conexión o excepción libera el lock,
  conserva la venta visible y permite un nuevo intento explícito. Ninguno de
  esos caminos invoca el reset exitoso. La especificación no exige resolver
  duplicados producidos por un efecto remoto cuyo resultado se perdió.
- [ ] **AC20 — cancelación:** cancelar Factura o Remito, cerrar el modal antes
  de confirmar o cancelar una operación no adquiere el lock ni llama a AFIP,
  `createSale`, `processSaleAction`, `removeAll` o impresión.
- [ ] **AC21 — finalización y compatibilidad:** tras éxito el lock se libera al
  finalizar el checkout y crear el `PrintJob`/reset seguro, sin esperar cinco
  segundos; una venta posterior puede confirmarse. Remito, Presupuesto, A
  cuenta, edición, shortcuts, impresión térmica/PDF y sus acciones existentes
  conservan su comportamiento y no reciben llamadas AFIP/persistencia extra.

## 7. Interfaces y acciones afectadas

### Cambios previstos

- `src/context/billActions.ts`: precisar el payload/metadata de `removeAll`
  (default de tipo y, si se necesita, punto de venta); no agregar datos de
  servidor.
- `src/context/BillReducer.ts`: implementar el reset completo y determinista
  descrito en 4.5.
- `src/context/BillContext.tsx`: exponer la operación/token de reset seguro y,
  si se elige ese diseño, el contrato de `PrintJob`.
- `src/context/BillProvider.tsx`: mantener el default de negocio, controlar la
  revisión/cancelación del reset y evitar closures obsoletos.
- `src/components/Billing/BillParametersForm.tsx`: eliminar la reconstrucción
  con `...BillState` dentro de `onOrderResetRef`.
- `src/components/Billing/BillButtons.tsx`: crear el snapshot antes de limpiar,
  usar la operación de reset seguro y eliminar los timers sin protección en
  Factura, Remito y Presupuesto; agregar el lock síncrono de reentrada para las
  confirmaciones sin cambiar las Server Actions.
- `src/components/Billing/ProductsTable.tsx` y
  `src/components/Billing/PrintableTable.tsx`: transportar y consumir el
  snapshot de impresión sin leer estado vivo después del reset.

### Sin cambios previstos

- `src/actions/afip.ts`, `src/actions/sales.ts`, `src/actions/budget.ts` y
  `src/actions/voucher.ts`.
- `prisma/schema.prisma`, migraciones y modelos persistidos.
- `src/app/(protected)/newBill/page.tsx`, salvo ajustes de props si el contrato
  del provider requiere un wiring explícito; la página debe seguir montando un
  único `BillProvider`.

## 8. Estructura de archivos

```text
ai/features/afip-billstate-reset/SPEC.md
src/context/billActions.ts
src/context/BillReducer.ts
src/context/BillContext.tsx
src/context/BillProvider.tsx
src/components/Billing/BillButtons.tsx
src/components/Billing/BillParametersForm.tsx
src/components/Billing/ProductsTable.tsx
src/components/Billing/PrintableTable.tsx
src/__tests__/context/BillReducer-removeAll-default.test.ts
src/__tests__/components/BillParametersForm-default-type.test.tsx
tests/components/BillButtons.test.tsx
tests/components/BillButtons.shortcuts.test.tsx
```

No implementar en esta fase un archivo de tests ni una acción de servidor
nueva.

## 9. Estrategia de pruebas TDD

QA debe escribir primero pruebas deterministas con Vitest y Testing Library;
los timers, si permanecen temporalmente, deben controlarse con fake timers y
las promesas de impresión deben resolverse explícitamente.

1. **Reducer:** probar el estado completo antes/después de `removeAll`, defaults
  B/C/A, punto de venta, CAE y ausencia de campos opcionales de cliente/pago.
2. **Formulario:** invocar el callback de `onOrderResetRef`, verificar
   `form.reset`, defaults y que no haya `setState` con productos/totales/CAE.
3. **Provider/reset:** probar que una operación exitosa limpia una vez, que una
   segunda venta invalida el reset anterior y que desmontar cancela callbacks.
4. **Impresión:** montar `ProductsTable`/`PrintableTable`, disparar un trabajo
   con CAE y verificar que el renderer recibe el snapshot original aunque el
   contexto ya esté vacío.
  5. **BillButtons:** cubrir éxito/error AFIP, fallo de guardado, doble clic,
    reentrada, una llamada AFIP y una llamada a `processSaleAction` por
    confirmación, reintento tras fallo, cancelación, Factura, Remito,
    Presupuesto y A cuenta; verificar que cada flujo conserva su acción,
    impresión y número de resets.
6. **Regresión:** ejecutar shortcuts, componentes existentes, `npm run lint` y
   `npx tsc --noEmit`; confirmar que no hay llamadas nuevas a Prisma ni a
   Server Actions.

## 10. Decisiones y riesgos

- El reset inmediato con snapshot es preferible a un delay arbitrario: reduce
  la ventana de carrera y desacopla la impresión del estado mutable.
- Si una limitación de la impresora obliga a conservar el delay, el token de
  operación y la cancelación son obligatorios; comparar solo `BillState` por
  referencia o cerrar sobre `BillState` no es suficiente.
- El reset debe ser idempotente para dobles eventos de confirmación y el lock
  de reentrada debe impedir que el guardado AFIP se repita mientras la
  operación está pendiente; `blockButton` queda como indicador visual, no como
  garantía de exclusión.
- No se deben introducir secretos, persistencia adicional ni cambios de
  esquema.
