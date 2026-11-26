# Checklist de pruebas — emisión de factura por pago parcial

Este checklist convierte los requisitos y AC-01–AC-20 de `SPEC.md` en condiciones verificables. Las pruebas automatizadas del directorio son pruebas de contrato/unidad con dependencias simuladas; las filas marcadas como integración requieren además validar PostgreSQL y el gateway real antes de declarar liberado el flujo.

## Pago, reserva durable e idempotencia

- [ ] Para Factura A, B y C, la confirmación escribe un único `CashMovement`, los cambios contables existentes y una reserva `PaymentVoucher(PENDING)` con primer intento `PREPARING`, ligados por `cashMovementId`.
- [ ] Voucher e intento conservan el importe normalizado del movimiento, tipo y POS verificado, más el snapshot mínimo de destinatario calculado en servidor.
- [ ] Movimiento, reserva e intento son parte del mismo commit local. La emisión remota no empieza antes de concluir el commit.
- [ ] Si falla la persistencia del voucher o del intento, la transacción revierte movimiento y contabilidad; la acción informa que el pago no se registró y no invoca AFIP.
- [ ] Si ocurre un fallo después del commit, el movimiento y los cambios contables permanecen; el resultado fiscal se informa independientemente.
- [ ] Repetir o ejecutar en concurrencia la misma confirmación con la misma clave idempotente devuelve el movimiento/estado existente: no repite movimiento, reserva, intento, débito de saldo ni POST.
- [ ] Una clave nueva identifica una confirmación intencional distinta, incluso si orden, importe y método coinciden; puede crear otro pago y su voucher independiente.
- [ ] Clave ausente, inválida, o reutilizada en otro ámbito de negocio se rechaza sin crear movimiento ni intención.
- [ ] La identidad idempotente se mantiene estable ante timeout/respuesta perdida; un retry deliberadamente nuevo usa una clave distinta.
- [ ] La contabilidad se aplica exactamente una vez y el pago conserva el importe normalizado congelado en movimiento, voucher e intento.

## Estados, despacho y persistencia final

- [ ] Errores de autenticación/datos fiscales/POS, elegibilidad, credenciales, validación, numeración, preparación, construcción/serialización o marcador —si se acredita que el POST no ocurrió— terminan en `FAILED` y cero POST cuando el marcador no quedó persistido.
- [ ] El marcador durable de despacho se completa después de toda preparación y justo antes del POST. Si el marcador falla, el adaptador no despacha.
- [ ] El rechazo remoto inequívoco que demuestra no autorización termina en `FAILED`; el movimiento permanece registrado y el retry requiere acción explícita y nueva validación.
- [ ] Timeout, desconexión, reset, respuesta malformada/indeterminada o caída luego de que el despacho pudo ocurrir terminan en `UNKNOWN` (o `ISSUING` solo mientras el proceso sigue activo), nunca en `FAILED` reintentable.
- [ ] `UNKNOWN` conserva el pago, requiere reconciliación, no permite otro POST y no produce DTO de impresión.
- [ ] Si ARCA/gateway devuelve autorización pero falla la transacción que guarda CAE/número/estado, el estado queda `UNKNOWN`, no se informa éxito imprimible y ninguna repetición crea otro POST.
- [ ] `AUTHORIZED` solo se informa luego de persistir respuesta validada con CAE, número, POS, tipo, fecha, snapshot e importe correctos.
- [ ] Respuesta de importe distinta, no entera, faltante o inválida pasa a `UNKNOWN`; no se redondea, imprime ni reintenta.
- [ ] Vencimiento de `PENDING/PREPARING` sin marcador permite recuperación condicional a `FAILED`; `ISSUING` vencido va a `UNKNOWN`.
- [ ] La transición de recuperación es transaccional/condicional y no sobrescribe una respuesta autorizada concurrente.
- [ ] `AUTHORIZED`, `UNKNOWN`, `NOT_REQUIRED`, `PENDING` e `ISSUING` no aceptan una emisión nueva. Solo `FAILED` definitivo puede crear un intento siguiente.
- [ ] Un retry explícito desde `FAILED` crea el siguiente `attemptNumber`, valida nuevamente tipo/POS y mantiene inmutable el histórico de intentos.
- [ ] Repetir el mismo retry no duplica intento ni POST; las confirmaciones/reintentos con la misma clave devuelven estado existente.

## Reconciliación fail-closed

