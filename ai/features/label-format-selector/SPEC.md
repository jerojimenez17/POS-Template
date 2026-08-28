# SPEC — Selector de formato de etiqueta sin regresión

**Gate:** G1 — especificación arquitectónica aprobada para implementación posterior.

## 1. Contexto y decisión de alcance

La referencia a `src/components/stock/set-codebar-modal.tsx` no identifica el flujo solicitado. Ese componente solo asigna un código de barras mediante `updateProduct`; no recibe descripción/precio, no genera JsBarcode y no llama a `printElement`.

La auditoría de la rama muestra dos flujos reales:

1. **Impresión individual desde `stock-table.tsx`**: abre `src/components/stock/code-bar-modal.tsx`. En el estado actual de la rama, incluidos los cambios no confirmados de la feature anterior, este modal está fijado a 45 × 55 mm portrait.
2. **Impresión desde `ProductDataTable.tsx` y masiva desde `app/(protected)/stock/bulk-update/page.tsx`**: abren `src/components/stock/product-print-modal.tsx`. Este es el componente que ya contiene el selector de formato (`a4` / `thermal`). Su formato térmico existente conserva `@page { size: 55mm 65mm; margin: 0; }`, la caja de 6.3 cm y sus reglas CSS térmicas; no debe modificarse.

La ampliación debe corregir el riesgo introducido por la feature anterior: **45 × 55 mm no debe reemplazar silenciosamente el formato existente**. El selector debe vivir en el flujo real que ya selecciona formato (`ProductPrintModal`) y debe permitir elegir explícitamente el nuevo formato. `SetCodebarModal` queda fuera del alcance y no debe adquirir responsabilidades de impresión.

La implementación deberá decidir explícitamente cómo exponer el mismo contrato en el flujo individual (`CodeBarModal`): si se incorpora allí un selector, su valor por defecto debe ser el formato existente de ese flujo y nunca debe cambiarse por defecto a 45 × 55; si se reutiliza el selector del flujo común, deberá conservarse la API pública actual y el comportamiento de apertura desde `stock-table`.

## 2. Objetivo

- Mantener el formato existente exactamente como funciona hoy: dimensiones, orientación efectiva, CSS, contenido, precio, copias, preview, JsBarcode, saltos de página y fallback PDF.
- Agregar una opción explícita **45 × 55 mm**, siempre vertical/portrait, aplicando las reglas de la feature anterior.
- Evitar que una selección de formato se convierta en un booleano ambiguo o en condiciones dispersas que mezclen A4, thermal existente y 45 × 55.
- No cambiar persistencia, asignación de códigos ni el flujo masivo A4 salvo para que el nuevo selector sea coherente y no lo rompa.

## 3. Contrato de selección

Se debe definir un contrato tipado y estable, preferentemente una unión equivalente a:

| Valor estable | Label visible | Significado |
|---|---|---|
| `a4` | `Hoja A4` | Hoja A4 existente; conserva grid, paginación y estilos A4. |
| `thermal` | `Etiqueta (55×65mm)` | Formato térmico existente; su contrato actual es intocable. |
| `label-45x55` | `Etiqueta (45 × 55 mm)` | Nuevo formato; ancho 45 mm, alto 55 mm, siempre portrait. |

El valor `label-45x55` es el identificador persistente del contrato de UI; no se debe usar el label como valor ni cambiarlo por `thermal-45`, `45mm` u otra variante durante la implementación. No se requiere guardar la selección en base de datos: el estado es local al modal y cada apertura inicia con el default compatible con el flujo actual.

El componente debe derivar un único objeto de configuración por selección, con al menos: `width`, `height`, `pageSize`, `orientation`, `pageStyle`, `printFormat` y reglas de layout. No se permite inferir 45 × 55 por `format === "thermal"`, porque `thermal` sigue significando 55 × 65 mm.

## 4. Compatibilidad obligatoria del formato existente

El formato existente es el default y debe conservar byte a byte, o equivalentemente con el mismo resultado observable, su contrato vigente. En particular:

