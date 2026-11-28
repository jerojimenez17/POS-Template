# QA checklist — AFIP/ARCA invoice QR SVG display (Step 4 / G4)

Scope is derived from this feature's `SPEC.md` and the trust contract in `../afip-arca-qr-data/SPEC.md`. The suite covers ordinary A/B/C invoices and a separate partial-payment print regression for a formatted Business CUIT; it does not merge their authorities or bindings. Fixtures use synthetic data and no live AFIP/ARCA call or database is implied.

## Acceptance checklist

### 1. Authorized response → persisted grant → opaque token

- [x] For an authorized invoice with eligible server-side claims, the gateway is called once, a grant is stored against the tenant/CAE/invoice bindings, and the emitted opaque token matches only the stored hash.
- [x] The token is made available to the authorized save path; public response coverage asserts the token is passed without returning raw QR, prebuilt URL, payload, or QR request date. Existing `qr-attestation-emission.test.ts` covers the public action boundary; new `afip-voucher-qr-grant.test.ts` exercises grant creation from the real voucher service.
- [x] If the AFIP response has no usable proof and payload claims are not constructible, CAE success remains successful, no grant/token is produced, and there is exactly one gateway issue call. There is no QR-triggered retry/reconciliation.
- [x] Actual form projections were inspected rather than inferred from a service-only fixture. `BillingModal.handleBilling` maps Consumidor Final to `clientDocumentType: undefined` and preserves `clientDocumentNumber: ""`; this real service input produces recipient payload `tipoDocRec: 99`, `nroDocRec: 0`. `BillParametersForm.onSubmit` instead keeps its default `clientDocumentType: ""` in `formData` and maps an empty document number to `undefined`.
- [x] The real `BillButtons`/`createAfipInvoiceDTO` boundary accepts the `BillParametersForm` Consumer Final value `clientDocumentType: ""` with no document number as absence. The full issue/save/resolver/print integration now confirms QR payload `tipoDocRec: 99`, `nroDocRec: 0`; this normalization remains limited to Consumer Final without an identifier.
- [x] The passing integration cases cover BillingModal-shaped Consumidor Final with blank/omitted identifiers, both identifier properties absent, and identified DNI/CUIT recipients. They execute real prepare/issue/grant-create/save/grant-consume/resolver code with only auth, credentials/number, database delegates, and Axios gateway mocked.
- [x] **Formatted issuer/tenant CUIT regression:** the real standard issuance/save/resolver/print flow accepts `30-71234567-8` from issuer credentials and tenant Business, constructs the 13-field payload with numeric `cuit: 30712345678`, consumes the bound grant, resolves `verified-url`, and generates non-empty SVG/PDF/thermal PNG output.

### 2. Sale save → one-time grant consumption/reference

- [x] `processSaleAction` consumes only a matching tenant/CAE/bill/POS/invoice/amount/issuer/recipient grant, stores its reference in `Order.CAE`, and writes `qrDataPolicyVersion: 1`.
- [x] Browser `qrData`, `qrUrl`, and `requestDate` never become saved QR claims; they are not an alternate proof when token is missing, malformed, replayed, expired, or mismatched.
- [x] Missing proof still saves the authorized CAE and invoice fields, keeps policy version `1`, stores no grant reference, and does not consume a grant. The new `missing-proof-handoff.test.ts` carries this saved row into the resolver to distinguish save behavior from lookup behavior.
- [x] `qr-attestation-sales-actions.test.ts` and the integration suite verify grant token handoff/consumption and persisted reference/policy; the immediate standard invoice path uses `processSaleAction`.

### 3. Persisted order → tenant-scoped verified DTO

- [x] Resolver derives tenant from authenticated session and loads by both persisted order ID and tenant. It returns a nonempty `verified-url` or `verified-raw` only when order and grant bindings are valid.
- [x] For policy version `1`, grant lookup must also bind `grant.orderId === order.id`; a grant with matching ID/tenant/invoice claims but linked to another order resolves to `{ qrValue: null, qrKind: "none" }` with only allowlisted `invoice-binding-mismatch` telemetry, no QR value, and no database writes. The valid grant path explicitly keeps `orderId` equal to the requested order.
- [x] Version `1` without a grant reference (or with invalid/missing proof) returns `{ qrValue: null, qrKind: "none" }`, even if client-injected raw/URL/date strings exist.
- [x] Migrated version `0` without grant reference continues to return its database-persisted raw QR byte-for-byte as `legacy-raw`; no URL/payload is reconstructed and the value is not relabeled verified.
- [x] `qr-attestation-print-resolver.test.ts` covers tenant scope, verified URL/raw, and version-0/version-1 policy split; missing-proof coverage verifies version-1 save-to-`none` handoff.

### 4. Immediate visible/PDF/thermal output

- [x] Immediate UI passes its opaque token into save and starts print only after save returns the persisted order ID; `PrintableTable` no-ID guard and DTO lookup are covered by existing `standard-print-qr.test.tsx`.
- [x] A nonempty resolver DTO creates actual visible QR SVG markup (not only a mocked component call); the immediate PDF contains the generated SVG data URL/image and keeps the CAE.
- [x] Thermal printing receives the resolved value, and the actual thermal printer helper creates a decodable PNG data URL/image from it. A `none` DTO completes PDF/thermal printing with CAE intact and no QR image.
- [x] The separate partial-payment print contract with Business CUIT `30-71234567-8` produces a valid ARCA QR URL with numeric `cuit: 30712345678`; the real payment-voucher print integration generates non-empty PNG bytes with the PNG signature.
- [x] `standard-print-qr.test.tsx`, `standard-invoice-render-output.test.tsx`, and `thermal-qr-image.test.ts` pass; they exercise the trust boundary and real SVG/PNG output.

### 5. Historical/reprint output and no retry

- [x] `PrintOptionsPopover` resolves the persisted sale ID before PDF/thermal generation and ignores poisoned `CAE.qrData`, `qrUrl`, and `requestDate` values.
- [x] PDF output includes the generated QR image only for a nonempty resolved value; thermal reprint uses the resolved value. No print/reprint path calls AFIP issue, query, reconcile, or retry operations.
- [x] Legacy version-0 raw eligibility remains tested only at the resolver boundary; renderer passes the resolver's `legacy-raw` value through unchanged and does not reinterpret client props as historical proof.
- [x] Partial-payment QR coverage remains a distinct print-path regression; its QR is never used as proof for standard invoice grant, resolver, or tenant bindings.

## Step 4 — QA execution and evidence

Run serially to avoid Windows worker shutdown noise. No `src/`, test, or `SPEC.md` file was modified during this verification.

