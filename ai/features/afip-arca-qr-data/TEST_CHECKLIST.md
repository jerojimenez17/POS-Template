# QA checklist — AFIP/ARCA QR data (Step 2 / G2)

Expectativas derivadas de `SPEC.md` actualizado y de las respuestas confirmadas del usuario. El QR especificado es un contrato de producto; estas pruebas no afirman certificación externa de ARCA. Todos los datos de prueba son sintéticos.

> **Contrato vigente — Step 2, reviewer 1/2:** esta revisión supersede las expectativas anteriores de QR standard en CAE/props (incluidos los resultados históricos de Step 4 más abajo). Para órdenes nuevas, el browser no es autoridad de `qrData`, `qrUrl` ni `requestDate`: sólo transporta `qrAttestationToken`; imprimir usa un DTO resuelto después del save. El raw histórico se preserva únicamente desde DB cuando `qrDataPolicyVersion === 0` y no hay referencia de grant, como `legacy-raw` no verificado. Versión `1` sin grant produce `none`; no se usa `createdAt` como cutoff. No se modificó `SPEC.md`.

## Step 2 — attestation server-side (G2)

- [ ] `AuthorizedArcaQrGrant` emite bearer opaco; devuelve `{ id, token }` sin claims y persiste SHA-256, tenant, CAE/bill/request bindings, claims/raw, expiración y estado de consumo. Nunca almacena el token en claro.
- [ ] El canje valida expiración y todos los bindings (tenant, CAE, bill type/código, POS, número, monto fiscal, CUIT emisor y condición/tipo/número del receptor); el compare-and-set one-use permite exactamente un ganador ante replay/carrera.
- [ ] Emisión pública devuelve CAE y `qrAttestationToken` opcional, nunca `qrData`, `qrUrl`, payload ni `requestDate`. La creación fallida del grant no invalida el CAE ni inicia otra emisión. Crear el grant no depende de `fiscalSnapshot`.
- [ ] `processSaleAction` y `updateOrderCaeAction` guardan CAE aunque el grant sea missing/malformado/expirado/consumido/mismatch; ignoran todos los campos QR del browser y sólo conservan referencia/claims de grant cuando el binding se valida y consume. Toda nueva escritura de CAE marca `qrDataPolicyVersion: 1`.
- [ ] Los inputs de QR adulterados (`qrData`, `qrUrl`, `requestDate`, payload/claims) jamás llegan a persistencia ni a print DTO. Un token correspondiente a otro tenant/comprobante/binding no se consume para la venta actual.
- [ ] `resolveOrderQrPrintDto(orderId)` deriva tenant de sesión y consulta la orden/grant asociados en servidor; reconstruye URL fija desde los claims del grant, ignora URL/raw/date del JSON `CAE`, y usa raw de ese grant sólo como fallback si no hay URL construible.
- [ ] Sólo una fila migrada a versión `0`, sin referencia de grant, puede resolver su `CAE.qrData` guardado intacto como `{ qrKind: "legacy-raw" }`; nunca crea URL/payload/fecha ni lo declara verificado. Versión `1` sin grant, grant inválido o raw ausente resulta `{ qrValue: null, qrKind: "none" }`.
- [ ] La impresión inmediata sólo se resuelve después de guardar la orden/CAE; la respuesta de guardado no filtra QR/token/claims como contenido de impresión. El voucher parcial mantiene su DTO autorizado propio y no lee `Order.CAE`.

### Cobertura nueva añadida

- `qr-attestation-grant.test.ts`, `qr-attestation-emission.test.ts`, `qr-attestation-sales-actions.test.ts` y `qr-attestation-print-resolver.test.ts` conservan cobertura unitaria, pero **no son evidencia de integración**: sus fixtures/adaptadores aislados no sustituyen Business.CUIT + grant compartido + guardado + resolver/action.
- `qr-persisted-print.integration.test.tsx`: grant real → token opaco → `processSaleAction` → CAE persistido con referencia → `resolveOrderQrPrintDtoAction(orderId)` real. El adaptador de transacción incluye `Business.findUnique`/CUIT de 11 dígitos y comparte la misma fila grant con emisión, consumo y resolución; prueba CUIT divergente sin consumo/ref.
- `qr-persisted-print.integration.test.tsx`: action/resolver reales y encoder real. Verifica PDF con `<img alt="QR">` y SVG data URL decodificado con `path`/`rect`, thermal HTML con PNG real, attachment QZ Tray `{ format: "image", flavor: "base64" }`, y CAE sin símbolo cuando DTO es `none`.
- `payment-voucher-real-qr.integration.test.tsx`: no mockea `printPaymentVoucherAction` ni `QRCode.toDataURL` en éxito. Acción y servicio reales leen el pago/voucher/intento autorizado tenant-scoped; el popup contiene PNG no vacío con firma PNG y el negativo conserva CAE sin imagen QR.
- Los tests anteriores `standard-print-qr.test.tsx` y `payment-voucher-print-qr.test.tsx` siguen siendo unit tests de selección, pero sus stubs de resolver/action y encoder no cuentan como evidencia de imagen ni como AC-22..26.

### Evidencia RED del Step 2

- Ejecución: `npm run test -- ai/features/afip-arca-qr-data/qr-attestation-grant.test.ts ai/features/afip-arca-qr-data/qr-attestation-emission.test.ts ai/features/afip-arca-qr-data/qr-attestation-sales-actions.test.ts ai/features/afip-arca-qr-data/qr-attestation-print-resolver.test.ts --maxWorkers=1`.
- Resultado: **4 archivos; 21 tests (20 RED / 1 PASS)**. El PASS es que el guardado inmediato sólo devuelve `success` y `orderId`, sin incluir contenido QR/token.
- Fallos RED esperados: no existe `src/lib/server/authorized-arca-qr-grant.ts` ni sus exports (`createAuthorizedArcaQrGrant`, `consumeAuthorizedArcaQrGrant`, `resolveOrderQrPrintDto`); la acción pública aún devuelve QR raw/URL/fecha; `processSaleAction` persiste el `qrData` del input sin versión 1/grant; `updateOrderCaeAction` rechaza el token opaco por esquema estricto y todavía no implementa canje/persistencia tolerante.
- El runner completó las aserciones, pero Vitest reportó `EPERM` al cerrar un worker fork en Windows. No es una falla de compilación ni un fallo adicional de aserción.
- Compilación focal: `npx tsc --noEmit --pretty false --project ai/features/afip-arca-qr-data/tsconfig.g2.json` — **PASS**. La configuración es temporal y se elimina antes de cerrar Step 2; los imports de módulos aún ausentes son dinámicos.
- Regresión aislada del contrato parcial: `npm run test -- ai/features/afip-arca-qr-data/payment-voucher-qr.test.ts --maxWorkers=1` — **PASS**, 1 archivo / 4 tests; preserva DTO autorizado del pago y excluye CAE de la orden.
- Alcance de cambios: sólo tests y este checklist bajo `ai/features/afip-arca-qr-data/`; sin cambios a `src/` o `SPEC.md`.

## Contrato de URL, serialización y validación

