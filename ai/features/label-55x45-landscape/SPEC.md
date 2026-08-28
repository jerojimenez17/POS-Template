# SPEC — Etiqueta 55 × 45 mm horizontal (landscape)

**Gate:** G1 — especificación arquitectónica confirmada para implementación posterior  
**Estado:** Aprobada por decisión explícita del usuario  
**Alcance:** impresión de etiquetas; no incluye asignación de códigos de barras

## 1. Contexto y estado auditado

La rama actual es `feature/label-45x55-vertical`. El flujo que contiene el selector de formatos es `src/components/stock/product-print-modal.tsx`, con los valores `a4`, `thermal` y `label-45x55`. La implementación visible actualmente interpreta el tercer valor como 45 mm × 55 mm portrait; esa geometría ya no coincide con la decisión confirmada.

El flujo individual de impresión está en `src/components/stock/code-bar-modal.tsx`. `src/components/stock/set-codebar-modal.tsx` es un flujo distinto: asigna/escanea un código y llama a `updateProduct`; no debe imprimir, generar etiquetas ni seleccionar formatos.

No se pudo inferir un estado limpio/sucio de Git únicamente a partir de los archivos disponibles para esta auditoría; por eso la especificación toma como baseline observable el código presente en la rama y exige preservar los contratos existentes, no una supuesta versión histórica.

## 2. Decisión de compatibilidad del identificador

Se conserva **`label-45x55` como valor estable**. No se introduce `label-55x45` en esta iteración.

Motivos:

- El valor ya existe en la unión TypeScript, el selector, callers y configuración de la feature anterior.
- Cambiarlo rompería configuraciones, valores serializados o callers que ya lo envían, aunque sean locales al cliente hoy.
- El identificador es un contrato técnico heredado; no debe interpretarse literalmente como el orden físico de ancho/alto.

Migración semántica:

| Valor estable | Texto visible nuevo | Geometría efectiva | Orientación |
|---|---|---|---|
| `a4` | `Hoja A4` | A4 existente | sin cambio |
| `thermal` | `Etiqueta (55×65mm)` | 55 mm × 65 mm existente | sin cambio |
| `label-45x55` | `Etiqueta (55 × 45 mm)` | 55 mm de ancho × 45 mm de alto | `landscape` |

Toda entrada existente `label-45x55` debe resolverse a la nueva geometría horizontal. No se debe mantener una ruta portrait para ese mismo valor ni aceptar simultáneamente `label-55x45` como alias en el selector. Si en el futuro se decide renombrar el valor, deberá hacerse mediante una migración versionada de callers/configuraciones; queda fuera de esta tarea.

## 3. Objetivo

Agregar/corregir la opción de etiqueta horizontal sin modificar el resultado observable de A4 ni del thermal 55 × 65. El preview y la impresión deben usar una única configuración derivada del valor seleccionado.

## 4. Contrato de configuración

La configuración tipada por formato debe contener, como mínimo:

- `width`: `55mm` para `label-45x55`.
- `height`: `45mm` para `label-45x55`.
- `pageSize`: `55mm 45mm`.
- `orientation`: `"landscape"` únicamente para `label-45x55`.
- `pageStyle`: CSS físico completo de la opción.
- `printFormat`: `"thermal"` para conservar el canal HTML térmico.
- reglas de layout, copias y barcode.

La selección nunca debe derivarse de `format === "thermal"`: `thermal` continúa significando exclusivamente 55 × 65 mm. `orientation` debe seguir siendo opcional para no romper otros callers de `printElement`.

Defaults y callers:

- Una apertura sin `format` conserva el default actual `a4`.
- Un caller que envía `format="thermal"` continúa siendo thermal 55 × 65.
- La selección es estado del modal; no requiere persistencia en Prisma ni cambios de Server Actions/Zod.
- Cualquier caller que ya envíe `label-45x55` recibe, sin cambio de API, 55 × 45 landscape.

## 5. Requisitos funcionales

### Selector y preview

