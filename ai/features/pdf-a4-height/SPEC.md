# SPEC: PDF altura A4 — Presupuesto y Factura en modo PDF deben ajustar a A4 portrait

## Estado

Especificación arquitectónica — Paso 1 workflow TDD. No incluye código ni tests. Define el contrato A4 para el modo `printMode !== "thermal"` y las correcciones necesarias en `pdf-templates.ts`, `PDFExport.ts`, `BrowserPrint.ts` y los entrypoints `PrintableTable.tsx` / `PrintOrderButton.tsx` / `PrintOptionsPopover.tsx`. Corrige la observación: "En pdf debería ser tamaño a4. el alto del pdf generado ya sea presupuesto o factura debe ajustar a a4 cuando trabajamos en modo pdf". Requiere que `presupuesto-print-fix` ya diferencie `Presupuesto` vs `Factura` vs `Remito`.

## Objetivo

Cuando `printMode !== "thermal"` (valor `"pdf"` de `BillContext`), **toda** generación PDF — `Presupuesto`, `Factura` con CAE, `Remito/Comprobante` sin CAE — debe producir un documento **A4 portrait** con dimensiones físicas verificables. La altura del contenido debe ajustarse/extenderse a A4, la paginación debe respetar la altura útil A4, y no debe haber regresión en térmica (80mm).

## Contexto y hallazgos confirmados

### Implementación actual relevante

| Archivo | Estado actual | Líneas clave |
|---|---|---|
| `src/lib/print/BrowserPrint.ts` | `buildThermalPrintHTML` usa `@page { size: 80mm auto; margin: 0; }` correcto para térmica. `DEFAULT_PAGE_STYLE` usa `@page { size: auto; margin: 10mm; }` genérico, sin `A4`. `tryBrowserPrint` inyecta `pageStyle` y `criticalStyles`; si `PDFExport` no impone A4, el print browser queda `auto`. | 259 `@page 80mm`, 460 `size: auto` |
| `src/lib/print/pdf-templates.ts` | `PDF_STYLES` sin `@page`. Define `.invoice-container { width: 750px * scale }` (≈975px con `scale 1.3`) y `.pdf-page { break-after: page }` pero sin altura A4. `buildPDFHTML` paginación `pageSize = 18` items por `.pdf-page`; wrapper sin `min-height` A4. | 38-88 estilos, 215 wrapper, 201-242 paginación |
| `src/lib/print/PDFExport.ts` | `getFormatDimensions` correcto: `a4 210×297`, `thermal 80×297`, `letter 216×279`. `exportToPDF` crea `jsPDF({ orientation, unit:"mm", format: format==="thermal" ? [w,h] : format })` — pasa string `"a4"` a jsPDF (válido) pero lógica de `imgHeight = Math.min(pageContentHeight, canvas*h/imgW)` **no estira** contenido corto a altura A4 y no garantiza `orientation portrait` para este feature. `pageContentHeight = pageHeight - margin*2` con `margin 10` default → altura útil `277mm`. Misma limitación en `downloadElementAsPDF`. | 25-35 dims, 85-103 creación y altura |
| `src/components/Billing/PrintableTable.tsx` | `handlePrint` rama `else` sí usa `format: "a4"` y `PDF_STYLES` + `buildPDFHTML`. Correcto por contrato, pero si `PDF_STYLES` no trae `@page A4`, el canvas capturado no tiene ancho/alto A4 y el PDF resultante depende solo de `PDFExport` sin estilos coherentes. Verifica que `isPresupuesto` y `isRemito` ya se resuelven via `receiptBusinessInfo`. | 191-222 |
| `src/app/(protected)/account-ledger/[id]/PrintOrderButton.tsx` | `handlePrintPDF` usa `format: "a4"` correctamente. Mismo gap de estilos. | 96-101 |
| `src/components/Billing/PrintOptionsPopover.tsx` | `handlePrintPDF` usa `format: "a4"` correctamente. | 127-132 |
| `src/context/BillContext.tsx` | `PrintMode = "thermal" | "pdf"` | 6 |
| `src/lib/print/receipt-data.ts` | `DocumentPrintKind` debería incluir `"presupuesto"` tras `presupuesto-print-fix`; si no, debe extenderse. | 1 |

