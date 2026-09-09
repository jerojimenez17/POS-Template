# TEST_CHECKLIST — PDF altura A4 — Presupuesto y Factura en modo PDF deben ajustar a A4 portrait

## Estado
Suite **RED intencional** — define contrato TDD. Debe quedar en verde tras implementar SPEC `pdf-a4-height`.

## Archivos de test vinculados
- `pdf-a4-templates.test.ts` — AC2 AC3 AC4 AC5 AC6 AC7 AC8 AC9 AC11 AC13 (PDF_STYLES, .pdf-page, .invoice-container, paginación, thermal intact)
- `pdf-a4-export.test.ts` — AC1 AC3 AC4 AC11 AC5 (PDFExport jsPDF, format dims, margin,分页, short-content)
- `pdf-a4-printable-integration.test.tsx` — AC10 AC1 AC6-8 AC9 AC12 AC13 (entrypoints consistent, thermal intact, regression presupuesto-print-fix)

## AC medibles (13 criterios)

### AC1 — A4 portrait fijo en PDF (jsPDF 210×297 mm, portrait, unit mm)
- [ ] `exportToPDF(el, {format:"a4", orientation:"portrait"})` crea `jsPDF({format:"a4", orientation:"portrait", unit:"mm"})`; `pdf.internal.pageSize.getWidth()===210` y `getHeight()===297` (±0.1mm) para 1 página
- [ ] `exportToPDF` fuerza `portrait` cuando `format==="a4"` aunque caller pase `orientation:"landscape"` — verifica que `new jsPDF({orientation:"portrait"})` con `format:"a4"` incluso si `options.orientation==="landscape"`
- [ ] `getFormatDimensions("a4")` conceptualmente 210×297, `"thermal"` 80×297, `"letter"` 216×279 — verificado vía `jsPDF` mock y via fuente `PDFExport.ts` switch
- [ ] `downloadElementAsPDF(el, filename, {format:"a4"})` también usa `a4` portrait
- [ ] PrintableTable / PrintOrderButton / PrintOptionsPopover rama `else` (pdf) invoca `exportToPDF(..., {format:"a4", orientation:"portrait", margin:10})` — grep en 3 archivos
- [ ] No se permite `format:"thermal"` ni `orientation:"landscape"` en modo `printMode !== "thermal"` para presupuesto/factura PDF

### AC2 — @page A4 presente en PDF_STYLES
- [ ] `PDF_STYLES` contiene literal `@page` con `size: A4` y `margin: 10mm` y `portrait`
- [ ] `PDF_STYLES` contiene `@media print { @page { size: A4 portrait; margin: 10mm; } ... }` o al menos `@media print` con A4
- [ ] `PDF_STYLES` NO contiene `size: auto` (reservado a `DEFAULT_PAGE_STYLE` thermal); `DEFAULT_PAGE_STYLE` no se usa cuando `format==="a4"`
- [ ] `src/lib/print/pdf-templates.ts` exporta `PDF_STYLES` iniciado con `@page A4` o constante `PDF_A4_PAGE_STYLE = "@page { size: A4 portrait; margin: 10mm; }"` antepuesta
- [ ] Snapshot test de `PDF_STYLES` lo verifica (contiene A4, portrait, 10mm)

### AC3 — .pdf-page ocupa A4 (min-height 277mm útiles, width 190mm, box-sizing)
- [ ] Cada `.pdf-page` tiene `min-height: 277mm` (o `297mm` con box-sizing) en `PDF_STYLES`
- [ ] Cada `.pdf-page` tiene `width: 190mm` o `width: min(...,190mm)` y `max-width:100%`, `margin:0 auto`, `box-sizing:border-box`
- [ ] `.pdf-page` preserva `break-after: page` / `page-break-after: always` y `break-inside: avoid`
- [ ] Último `.pdf-page` no fuerza break extra vacío (contiene totales/leyenda, no vacío)
- [ ] `.invoice-container` tiene `max-width`/`width` compatible con 190mm útiles (ej `width: min(calc(750px*scale),190mm)` o `190mm`), no `750px*scale` fijo sin conversión
- [ ] `exportToPDF` usa `imgWidth = 190` (`pageWidth - margin*2`) y `pageContentHeight = 277` (`pageHeight - margin*2`) — verificado vía mock `addImage` args
- [ ] `html2canvas` captura canvas cuyo `height * imgWidth / width <=277mm` y hoja PDF no se recorta a altura de contenido

### AC4 — Contenido corto no recorta hoja (1 producto => hoja sigue 210×297)
- [ ] Presupuesto con 1 producto (`products.length===1`) genera PDF 1 página con `pdf.internal.pageSize` 210×297 (no 210×~80)
- [ ] `buildPDFHTML` con 1 producto produce HTML con `.pdf-page` y `PDF_STYLES` min-height 277mm (CSS estira)
- [ ] `exportToPDF` con canvas pequeño (`800x300` => scaledHeight ~71mm) aún crea jsPDF `format:"a4"` (no custom `[imgWidth, imgHeight]`); `imgHeight` idealmente `277mm` si estirado via CSS, o al menos hoja sigue A4 aunque contenido no la llene
- [ ] Short content test: `imgHeight === 277` (estirado) o pageSize permanece A4 aunque `imgHeight <277` — hoja blanca restante es papel A4

