# Checklist de pruebas — fix-partial-payment-invoice

Alcance de este paso: regresiones unitarias deterministas alrededor de los fallos de registro, con dependencias Prisma/AFIP/notificaciones simuladas. Los fixtures contienen identificadores y mensajes sintéticos; no se usa una base, URL, cuenta fiscal ni servicio remoto real.

## Correspondencia local de idempotencia — RCA `P2022`

Contexto de evidencia: `phase=idempotency`, `commitOutcome=not_started`, `prismaCode=P2022`. El lookup durable anterior a la transacción requiere `CashMovement.businessId_idempotencyKey`, que a su vez depende de la columna `CashMovement.idempotencyKey`.

- [x] Prueba estática local (`cash-movement-idempotency-contract.test.ts`): verifica que `schema.prisma` declare la columna nullable y la unicidad compuesta `(businessId, idempotencyKey)`.
- [x] Prueba estática local: verifica que el lookup de `registerPayment` use el selector Prisma `businessId_idempotencyKey` con ambos campos esperados.
- [x] Prueba estática local: verifica que la migración versionada añada `CashMovement.idempotencyKey` y cree el índice único `CashMovement_businessId_idempotencyKey_key` sobre `(businessId, idempotencyKey)`.
- [ ] **Verificación de entorno separada (no cubierta por Vitest):** en la misma base que atiende el runtime, revisar `npx prisma migrate status` y comprobar que la migración `20261122000000_add_cash_movement_idempotency_key` esté aplicada/terminada y que la columna física `"CashMovement"."idempotencyKey"` exista. No inferir estos hechos a partir del test o de los archivos versionados.
- [x] Seguridad: no conectar a DB ni afirmar que la migración se aplicó en runtime. **No correr `prisma db push` ni crear la columna con DDL manual** como parte de esta verificación.
- **Ejecución local:** `npm run test -- ai/features/fix-partial-payment-invoice/cash-movement-idempotency-contract.test.ts --pool=threads --maxWorkers=1 --reporter=dot` — **PASS**, 1 archivo y 3 pruebas aprobadas. Esto verifica solo la correspondencia en los archivos del checkout; la verificación de entorno sigue pendiente.

## Incidente de migración `Business.qzTray` — P3018 / PostgreSQL 42701