```text
npm run test -- ai/features/afip-arca-qr-svg-display --maxWorkers=1
npm run test -- ai/features/afip-arca-qr-data --maxWorkers=1
npm run test -- ai/features/afip-partial-payment-voucher ai/features/pdf-a4-height ai/features/improve-pdf ai/features/afip-arca-qr-data/qr-persisted-print.integration.test.tsx ai/features/afip-arca-qr-svg-display/standard-invoice-render-output.test.tsx ai/features/afip-arca-qr-svg-display/thermal-qr-image.test.ts --maxWorkers=1
npx prisma validate --schema=prisma/schema.prisma
npx tsc --noEmit --pretty false
npm run lint
```

### Results

- **QR feature suites:** PASS, 17 files / 102 tests. This includes both requested end-to-end suites (`issued-voucher-to-print.integration.test.ts` and `payment-voucher-real-qr.integration.test.tsx`), all `afip-arca-qr-data` issuance/grant/save/resolver/print tests, and the SVG/PNG renderer tests. No QR output test returned `qrKind: "none"` for an eligible grant, and none produced an empty SVG/image. The explicit no-proof/invalid-proof tests still return `none` while retaining printable CAE.
- **Partial-payment, reprint and PDF/thermal group:** 17 files / 212 tests passed; 2 failures in 2 test files. One is the unrelated `payment-voucher-client-edit.test.tsx` dialog test timing out at 5 seconds. The other is `improve-pdf.test.ts`'s historical-update test: its mocked transaction lacks `tx.order.findFirst`, then the expected update is never called. The formatted-CUIT payment QR contract and real payment-voucher QR print integration pass.
- **PrintableTable component suites:** the broader run covered 36 files / 369 tests overall, with 346 passing and 23 failing across 3 files. `PrintableTable.barcode.test.tsx` has 11 failures, `PrintableTable.test.tsx` has 11 failures, and the same `improve-pdf` historical-update test has 1. The failures concern barcode/product-search behaviors, general component assertions, and the stale transaction mock—not QR SVG/print integration. The QR-specific immediate/reprint suites above pass. React `act(...)` warnings were also emitted by the barcode component suite.
- **Prisma:** PASS — schema validates.
- **Focused ESLint:** PASS for the implementation files in scope. **Repository ESLint:** FAIL, 48 errors / 19 warnings in `src/`; reported errors are in unrelated test fixtures, stock/admin/other components and hooks. No lint errors were reported for the scoped implementation files.
- **TypeScript:** repository `npx tsc --noEmit --pretty false` FAILS on existing test/type fixtures (including product, context, middleware/auth mock and missing-component-import errors); no focused feature-only typecheck was available in the repo. A full repository compile is therefore not green.
- The failed broad component tests are reported as observed; without a clean baseline run they are not claimed to be pre-existing. No assertion, trust boundary, or fixture was weakened to make a result pass.

### G4 status

**G4: NOT PASSED / blocked.** Feature-specific QR acceptance is green, but G4 requires the full test, lint, and typecheck gates to pass. The focused batch includes 23 unrelated component/mock failures, repository lint reports 48 errors, and repository typecheck reports fixture/type errors. No live AFIP/ARCA call or production invoice observation was performed.

## Production evidence boundary

- The synthetic integration tests execute real voucher preparation/issue, grant validation and persistence, `processSaleAction` grant consumption/save, tenant-scoped resolver, and actual local SVG/PDF/thermal PNG generation. Auth, credentials/number, database delegates, and gateway transport are mocked; this is not a production observation.
- The specific previously reported invoice remains undiagnosed: no sanitized production observation of grant creation, persisted grant reference/policy, resolver `qrKind`, or destination output was provided. Do not collect or log raw QR, URL, token, CAE, CUIT, payload, or recipient data for that diagnosis.
- The exact `BillParametersForm` shape (`clientDocumentType: ""`, no document number) now passes the DTO/preparation/issuance integration. `BillingModal`, formatted issuer/tenant CUIT, and identified recipients also pass through synthetic persistence. No live database/session/gateway bridge was exercised.

## Step 4 QA — final post-fix execution results — 2026-11-26

QA añadió sólo esta evidencia de ejecución; no editó source, tests ni `SPEC.md`. AFIP, auth y persistence permanecen sintéticos/mocked.

- **PASS — full SVG-display suite:** `npm run test -- ai/features/afip-arca-qr-svg-display --maxWorkers=1 --testTimeout=30000` — **6 archivos, 16/16 tests**.
- **PASS — immediate issue → save → print:** `issued-voucher-to-print.integration.test.ts` atraviesa emisión/grant real del servicio, token opaco, guardado de la venta, consumo/resolución y encoder/render efectivos; la salida visible SVG, PDF con imagen SVG y térmica PNG conserva la CAE.
- **PASS — formatted CUIT visual:** CUIT de issuer/Business `30-71234567-8` genera payload numérico `30712345678`, DTO verificado y render no vacío.
- **PASS — Consumidor Final sin identificador:** valores de BillingModal vacíos/omitidos, propiedades de identidad ausentes y la proyección de BillButtons con tipo vacío producen el mapping `99/0` y mantienen el flujo grant/save/render.
- **PASS — sin QR y legado:** DTO `none` conserva CAE y permite PDF/térmica sin símbolo; la reimpresión histórica recibe raw legado sólo desde el DTO/resolver y lo conserva sin reinterpretarlo.
- **PASS — suite vecina QR-data:** **12 archivos, 97/97 tests**, incluyendo concurrencia/CAS y la regresión del adapter de pago parcial sin grant estándar.
- **PASS — serialización de fecha:** `afip-serializable-bill-payload` **1 archivo, 9/9 tests**; el wire date ISO queda independiente de la fecha civil QR.
- PDF/térmica/histórico ampliado: **13 archivos, 98/104 tests**. Los seis fallos no están en la suite SVG focal y se clasifican en `afip-arca-qr-data/TEST_CHECKLIST.md`; no se adjudica causalidad sin baseline.
- **PASS — Prisma:** `npx prisma validate --schema=prisma/schema.prisma`. No se aplicó migración.

**Estado para reviewer:** la aceptación focal G4 de issue/save/render y todos los casos visuales QR enumerados arriba pasa. Los fallos del batch amplio de regresiones permanecen reportados por separado; esta ejecución no representa un gate global de repositorio.

## Step 2 — G2: diagnósticos QR server-only (RED)

Esta ampliación se deriva de los contratos AC-08, AC-13, AC-14 y AC-15 de `SPEC.md`. Reutiliza los mocks/fixtures sintéticos de emisión, guardado, resolver y render; sólo añade tests/helpers de QA y este checklist. No se modifica `src/` ni `SPEC.md`.

La privacidad aquí se aplica a los **diagnósticos**: el token opaco de autorización de emisión, el `orderId` requerido por el handoff, la CAE fiscal y el `qrValue` autorizado del DTO de impresión siguen en sus contratos existentes según `SPEC.md`; ninguna razón/etapa/outcome se agrega a esos retornos ni se usan esos valores en telemetry/logs.

