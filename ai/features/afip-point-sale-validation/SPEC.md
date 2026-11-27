# Validación de punto de venta para facturación AFIP/ARCA

## Estado y alcance

- **Estado:** especificación arquitectónica; no incluye implementación ni pruebas.
- **Alcance:** flujo de alta de factura en `src/app/(protected)/newBill/page.tsx` y flujo de facturación de ventas existentes (`BillingModal`), incluyendo Factura A, B y C.
- **Fuera de alcance:** alta automática de puntos de venta en AFIP, modificación de certificados, cambios de esquema Prisma o reintentos automáticos de emisión.

## Causa probable y diagnóstico

Hay dos problemas que deben separarse:

### 1. Bug de sincronización cliente (presente en el código actual)

1. `newBill/page.tsx` lee `Business.ptoVenta` y lo entrega a `BillParametersForm`; esa lista es solamente una configuración local de puntos disponibles, no prueba que AFIP los haya habilitado.
2. `BillParametersForm` inicializa su campo `ptoVenta` con el primer elemento y consulta `getVoucherNumberAction(ptoVenta, tipoFactura)` desde un `useEffect`.
3. Al cambiar el selector de punto de venta, el formulario sólo cambia su estado local (`field.onChange(Number(val))`); no actualiza `BillContext`.
4. El `dispatch({ type: "setState" })` que copia `ptoVenta` al `BillState` sólo sucede al guardar los parámetros. Por lo tanto, en el primer alta y mientras el formulario no se haya guardado, `BillState.ptoVenta` puede ser `undefined` aunque la pantalla muestre, por ejemplo, `001`.
5. `createSale` construye el checkout desde `BillState`; `createAfipVoucherAction` extrae `ptoVenta` y envía `arca.puntoVenta: Number(ptoVenta) || undefined`. El CAE puede llegar al Cloud Function sin el punto visible en pantalla.
6. Cambiar B → A/C → B vuelve a ejecutar la consulta de numeración, pero no corrige necesariamente el estado usado para crear el comprobante. Una respuesta de una consulta anterior también puede quedar visible si las solicitudes se resuelven fuera de orden.

Esto explica el comportamiento de “la primera vez” y debe corregirse, pero no permite concluir que el punto esté habilitado en AFIP.

### 2. Incompatibilidad real AFIP/ARCA (debe conservarse y hacerse explícita)

El error AFIP **11002** (“el punto de venta no se encuentra habilitado para el WS”) es una respuesta del WebService, no un error que deba traducirse a “no hay numeración”. Significa normalmente que el punto no está habilitado para el WebService correspondiente al CUIT, credencial y ambiente que usa la solicitud.

La lista `Business.ptoVenta` sólo es una allowlist de la aplicación. No existe en este repositorio una consulta local que confirme el alta en AFIP. Además:

- `generateCertsAction` distingue certificados DEV y PROD mediante funciones distintas.
- La emisión y `getLastVoucherAction` usan funciones Cloud separadas, pero el ambiente efectivo del SDK/WebService está fuera de este repositorio.
- No hay un campo persistido que relacione las credenciales guardadas con `homologación` o `producción`.
- El mismo punto debe verificarse para el CUIT y ambiente del certificado utilizado; cambiar A/B/C no habilita un punto de venta.

La implementación debe registrar de forma segura (sin certificado, key, token ni claves) el CUIT enmascarado, punto, código de comprobante y host/ambiente configurado, para que soporte pueda distinguir un payload incorrecto de una incompatibilidad real.

## Requisitos funcionales

### R1. Una sola identidad de comprobante

Usar siempre el par `{ ptoVenta, billType, tipoFactura }` derivado del mismo snapshot. Los códigos son inmutables:

| Tipo visible | Código WSFE |
|---|---:|
| Factura A | 1 |
| Factura B | 6 |
| Factura C | 11 |

No inferir el tipo desde el `BillState` antiguo ni desde una respuesta de numeración.

### R2. Sincronización de ptoVenta

- El punto seleccionado debe reflejarse inmediatamente en el estado que consumen `createSale`, `createBillCheckoutSnapshot` y `createAfipVoucherAction`.
- El valor enviado debe ser un entero positivo perteneciente a `ptoVentas`.
- El reset debe volver al primer punto configurado y conservar el tipo inicial actual (A/B/C según la lógica existente).
- La selección de tipo debe seguir actualizando `BillState`, `billTypeRef` y la consulta de numeración sin cambiar el comportamiento de remitos, presupuestos o A cuenta.

### R3. Preflight antes del CAE

Antes de invocar `createVoucher`, validar en servidor el punto y tipo con la operación de consulta de último comprobante (o una función común que la encapsule). Esta validación debe ser autoritativa y no depender sólo del navegador.