1. El selector muestra exactamente los valores técnicos `a4`, `thermal` y `label-45x55`.
2. El texto visible de la tercera opción dice `Etiqueta (55 × 45 mm)` o equivalente que conserve inequívocamente ambas medidas.
3. El preview se renderiza con la misma configuración usada por `handlePrint`; no puede mostrar portrait mientras la impresión solicita landscape.
4. La ayuda al usuario debe indicar escala 100 %, márgenes ninguno y orientación horizontal/landscape. Debe aclarar que las preferencias del navegador/driver pueden prevalecer.

### Geometría y CSS físico de 55 × 45

Solo para `label-45x55`:

- Cada `.label-container` declara exactamente `width: 55mm` y `height: 45mm`.
- Usa `box-sizing: border-box`, margen/padding de página cero y aproximadamente 2 mm de padding interno.
- `html` y `body` usan `width: 55mm`, `height: 45mm`, `margin: 0` y `padding: 0`.
- El contenido es negro sobre blanco, centrado y sin overflow horizontal.
- La regla de página es exactamente equivalente a `@page { size: 55mm 45mm landscape; margin: 0; }`.
- Los controles `.no-print` se ocultan en impresión.
- Descripciones largas deben envolver palabras y el barcode debe limitarse al ancho disponible.
- La geometría no debe invertirse a `45mm 55mm`, ni usar `auto-fill`, ni introducir un grid de etiquetas.

### Contenido y barcode

- El orden del contenido es: descripción, precio opcional, código interno y barcode.
- Se conserva el checkbox de precio y el redondeo/formato de precio actual.
- El barcode se genera con JsBarcode en CODE128, con `displayValue: true` y la fuente de código ya soportada por el flujo.
- La fuente masiva conserva `product.codebar || product.code`; si no hay `codebar`, se usa el código interno.
- El texto visible del código interno sigue siendo `product.code`; cambiar la fuente codificada no cambia ese texto.
- La selección de formato no modifica el valor del barcode.

### Copias y saltos

- El límite de copias continúa siendo 1–50.
- Para N copias, preview y documento contienen exactamente N etiquetas por producto, sin perder ni duplicar SVGs.
- Cada etiqueta horizontal ocupa una página física y todas salvo la última usan `page-break-after: always`/`break-after: page` de forma equivalente.
- A4 conserva su paginación por grupos y grid de tres columnas.
- Thermal conserva su agrupación, alturas y saltos actuales.

## 6. Regresión obligatoria de A4 y thermal

### A4

No se cambia `format: "a4"`, `@page { size: A4; margin: 5mm; }`, margen, grid de tres columnas, contenido, edición de descripción/precio, paginación ni multiplicación por copias.

### Thermal 55 × 65

No se cambia `format: "thermal"`, `@page { size: 55mm 65mm; margin: 0; }`, `TAG_WIDTH = "6.3cm"`, alturas actuales según barcode/precio, orientación efectiva, clases, contenido, barcode, copias ni saltos.

El CSS de 55 × 45 no puede contaminar el CSS thermal: thermal no debe contener `landscape`, `45mm 55mm` ni `55mm 45mm`. No se debe agregar `portrait` globalmente.

## 7. Flujo individual y superficies relacionadas

- `ProductPrintModal` sigue siendo el dueño del selector y del mapa de formatos.
- `CodeBarModal` sigue siendo impresión individual, con su API pública y fallback existentes. Si se usa como implementación de la opción heredada `label-45x55`, debe adoptar la geometría 55 × 45 landscape y el mismo contrato de barcode/copias; no puede conservar una interpretación portrait contradictoria del mismo valor.
- Los callers de `stock-table.tsx`, `ProductDataTable.tsx` y `bulk-update/page.tsx` conservan sus props y responsabilidades. En particular, `ProductDataTable` sigue pasando `format="thermal"` cuando corresponde y bulk sigue iniciando A4.
- `set-codebar-modal.tsx` permanece exclusivamente de asignación: validación/normalización, escáner, `updateProduct`, toasts y callback. No debe importar `ProductPrintModal`, `printElement`, JsBarcode de impresión ni estado de formato. Guardar un código no dispara impresión.

