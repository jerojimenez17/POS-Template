# Nota de Crédito: visibilidad, estado de carga y contexto de request

## Estado y alcance

- **Estado:** especificación arquitectónica; esta entrega no implementa código de producción ni pruebas.
- **Alcance:** detalle de venta en `src/app/(protected)/sales/[id]/`, emisión de Nota de Crédito para ventas con CAE, estado de carga/errores del control cliente y uso correcto de APIs dinámicas de Next.js.
- **Fuera de alcance:** rediseño del flujo de devoluciones manuales, alta de puntos de venta en ARCA/AFIP, cambio de credenciales, migración de Prisma o modificación del contrato de la Cloud Function salvo el contrato mínimo descrito aquí.

## Decisión funcional: qué ventas son elegibles

Una venta es elegible para el botón **Nota de Crédito / devolución fiscal** sólo si:

1. pertenece al negocio de la sesión actual;
2. tiene `billType` exactamente `Factura A`, `Factura B` o `Factura C`;
3. tiene un CAE original válido y no un placeholder (`undefined`, vacío o texto no válido);
4. tiene número de comprobante y punto de venta enteros positivos;
5. el código fiscal persistido coincide con el tipo visible: A→1, B→6, C→11;
6. no tiene una Nota de Crédito `AUTHORIZED` para esa venta.

La elegibilidad debe ser calculada con un DTO fiscal normalizado en servidor y no sólo con una comprobación incidental del componente. Una venta manual, remito, presupuesto o venta sin CAE no debe mostrar el botón.

### Compatibilidad con ventas CAE existentes

Las ventas históricas que sí tienen CAE y los metadatos equivalentes dentro del JSON `Order.CAE` deben seguir siendo elegibles aunque no tengan todos los campos nuevos (`invoiceNumber`, `invoicePointOfSale` o `afipVoucherType`) materializados en columnas. La lectura debe normalizar esos valores desde la fuente persistida, validar la consistencia y exponerlos al cliente.

No se debe emitir una Nota de Crédito basándose únicamente en datos enviados por el navegador. La action debe volver a leer la venta, derivar/validar el número, punto, CAE y tipo AFIP, y rechazar con un mensaje seguro si la información histórica no puede reconstruirse sin ambigüedad.

La operación de Nota de Crédito para una venta CAE-backed es una **reversión fiscal completa**: asocia el comprobante original, solicita el tipo de Nota de Crédito correspondiente (A→3, B→8, C→13), y sólo después de obtener un CAE nuevo autoriza una única reversión local de stock y efectivo. Las devoluciones parciales o ventas no fiscales continúan en el flujo manual existente y no deben reutilizar esta acción.

## Hallazgos y causas raíz

### Botón ausente

- `CreditNoteButton` retorna `null` desde una función de elegibilidad basada en `sale.originalCAE`, `invoiceNumber` y `invoicePointOfSale`.
- La página entrega una mezcla de columnas nuevas y campos del JSON `CAE`; el mapeo `mapOrderToBillState` no garantiza un DTO fiscal único para todos los históricos.
- El servidor valida además `afipVoucherType === tipo derivado`, por lo que una venta visible como facturada puede quedar sin una ruta coherente entre el fallback de UI y la validación de la action.
- La elegibilidad está duplicada entre página/componente/action y no distingue explícitamente “CAE-backed histórico normalizable” de “venta realmente no facturada”.

### Spinner atascado

`CreditNoteButton.submit` establece `loading=true` y sólo lo restablece cuando la promesa termina normalmente. Una excepción de la Server Action, una serialización fallida o un error de red deja el control deshabilitado indefinidamente. Además, la referencia de reentrada debe liberarse en todos los caminos.

### `headers was called outside a request scope`

La autenticación de Auth.js es request-bound y usa APIs dinámicas de Next.js internamente. El flujo debe separar funciones puras de normalización/validación de funciones request-bound (`auth`, `headers`, `cookies`, `after`, `revalidate*`). No se debe ejecutar una función que consulte sesión desde módulo, callback diferido, helper de dominio o promesa que sobreviva al request.

En particular, la acción de Nota de Crédito debe resolver sesión y autorización al comienzo de la invocación, antes de la transacción o de cualquier llamada externa, y pasar el actor/businessId explícitamente a helpers puros. Cualquier trabajo posterior (`after`) sólo puede usar datos serializables capturados durante la request; nunca puede llamar `auth()`/`headers()`/`cookies()`. Si no se necesita trabajo diferido para esta operación, debe omitirse `after` y realizar sólo invalidación segura en el contexto de la action.

La page Server Component puede llamar `auth()` y la consulta de venta dentro de la renderización, pero no debe exportar ni invocar helpers request-bound en el cliente. El componente cliente recibe únicamente datos serializables y la referencia de Server Action validada por Next.