### Gaps identificados

| # | Gap | Evidencia | Impacto |
|---|---|---|---|
| G1 | `PDF_STYLES` sin `@page { size: A4 }` | 38-88 no contiene `@page` | El HTML clonado por `html2canvas` conserva `width: 750*scale` pero sin referencia A4; el browser print fallback `DEFAULT_PAGE_STYLE size:auto` nunca fuerza A4. Altura percibida "corta" o no ajusta. |
| G2 | `.invoice-container` fijo 975px no mapeado a mm A4 | 47 `width: calc(750px * scale)` | A 210mm útiles (190mm con margen 10mm), 975px excede/canibaliza escala; `html2canvas` escala dependiente de viewport y no de mm. |
| G3 | `PDFExport.exportToPDF` no estira contenido corto | 102 `Math.min(pageContentHeight, canvas*h/imgW)` | Si factura corta (pocos items), `imgHeight` << `pageContentHeight`; el PDF queda con gran blanco debajo sin ocupar la hoja — usuario percibe "alto no ajusta a A4". Contradice expectativa de hoja completa. |
| G4 | `.pdf-page` sin altura A4 explícita | 48 `break-after` sin `min-height` | Paginación basada en 18 items no garantiza que cada `.pdf-page` mida 277mm útiles; `html2canvas` captura altura intrínseca del div, no altura A4. Páginas de 1 item son muy bajas. |
| G5 | `DEFAULT_PAGE_STYLE size:auto` usado cuando `format==="a4"` en `tryBrowserPrint` fallback | 461 | Si `printElement` cae a `tryBrowserPrint` con `format a4`, `@page auto` no fija A4. |
| G6 | `isLandscape` no bloqueado para feature A4 | 80 `orientation` | Permitir `landscape` rompería contrato A4 portrait exigido. Debe forzarse portrait para presupuesto/factura PDF. |
| G7 | Inconsistencia de margen: `PDFExport` 10mm, `print-tags-a4` 5mm, `BrowserPrint` 10mm | varias | Margen debe ser consistente para A4 portrait de esta feature: 10mm (default `PDFExport`) es el contrato elegido. |
| G8 | `captureElement` no normaliza width a A4 antes de rasterizar | 37-60 | Sin ancho normalizado, `canvas.width` varía con viewport y produce `imgWidth` inconsistente. |

## Contrato A4 (definición normativa para esta feature)

| Parámetro | Valor normativo | Origen |
|---|---|---|
| Hoja | **A4 portrait 210mm × 297mm** | ISO 216 |
| Orientación | `portrait` fijo cuando `printMode !== "thermal"` para presupuesto/factura | feature request |
| Unidad jsPDF | `mm` | `PDFExport.ts:87` |
| `format` jsPDF | string literal `"a4"` (no array custom) | `PDFExport.ts:88` rama no-thermal |
| Margen | **10mm** por lado (top/right/bottom/left) | `PDFExport DEFAULT_OPTIONS.margin = 10` |
| Área útil | **190mm ancho × 277mm alto** (`pageWidth-margin*2`, `pageHeight-margin*2`) | derivado |
| `@page` CSS | `@page { size: A4 portrait; margin: 10mm; }` dentro de `PDF_STYLES` y `PDF_A4_PAGE_STYLE` | nuevo |
| Altura mínima por página lógica | `277mm` útiles; `.pdf-page` debe tener `min-height` equivalente en px/mm o ocupar altura útil (estirar) | nuevo |

Presupuesto y Factura comparten idéntico contrato; no hay variante de tamaño por tipo documental.

## Requisitos funcionales

### RF1 — Presupuesto y Factura en PDF siempre A4 portrait
Cuando `printMode === "pdf"` (cualquier valor distinto de `"thermal"`), el flujo `PrintableTable.handlePrint` else-branch, `PrintOrderButton.handlePrintPDF` y `PrintOptionsPopover.handlePrintPDF` deben invocar `exportToPDF` con `format: "a4"`, `orientation: "portrait"`, `margin: 10`, `scale` coherente y `documentTitle/filename` según tipo. No se permite `format: "thermal"` ni `orientation: "landscape"` en este modo.