- [ ] La URL tiene origen/ruta fijos `https://www.afip.gob.ar/fe/qr/` y exactamente un parámetro `p`.
- [ ] `p` es Base64 estándar del JSON UTF-8, decodificable por URL/UTF-8 (no Base64URL).
- [ ] El JSON tiene exactamente y en este orden las 13 claves: `ver`, `fecha`, `cuit`, `ptoVta`, `tipoCmp`, `nroCmp`, `importe`, `moneda`, `ctz`, `tipoDocRec`, `nroDocRec`, `tipoCodAut`, `codAut`.
- [ ] Constantes: `ver=1`, `moneda="PES"`, `ctz=1`, `tipoCodAut="E"`.
- [ ] Destinatario: CUIT → `80`, DNI → `96`, Consumidor Final sin documento → `99`/`0`.
- [ ] Fecha civil estricta `YYYY-MM-DD`; rechazo de fecha imposible y formato alternativo.
- [ ] Validación estricta de CUIT/CAE/números seguros, POS/tipo/número de comprobante, importe finito positivo y códigos de receptor permitidos.
- [ ] Rechazo de claves extra, campos nulos, constantes incorrectas, importes inválidos y enteros fuera de rango; nunca redondea ni inventa datos.

## Factura estándar / impresiones

- [ ] `PrintableTable` solicita `resolveOrderQrPrintDtoAction(orderId)` sólo para una factura CAE cuyo `orderId` ya está disponible/persistido; no resuelve QR desde CAE de checkout o estado sin id.
- [ ] El QR visible, PDF y recibo térmico consumen exclusivamente `qrValue` del DTO server-side (`verified-url`, `verified-raw` o `legacy-raw`); ignoran `qrUrl`, `qrData` y `requestDate` inyectados en CAE props.
- [ ] DTO `verified-url` renderiza exactamente la URL reconstruida por resolver; `verified-raw` usa exactamente el raw acreditado por ese grant, sin tomar raw de props.
- [ ] DTO `none` (incluido versión 1 sin grant) omite el símbolo, conserva CAE e información fiscal, y permite completar impresión/exportación.
- [ ] Histórico versión 0 sin grant sigue separado de nueva versión 1 sin grant: únicamente el resolver puede entregar raw persistido como `legacy-raw`; no URL/payload/fecha reconstruidos.
- [ ] No se consulta ni llama gateway, emisión o reconciliación durante print/reprint.

## Voucher parcial

- [ ] Cada emisión captura su fecha civil antes de esperar al gateway; request fiscal/QR usan exactamente esa fecha.
- [ ] La fecha queda persistida en el intento vinculado antes del POST; una falla al guardar fecha/claim impide todo POST.
- [ ] El DTO de impresión toma `requestDate` y datos fiscales únicamente del intento `AUTHORIZED` enlazado al `PaymentVoucher` impreso.
- [ ] Payload/CAE/número/POS/importe/fecha/receptor corresponden al movimiento parcial actual, no a `Order.CAE`, otro pago, otro intento ni datos actuales del cliente.
- [ ] URL local se prefiere; si no puede construirse se usa exactamente el `qrData` raw de ese voucher; sin raw se imprime CAE omitiendo QR.
- [ ] `PaymentVoucherRowActionClient` genera imagen desde URL efectiva/fallback del DTO autorizado; no ejecuta acciones de emisión/reconciliación al imprimir.
- [ ] Dos pagos parciales de la misma orden mantienen aislamiento de los datos de CAE y QR.

## Compatibilidad/parser y privacidad

- [ ] El test existente `afip-arca-qr-data.test.ts` mantiene las formas soportadas de respuesta CAE y su prioridad de QR raw.
- [ ] QR raw se conserva byte a byte como fallback; ausente, null, whitespace y no-string no se coaccionan.
- [ ] CAE autorizado sigue siendo éxito aunque no haya QR; QR sin CAE no autoriza.
- [ ] CAE histórico sin `requestDate` nunca fabrica fecha; usa raw propio o no muestra QR.
- [ ] Ningún log, fixture o mensaje de error expone payload/Base64/URL completa ni credenciales/datos fiscales reales.

## Evidencia Step 2 / G2

- `afip-arca-qr-data.test.ts`: pruebas preexistentes del parser opaco, precedencia, ausencia de QR, round-trip `parseCAE` y HTML PDF.
- `qr-payload.test.ts`: contrato de URL, claves/orden, mapping y matriz de rechazo del helper esperado. La carga dinámica evita referencia TypeScript a un símbolo/módulo productivo todavía inexistente.
- `standard-print-qr.test.tsx`: selección URL local/raw en `PrintableTable`.
- `payment-voucher-qr.test.ts`: fecha capturada/persistida antes del dispatch, ausencia de POST ante fallo de persistencia, DTO autorizado e independencia del CAE de orden.
- `payment-voucher-print-qr.test.tsx`: uso del URL/fallback raw del mismo voucher parcial, impresión tolerante a QR ausente y cero llamadas a emisión/reconciliación.
- `standard-print-qr.test.tsx`: acción de DTO mockeada; comprobaciones de resolución sólo después de tener orderId, URL/raw del DTO, rechazo de QR malicioso en CAE props, omisión de símbolo con DTO `none` y continuidad CAE/impresión.
- `npm run test -- ai/features/afip-arca-qr-data --maxWorkers=1`: 5 archivos, **35 passed / 20 failed**. El test existente `afip-arca-qr-data.test.ts` pasó. RED intencional: 16 fallos por no existir aún el helper `src/services/afip/qr-payload.ts`; 1 estándar porque `PrintableTable` sigue usando el QR raw; 2 parcial porque no captura/propaga `requestDate`; 1 impresión parcial porque el cliente pasa `qrData` raw en lugar de `qrUrl`. El fallback parcial raw, impresión sin QR, rechazo de print no autorizado y demás regresiones ya presentes pasaron.
- El runner imprimió `EPERM` al terminar forks en Windows después del resumen Vitest; no es una falla de aserción. La ejecución serial hizo reproducible el resumen sin workers concurrentes.
- G2 TypeScript focal: pasó `npx tsc --noEmit --pretty false --project ai/features/afip-arca-qr-data/tsconfig.g2.json` (config temporal, eliminada tras comprobar), incluyendo sólo estos tests y la augmentación existente de NextAuth. Los imports de módulos/símbolos productivos aún no implementados se mantienen dinámicos y no generan errores TS.
- `npx tsc --noEmit --pretty false` global también se ejecutó: detectó errores preexistentes en tests/acciones ajenos a este feature; no se modificaron para esta entrega. El único diagnóstico que apuntaba a estos tests se corrigió antes de la compilación focal limpia.
- No se modificó `src/` ni código productivo.

## Resultados Step 4 — post-implementación QA

Fecha de ejecución: 2026-11-26. Sólo se actualizaron estos resultados; no se alteraron SPEC, aserciones, tests ni código de producción.

### Suite del feature y regresiones seleccionadas