- [x] **Estado reportado del despliegue:** `20260626000001_add_pg_trgm_search` (`pg_trgm`) quedó aplicada antes del fallo; `20260813000000_add_business_qz_tray` falló con P3018 / 42701 porque el destino reportó que `Business.qzTray` ya existe. Este es el estado informado del incidente, no una consulta runtime realizada por Vitest.
- [x] **Estado del flujo de migraciones reportado:** `migrate deploy` se detuvo en `20260813000000_add_business_qz_tray`; las migraciones posteriores no avanzaron en esa corrida y permanecen bloqueadas hasta reconciliar la fallida. No inferir que todas estén pendientes globalmente.
- [x] **Prueba estática local** (`business-qz-tray-migration-contract.test.ts`): comprobar que el SQL versionado tiene una sola sentencia, exactamente el `ADD COLUMN "qzTray" BOOLEAN NOT NULL DEFAULT false`, sin operaciones adicionales/ocultas, y que `Business.qzTray` concuerda con `Boolean @default(false)` en `schema.prisma`.
- [ ] **Verificación de entorno separada (no cubierta por Vitest):** inspeccionar en modo lectura el catálogo del mismo destino para confirmar tipo PostgreSQL `boolean`, `NOT NULL` y default `false`; revisar también el estado de `_prisma_migrations` para `20260626000001`, la fallida `20260813000000` y las posteriores. Una columna existente por nombre no basta para demostrar equivalencia.
- [ ] **Aclaración sobre posibles cambios manuales:** es posible que una columna o algún cambio de esquema se haya introducido manualmente, pero esto **no está confirmado** y no debe documentarse como hecho sin evidencia. Investigar origen y fecha de cualquier estado preexistente mediante evidencia aprobada; no inferirlo únicamente de la existencia actual de `Business.qzTray`.
- [ ] **Reconciliación del historial:** reconciliar individualmente las **18 migraciones** del conjunto afectado contra sus archivos SQL, el estado de `_prisma_migrations` y los efectos observables en el destino. Registrar para cada una si está aplicada, fallida, pendiente o requiere investigación; no asumir que todas están pendientes ni resolverlas en bloque.
- [ ] **Condición de merge/reanudación para `qzTray`:** no dar por resuelto ni integrar una recuperación que dependa de la columna preexistente hasta confirmar en el destino correcto la equivalencia completa de `Business.qzTray` (`boolean`, `NOT NULL`, default `false`), revisar la fila/estado de la migración fallida y reconciliar individualmente las 18 migraciones y el artefacto que se desplegará. Comprobar que el merge no introduce IDs de migración duplicados o divergentes ni una segunda aplicación del `ADD COLUMN`; preservar datos, columna e historial y contar con un plan operacional aprobado.
- [ ] **`prisma migrate resolve --applied` — uso estrictamente condicional:** solo considerar marcar `20260813000000_add_business_qz_tray` como aplicada después de demostrar equivalencia del efecto SQL versionado en el destino, revisar y comprender el historial de la ejecución fallida, contar con backup verificado y obtener aprobación del DBA. La presencia de la columna por sí sola no satisface estas condiciones. No ejecutar el comando como parte de esta verificación.
- [x] **Límite de seguridad:** el test solo lee SQL/schema del checkout; no conecta a DB ni comprueba catálogo, aplicación de migraciones o historial runtime. No ejecutar `migrate resolve`, `db push`, DDL, ni comandos de reparación en tests; no editar schema/migraciones ni `_prisma_migrations` en este paso.
- **Ejecución focalizada anterior:** `npm run test -- --pool=threads --maxWorkers=1 --testTimeout=30000 ai/features/fix-partial-payment-invoice/business-qz-tray-migration-contract.test.ts` — **PASS**, 1 archivo y 2 pruebas aprobadas. No se accedió a una DB; catálogo y `_prisma_migrations` runtime siguen pendientes de verificación independiente.

## Diagnóstico seguro en fronteras críticas

- [x] Fallos sintéticos en lock, lectura de idempotencia, carga/saldo, creación del movimiento, reserva del comprobante, actualización contable del cliente, actualización de la orden y commit informan la fase concreta y un código diagnóstico allowlisted.
- [x] Ningún fallo anterior al commit devuelve `success: true` ni `paymentRecorded: true`; tampoco inicia emisión AFIP, Pusher ni invalidación de caché.
- [x] Mensaje, stack, SQL/query, parámetros y marcadores sintéticos privados no aparecen en logs ni en el resultado observable.
- [x] Los tests no exigen texto crudo del error ni registran una serialización del objeto Prisma.

## Remito y atomicidad

- [x] Si la escritura del voucher `NOT_REQUIRED` falla después de crear el movimiento dentro de la transacción, la transacción simulada no confirma movimiento ni cambios contables.
- [x] El fallo de persistencia Remito produce resultado no exitoso, no llama a `issuePaymentVoucherForSession` y no dispara Pusher/cache.
- [ ] La prueba es de contrato unitario; no afirma demostrar rollback de PostgreSQL real, estado de migraciones, enum generado ni constraints desplegadas.

## Separación pago/comprobante (cobertura existente revisada)

- [x] `src/__tests__/unpaid-orders/register-payment.test.ts` ya verifica resultado post-commit con `paymentRecorded: true` junto a `voucherStatus: FAILED` y `UNKNOWN`, incluyendo `reconciliationRequired` cuando corresponde.
- [x] `ai/features/account-ledger-detail-reliability/payment-recorded-outcome.test.tsx` ya verifica que fallos/ambigüedad de voucher se presentan como pago registrado y no como éxito de emisión.
- [x] No se añade una transición incompatible: las pruebas nuevas conservan el contrato actual y no cambian la implementación.