- [x] La creación de grant distingue `claims-invalid` de `grant-create-failed`; la prueba de persistencia fallida exige que la emisión mantenga CAE exitoso, omita token QR y no reintente AFIP.
- [x] El consume distingue `token-absent` de un token presente sin binding (`binding-mismatch`) y exige que la venta conserve CAE/policy `1` sin claims QR del cliente.
- [x] El resolver cubre `policy-v1-no-ref`, `grant-row-missing`, `issuer-mismatch`, `payload-invalid` y selección no vacía `QR-ready`/`verified-url`.
- [x] La prueba de handoff llama `resolveOrderQrPrintDtoAction` y comprueba que una invocación satisfactoria puede devolver DTO `none`; `reason` permanece sólo en telemetría interna, nunca en el DTO. No se usa el estado HTTP como señal de QR listo.
- [x] La integración issue/save/resolve/encoder requiere eventos categóricos de grant, consume, resolver y render. Verifica SVG/PDF/PNG reales aparte del evento `QR-ready`.
- [x] La suite de render visible verifica que el browser no reciba eventos de diagnóstico ni props/campos diagnósticos; la captura de logs comprueba privacidad de identificadores y valores de fixtures.
- [x] Implementación de telemetría y suite G2 GREEN; validada en la ejecución QA del 2026-11-27.

### Ejecución RED G2

```text
npm run test -- ai/features/afip-arca-qr-svg-display/afip-voucher-qr-grant.test.ts ai/features/afip-arca-qr-svg-display/missing-proof-handoff.test.ts ai/features/afip-arca-qr-svg-display/issued-voucher-to-print.integration.test.ts ai/features/afip-arca-qr-svg-display/standard-invoice-render-output.test.tsx ai/features/afip-arca-qr-data/qr-attestation-emission.test.ts ai/features/afip-arca-qr-data/qr-attestation-sales-actions.test.ts ai/features/afip-arca-qr-data/qr-attestation-print-resolver.test.ts --maxWorkers=1 --testTimeout=30000
```

- **RED intencional:** Vitest transformó y ejecutó **7 archivos / 38 tests**: **26 pasaron y 12 fallaron** en cinco suites al no encontrar los eventos estructurados de grant-create, save-consume-ref, resolve y render. Los fallos son exclusivamente las nuevas expectativas de telemetría ausente; las comprobaciones existentes de CAE/policy, trust boundary, resolver DTO y salida SVG/print pasan. `standard-invoice-render-output` y el límite público de emisión pasan.
- **TypeScript global:** `npx tsc --noEmit --pretty false` no terminó verde por errores preexistentes en `src/__tests__`/`tests` (fixtures de productos, auth/middleware, componentes y shortcuts). No informó errores en los siete archivos de test modificados ni en el helper nuevo.
- En RED, el fallo observado es la ausencia de eventos —no una regresión del flujo fiscal o de impresión—. Las categorías se comparan contra la allowlist de `SPEC.md`; sentinels sintéticos sólo se usan en aserciones y no deben aparecer en los logs.

## Step 4 QA — corrección de assertion y verificación — 2026-11-27

Se corrigió únicamente el helper de tests `qr-telemetry-test-helpers.ts`: el patrón genérico de categorías ya no excluye dígitos antes de revisar `reason`; cada `reason` se compara con `ALLOWED_REASONS`, que contiene el valor exacto `policy-v1-no-ref` y el resto de la allowlist cerrada. No se amplió `SPEC.md`, no se modificó `src/` y no se relajó la validación para aceptar razones arbitrarias.

- **PASS — diagnóstico focal:** `npm run test -- ai/features/afip-arca-qr-svg-display/afip-voucher-qr-grant.test.ts ai/features/afip-arca-qr-svg-display/missing-proof-handoff.test.ts ai/features/afip-arca-qr-svg-display/issued-voucher-to-print.integration.test.ts ai/features/afip-arca-qr-svg-display/standard-invoice-render-output.test.tsx ai/features/afip-arca-qr-data/qr-attestation-print-resolver.test.ts ai/features/afip-arca-qr-data/qr-attestation-sales-actions.test.ts --maxWorkers=1 --testTimeout=30000` — **6 archivos, 36/36 tests**.
- **PASS — `afip-arca-qr-svg-display`:** `npm run test -- ai/features/afip-arca-qr-svg-display --maxWorkers=1 --testTimeout=30000` — **6 archivos, 20/20 tests**.
- **PASS — `afip-arca-qr-data`:** `npm run test -- ai/features/afip-arca-qr-data --maxWorkers=1 --testTimeout=30000` — **12 archivos, 102/102 tests**.
- **PASS — pagos parciales:** `npm run test -- ai/features/afip-partial-payment-voucher --maxWorkers=1 --testTimeout=30000` — **12 archivos, 133/133 tests**.
- **PASS — Prisma:** `npx prisma validate --schema=prisma/schema.prisma` — schema válido; no se ejecutó migración.
- **Privacidad observada:** la salida del runner sólo mostró nombres de suites, conteos y avisos de Node/deprecación; no mostró QR/token, CAE, CUIT, payload ni datos personales. Los tests de telemetría comprobaron que los logs capturados excluyen sentinels/valores privados y que los diagnósticos no aparecen en DTOs, resultados de acciones ni salida/props del navegador. Prisma indicó que cargó variables desde `.env`, pero no imprimió sus valores. Los fixtures son sintéticos y no se llamó a AFIP/ARCA.

## Step 2 — G2 actualizado: commit, action de renderer y resultados de render

Alcance de esta iteración: añadir pruebas RED y acceptance checklist sin editar `src/` ni `SPEC.md`. La cobertura de resolver/telemetría existente se conserva intacta y no se modifica su helper ni sus aserciones. Todos los datos de fixtures son sintéticos; ningún test usa AFIP/ARCA ni una base real.

### Criterios nuevos de QA

- [ ] `processSaleAction` y `updateOrderCaeAction`: la callback interactiva termina, pero si el promise de `$transaction` rechaza al confirmar, no existe evento `save-consume-ref/reference-persisted`.
- [ ] Ambos caminos emiten `reference-persisted` sólo después de que el promise de la transacción se resuelve; no dentro de la callback.
- [ ] La nueva Server Action de reporte autentica en cada llamada y permite únicamente `{ renderer, outcome }` con renderer `pdf | thermal-html | qz | partial` y outcome `generated | failed | submitted`.
- [ ] La Server Action rechaza falta de sesión, enums no permitidos, tipos incorrectos, entradas no acotadas y campos adicionales; los inputs inválidos no se incorporan a logs.
- [ ] El reporte válido registra únicamente `{ stage: "render", renderer, outcome }`; la respuesta pública es un acknowledgement genérico sin `reason`, diagnóstico ni echo del input.
- [ ] PDF/thermal/partial reportan `generated` sólo tras construir SVG/PNG no vacío; fallo de renderer/encoder informa `failed` y no falsifica `generated`.
- [ ] QZ informa `submitted` sólo tras resolver correctamente la llamada de handoff. Un rechazo del handoff no puede emitir `submitted`.
- [ ] Los requests y logs del reporte omiten QR URL/raw/payload, CAE, CUIT, `orderId`, tenant IDs, bearer tokens, errores, diagnóstico y metadatos arbitrarios; no se reporta éxito de impresión física.
- [ ] Los mocks de Server Actions/rutas de producción existentes son locales a los tests. El test del export aún no implementado usa import dinámico/cast para compilar durante RED.