### RF2 — `PDF_STYLES` debe declarar `@page A4`
`pdf-templates.ts` debe exportar estilos que incluyan `@page { size: A4 portrait; margin: 10mm; }` y regla `@media print` equivalente. No debe alterar estilos térmicos (`80mm`). Idealmente introducir constante `PDF_A4_PAGE_STYLE` o ampliar `PDF_STYLES` con bloque `@page`.

### RF3 — `.pdf-page` y `.invoice-container` deben reflejar A4
- `.invoice-container` debe tener `max-width` compatible con 190mm útiles y `width` relativo (ej. `190mm` o `100%` con `max-width: 190mm`) en contexto PDF, no `750px*scale` fijo sin conversión. Mantener `scale` existente pero aplicado sobre base A4.
- Cada `.pdf-page` debe tener `min-height` que corresponda a 277mm útiles (o `297mm` con box-sizing) y `box-sizing: border-box`, con `page-break-after: always` excepto última, y `break-inside: avoid` ya existente. Deben permitir estiramiento vertical sin overflow.

### RF4 — `PDFExport.exportToPDF` debe respetar A4 y estirar contenido corto
- Debe computar `formatDims = 210×297` para `a4`, `pageWidth/pageHeight` con `isLandscape=false`, `imgWidth = 190mm`, `pageContentHeight = 277mm`.
- Para cada canvas: `scaledHeight = canvas.height * imgWidth / canvas.width`; `imgHeight = Math.min(pageContentHeight, scaledHeight)` hoy trunca pero debe **garantizar que la imagen ocupe el ancho A4 y si es corta no deje altura indefinida**: la página PDF sigue siendo 297mm aunque el contenido no la llene — el blanco restante es papel A4, no recorte. Opcionalmente centrar verticalmente o estirar visualmente con `min-height` CSS previo, pero la dimensión del `jsPDF` debe permanecer `a4`. No cambiar a `custom [imgWidth, imgHeight]` para `a4`.
- No debe recortar: si `scaledHeight > pageContentHeight`, paginación ya dividió en múltiples canvases, por lo que `Math.min` sigue válido; si aún excede, debe confiar en paginación, no escalar fuera de página.

### RF5 — Paginación `.pdf-page` coherente con altura A4
`buildPDFHTML` debe mantener chunk `pageSize = 18` o recalibrar si la altura A4 con nueva tipografía/scale exige menos filas por página para no desbordar 277mm. Cada chunk envuelto en `<div class="pdf-page">`. El último no debe forzar break extra vacío.

### RF6 — No regresión térmica
`buildThermalPrintHTML` y `generateThermalReceipt` mantienen `@page 80mm`, `width 80mm`, `THERMAL_WIDTH 40`. `printThermalReceipt` no debe ser afectado por cambios PDF. `PrintMode === "thermal"` sigue invocando `printThermalReceipt` exclusivamente.

### RF7 — Consistencia de estilos entre entrypoints
`PrintableTable`, `PrintOrderButton`, `PrintOptionsPopover` deben inyectar el mismo `PDF_STYLES` (con `@page A4`) antes de `exportToPDF`. No duplicar estilos divergentes.

### RF8 — TypeScript strict sin nuevas deps
No introducir `any`. No nuevas dependencias. Reutilizar `jsPDF`, `html2canvas`, `qrcode` existentes. Tipar `PrintOptions` con `format: "a4" | "letter" | "thermal"` y `orientation: "portrait" | "landscape"` ya existentes.

## Arquitectura técnica

### Estrategia general
Separar claramente mundo térmico (80mm, `size: auto`/`80mm auto`) de mundo PDF A4 (210×297 portrait, 10mm). PDF nunca debe heredar `DEFAULT_PAGE_STYLE size:auto`. Introducir helper `getPDFPageStyle()` o constante `PDF_A4_PAGE_STYLE` y asegurar que `PDF_STYLES` lo incluya. Normalizar que todo caller PDF pase `format:"a4"` y que `PDFExport` lo respete.

### Cambios por archivo

#### `src/lib/print/pdf-templates.ts` (cambio principal)
- Añadir al inicio de `PDF_STYLES`:
  ```css
  @page { size: A4 portrait; margin: 10mm; }
  @media print { @page { size: A4 portrait; margin: 10mm; } html, body { width: 210mm; } }
  ```
  Alternativa: exportar `export const PDF_A4_PAGE_STYLE = "@page { size: A4 portrait; margin: 10mm; }"` y anteponerlo a `PDF_STYLES`.