| Ejecución | Resultado | Evidencia / clasificación |
|---|---|---|
| `npm run test -- ai/features/afip-arca-qr-data --maxWorkers=1` | **PASS** — 5 archivos, 55/55 tests | Incluye payload/URL, parser de respuesta, selección de QR en `PrintableTable`, emisión/impresión de pago parcial y ausencia de llamadas de emisión/reconciliación al imprimir. |
| `src/components/Billing/__tests__/PrintableTable.test.tsx` serial | **FAIL** — 27/38 pasan; 11 fallan | Fallos en trigger de impresión, clases/consulta de búsqueda, información de facturación y cálculos/edición. No son aserciones del nuevo contrato QR. No se ejecutó baseline anterior, así que su atribución a este cambio no queda demostrada; requieren triage en Step 5. |
| `src/components/account-ledger/PaymentVoucherRowActionClient.test.tsx` serial | **PASS** — 1/1 | Regresión del cliente de impresión parcial. |
| `ai/features/afip-partial-payment-voucher/payment-voucher.service.test.ts` serial, timeout por defecto | **TIMEOUT** — 5/6 pasan; un test excede 5 s | Al repetir el mismo archivo serial con `--testTimeout=15000`, **PASS** — 6/6. El primer fallo fue el límite temporal del runner, no una aserción funcional reproducible. |
| `ai/features/afip-partial-payment-voucher/payment-voucher.contract.test.ts` serial, `--testTimeout=15000` | **FAIL** — 60/66 pasan | Seis asserts existentes de llamadas a `prepare` esperan sólo el argumento `invoice`; el servicio ahora invoca `prepare(invoice, requestDate)`. El timeout del test parametrizado desapareció al aumentar el límite. Queda pendiente alinear la regresión contractual con el nuevo argumento; QA no editó tests. |
| `ai/features/factura-a-receipt-client-data/receipt-client-data.test.ts` serial | **PASS** — 6/6 | Regresión PDF/recibo térmico. |
| `ai/features/business-print-settings/historical-printing.test.tsx` serial | **PASS** — 2/2 | Regresión de impresión histórica vía `PrintOptionsPopover`. |
| `ai/features/pdf-a4-height/pdf-a4-templates.test.ts` serial | **PASS** — 30/30 | Plantillas PDF y formato térmico. |
| `npx prisma validate` | **PASS** | “The schema at prisma\schema.prisma is valid”. No se ejecutó `db push`. |

### Revisión funcional / persistencia

- **Pago parcial — fecha:** `issueCore` captura una fecha civil una sola vez antes de los awaits del flujo; la entrega al claim, que la persiste en el intento, y reutiliza el valor de claim para `invoice.date` y `prepare`. Los tests del feature verifican fecha estable ante cambio de reloj, persistencia antes de dispatch y cero POST cuando falla el claim. El DTO de print sólo obtiene fecha del intento autorizado actual.
- **Factura estándar — fecha: FAIL para AC-14/Step 5.** `createAfipVoucherAction` espera autenticación y `prepareAfipVoucherForActor` antes de proporcionar una fecha; no le pasa `requestDate`. El fallback `captureArcaCivilDate()` ocurre en `issuePreparedAfipVoucher` después del preflight (que ya espera a `getVoucherNumberForActor`). La fecha se captura una sola vez y se reutiliza para el POST y QR, pero no antes de ese await previo de gateway según el requisito de SPEC. La captura debe adelantarse y propagarse por Step 5; no inferir que la prueba parcial cubre el flujo estándar.
- **QR estándar:** el parser conserva `qrData` raw; `requestDate`/`qrUrl` se incluyen en la respuesta de autorización y se preservan al guardar `Order.CAE`. `PrintableTable`, `PrintOptionsPopover` y `BrowserPrint` seleccionan `qrUrl` antes de raw; `PrintableTable` pasa ambos valores al flujo de PDF/térmica. La prueba focal confirma URL local y fallback raw propio en `PrintableTable`; regresiones de histórico/PDF/térmica arriba indicadas pasan.
- **Aislamiento parcial / print:** la construcción local usa el voucher/pago, su snapshot autorizado y su CUIT de negocio; no toma el CAE de orden. El print path valida el voucher autorizado y no llama a `issue`, `reconcile` ni acciones de emisión. Los tests del feature validan poison data de CAE de orden, QR raw propio, fecha del intento autorizado y ausencia de llamadas de emisión/consulta/reconciliación.
- **Migración:** `20261126000000_add_payment_voucher_attempt_request_date/migration.sql` sólo añade `requestDate DATE` nullable a `PaymentVoucherAttempt`, coherente con `requestDate DateTime? @db.Date` del schema. No contiene backfill/default ni modificación a una migración previa; el estado Git mostraba la migración nueva como no rastreada y ninguna migración previa modificada. La validación de Prisma pasó; no se aplicó la migración a una base de datos.

### Estado para Step 5

- **Pendiente funcional:** mover la captura de fecha estándar antes de los awaits previos al gateway y propagar el mismo valor a preflight, request y QR.
- **Pendiente de regresión:** revisar los 11 fallos del test `PrintableTable` sin atribución confirmada y actualizar, fuera de esta tarea QA, las expectativas antiguas de `prepare(invoice)` que ahora recibe fecha.
- **No reproducido como fallo funcional:** timeout del servicio parcial con límite de 5 s; el archivo pasa completo con límite de 15 s.

## Resultados Step 4 — repetición después de Step 5, iteración 1

Fecha de revalidación: 2026-11-26. Sólo se agrega esta anotación de resultados; no se modificaron implementación, SPEC ni tests.

### Suites solicitadas

| Ejecución | Resultado | Evidencia / clasificación |
|---|---|---|
| `npm run test -- ai/features/afip-arca-qr-data --maxWorkers=1` | **PASS** — 5 archivos, 55/55 tests | Payload, parser, impresión estándar, voucher parcial, aislamiento de QR y no emisión/reconciliación al reimprimir. |
| `npm run test -- ai/features/afip-partial-payment-voucher/payment-voucher.contract.test.ts --maxWorkers=1 --testTimeout=15000` | **PASS** — 1 archivo, 66/66 tests | Quedan resueltas las seis regresiones de expectativa `prepare(invoice)`: se conserva la llamada de un argumento y `requestDate` viaja en `invoice.date`. No fue necesario cambiar el test contractual. |
| Regresiones AFIP de autorización/acciones: `afip-prepared-voucher`, `public-afip-action-boundary`, `user-invoice-action` y `user-invoice-prepared-voucher`, serial | **PASS** — 4 archivos, 41/41 tests | Revalidación limpia de límites de acción, capacidades/preflight y autorización. |
| Batch focal AFIP/acciones/autorización (11 archivos; incluye `tests/actions/afip-voucher`, `tests/actions/arca`, no-CAE, preflight POS, payload serializable y límites de nota de crédito), `--maxWorkers=1 --testTimeout=15000` | **FAIL parcial** — 4 archivos pasan; 53/98 tests pasan, 45 fallan | Son regresiones no-feature/legacy, no se alteraron. Varios fixtures de acción fallan antes del flujo por `auth()` rechazado/no mockeado (`createAfipVoucherAction` devuelve “No se pudo validar la sesión…”); `tests/actions/arca` falla porque `vi.mocked(auth).mockResolvedValue` no es función. El caso restante de `afip-serializable-bill-payload` espera la fecha histórica `2026-10-01T12:34:56.000Z`, pero ahora el request fiscal usa la fecha civil capturada `2026-11-26`. No se presenta este grupo como una regresión funcional confirmada del QR. |
| Regresiones BrowserPrint/recibo, `print-source-parity`, `historical-printing`, `pdf-a4-templates`, partial print/UI/action boundary y cliente `PaymentVoucherRowActionClient`, batch serial | **PASS** — 7 archivos, 52/52 tests | El batch notificó además timeout de arranque de worker para `payment-voucher-row-action.test.tsx`; repetido aisladamente con `--maxWorkers=1 --testTimeout=30000`: **PASS**, 1 archivo, 10/10. Resultado combinado de estas suites: 8 archivos, 62/62 tests. |
| `src/components/Billing/__tests__/PrintableTable.test.tsx` serial | **FAIL parcial** — 27/38 pasan; 11 fallan | Fallos en trigger de impresión, clases/consultas/visibilidad, info de facturación, cálculos y edición inline. Coinciden con el grupo legacy ya observado en Step 4 anterior; no hay baseline previo que permita atribución causal. Las pruebas QR del feature sí pasan. |
| `npx prisma validate` | **PASS** | Schema válido. La migración sigue siendo aditiva (`PaymentVoucherAttempt.requestDate DATE` nullable); no se ejecutó `db push`. |

