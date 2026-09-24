# SPEC: Corrección de paginación y filtros de ventas

## Estado y alcance

Especificación de la etapa 1 del workflow TDD para corregir el flujo de
`/(protected)/searchBill`. No se implementan código ni pruebas en esta etapa.
El alcance comprende la obtención inicial, el cursor, la paginación incremental,
los filtros y el renderizado de ventas. No comprende cambios al modelo de
ventas, facturación AFIP, impresión ni devoluciones.

## Diagnóstico del flujo actual

1. `src/app/(protected)/searchBill/page.tsx` autentica, llama a
   `getSalesAction()` sin parámetros y pasa `sales` y `nextCursor` a
   `SalesTable`.
2. `src/actions/sales/get-sales.ts` limita la consulta a órdenes del negocio
   con `paidStatus: pago`, incluye items/client/returns y solicita
   `PAGINATION.SALES_MAX + 1` filas (actualmente 101). Devuelve como máximo
   100 ventas y usa el id de la última fila como cursor.
3. La consulta ordena solo por `date desc`, aunque el cursor es `id`. Las
   órdenes con la misma fecha no tienen un desempate determinista; además, un
   cursor por id no expresa completamente la posición en el orden por fecha.
   Esto puede producir omisiones o duplicados al cruzar páginas.
4. `SalesTable` vuelve a paginar en memoria (`itemsPerPage`, inicialmente 10)
   las ventas que ya recibió del servidor. El botón «Cargar más» agrega otra
   página del servidor a `liveSales`, pero no carga páginas en función del
   número de resultados que sobreviven a los filtros.
5. Todos los filtros de tipo de comprobante, medio de pago, fecha y vendedor
   se aplican únicamente después de la paginación del servidor. Por tanto, si
   una página contiene 100 ventas no coincidentes, las ventas coincidentes que
   están después no aparecen inicialmente y solo aparecen al pulsar «Cargar
   más». Este es el diagnóstico más probable del síntoma reportado.
6. El estado inicial de `FiltersProvider` activa `Remito` y `Efectivo`. La
   primera consulta no conoce ese estado porque `page.tsx` no recibe filtros;
   la UI filtra localmente una ventana ya truncada. Al cambiar filtros tampoco
   se reinicia el cursor ni se solicita una primera página nueva.
7. El refresco de Pusher llama a `getSalesAction()` sin cursor y reemplaza
   `liveSales` por la primera página, pudiendo descartar páginas que el usuario
   ya había cargado. Esto también deja la lista y `nextCursor` conceptualmente
   desalineados.
8. El renderizado (`currentSales`) es correcto para lo que contiene
   `liveSales`; el defecto principal está antes del render: conjunto de datos
   incompleto, filtros aplicados demasiado tarde y cursor no estable.

## Causa raíz probable y riesgos a confirmar

La causa raíz funcional es paginar antes de aplicar filtros. El tamaño máximo
de 100 hace visible el problema, aunque existan ventas válidas posteriores.
Como causa adicional de consistencia se debe corregir el orden/cursor no
determinista (`date` frente a `id`). Durante la implementación QA deberá
confirmar con datos que incluyan más de 100 órdenes y varias órdenes con la
misma fecha.

## Requisitos funcionales

- La primera respuesta debe representar la primera página de ventas que
  satisfacen exactamente los filtros vigentes.
- «Cargar más» debe continuar desde el último resultado de esa misma consulta,
  conservar filtros y no omitir ni repetir ventas.
- Cambiar cualquier filtro debe iniciar una consulta nueva desde el comienzo,
  descartar el cursor anterior y reiniciar la página visual a 1.
- La lista, el total visible y la paginación visual deben derivarse del mismo
  conjunto cargado; una venta que cumple filtros no puede quedar oculta solo
  porque las filas anteriores de la página fueron descartadas.
