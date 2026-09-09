# SPEC: Corrección de impresión de Presupuesto creado desde newBill (Presupuesto impreso como Remito)

## Estado

Especificación arquitectónica — Paso 1 del workflow TDD. No incluye implementación ni tests. Reemplaza el comportamiento defectuoso donde un presupuesto creado desde `src/app/(protected)/newBill/page.tsx` vía `src/components/Billing/BillButtons.tsx` se imprime con título `Remito`/`Comprobante`, leyenda `Medio de pago`/`Pago:` y pie `¡Gracias por su compra!`.

## Objetivo

Cuando se crea un presupuesto desde `newBill` (modal `budget` de `BillButtons.tsx` → `createBudgetAction` → `handlePrint` con snapshot `billType="Presupuesto"`), la salida impresa — vista `PrintableTable`, PDF (`pdf-templates.ts`/`PDFExport`) y térmica (`BrowserPrint.ts` ESC/POS + fallback HTML)— debe mostrar **documento `Presupuesto`** como tipo/título, no `Remito`/`Comprobante`. Debe diferenciarse fiscalmente de remito y factura: no mostrar datos fiscales ni numeración ARCA, sustituir el bloque de pago y el agradecimiento de venta por una leyenda de presupuesto no fiscal. Sin regresiones para `Remito` (sin CAE, sin presupuesto) ni `Factura` (con CAE).

## Contexto y hallazgos confirmados

### Flujo defectuoso presupuesto (newBill)

1. `BillButtons.tsx` (líneas 565-573) en `onSuccess` budget:
   ```ts
   const snapshot = createBillCheckoutSnapshot(BillState, "Presupuesto");
   handlePrint(undefined, targetWin, snapshot);
   resetCheckout();
   ```
   Construye correctamente un snapshot con `billType="Presupuesto"` (vía `utils/billing.ts:normalizeBillType` que preserva `Presupuesto`).

2. `ProductsTable.tsx:28` define `handlePrint = (cae?: CAE, win?: Window | null) => { ... }` — **ignora el 3er parámetro** `snapshot`. El snapshot se descarta. La prop de `BillButtons` es `handlePrint: (cae?: CAE, win?: Window | null, snapshot?: typeBillState) => void` (línea 44), por lo que el contrato existe pero el consumidor lo rompe.

3. `PrintableTable.tsx` recibe `printTrigger` y `forceCae` de `ProductsTable`, pero **no recibe snapshot**. `state` viene de `BillContext.BillState || externalState || defaultBillState` y `resetCheckout()` limpia el contexto inmediatamente después de disparar `handlePrint`. Resultado: al dispararse `handlePrint` en `PrintableTable`, `state.billType` ya no es `Presupuesto`, es el estado reseteado (fallback `Factura C`/`Remito`).

4. `PrintableTable.tsx:142-150` deriva título:
   ```ts
   receiptBusinessInfo = buildReceiptBusinessInfo(..., activeCae?.CAE, billingInfo)
   isRemito = receiptBusinessInfo.documentKind === "remito"
   billTypeDisplay = getBillTypeDisplay(state.billType, activeCae?.CAE, isRemito)
   ```
   y `handlePrint` (línea 152+) construye `ThermalReceiptData` desde `state`, no desde snapshot. `getBillTypeDisplay` (`lib/utils/bill-type.ts:35`) hace `if (!cae?.trim()) return isRemito ? "Remito" : "Comprobante"` **antes** de inspeccionar `billType`. Con `cae=undefined` y `billType="Presupuesto"` devuelve `Remito`. Misma lógica aplica en:
   - `pdf-templates.ts:135` → `getBillTypeDisplay(billType, cae?.cae, !isOfficialInvoice)`
   - `BrowserPrint.ts:107` / `236` → `getBillTypeDisplay(billType, cae?.cae)` sin flag, también colapsa a remito.

5. `receipt-data.ts:11` `getDocumentPrintKind(cae)` retorna solo `"official-invoice" | "remito"`. No existe kind `"presupuesto"`. Por tanto todo sin CAE se clasifica remito, incluso presupuesto.

