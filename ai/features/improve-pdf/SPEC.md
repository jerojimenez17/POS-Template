# SPEC — Mejora del PDF de comprobantes

## Estado y gate

- **Rama analizada:** `feat/improve-pdf`.
- **Gate:** G1 — análisis y especificación arquitectónica completados.
- **Alcance de esta entrega:** únicamente análisis y especificación. No se implementan código ni tests.

## 1. Objetivo

Mejorar el comprobante PDF generado desde una venta ya realizada, principalmente desde `searchBill`, sin romper la impresión térmica ni el flujo de generación de ventas en `newBill`.

La salida debe:

1. presentar un comprobante visualmente aproximadamente **30 % mayor** en alto y ancho respecto del layout PDF actual;
2. mostrar el tipo real de factura configurado/autorizado para la venta (por ejemplo, Factura A, B o C), en lugar de degradar siempre a `Factura C`;
3. conservar los datos históricos de la venta, incluido el tipo de comprobante elegido antes de solicitar la autorización ARCA/AFIP.

## 2. Hallazgos del repositorio

### 2.1 Generación e impresión efectiva

- `src/components/Billing/PrintOptionsPopover.tsx` es el flujo relevante para ventas existentes. Abre una ventana, obtiene datos de negocio, construye HTML con `buildPDFHTML`, inyecta `PDF_STYLES` y llama a `exportToPDF` con formato `a4`.
- `src/lib/print/pdf-templates.ts` define la plantilla HTML y los estilos del comprobante.
- `src/lib/print/PDFExport.ts` usa `html2canvas` y `jspdf`; captura el elemento, lo ajusta al área útil A4 y abre el Blob PDF en una nueva ventana para imprimir.
- La impresión térmica (`BrowserPrint.ts`) comparte datos de recibo, pero no debe recibir cambios visuales específicos del PDF.
- `newBill/page.tsx` configura el tipo inicial (`getDefaultBillType`) y el modo de impresión; el PDF posterior a una venta se dispara desde la fila de venta de `searchBill` (`SalesTable` → `SaleAccordion` → `PrintOptionsPopover`).

### 2.2 Flujo y persistencia de datos

- `BillState` contiene `billType?: string`, pero `Order` en `prisma/schema.prisma` no tiene un campo equivalente.
- `BillButtons` envía el `BillState` a `processSaleAction`, pero `processSaleAction` persiste `Order.CAE` sin persistir `billType`.
- `BillingModal` calcula un tipo por defecto al facturar una venta histórica, pero al actualizar el CAE tampoco persiste el tipo elegido.
- `getSalesAction` y `getSaleByIdAction` convierten `Order` a `BillState` mediante `mapOrderToBillState`; esa función no asigna `billType`.
- `PrintOptionsPopover` sí intenta resolver el tipo con `sale.billType`, pero para ventas recuperadas desde la base ese valor es `undefined`. `getBillTypeDisplay` entonces devuelve `billType || "Factura C"` cuando existe CAE.
- Por tanto, el problema no está principalmente en la plantilla PDF: es una pérdida de información en el contrato y en la persistencia del pedido.

### 2.3 Mapeo ARCA/AFIP relevante

- `src/components/Billing/BillParametersForm.tsx` mapea actualmente tipos de UI a códigos ARCA para consultar el último comprobante; ese mapeo debe permanecer compatible.
- `createAfipVoucherAction` recibe el `BillState` y remite el tipo dentro del payload externo, pero el modelo local no conserva una fuente histórica explícita del tipo.
- `CAE` contiene CAE, vencimiento, número, QR y punto de venta, pero no contiene de forma tipada el código/tipo de comprobante. No se debe inferir el tipo desde el CAE.
- Los registros antiguos sin tipo persistido no siempre pueden recuperarse de manera determinista. Debe definirse una compatibilidad explícita para ellos.

## 3. Requisitos funcionales

### RF-1 — Escalado del comprobante PDF

1. El layout PDF debe usar una escala de diseño centralizada y explícita, con valor objetivo `1.30` respecto de los valores base actuales.
2. El incremento debe abarcar dimensiones y legibilidad: ancho de layout, padding, tipografías, separación entre bloques, filas de tabla, totales y sección CAE/QR.
3. No se debe aplicar este escalado a la impresión térmica ni a la UI de `searchBill`.
4. El contenido debe seguir siendo capturable por `html2canvas`, sin desbordamiento horizontal no intencional, y debe conservar paginación vertical correcta si el comprobante excede una página.
5. El QR, cuando exista, debe conservar proporción cuadrada, ser legible y no solaparse con CAE, logo o texto legal.

### RF-2 — Tipo real en la venta nueva