## Replay durable antes de validar POS mutable — corrección del reviewer

- [x] Misma `idempotencyKey` y misma firma: reproducir el movimiento/voucher durable como pago registrado si el POS ya no está configurado; no abrir una transacción, no cambiar saldo/estado, notificar/cachear ni invocar el emisor. Ver reejecución posterior al arreglo abajo (contrato con mocks).
- [x] Misma clave y firma distinta: rechazar con el conflicto de idempotencia, antes de consultar la configuración POS y sin efectos contables, transacción ni emisión. Ver reejecución posterior al arreglo abajo (contrato con mocks).
- [x] Repetir una confirmación ya comprometida: devolver el resultado existente sin un segundo movimiento, reserva/intento, decremento de saldo, actualización de estado ni emisión. Ver reejecución posterior al arreglo abajo (contrato con mocks).
- [x] Las firmas se contrastan usando los campos del contrato de `registerPayment`/voucher existentes; no se añaden campos de firma nuevos al fixture.
- [x] Los escenarios usan claves UUID nuevas por test y fixtures sintéticos; validan llamadas observables de mocks en lugar de depender de reloj, red o base de datos real.

## Comandos focalizados y límites

- `npm run test -- ai/features/fix-partial-payment-invoice/cash-movement-idempotency-contract.test.ts`
- `npm run test -- src/__tests__/unpaid-orders/register-payment-diagnostics.test.ts`
- `npm run test -- src/__tests__/unpaid-orders/register-payment.test.ts`
- Cobertura PostgreSQL con migraciones aplicadas, derivación cliente generado/base, concurrencia real y validación de despliegue quedan fuera de estas pruebas simuladas y deben verificarse antes de liberar.

## Resultados del Paso 4 — 2026-11-25

- **PASS — pruebas de pago/diagnóstico y voucher UI:** Vitest con `--pool=forks --maxWorkers=1 --testTimeout=60000 --reporter=dot`, sobre `register-payment-diagnostics.test.ts`, `register-payment.test.ts`, `payment-recorded-outcome.test.tsx`, `payment-voucher-feedback.test.tsx`, las pruebas UI de fila/impresión/selector de punto de venta, `payment-voucher.contract.test.ts` y todos los tests de `ai/features/partial-payment-invoice-issuance`: **13 archivos, 162 pruebas pasadas, 0 fallidas** (147.61 s).
- **PASS — diagnósticos seguros y fallo de registro:** la prueba de diagnóstico recorre las fronteras pre-commit, exige `success: false`, ausencia de `paymentRecorded: true`, cero emisiones/notificaciones/cache y valida fase + código allowlisted. Sus marcadores sintéticos de mensaje, stack, SQL y parámetros no aparecen en el log capturado ni en el resultado; tampoco se registran claves `stack/query/params/sql`. El mensaje genérico para fallo inesperado de BD también se comprobó en `register-payment.test.ts`.
- **PASS — Remito sin AFIP:** los tests verifican que Remito persista `NOT_REQUIRED` junto al movimiento, y que falle de forma no exitosa y revierta escrituras si falla la transacción. En ambos casos el seam `issuePaymentVoucherForSession` no se invoca; para fallo transaccional tampoco hay Pusher/cache. La prueba es un contrato con mocks, no integración PostgreSQL.
- **PASS — factura separada del commit:** la cobertura post-commit mantiene `success: true` y `paymentRecorded: true` al fallar o quedar ambiguo el voucher (`FAILED`/`UNKNOWN`, con reconciliación cuando corresponde). La UI presenta esos casos como pago registrado y advertencia de factura, no como emisión exitosa.
- **PASS — ESLint focalizado:** `npx eslint` sobre estos tests, los tests de `partial-payment-invoice-issuance`, las acciones/servicios y componentes de pago relacionados terminó sin diagnósticos.
- **FAIL — ESLint global (`npm run lint`):** terminó con **49 errores y 21 warnings** en `src/`, incluyendo diagnósticos en fixtures/test files no relacionados, `src/actions/stock.ts`, pantallas de stock, `DailyReport.tsx`/`PeriodicReport.tsx` y otros componentes. No se modificó ningún archivo para corregirlos.
- **FAIL — TypeScript global (`npx tsc --noEmit --pretty false`):** reporta errores en fixtures/tipos de otras áreas, entre ellos `codebar.test.ts`, `getProductsPaginated.test.ts`, `ProductSelectionModal.test.tsx`, `RootMenu.test.tsx`, `tests/actions/*` y fixtures de `BillReducer`. No se mostró diagnóstico de los dos tests de registro de pago ni de los tests UI incluidos en el alcance.
- **Suite global — incompleta por timeout:** Vitest se ejecutó con `--pool=forks --maxWorkers=1 --testTimeout=60000`, excluyendo deliberadamente `src/__tests__/integration/return-order-lock.postgres.test.ts` para no conectar/escribir en ninguna BD. El proceso excedió el límite de ejecución de 20 minutos y fue terminado antes del resumen; por ello no hay total global confiable ni resultado PASS/FAIL. Hubo ruido de workers/avisos y tests ajenos al alcance que no terminaron dentro del límite.
- **Límites de seguridad:** los tests focalizados usan fixtures sintéticos y mocks de Prisma, AFIP, notificaciones y caché. La prueba PostgreSQL se excluyó y no se contactó ningún servicio fiscal ni se emitieron comprobantes.