6. Footers/payments hardcodeados:
   - `pdf-templates.ts:251` siempre `¡Gracias por su compra!`
   - `BrowserPrint.ts:173,309` siempre `Pago:` y `223,338` `GRACIAS POR SU COMPRA`
   - `PrintableTable.tsx:311` siempre `Medio de Pago: {paidMethod}`
   Presupuesto no debería presentarse como venta pagada.

### Flujo correcto (histórico)

`account-ledger/[id]/PrintOrderButton.tsx:54` calcula `billType = status === "pendiente" ? "Presupuesto" : "Comprobante"` y lo pasa directo a `ThermalReceiptData` sin depender de `getDocumentPrintKind` con snapshot perdido. Por eso el histórico sí imprime presupuesto correctamente. El bug es exclusivo del flujo live `newBill`.

### Dependencias relacionadas

- `src/utils/billing.ts:28-32` `normalizeBillType` preserva `Remito | Presupuesto`; `createBillCheckoutSnapshot` clona `CAE` y fecha y normaliza billType — correcto.
- `src/models/billType.ts` declara `BillType = "Factura A"|"Factura B"|"Factura C"|"Remito"|"Presupuesto"` (el enum `BillTypes` solo expone A/B/C). Usar string literal `Presupuesto` es válido.
- `ClientSelectionModal.tsx` modo `budget` crea `Order` con `status=pendiente` (presupuesto) y `paidMethod="Efectivo"`; el snapshot de impresión no debería heredar `paidMethod` como medio de pago efectivo para presupuesto.

## Requisitos

### R1 — Snapshot debe propagarse

- `ProductsTable.handlePrint` debe aceptar `snapshot?: BillState` (o `BillCheckoutSnapshot`) y guardarlo en estado referido por `PrintableTable`.
- `PrintableTable` debe aceptar prop `snapshot` / `printSnapshot` / `externalState` que contenga el estado congelado al momento de confirmar presupuesto, y usarlo **exclusivamente** para la impresión disparada por ese `printTrigger`. No debe depender del `BillContext.BillState` que ya fue reseteado.
- Si `handlePrint` es invocado sin snapshot (flujos remito/factura existentes que ya funcionan), debe seguir funcionando como antes (fallback a `state`/`forceCae`).

### R2 — `getBillTypeDisplay` y `getDocumentPrintKind` deben reconocer Presupuesto

Opción arquitectónica recomendada (mínimo cambio, sin romper factura/remito):

**Prioridad 1:** `getBillTypeDisplay(billType, cae, isRemito)` debe retornar `"Presupuesto"` **antes** de evaluar `cae` cuando `normalizeBillType(billType) === "Presupuesto"` (o comparación case-insensitive trim). Es decir:

```ts
export function getBillTypeDisplay(billType?: string | null, cae?: string | null, isRemito?: boolean): string {
  const normalized = normalizeBillType(billType);
  if (normalized === "Presupuesto") return "Presupuesto"; // ← guard clause
  if (!cae?.trim()) return isRemito ? "Remito" : "Comprobante";
  // ... resto
}
```

Esto evita que `Presupuesto` sin CAE caiga en `Remito`.

**Prioridad 2 (complementaria):** Extender `DocumentPrintKind` a `"official-invoice" | "remito" | "presupuesto"` y actualizar `getDocumentPrintKind(cae, billType?)` o crear `getDocumentPrintKindFromBillType(billType, cae)` que retorne `"presupuesto"` cuando `billType === "Presupuesto"` sin CAE. `buildReceiptBusinessInfo` debe entonces aceptar `billType` o `documentKind` explícito. Si se amplía el kind, ajustar todos los `=== "official-invoice"` y `=== "remito"` a switches que traten presupuesto como no-fiscal pero no-remito.

La decisión mínima viable es solo la guarda en `getBillTypeDisplay` + asegurar que `PrintableTable`/`pdf-templates`/`BrowserPrint` le pasen el `billType` del snapshot. La extensión de `DocumentPrintKind` es opcional pero recomendada para que `receiptBusinessInfo.documentKind` no mienta (hoy diría remito para presupuesto).

### R3 — PrintableTable debe construir ThermalReceiptData desde snapshot

`PrintableTable.handlePrint` debe resolver la fuente de verdad en este orden:

1. `printSnapshot` (prop nueva) si existe y corresponde al `printTrigger` actual;
2. `state` (para compatibilidad con flujos sin snapshot).