- Debe ejecutarse para A, B y C.
- Debe ejecutarse nuevamente en el intento de emitir, aunque el cliente haya mostrado un número válido anteriormente.
- Si el preflight falla, no se debe invocar `createVoucher` ni guardar una venta como facturada con un CAE vacío.
- La numeración mostrada debe quedar asociada al par que la generó; una respuesta obsoleta no puede reemplazar la del par actualmente seleccionado.

### R4. No ocultar 11002

Normalizar la respuesta de las Cloud Functions a un resultado tipado que conserve:

```ts
interface AfipPointSaleError {
  code: string;              // "11002" cuando corresponda
  message: string;           // mensaje original sanitizado
  operation: "getLastVoucher" | "createVoucher";
  ptoVenta: number;
  tipoFactura: 1 | 6 | 11;
  environment?: "homologacion" | "produccion" | "desconocido";
}
```

El parser debe detectar el código aunque venga en `error`, `details`, respuesta envuelta o texto de Axios/HTTP. No debe convertirlo en un genérico “Error al obtener comprobante”. El mensaje original debe permanecer disponible para logs de soporte, sin exponer secretos.

### R5. Mensaje accionable

Para 11002, la interfaz debe informar, como mínimo:

> AFIP/ARCA rechazó el punto de venta `NNN` para el WebService de este CUIT y ambiente (código 11002). Verifique en ARCA que esté habilitado para WSFE/WSFEv1, que corresponda al CUIT y al ambiente del certificado (`homologación` o `producción`). Luego actualice la configuración o seleccione otro punto habilitado. No se generó CAE.

El mensaje debe identificar el punto y tipo seleccionados, ofrecer una acción visible para revisar configuración/volver a editar parámetros y no sugerir que cambiar A/B/C “soluciona” el alta. Los errores de credenciales, red, HTTP 5xx y validación de datos deben conservar mensajes diferenciados.

### R6. Seguridad y configuración

- Autenticar y autorizar todas las Server Actions.
- Validar con Zod en servidor `ptoVenta` y tipo/código permitido.
- Mantener `cert`, `key`, `AFIP_SDK_ACCESS_TOKEN` e `INTERNAL_AFIP_API_KEY` exclusivamente en servidor; nunca incluirlos en mensajes o logs.
- Hacer explícito el ambiente efectivo en la configuración de emisión o en la respuesta de la Cloud Function. Si no puede determinarse, mostrar “ambiente desconocido” y bloquear la emisión ante 11002.
- La configuración administrativa debe advertir que guardar un número en `ptoVenta` no lo registra en AFIP.

## Interfaces recomendadas

Se recomienda centralizar la lógica en `src/services/afip/point-sale-validation.ts` y exponer contratos serializables:

```ts
type AfipVoucherType = 1 | 6 | 11;

interface AfipPointSaleRequest {
  ptoVenta: number;
  tipoFactura: AfipVoucherType;
}

interface AfipPointSaleValidation {
  valid: boolean;
  ptoVenta: number;
  tipoFactura: AfipVoucherType;
  lastVoucherNumber?: number;
  error?: AfipPointSaleError;
}
```

`getVoucherNumberAction` debe mantener compatibilidad para sus consumidores actuales (`{ success?: number; error?: string }`) o migrarlos todos al contrato enriquecido en un cambio coordinado. `createAfipVoucherAction` debe recibir/derivar el mismo `AfipPointSaleRequest`, repetir la validación autoritativa y devolver `error.code === "11002"` cuando corresponda.

## Archivos recomendados

- `src/app/(protected)/newBill/page.tsx`: seguir pasando los puntos y el tipo inicial desde servidor; no duplicar consultas de negocio en cliente.
- `src/components/Billing/BillParametersForm.tsx`: sincronizar punto y tipo con el contexto, controlar solicitudes obsoletas y mostrar estado de preflight por selección.
- `src/components/Billing/BillButtons.tsx`: usar el snapshot validado; abortar el guardado si no hay CAE/preflight válido y presentar el error 11002 accionable.
- `src/components/Billing/BillingModal.tsx`: aplicar la misma validación al re-facturar una venta existente y usar el punto del comprobante, sin perder A/B/C.
- `src/actions/voucher.ts`: validar entrada, parsear código AFIP y retornar metadatos de operación/punto/tipo.
- `src/actions/afip.ts`: validación server-side justo antes de `createVoucher`, normalización de errores y garantía de que `puntoVenta` no sea omitido silenciosamente.
- `src/utils/billing.ts`: reutilizar `getArcaBillTypeCode`/`normalizeBillType` como única fuente de mapeo.
- `src/schemas/index.ts`: agregar schemas de request de punto/tipo si no se ubican en un módulo AFIP dedicado.
- `src/components/Superadmin/arca-form.tsx` y `src/app/admin/settings/page.tsx`: rotular la lista como configuración local y mostrar ambiente/estado de credenciales sin revelar secretos.
- `src/models/AFIPResponse.ts`: ampliar tipos para errores AFIP estructurados, evitando `any`.