### Archivos de prueba añadidos

- `reference-persisted-commit.test.ts` — casos process/update, callback completada y rechazo en commit, además de orden del evento post-commit.
- `renderer-report-server-action.test.ts` — carga dinámica de `reportQrRendererOutcomeAction` y contrato de auth, enums, validación, respuesta y logs.
- `renderer-outcome-integration.test.tsx` — PDF con SVG tardío/fallido y ticket de pago parcial con PNG tardío; inspecciona requests únicamente enum.
- `thermal-qz-render-outcome.test.ts` — PNG térmico no vacío, error de encoder y handoff QZ correcto/rechazado.

### Ejecución G2 — RED intencional

```text
npm run test -- ai/features/afip-arca-qr-svg-display/reference-persisted-commit.test.ts ai/features/afip-arca-qr-svg-display/renderer-report-server-action.test.ts ai/features/afip-arca-qr-svg-display/renderer-outcome-integration.test.tsx ai/features/afip-arca-qr-svg-display/thermal-qz-render-outcome.test.ts --maxWorkers=1 --testTimeout=30000
```

- **RED focal confirmado:** el comando anterior ejecutó/transpiló los 4 archivos y **33 tests; 33 fallaron** por contratos aún no implementados. Sin errores de resolución/transformación de los tests en el pase final.
- `reference-persisted-commit.test.ts`: 4/4 RED. `processSaleAction` y `updateOrderCaeAction` emiten `reference-persisted` dentro de la callback; el evento aparece aun cuando se simula rechazo del commit y se registra con el indicador de callback activo.
- `renderer-report-server-action.test.ts`: 21/21 RED. El import dinámico compila, pero la export esperada `reportQrRendererOutcomeAction` aún no existe en `@/actions/sales/qr-print`; cubre doce pares allowlisted y nueve grupos negativos, incluidos extras con sentinels.
- `renderer-outcome-integration.test.tsx`: 4/4 RED. QR SVG/PNG y flujo de UI se ejecutan; no se llama al action report para PDF generated/failed ni partial generated/failed.
- `thermal-qz-render-outcome.test.ts`: 4/4 RED. Thermal encoder y QZ handoff mocked llegan a sus resultados, pero no se emite telemetría de generated/failed/submitted.
- **Privacy finding:** el test QZ de handoff rechazado también confirma que el `console.warn` actual serializa el error completo, incluyendo URL y token sintéticos. Su aserción normaliza `Error.message/stack` para que no pase desapercibido por `JSON.stringify(Error)`; el test focal aislado terminó RED por ese contenido sensible.
- Salida de runner: avisos de Node experimental module loading y `punycode`; no son fallos de los tests. `npx tsc --noEmit --pretty false` reporta errores de fixtures/archivos existentes en `src/__tests__` y `tests`, sin diagnóstico en estos cuatro tests. No se ejecutó full suite ni lint en este paso QA.
- Los tests previos de telemetría/resolver se dejaron intactos. No se modificó `src/` ni `SPEC.md`; los route/action, encoder, auth y QZ boundaries se mockean sólo en las pruebas donde corresponde.

## Step 2 — G2: root cause de producción y recuperación segura (RED)

Esta iteración agrega únicamente pruebas deterministas y acceptance evidence en `ai/features/afip-arca-qr-svg-display/`. No modifica `src/`, `SPEC.md`, el schema ni las migraciones. `Prisma.Decimal` se instancia en los fixtures desde `@prisma/client`; referencias al nuevo campo/relación y a la operación de reparación son dinámicas o verificadas desde texto para que las pruebas transpilen antes de regenerar Prisma Client.

### Criterios añadidos

- [ ] `consumeAuthorizedArcaQrGrant` normaliza `new Prisma.Decimal("2750.00")` a `"2750.00"`, devuelve claims utilizables, gana el CAS y no rechaza el claim válido como `payload-invalid`.
- [ ] Fecha imposible o importe Decimal no normalizable se rechazan antes del CAS; `updateMany` no se invoca y el grant queda consumible por un intento válido posterior.
- [ ] `processSaleAction` crea la orden y enlaza `AuthorizedArcaQrGrant.orderId` mediante CAS `null -> order.id` dentro de la misma transacción; `CAE.qrAttestationId` queda persistido y policy sigue en `1`.
- [ ] `updateOrderCaeAction` enlaza de igual manera un grant recién consumido con una orden existente y persiste su referencia CAE dentro de la transacción.
- [ ] La regresión equivalente al log de producción usa una orden policy `1`, CAE sin `qrAttestationId`, grant ya consumido con `orderId: null`, importe `Prisma.Decimal("2750.00")` y todos los bindings tenant/CAE/comprobante/POS/CUIT/IVA/documento iguales. `repairOrphanedQrGrantAction(orderId)` (no el resolver) repara exactamente un candidato bajo auth/tenant, gana CAS y escribe la referencia CAE en una transacción; sólo después el resolver read-only entrega `verified-url` con SVG no vacío, sin emitir otro comprobante ni crear otro grant.
- [ ] Mismatch, múltiples candidatos y CAS loser no actualizan el CAE ni enlazan grant; resolver continúa devolviendo exactamente `{ qrValue: null, qrKind: "none" }`.
- [ ] Una migración estrictamente nueva añade `orderId` nullable, unique y FK a `Order`, expone la relación opcional en schema, no edita la migración previa ya aplicada ni contiene backfill/asociación inferida.

### Pruebas añadidas

- `decimal-grant-consumption.red.test.ts` — Decimal real y claims inválidos antes del CAS.
- `sale-grant-order-link.red.test.ts` — creación y actualización de CAE, CAS y escritura transaccional.
- `orphan-grant-recovery.red.test.ts` — fixture del incidente, repair de único candidato, resolver/SVG y negativos mismatch/ambigüedad/CAS loser. Carga dinámicamente la export de reparación que todavía no existe.
- `additive-order-link-migration.red.test.ts` — contrato de migración/schema mediante lectura de archivos, sin depender de Prisma Client regenerado.

### Ejecución focal G2 — RED

```text
npm run test -- ai/features/afip-arca-qr-svg-display/decimal-grant-consumption.red.test.ts ai/features/afip-arca-qr-svg-display/sale-grant-order-link.red.test.ts ai/features/afip-arca-qr-svg-display/orphan-grant-recovery.red.test.ts ai/features/afip-arca-qr-svg-display/additive-order-link-migration.red.test.ts --maxWorkers=1 --testTimeout=30000
npm run test -- ai/features/afip-arca-qr-svg-display/decimal-grant-consumption.red.test.ts ai/features/afip-arca-qr-svg-display/sale-grant-order-link.red.test.ts ai/features/afip-arca-qr-svg-display/orphan-grant-recovery.red.test.ts ai/features/afip-arca-qr-svg-display/additive-order-link-migration.red.test.ts ai/features/afip-arca-qr-data/qr-attestation-sales-actions.test.ts ai/features/afip-arca-qr-data/qr-attestation-print-resolver.test.ts --maxWorkers=1 --testTimeout=30000
```