- Revisar `.invoice-container`: cambiar `width: calc(750px * var(--pdf-layout-scale))` a `width: min(calc(750px * var(--pdf-layout-scale)), 190mm)` o `width: 190mm` cuando el contenedor está en contexto A4, manteniendo `margin: 0 auto`. Evaluar si `750px*1.3=975px ≈ 257mm` excede 190mm → debe caparse a 190mm.
- Añadir a `.pdf-page`: `min-height: 277mm; /* o calc(297mm - 20mm) */ width: 190mm; max-width: 100%; margin: 0 auto; box-sizing: border-box;` además de `break-after: page`.
- Mantener `PDF_LAYOUT_SCALE = 1.3` pero documentar que scale aplica sobre base 190mm, no sobre 750px absoluto, para no desbordar.
- No tocar lógica de `isPresupuesto`/`isOfficialInvoice` — ya corregida por `presupuesto-print-fix`; verificar que sigue: `businessInfo` solo para `isOfficialInvoice`, `caeSection` solo para `isOfficialInvoice`, footer diferenciado.

#### `src/lib/print/PDFExport.ts` (ajuste fino)
- Confirmar `getFormatDimensions("a4") => 210×297` permanece.
- En `exportToPDF` y `downloadElementAsPDF`:
  - Forzar `orientation = "portrait"` cuando `format === "a4"` (ignorar `options.orientation` si contradice, o documentar que `"a4"` solo portrait).
  - Mantener `new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" })` para no-thermal; no usar `[pageWidth,pageHeight]` para a4.
  - Mantener `margin = 10` default; documentar que es el margen A4.
  - `captureElement` debe recibir `scale` coherente (default 2) y opcionalmente normalizar ancho del elemento clonado a 190mm antes de rasterizar (vía `onclone` set `width: 190mm`).
  - Documentar comportamiento `imgHeight`: contenido corto queda arriba con blanco debajo pero hoja sigue A4 (no recorte). Opcional: centrar o aplicar `min-height` CSS previo para que canvas ya mida 277mm y `imgHeight === pageContentHeight`.
- No cambiar firma `exportToPDF(element, options)`.

#### `src/lib/print/BrowserPrint.ts` (acotar)
- Extraer `DEFAULT_PAGE_STYLE` como genérico `size:auto` solo para thermal/browser genérico; introducir `PDF_A4_PAGE_STYLE = "@page { size: A4 portrait; margin: 10mm; } ..."` o reutilizar el de `pdf-templates` si se centraliza.
- `tryBrowserPrint` y `printElement` deben seleccionar `pageStyle` según `options.format`: si `format==="a4"` usar `PDF_A4_PAGE_STYLE`, si `thermal` usar `80mm auto`. Hoy `pageStyle || DEFAULT_PAGE_STYLE` ignora `format`; debe condicionarse.
- `buildThermalPrintHTML` sin cambios (`@page 80mm auto`).
- No exponer thermal a cambios A4.

#### `src/components/Billing/PrintableTable.tsx`
- Verificar rama `else`: ya cumple `format:"a4"`; asegurar que `orientation:"portrait"` y `margin:10` se pasan explícitos o rely on default consistente.
- Inyección de estilos: `styleEl.textContent = PDF_STYLES` ya incluye `@page A4` tras RF2; no inyectar `DEFAULT_PAGE_STYLE`.
- Mantener `isPresupuesto`/`isOfficialInvoice` ya corregidos; filename `Presupuesto_*` vs `Factura_*` permanece.
- `printMode` check permanece `=== "thermal"` → `printThermalReceipt`, else → PDF A4.

#### `src/app/(protected)/account-ledger/[id]/PrintOrderButton.tsx`
- `handlePrintPDF` ya usa `format:"a4"`; añadir `orientation:"portrait"`, `margin:10` explícitos si se quiere blindar, y asegurar `styleEl.textContent = PDF_STYLES` con `@page A4`.
- No cambiar `getPrintData` billType (ya correcto `pending → Presupuesto`).

