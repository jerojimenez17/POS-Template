# TEST_CHECKLIST — Corrección de impresión de Presupuesto (newBill)

## Estado
Suite failing intencionalmente — define contrato TDD. Debe estar en verde tras fix.

## AC medibles (12 criterios)

### AC1 — Presupuesto newBill muestra Presupuesto (no Remito)
- [ ] `getBillTypeDisplay("Presupuesto", null, true)` retorna `"Presupuesto"` (no `Remito`)
- [ ] `getBillTypeDisplay("Presupuesto", "", false)` retorna `"Presupuesto"`
- [ ] `getBillTypeDisplay("Presupuesto", " 123 ", true)` retorna `"Presupuesto"` incluso con CAE
- [ ] `createBillCheckoutSnapshot(state, "Presupuesto").billType === "Presupuesto"`
- [ ] `buildPDFHTML({billType:"Presupuesto", cae:undefined})` contiene `Presupuesto` como `invoice-type` y NO `Remito`/`Comprobante`
- [ ] `generateThermalReceipt({billType:"Presupuesto", cae:undefined})` contiene `Tipo: Presupuesto`
- [ ] `PrintableTable` con `printSnapshot` Presupuesto renderiza `Presupuesto` en DOM

### AC2 — Snapshot no se pierde tras reset
- [ ] `BillButtons` budget `onSuccess` construye `snapshot = createBillCheckoutSnapshot(BillState,"Presupuesto")` y lo pasa a `handlePrint(undefined, win, snapshot)`
- [ ] `ProductsTable.handlePrint` acepta 3er parámetro `snapshot` y hace `setPrintTrigger(prev => ({ count: prev.count+1, cae, snapshot }))`
- [ ] `ProductsTable` forward `snapshot` a `PrintableTable` vía prop `printSnapshot` (o `snapshot`)
- [ ] `PrintableTable` acepta `printSnapshot` prop y usa `effectiveState = printSnapshot ?? externalState ?? BillState ?? defaultBillState`
- [ ] `handlePrint` en `PrintableTable` deriva `billTypeDisplay` y `ThermalReceiptData.billType` desde `snapshot.billType`, no desde estado reseteado
- [ ] Snapshot inmutable: después de `resetCheckout()` (products=[], billType reset) el documento impreso sigue siendo `Presupuesto` con productos del snapshot
- [ ] Orden `handlePrint` antes de `resetCheckout` verificado en `BillButtons.tsx`

### AC3 — Remito no regresiona
- [ ] `getBillTypeDisplay(null,null,true)` => `Remito`; `getBillTypeDisplay(null,null,false)` => `Comprobante`
- [ ] PDF remito sin CAE: muestra `Remito`, sin `N°`, sin `CUIT/CAE/QR`, CON `Medio de Pago` y `¡Gracias por su compra!`
- [ ] Thermal remito sin CAE: sin `Nro:`/`CAE:`/`CUIT:`, CON `Pago:` y `GRACIAS POR SU COMPRA`, sin `Presupuesto`

### AC4 — Factura no regresiona (con CAE)
- [ ] `getBillTypeDisplay("Factura B","123",_)` => `Factura B`; `getBillTypeDisplay("1","123",_)` => `Factura A`; fallback `Factura C` si no hay billType pero hay CAE
- [ ] PDF factura con CAE: muestra `Factura B/C`, `N° PPP-NNNN` (ej `001-0023`), CUIT/razón social/condición IVA/dirección/inicio, QR CAE, banner `Comprobante Autorizado` con CAE/vto, CON `Medio de Pago` + `Gracias`
- [ ] Thermal factura con CAE: muestra `Factura...`, `Nro: PPP-NNNN`, `CUIT:`, `CAE:`/`COMPROBANTE AUTORIZADO`, `Pago:` + `GRACIAS`
- [ ] `formatInvoiceNumberFull` parity: thermal y PDF usan mismo `PPP-NNNN` (`3+4`); 7 dígitos históricos -> `3+4`; 12 dígitos sin mapping se omite

### AC5 — getBillTypeDisplay prioriza Presupuesto
- [ ] Guarda `if (normalizeBillType(billType)==="Presupuesto") return "Presupuesto"` antes de `if (!cae?.trim())`
- [ ] `normalizeBillType("Presupuesto") === "Presupuesto"` y `createBillCheckoutSnapshot` preserva `Presupuesto` (y `Remito`)
- [ ] Whitespace `Presupuesto` con trim aún retorna `Presupuesto`

### AC6 — Los tres canales comparten mismo billType
- [ ] Mismo dato `receiptData.billType="Presupuesto"` produce idénticamente `Presupuesto` en PDF térmico ESC/POS, fallback HTML térmico `buildThermalPrintHTML` y PDF `buildPDFHTML`
- [ ] Si se extiende `DocumentPrintKind` a `presupuesto`, los tres excluyen datos fiscales y `N°`; si no, al menos `getBillTypeDisplay` y `buildReceiptBusinessInfo` son consistentes
- [ ] Test parity: `pdf.includes("Presupuesto") && thermal.includes("Presupuesto") && pdf.fiscalHidden && thermal.fiscalHidden`

### AC7 — Presupuesto no muestra datos fiscales
- [ ] PDF presupuesto: NO contiene `CUIT:`, `Condición IVA` negocio, `Dirección` negocio, `Inicio Actividades`, `CAE:`, `Comprobante Autorizado`, QR, aun con `billingInfo` cargado
- [ ] Thermal presupuesto: NO contiene `CUIT:`, `Condición IVA` negocio, `Dirección`, `Inicio actividades`, `CAE:` ni `COMPROBANTE AUTORIZADO`
- [ ] Incluso con `cae={cae:"123", vencimiento:"...", qrData:"..."}` si `billType==="Presupuesto"` (edge: stray CAE), debe seguir ocultando bloque fiscal — `billType` tiene prioridad