- **RED intencional confirmado:** 4 archivos / 10 tests ejecutados; **10 fallan y 0 pasan** por contratos aún no implementados: Decimal válido cae en `payload-invalid`, claims inválidos consumen antes de validarse, no existe la operación de reparación, sales actions no CAS-linkean `orderId`, y aún no hay migración/relación nueva.
- **G2 focal con regresiones adyacentes:** 6 archivos / 29 tests; **19 pasan** en las suites existentes de sales actions/resolver y los **10 RED** permanecen confinados a los cuatro archivos nuevos.
- Los cuatro archivos transforman y ejecutan hasta sus aserciones; no hay error de resolución de import ni de transformación de los tests. El test usa `Prisma.Decimal` existente y no depende de que el nuevo modelo/campo esté generado.
- `npx tsc --noEmit --pretty false` continúa bloqueado por errores existentes en `src/__tests__` y `tests` (fixtures Prisma incompletos, componentes/auth y shortcuts); no reportó errores en estos cuatro archivos de prueba.
- Datos sintéticos únicamente. No se llamó a AFIP/ARCA ni se ejecutó/aplicó una migración. `src/` y `SPEC.md` permanecen sin cambios.

## QA follow-up después de Step 4 — reparación explícita y contratos de mocks

Sólo se actualizaron pruebas y este checklist; no se tocaron `src/` ni `SPEC.md`. Este seguimiento corrige fixtures/mocks de QA que quedaron pendientes en el triage de Step 4 y, a la vez, hace RED la discrepancia restante de recuperación contra AC-21: la reparación debe invocarse explícitamente y el resolver no debe escribir.

### Cobertura y correcciones de QA

- [x] Los seis mocks de `issued-voucher-to-print.integration.test.ts` modelan los dos CAS del flujo normal: consumo (`consumedAt: null`) y link (`orderId: null → order.id`). La fila fake comienza con `orderId: null`, y el mock aplica `data` sólo cuando se cumplen sus condiciones CAS. Las aserciones de referencia/claims/render siguen activas.
- [x] El fake de `qr-persisted-print.integration.test.tsx` crea el grant con `orderId: null`; su `updateMany` existente hace cumplir el matcher y actualiza la fila fake para el CAS de asociación. No se relajaron los asserts de referencia, URL, SVG o PNG.
- [x] Los dos fixtures positivos de `qr-attestation-sales-actions.test.ts` incluyen el payload ARCA completo y consistente con CAE, monto, issuer, comprobante, fecha y destinatario. Las pruebas exigen ambos CAS y el link `null → saved-order-qr-1`; las rutas negativas sin/altered/replayed token siguen exigiendo que no haya consumo.
- [ ] `orphan-grant-recovery.red.test.ts` invoca la Server Action pública `repairOrphanedQrGrantAction(orderId)` con sesión autenticada y exige consulta bajo `{ id, businessId }`, link CAS y escritura CAE dentro de la transacción. Tras la acción, resolver devuelve URL verificada y no causa escrituras.
- [ ] Una lectura del resolver de la orden policy-1 huérfana devuelve `none` y no llama a `updateMany`/CAS ni `order.update`; los casos de mismatch, ambigüedad y CAS loser ejercitan la acción de repair, no un repair implícito de lectura.
- [x] Se preservaron los tests RED de Decimal real/validación previa a CAS y de asociación CAS normal; no se relajaron negativos de consumo ni los asserts de enlace.

### Ejecución focal y compilación G2

```text
npm run test -- ai/features/afip-arca-qr-svg-display --pool=threads --maxWorkers=1 --testTimeout=30000
npm run test -- ai/features/afip-arca-qr-data --pool=threads --maxWorkers=1 --testTimeout=30000
npx tsc --noEmit --pretty false
```

- **QR SVG-display:** 14 archivos; 59 tests pasan y 5 fallan. Los 5 fallos están en `orphan-grant-recovery.red.test.ts`: falta el export `repairOrphanedQrGrantAction` en la acción; además, la lectura actual del resolver devuelve URL al reparar implícitamente, contradiciendo los asserts de read-only. Es RED de conformidad de implementación, no un fallo de mock/fixture corregido.
- **QR data:** 12 archivos, 102/102 tests pasan.
- **Batch estrecho de Decimal/CAS y fixtures:** 5 archivos, 27/27 tests pasan; incluye `decimal-grant-consumption.red.test.ts`, `sale-grant-order-link.red.test.ts`, ambos tests de acciones, la integración persisted-print y la integración issue-to-print. Las filas fake enlazan el grant bajo el CAS requerido y los positive paths ahora avanzan hasta los asserts de impresión.
- **TypeScript / G2:** `npx tsc --noEmit --pretty false` sigue fallando en fixtures y tests no QR bajo `src/__tests__` y `tests` (productos, componentes, middleware/auth, seed-debts y shortcuts). No reporta diagnóstico en los archivos QR modificados ni en los tests nuevos/ajustados de G2.
- **Resultado:** el antiguo triage de siete fallos de fake CAS y dos payloads incompletos queda resuelto por el follow-up de QA. G4 sigue bloqueado hasta implementar la acción autenticada de reparación y retirar todo efecto de escritura del resolver. No se reemitió CAE, no hubo llamada real a AFIP/ARCA y no se aplicó migración.

## Step 4 QA — Decimal fix, CAS order link y reparación del orphan — 2026-11-28

QA sólo actualizó este checklist. No se modificaron `src/`, tests, schema ni migraciones. Los fixtures son sintéticos; no se emitió ni reemitió una CAE a AFIP/ARCA. Las ejecuciones focales usan `--pool=threads --maxWorkers=1` para evitar el cierre de forks de Windows (`EPERM`).

### Resultado de los criterios nuevos