### AC5 — Contenido largo pagina en A4 (18 items por página)
- [ ] `buildPDFHTML` chunk `pageSize=18` o recalibrado: cada chunk envuelto en `<div class="pdf-page">`
- [ ] 1 producto => 2 `.pdf-page` (header+table + totals), 18 => 2, 19 => 3, 36=>3, 37=>4, 0=>≥2 sin crash
- [ ] `exportToPDF` con N `.pdf-page` captura N canvases via `html2canvas` y hace `pdf.addPage()` N-1 veces
- [ ] Truncado sin contenido partido a mitad de fila: `break-inside: avoid` y `tr { break-inside: avoid }`
- [ ] Cada página del PDF es 210×297mm, con `break-after: page` visible en CSS

### AC6 — Presupuesto en PDF muestra Presupuesto A4
- [ ] Snapshot `billType="Presupuesto"` sin CAE, `printMode="pdf"`, genera PDF A4 cuyo HTML contiene `Presupuesto` (no `Remito`/`Comprobante`)
- [ ] Sin `CUIT`/`CAE`/`N°`, sin fila `Medio de Pago`, con footer `Presupuesto — No válido como factura` (heredado `presupuesto-print-fix`)
- [ ] Hoja A4 (verificado vía `PDF_STYLES` @page y jsPDF mock) — presupuesto comparte idéntico contrato que factura
- [ ] Entrypoints (`PrintableTable`, `PrintOrderButton`, `PrintOptionsPopover`) todos resuelven presupuesto a `format:"a4"` portrait (grep)

### AC7 — Factura con CAE en PDF A4
- [ ] Snapshot con CAE válido, `printMode="pdf"`, genera PDF A4 con `Factura B` (o A/C), `N°` `PPP-NNNN`, datos fiscales, QR y banner `Comprobante Autorizado`, hoja A4 portrait
- [ ] `businessInfo` solo para `isOfficialInvoice`, `caeSection` solo para `isOfficialInvoice`, footer diferenciado
- [ ] `formatInvoiceNumberFull` parity: mismo `PPP-NNNN` para thermal y PDF

### AC8 — Remito/Comprobante sin CAE en PDF A4
- [ ] Sin CAE y sin presupuesto (`billType Remito` o `null` + isRemito), PDF A4 con `Remito` y hoja A4
- [ ] Sin `CAE:` ni `N°` fiscal pero con `Medio de Pago` y `Gracias` si es remito (diferenciado de presupuesto)
- [ ] `getDocumentPrintKind(null)` => `remito`, `buildReceiptBusinessInfo` no expone fiscal para remito

### AC9 — Térmica intacta (80mm)
- [ ] Con `printMode="thermal"`, `printThermalReceipt` sigue generando ESC/POS y fallback HTML con `@page 80mm auto`, `width 80mm`, `THERMAL_WIDTH 40`
- [ ] `src/lib/print/BrowserPrint.ts` `buildThermalPrintHTML` conserva `@page { size: 80mm auto; margin: 0; }` y `width: 80mm`
- [ ] Thermal HTML no contiene `@page A4`; ningún test térmico falla por estilos A4
- [ ] `generateThermalReceipt` para presupuesto sigue ocultando `Pago:` y mostrando `PRESUPUESTO — NO VALIDO`, para factura sigue mostrando `Pago:` y `GRACIAS`
- [ ] `PrintableTable` `if (printMode==="thermal")` → `printThermalReceipt` exclusivamente, sin `exportToPDF`

### AC10 — Entrypoints consistentes
- [ ] `PrintableTable.tsx` resuelve a `exportToPDF(..., { format:"a4", orientation:"portrait", margin:10 })` cuando no es térmico; `styleEl.textContent = PDF_STYLES` con `@page A4`
- [ ] `PrintOrderButton.tsx` `handlePrintPDF` idem `format:"a4"` portrait 10mm + `PDF_STYLES`
- [ ] `PrintOptionsPopover.tsx` `handlePrintPDF` idem
- [ ] Grep `format: "a4"` en los tres archivos y ausencia de `format: "thermal"` en rama PDF
- [ ] `BrowserPrint.tryBrowserPrint` y `printElement` seleccionan `PDF_A4_PAGE_STYLE` (`@page { size: A4 portrait; margin: 10mm; }`) cuando `format==="a4"`, no `DEFAULT_PAGE_STYLE size:auto`
- [ ] `PDF_STYLES` con A4 es el mismo inyectado por los tres entrypoints (no estilos divergentes)