Campos que deben venir del snapshot cuando existe: `billType`, `products`, `discount`, `totalWithDiscount`, `paidMethod` (si se decide ocultar), `client`, `ptoVenta`, `date`, etc.

`billTypeDisplay` debe calcularse con `snapshot.billType` (o `printSnapshot.billType`) y pasarse a `ThermalReceiptData.billType` y a `buildReceiptBusinessInfo` si se parametriza por billType.

La filename del PDF (`Factura_...` vs `Presupuesto_...`) y el invoiceNumber deben respetar la misma guarda: presupuesto nunca genera `Factura_...` ni `N°`.

### R4 — Diferenciación visual de Presupuesto vs Remito

Para que presupuesto **no se vea como remito**, definir:

| Elemento | Factura (CAE) | Remito (sin CAE, sin presupuesto) | Presupuesto (sin CAE, billType=Presupuesto) |
|---|---|---|---|
| Título/`billTypeDisplay` | `Factura A/B/C` | `Remito` | `Presupuesto` |
| `N°` / invoice number | muestra `PPP-NNNN` si hay datos | oculto | oculto |
| Datos fiscales (CUIT, razón social, condición IVA, dirección, inicio actividades, QR CAE, banner AFIP) | visibles si existen | ocultos | **ocultos** |
| Fila `Medio de Pago` / `Pago:` | visible | visible | **oculta** o reemplazada por `Validez: Presupuesto sin validez fiscal` / `Condiciones: A confirmar` — decisión de producto; mínimo aceptable: ocultar `Pago` y `Medio de Pago` |
| Footer | `¡Gracias por su compra!` / `GRACIAS POR SU COMPRA` | `¡Gracias por su compra!` | **No** `Gracias por su compra`; usar `Presupuesto — No válido como factura. Validez: X días` o al menos `Presupuesto` sin agradecimiento de compra. Si no hay validez configurada, usar lit. `Presupuesto — No válido como factura` |
| Cliente | opcional | opcional | opcional (mantener) |

Esto requiere branches en:

- `PrintableTable.tsx` header impreso (líneas 302-305, 311)
- `pdf-templates.ts` `buildPDFHTML` (líneas 134-135, 164-174, 180-197, 251)
- `BrowserPrint.ts` `generateThermalReceipt` (107, 119, 173-174, 221-224) y `buildThermalPrintHTML` (236, 294-295, 308-310, 327-334, 338)

No cambiar totales, productos ni lógica CAE/QR para factura.

### R5 — No romper flujos existentes

- Remito generado por `createSale(false,false)` (sin AFIP) sigue imprimiendo `Remito` sin CAE, sin número, con `Pago` y `¡Gracias por su compra!`.
- Factura generada por `createSale(true,false)` con CAE sigue imprimiendo `Factura X` con `N°`, CUIT, QR, banner CAE, `Pago`, `Gracias...`.
- `PrintOrderButton` histórico sigue imprimiendo presupuesto/comprobante según `status`.
- `Thermal` vs `PDF` comparten la misma política; QZ Tray / fallback no cambian.

### R6 — TypeScript strict

- No `any`. Firmas de `handlePrint` deben tiparse con `BillState` / `BillCheckoutSnapshot` y `CAE`.
- `normalizeBillType` ya tipada; `getBillTypeDisplay` mantiene `string | null | undefined`.

## Modelos y contratos propuestos

### `src/lib/print/receipt-data.ts`

```ts
// Opción A (mínima): mantener kind pero añadir guarda en getBillTypeDisplay
export type DocumentPrintKind = "official-invoice" | "remito";

// Opción B (recomendada): kind explícito presupuesto
export type DocumentPrintKind = "official-invoice" | "remito" | "presupuesto";

export function getDocumentPrintKind(
  cae: string | null | undefined,
  billType?: string | null,
): DocumentPrintKind;
// presupuesto si normalizeBillType(billType)==="Presupuesto" && !cae?.trim()

export function buildReceiptBusinessInfo(
  businessName: string,
  cae: string | null | undefined,
  businessInfo?: ReceiptBusinessInfo,
  billType?: string | null, // nuevo opcional para clasificar presupuesto
): { businessName: string; documentKind: DocumentPrintKind; businessInfo?: ReceiptBusinessInfo };
```

