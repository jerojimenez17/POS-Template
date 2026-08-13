# SPEC: Mostrar número de comprobante como `PPP-NNNN`

## Objetivo

Todas las facturas oficiales que se muestran o imprimen deben presentar el número de comprobante compuesto por punto de venta y número de comprobante, separados por guion. Los remitos, presupuestos y demás comprobantes sin autorización no deben mostrar número de factura.

El criterio de factura oficial es exclusivamente `CAE.CAE` con contenido no vacío después de aplicar `trim()`. No se debe inferir que un documento es factura por `billType`, `nroComprobante`, QR, CAE vencimiento ni por la existencia del objeto `CAE`.

## Requisito confirmado: tipo inicial de nueva venta

Al iniciar la aplicación y al abrir `/newBill`, el tipo de comprobante inicial debe ser exactamente `Factura B`. El mismo valor debe utilizarse en todos los estados iniciales y resets de una nueva venta, sin modificar el tipo, la CAE ni ningún otro dato de ventas históricas o comprobantes ya guardados.

### Decisión de defaults y resets

- `BillTypes.B` (`"Factura B"`) es la constante canónica para este valor; no se deben introducir literales divergentes para el estado o el formulario.
- `BillProvider`/`INITIAL_STATE` debe iniciar `BillState.billType` en `BillTypes.B`, de modo que la primera renderización de `/newBill` ya refleje `Factura B`.
- `BillReducer` debe conservar `Factura B` en `removeAll`, que es el reset de una nueva venta. Las acciones `billType` y `setState` deben continuar respetando el valor explícitamente recibido; `setState` no debe normalizar ni reemplazar el tipo de una venta cargada.
- `BillParametersForm` debe usar `BillTypes.B` tanto en `defaultValues` como en el objeto entregado a `form.reset` mediante `onOrderResetRef`. El preview/consulta del último comprobante debe mapear ese valor a tipo ARCA B (`6`) desde el primer render.
- Deben revisarse otros defaults de nueva venta, resets y valores derivados de `billType` para que no reintroduzcan `Remito` o `Factura C`. Los valores fijos de flujos históricos (por ejemplo, la facturación posterior de una venta existente) no son defaults de `/newBill` y no deben cambiarse como parte de este requisito.
- El cambio es exclusivamente de estado inicial/reset y selección inicial de nuevas ventas. No requiere migración Prisma ni actualización de registros existentes.

### Hallazgos de la revisión de defaults

- `BillTypes` ya contiene el valor correcto (`B = "Factura B"`); el problema es que los consumidores de nueva venta usan `Remito` o `Factura C` como fallback.
- El `INITIAL_STATE` actual usa `Remito`, el caso `removeAll` del reducer usa `Factura C`, y `BillParametersForm` usa `BillTypes.C` tanto en `defaultValues` como en `form.reset`; los tres puntos deben converger en `BillTypes.B`.
- `getBillTypeDisplay`/`src/lib/utils/bill-type.ts` puede conservar sus fallbacks de presentación para datos incompletos o históricos: no es un estado inicial de nueva venta y no debe convertir documentos guardados.
- El `billType` fijo `Factura C` de `BillingModal` corresponde a facturación posterior de una venta existente y queda explícitamente fuera de este cambio. Del mismo modo, la selección explícita de `Presupuesto`/`Remito` en `BillButtons` sigue siendo una acción del usuario, no un default.
- `setState`/`EditSaleWrapper` carga una venta existente y debe conservar sus datos. No se debe aplicar `Factura B` como fallback al hidratar históricos; el fallback solo corresponde al estado nuevo/reset de `/newBill`.

## Decisión de formato

Debe existir un único formateador compartido por histórico, HTML imprimible, PDF y térmica. El formateador debe aceptar tanto datos separados como el formato histórico combinado.