#### `src/components/Billing/PrintOptionsPopover.tsx`
- Mismo ajuste que `PrintOrderButton`: blindar `format:"a4"`, `orientation:"portrait"`.

#### `src/context/BillContext.tsx` / `BillProvider.tsx`
- Sin cambios; solo confirmar `PrintMode` y default.

### Diagrama de flujo (PDF modo)
```
User toggles PrintModeSelector → BillContext.printMode = "pdf"
→ BillButtons.handlePrint(snapshot) o PrintableTable auto-trigger
→ PrintableTable.handlePrint():
   if thermal → printThermalReceipt(80mm)
   else
     receiptData = buildReceiptBusinessInfo(..., billType) // presupuesto-print-fix
     html = buildPDFHTML(receiptData, { qrSvgDataUrl }) // .pdf-page chunks + estilos A4
     wrapper = <div><style>PDF_STYLES (@page A4)</style> + html</div>
     exportToPDF(wrapper, { format:"a4", orientation:"portrait", margin:10 })
       → jsPDF a4 portrait 210×297 mm
       → html2canvas por .pdf-page
       → addImage por página con imgWidth 190mm, pageContentHeight 277mm
       → blob → window.open → print
```

## Modelos e interfaces

No hay cambios de esquema Prisma ni nuevas tablas. Solo contratos de impresión:

```typescript
// src/lib/print/BrowserPrint.ts y PDFExport.ts — ya existente, se blinda uso
export interface PrintOptions {
  documentTitle?: string;
  pageStyle?: string;      // para a4 debe ser "@page { size: A4 portrait; margin: 10mm; }"
  scale?: number;          // default 2
  filename?: string;
  format?: "a4" | "letter" | "thermal"; // PDF presupuesto/factura → "a4"
  orientation?: "portrait" | "landscape"; // a4 → "portrait" forzado
  margin?: number;         // a4 → 10
  targetWindow?: Window | null;
  fallbackToPDF?: boolean; // BrowserPrint
  onFallback?: () => void;
  highContrast?: boolean;
}

// src/lib/print/pdf-templates.ts — estilos
export const PDF_LAYOUT_SCALE = 1.3;
export const PDF_STYLES: string; // debe iniciar con @page A4 portrait 10mm
export const PDF_A4_PAGE_STYLE?: string; // opcional helper "@page { size: A4 portrait; margin: 10mm; }"

// src/lib/print/receipt-data.ts — ya corregido por presupuesto-print-fix
export type DocumentPrintKind = "official-invoice" | "remito" | "presupuesto";
export function getDocumentPrintKind(cae: string | null | undefined, billType?: string | null): DocumentPrintKind;
export function buildReceiptBusinessInfo(
  businessName: string,
  cae: string | null | undefined,
  businessInfo?: ReceiptBusinessInfo,
  billType?: string | null,
): { businessName: string; documentKind: DocumentPrintKind; businessInfo?: ReceiptBusinessInfo };

// ThermalReceiptData y PDFTemplateOptions sin cambios estructurales
```

Invariantes:
- `format==="a4"` ⇒ `orientation==="portrait"` && `margin===10` && `@page size A4 portrait`.
- `format==="thermal"` ⇒ `@page 80mm auto` && `width 80mm`.
- Ningún caller PDF debe pasar `size:auto`.

## Estructura de archivos y alcance

### A MODIFICAR

| Archivo | Cambio |
|---|---|
| `src/lib/print/pdf-templates.ts` | Añadir `@page A4 portrait 10mm` a `PDF_STYLES`; ajustar `.invoice-container` y `.pdf-page` a dimensiones A4 (190×277 útiles); opcional export `PDF_A4_PAGE_STYLE` |
| `src/lib/print/PDFExport.ts` | Blindar `orientation portrait` para `a4`, asegurar `format:"a4"` string a jsPDF, documentar `imgHeight` vs `pageContentHeight`, opcional normalizar ancho clon a 190mm, mantener `margin 10` |
| `src/lib/print/BrowserPrint.ts` | Introducir/seleccionar `PDF_A4_PAGE_STYLE` cuando `format==="a4"` en vez de `DEFAULT_PAGE_STYLE size:auto` |
| `src/components/Billing/PrintableTable.tsx` | Confirmar `format:"a4"` + `orientation:"portrait"` + `margin:10` + `PDF_STYLES` con A4; sin lógica nueva |
| `src/app/(protected)/account-ledger/[id]/PrintOrderButton.tsx` | Idem blindaje `format:"a4"` portrait |
| `src/components/Billing/PrintOptionsPopover.tsx` | Idem |