## Paso 5 — Iteración 1/3: revisión de fallos focalizados

- **Revisión de `registerPayment`: PASS.** QA reporta 13 archivos y 162 pruebas focalizadas aprobadas, sin fallos. Además, se ejecutaron localmente `register-payment.test.ts` y `register-payment-diagnostics.test.ts`: 2 archivos, 41 pruebas aprobadas, 0 fallidas. No se encontró fallo focalizado atribuible a los cambios de `registerPayment`; no se modificó la implementación ni los tests en esta revisión.
- **Alcance de la instrumentación:** los tests sintéticos verifican que los límites críticos registren fase, resultado de commit y código Prisma seguro cuando está disponible, sin filtrar mensaje, stack, SQL/query ni parámetros. Esto localiza la frontera de fallo en una prueba simulada; **es instrumentación diagnóstica, no una RCA completa** ni evidencia de que el cliente generado, migraciones, enum, tablas o constraints del entorno real estén sincronizados.
- **Siguiente intento fallido:** recopilar únicamente los campos seguros `phase`, `commitOutcome` y `prismaCode` (si aparece, formato `P####`) del log de servidor de ese intento. Usarlos juntos para distinguir un problema de tabla/esquema (por ejemplo, `P2021` en la fase de reserva), una incompatibilidad de enum, una constraint conocida u otra operación. No copiar el mensaje original, stack, SQL, parámetros ni datos sensibles. Si fase/código apuntan a persistencia, confirmar en el mismo entorno el estado de migraciones y la versión del cliente generado antes de concluir la causa.
- **G4: NO PASA / incompleto.** G4 exige que pasen la suite global, `npm run lint` y `npx tsc --noEmit`. El lint focalizado pasa y la sub-suite de feature está verde; sin embargo, el lint global reporta 49 errores y 21 warnings en áreas ajenas, el typecheck global falla por problemas ajenos al alcance y la suite completa terminó por timeout sin resumen agregado confiable. Estos resultados no prueban un fallo focalizado de pagos, pero tampoco permiten declarar G4 aprobado. No se arreglaron problemas ajenos.
- **Límites restantes:** los 162 tests usan mocks; no prueban rollback PostgreSQL real, aplicación de migraciones, presencia de `NOT_REQUIRED` en la base/runtime, constraints desplegadas ni el artefacto generado en producción. No hubo llamadas a AFIP ni validación del contrato fiscal remoto.

## Corrección del reviewer — 2026-11-25