- [x] **Decimal real y orden del CAS:** `decimal-grant-consumption.red.test.ts` usa `new Prisma.Decimal("2750.00")`; devuelve claims normalizados a `"2750.00"` y fecha civil, y el CAS ocurre sólo después de validar. Fecha imposible y Decimal `NaN` retornan `null` sin invocar `updateMany`.
- [x] **Asociación transaccional normal:** `sale-grant-order-link.red.test.ts` pasa los casos `processSaleAction` y `updateOrderCaeAction`: CAE/policy `1`, actualización CAS de `orderId: null` al ID de la orden y llamadas dentro de la transacción interactiva. Es evidencia de acciones con DB mock, no de rollback PostgreSQL real.
- [x] **Recuperación sintética del v1 sin referencia:** `orphan-grant-recovery.red.test.ts` verifica el único grant ya consumido/orphan con importe `Prisma.Decimal`, todos los bindings del fixture, referencia CAE y CAS; el resolver devuelve `verified-url` y `QRCode.toString` produce SVG no vacío. No crea otro grant. Los negativos de mismatch, dos candidatos y CAS loser quedan en `none` y no escriben referencia.
- [ ] **Consumo inválido y reintento válido:** se probó que las claims inválidas no alcanzan el CAS; la prueba disponible no realiza un segundo intento válido sobre la misma fila tras el rechazo. No se da por cubierto ese subcriterio adicional.
- [x] **Migración fuente aditiva:** `additive-order-link-migration.red.test.ts` pasa. `20261127120000_link_authorized_arca_qr_grants_to_orders/migration.sql` sólo añade `orderId TEXT` nullable, índice unique y FK `Order`; no hace backfill. La migración previa `20261127000000_add_authorized_arca_qr_grant` no contiene `orderId`.

### Ejecuciones seriales y outputs

```text
npm run test -- ai/features/afip-arca-qr-svg-display/decimal-grant-consumption.red.test.ts ai/features/afip-arca-qr-svg-display/sale-grant-order-link.red.test.ts ai/features/afip-arca-qr-svg-display/orphan-grant-recovery.red.test.ts ai/features/afip-arca-qr-svg-display/additive-order-link-migration.red.test.ts --pool=threads --maxWorkers=1 --testTimeout=30000
```

- **PASS focal nuevo:** 4 archivos, **10/10 tests**; sin `EPERM`.
- **Batch G4 de 8 archivos** (los cuatro tests nuevos, `qr-attestation-sales-actions`, `qr-attestation-print-resolver`, `qr-persisted-print.integration` y `standard-invoice-render-output`), ejecutado serial: **6 archivos pasan; 37/40 tests pasan; 3 fallan**. Los cuatro tests nuevos pasan. Las fallas son dos expectativas de consumo en `qr-attestation-sales-actions` y el caso positivo de save en `qr-persisted-print.integration` descritos en el triage inferior. `standard-invoice-render-output` pasa.
- **Suite `afip-arca-qr-svg-display`:** 14 archivos, **57/63 pasan; 6 fallan**, todas en los casos positivos de `issued-voucher-to-print.integration.test.ts` que requieren enlazar el grant al order. Los asserts de salida que dependen de esos saves no llegan a ejecutarse. No se observó `EPERM` con pool threads.
- **Suite `afip-arca-qr-data`:** 12 archivos, **99/102 pasan; 3 fallan**: los dos casos de `qr-attestation-sales-actions.test.ts` y el caso positivo de `qr-persisted-print.integration.test.tsx`. Se repitió serial con pool threads; no se produjo `EPERM`.
- **Suite de pagos parciales:** 12 archivos, **133/133 pasan**.
- **Resolver/histórico v0:** `qr-attestation-print-resolver.test.ts`, **10/10 pasan**, incluidos los dos casos de `legacy-raw` para versión 0.
- **Payload AFIP serializable:** 1 archivo, **9/9 pasan**.
- **Prisma:** `npx prisma validate --schema=prisma/schema.prisma` pasa.
- **Migración / estado aplicado:** la inspección SQL estática pasa dentro del test focal. `npx prisma migrate status --schema=prisma/schema.prisma` fue de sólo lectura: reporta que `20261127120000_link_authorized_arca_qr_grants_to_orders` está **pendiente/no aplicada** en la base configurada; no se ejecutó `migrate deploy`, `db push` ni otra escritura. El status también reporta divergencia de historial: `0001_add_pos_core_models` existe en la tabla remota pero no localmente, y lista un directorio local `20261128000000_link_authorized_arca_qr_grants_to_orders` sin `migration.sql`. No asumir que ese datasource corresponde a producción; resolver el drift antes del rollout.

### Clasificación de los 9 fallos de integración/suite

No se modificaron ni relajaron tests. Los nueve fallos observados al sumar las dos suites QR son **siete fallos de fixtures/mocks de la nueva operación CAS de link** y **dos fallos de fixtures de claims**; ninguno demuestra por sí solo que el Decimal fix o el CAS de producción falle:

1. **7 fallos de mock CAS link (no fallo del consume CAS):** seis en `issued-voucher-to-print.integration.test.ts` y uno en `qr-persisted-print.integration.test.tsx`. En ambos mocks, `updateMany` sólo modela `consumedAt: null -> consumedAt`; no modela el segundo CAS que ahora exige `orderId: null -> order.id`. El mock devuelve `count: 0`, la implementación lanza `QR grant association failed` dentro de la transacción y el save simulado falla. En `qr-persisted-print.integration`, además, la fila grant creada no inicializa `orderId: null`, por lo que el matcher estricto tampoco puede satisfacer el `where` del link. Son fallos reproducibles de adaptación del doble de base de datos al nuevo contrato; permanecen pendientes y no se alteraron.
2. **2 fallos no atribuibles al CAS de link:** `qr-attestation-sales-actions.test.ts` espera que dos grants con payloads parciales (`{ ver: 1, fecha: ... }`) se consuman. El validador real exige el payload QR completo ligado a CAE, importe, emisor, comprobante y destinatario; por ello el consumo se rechaza antes del CAS y las expectativas de llamada a `grantUpdateMany` fallan. Es un fixture legado/incompleto frente al contrato actual, no evidencia de un defecto con claims válidas. No se editó ni debilitó.

Los conteos no deben sumarse como nueve fallos distintos dentro del batch de ocho archivos: éste sólo reúne los tres fallos presentes en las suites incluidas; los seis restantes aparecen en la suite completa SVG.

### Bloqueo G4 / posibilidad de reparar la orden real

- **El comportamiento de repair requiere ajuste de conformidad antes de dar G4 por aprobado:** `resolveOrderQrPrintDto()` llama actualmente a `repairConsumedOrphanArcaQrGrant(orderId)` al resolver una orden policy `1` sin referencia. `SPEC.md` exige que la reparación sea una operación explícita, única y server-side, y que una lectura del resolver no repare registros. La prueba de recovery prueba el resultado de la reparación y del resolver, pero no elimina esta discrepancia de diseño. No se modificó source en esta pasada.
- La recuperación sintética produce `verified-url` y SVG no vacío. La cobertura de PDF/PNG disponible acredita el flujo estándar cuando el save/link mock funciona; en esta ejecución, los tests de integración bloqueados por los mocks CAS no permiten afirmar que el **mismo order recuperado** llegó a PDF/térmica PNG. Ese es un límite de evidencia, no se infiere desde `QR-ready`.
- **No se puede confirmar ni ejecutar la reparación de la orden de producción con el log sanitizado solamente.** El log no proporciona un `orderId` operativo ni permite demostrar unicidad/todos los bindings del grant huérfano. El procedimiento necesita la orden objetivo y exactamente un grant ya consumido con `orderId` nulo, todos los bindings iguales y migración aplicada; no se llamó a la acción sobre una orden real. No reemitir ni consultar el comprobante para recuperarlo.
- **G4: NOT PASSED / bloqueado.** Los cuatro tests focales nuevos están verdes, pero quedan los nueve fallos de fixtures sin corregir, la invocación de reparación desde una lectura del resolver contradice SPEC, los renders de PDF/PNG para la orden reparada no quedaron probados en esta ejecución y la migración requerida está pendiente en el datasource consultado.