### AC8 — Presupuesto no agradece compra como remito
- [ ] PDF presupuesto: NO contiene `¡Gracias por su compra!`
- [ ] PDF presupuesto: SÍ contiene leyenda `No válido como factura` o al menos `Presupuesto` sin agradecimiento (mínimo `Presupuesto — No válido como factura`)
- [ ] Thermal presupuesto: NO contiene `GRACIAS POR SU COMPRA` / `Gracias por su compra`
- [ ] Thermal presupuesto: SÍ contiene leyenda presupuesto (`No válido como factura` o `Presupuesto`)

### AC9 — Presupuesto no cobra (no muestra Medio de Pago / Pago:)
- [ ] PDF presupuesto: NO contiene fila `Medio de Pago:` (ni `Pago:`). Si producto decide reemplazar, debe mostrar `Validez`/`Condiciones` pero nunca `Pago: Efectivo` como venta
- [ ] Thermal presupuesto: NO contiene `Pago:` (ni `Medio de Pago`)
- [ ] Edge: aun con `paidMethod="Efectivo"` persistido en Order, la capa de impresión oculta el campo cuando `billType==="Presupuesto"`
- [ ] Remito y Factura SÍ siguen mostrando `Pago:`/`Medio de Pago` — no ocultar globalmente

### AC10 — Histórico presupuesto sigue funcionando
- [ ] `PrintOrderButton` style (o `PrintableTable` con `externalState` status `pendiente` => `Presupuesto`) imprime `Presupuesto` sin `N°`, sin datos fiscales
- [ ] `PrintableTable` con `externalState={billType:"Presupuesto"}` (sin CAE) muestra `Presupuesto` y oculta `Medio de Pago`/`Gracias` igual que newBill
- [ ] No regresión `PrintOrderButton` remito/comprobante: sigue etiquetando según `status` y CAE

### AC11 — TypeScript strict pasa
- [ ] `npm run build` y `tsc --noEmit` sin errores
- [ ] No `any` nuevos; firmas `handlePrint(cae?: CAE, win?: Window | null, snapshot?: BillState)` tipadas con `BillState`/`BillCheckoutSnapshot` y `CAE`
- [ ] `normalizeBillType` y `getBillTypeDisplay` mantienen `string | null | undefined`
- [ ] Imports usan `@/` alias y respetan `AGENTS.md`

### AC12 — Compatibilidad hacia atrás
- [ ] Órdenes sin `billType` y sin CAE siguen clasificadas `Remito`/`Comprobante` según `isRemito` flag, no reinterpretadas como presupuesto
- [ ] Ningún `billType` histórico es reinterpretado como presupuesto sin serlo (`Factura B` con CAE sigue `Factura B`, `Remito` sin CAE sigue `Remito`)
- [ ] Valores `null`, `undefined`, `""`, `"   "` manejados como ausencia sin crash

## Casos positivos (deben pasar)
- Presupuesto con 1+ productos, nuevoBill -> imprime `Presupuesto` en los 3 canales
- Presupuesto histórico (cuenta corriente, status pendiente) -> `Presupuesto`
- Remito sin CAE -> `Remito` + pago + gracias, sin fiscal
- Factura con CAE -> `Factura B/C` + N° + CUIT + CAE + pago + gracias

## Casos negativos (deben fallar si se regresiona)
- Presupuesto mostrado como `Remito` o `Comprobante`
- Presupuesto mostrando `CUIT:` o `N° 001-0023` o `CAE:` o `Comprobante Autorizado`
- Presupuesto mostrando `Medio de Pago: Efectivo` / `Pago: Efectivo`
- Presupuesto mostrando `¡Gracias por su compra!` / `GRACIAS POR SU COMPRA`
- `getBillTypeDisplay("Presupuesto", null, true)` retornando `Remito`

## Edge cases
- `billType = " Presupuesto "` con espacios -> Presupuesto
- `billType = "presupuesto"` lower-case -> según spec case-insensitive trim; si se implementa, debe mapear; si no, al menos no rompe remito
- `cae = "   "` / `""` / `null` / `undefined` -> remito, no factura
- `cae = " 123 "` con espacios -> oficial si billType no es Presupuesto
- Factura oficial con puntoVenta ausente o comprobante incompleto -> omite línea N° sin placeholder `undefined`/`NaN`
- `qrData` residual sin CAE -> no genera QR ni bloquea impresión presupuesto (ya hay early return `if (activeCae?.qrData && !qrSvgDataUrl) return` debe no bloquear presupuesto sin CAE)
- Race `resetCheckout` inmediato tras `handlePrint` -> snapshot congelado usado, no estado reseteado
- `paidMethod = null` / `undefined` en snapshot presupuesto -> sigue ocultando fila Pago, no renderiza `Pago: undefined`

## Archivos de test vinculados
- `presupuesto-billtype.test.ts` — AC1 AC3 AC4 AC5 AC12 + DocumentPrintKind
- `presupuesto-print-templates.test.ts` — AC3 AC4 AC6 AC7 AC8 AC9
- `presupuesto-products-table.test.tsx` — AC2 R1 R3 + AC10

## Notas
- Todos los tests son determinísticos, sin flaky timers. Usan `new Date` fijo y mocks de `getBusinessBillingInfoAction`.
- No se implementa fix en este paso — solo tests que deben fallar hasta que se aplique SPEC R1-R6.