No se requiere cambio en `prisma/schema.prisma` para la corrección mínima. Si se decide persistir el ambiente, debe ser una decisión separada con migración y validación de compatibilidad.

## Plan de pruebas (a crear por QA; esta entrega no las implementa)

1. **Unidad:** mapeo A→1, B→6, C→11; rechazo de punto cero, negativo, decimal y no configurado.
2. **Componente:** al seleccionar otro punto, el snapshot de emisión cambia sin guardar parámetros; al cambiar A/B/C, tipo visible, contexto y código permanecen alineados.
3. **Concurrencia:** respuestas de `getLastVoucher` fuera de orden no sobrescriben el estado del par actual.
4. **Acción voucher:** parseo de 11002 en respuesta directa, envuelta, `details` y Axios; conservación del código y contexto.
5. **Acción emisión:** preflight válido permite una sola creación; preflight 11002 no llama `createVoucher`; ningún error de AFIP guarda CAE vacío.
6. **UI:** 11002 muestra punto, tipo, código, ambiente/advertencia y pasos de ARCA; red, credenciales y otros códigos muestran mensajes distintos.
7. **Regresión:** Factura A/B/C, tipo inicial B/C según IVA, reset, remito, presupuesto, A cuenta, venta existente y modo edición.
8. **Integración/configuración:** verificar que certificados DEV se prueben sólo contra homologación y PROD sólo contra producción; verificar un punto habilitado y uno no habilitado con el mismo CUIT.

## Criterios de aceptación medibles

- **AC-01:** En 100% de los intentos de emisión, `arca.puntoVenta` coincide con el punto visible y es positivo; nunca se envía `undefined` cuando hay una selección visible.
- **AC-02:** En 100% de los cambios A/B/C, el código enviado es respectivamente 1/6/11 tanto en preflight como en creación.
- **AC-03:** Un preflight 11002 produce cero invocaciones a `createVoucher`, cero persistencias de CAE y mantiene intactos productos, pagos, punto y tipo.
- **AC-04:** La UI muestra literalmente el código `11002`, el punto afectado, el tipo y una instrucción para habilitarlo en WSFE/WSFEv1 en el CUIT/ambiente correcto; no muestra sólo “Error”.
- **AC-05:** Cambiar el tipo y volver a B no se considera una reparación: si el punto sigue rechazado, el mismo 11002 permanece y la emisión sigue bloqueada.
- **AC-06:** Un punto habilitado obtiene numeración y permite CAE sin requerir cambiar de tipo; el CAE persistido conserva el punto seleccionado.
- **AC-07:** Las respuestas atrasadas de consultas anteriores no cambian el número, estado ni error del par activo.
- **AC-08:** Reset devuelve el primer punto configurado y el tipo inicial existente; A, B y C siguen seleccionables y operativos.
- **AC-09:** Los flujos de remito, presupuesto, A cuenta, edición y facturación de venta existente no llaman el preflight AFIP cuando no generan un CAE.
- **AC-10:** Ninguna prueba, log o mensaje contiene certificados, keys, tokens o claves internas; lint y TypeScript permanecen limpios tras la implementación.

## Comportamiento obligatorio ante 11002

El sistema debe tratarlo como **rechazo de configuración/compatibilidad AFIP**, no como falta de numeración ni como error transitorio. Debe:

1. conservar y mostrar el código y el mensaje original sanitizado;
2. identificar `{CUIT, ambiente, ptoVenta, tipoFactura}` en el contexto de soporte;
3. impedir el CAE y cualquier guardado que lo presente como factura electrónica emitida;
4. dejar al usuario editar el punto/tipo o ir a configuración, sin borrar productos ni reiniciar el ticket;
5. permitir reintentar únicamente después de cambiar configuración/selección o solicitar un nuevo preflight;
6. indicar que la acción correctiva está fuera de la aplicación: habilitar el punto para el WebService correcto en ARCA y hacer coincidir ambiente y certificado.

Si el diagnóstico demuestra que el preflight recibió el punto correcto y AFIP continúa devolviendo 11002, se clasifica como incompatibilidad real de AFIP/ambiente y no se debe introducir un fallback a otro punto ni ocultar el rechazo.