- Se añadieron tres pruebas RED a `src/__tests__/unpaid-orders/register-payment.test.ts` para replay durable con POS desconfigurado, conflicto de firma y ausencia de un segundo movimiento/intento/emisión tras repetir una confirmación. No se modificó código de aplicación.
- **Ejecución focalizada:** `npm run test -- src/__tests__/unpaid-orders/register-payment.test.ts --pool=forks --maxWorkers=1 --reporter=dot`: 1 archivo, **31 pasadas y 3 fallidas**. Las tres pruebas nuevas fallan de forma consistente porque la implementación consulta/rechaza la configuración POS antes de reproducir o comparar el movimiento durable; 31 pruebas preexistentes pasan.
- Los asserts de los tests son deterministas: usan mocks, UUID sintéticos y estado durable fijo/en memoria, y no usan temporizadores ni servicios externos. El resultado RED identifica el orden de validación actual; las aserciones de ausencia de efectos son parte del criterio y deben pasar al implementar el arreglo.

## Reejecución tras el arreglo de idempotencia — 2026-11-25

Para esta actualización documental no se modificaron código ni pruebas. La evidencia automatizada usa persistencia/gateway simulados; no se facturó, no se accedió a producción, no se abrió/aplicó una migración y no se contactó AFIP/ARCA.

### Pruebas focalizadas

- **PASS — registro y diagnósticos:** `npm run test -- --pool=threads --maxWorkers=1 --testTimeout=30000 src/__tests__/unpaid-orders/register-payment.test.ts src/__tests__/unpaid-orders/register-payment-diagnostics.test.ts` — **2 archivos, 44 pruebas pasaron, 0 fallaron**.
- **PASS — emisión, comprobante y presentación (ejecutado por grupos):** `ai/features/partial-payment-invoice-issuance` — **5 archivos, 33 pruebas**; `ai/features/afip-partial-payment-voucher` — **12 archivos, 132 pruebas**; `src/components/account-ledger/PaymentVoucherRowActionClient.test.tsx` y `ai/features/account-ledger-detail-reliability` — **6 archivos, 19 pruebas**.
- **Agregado focalizado:** **25 archivos, 228 pruebas pasaron, 0 fallaron**. La invocación agregada inicial excedió el timeout de 240 s sin resumen; cada grupo se ejecutó luego por separado y terminó correctamente.

### Replay idempotente

- **PASS — replay durable con la misma clave/firma y POS retirado:** el replay devuelve el estado durable sin consultar configuración, abrir otra transacción, emitir, notificar con Pusher ni revalidar caché.
- **PASS — misma clave con firma distinta:** cambiar el importe produce el rechazo seguro `La clave de confirmación ya fue utilizada para otro pago`, sin transacción ni efectos externos.
- **PASS — ausencia de duplicados:** repetir la confirmación conserva una sola transacción, movimiento, reserva/intento, débito contable y emisión. El test concurrente `register-payment-concurrent-idempotency.test.ts` pasa y comprueba una única escritura/efecto para dos llamadas con la misma clave.
- Estos resultados verifican contratos con mocks; no demuestran unicidad, aislamiento ni concurrencia real en PostgreSQL.

### Lint y TypeScript

- **PASS — ESLint focalizado:** la ejecución sobre acciones/servicios, pruebas de pago e idempotencia y componentes/features relacionados terminó sin diagnósticos.
- **FAIL — `npm run lint`:** **49 errores y 21 advertencias** reportados en `src/`. Los hallazgos son de alcance general; no aparecen en los archivos focalizados de pago/idempotencia cubiertos por ESLint. El gate global queda abierto.
- **FAIL — `npx tsc --noEmit`:** permanecen errores globales de tipado en fixtures/pruebas existentes (`src/__tests__` y `tests/actions`), incluidos datos Prisma incompletos, mocks de NextAuth tipados como `NextMiddleware` e import/componente de test ausente. No se reportaron diagnósticos en los archivos focalizados de pago/idempotencia; el gate TypeScript global no pasa.

### Pendientes y resultado