## Requisitos funcionales

### RF-01. DTO fiscal canónico

Crear o centralizar un contrato serializable equivalente a:

```ts
interface SaleFiscalContext {
  orderId: string;
  billType: "Factura A" | "Factura B" | "Factura C";
  originalAfipVoucherType: 1 | 6 | 11;
  originalCAE: string;
  invoiceNumber: number;
  invoicePointOfSale: number;
  total: number;
  products: Array<{ id: string; description: string; amount: number; salePrice: number }>;
  creditNote: { status: "PENDING" | "AUTHORIZED" | "REJECTED" } | null;
  eligibleForFullCreditNote: boolean;
}
```

El normalizador debe aceptar columnas persistidas y el JSON CAE histórico con prioridad documentada, validar tipos y no exponer credenciales ni payload AFIP completo.

### RF-02. Visibilidad determinista

La página debe entregar al botón el DTO canónico. El componente sólo debe ocultarse cuando `eligibleForFullCreditNote` sea falso; no debe reconstruir elegibilidad desde `Record<string, unknown>` ni depender de nombres alternativos (`items` versus `products`).

Debe mostrar estado informativo para una venta fiscal con devolución pendiente, y ocultar/deshabilitar el control para una devolución autorizada. Una Nota de Crédito `REJECTED` puede reintentarse con una nueva interacción/idempotency key según la política de la action.

### RF-03. Action segura e idempotente

`createCreditNoteAction` debe conservar una entrada validada con Zod (`orderId`, `confirmed: true`, `idempotencyKey`), autenticar dentro de la propia action, verificar `businessId`, volver a consultar la venta y verificar elegibilidad. Debe conservar la protección contra dos Notas de Crédito autorizadas y la unicidad `SaleReturn(orderId, kind)`.

El resultado serializable debe ser explícito:

```ts
type CreateCreditNoteResult =
  | { success: true; data: { creditNoteCAE: string; creditNoteNumber: number; creditNotePointOfSale: number; originalCAE: string } }
  | { success: false; error: string; pending?: boolean; code?: "UNAUTHORIZED" | "NOT_ELIGIBLE" | "PENDING" | "AFIP_ERROR" | "CONFLICT" | "INTERNAL_ERROR" };
```

Errores de AFIP, datos fiscales faltantes, caja cerrada y conflicto de idempotencia deben ser respuestas controladas. Ningún secreto, certificado, token, key ni CAE completo debe aparecer en logs de error genéricos.

### RF-04. Contexto dinámico correcto

- `auth()` se llama sólo al entrar a la Server Action o al Server Component que renderiza la página.
- Helpers de dominio, parsers AFIP, mapeadores y funciones de transacción reciben argumentos explícitos y no importan `next/headers` ni invocan `auth()`.
- No se llama `auth`, `headers`, `cookies` ni APIs equivalentes dentro de `after`, callbacks de Pusher, funciones de Prisma o módulos evaluados durante importación.
- Si se usa `after`, se registra sólo trabajo no request-bound; de lo contrario se elimina del flujo de la Nota de Crédito.
- La implementación debe verificar el comportamiento con la versión instalada de Next.js (el repositorio declara Next 16 aunque `AGENTS.md` documenta Next 15) y seguir la API de Server Actions vigente.

### RF-05. Estado de carga y reentrada

El submit debe usar `try/catch/finally`:

- `loading` es `true` únicamente mientras la promesa de la action está pendiente;
- `loading` vuelve a `false` tanto en éxito como en error síncrono, rechazo de promesa o excepción de serialización;
- la referencia de reentrada vuelve a `false` en `finally`;
- ningún doble click genera dos llamadas concurrentes;
- el primer click de revisión y el segundo de confirmación mantienen el flujo actual, pero ambos estados deben ser accesibles y no dejar un modal/diálogo ambiguo;
- éxito muestra el resultado y actualiza/refresca la vista sin depender de que el spinner sea limpiado por `window.location.reload()`.

## Interfaces y responsabilidades

- `src/services/afip/credit-note.ts`: mapeo A/B/C, contrato y normalización pura de contexto/resultado AFIP.
- `src/actions/sales/history.ts` o un mapper dedicado: materialización del `SaleFiscalContext` desde `Order`, incluyendo compatibilidad con `CAE` histórico y returns.
- `src/actions/sales/credit-note.ts`: boundary request-bound; auth, tenant scope, Zod, idempotencia, emisión AFIP y transacción final.
- `src/app/(protected)/sales/[id]/page.tsx`: obtiene sesión/venta en servidor, pasa DTO serializable y no contiene lógica duplicada de elegibilidad.
- `src/components/Billing/CreditNoteButton.tsx`: presentación, confirmación, estado local y manejo de errores; no importa `next/headers` ni Auth.js.
- `src/actions/afip.ts`: mantener la emisión server-only y contrato canónico; no añadir lecturas de request dinámico a helpers reutilizados.
- `prisma/schema.prisma`: no requiere migración para la corrección mínima. Usar los campos existentes de `Order`/`SaleReturn`; cualquier persistencia adicional requiere una decisión y migración separadas.

