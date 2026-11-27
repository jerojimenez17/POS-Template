# Checklist de aceptación — mejoras visuales

## Tema oscuro de `searchBill`

- [ ] La superficie de `SalesTable` tiene tokens claros y `dark:` equivalentes; no usa `text-black` como color global.
- [ ] Encabezado, filas normales, hover, separadores y bordes son distinguibles en ambos temas.
- [ ] Fecha, comprobante, medio de pago, vendedor y total usan texto primario/secundario con contraste WCAG AA.
- [ ] El total, selector de filas, estado vacío y paginación conservan fondo y texto legibles en oscuro.
- [ ] `SaleAccordion` mantiene `Facturar`, detalle, impresión y eliminación distinguibles en hover, focus-visible y disabled.
- [ ] En tema claro se conserva la apariencia equivalente y no cambian contenido, orden, filtros, paginación, impresión ni acciones.
- [ ] Caso negativo: no debe existir texto claro sobre fila blanca ni texto oscuro sobre superficie oscura sin contraste.

## Responsive mobile de `ClientSelectionModal`

- [ ] Los tres `DialogContent` (selección, creación y órdenes pendientes) caben en 360×640 con margen mínimo de 8 px.
- [ ] Cada diálogo usa altura máxima basada en `100dvh`, layout vertical y evita overflow horizontal.
- [ ] El cuerpo tiene `min-h-0` y scroll vertical independiente; el footer y sus botones siguen alcanzables.
- [ ] La lista conserva su scroll interno sin introducir un scroll duplicado innecesario.
- [ ] Tras seleccionar cliente, CUIT/CUIL, condición IVA, notas, total, Cancelar y Confirmar siguen accesibles.
- [ ] Creación de cliente y órdenes pendientes permiten alcanzar sus acciones en 360×640, incluidos loading states.
- [ ] En 1280×800 se conserva `max-w-md`/centrado, spacing y altura natural sin scroll innecesario cuando cabe.
- [ ] Caso negativo: el bloque dependiente de `selectedClientId` no puede producir clipping superior/inferior ni franja inutilizable.
- [ ] Edge cases: lista vacía, lista larga, cliente con datos opcionales, múltiples órdenes y textos largos no generan overflow horizontal.

## Contratos preservados

- [ ] No cambian props públicas, significado de `mode`, callbacks, endpoints, filtros, ordenamiento, selección ni estados de carga.
- [ ] No se modifica el `DialogContent` compartido globalmente salvo evidencia imprescindible.