- [ ] La operación “Verificar emisión” es autenticada, autorizada para el negocio de sesión y acotada por `cashMovementId`; su DTO no acepta resultado, importe, CAE, número, tenant ni observaciones remotas provenientes del navegador.
- [ ] Reconciliar `UNKNOWN` solo consulta; el contador de llamadas a emisión/`createVoucher` permanece en cero.
- [ ] Mientras el gateway soportado responda `unresolved`, el estado se mantiene `UNKNOWN`, no imprimible y no reintentable; errores de red y falta de evidencia tienen el mismo cierre seguro.
- [ ] La implementación de gateway actual no ofrece búsqueda autoritativa por pago/intento. Ninguna prueba basada solo en mocks que simulen autoridad inexistente se considera prueba de aceptación de reconciliación automática.
- [ ] Número de último comprobante, secuencia, fecha, importe coincidente, búsqueda no única u otra señal aproximada no puede resolver `UNKNOWN`, habilitar retry ni autorizar impresión.
- [ ] Solo una consulta autoritativa correlacionada con el intento puede resolver autorización/ausencia. Una futura integración deberá probar dicho contrato con entorno aislado del gateway.
- [ ] Evidencia autorizada reconciliada valida identidad, tipo, POS, número, CAE, snapshot e importe exacto antes de pasar a `AUTHORIZED`.
- [ ] Evidencia incompleta, de otro comprobante/pago o con monto no equivalente conserva `UNKNOWN`.
- [ ] `123`, `123.0` y `123.00` son equivalentes para el movimiento de 123; `123.4`, `124`, ausente o inválido no son equivalentes y nunca se redondean.
- [ ] Una ausencia/rechazo solo habilita `FAILED` y retry si el gateway aporta evidencia inequívoca y autoritativa del intento actual; `getLastVoucher` no basta.

## Aislamiento fiscal de la orden y presentación

- [ ] Emisión, rechazo, timeout, error de persistencia, reconciliación, retry e impresión solo escriben datos del movimiento/voucher/intento; no cambian `Order.CAE`, `billType`, `invoiceNumber`, `invoicePointOfSale`, `invoiceIssuedAt` ni `fiscalSnapshot`.
- [ ] Dos movimientos de una orden mantienen asociaciones fiscales independientes; la factura de pago parcial factura el importe del movimiento, no el total de la orden.
- [ ] El snapshot del intento deriva del servidor y permanece inmutable; no se aceptan importes/datos fiscales autoritativos del cliente.
- [ ] Estado visible se deriva del dato persistido por movimiento: `PENDING`, `ISSUING`, `FAILED`, `UNKNOWN`, `AUTHORIZED`, `NOT_REQUIRED` y `MISSING` legado.
- [ ] `UNKNOWN` muestra el aviso y solo “Verificar emisión”; no ofrece “Reintentar” ni submit de emisión.
- [ ] `FAILED` definitivo permite retry explícito; `AUTHORIZED` solo permite imprimir/reimprimir; la impresión no llama al gateway.
- [ ] Impresión acepta solo voucher persistido `AUTHORIZED`, con CAE válido, asociación al movimiento y total exacto; no usa datos fiscales de `Order` como fallback.
- [ ] `NOT_REQUIRED` para Remito conserva el movimiento y su estado, sin intento AFIP, reconciliación ni factura imprimible.
- [ ] Los movimientos históricos sin voucher siguen como `MISSING`; no se inventa `NOT_REQUIRED`/autorización y no se habilita retry sin política segura de legado.
- [ ] Respuestas/logs públicos no exponen payload remoto, stack, errores Prisma/proveedor, credenciales, claves, datos fiscales personales completos ni CAE no validado.

## Evidencia automatizada en este directorio

- `register-payment-atomicity.test.ts`: A/B/C, transacción movimiento-intención-intento, fallo de reserva, repetición idempotente, ausencia de clave y no mutación fiscal de la orden.
- `payment-voucher-recovery.test.ts`: clasificación pre-despacho, fallo de marcador, timeout post-despacho, fallo de persistencia autorizada, impresión bloqueada, reconciliación unresolved, rechazo de señales aproximadas y comprobación decimal exacta.
- Antes de release, completar también una prueba de integración con PostgreSQL para atomicidad/unicidad/concurrencia y una prueba aislada del contrato autoritativo del gateway. La segunda no se puede satisfacer mientras la integración remota vigente solo ofrezca `unresolved`.

## Reejecución tras el arreglo de idempotencia — 2026-11-25