Invariant: `documentKind === "presupuesto"` nunca lleva `businessInfo` fiscal ni CAE; `isRemito` deja de ser `documentKind === "remito"` único — usar `documentKind !== "official-invoice"` para no-fiscal o `documentKind === "presupuesto"` para rama presupuesto.

### `src/lib/utils/bill-type.ts`

```ts
export function getBillTypeDisplay(
  billType?: string | null,
  cae?: string | null,
  isRemito?: boolean
): string; // ahora: if (normalizeBillType(billType)==="Presupuesto") return "Presupuesto" antes de cae check
```

Mantener `normalizeBillType` y `isAFIPAuthorized` sin cambios. `formatInvoiceNumberFull` sin cambios.

### `src/utils/billing.ts`

Sin cambios de modelo; ya expone `BillCheckoutSnapshot` y `createBillCheckoutSnapshot`. Confirmar que `snapshot.billType` es `"Presupuesto"` literal y no se pierde en el clone.

### `src/components/Billing/ProductsTable.tsx`

```ts
interface PrintTriggerState {
  count: number;
  cae?: CAE;
  snapshot?: BillState; // o BillCheckoutSnapshot
}

const handlePrint = (cae?: CAE, win?: Window | null, snapshot?: BillState) => {
  printWindowRef.current = win ?? null;
  setPrintTrigger(prev => ({ count: prev.count + 1, cae, snapshot }));
};
// pasar snapshot a PrintableTable
```

### `src/components/Billing/PrintableTable.tsx`

```ts
interface Props {
  // existentes
  printTrigger: number;
  forceCae?: CAE;
  targetWindowRef?: React.MutableRefObject<Window | null>;
  externalState?: BillState;
  printSnapshot?: BillState | null; // nuevo: snapshot congelado para esta impresión
  // ...
}
// dentro:
const effectiveState = printSnapshot ?? externalState ?? BillState ?? defaultBillState;
const effectiveBillType = effectiveState.billType;
const billTypeDisplay = getBillTypeDisplay(effectiveBillType, activeCae?.CAE, isRemito);
// ThermalReceiptData.billType = billTypeDisplay
```

Alternativa: `snapshot` prop genérica que contenga `BillState`. Nombrar `printSnapshot` evita colisión con `externalState`.

### `src/lib/print/pdf-templates.ts` y `BrowserPrint.ts`

Ambos ya reciben `receiptData.billType` y `receiptData.cae?.cae`. Con snapshot propagado, `billType === "Presupuesto"` llegará correctamente. Añadir guarda `if (billType === "Presupuesto")` antes de `isOfficialInvoice` para:

- No inyectar `businessInfo` fiscal en el `info-grid`.
- Ocultar `Pago`/`Medio de Pago` o reemplazar.
- Cambiar `thank-you` (`¡Gracias por su compra!` / `GRACIAS POR SU COMPRA`) a texto de presupuesto.

## Archivos afectados previstos

- `src/components/Billing/ProductsTable.tsx` — **fix crítico**: extender `handlePrint` para aceptar y guardar snapshot.
- `src/components/Billing/PrintableTable.tsx` — consumir snapshot, recalcular `billTypeDisplay` y `ThermalReceiptData`, ocultar `Medio de Pago` y cambiar header/footer para presupuesto.
- `src/lib/utils/bill-type.ts` — guarda `Presupuesto` en `getBillTypeDisplay` antes de `!cae`.
- `src/lib/print/receipt-data.ts` — opcional: extender `DocumentPrintKind` y `buildReceiptBusinessInfo` para presupuesto.
- `src/lib/print/pdf-templates.ts` — ramas para `billType === "Presupuesto"`: tipo, businessInfo, pago, CAE banner, thank-you.
- `src/lib/print/BrowserPrint.ts` — `generateThermalReceipt` y `buildThermalPrintHTML`: `billTypeDisplay`, `Pago:`, `GRACIAS POR SU COMPRA`, CAE section.
- `src/components/Billing/BillButtons.tsx` — sin cambios funcionales más allá de que su snapshot ahora sí se usa; verificar que `resetCheckout` ocurra **después** de que snapshot fue capturado por `ProductsTable` (ya es así, pero documentar orden).
- `src/app/(protected)/account-ledger/[id]/PrintOrderButton.tsx` — verificación de no regresión; ya funciona pero debe seguir pasando `Presupuesto` y no mostrar `Pago` si se unifica política (opcional).
- `src/context/BillContext.tsx` / `BillProvider.tsx` — sin cambios esperados; solo verificar que `BillState.billType` no se use como fuente de verdad para impresión de presupuesto.