- El flujo debe mantener aislamiento por `businessId`, la condición de venta
  paga y la transformación existente `mapOrderToBillState`.
- Si no hay más resultados, `nextCursor` debe ser `null` y no debe mostrarse
  «Cargar más».
- Pusher debe refrescar desde la primera página con los filtros actuales o
  invalidar/reiniciar explícitamente el estado; no debe mezclar un cursor viejo
  con un resultado nuevo.

## Diseño propuesto

### Consulta y cursor

Extender `getSalesAction` para recibir un objeto de filtros serializable y
aplicar esos filtros en el `where` de Prisma antes de `take`. Mantener
`take + 1` para detectar continuidad.

Usar orden total y estable por `date desc, id desc`. El cursor recomendado es
opaco y contiene ambos valores (`date` ISO e `id`), por ejemplo
`{ date: string; id: string }` codificado en base64url. La página siguiente
debe seleccionar filas posteriores con la condición lexicográfica equivalente:
`date < cursor.date OR (date = cursor.date AND id < cursor.id)`. No se deben
mezclar filtros ni ordenamientos entre páginas.

Si la versión de Prisma del proyecto permite usar con seguridad un cursor
único de `id` junto con el desempate compuesto, se puede conservar el cursor
por id; la implementación deberá demostrar que no hay pérdida/duplicación en
fechas iguales. En caso contrario, usar el cursor compuesto anterior.

### Contratos

```ts
interface SalesFilters {
  documentTypes: ("FACTURA_C" | "REMITO")[];
  paymentMethods: string[];
  startDate?: string; // ISO inclusivo
  endDate?: string;   // ISO inclusivo
  seller?: string;
}

interface GetSalesParams {
  cursor?: string;
  take?: number;
  filters?: SalesFilters;
}

interface GetSalesResult {
  sales: BillState[];
  nextCursor: string | null;
}
```

Los filtros sin selección deben tener semántica explícita: tipos sin selección
significa no restringir por tipo; medios sin selección significa no restringir
por medio; fechas y vendedor ausentes significan no restringir. La UI puede
conservar sus valores iniciales actuales, pero debe serializarlos al primer
request.

### Estado cliente y renderizado

`SalesTable` debe mantener como mínimo `liveSales`, `cursor`, `hasMore` y
`loading`, pero el request de primera página y el de «Cargar más» deben usar
el mismo snapshot de filtros. Al cambiar filtros, abortar/ignorar respuestas
obsoletas, reemplazar resultados, poner cursor nuevo y volver a página 1.
No se deben concatenar resultados de snapshots distintos.

La paginación visual de 10/20/50/100 puede mantenerse, pero solo pagina el
conjunto ya cargado. El botón «Cargar más» debe seguir visible si el servidor
indica más resultados, incluso cuando la página visual actual no tenga filas
por filtros (los filtros ya se aplicaron server-side). Deduplicar por `sale.id`
como protección defensiva al concatenar y al refrescar.

## Interfaces de filtros y mapeo

- `FiltersContext` seguirá siendo la fuente de interacción de la UI.
- Debe existir una función pura y testeable para convertir `FiltersState` a
  `SalesFilters`, normalizando nombres de medios y serializando fechas.
- El contrato público de `BillState` y `mapOrderToBillState` no cambia.
- La respuesta de la acción conserva `sales` y `nextCursor`; no se requiere
  un cambio de esquema Prisma ni una dependencia nueva.

## Archivos afectados

### Obligatorios

- `src/actions/sales/get-sales.ts`: filtros server-side, orden estable,
  cursor y validación/límites de `take`.
- `src/components/Billing/SalesTable.tsx`: snapshot de filtros, recarga al
  cambiar filtros, concatenación segura, Pusher y estado del cursor.
- `src/components/Billing/FilterBillPanel.tsx` o un nuevo utilitario cercano:
  serialización de filtros, si no se coloca en el contexto.