No se modificaron implementación ni pruebas; únicamente se actualiza esta checklist. Las pruebas usan persistencia/gateway simulados. No se facturó, no se accedió a producción, no se abrió/aplicó una migración y no se contactó AFIP/ARCA.

### Pruebas focalizadas

- **PASS — registro y diagnósticos:** `npm run test -- --pool=threads --maxWorkers=1 --testTimeout=30000 src/__tests__/unpaid-orders/register-payment.test.ts src/__tests__/unpaid-orders/register-payment-diagnostics.test.ts` — **2 archivos, 44 pruebas pasaron, 0 fallaron**.
- **PASS — emisión, comprobante y presentación (ejecutado por grupos para evitar exceder el límite de tiempo de la ejecución agregada):**
  - `ai/features/partial-payment-invoice-issuance` — **5 archivos, 33 pruebas pasaron**.
  - `ai/features/afip-partial-payment-voucher` — **12 archivos, 132 pruebas pasaron**.
  - `src/components/account-ledger/PaymentVoucherRowActionClient.test.tsx ai/features/account-ledger-detail-reliability` — **6 archivos, 19 pruebas pasaron**.
- **Agregado focalizado:** **25 archivos, 228 pruebas pasaron, 0 fallaron** al sumar los cuatro grupos anteriores. La primera invocación de todos los grupos a la vez excedió el timeout de 240 s sin resumen; cada grupo se volvió a ejecutar por separado y terminó correctamente.

### Comprobaciones de idempotencia

- **PASS — replay durable con misma clave/firma y POS retirado:** el caso de `register-payment.test.ts` hace replay tras retirar el POS de la configuración y comprueba retorno del estado durable sin consulta de configuración, nueva transacción, emisión, Pusher ni revalidación de caché.
- **PASS — misma clave con payload/firma diferente:** el caso cambia el importe y comprueba el rechazo seguro `La clave de confirmación ya fue utilizada para otro pago`, sin transacción ni efectos externos.
- **PASS — no duplicar:** repetir la confirmación comprueba una sola transacción, movimiento, reserva/intento, débito contable y emisión; el caso de concurrencia de `register-payment-concurrent-idempotency.test.ts` también pasa y verifica una única escritura/efecto para dos llamadas simultáneas con la misma clave.
- La evidencia es de contratos con mocks, no acredita por sí sola unicidad/aislamiento reales bajo PostgreSQL.

### Lint y tipos

- **PASS — ESLint puntual:** `npx eslint src/actions/unpaid-orders.ts src/lib/server/payment-voucher.ts src/__tests__/unpaid-orders/register-payment.test.ts src/__tests__/unpaid-orders/register-payment-diagnostics.test.ts ai/features/partial-payment-invoice-issuance ai/features/afip-partial-payment-voucher src/components/account-ledger/PaymentVoucherRowActionClient.tsx src/components/account-ledger/PaymentVoucherRowActionClient.test.tsx ai/features/account-ledger-detail-reliability` — sin diagnósticos.
- **FAIL — `npm run lint`:** ESLint sobre `src/` termina con **49 errores y 21 advertencias**. Los hallazgos reportados son de alcance general y no aparecen en los archivos de acción/servicio/prueba cubiertos por el lint puntual. El gate global queda abierto.
- **FAIL — `npx tsc --noEmit`:** permanecen errores de tipado en fixtures/pruebas existentes (`src/__tests__` y `tests/actions`, incluidos datos Prisma incompletos, mocks NextAuth tipados como `NextMiddleware` e import/componente de test ausente). No se reportaron diagnósticos en los archivos focalizados de pago/idempotencia; el gate TypeScript global no pasa.

### Pendientes reales / decisión

- **PENDIENTE — QA PostgreSQL:** no se ejecutó integración contra PostgreSQL. Falta verificar con una base QA aislada la restricción durable/índice de idempotencia, atomicidad, replay y concurrencia tras el arreglo. No usar producción.
- **PENDIENTE — suite global:** no se ejecutó `npm run test` en esta reejecución; los resultados anteriores y el agregado focalizado no sustituyen el gate de suite completa.
- Mantener también los bloqueos fiscales y de reconciliación autoritativa `UNKNOWN` ya documentados en esta checklist; ningún mock ni prueba focalizada los resuelve.

**Resultado:** el arreglo de idempotencia pasa las regresiones focalizadas solicitadas, incluido replay sin efectos con POS retirado, payload distinto rechazado y ausencia de duplicados. No se declara aprobado el QA de PostgreSQL ni la calidad global por los gates pendientes/fallidos indicados.