## Step 4 QA — reparación explícita / Decimal / regresiones de impresión — ejecución actual

Sólo se añade este resultado de QA. No se modificaron `src/`, tests, schema ni migraciones. No se llamó a AFIP/ARCA ni a una base para reparar una orden real. No se ejecutaron `migrate status`, `migrate deploy` ni `db push`.

- **PASS — cuatro suites nuevas:** Decimal consumo, link transaccional, recuperación huérfana y contrato SQL/schema de migración — **4 archivos, 11/11 tests**.
- **PASS — suites QR y pago parcial solicitadas:** `afip-arca-qr-svg-display`, `afip-arca-qr-data` y `afip-partial-payment-voucher` — **38 archivos, 299/299 tests**. Incluye `issued-voucher-to-print.integration`, `qr-persisted-print`, resolver read-only/legacy v0, acción de repair, render PDF/térmico/inmediato/reimpresión/outcome, QR data/SVG y pagos parciales.
- **PASS — assertions del recovery:** `Prisma.Decimal("2750.00")` queda normalizado y validado antes del CAS; inválidos (fecha y Decimal NaN) no consumen. El vínculo normal `orderId: null → order.id` y referencia CAE se verifican dentro de la transacción en `processSaleAction`/`updateOrderCaeAction`.
- **PASS — repair explícito sintético:** una sesión autenticada repara un único grant huérfano consumido, con binding completo, mediante CAS y escritura de referencia CAE transaccionales; resolver posterior devuelve `verified-url` y el encoder QR produce SVG no vacío, sin crear otro grant. Mismatch, ambigüedad y CAS loser permanecen en `none`; lectura del resolver de un v1 huérfano no escribe. Policy v0 conserva raw byte-for-byte.
- **Print-trigger caveat:** la inspección de `PrintableTable` y `PrintOptionsPopover` confirma que ambos llaman a la acción explícita al obtener `none` y vuelven a resolver. Las suites verifican repair→URL/SVG y, por separado, render PDF/térmico/immediate/reprint; no encontré una aserción de integración única que demuestre que la impresión de esa misma orden reparada dispara la acción y entrega el QR al PDF/PNG. Ese punto queda **parcialmente probado**, no se infiere como cobertura integrada.
- **PASS — Prisma y SQL estático:** `npx prisma validate --schema=prisma/schema.prisma`; migración nueva `20261127120000_link_authorized_arca_qr_grants_to_orders` contiene sólo columna nullable `orderId`, índice unique y FK a `Order`, sin backfill; la migración anterior no fue reescrita. No se aplicó migración.
- **PASS — ESLint de implementación focal:** los archivos de acción, servicio y renderer inspeccionados lint-ean sin errores. ESLint extendido a los tests focales reporta 3 errores `@next/next/no-assign-module-variable` en `decimal-grant-consumption.red.test.ts` y `orphan-grant-recovery.red.test.ts`, más 2 warnings de tipos no usados en `renderer-report-server-action.test.ts`; no se cambiaron tests.
- **TypeScript global — FAIL ajeno al scope QR:** `npx tsc --noEmit --pretty false` sigue fallando en fixtures/tests existentes bajo `src/__tests__` y `tests` (modelos Prisma incompletos, middleware/auth y otros mocks). Las 299 pruebas focales sí transformaron y ejecutaron. No se atribuyen esos errores al recovery QR sin un baseline independiente.
- **Drift / despliegue:** según el reporte previo (no reconsultado por la restricción), la base configurada reportó `20261127120000_link_authorized_arca_qr_grants_to_orders` pendiente; una migración remota `20261128000000` no existe localmente y `0001_add_pos_core_models` existe remotamente pero no localmente. El árbol actual sí contiene el SQL de `20261127120000` y no contiene la carpeta de `20261128000000`. Esto es drift de historial y bloquea un rollout seguro hasta reconciliarlo; no se infiere que ese datasource sea producción.
- **Orden real:** no se reparó ni se puede confirmar con evidencia actual. Podría repararse mediante la acción sólo después de resolver el drift, aplicar la nueva migración en la base correcta y confirmar con datos operativos autorizados que existe exactamente un grant consumido huérfano con todos los bindings iguales. No reemitir CAE para recuperarla.
- **Estado QA:** resultados funcionales focales verdes, con caveat de integración print→repair→renderer y gates de ESLint de tests/TypeScript no verdes; no declarar G4 global aprobado ni reparación de producción confirmada.

## Step 2 — G2: reimpresión UI → recuperación explícita → PDF/térmica

Se añadió `print-trigger-orphan-recovery.integration.test.tsx` para cerrar el caveat de integración anterior. Sólo se agregaron tests y este checklist: `src/` y `SPEC.md` permanecen intactos. No se aplicó migración; el fake stateful modela el campo nullable `orderId` compatible con el esquema esperado.

- [x] El click real de `PrintOptionsPopover` inicia con una orden persistida sintética `qrDataPolicyVersion: 1`, CAE sin `qrAttestationId` y un grant ya consumido con `orderId: null`.
- [x] PDF y térmica invocan la acción real `repairOrphanedQrGrantAction(ORDER_ID)` exactamente una vez; la transacción stateful hace CAS `orderId: null → ORDER_ID` y actualiza `CAE.qrAttestationId` en la misma orden.
- [x] Tras reparar, la UI vuelve a llamar el resolver real exactamente una vez con el mismo `orderId`; el DTO observado es `verified-url`. La primera y segunda lectura usan el mismo identificador; el test falla si el flujo entra en loop.
- [x] PDF usa el template y encoder SVG reales: la exportación inspeccionada contiene `<img src="data:image/svg+xml;base64,...">` y conserva CAE. Sólo se stubbea la frontera final `exportToPDF`.
- [x] La ruta térmica usa el encoder real y genera una imagen PNG con firma válida dentro del HTML de impresión; CAE permanece presente.
- [x] Si no hay grant elegible, tanto PDF como térmica siguen exportando con CAE, omiten imagen QR, conservan la orden sin referencia y no reintentan la acción.
- [x] Sólo se aíslan auth, DB stateful, telemetría/Next y la frontera PDF final. Resolver, repair y generadores `qrcode` SVG/PNG son reales. No se importan ni invocan rutas de emisión; no se llama a AFIP/ARCA.

### Ejecución G2