## 8. Print API y fallback

Para `label-45x55`, `handlePrint` debe llamar a `printElement` con `format: "thermal"`, `orientation: "landscape"` y el `pageStyle` de 55 × 45. Para A4 y thermal, los argumentos actuales deben permanecer equivalentes.

El fallback `fallbackToPDF` existente se conserva donde ya esté habilitado. Si `window.print` falla o no está disponible, no se pierde el contenido, barcode, copias ni selección. El PDF debe recibir la orientación indicada, pero la escala física final depende del visor, navegador, márgenes y driver; la especificación no promete controlar esas preferencias.

No se requieren cambios de Prisma, dependencias ni modelo de datos. `BrowserPrint.ts` y `PDFExport.ts` solo se modifican si la implementación demuestra que no pueden transportar `landscape` sin alterar callers existentes.

## 9. Archivos a revisar durante implementación

| Archivo | Requisito |
|---|---|
| `src/components/stock/product-print-modal.tsx` | Conservar `label-45x55` y cambiar únicamente su semántica física a 55 × 45 landscape; preservar A4/thermal. |
| `src/components/stock/code-bar-modal.tsx` | Alinear el flujo individual si representa la misma etiqueta; preservar API, barcode, copias y fallback. |
| `src/components/stock/stock-table.tsx` | Mantener caller y datos del flujo individual. |
| `src/components/ProductDataTable.tsx` | Mantener `format="thermal"` y su geometría 55 × 65. |
| `src/app/(protected)/stock/bulk-update/page.tsx` | Mantener impresión masiva A4. |
| `src/lib/print/BrowserPrint.ts` y `src/lib/print/PDFExport.ts` | Verificar transporte de `orientation`, `pageStyle` y fallback sin regresión. |
| `src/components/stock/set-codebar-modal.tsx` | Solo regresión de asignación; no agregar impresión. |

## 10. Criterios de aceptación medibles

1. El selector expone exactamente `a4`, `thermal` y `label-45x55`; la tercera opción se muestra como 55 × 45 mm.
2. `label-45x55` produce inline `width: 55mm`, `height: 45mm`, `box-sizing: border-box` y no produce una ruta portrait.
3. Su `@page` contiene `size: 55mm 45mm landscape; margin: 0` y `printElement` recibe `format: "thermal"` y `orientation: "landscape"`.
4. Preview, HTML copiado a la ventana de impresión y documento final mantienen la orientación horizontal y la geometría física solicitada.
5. Una descripción de al menos 80 caracteres y un EAN de 13 dígitos no desbordan horizontalmente; el SVG conserva valor visible.
6. Para copias 1, 3 y 50 hay exactamente ese número de etiquetas/páginas y saltos entre copias, sin índices de refs incorrectos.
7. A4 conserva `@page` A4, margen 5 mm, grid, agrupación y paginación; no aparece CSS de 55 × 45.
8. Thermal conserva `@page 55mm 65mm`, 6.3 cm, alturas y comportamiento baseline; no aparece `landscape`, `45mm 55mm` ni `55mm 45mm` en su configuración.
9. La fuente del barcode sigue siendo `codebar || code`, CODE128, `displayValue: true`, con fallback al código interno.
10. El fallback PDF conserva contenido, copias, barcode y selección; se documenta la dependencia de escala del visor/driver.
11. Los callers existentes no cambian su API: `format="thermal"` sigue siendo 55 × 65 y bulk sigue siendo A4.
12. `set-codebar-modal.tsx` continúa sin impresión; guardar/asignar código solo actualiza el producto y ejecuta sus toasts/callback existentes.

## 11. Gate G1

**G1 confirmado.** Se revisó el selector real, el flujo individual, los callers A4/thermal, el transporte de impresión y el modal de asignación. La decisión estable es conservar `label-45x55` para no romper callers ni configuraciones existentes, pero redefinir su geometría efectiva a **55 mm × 45 mm, horizontal, `landscape`**. Quedan especificados CSS físico, `@page`, preview, copias, barcode, fallback y regresiones. No se escribió código ni tests.