## Criterios de aceptación medibles

1. **Presupuesto newBill muestra Presupuesto:** Con `BillState` con 1+ productos, `createBillCheckoutSnapshot(BillState,"Presupuesto")` → `handlePrint(undefined, win, snapshot)` dispara `PrintableTable` vista impresa con `Comprobante: Presupuesto` (o `Tipo: Presupuesto` en térmica) y no `Remito` ni `Comprobante`.
2. **Snapshot no se pierde tras reset:** `resetCheckout()` inmediatamente después de `handlePrint` no cambia el documento impreso; el PDF/thermal generado corresponde al snapshot congelado, no al estado reseteado.
3. **Remito no regresiona:** Crear remito (`BillButtons` → Remito → `createSale(false,false)` sin CAE, `billType` no presupuesto) imprime `Remito`, sin `N°`, con `Pago:` y `¡Gracias por su compra!` / `GRACIAS POR SU COMPRA` como antes.
4. **Factura no regresiona:** Crear factura con CAE válido imprime `Factura B` (o A/C según contexto) con `N° PPP-NNNN`, CUIT/razón social/condición IVA/dirección/inicio actividades si existen, QR CAE, banner `Comprobante Autorizado` con CAE/vto, y mantiene `Pago` + `Gracias...`.
5. **getBillTypeDisplay prioriza Presupuesto:** `getBillTypeDisplay("Presupuesto", null, true)` → `"Presupuesto"`; `getBillTypeDisplay("Presupuesto", "", false)` → `"Presupuesto"`; `getBillTypeDisplay("Presupuesto", " 123 ")` → `"Presupuesto"` (no `Factura C`). `getBillTypeDisplay(null, null, true)` → `"Remito"` permanece.
6. **Los tres canales comparten el mismo billType:** Térmica ESC/POS, fallback HTML térmico y PDF generados desde el mismo presupuesto muestran idénticamente `Presupuesto` como tipo; si se unificó `DocumentPrintKind`, los tres excluyen datos fiscales y `N°`.
7. **Presupuesto no muestra datos fiscales:** PDF y térmica de presupuesto no contienen `CUIT:`, `Condición IVA` del negocio, `Dirección` del negocio, `Inicio Actividades`, `CAE:` ni QR CAE, incluso si `billingInfo` está cargado.
8. **Presupuesto no agradece compra como remito:** En PDF no aparece `¡Gracias por su compra!` cuando `billType === "Presupuesto"`; aparece texto de presupuesto (ej. `Presupuesto — No válido como factura`); en térmica no aparece `GRACIAS POR SU COMPRA` sino leyenda de presupuesto.
9. **Presupuesto no cobra:** En PDF y térmica de presupuesto no aparece la fila `Medio de Pago` / `Pago:` (o aparece reemplazada por `Validez` / `Condiciones` según decisión de producto, pero nunca `Pago: Efectivo` como si fuera venta).
10. **Histórico presupuesto sigue funcionando:** `PrintOrderButton` con `status=pendiente` imprime `Presupuesto` sin `N°` y sin datos fiscales, sin regresión.
11. **TypeScript strict pasa:** `npm run build` y `tsc --noEmit` sin errores; no hay `any` nuevos; todas las firmas de `handlePrint` tipadas.
12. **Compatibilidad hacia atrás:** Órdenes sin `billType` y sin CAE siguen clasificadas como `Remito`/`Comprobante` según `getBillTypeDisplay`; ningún `billType` histórico es reinterpretado como presupuesto sin serlo.

## Riesgos y mitigaciones