1. El tipo seleccionado/configurado en `BillState.billType` debe formar parte del input de persistencia de la venta.
2. El tipo enviado a la operación de facturación ARCA y el tipo persistido localmente deben provenir de la misma fuente de UI; no se debe volver a calcularlo únicamente desde la condición IVA al imprimir.
3. Deben soportarse al menos `Factura A`, `Factura B`, `Factura C`, `Presupuesto` y `Remito` según las convenciones actuales. Para tipos ARCA codificados, debe conservarse el código o una representación canónica equivalente.

### RF-3 — Tipo real en ventas históricas y reimpresión

1. `getSalesAction` y `getSaleByIdAction` deben devolver `billType` con el valor persistido.
2. `PrintOptionsPopover` debe pasar el valor canónico a `getBillTypeDisplay` sin sustituirlo por un valor por defecto incorrecto.
3. `buildPDFHTML` debe mostrar el mismo tipo que se muestra en el comprobante/flujo de datos de la venta.
4. La impresión térmica debe seguir usando el mismo tipo canónico, aunque este feature se valide principalmente sobre PDF.
5. Un tipo desconocido pero no vacío debe mostrarse de forma segura como recibido, o resolverse mediante un normalizador documentado; nunca debe convertirse silenciosamente en `Factura C`.

### RF-4 — Compatibilidad con datos existentes

1. Ventas antiguas sin `billType` persistido deben tener un fallback documentado y observable.
2. El fallback permitido para una venta oficial sin tipo histórico es `Factura C` únicamente por compatibilidad, no como valor universal de impresión. Idealmente debe marcarse como dato legado/no determinado en la capa de normalización, sin alterar el documento autorizado.
3. Remitos sin CAE deben continuar mostrando `Remito` y no `Factura C`.
4. La ausencia de CAE debe seguir omitiendo la sección CAE/QR y la numeración oficial.

## 4. Diseño de datos e interfaces

### 4.1 Modelo Prisma recomendado

Agregar a `Order` un campo histórico, preferentemente:

```prisma
billType String?
```

La especificación no impone migración automática ni estrategia de despliegue, pero la implementación debe:

- crear una migración compatible con PostgreSQL;
- dejar el campo nullable para no bloquear registros existentes;
- considerar índice únicamente si se incorporan filtros por tipo (no es necesario para este feature);
- no derivar el valor desde `Business.condicionIva` al leer una venta histórica.

Alternativa aceptable: persistir `billTypeCode` y `billTypeLabel` si el equipo necesita separar código ARCA y etiqueta. En tal caso, el contrato de lectura debe exponer un único `billType` canónico al resto del sistema.

### 4.2 Contratos TypeScript

Se recomienda centralizar un tipo de comprobante, evitando strings dispersos:

```typescript
type BillType =
  | "Factura A"
  | "Factura B"
  | "Factura C"
  | "Presupuesto"
  | "Remito"
  | (string & {});
```

El input de `processSaleAction` y el input de `updateOrderCaeAction` deben aceptar el tipo elegido. El mapper `mapOrderToBillState` debe devolverlo en `BillState.billType`.

El normalizador de impresión debería tener una interfaz equivalente a:

```typescript
interface ReceiptDocumentIdentity {
  kind: "official-invoice" | "remito";
  billType?: string | null;
  cae?: string | null;
}
```

La prioridad de resolución debe ser: tipo persistido/seleccionado → tipo explícito de respuesta ARCA si existe y está soportado → fallback legado documentado. El CAE por sí solo no es fuente del tipo.

### 4.3 Escala de presentación

La plantilla debe definir una constante o configuración única (`PDF_LAYOUT_SCALE = 1.3`) y aplicar sus valores de manera consistente. La medición de aceptación se realizará contra la plantilla actual en la misma configuración A4, no contra el zoom del visor PDF.

## 5. Archivos recomendados

### Cambios principales

- `prisma/schema.prisma`: campo persistente del tipo de comprobante.
- `src/actions/sales/process.ts`: validar/recibir y guardar `billType` en la creación.
- `src/actions/sales/update.ts`: conservar tipo en facturación posterior y, si corresponde, en edición.
- `src/actions/sales/history.ts`: seleccionar/mapear el campo a `BillState.billType`.
- `src/models/BillState.ts`: tipar el valor con el contrato acordado.
- `src/models/CAE.ts` o un nuevo modelo de identidad de comprobante: sólo si se decide tipar un código ARCA adicional; no inferirlo desde CAE.
- `src/components/Billing/BillingModal.tsx`: enviar el tipo seleccionado/default que corresponde a la venta al actualizar CAE.
- `src/components/Billing/PrintOptionsPopover.tsx`: usar la identidad histórica sin recalcularla incorrectamente.
- `src/lib/utils/bill-type.ts`: endurecer la normalización y eliminar el fallback implícito universal a `Factura C`.
- `src/lib/print/pdf-templates.ts`: aplicar la escala 1.30 y mantener la semántica del tipo.

### Archivos a revisar por regresión, sin necesidad de cambio