- Entrada preferida: `ptoVenta` + `nroComprobante`.
- Formato canónico de salida: punto de venta de **3 dígitos** y comprobante de **4 dígitos**, por ejemplo `001-0023`. Este es el formato actual de la aplicación y el único formato que se debe mostrar.
- Si el dato combinado histórico contiene 7 dígitos y no hay `ptoVenta`, interpretar los primeros 3 como punto de venta y los últimos 4 como comprobante.
- Un valor histórico de 12 dígitos no se debe mostrar como `4+8` ni tratarse automáticamente como factura: solo puede convertirse si existe un mapeo explícito y seguro a punto de venta de 3 dígitos y comprobante de 4 dígitos; de lo contrario, el número se omite.
- Si solo existe uno de los dos componentes, no fabricar un número parcial ni usar `0` como valor válido; el número se omite.
- Cero, `null`, `undefined`, `NaN`, cadenas vacías/blancas y valores no numéricos se consideran ausentes. Los valores numéricos positivos se normalizan a texto decimal y se rellenan a la izquierda; no se truncan si superan el ancho esperado.
- El número solo se renderiza cuando el documento es `official-invoice` y ambos componentes están disponibles.

### Decisión de padding

Producto confirmó que se mantiene el formato actual de la aplicación: **3 dígitos para el punto de venta y 4 dígitos para el número de comprobante** (`001-0023`). La decisión reemplaza cualquier lógica previa de `4+8`, incluida la usada por `BrowserPrint` o `formatInvoiceNumberFull`; no se permiten formatos distintos por canal.

## Regla de ausencia y tipo de documento

1. `hasOfficialCae = Boolean(cae?.CAE?.trim())` es la única fuente de verdad.
2. Con `hasOfficialCae = true`, el encabezado de factura, el histórico y cada salida imprimible deben mostrar el número formateado si está disponible.
3. Con `hasOfficialCae = false`, el documento se etiqueta como `Remito` (o el tipo no fiscal ya existente), no muestra `N°`, `Nro`, `Factura`, ni el número de CAE como sustituto.
4. Una factura oficial con número ausente debe conservar el tipo de factura y CAE, pero omitir únicamente la línea del número; no mostrar placeholders como `0000-00000000`, `undefined`, `NaN` o el ID interno.
5. La ausencia del número no cambia filtros, facturación posterior, persistencia ni el estado fiscal del comprobante.

## Alcance de salidas

### Histórico `/searchBill`

- `SaleAccordion`/`SalesTable`: la columna `Comprobante` debe mostrar el número oficial formateado, no el CAE. Para remitos debe conservar la acción `Facturar` cuando corresponda y no mostrar un número de factura.
- La determinación usada por los filtros `Factura C`/`Remito` debe usar la misma regla de CAE no vacío, incluyendo espacios.
- `PrintOptionsPopover` debe pasar al pipeline de impresión el mismo par punto de venta/comprobante y el mismo tipo de documento que se ve en el histórico.
- `searchBill/page.tsx` no debe introducir una fuente de negocio distinta: solo debe seguir entregando ventas y configuración de impresión al componente.

### `PrintableTable`

- El encabezado visible al imprimir debe mostrar `Factura: <tipo>` y, únicamente para una factura oficial, `N° <PPP-NNNN>` cuando exista.
- El remito debe mostrar `Comprobante: Remito` sin número de factura.
- La impresión por thermal y la generación PDF disparadas desde este componente deben recibir los datos de identificación; actualmente solo se pasa `nroComprobante` al PDF y no se pasa `ptoVenta` al thermal, por lo que ambos caminos deben converger en el formateador compartido.

### Thermal / `BrowserPrint`

- Aplicar la regla a las dos salidas térmicas existentes: ESC/POS (`generateThermalReceipt`) y fallback HTML (`buildThermalPrintHTML`).
- Mostrar una sola línea `Nro: PPP-NNNN` en factura oficial con datos completos.
- No mostrar esa línea ni datos fiscales para remitos, presupuestos u otros documentos sin CAE.
- No modificar la lógica de CAE, QR, datos fiscales, corte de papel ni fallback; el cambio es únicamente de identificación y propagación de datos.

### PDF templates

- `buildPDFHTML` debe mostrar `N° PPP-NNNN` en el bloque de encabezado solo para factura oficial y con datos completos.
- No debe mostrar número ni datos fiscales en el PDF de un remito/presupuesto.
- La opción del template debe poder recibir punto de venta y número separado, además de interpretar el legado combinado de 7 dígitos. No depender únicamente de dividir un valor que puede ser el número secuencial corto; un legado de 12 dígitos sin mapeo explícito a `3+4` se omite.
- Los nombres de archivo pueden continuar usando el ID o el dato actual, pero no deben introducir placeholders como si fueran un número oficial.