```text
npm run test -- ai/features/afip-arca-qr-svg-display/print-trigger-orphan-recovery.integration.test.tsx --pool=threads --maxWorkers=1 --testTimeout=30000
npx tsc --noEmit --pretty false
```

- **PASS focal:** 1 archivo, **4/4 tests**; la ejecución final cubre reparación de reimpresión PDF, reparación y PNG térmico, y ambos renderers sin grant.
- **RED inicial observado:** los dos positivos fallaron primero porque el DB fake comparaba por identidad Decimal/objeto en vez de igualdad decimal contra el `fiscalAmount` canónico consultado. Se ajustó sólo el matcher del fake para comparación decimal exacta; no se relajó el contrato de producción. Al repetir, el test terminó **4/4 PASS**.
- **TypeScript global:** sigue bloqueado por errores preexistentes en `src/__tests__` y `tests` (fixtures/modelos, auth/middleware y shortcuts). No se reportaron errores para el nuevo archivo de integración.
- No se ejecutó ni aplicó migración, no se usó una base real y no se hicieron llamadas AFIP/ARCA.

## Step 2 — G2: resolver grant/order binding regression (RED)

Se añadió una regresión aislada en `../afip-arca-qr-data/qr-attestation-print-resolver.test.ts`. El caso negativo usa una orden y un grant de tenant correcto, con referencia CAE, número, POS, monto, emisor, destinatario y payload válidos; la única discrepancia es `grant.orderId` asociado a otra orden. Exige DTO `none`, telemetría interna allowlisted `invoice-binding-mismatch`, exclusión del QR del DTO y cero llamadas a los delegates de escritura. El test positivo ya existente ahora explicita `grant.orderId === order.id`. No se modificó `src/` ni `SPEC.md`.

### Ejecución G2

```text
npm run test -- ai/features/afip-arca-qr-data/qr-attestation-print-resolver.test.ts --pool=threads --maxWorkers=1 --testTimeout=30000
npx tsc --noEmit --pretty false --project ai/features/afip-arca-qr-data/tsconfig.g2.json
```

- **RED confirmado:** `npm run test -- ai/features/afip-arca-qr-data/qr-attestation-print-resolver.test.ts --pool=threads --maxWorkers=1 --testTimeout=30000` — 1 archivo, 10/11 pasan. El único test fallido acumula tres aserciones soft: DTO/URL no vacíos y telemetría `QR-ready` en vez de `invoice-binding-mismatch`. Las cuatro aserciones de delegates de escritura pasan (cero escrituras). El test positivo con `orderId` coincidente y los demás casos pasan.
- **TypeScript G2:** `npx tsc --noEmit --pretty false --project ai/features/afip-arca-qr-data/tsconfig.g2.json` — **PASS**. Se usó una configuración focal temporal que incluye el test, helper compartido y augmentación NextAuth; se retiró al terminar. No se usó el typecheck global como sustituto.
- No se modificó `src/` ni `SPEC.md`. El QR expuesto por el resultado fallido sólo apareció en la salida diagnóstica de Vitest; el fixture es sintético y las aserciones exigen que esa salida no se devuelva al caller una vez aplicado el fix.

## Step 4 QA — fixtures de grant ligados a la orden — 2026-11-28

Se ajustaron únicamente los fixtures positivos de `qr-attestation-print-resolver.test.ts` y `qr-persisted-print.integration.test.tsx`: cada grant v1 válido ahora tiene `orderId` igual al ID de la orden consultada. El caso negativo de mismatch sigue ligado explícitamente a `different-order-qr-a`; los fixtures huérfanos (`orderId: null`) usados para probar recuperación/CAS se conservaron intactos. No se modificó `src/`, `SPEC.md`, schema ni migraciones.

### Suites solicitadas

| Ejecución | Resultado | Evidencia |
|---|---|---|
| `qr-attestation-print-resolver.test.ts` serial con pool threads | **PASS — 1 archivo, 11/11** | Éxito URL/raw usa orden coincidente; mismatch de orden conserva `none`, telemetría acotada y cero escrituras; v0 y v1 sin grant conservan su política. |
| Recovery/integración de misma orden: `orphan-grant-recovery.red.test.ts`, `print-trigger-orphan-recovery.integration.test.tsx`, `issued-voucher-to-print.integration.test.ts`, `qr-persisted-print.integration.test.tsx` | **PASS — 4 archivos, 22/22** | La primera ejecución detectó tres fixtures de éxito staged en `qr-persisted-print.integration.test.tsx` con `orderId: null`; se completó sólo el dato de vínculo en esos fixtures y la repetición pasó. Grants huérfanos de recovery siguen empezando en null y requieren su CAS explícito. |
| `ai/features/afip-arca-qr-data` serial con pool threads | **PASS — 12 archivos, 103/103** | Incluye resolver y persistencia/resolución integrada. |
| `ai/features/afip-arca-qr-svg-display` serial con pool threads | **PASS — 15 archivos, 68/68** | Incluye recovery, vínculo CAS y render/impresión SVG/PNG. |
| `ai/features/afip-partial-payment-voucher` serial con pool threads | **PASS — 12 archivos, 133/133** | Sin regresiones en emisión, contrato, acciones y print de pago parcial. |
| Resolver legacy v0, filtro `version 0|historical raw` | **PASS — 2 tests** | Raw histórico se conserva exactamente como `legacy-raw`; no se modifica el comportamiento. |
| `standard-invoice-render-output.test.tsx` | **PASS — 1 archivo, 5/5** | Reimpresión PDF/térmica también pasa con el retorno `legacy-raw` del DTO. |
| `npx prisma validate --schema=prisma/schema.prisma` | **PASS** | Schema válido; no se ejecutó `db push` ni migración. |
| ESLint focal sobre los dos tests ajustados | **PASS** | Sin errores ni warnings. `git diff --check` no encontró whitespace problemático; sólo mostró avisos de conversión LF/CRLF en otros archivos ya modificados del worktree. |

### Suite global y clasificación del remanente

- Se intentó `npm run test -- --pool=threads --maxWorkers=1 --testTimeout=30000`. La ejecución recorrió numerosas suites, pero el proceso `npm`/Node terminó con **segmentation fault** antes de imprimir el resumen agregado de Vitest; por ello no hay conteo global fiable de archivos/tests.
- El log sí registra fallos fuera de las suites focales, entre ellos focus-search/BillButtons, `PrintableTable` (incluido barcode), `round-excel-prices`, fixtures de `seed-debts` (FK de Business), unpaid-orders (producto ausente), ventas pagination, fixtures/mocks incompletos de Prisma y `next/cache`, además de varias suites fiscales/credit-note. Son fallos observados en el estado actual; no se declara que sean preexistentes ni se atribuye causalidad sin baseline limpio. Ninguno aparece en las dos suites QR focales completas, que terminaron verdes.
- No se amplió el alcance para reparar esos fallos globales. El gate global queda **no verde/no concluyente por el crash del runner**; sólo se considera aprobada la validación focal reportada arriba.