## Archivos afectados previstos

- `src/app/(protected)/sales/[id]/page.tsx`
- `src/components/Billing/CreditNoteButton.tsx`
- `src/actions/sales/credit-note.ts`
- `src/actions/sales/history.ts` y/o nuevo mapper fiscal bajo `src/services/` o `src/models/`
- `src/services/afip/credit-note.ts`
- `src/actions/afip.ts` sólo si hace falta ajustar el boundary/resultado
- `src/lib/auth.ts`, `auth.ts` o `auth.config.ts` sólo para eliminar uso incorrecto de APIs dinámicas; no cambiar configuración de sesión como solución superficial
- `prisma/schema.prisma` únicamente si el análisis de implementación demuestra que el modelo actual no puede soportar el contrato (no esperado)

## Criterios de aceptación medibles

- **AC-01:** Una venta A/B/C con CAE y datos fiscales persistidos muestra el control en el 100% de las cargas del detalle; una venta manual o sin CAE no lo muestra.
- **AC-02:** Una venta histórica cuyo CAE contiene número y punto válidos se normaliza y muestra el control sin requerir editar/re facturar la venta; si cualquier dato no puede validarse, se oculta o muestra diagnóstico no accionable, pero nunca permite emitir.
- **AC-03:** El tipo original se mapea exactamente A→1, B→6, C→11 y el tipo de Nota de Crédito A→3, B→8, C→13 en action y payload AFIP.
- **AC-04:** En una prueba de éxito, la action produce una Nota de Crédito autorizada, guarda el CAE nuevo, restaura stock y descuenta efectivo una sola vez; el CAE original permanece sin cambios.
- **AC-05:** Repetir la misma idempotency key devuelve el resultado autorizado sin segunda llamada AFIP ni segunda modificación de stock/caja; otra key es rechazada.
- **AC-06:** Toda excepción/rechazo de la action deja `loading === false` y permite reintentar o cancelar en menos de un ciclo de render posterior al rechazo; no queda el botón deshabilitado permanentemente.
- **AC-07:** Dos activaciones rápidas producen como máximo una invocación de `createCreditNoteAction` mientras la primera está pendiente.
- **AC-08:** Bajo render de la page y bajo llamada de Server Action no aparece `headers was called outside a request scope`; ninguna ruta de background llama `auth`, `headers` o `cookies`.
- **AC-09:** Una venta con Nota de Crédito `AUTHORIZED` no ofrece una segunda emisión; una solicitud `PENDING` informa estado y no crea otra fila.
- **AC-10:** Fallos de sesión, tenant, caja, datos fiscales, AFIP y red se muestran como mensajes controlados y no filtran secretos.
- **AC-11:** `npm run lint`, `npx tsc --noEmit` y la suite existente pasan después de la implementación; no se agrega dependencia nueva ni migración sin justificar.

## Estrategia de pruebas (para QA; no se implementa en esta entrega)

1. **Mapper/servicio:** casos A/B/C, CAE válido/inválido, columnas nuevas, JSON CAE histórico, precedencia de campos, venta manual y returns autorizados.
2. **Action:** sesión ausente, tenant incorrecto, fiscalidad inconsistente, caja cerrada, rechazo AFIP, respuesta sin CAE, éxito, idempotencia y carreras concurrentes con mocks de Prisma/AFIP.
3. **Componente RTL:** botón visible/oculto, primer click de revisión, confirmación, doble click, excepción de la action, error devuelto, éxito y limpieza de spinner.
4. **Page/contrato:** verificar que el DTO pasado al cliente sea serializable y contenga el fallback histórico normalizado; evitar pasar objetos Prisma/`Date` no transformados.
5. **Contexto Next:** prueba de integración/build que renderice la route y ejecute la Server Action en request real; inspeccionar que no exista uso de dynamic APIs en callbacks diferidos.
6. **Regresión:** devoluciones manuales, historial de venta, impresión y facturación de nuevas ventas no deben perder su comportamiento.

## Restricciones de implementación

- No “arreglar” el botón mostrando el control para cualquier venta con texto `Factura`.
- No confiar en `window.location.reload()` como mecanismo de limpieza de estado.
- No mover secretos al cliente ni devolver el objeto completo de `Order.CAE`.
- No usar `any`; los adaptadores de Prisma/AFIP deben validar `unknown` y devolver tipos explícitos.
- No convertir el error de contexto en un `try/catch` silencioso: el boundary request-bound debe quedar arquitectónicamente fuera de helpers y callbacks no request-bound.