### AC11 — Margen 10mm consistente
- [ ] `PDFExport` `DEFAULT_OPTIONS.margin === 10` y el CSS `@page margin 10mm` coinciden
- [ ] Ninguna rama PDF usa `5mm` (reservado stock etiquetas `print-tags-a4`) ni `0`
- [ ] `exportToPDF` computa `imgWidth = pageWidth - 20` (190) y `margin` usado en `addImage(x=10,y=10)` — verificado vía mock
- [ ] `BrowserPrint` `PDF_A4_PAGE_STYLE` también margin 10mm

### AC12 — TypeScript strict pasa
- [ ] `tsc --noEmit --skipLibCheck` sin errores; `npm run build` sin errores
- [ ] No `any` nuevos; firmas `PrintOptions` tipadas `format: "a4"|"letter"|"thermal"`, `orientation: "portrait"|"landscape"` ya existentes
- [ ] Todos los nuevos tests compilan con `strict:true`, `jsx:react-jsx`, imports vía `@/` alias
- [ ] `PrintOptionsPopover`, `PrintableTable`, `PrintOrderButton` handlers tipados sin `any`

### AC13 — No regresión `presupuesto-print-fix`
- [ ] Los 3 fixtures (`facturaConCAE`, `remitoSinCAE`, `presupuestoSinCAE`) siguen mostrando `billType` correcto en los tres canales (térmica ESC/POS, fallback HTML térmico, PDF A4)
- [ ] Presupuesto sigue sin `CUIT`/`CAE`/`N°`/`Pago`/`Gracias`, con `No válido`; remito con `Pago`+`Gracias` sin fiscal; factura con todo fiscal + `Pago`+`Gracias`
- [ ] `getBillTypeDisplay("Presupuesto", _ , _)` sigue retornando `Presupuesto` prioritario; `getDocumentPrintKind` con presupuesto => `presupuesto`
- [ ] `createBillCheckoutSnapshot` preserva presupuesto snapshot (billtype, products) — parity térmica+PDF

## Casos positivos (deben pasar tras fix)
- `PrintableTable` en `printMode="pdf"` con 1 producto Presupuesto genera PDF A4 210×297 con `Presupuesto — No válido` y sin `CUIT`
- Factura con CAE 1 producto genera PDF A4 con `Factura B`, `N° 001-0001`, `CUIT`, `CAE:`, `Comprobante Autorizado`
- Remito sin CAE genera PDF A4 con `Remito`, sin `CAE:`, con `Medio de Pago`
- 37 productos presupuesto genera 4 `.pdf-page` → 4 páginas PDF A4 cada una con break-after
- Térmica sigue imprimiendo ticket 80mm intacto para los 3 tipos

## Casos negativos (deben fallar si se regresiona)
- `PDF_STYLES` sin `@page` o con `size:auto` → fail AC2
- `.pdf-page` sin `min-height:277mm`/`297mm` → fail AC3
- `.invoice-container` solo `750px*scale` sin cap 190mm → fail AC3
- `exportToPDF` con `format:"a4"` crea `jsPDF` con `[210,120]` custom o `landscape` → fail AC1
- Entrypoint llama `exportToPDF` con `format:"thermal"` en modo pdf → fail AC10
- Browser print fallback usa `size:auto` para a4 → fail AC2/AC10
- Presupuesto PDF muestra `CUIT:` o `CAE:` o `N°` → fail AC6/AC13
- Presupuesto PDF muestra `¡Gracias por su compra!` o `Medio de Pago:` → fail AC6/AC13
- `printThermalReceipt` deja de ocultar `Pago:` para presupuesto → fail AC9/AC13

## Edge cases
- `billType=" Presupuesto "` con espacios → `Presupuesto` (trim)
- `cae="   "` / `""` / `null` → `remito`, no `official-invoice`
- `cae=" 123 "` con espacios → `official-invoice` si no es presupuesto
- Factura con `pointOfSale` ausente → `formatInvoiceNumberFull` omite `N°` sin `undefined`/`NaN`
- `qrData` residual sin CAE → no genera QR ni bloquea impresión presupuesto
- `discount` / `discountAmount` undefined → no fila descuento, sin crash
- Viewport pequeño (mobile) `html2canvas` scale 2 → captura sigue con width 190mm normalizado vía `onclone`
- `orientation: "landscape"` pasado por error para a4 → forzado a `portrait` (feature exige portrait)
- `margin` no provisto → default 10mm, no 0 ni 5mm
- Short content `canvas.height` 200px → `imgHeight` debe ser 277mm (hoja A4) no 71mm recortado (via CSS min-height pre-raster)
- `products=[]` vacío → no crash, al menos 2 `.pdf-page` (tabla vacía + totales) con estilos A4

## Notas
- Todos los tests son determinísticos, sin flaky timers. Usan `new Date` fijo 2026-03-15 y mocks `getBusinessBillingInfoAction`, `html2canvas`, `jspdf`, `qrcode`.
- RED phase esperado: todos los AC2/AC3/AC10 tests de STYLES y entrypoints fallen hasta que se aplique fix A4; export tests de `orientation forced` y `imgHeight===277` también fallan.
- No se implementa fix en este paso — solo tests que deben fallar hasta que se aplique SPEC.