### REVISADOS sin cambio esperado (verificar no regresión)

| Archivo | Razón |
|---|---|
| `src/lib/print/receipt-data.ts` | Ya debe exponer `presupuesto` kind tras fix previo; si no, extender |
| `src/context/BillContext.tsx` | `PrintMode` ya correcto |
| `src/components/Billing/PrintModeSelector.tsx` | Selector thermal/pdf |
| `src/components/Billing/BillButtons.tsx` | Ya crea snapshot `Presupuesto` y llama `handlePrint` con snapshot |

### NO TOCAR

- `prisma/schema.prisma` — sin migración.
- `src/lib/print/BrowserPrint.ts:buildThermalPrintHTML` — térmica 80mm intacta.
- Nuevas dependencias — prohibido.

## Criterios de aceptación medibles

- [ ] **AC1 — A4 portrait fijo en PDF:** Con `printMode="pdf"`, generar PDF desde `PrintableTable` (presupuesto), `PrintOrderButton` y `PrintOptionsPopover` produce `jsPDF` con `format==="a4"`, `orientation==="portrait"`, `unit==="mm"`; inspección de `pdf.internal.pageSize.getWidth() === 210` y `getHeight() === 297` (±0.1mm) para 1 página.
- [ ] **AC2 — @page A4 presente:** `PDF_STYLES` contiene literal `@page` con `size: A4` y `margin: 10mm` y `portrait`; `DEFAULT_PAGE_STYLE` no se usa cuando `format==="a4"` (buscar `size: auto` no aparece en rama PDF). Snapshot test de `PDF_STYLES` lo verifica.
- [ ] **AC3 — .pdf-page ocupa A4:** Cada `.pdf-page` renderizado por `buildPDFHTML` tiene `min-height` equivalente a `277mm` útiles (o `297mm` con margin box) y `width` ≤190mm; `html2canvas` captura canvas cuyo `height * imgWidth / width` ≤277mm y la hoja PDF no se recorta a altura de contenido. Verificar que `exportToPDF` usa `imgWidth = 190` y `pageContentHeight = 277`.
- [ ] **AC4 — Contenido corto no recorta hoja:** Presupuesto con 1 producto genera PDF de 1 página con dimensiones físicas 210×297mm (no 210×~80mm). Inspección del Blob PDF: `pdf.internal.getNumberOfPages() === 1` y tamaño de página A4, aunque el contenido ocupe <50% del alto.
- [ ] **AC5 — Contenido largo pagina en A4:** Presupuesto/factura con >18 productos genera N páginas (`Math.ceil(products/18)`), cada una 210×297mm, con `break-after: page` entre páginas y sin contenido partido a mitad de fila (`break-inside: avoid`).
- [ ] **AC6 — Presupuesto en PDF muestra Presupuesto A4:** Snapshot con `billType="Presupuesto"` sin CAE, en `printMode="pdf"`, genera PDF A4 cuyo HTML contiene `Presupuesto` (no `Remito`/`Comprobante`), sin `CUIT`/`CAE`/`N°`, sin fila `Pago`, con footer `Presupuesto — No válido como factura` (heredado de `presupuesto-print-fix`) y hoja A4.
- [ ] **AC7 — Factura con CAE en PDF A4:** Snapshot con CAE válido, en `printMode="pdf"`, genera PDF A4 con `Factura B` (o A/C), `N°`, datos fiscales, QR y banner `Comprobante Autorizado`, en hoja A4 portrait 210×297.
- [ ] **AC8 — Remito/Comprobante sin CAE en PDF A4:** Sin CAE y sin presupuesto, PDF A4 con `Remito` y hoja A4.
- [ ] **AC9 — Térmica intacta:** Con `printMode="thermal"`, `printThermalReceipt` sigue generando ESC/POS y fallback HTML con `@page 80mm auto`, `width 80mm`, sin `@page A4`; ningún test térmico falla por estilos A4.
- [ ] **AC10 — Entrypoints consistentes:** `PrintableTable`, `PrintOrderButton`, `PrintOptionsPopover` los tres resuelven a `exportToPDF(..., { format:"a4", orientation:"portrait" })` cuando no es térmico; grep de `format: "a4"` en los tres archivos y ausencia de `format: "thermal"` en rama PDF.
- [ ] **AC11 — Margen 10mm consistente:** `PDFExport.DEFAULT_OPTIONS.margin === 10` y el CSS `@page margin 10mm` coinciden; ninguna rama PDF usa `5mm` (reservado a etiquetas stock) ni `0`.
- [ ] **AC12 — TypeScript strict pasa:** `npm run build` y `tsc --noEmit` sin errores; no `any` nuevos; firmas `PrintOptions` tipadas.
- [ ] **AC13 — No regresión `presupuesto-print-fix`:** Los 3 fixtures (`facturaConCAE`, `remitoSinCAE`, `presupuestoSinCAE`) siguen mostrando `billType` correcto en los tres canales (térmica ESC/POS, fallback HTML térmico, PDF A4).

