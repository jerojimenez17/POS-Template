# Checklist de pruebas — selector `label-45x55`

Gate objetivo: **G2 — pruebas TDD RED contra la implementación actual**.

## Selector y contrato

- [ ] `ProductPrintModal` (el flujo real con selector) expone exactamente los valores `a4`, `thermal` y `label-45x55`.
- [ ] La tercera opción muestra `Etiqueta (45 × 55 mm)` y su valor no depende del texto visible.
- [ ] El default de una apertura sin formato conserva A4; el caller con `format="thermal"` conserva thermal.

## Regresión A4

- [ ] A4 mantiene `format: "a4"`, `@page A4`, margen de 5 mm, grid de tres columnas y agrupación/paginación cada 13 tags.
- [ ] Las copias siguen multiplicando el contenido sin convertir el batch en etiquetas individuales.
- [ ] Descripción, precio opcional, código interno, barcode CODE128/fallback y contenido editable conservan su contrato.

## Regresión thermal 55 × 65 mm

- [ ] Thermal conserva `@page { size: 55mm 65mm; margin: 0; }`, `format: "thermal"`, caja de 6.3 cm y alturas actuales.
- [ ] Thermal no contiene CSS de 45 × 55 ni orientación portrait impuesta, y conserva sus clases/layout, contenido y saltos por copia.
- [ ] `format="thermal"` de `ProductDataTable` no migra visualmente al nuevo tamaño.

## Nuevo formato 45 × 55 mm

- [ ] Solo al seleccionar `label-45x55`, cada label mide `45mm` × `55mm`, usa `box-sizing: border-box` y no tiene overflow horizontal.
- [ ] Solo ese formato declara `@page { size: 45mm 55mm portrait; margin: 0; }`, `orientation: "portrait"` y `format: "thermal"` al llamar `printElement`.
- [ ] Usa contenido centrado, blanco/negro, margen interno aproximado de 2 mm, `.no-print` oculto y salto entre copias; no usa grid, auto-fill, landscape ni dimensiones invertidas.
- [ ] Mantiene descripción, precio opcional, código interno, barcode CODE128 con display value/fuente seleccionada y fallback al código interno.
- [ ] 1–50 copias y descripciones largas/EAN de 13 dígitos no desbordan horizontalmente.
- [ ] La ayuda visible solicita escala 100 %, márgenes ninguno y orientación vertical, sin prometer control del driver.

## Fallback y superficies fuera de alcance

- [ ] El flujo de impresión conserva fallback PDF y no pierde selección ni contenido cuando falla `window.print`.
- [ ] `CodeBarModal` conserva API, default y comportamiento individual de la feature previa.
- [ ] `SetCodebarModal` conserva validación, normalización, toast, callback y `updateProduct`; guardar nunca imprime ni adquiere estado de formato.
- [ ] `stock-table`, `ProductDataTable` y `bulk-update/page.tsx` conservan callers, datos y APIs públicas; el bulk sigue iniciando A4.