### Verificación de los dos arreglos

- **Hallazgo P1 de fecha estándar: RESUELTO por inspección temporal del flujo.** En `createAfipVoucherAction`, después de autenticación/validación local pero antes de invocar y esperar `prepareAfipVoucherForActor`, se captura una sola fecha civil y se incorpora a `safeInvoiceInput.requestDate`. La preparación la conserva en el capability; `issuePreparedAfipVoucher` usa ese mismo valor en `billState.date` del POST y en `buildAuthorizedInvoiceQr`, y lo retorna como `data.requestDate` junto a `qrUrl`. `processSaleAction` y `updateOrderCaeAction` conservan `requestDate` en el JSON `Order.CAE`. No se vuelve a capturar la fecha tras el await de preparación. La fecha de autenticación puede preceder la captura; el límite del hallazgo era adelantarla respecto de preparación/preflight/gateway.
- **Contrato parcial `prepare(invoice)`: RESUELTO.** `payment-voucher.ts` hace `await dependencies.afip.prepare(invoice)` con exactamente un argumento. La fecha efectiva se asigna primero a `invoice.date` desde el claim (o la fecha capturada como fallback), y el claim que persiste `requestDate` precede esa preparación y el despacho. Las 66 pruebas contractuales pasan.
- **Reprint sin operaciones nuevas: CONFIRMADO.** `PaymentVoucherRowActionClient.print` sólo invoca `printPaymentVoucherAction`, elige `qrUrl ?? qrData` del DTO y genera el símbolo local; los callbacks separados de emisión/reconciliación no son llamados por print. Las pruebas del feature y de print parcial pasan y verifican la ruta de sólo lectura. Para estándar, las pruebas del feature seleccionan QR local/raw sin emitir ni reconciliar.

### Estado para reviewer

- Hallazgo P1 estándar: **resuelto**; misma fecha civil desde captura anterior a `prepare` hasta request, QR y persistencia `Order.CAE`.
- Seis regresiones de firma/fecha en `payment-voucher.contract.test.ts`: **resueltas**, 66/66.
- Suite feature QR: **verde**, 55/55. Suites focales de acciones/autorización mantenidas: **verde**, 41/41. Impresión/BrowserPrint/partial print: **verde**, 62/62 tras repetir aisladamente el test cuyo worker no arrancó en batch.
- Pendiente de triage separado, no bloquea el contrato nuevo: fallos legacy de mocks `auth()` (y `auth` no mockeado como `vi.fn`) en el batch amplio, una expectativa de fecha antigua en `afip-serializable-bill-payload` y 11 fallos antiguos de `PrintableTable.test.tsx`. No se modificaron tests.
- Prisma: **validado**; migración aditiva revisada, no aplicada a base de datos.

## Resultados Step 4 — repetición después de Step 5, iteración 2

Fecha de revalidación: 2026-11-26. QA no modificó source ni tests; sólo se registran resultados en checklists. Las pruebas mockean AFIP/persistencia; no se llamó al gateway real ni se aplicaron migraciones.

### Suites solicitadas y regresiones

| Ejecución | Resultado | Evidencia / clasificación |
|---|---|---|
| `npm run test -- ai/features/afip-serializable-bill-payload --maxWorkers=1` | **PASS** — 1 archivo, 9/9 | El DTO/envío remoto mantiene `billState.date` como ISO completo original (`2026-10-01T12:34:56.000Z`), `action: createVoucher`, headers, estructura y proyección fiscal; no sustituye la fecha wire con la fecha civil de solicitud. El checklist de ese feature registra los límites de cobertura que continúan pendientes. |
| `npm run test -- ai/features/afip-arca-qr-data --maxWorkers=1` | **PASS** — 5 archivos, 55/55 | Contrato de payload y URL QR, parser, selección de QR estándar, emisión/fecha de voucher parcial, impresión/fallback raw y reprint sin emisión/reconciliación. |
| `payment-voucher.contract.test.ts --maxWorkers=1` | **TIMEOUT reproducido una vez** con el timeout default de 5 s (65/66 pasan; el caso `10.5` agotó 5.035 s); repetido con `--testTimeout=15000`: **PASS**, 66/66 | El timeout fue del test parametrizado, no una aserción funcional: el mismo archivo completó íntegro con timeout aumentado. |
| `npm run test -- ai/features/afip-partial-payment-voucher --maxWorkers=1 --testTimeout=15000` | **PASS** — 12 archivos, 132/132 | Suite completa de voucher parcial, servicio/contrato, acciones, selección POS, autorización, aislamiento, estados y flujo de impresión. |
| Regresiones de acciones fiscales focales (`afip-prepared-voucher`, `public-afip-action-boundary`, `user-invoice-action`, `user-invoice-prepared-voucher`) serial | **PASS** — 4 archivos, 41/41 | Límites de emisión/preparación, autorización y acciones de factura de usuario. |
| Batch fiscal amplio (11 archivos: `afip-voucher`, `arca`, no-CAE, preflight, serializable, transporte/guard de nota de crédito, acciones preparadas/públicas y acciones de factura de usuario), serial con `--testTimeout=15000` | **PARCIAL** — 7 archivos pasan; 58/100 pasan y 42 fallan en 4 archivos | Fallos legacy aislados: 8 casos de `tests/actions/afip-voucher.test.ts` y 25 de `afip-no-cae-response.test.ts` más 6 de `afip-preflight.test.ts` se detienen por `auth()` rechazado/no mockeado (`No se pudo validar la sesión antes de iniciar la emisión`); los 3 casos de `tests/actions/arca.test.ts` fallan porque `vi.mocked(auth).mockResolvedValue` no es función. No atribuirlos a regresión de payload/QR: las acciones focales pasan y estos casos no alcanzan sus aserciones de emisión. |
| Impresión/PDF/recibo/térmica: `receipt-client-data`, `print-source-parity`, `historical-printing`, `pdf-a4-templates`, `pdf-a4-printable-integration`, `thermal-printer-css`, serial | **PASS** — 6 archivos, 66/66 | Regresiones de fuente para recibo, PDF A4 e impresión térmica. |
| `PrintableTable.test.tsx` + `PaymentVoucherRowActionClient.test.tsx`, serial | **PARCIAL** — 1 archivo pasa; 28/39 pasan, 11 fallan | El test del cliente de voucher parcial pasa (1/1). Los 11 fallos pertenecen al test legacy amplio de `PrintableTable` (trigger de impresión, clases/queries, información de negocio, cálculos y edición inline). Ya se habían observado en iteraciones previas; sin baseline limpio no se determina causalidad del cambio actual. Las pruebas específicas QR/impresión del feature están verdes. |
| `npx prisma validate` | **PASS** | `The schema at prisma\schema.prisma is valid`. No se ejecutó `db push` ni migración. |