- `src/lib/print/PDFExport.ts`: paginación, formato A4, márgenes y captura.
- `src/lib/print/BrowserPrint.ts`: impresión térmica y HTML de recibo.
- `src/components/Billing/PrintableTable.tsx`: impresión del flujo de venta nueva.
- `src/components/Billing/BillParametersForm.tsx`: sincronización de `billType` y mapeo de códigos ARCA.
- `src/app/(protected)/newBill/page.tsx` y `src/app/(protected)/searchBill/page.tsx`: puntos de entrada; no deberían contener la lógica de render PDF.

## 6. Dependencias y decisiones arquitectónicas

- No se requieren nuevas dependencias. El repositorio ya usa `html2canvas` y `jspdf`.
- Mantener la generación en cliente: la plantilla accede a datos y QR SVG en el navegador, y `exportToPDF` abre un Blob para imprimir.
- Mantener `searchBill` dinámico y sus límites de autorización actuales.
- Las acciones de servidor deben seguir autenticando y restringiendo por `businessId`.
- El cambio de esquema debe ser aditivo y compatible con PostgreSQL/Prisma.
- No modificar secretos, credenciales ARCA, URL de función ni claves existentes.
- La plantilla genera HTML interpolado; la implementación debe preservar el tratamiento seguro de valores de texto para evitar introducir markup no deseado en el comprobante.

## 7. Criterios de aceptación medibles

### CA-1 — Tamaño y legibilidad

- Para un fixture de venta con al menos tres productos, el layout PDF implementado usa `1.30 ± 0.05` de escala frente al layout base documentado.
- En una comparación de la plantilla con el mismo contenido y A4, cada categoría principal (contenedor, título, encabezados de tabla, filas, totales y bloques CAE) aumenta su métrica de diseño en aproximadamente 30 %, con tolerancia de ±5 %, salvo restricciones necesarias del área imprimible.
- El PDF no presenta recorte horizontal; el ancho útil respeta los márgenes definidos y el contenido largo se pagina verticalmente.
- QR y textos CAE siguen visibles y no se superponen.

### CA-2 — Tipo de factura nuevo

- Una venta nueva seleccionada como Factura A se persiste como Factura A y, al reabrirla desde `searchBill` y generar PDF, muestra exactamente `Factura A`.
- Lo mismo se cumple para Factura B y Factura C.
- Una venta no oficial muestra `Remito` (o el tipo no fiscal definido) y nunca `Factura C` por el solo hecho de no tener CAE.

### CA-3 — Facturación posterior de una venta

- Una venta inicialmente sin CAE que se factura con tipo B conserva ese tipo tras `updateOrderCaeAction`; la reimpresión muestra Factura B.
- El tipo de negocio configurado como default sólo se usa al crear/seleccionar la operación, no para sobrescribir un tipo histórico ya guardado.

### CA-4 — Compatibilidad

- Ventas antiguas con `billType = null` no fallan al listar, ver detalle o generar PDF.
- El fallback legado se aplica sólo cuando falta el tipo; se documenta/loguea para poder corregir datos históricos y no se usa para ventas nuevas.
- La impresión térmica conserva el tipo correcto y su formato existente.
- `npm run lint`, `npm run build` y la suite existente pasan después de la implementación; esta especificación no agrega tests.

## 8. Escenarios límite

1. CAE vacío, espacios o `null`: tratar como documento no oficial; no mostrar numeración ni CAE.
2. `billType` vacío, `null`, código numérico, etiqueta conocida o etiqueta desconocida: normalizar sin perder información y aplicar fallback sólo en datos legados.
3. Venta histórica con CAE pero sin punto de venta: no fabricar numeración; conservar el comportamiento actual de `formatInvoiceNumberFull`.
4. QR ausente, inválido o todavía no generado: PDF válido sin imagen rota; la sección CAE permanece legible.
5. Nombre de negocio, cliente, producto o vendedor largo: envolver texto sin romper tabla ni desbordar A4.
6. Descuento cero, descuento positivo y total con descuento igual a cero: conservar cálculo mostrado y evitar errores de formato.
7. Muchos productos: comprobar salto de página y que no queden filas o totales superpuestos.
8. Popup bloqueado: mantener el fallback actual de `exportToPDF` y no perder la venta.
9. Dos medios de pago: mostrar el medio principal según el contrato existente; no alterar cálculo histórico por este feature.
10. Registros creados por `saveOrderAction` u otros flujos antiguos: permanecer imprimibles aunque no tengan tipo/CAE.

## 9. Verificación propuesta para la fase de desarrollo

La implementación deberá validar primero el contrato de persistencia y el mapper, y luego el render. La verificación manual mínima debe usar ventas A/B/C, Remito, una venta antigua sin tipo, CAE con QR y una venta con suficientes filas para dos páginas. La revisión debe confirmar que `newBill` sigue usando la condición IVA sólo como valor inicial y que `searchBill` reimprime datos persistidos, no configuración actual del negocio.
