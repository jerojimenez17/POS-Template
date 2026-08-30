# Checklist de pruebas — etiqueta 55 × 45 mm horizontal

Fuente de verdad: `SPEC.md`. Este checklist define el gate **G2** para la implementación posterior.

## Selector, configuración y preview

- [ ] El selector expone exactamente `a4`, `thermal` y `label-45x55`.
- [ ] La tercera opción se muestra como `Etiqueta (55 × 45 mm)` (o texto inequívoco equivalente).
- [ ] `label-45x55` tiene `width: 55mm`, `height: 45mm`, `box-sizing: border-box` y aproximadamente 2 mm de padding.
- [ ] Su `@page` es `size: 55mm 45mm landscape; margin: 0`; `html`/`body` usan la misma geometría y margen/padding cero.
- [ ] La configuración usa `printFormat: "thermal"` y `printElement` recibe `orientation: "landscape"`.
- [ ] Preview, HTML impreso y documento final comparten la configuración horizontal; la ayuda indica escala 100 %, márgenes ninguno y orientación horizontal, advirtiendo sobre navegador/driver.
- [ ] No existe ruta portrait, CSS `45mm 55mm`, `auto-fill` ni grid de etiquetas para esta opción.

## Contenido, barcode, copias y overflow

- [ ] El orden es descripción, precio opcional, código interno y barcode.
- [ ] El precio se redondea/formatea igual que antes y puede ocultarse.
- [ ] El barcode usa CODE128 y `displayValue: true`; la fuente masiva es `codebar || code` y el texto interno sigue siendo `code`.
- [ ] Copias 1, 3 y 50 producen exactamente esa cantidad; se limita el rango a 1–50 y los saltos aparecen entre etiquetas, no después de la última.
- [ ] Descripciones de 80+ caracteres y EAN-13 no generan overflow horizontal; el SVG queda limitado al ancho disponible.
- [ ] Fallback PDF conserva selección, contenido, barcode y copias, y transporta landscape.

## Regresiones

- [ ] A4 conserva `@page { size: A4; margin: 5mm; }`, sus dimensiones/clases, grid de tres columnas, grupos/paginación, edición de descripción/precio y copias.
- [ ] Thermal conserva `@page { size: 55mm 65mm; margin: 0; }`, `TAG_WIDTH = "6.3cm"`, alturas, clases, orientación efectiva, contenido, barcode, copias y saltos.
- [ ] CSS de 55 × 45 no contamina A4/thermal; thermal no contiene landscape, `45mm 55mm` ni `55mm 45mm`, y no se agrega portrait global.
- [ ] Callers mantienen API: `ProductDataTable` continúa usando `format="thermal"`, bulk continúa iniciando A4 y tabla individual conserva sus props.
- [ ] `CodeBarModal`, si representa esta etiqueta, adopta 55 × 45 landscape, barcode/copias/fallback y ayuda horizontal.
- [ ] `SetCodebarModal` permanece exclusivamente de asignación: no importa ni llama impresión, no genera etiquetas y guardar solo actualiza/notifica.

## Gate G2

G2 pasa cuando todos los tests nuevos de esta carpeta están verdes, los tests previos no regresan y la implementación satisface este checklist. En el estado TDD inicial esperado, los tests nuevos deben quedar **RED** contra el portrait actual.