- `src/context/FiltersContext/FiltersContext.tsx` y/o
  `src/context/FiltersContext/FiltersProivder.tsx`: exponer un snapshot estable
  o una función de serialización sin cambiar la interacción existente.

### Revisión condicionada

- `src/lib/pagination.ts`: ajustar límites o definir tamaño inicial sin superar
  el máximo existente.
- `src/app/(protected)/searchBill/page.tsx`: solo si la primera consulta debe
  recibir filtros serializados; no mover autenticación fuera del servidor.
- `prisma/schema.prisma`: no modificar salvo que la verificación de índices
  demuestre una necesidad; el índice actual `[businessId, date]` cubre la
  dirección principal, pero puede requerirse un índice compuesto con `id`.

### Sin cambios esperados

- `src/actions/sales/history.ts` y `mapOrderToBillState`.
- `src/components/Billing/SaleAccordion.tsx` y `PrintableTable`.
- Modelos de datos de `Order` y `BillState`.

## Criterios de aceptación medibles

1. Con 250 órdenes pagas del mismo negocio, la primera respuesta devuelve como
   máximo el tamaño configurado, informa `nextCursor` cuando corresponde y no
   pierde ninguna venta que cumpla los filtros.
2. Tras cargar todas las páginas, el conjunto de ids devuelto contiene cada
   orden paga coincidente exactamente una vez; no hay duplicados ni omisiones.
3. Con al menos 20 órdenes que comparten el mismo `date`, recorrer todas las
   páginas conserva el orden `date desc, id desc` y devuelve las 20 exactamente
   una vez.
4. Con 150 ventas donde solo la 120.ª coincide con vendedor, fecha, medio o
   tipo, esa venta aparece en la primera página lógica de resultados filtrados;
   no requiere cargar páginas no coincidentes previamente.
5. Al cambiar cualquier filtro, la siguiente solicitud usa `cursor` ausente,
   usa los filtros nuevos, reemplaza la lista anterior y muestra `Página 1`.
6. Una respuesta tardía de una solicitud anterior no puede sobrescribir los
   resultados del snapshot de filtros más reciente.
7. «Cargar más» envía exactamente el `nextCursor` de la respuesta visible y
   exactamente el mismo snapshot de filtros; al recibir `nextCursor: null`
   agrega resultados válidos, oculta el botón y no vuelve a solicitar páginas.
8. Al recibir un evento Pusher, la lista se refresca de forma consistente con
   los filtros activos y no conserva un cursor correspondiente a otra consulta.
9. La consulta nunca devuelve órdenes de otro `businessId` ni órdenes cuyo
   `paidStatus` no sea `pago`; los errores conservan el contrato seguro actual.
10. Las ventas renderizadas, el total y el número de páginas visuales se
    calculan exclusivamente a partir del conjunto actualmente cargado y no se
    muestran filas fuera de los filtros activos.
11. Se mantienen los casos existentes de Factura/Remito, medios de pago,
    fechas inclusivas, vendedor, CAE, detalle, devoluciones e impresión.
12. No se agregan dependencias, secretos, cambios de esquema innecesarios ni
    implementación de pruebas en esta etapa arquitectónica.

## Plan de verificación TDD posterior

QA deberá crear pruebas de la acción para aislamiento, filtros, límite, orden,
cursor compuesto y fechas iguales; pruebas de la utilidad de serialización; y
pruebas de `SalesTable` para reinicio, concatenación, deduplicación, respuestas
obsoletas y Pusher. Después se ejecutarán `npm run test`, `npm run lint` y
`npx tsc --noEmit` conforme al workflow.

## Gate G1 — verificación

G1 queda satisfecho: este archivo existe en
`ai/features/ventas-pagination/SPEC.md`, documenta el diagnóstico del flujo
completo, define requisitos, interfaces, diseño y archivos afectados, y
contiene 12 criterios de aceptación medibles. No se implementaron código ni
pruebas.