### Otras vistas imprimibles

- `account-ledger/[id]/PrintOrderButton` imprime presupuestos/comprobantes sin CAE y, por tanto, no debe mostrar número de factura. Debe mantenerse explícitamente cubierto para evitar que una refactorización global le agregue un número.
- `printElement`/`PDFExport` son infraestructura genérica: no deben decidir si hay factura; reciben markup ya resuelto. Las impresiones de stock no están dentro de este alcance.
- Revisar cualquier nuevo consumidor de `buildPDFHTML`, `printThermalReceipt` o `PrintableTable` antes de cerrar la implementación; todos deben cumplir la misma regla.

## Datos y compatibilidad

- El tipo de CAE debe transportar `ptoVenta` cuando se conoce, sin romper registros históricos que no lo tengan.
- En nuevas facturas, el punto de venta seleccionado para solicitar ARCA debe conservarse junto con el resultado (`CAE`) al guardar la venta. Actualmente `createAfipVoucherAction` extrae `ptoVenta` para la llamada externa y el resultado guardado contiene principalmente `nroCbte`; esa pérdida impide reconstruir el número si `nroCbte` es secuencial corto.
- En registros existentes, el adaptador de histórico debe aceptar JSON CAE antiguo y aplicar, en orden: `CAE.ptoVenta` si existe; número combinado legado de 7 dígitos; de lo contrario, número ausente. Los valores de 12 dígitos no se deben reinterpretar sin un mapeo explícito a la convención `3+4`.
- No agregar una migración Prisma ni cambiar la columna `Order.CAE` para esta funcionalidad: es JSON y debe mantenerse backward-compatible. Si la respuesta de ARCA entrega el punto de venta, persistirlo dentro del JSON CAE; si no lo entrega, usar el punto de venta seleccionado en la solicitud.
- La forma de datos que llega a todos los canales debe ser explícita y tipada; no usar `any`, parseos implícitos ni valores globales de configuración para reemplazar el punto de venta de la venta histórica.

## Archivos afectados previstos

### Núcleo y modelo

- `src/lib/utils/bill-type.ts` (o un nuevo helper de números de comprobante): consolidar/eliminar la lógica duplicada de formato.
- `src/lib/print/receipt-data.ts`: exponer la identificación fiscal y mantener `getDocumentPrintKind` basado en CAE.
- `src/models/CAE.ts`, `src/models/BillState.ts`: soportar punto de venta opcional y compatibilidad con históricos.
- `src/models/billType.ts`: usar `BillTypes.B` como referencia canónica del tipo inicial, sin cambiar los valores históricos válidos del enum.
- `src/context/BillProvider.tsx`: actualizar `INITIAL_STATE.billType` a `BillTypes.B`.
- `src/context/BillReducer.ts`: actualizar el valor de `billType` aplicado por `removeAll`; preservar `setState` para ventas cargadas.
- `src/context/billActions.ts`: verificar que las acciones existentes permitan distinguir el reset de nueva venta de la carga de una venta histórica; no agregar normalización implícita.
- `src/lib/utils/bill-type.ts`: verificar que los fallbacks de presentación no se confundan con el default de nueva venta.
- `src/lib/cae.ts`, `src/actions/sales/history.ts`: normalizar/parsing seguro del JSON CAE y mapear los datos a `BillState`.
- `src/actions/afip.ts`, `src/actions/sales/process.ts`, `src/actions/sales/update.ts`, `src/components/Billing/BillButtons.tsx`, `src/components/Billing/BillingModal.tsx`: conservar el punto de venta seleccionado al generar y actualizar una factura.

### Renderizado e impresión

- `src/components/Billing/PrintableTable.tsx`
- `src/components/Billing/PrintOptionsPopover.tsx`
- `src/components/Billing/SaleAccordion.tsx`
- `src/components/Billing/SalesTable.tsx`
- `src/lib/print/BrowserPrint.ts`
- `src/lib/print/pdf-templates.ts`
- `src/app/(protected)/account-ledger/[id]/PrintOrderButton.tsx` (verificación explícita de no aplicar número)
- `src/components/Billing/BillParametersForm.tsx` para alinear el preview de próximo comprobante con la convención finalmente confirmada.
- `src/components/Billing/BillParametersForm.tsx`: usar `BillTypes.B` en `defaultValues` y en todos los `form.reset` de nueva venta; mantener el mapeo ARCA B del preview.
- `src/components/Billing/BillingModal.tsx`: verificación de no regresión; conservar `Factura C` para la facturación posterior de históricos.
- `src/components/Billing/BillButtons.tsx`: verificación de no regresión; conservar las acciones explícitas de `Remito`/`Presupuesto` y todos sus resets coordinados.