- **PENDIENTE — QA PostgreSQL:** no se ejecutó integración contra PostgreSQL. Falta validar en una base QA aislada la restricción durable/índice de idempotencia, atomicidad, replay y concurrencia tras el arreglo. No usar producción.
- **PENDIENTE — suite global:** `npm run test` no se ejecutó en esta reejecución. El intento global previo excedió el límite de 20 minutos y terminó sin resumen agregado confiable; la cobertura focalizada no sustituye este gate.
- Se mantienen los bloqueos fiscales y de reconciliación autoritativa `UNKNOWN` ya documentados: ninguna prueba focalizada ni mock los resuelve.

**Resultado:** las regresiones focalizadas de idempotencia pasan, incluido el replay durable con POS retirado, el rechazo de una firma distinta y la ausencia de duplicados. No se declara aprobado QA PostgreSQL ni calidad global: quedan pendientes la suite completa y PostgreSQL, y los gates globales de lint y TypeScript fallan por diagnósticos ajenos al alcance focalizado.

## Paso 4 — Reejecución QA solicitada — 2026-11-25

- **PASS — contrato de migración `Business.qzTray`:** `npm run test -- --pool=threads --maxWorkers=1 --testTimeout=30000 ai/features/fix-partial-payment-invoice/business-qz-tray-migration-contract.test.ts` — **1 archivo, 2 pruebas pasadas, 0 fallidas**. Solo valida SQL/schema en el checkout.
- **PASS — contrato de idempotencia `CashMovement`:** `npm run test -- --pool=threads --maxWorkers=1 --testTimeout=30000 ai/features/fix-partial-payment-invoice/cash-movement-idempotency-contract.test.ts` — **1 archivo, 3 pruebas pasadas, 0 fallidas**. Solo valida SQL/schema/lookup en el checkout.
- **Seguridad y límites:** ambas pruebas son estáticas; no se conectó a DB, no se ejecutó `prisma migrate status`, `migrate resolve`, `migrate deploy`, `db push` ni DDL. No se modificó SQL ni schema. El estado de las migraciones en cualquier entorno sigue sin verificarse. La posibilidad de cambios manuales, incluida la creación de `Business.qzTray`, es una hipótesis a investigar, no un hecho establecido.
- **Gate de migraciones pendiente:** verificar el destino y reconciliar las 18 migraciones individualmente antes de proponer recuperación/merge. Para `qzTray`, mantener como prerequisitos la equivalencia completa de la columna y el historial fallido; `migrate resolve --applied` solo se podrá considerar tras equivalencia demostrada, revisión de la ejecución fallida, backup verificado y aprobación del DBA.
- **PASS — `registerPayment` y diagnósticos:** `npm run test -- --pool=threads --maxWorkers=1 --testTimeout=30000 src/__tests__/unpaid-orders/register-payment.test.ts src/__tests__/unpaid-orders/register-payment-diagnostics.test.ts` — **2 archivos, 44 pruebas pasadas, 0 fallidas**. Incluye los casos focalizados de registro/replay y fronteras diagnósticas simuladas.
- **Límite de esta ejecución:** no se ejecutó integración con DB ni `prisma migrate status` contra DB; no se accedió a producción ni se leyeron variables secretas. **PENDIENTE** confirmar en una base runtime/QA controlada que la migración esté aplicada y que exista físicamente `CashMovement.idempotencyKey` (y su índice); los tests estáticos no acreditan ese estado.
- **Lint/typecheck:** no se reejecutaron en este paso; no se reclama una nueva validación focalizada ni global de estos gates.
- **Gates globales conocidos:** no se reejecutaron en este paso. Sigue vigente la evidencia anterior: `npm run lint` global falla con 49 errores y 21 warnings; `npx tsc --noEmit` falla con errores preexistentes ajenos al alcance focalizado; el intento de suite global expiró sin resumen confiable. Consulte los resultados globales anteriores de este checklist. Estos dos contratos focalizados en PASS no cierran esos gates.
- **Cambios:** solo se actualizó este checklist; no se modificaron código, tests, SQL ni schema.