- `thermal` sigue usando `printElement` con `format: "thermal"` y `@page { size: 55mm 65mm; margin: 0; }`.
- Se conservan dimensiones actuales de etiquetas térmicas (`TAG_WIDTH = 6.3cm` y las alturas actuales según barcode/precio), orientación implícita/actual y todos sus selectores CSS térmicos.
- No se cambia la semántica de `codebar`: el barcode de la impresión masiva usa `product.codebar || product.code` donde ese es el comportamiento actual; el modo individual conserva su selector de fuente y fallback al código interno.
- Se mantienen descripción, precio editable donde ya exista, código interno, barcode, redondeo/formato de precio, control de copias 1–50, preview, saltos de página y paginación A4.
- `a4` sigue siendo A4 con margen de 5 mm, grid y agrupación de páginas actual. La nueva opción no debe convertir el batch A4 en etiquetas individuales.
- El default del selector no puede provocar una migración visual de impresiones existentes. Los callers que pasan `format="thermal"` continúan imprimiendo thermal 55 × 65 mm.

La implementación no debe reutilizar para `thermal` constantes, clases o `pageStyle` diseñados para 45 × 55. Si se comparte JSX, las reglas deben estar encapsuladas por configuración y se debe verificar que el CSS generado para thermal no cambie.

## 5. Reglas exclusivas de 45 × 55 mm

Solo cuando el valor sea `label-45x55`:

- Cada `.label-container` mide exactamente `45mm` × `55mm`, con `box-sizing: border-box`.
- La página declara `@page { size: 45mm 55mm portrait; margin: 0; }`.
- `printElement` recibe `format: "thermal"` (por compatibilidad con el canal HTML térmico) y `orientation: "portrait"`.
- `html`/`body` usan 45 mm × 55 mm, margen y padding cero; controles `.no-print` quedan ocultos.
- El contenido queda centrado, negro sobre blanco, con aproximadamente 2 mm de margen interno, sin overflow horizontal.
- El orden es descripción, precio opcional, código interno y barcode CODE128 generado por JsBarcode. El barcode conserva `displayValue: true` y la fuente seleccionada; sin `codebar`, el código interno sigue siendo válido.
- Cada copia tiene salto de página y no se usa grid, `auto-fill`, landscape ni dimensiones invertidas.
- La ayuda visible debe indicar escala 100 %, márgenes ninguno y orientación vertical, sin afirmar que el navegador/driver puede ser bloqueado.

El `@page`, clases y dimensiones de 45 × 55 no deben aparecer en la rama de formato existente. En particular, no se debe aplicar `portrait` globalmente si eso cambia el resultado del formato previo.

## 6. Flujo de datos e impresión

La selección debe atravesar todo el flujo como dato explícito:

1. El usuario elige el item del `Select`.
2. Preview y contenido de impresión se renderizan con la misma configuración.
3. JsBarcode se regenera al cambiar formato, copias, precio visible o fuente de código; el cambio de formato no altera el valor elegido.
4. `handlePrint` llama a `printElement(printRef.current, options)` con el `pageStyle`, `format` y `orientation` de la selección.
5. El fallback PDF (`fallbackToPDF`, actualmente habilitado en el flujo individual) se conserva. La especificación no promete que un visor PDF respete tamaño físico si el usuario cambia escala, márgenes u orientación.
6. Las copias siguen produciendo exactamente N etiquetas/páginas, sin duplicar ni perder SVGs por índices de refs.

No se requieren cambios de Prisma, Server Actions, Zod, `SetCodebarModal` ni dependencias. `BrowserPrint.ts` se reutiliza; solo podrá modificarse si una auditoría demuestra que el contrato actual no puede transportar las opciones sin alterar callers existentes. `orientation` debe ser opcional para no romper otros usos.

## 7. Archivos y usos que deben revisarse

| Archivo/uso | Requisito |
|---|---|
| `src/components/stock/product-print-modal.tsx` | Selector real de formato; agregar `label-45x55`, aislar configuración y preservar A4/thermal. |
| `src/components/stock/code-bar-modal.tsx` | Flujo individual; integrar el contrato solo si el diseño lo comparte. Preservar explícitamente su API y la feature previa de barcode/copies/price/preview. |
| `src/components/stock/stock-table.tsx` | Verificar que el botón individual sigue abriendo el modal con los mismos datos y default compatible. |
| `src/components/ProductDataTable.tsx` | Verificar el botón que abre `ProductPrintModal` con `format="thermal"`; debe seguir siendo 55 × 65. |
| `src/app/(protected)/stock/bulk-update/page.tsx` | Verificar impresión masiva A4 sin cambio de layout ni paginación. |
| `src/lib/print/BrowserPrint.ts` y `src/lib/print/PDFExport.ts` | Verificar `pageStyle`, `orientation`, copia de `innerHTML`, cierre de ventana y fallback sin regresión. |
| `src/components/stock/set-codebar-modal.tsx` | Solo regresión: asignación, validación, toast y `updateProduct` sin impresión automática. |