### Inspección fecha y wire payload

- **Gateway remoto:** `issuePreparedAfipVoucher` prepara el objeto `minimalBillState` con `date: billStateWithoutPtoVenta.date` y lo envía en `requestBody.billState`. El `request.billState.date` queda igual a la factura normalizada, conservando su ISO con hora/zona; `requestDate` no reemplaza ni muta ese campo. La suite serializable pasó y afirma el ISO original.
- **QR civil:** la fecha capturada se mantiene como `payload.requestDate`; `buildAuthorizedInvoiceQr(requestDate, ...)` asigna esa cadena civil `YYYY-MM-DD` a `fecha` del QR. El mismo valor se devuelve en `data.requestDate`; `captureArcaCivilDate()` calcula el día civil de `America/Argentina/Buenos_Aires`. Las 55 pruebas del feature QR pasan.
- **Límites:** fallos legacy de auth/mock y `PrintableTable` quedan reportados por separado y no son evidencia concluyente de regresión funcional. No se hizo prueba contra gateway live ni base de datos.

### Estado de esta repetición

- Payload serializable, suite QR (55), contrato de voucher (66 con timeout ampliado tras reproducir el límite), suite parcial (132), acciones focales (41), impresión/PDF/térmica (66) y Prisma: **PASS**.
- Batch amplio fiscal: **no pasa por fixtures/mocks legacy de auth**, documentados arriba; `PrintableTable` conserva 11 fallos legacy no atribuibles sin baseline. El resto de la impresión focal, incluyendo impresión parcial, pasa.
- QA dejó intactos source/tests y actualizó únicamente resultados de checklists.

## Step 4 QA — corrección de expectativas QR de impresión estándar

Fecha: 2026-11-26. Cambio limitado a `standard-print-qr.test.tsx` y este checklist; no se editó `src/` ni `SPEC.md`.

### Corrección de contrato de `PrintableTable`

- Se eliminaron las dos expectativas antiguas que fabricaban `qrUrl`/`qrData` en CAE props y ordenaban renderizar esos valores directamente.
- El mock nuevo sustituye `resolveOrderQrPrintDtoAction(orderId)` —la acción server-side observable usada por la implementación— y comprueba:
  - resolución por el id de la orden persistida y ninguna consulta si el estado no tiene id;
  - uso exacto del `verified-url` o `verified-raw` provisto por el DTO;
  - rechazo de `qrUrl`/`qrData`/`requestDate` maliciosos colocados en el CAE cliente;
  - DTO `none`: no genera ni monta símbolo QR, conserva el CAE y permite completar la impresión térmica.
- Se conservaron las aserciones del grant contra manipulación/replay, y la separación de marcador histórico v0 (`legacy-raw`, byte-preserving) frente a nueva versión v1 sin grant (`none`). No se relajaron pruebas ni se cambió SPEC.

### Ejecuciones de esta pasada

| Ejecución | Resultado | Evidencia |
|---|---|---|
| `npm run test -- ai/features/afip-arca-qr-data/standard-print-qr.test.tsx --maxWorkers=1` | **PASS** — 1 archivo, 4/4 | La especificación corregida se verifica de forma aislada. |
| `npm run test -- ai/features/afip-arca-qr-data --maxWorkers=1` | **PASS** — 9 archivos, 78/78 | Incluye payload/parser, grant, persistencia ventas, resolver v0/v1, impresión estándar y voucher parcial. |
| Grant + resolver + sales-actions (`qr-attestation-grant`, `qr-attestation-print-resolver`, `qr-attestation-sales-actions`), serial | **PASS** — 3 archivos, 19/19 | Incluye hash-only, bindings, consumo/replay/tampering y legacy v0 vs nuevo v1. |
| Regresiones ventas + impresión histórica/PrintOptions + receipt/PDF/BrowserPrint (`ventas-pagination`, `historical-printing`, `receipt-client-data`, `print-source-parity`, `pdf-a4-templates`, `pdf-a4-printable-integration`), serial | **PARCIAL** — 6 archivos pasan; 66/74 tests pasan y 8 fallan | `ventas-pagination`: 6 tests fallidos (3 en `SalesTable`, 3 en `getSalesAction`: resultados/listado vacíos o expectativas de query/cursor distintas). `historical-printing`: 2 fallidos (el spy espera `printThermalReceipt` y no registra llamada; otro usa regex de llamada directa incompatible con `printThermalReceipt(getPrintData(info, qrValue), qzTrayEnabled)`). Son fallos observados en regresiones; sin baseline limpio no se atribuyen causalmente al grant/QR. El resultado queda abierto para triage Step 5, no se ajustaron esas pruebas. |
| `npm run test -- ai/features/afip-partial-payment-voucher --maxWorkers=1 --testTimeout=15000` | **PASS** — 12 archivos, 132/132 | Regresión completa de fecha, emisión, aislamiento y print de pagos parciales. |
| `npm run test -- ai/features/afip-serializable-bill-payload/afip-serializable-bill-payload.test.ts --maxWorkers=1` | **PASS** — 1 archivo, 9/9 | Conserva fecha serializable/wire original; fecha civil QR no altera el DTO de emisión. |
| `npx prisma validate` | **PASS** | Schema Prisma válido; no se aplicó migración ni `db push`. |
| `git diff --check` | **PASS** | Sin errores whitespace; Git sólo avisó conversiones LF→CRLF en archivos modificados preexistentes del worktree. |

### Salida para Step 5

- El QA del contrato QR server-side e impresión estándar queda **verde**: DTO posterior a persistencia, valores verificados, entrada maliciosa ignorada y fallback `none` no bloquea CAE/impresión.
- No se observó un fallo de aserción en grant, resolver, sales-actions QR, payload, pagos parciales ni fecha serializable. Mantener sin cambios la cobertura de tampering/replay y la barrera v0/v1.
- Quedan **8 fallos de regresión** reportados en ventas-pagination e impresión histórica. Step 5 debe triagearlos contra baseline y corregir implementación si se reproducen como regresión; no tratar el lote entero como aprobado ni alterar SPEC/expectativas QR para silenciarlos.

## Step 4 — repetición después de Step 5, iteración 2 (QA)

Fecha: 2026-11-26. Se repitieron las suites solicitadas con el estado actual. QA no modificó código, tests ni `SPEC.md`; sólo se agrega este resultado al checklist. Las pruebas de AFIP usan mocks; no se contactó un gateway real ni se aplicó migración/base de datos.

### Resultados ejecutados