## Riesgos y mitigaciones

| Riesgo | Impacto | Mitigación |
|---|---|---|
| `PDF_STYLES` crece y afecta captura `html2canvas` (width 190mm capado) | Layout roto o texto cortado | Mantener `max-width:100%` y `overflow-wrap: anywhere`; probar con descripción larga y tabla 18 filas |
| `imgHeight = Math.min(...)` percibido como no estirar | Usuario ve blanco inferior y cree que no es A4 | Documentar que hoja sigue A4 aunque contenido corto; opcional centrar o aplicar `min-height` CSS para que canvas ya ocupe 277mm |
| Seleccionar `@page` equivocado en `printElement` fallback | Browser print sale `auto` y no A4 | Condicionar `pageStyle` a `format`; testear `printElement` rama `format==="a4"` |
| Cambiar `.invoice-container` de 750px a 190mm rompe scale visual | Factura se ve más angosta/pequeña | Conservar `PDF_LAYOUT_SCALE` pero aplicar sobre 190mm; comparar screenshot antes/después |
| Forzar `portrait` rompe posible uso futuro `landscape` | Feature pide landscape y se bloquea | Solo forzar cuando `format==="a4"` para presupuestos/facturas; dejar `letter` libre si existe |
| `pageSize=18` desborda 277mm con nueva base A4 | Tabla corta siguiente página inesperadamente | Medir altura real de 18 filas con 190mm y scale 1.3; si excede, bajar a 15-16 y ajustar test |
| Regresión térmica por reutilizar estilo A4 | Ticket térmico sale A4 o cortado | Aislar constantes: `THERMAL_PAGE_STYLE` vs `PDF_A4_PAGE_STYLE`; test térmico no contiene `210mm` |

## Fuera de alcance

- Cambiar numeración ARCA, CAE, QR, totales, descuentos o `createBudgetAction`.
- Migraciones Prisma o cambios de esquema.
- Rediseño del contenido legal AFIP o de totales.
- Soporte `landscape` para presupuesto/factura (solo portrait).
- Cambios en etiquetas stock (`a4` de productos, `thermal 6cm`, `label-45x55`).
- Nuevas dependencias o cambios en `next.config`/`tailwind`.

## Notas de implementación (no código)

- Implementación mínima: añadir `@page A4` a `PDF_STYLES`, capar `invoice-container` a 190mm, añadir `min-height` a `.pdf-page`, y condicionar `BrowserPrint` a elegir estilo A4 cuando `format==="a4"`. No refactorizar pipeline completa.
- Si se introduce `PDF_A4_PAGE_STYLE`, centralizarlo en `pdf-templates.ts` y reexportar desde `BrowserPrint.ts` para no duplicar literales.
- Verificar los tres entrypoints generan el mismo HTML base (comparar `buildPDFHTML` output) y solo difieren en `targetWindow`/`filename`.
- Validar manualmente: imprimir presupuesto y factura en Chrome → Print Preview debe mostrar "A4" en destino y previsualización con márgenes 10mm; guardar PDF y abrir en Acrobat → propiedades `Page size: A4 (210 × 297 mm)`.

