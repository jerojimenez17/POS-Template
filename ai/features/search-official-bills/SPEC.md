# SPEC: Mostrar facturas oficiales en la búsqueda de ventas

## Alcance

Corregir la ruta `/(protected)/searchBill` para que las ventas con un CAE
persistido se entreguen al cliente como comprobantes oficiales y no sean
clasificadas como remitos. No se cambia la consulta, la paginación, el modelo
de base de datos ni la semántica de las ventas sin CAE.

## Análisis del comportamiento actual

1. `searchBill/page.tsx` invoca `getSalesAction()` y entrega sus ventas a
   `SalesTable`.
2. `get-sales.ts` consulta las órdenes pagas del negocio, incluye `items`,
   `client` y `returns`, y transforma cada orden mediante
   `mapOrderToBillState`.
3. El modelo `Order` guarda el CAE en el campo JSON `CAE`; las ventas creadas
   por `processSaleAction` persisten allí el objeto devuelto por AFIP.
4. `mapOrderToBillState` normaliza los datos fiscales y devuelve `ptoVenta`,
   `billType` y metadatos fiscales, pero actualmente no copia `order.CAE` al
   campo `CAE` de `BillState`.
5. `SalesTable` determina si una venta es oficial exclusivamente con
   `isAFIPAuthorized(undefined, sale.CAE?.CAE)`. Al faltar `sale.CAE`, una venta
   autorizada cae en la rama de remito. El estado inicial de filtros deja
   `Remito` activo y `FacturaC` inactivo, por lo que queda excluida; además,
   `SaleAccordion` muestra el botón `Facturar` en lugar del número oficial.

La documentación de búsqueda describe el mapeo esperado como `CAE:
order.CAE`, coherente con el comportamiento reportado en `main`. El checkout y
el esquema actual confirman que el dato sí se persiste; la pérdida ocurre en
la transformación `Order -> BillState`, no en PostgreSQL ni en la consulta de
`getSalesAction`.

## Causa raíz

Regresión en `mapOrderToBillState`: se omitió el campo `CAE` al construir el
`BillState`. Como el filtro de comprobante y la fila de la tabla dependen de
ese campo, la UI no puede reconocer ni representar una factura oficial aunque
la orden tenga CAE en la base.

## Requisito funcional

Para cada orden retornada por `getSalesAction`, el mapper debe propagar un CAE
válido desde `Order.CAE` al campo opcional `BillState.CAE`. La conversión debe
ser segura para el `JsonValue` de Prisma: valores ausentes o con forma
inválida deben producir `undefined`, no romper la acción.

El arreglo mínimo recomendado es reutilizar `parseCAE` en
`mapOrderToBillState` y añadir la propiedad `CAE: parseCAE(order.CAE)` al
objeto retornado. No se debe duplicar la clasificación en `SalesTable` ni
modificar `isAFIPAuthorized`, que correctamente define un comprobante oficial
por la presencia de un CAE no vacío.

## Interfaces y contratos

### Entrada persistida

- `Order.CAE`: `Prisma.JsonValue | null`.
- El objeto creado por facturación contiene al menos `CAE: string`; puede
  contener `vencimiento`, `nroComprobante`, `qrData` y `ptoVenta`.

### Salida del mapper

```ts
interface BillState {
  // ...campos existentes
  CAE?: CAE;
}

interface CAE {
  CAE: string;
  vencimiento: string;
  nroComprobante: number | string;
  qrData: string;
  ptoVenta?: number | string;
}
```

`GetSalesResult` no cambia:

```ts
interface GetSalesResult {
  sales: BillState[];
  nextCursor: string | null;
}
```

## Archivos a modificar

### Obligatorio

- `src/actions/sales/history.ts`
  - Importar/reutilizar el parser existente de CAE.
  - Propagar el CAE normalizado en `mapOrderToBillState`.

### Solo si la verificación demuestra una incompatibilidad

- `src/lib/cae.ts`: únicamente para ajustar la normalización de formas
  históricas, sin cambiar el contrato ni aceptar CAE vacío.

### Archivos que deben permanecer sin cambios en el arreglo mínimo

- `src/app/(protected)/searchBill/page.tsx`
- `src/actions/sales/get-sales.ts`
- `src/components/Billing/SalesTable.tsx`
- `src/components/Billing/SaleAccordion.tsx`
- `src/components/Billing/FilterBillPanel.tsx`
- `src/context/FiltersContext/FiltersProivder.tsx`
- `prisma/schema.prisma`

## Criterios de aceptación medibles

1. Una orden paga cuyo `Order.CAE.CAE` sea una cadena no vacía aparece en
   `getSalesAction().sales` con `sale.CAE?.CAE` igual a ese valor.
2. Con el estado inicial de filtros (`Remito` activo, `FacturaC` inactivo), una
   venta con CAE no aparece como remito ni se excluye por el filtro; al activar
   `FacturaC`, aparece en la lista.
3. Una venta con CAE renderiza el número de comprobante en `SaleAccordion` y
   no renderiza el botón `Facturar`.
4. `SalesTable` clasifica una venta con CAE como oficial mediante
   `isAFIPAuthorized` y una venta sin CAE como remito, manteniendo la conducta
   existente para ventas manuales.
5. El CAE se conserva al cargar la primera página, al cargar páginas mediante
   `nextCursor` y al refrescar por el evento Pusher.
6. `Order.CAE = null`, ausente, JSON no objeto o un objeto sin `CAE` válido no
   provoca excepción; la venta sigue siendo mostrada como no oficial.
7. Los campos `billType`, `ptoVenta`, número, cliente, pagos, fechas,
   devoluciones y metadatos de nota de crédito mantienen su comportamiento
   actual.
8. No se agregan consultas, cambios de esquema, filtros server-side ni
   dependencias nuevas.

## Escenarios edge

- CAE vacío o solo espacios: no es oficial y no debe ocultarse como resultado
  de un error.
- CAE con `nroComprobante` numérico o string: conserva ambos formatos y
  permite el formato de número existente.
- `ptoVenta` ausente en el JSON: se usa el valor fiscal normalizado existente
  si está disponible; no debe impedir que la venta sea reconocida por CAE.
- JSON histórico serializado como string: debe aceptarse si `parseCAE` puede
  decodificarlo y validar su forma.
- Orden con CAE válido pero contenido de factura incompleto: sigue siendo
  oficial en búsqueda; la elegibilidad de nota de crédito es un concern
  separado.
- Orden sin CAE pero con `billType` o `afipVoucherType` legado: sigue siendo
  no oficial, conforme a `isAFIPAuthorized`.
- Más de una página de resultados: el mapper debe aplicar la misma regla a
  todas las páginas.

## Verificación para implementación

- Añadir pruebas unitarias del mapper/parser para los escenarios anteriores.
- Añadir una prueba del flujo de filtros o de `SalesTable` que demuestre la
  separación oficial/remito.
- Ejecutar las pruebas existentes y el gate de lint/typecheck/build según el
  workflow del repositorio.
- Confirmar manualmente `/searchBill` con una orden real con CAE: número
  visible, filtro Facturas funcional y ausencia de `Facturar`.

## Gate G1 — Arquitectura aprobada

G1 queda satisfecho cuando esta especificación identifica la causa raíz,
define el cambio mínimo en el mapper, conserva los contratos públicos,
enumera criterios verificables y no solicita implementación en esta etapa.