| Ejecución | Resultado | Evidencia / clasificación |
|---|---|---|
| `npm run test -- ai/features/afip-arca-qr-data --maxWorkers=1` | **PASS** — 9 archivos, 78/78 tests | Suite QR completa: payload/parser, grants/emisión, acciones de venta, resolver, impresión estándar y pago parcial. Incluye persistencia/resolución del DTO con el contrato QR vigente. |
| `qr-attestation-grant.test.ts`, `qr-attestation-print-resolver.test.ts`, `qr-attestation-sales-actions.test.ts` serial | **PASS** — 3 archivos, 19/19 tests | Token/hash, binding y consumo/replay; tampering y guardado tolerante del CAE; impresión tenant-scoped; frontera de legado v0/v1. |
| `npm run test -- ai/features/afip-partial-payment-voucher --maxWorkers=1 --testTimeout=30000` | **PASS** — 12 archivos, 132/132 tests | Suite completa de voucher parcial, incluyendo emisión, fecha persistida antes del dispatch, aislamiento y print/reprint. El intento inicial, ejecutado en paralelo con límite global de 120 s, excedió ese límite; la repetición serial con timeout por test de 30 s terminó verde. |
| `historical-printing.test.tsx` completo | **PARCIAL** — 1/2 tests | El test de impresión térmica con placeholder `CAE-1` **pasa**: invoca `printThermalReceipt(..., false)` sin pedir DTO QR. El único fallo restante es el matcher regex de la prueba estática que exige la antigua forma de llamada directa; la implementación compone `getPrintData(info, qrValue)` antes de llamar. Triage lo clasifica como aserción brittle/ajena, no como fallo QR. Repetición focal del test térmico: **PASS**, 1/1 (1 omitido por filtro). |
| `ventas-pagination` completo | **PARCIAL** — 4 archivos; 10/16 pasan, 6 fallan | Se reproducen los seis fallos señalados por triage: tres en `SalesTable` (contenido/mock de páginas no aparece) y tres en `get-sales-pagination` (expectativas antiguas de take/filtros/cursor/resultados). Se mantienen clasificados como ajenos al QR según triage; no se modificaron tests ni código. |
| Regresiones seleccionadas `PrintableTable`, `PaymentVoucherRowActionClient`, `print-source-parity`, `receipt-client-data`, `thermal-printer-css`, `pdf-a4-printable-integration` y `historical-printing`, serial | **PARCIAL** — 7 archivos, 63/75 tests pasan; 12 fallan | `PaymentVoucherRowActionClient` y las cinco suites de impresión/BrowserPrint/recibo/térmica/PDF restantes pasan. Los 12 fallos se limitan a 11 asserts de `PrintableTable.test.tsx` (impresión legacy, clases/queries, datos de negocio, cálculos/edición) y el único regex brittle de `historical-printing`; no son fallos de las aserciones focales QR. |
| `afip-serializable-bill-payload.test.ts` serial | **PASS** — 1 archivo, 9/9 tests | El DTO wire conserva la fecha ISO original; la fecha civil del QR no la reemplaza. |
| `npx prisma validate` | **PASS** | Schema Prisma válido. No se ejecutó `db push` ni se aplicó migración. |

### Cobertura de seguridad P1 y ajuste térmico

- **Tampering cliente — cubierto y verde:** los tests de `qr-attestation-sales-actions` ejercitan `processSaleAction` y `updateOrderCaeAction`: campos QR/fecha adulterados no se confían ni persisten; token ausente/inválido o con bindings incompatibles no impide guardar CAE, pero no acredita QR. Sólo el grant correctamente ligado puede dejar referencia/claims autorizados. `qr-attestation-grant` verifica token opaco/hash-only, binding, consumo de una sola vez y rechazo de replay; `qr-attestation-print-resolver` verifica resolución server-side tenant-scoped.
- **Reimpresión/legado — cubierto y verde:** el resolver entrega raw `legacy-raw` intacto únicamente para versión `0` sin grant; una escritura nueva versión `1` sin grant resuelve `none`. Props/JSON cliente no convierten una fila nueva en histórica ni seleccionan el valor de reimpresión.
- **PrintOptionsPopover:** se confirma el nuevo guard para CAE estrictamente de 14 dígitos antes de pedir el DTO. El test térmico con `CAE-1` demuestra que este placeholder continúa imprimiendo (con QZ desactivado) y no solicita QR. El test histórico residual regex sólo expresa una forma textual de llamada que ya no coincide con la composición funcional observada.
- **Estado general de esta repetición:** suite QR (78), grant/resolver/acciones (19), voucher parcial (132), serialización de fecha (9) y Prisma: **PASS**. Los fallos de `ventas-pagination`, 11 asserts legacy de `PrintableTable` y el regex histórico se reportan por separado conforme al triage; no se cambiaron para silenciarlos.

## Step 2 QA — refutación de falsos verdes y evidencia G2 realista

Fecha: 2026-11-26. Se agregaron sólo los dos tests de integración visual descritos arriba y esta evidencia; no se modificó `src/` ni `SPEC.md`.

### Discriminadores RED para los falsos verdes previos

- Un mock de transacción sin `Business.findUnique` ya no puede satisfacer el escenario positivo: el caso integrado requiere leer CUIT dentro de la transacción y valida que corresponda al CUIT ligado al grant. Una divergencia conserva la CAE, pero no consume el grant ni persiste `qrAttestationId`; el resolver/action real retorna `{ qrValue: null, qrKind: "none" }`.
- El camino positivo no fabrica la fila de grant ni el DTO intermedio: `createAuthorizedArcaQrGrant` persiste hash/claims, su token real es el QR input de `processSaleAction`, la acción retorna el ID guardado y `resolveOrderQrPrintDtoAction` consulta orden/grant bajo el mismo tenant y verifica el payload asociado.
- Un `QRCode.toString` igual a `"<svg></svg>"`, un `QRCodeSVG` nulo o una URL de encoder fija no cumpliría el test: PDF inspecciona su `<img alt="QR">`, decodifica el SVG y exige `path`/`rect`; thermal verifica PNG real y attachment Base64 a QZ.
- La reimpresión histórica atraviesa el componente y action/resolver reales. El negativo `none` valida PDF y QZ: el CAE se mantiene, sin imagen ni attachment.
- Pago parcial atraviesa `printPaymentVoucherAction` y `paymentVoucherService.print` reales con Business, CashMovement, PaymentVoucher y su intento autorizado actual. El encoder real debe producir PNG no vacío dentro del popup; no hay doble mock action+encoder en éxito.

### Ejecución objetiva G2

| Ejecución | Resultado | Evidencia |
|---|---|---|
| `npm run test -- ai/features/afip-arca-qr-data/qr-persisted-print.integration.test.tsx ai/features/afip-arca-qr-data/payment-voucher-real-qr.integration.test.tsx --maxWorkers=1` | **PASS** — 2 archivos, 8/8 tests | Grant→save→resolver/action, binding CUIT negativo, PDF y QZ térmico inmediatos, PDF/QZ/HTML térmico histórico, `none` sin imagen y acción/servicio/encoder real de pago parcial. |
| `npm run test -- ai/features/afip-arca-qr-data --maxWorkers=1` | **PASS** — 11 archivos, 86/86 tests | Suite focal completa G2, incluyendo las pruebas nuevas y los tests unitarios/regresión del feature. |
| `npx tsc --noEmit --pretty false` | **PARCIAL** — sin diagnósticos en los dos tests nuevos; falla en tests preexistentes ajenos | Diagnósticos globales sólo en `src/__tests__/{actions,components}` y `tests/{actions,context}` (fixtures/tipos existentes). Los dos accesos iniciales a `orderId` en el test nuevo se corrigieron; la ejecución final no reporta errores en `ai/features/afip-arca-qr-data`. |