`src/app/(protected)/searchBill/page.tsx` se considera punto de integración y debe verificarse aunque probablemente no requiera cambios.

## Criterios de aceptación verificables

1. Para CAE `"123"`, punto de venta `1` y comprobante `23`, histórico, encabezado imprimible, ESC/POS, fallback térmico HTML y PDF muestran exactamente `001-0023` (sin CAE en la columna histórica).
2. Para CAE `" 123 "`, el documento se trata como factura oficial; para CAE `""`, `"   "`, `null` o ausencia, se trata como remito/no oficial.
3. Un remito nunca muestra datos fiscales, `N°`, `Nro`, `Factura` ni el CAE/número de comprobante aunque el objeto tenga `nroComprobante` o QR residual.
4. Un CAE oficial con punto de venta `1` y comprobante `23` se muestra como `001-0023`; un número combinado histórico de 7 dígitos se interpreta como `3+4`. Un valor de 12 dígitos sin mapeo explícito a `3+4` se omite.
5. Un número oficial con punto de venta ausente, comprobante ausente, cero, texto inválido o combinación incompleta no genera placeholder ni error visible y no muestra línea de número.
6. La impresión térmica ESC/POS y su fallback HTML producen la misma identificación; el PDF y la vista `PrintableTable` producen la misma identificación.
7. La venta histórica conserva el punto de venta guardado en CAE; una nueva factura guarda suficiente información para mostrarlo después de recargar `/searchBill`.
8. La vista de cuenta corriente para una orden sin CAE sigue imprimiendo `Presupuesto`/`Comprobante` sin número de factura.
9. Los filtros de histórico siguen clasificando exclusivamente por CAE no vacío y no cambian por la ausencia o formato del número.
10. No se cambia la semántica de CAE, QR, totales, productos, nombres de archivos, permisos, paginación o facturación posterior salvo la identificación visual descrita.
11. Al montar `BillProvider` en `/newBill`, `BillState.billType` vale exactamente `"Factura B"` y el formulario muestra `Factura B` sin interacción del usuario.
12. `BillTypes.B` es la fuente usada por `INITIAL_STATE`, `BillParametersForm.defaultValues` y el callback de `form.reset`; no queda ningún default de nueva venta en `Remito` o `Factura C`.
13. Después de cada flujo que dispara `removeAll` y el reset del formulario, el estado y el formulario vuelven a `Factura B`; la consulta del próximo comprobante usa tipo ARCA `6` mientras ese valor esté seleccionado.
14. Cargar una venta existente mediante `setState`, abrir una venta histórica o facturar posteriormente una venta no cambia su `billType`, CAE, número ni representación guardada por efecto de este requisito.
15. No se modifican registros históricos, comprobantes persistidos, la semántica de `setState`, los valores explícitos seleccionados por el usuario ni los defaults de otros flujos que no correspondan a una nueva venta.

## Ambigüedades resueltas

- **Ancho del formato:** resuelto por producto: punto de venta de 3 dígitos y comprobante de 4 dígitos (`001-0023`). Todos los canales deben usar esta misma convención.
- **Número combinado frente a componentes separados:** se aceptan componentes separados; como compatibilidad histórica se acepta el combinado de 7 dígitos (`3+4`). Un valor de 12 dígitos no define por sí solo un número válido en el formato actual.
- **Criterio de factura oficial:** resuelto: exclusivamente `CAE.CAE` no vacío después de `trim()`.
- **Etiquetas visibles:** se conservan las etiquetas propias de cada salida (`N°`/`Nro`/`Comprobante`) siempre que el valor mostrado sea el mismo `PPP-NNNN` y que los remitos no incluyan datos fiscales ni número de factura.

## Fuera de alcance

No se modifican cálculos fiscales, emisión ARCA, esquema relacional, numeración de comprobantes, formatos de CAE/QR, reportes contables ni impresiones de etiquetas/productos.