| Riesgo | Impacto | Mitigación |
|---|---|---|
| Snapshot capturado después de reset | Impresión vacía o con datos del siguiente ticket | Disparar `setPrintTrigger` con snapshot **antes** de `resetCheckout`; o pasar snapshot por ref y snapshotear en `PrintableTable` con `useRef` antes de limpiar contexto |
| Ampliar `DocumentPrintKind` rompe checks `=== "remito"` | Ramas `isRemito` dejan de cubrir presupuesto | Centralizar `isOfficialInvoice = kind === "official-invoice"` y tratar `remito` y `presupuesto` como no-oficial pero con ramas distintas para `billTypeDisplay`/footer/pago |
| `getBillTypeDisplay` con `isRemito` legacy | Llamadas antiguas sin `billType` siguen devolviendo `Remito` correctamente pero llamadas nuevas con presupuesto no lo hacen si se olvida pasar `billType` | Asegurar que todo caller que construya `ThermalReceiptData` pase `snapshot.billType` y no `state.billType` reseteado |
| Diferencias thermal vs PDF | Presupuesto se ve distinto según canal y QA lo marca como bug | Compartir misma guarda `billType === "Presupuesto"` y mismo `receiptBusinessInfo` en los tres generadores; tests de snapshot de HTML/PDF |
| `paidMethod` hardcodeado `Efectivo` en presupuesto histórico | Reintroduce `Pago: Efectivo` en presupuesto aunque se oculte en newBill | Decidir si `createBudgetAction` debe persistir `paidMethod = null`/`Presupuesto` y/o si la capa de impresión oculta `paidMethod` cuando `billType === "Presupuesto"` independientemente del valor persistido |
| Race QR CAE | `PrintableTable` espera `qrSvgDataUrl` antes de imprimir y puede bloquear impresión de presupuesto (sin CAE) | Ya hay early return `if (activeCae?.qrData && !qrSvgDataUrl) return`; presupuesto no tiene CAE, por lo que no bloquea — verificar que no se introduzca dependencia nueva |
| Validez/leyenda presupuesto no definida por producto | Mensaje genérico puede no cumplir expectativa comercial | Proponer default `No válido como factura. Validez 15 días` parametrizable; si no hay config, usar literal `Presupuesto — No válido como factura` |

## Decisiones pendientes para Developer/QA

- **Texto exacto del footer de presupuesto** — confirmar con producto: ¿`Presupuesto — No válido como factura` o `Presupuesto — Validez 30 días` parametrizable? SPEC fija mínimo diferenciador (no `Gracias por su compra`).
- **¿Ocultar completamente `Medio de Pago` o reemplazar por `Condición: Contado / Validez`?** SPEC recomienda ocultar `Pago` para presupuesto; si producto exige mostrar condición comercial, reemplazar fila en lugar de ocultarla.
- **Extensión de `DocumentPrintKind` vs solo guarda en `getBillTypeDisplay`.** Recomendada extensión para claridad semántica, pero aceptable fix solo con guarda si se quiere minimizar cambios.
- **Persistencia `paidMethod` en `Order` de presupuesto.** Actualmente `Efectivo` — ¿debe cambiar a `null`/`Presupuesto`? No bloquea impresión si la capa de presentación oculta el campo para presupuesto.

## Fuera de alcance

- Cambiar numeración ARCA, CAE, QR, totales, descuentos, impuestos o lógica de `createBudgetAction` más allá de `paidMethod` cosmético.
- Migraciones Prisma (no hay cambio de esquema para este fix).
- Rediseño del contenido legal de factura ARCA o de los templates más allá de ramas de presupuesto/pago/footer.
- Configuración de validez de presupuesto; puede ser follow-up con `Business` setting.

## Notas de implementación (no código)

- El cambio debe ser **mínimo y tipado**: preferir guarda `Presupuesto` en `getBillTypeDisplay` sobre refactorizar toda la pipeline de impresión.
- `ProductsTable` es el único lugar donde se pierde el snapshot; fijarlo desbloquea todo el resto sin tocar `BillButtons`.
- Todos los consumidores de `buildPDFHTML`/`generateThermalReceipt`/`buildThermalPrintHTML` deben probarse con tres fixtures: `facturaConCAE`, `remitoSinCAE`, `presupuestoSinCAE` y comparar `billType`, `N°`, `businessInfo`, `Pago`, `Gracias`.