El término **RED** describe aquí los discriminadores que harían fallar los dobles falsos positivos anteriores (CUIT ausente, resolver/action saltados, SVG vacío o PNG sintético), no una suite dejada fallida contra la implementación disponible. La ejecución actual pasa; los negativos ejercitan fail-closed para binding e imagen ausente.

## Reviewer iteration 1/2 — regresiones de aislamiento parcial y consumo concurrente

Sólo se añadieron pruebas y esta actualización; no se tocaron `src/` ni `SPEC.md` y no se relajó ninguna expectativa previa.

- [ ] Emisión parcial aislada del grant estándar: debe atravesar el adaptador real de `payment-voucher.ts` y `issuePreparedAfipVoucher`; el test anterior mockeaba `afip.issue` y queda supersedido como falso verde. La nueva prueba conserva CAE/QR/DTO parcial, y exige cero llamadas a `AuthorizedArcaQrGrant.create`.
- [x] Dos llamadas concurrentes a `consumeAuthorizedArcaQrGrant` con el mismo token y fake compartido: ambas leen la fila sin consumir; el compare-and-set compartido deja exactamente un ganador, una respuesta con claims y una respuesta `null`.
- [x] Binding mismatch con alteración individual de CAE, tenant/business, bill type, POS, número, importe fiscal, CUIT emisor, receptor y documento del receptor: no se ejecuta el CAS y no se consumen los grants.

### Ejecución y estado

| Ejecución | Resultado | Evidencia / clasificación |
|---|---|---|
| `npm run test -- ai/features/afip-arca-qr-data --maxWorkers=1` | **PASS** — 12 archivos, 97/97 tests | Incluye el flujo parcial real con DB mock, la matriz de bindings y la carrera de consumo; sin fallos de aserción.
| `npm run test -- ai/features/afip-partial-payment-voucher --maxWorkers=1 --testTimeout=30000` | **PASS** — 12 archivos, 133/133 tests | Regresión completa de emisión/contrato/acciones/print parcial. El primer intento en batch terminó con error del runner Windows `kill EPERM` sin resumen; repetido aisladamente completó verde.
| `npx tsc --noEmit --pretty false --project ai/features/afip-arca-qr-data/tsconfig.qa.json` (configuración temporal, retirada tras la comprobación) | **PASS** | Los dos tests nuevos/modificados compilan con la augmentación NextAuth incluida.
| `npx tsc --noEmit --pretty false` global | **FAIL ajeno** | No reporta errores en `ai/features/afip-arca-qr-data`; falla en tests globales preexistentes de `src/__tests__`, `tests/actions` y `tests/context` (fixtures/tipos/mocks). No se modificaron.

Los nuevos casos son guards de regresión y actualmente pasan contra la implementación presente; por tanto, no queda un fallo funcional **RED** en estas suites. Al retirar el CAS, ampliar el binding sin validarlo o crear un grant estándar durante emisión parcial, las aserciones nuevas quedan diseñadas para fallar.

## Reviewer iteration 2/2 — emisión parcial a través del adapter AFIP real

Se corrigió `payment-voucher-grant-isolation.integration.test.ts`: el caso ya no reemplaza `afip.issue` por una respuesta sintética. El `paymentVoucherService`/adapter de `payment-voucher.ts` y su llamada a `issuePreparedAfipVoucher` son reales; la preparación, el resultado HTTP de AFIP y la persistencia se aíslan con mocks deterministas de credenciales/numeración, `axios.post`, DB y `AuthorizedArcaQrGrant.create`. La respuesta mockeada incluye snapshot fiscal válido y el create de grant devuelve un id, por lo que el test no se detiene por fixtures incompletos.

- [x] El POST AFIP mockeado se ejecuta exactamente una vez por `issuePreparedAfipVoucher`.
- [x] CAE, número, POS, QR raw y estado autorizado quedan persistidos en el `PaymentVoucher`/intento parcial.
- [x] El print DTO usa el QR del voucher parcial y reconstruye URL/payload con fecha, CUIT, CAE, POS, número e importe parciales; no filtra el CAE de la orden (`98765432109876`/número `808`).
- [ ] La emisión parcial no llama `AuthorizedArcaQrGrant.create` (RED reproducido: la implementación actual sí crea un grant estándar).

### Ejecución de esta pasada

| Ejecución | Resultado | Evidencia |
|---|---|---|
| `npm run test -- ai/features/afip-arca-qr-data/payment-voucher-grant-isolation.integration.test.ts --maxWorkers=1` | **RED esperado** — 1 archivo, 1 test falla en una aserción | La única falla es `expected "vi.fn()" to not be called at all, but actually been called 1 times`, en `AuthorizedArcaQrGrant.create`. La aserción soft permite completar antes las comprobaciones de CAE/QR/print DTO, y el mock DB devuelve un id válido. No es error de mock incompleto ni de compilación.
| `npx tsc --noEmit --pretty false --project ai/features/afip-arca-qr-data/tsconfig.g2.json` | **PASS** | Configuración G2 focal temporal con este test y la augmentación NextAuth; compilación limpia y configuración retirada tras comprobar. No se modificó source ni `SPEC.md`.

Esta RED contradice y supersede únicamente el resultado anterior que describía el test parcial como cobertura integrada sin grant estándar. El arreglo productivo deberá distinguir la intención de emisión parcial antes de crear el grant; no se cambia código productivo en esta tarea QA.

## Step 4 QA — revalidación post-fix: purpose server-owned para voucher parcial

Fecha: 2026-11-26. QA actualizó únicamente resultados de checklist. No se editaron source, tests ni `SPEC.md`; las llamadas AFIP/DB permanecen mockeadas y no se aplicó migración.

### Ejecuciones solicitadas

| Ejecución | Resultado | Evidencia |
|---|---|---|
| `npm run test -- ai/features/afip-arca-qr-data --maxWorkers=1 --testTimeout=30000` | **PASS — 12 archivos, 97/97 tests** | Suite íntegra, incluida la matriz de concurrencia/CAS y `payment-voucher-grant-isolation.integration.test.ts` con el adapter parcial real. |
| `npm run test -- ai/features/afip-arca-qr-svg-display --maxWorkers=1 --testTimeout=30000` | **PASS — 6 archivos, 16/16 tests** | Incluye el flujo real de emisión autorizada → grant/token → save de orden → resolución → render inmediato SVG/PDF/térmico. |
| `npm run test -- ai/features/afip-partial-payment-voucher --maxWorkers=1 --testTimeout=30000` | **PASS — 12 archivos, 133/133 tests** | Suite completa de voucher parcial, UI/edición, acciones, servicio, aislamiento y print. |
| `npm run test -- ai/features/afip-serializable-bill-payload --maxWorkers=1 --testTimeout=30000` | **PASS — 1 archivo, 9/9 tests** | La fecha ISO de `billState` serializable se mantiene separada de la fecha civil QR. |
| PDF/térmica/histórico: `pdf-a4-height`, `improve-pdf`, `fix-thermal-printer-blurry-units`, `business-print-settings`, `factura-a-receipt-client-data`, serial con timeout de 30 s | **PARCIAL — 13 archivos, 98/104 tests** | 6 fallos en 4 archivos; detalle y clasificación a continuación. |
| `npx prisma validate --schema=prisma/schema.prisma` | **PASS** | El schema es válido. No se ejecutó `db push` ni se aplicó migración. |