## 8. Riesgos y mitigaciones

- **Ambigüedad thermal vs 45 × 55:** usar valores distintos y un mapa de configuración; no sobrecargar `thermal`.
- **Cambios no confirmados de la feature anterior:** comparar contra el estado actual y proteger el formato previo con snapshots/asser­tions de dimensiones y `pageStyle`; no asumir que el código actual de `CodeBarModal` representa el contrato histórico.
- **CSS global de `printElement`:** el documento copia `innerHTML` y agrega estilos críticos/CDN; el `pageStyle` específico debe prevalecer sin modificar el default global.
- **Refs de JsBarcode y copias:** regenerar después de montar el nuevo número de SVGs y validar índices para A4 y etiqueta individual.
- **Orientación impuesta por navegador:** `@page` y `orientation` son solicitudes, no una garantía contra preferencias del driver; mantener la advertencia visible.
- **Fallback PDF:** el PDF puede conservar contenido pero no garantiza escala física; documentar y no introducir una segunda geometría incompatible.
- **Regresión de asignación:** no importar impresión ni estado de formato en `SetCodebarModal`.

## 9. Criterios de aceptación medibles

1. **Selector:** el flujo que ya contiene el selector muestra exactamente `a4`, `thermal` y `label-45x55`; el value de la tercera opción es estable `label-45x55` y su label contiene `45 × 55 mm`.
2. **Default/no regresión:** una apertura sin selección explícita y cada caller existente conservan el default previo; el caller con `format="thermal"` produce `@page 55mm 65mm`, no 45 × 55.
3. **Thermal intacto:** con `thermal`, las dimensiones inline, `pageStyle`, orientación efectiva, clases de layout, contenido, precio, barcode, copias y saltos son equivalentes al baseline de la rama antes de la ampliación; no aparece `45mm 55mm portrait`.
4. **A4 intacto:** con `a4`, continúa `format: "a4"`, `@page A4`, margen de 5 mm, grid, paginación y multiplier de copias existentes.
5. **45 × 55:** con `label-45x55`, todos los labels tienen `width: 45mm` y `height: 55mm`; `printElement` recibe `format: "thermal"`, `orientation: "portrait"` y `@page 45mm 55mm portrait`.
6. **Aislamiento de orientación:** solo `label-45x55` agrega portrait explícito; ningún estilo seleccionado para thermal contiene `landscape`, `45mm 55mm` ni `55mm 45mm`.
7. **Contenido:** para cada formato, la descripción, precio según checkbox, código interno y barcode mantienen su contrato; el barcode sigue siendo CODE128 con valor seleccionado y fallback al código interno.
8. **Copias:** para N entre 1 y 50, el preview y el documento contienen N etiquetas; en 45 × 55 hay salto entre cada etiqueta y en A4/thermal se conserva la paginación previa.
9. **Overflow:** una descripción de al menos 80 caracteres y un EAN de 13 dígitos no desbordan horizontalmente 45 × 55; el SVG conserva display value legible.
10. **Fallback:** si `window.print` no está disponible o falla, el flujo conserva `fallbackToPDF` y no pierde contenido ni selección; se reconoce que la escala física final depende del visor/impresora.
11. **Asignación:** `SetCodebarModal` mantiene validación, normalización, `updateProduct`, toasts y callback; guardar un código nunca dispara impresión ni cambia el formato.
12. **Usos:** los botones de `stock-table`, `ProductDataTable` y la impresión masiva de `bulk-update/page.tsx` siguen abriendo el flujo correspondiente con los mismos datos y sin cambios de API pública.

## 10. Gate G1

**G1 confirmado:** se localizó el selector y todos los consumidores relevantes, se separó asignación de impresión, se identificó el conflicto de los cambios no confirmados de la feature anterior, y quedaron definidos el contrato estable `label-45x55`, el comportamiento exclusivo portrait, la preservación exacta de thermal/A4, los riesgos y criterios verificables. No se escribió código ni tests.