### Comprobaciones de comportamiento

- **Factura estándar:** las integraciones reales de emisión/grant/save/resolver pasan y validan grant estándar, DTO `verified-url` y QR no vacío. CUIT de negocio/emisor con formato (`30-71234567-8`) se normaliza al CUIT numérico esperado y llega hasta el render visual. Consumidor Final funciona con los valores reales de formulario vacíos/omitidos (`tipoDocRec: 99`, `nroDocRec: 0`) y también con ambas propiedades de identidad ausentes.
- **Pago parcial:** la prueba atraviesa `issuePaymentVoucherForSession`/servicio/adapter real y comprueba CAE/QR, fecha y DTO del voucher parcial propio. `AuthorizedArcaQrGrant.create` recibe **cero llamadas**; el DTO/payload corresponden al movimiento parcial y no contienen el CAE/número de la orden.
- **Concurrencia y bindings:** la matriz de consumo concurrente conserva exactamente un ganador CAS; cada variación de binding mismatch impide consumir. Ambos casos están incluidos en la suite completa, verde.
- **Fail closed / compatibilidad:** DTO `none` completa PDF/térmica con CAE pero sin imagen QR. Sólo la fila histórica v0 sin referencia resuelve `legacy-raw` byte por byte; v1 sin grant permanece `none`.

### Triage de regresiones PDF/térmica/histórico

- `business-print-settings/historical-printing.test.tsx`: falla un regex estático que exige la antigua llamada textual directa; el flujo compone `getPrintData(info, qrValue)` y llama `printThermalReceipt(..., qzTrayEnabled)`. Es una aserción de forma de código, no un fallo de render observado.
- `business-print-settings/qz-settings.test.tsx`: fallan 2 asserts porque el valor serializado por el fixture/component no contiene `qzTrayEnabled`. Se registra como fallo observable de esa suite; no se hizo baseline anterior ni se atribuye al cambio QR.
- `improve-pdf/improve-pdf.test.ts`: 1 fallo; el mock transaccional no define `tx.order.findFirst`, lanza antes de actualizar y el assert espera una actualización. Clasificación: fixture/adaptador de test incompleto.
- `factura-a-receipt-client-data/persistence-and-history.test.ts`: fallan 2 expectativas antiguas que exigen persistir `CAE.qrData: "qr"`. La acción actual omite ese raw del cliente y guarda `qrDataPolicyVersion: 1`; no se modificaron ni relajaron los tests. Es una expectativa de contrato histórica que necesita triage del owner, no se declara aprobada.
- El resto del batch, incluidos PDF A4, CSS térmico, recibo/datos y parity, pasa. Sin baseline limpio, los fallos observados no se atribuyen causalmente al cambio.

**Resultado para reviewer:** QR estándar y parcial, matriz concurrente, presentación inmediata, fecha serializable y Prisma: **PASS**. Regresiones amplias de impresión: **PARCIAL**, con las seis fallas anteriores explícitamente fuera del conjunto focal verde. No se realizó emisión a AFIP real ni prueba de base de datos real.

## Step 4 QA — repetición tras triage del matcher histórico

Fecha: 2026-11-26. Se volvió a ejecutar el conjunto solicitado tras el ajuste de forma de llamada en `PrintOptionsPopover`. QA sólo registra este resultado en el checklist; no editó source, tests ni `SPEC.md`. No se llamó a AFIP/ARCA real ni se aplicó una migración/base de datos.

### Ejecución focal

| Ejecución | Resultado | Evidencia |
|---|---|---|
| QR data + QR SVG display + voucher parcial + histórico + política de versión + persistence/history + regresiones focales de recibo/PDF/térmica + cliente de voucher parcial, serial con `--testTimeout=30000` | **PARCIAL — 39 archivos, 324/326 tests pasan** | Las suites QR data, QR SVG, voucher parcial, política v0/v1, `historical-printing`, recibo/parity, PDF/térmica y cliente de voucher parcial pasan. Los únicos 2 fallos de este batch están en `factura-a-receipt-client-data/persistence-and-history.test.ts`: CUIT y DNI; el assert espera `CAE.qrData: "qr"`, mientras el write observado omite `qrData` y persiste `qrDataPolicyVersion: 1`. No se atribuyen causalmente al cambio de llamada de `PrintOptionsPopover` ni al contrato QR. Vitest informó `kill EPERM` al terminar un worker de Windows después del resumen. |
| `historical-printing.test.tsx` + las regresiones legacy focales de QZ, `improve-pdf` y `persistence-and-history`, serial con `--testTimeout=30000` | **PARCIAL — 16/21 pasan; 5 fallan** | El archivo histórico pasa **2/2**, incluido el matcher estático y la llamada térmica con QZ desactivado. Los cinco fallos observados, sin atribución causal: 2 de `qz-settings.test.tsx` (expectativas de `qzTrayEnabled` ausente en el valor serializado); 1 de `improve-pdf.test.ts` (no se observa `order.update`; la ejecución registra `tx.order.findFirst is not a function`); 2 de `persistence-and-history.test.ts` (expectativas de persistir `CAE.qrData`). No se modificaron esas pruebas. |
| `npx prisma validate --schema=prisma/schema.prisma` | **PASS** | Prisma confirma que el schema es válido. No se ejecutó `db push`, deploy ni migración. |

### Verificaciones de contrato / reportes de regresión

- **Raw histórico v0 exacto: PASS.** `qr-attestation-print-resolver.test.ts` compara el DTO con `{ qrValue: HISTORICAL_RAW, qrKind: "legacy-raw" }` byte por byte, comprueba que no se consulte grant y que no se fabriquen `payload` ni `requestDate`.
- **Nueva escritura v1 sin QR cliente: PASS.** `qr-attestation-sales-actions.test.ts` comprueba en `processSaleAction` y `updateOrderCaeAction` que los valores cliente `qrData`, `qrUrl` y `requestDate` no pasan a `CAE`, mientras `qrDataPolicyVersion` queda en `1`; el caso sin grant conserva la CAE y omite la prueba QR. El resolver devuelve `none` para v1 sin grant, incluso con QR cliente adulterado.
- **Ajuste histórico: PASS.** El matcher que exigía la forma textual previa ya pasa junto con la impresión térmica observada. La selección de QR no se cambió ni se debilitó.
- **Run exploratorio adicional de componentes Billing:** al incluir `PrintableTable.test.tsx` y `PrintableTable.barcode.test.tsx` (no son las regresiones focales del matcher/QR), se observaron **22 fallos más**: 11/38 en `PrintableTable.test.tsx` y 11/13 en `PrintableTable.barcode.test.tsx`. Quedan reportados como fallos observados de esas suites legacy, sin atribución; no se mezclan con los cinco casos anteriores ni con el resultado focal QR/impresión.

**Estado para reviewer:** confianza focal del QR, barrera histórica v0/v1, nueva escritura y ajuste del matcher: **PASS**. Prisma: **PASS**. Permanecen cinco tests legacy fallidos en el batch específico de regresiones, más los 22 de la ejecución exploratoria amplia de componentes Billing, todos sin atribución causal en esta pasada. No hubo cambios fuera de este checklist.
