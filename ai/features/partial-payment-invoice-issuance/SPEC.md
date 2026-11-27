# Emisión de factura por pago parcial: persistencia y recuperación segura

## Estado y objetivo

- **Estado:** especificación de arquitectura y aceptación; no incluye implementación ni pruebas.
- **Objetivo:** corregir el flujo de facturación de pagos parciales de cuenta corriente para que el registro del pago y la intención de facturarlo sean durables, que todo resultado de emisión se persista en el pago correcto y que una respuesta ambigua nunca habilite una segunda emisión ni un pago duplicado.
- **Regla de seguridad principal:** `UNKNOWN` significa que la factura pudo haberse autorizado. No se crea otra factura hasta que una reconciliación autoritativa confirme el resultado. Reintentar una Server Action, refrescar la página o consultar el último número de comprobante no constituye reconciliación.
- **Alcance fiscal:** conservar la selección actual de Factura A/B/C para el pago individual, el importe del pago como importe facturado y la factura separada de la orden. `Remito` mantiene la semántica actual de pago sin emisión AFIP (`NOT_REQUIRED`), si está habilitado en el producto.

## Investigación del flujo actual

### Camino de escritura y emisión

1. `src/app/(protected)/account-ledger/[id]/AddPaymentForm.tsx` valida importe, tipo y punto de venta en el cliente y llama a `registerPayment` de `src/actions/unpaid-orders.ts`.
2. `registerPayment` autentica y deriva el negocio de la sesión, valida el tipo/POS contra la configuración, bloquea la orden (`SELECT ... FOR UPDATE`), verifica saldo y crea un `CashMovement` con las actualizaciones de orden/cliente dentro de una transacción.
3. Para A/B/C, actualmente **no crea una reserva `PaymentVoucher` en esa transacción**. Después del commit, publica el movimiento, revalida cachés e invoca `issuePaymentVoucherForSession` como efecto posterior al commit. Remito sí inserta `PaymentVoucher(NOT_REQUIRED)` dentro de la transacción y no invoca AFIP.
4. `src/lib/server/payment-voucher.ts` vuelve a cargar el movimiento, orden, cliente y negocio; construye una línea `Pago parcial`, reclama/crea el registro y el intento; ejecuta la preparación ARCA y marca `ISSUING` justo antes de la llamada HTTP; finalmente persiste `AUTHORIZED`, `FAILED` o `UNKNOWN`. `src/lib/server/afip-voucher.ts` encapsula la preparación y el POST externo. La llamada de red no puede formar parte de una transacción PostgreSQL.
5. La respuesta de AFIP solo llega a ser imprimible si se persiste como autorizada y el total coincide con el pago. Si falla la persistencia después de un despacho posible, el servicio intenta dejar el pago en `UNKNOWN`. Si tampoco puede guardar ese cambio, el registro puede permanecer `ISSUING` hasta que la lectura lo marque `UNKNOWN` por antigüedad.

### Camino de lectura, recuperación y defecto observado

- `src/app/(protected)/account-ledger/[id]/page.tsx` consulta cada movimiento y su `PaymentVoucher`; si no hay asociación presenta `MISSING`. `PaymentVoucherRowAction(Client).tsx` ofrece crear/reintentar para estados faltantes o fallidos, imprimir solo para autorizados y bloquea la reemisión para `UNKNOWN`.
- La UI muestra para `UNKNOWN`: “El pago quedó registrado, pero el resultado de la emisión es incierto. Debe verificar emisión y reconciliar el resultado antes de reintentar. No vuelva a emitir hasta confirmar el resultado”. Esa advertencia es coherente con el riesgo externo, pero hoy no ofrece una reconciliación operativa desde la fila.
- Aunque `src/actions/payment-voucher.ts` exporta `reconcilePaymentVoucherAction`, la fila no la invoca y el adaptador real `databaseDependencies.afip.reconcile` en `payment-voucher.ts` devuelve siempre `unresolved`. Por lo tanto el flujo real no puede pasar de `UNKNOWN` a un resultado confirmado desde esta integración.
- La reserva A/B/C sucede después de guardar el pago. Una caída entre el commit del movimiento y la reserva deja un pago persistido sin registro durable de intención/estado (`MISSING`). La falta de reserva no prueba que una factura haya sido o no enviada; cualquier recuperación debe consultar el estado remoto antes de crear otra.
- La distinción existente entre fallo pre-despacho (`FAILED`) y fallo post-despacho (`UNKNOWN`) es fundamental y se debe conservar. Un error al guardar la respuesta después del POST no equivale a un rechazo de AFIP.
- La asociación fiscal pertenece a `CashMovement` mediante `PaymentVoucher.cashMovementId` único. No debe reutilizarse ni sobrescribirse `Order.CAE`, `Order.billType`, `Order.invoiceNumber`, `Order.invoicePointOfSale`, `Order.invoiceIssuedAt` o `Order.fiscalSnapshot`.

## Requisitos funcionales

### R1. Un solo registro de pago y una intención fiscal durable

1. El movimiento es la identidad del pago. Dos pagos distintos de una misma orden pueden generar dos facturas distintas; un movimiento puede tener como máximo una asociación `PaymentVoucher`.
2. El formulario debe generar una clave idempotente estable por confirmación lógica y conservarla ante timeout/respuesta perdida. `registerPayment` valida esa clave y la reserva con unicidad en base de datos, con ámbito del negocio. Repetir el mismo request con la misma clave devuelve el movimiento ya comprometido y su estado actual sin repetir contabilidad ni crear otro intento; solo puede continuar el mismo intento si aún está en preparación y una transición compare-and-set confirma que ningún worker lo está procesando. Nunca reanuda un estado `ISSUING`/`UNKNOWN`. Una nueva confirmación intencional usa una clave nueva. No inferir identidad de request a partir de orden/importe/método, porque pagos distintos pueden coincidir en esos campos.
3. Para A/B/C, confirmar el pago debe persistir de forma atómica el `CashMovement`, la clave idempotente, los cambios contables existentes y una reserva/primer intento de facturación asociados a ese movimiento. La transacción no llama a AFIP. Si no se puede guardar la asociación fiscal necesaria, se revierte toda la transacción y la acción no informa que el pago quedó registrado.
4. Una vez confirmado ese commit, cualquier fallo de emisión conserva el movimiento y sus cambios contables; el resultado de facturación se informa aparte. Nunca se borra ni se vuelve a crear el movimiento como mecanismo de recuperación.
5. La reserva conserva como valores inmutables del intento: `cashMovementId`, importe normalizado del pago, tipo de factura, punto de venta validado y snapshot fiscal mínimo derivado por el servidor. Una repetición del mismo request retoma/retorna el estado existente; no crea otra reserva, movimiento ni intento concurrente.
6. El registro se conserva después de una emisión fallida o ambigua. Los estados `AUTHORIZED`, `UNKNOWN`, `NOT_REQUIRED`, `PENDING` y `ISSUING` no pueden iniciar otra emisión. Solo `MISSING` legado o un `FAILED` definitivamente no autorizado pueden comenzar una nueva emisión bajo las reglas de retry.
7. La reserva no cambia la selección ni la factura original de la orden. La factura de pago parcial es un comprobante independiente, ligado únicamente al `CashMovement`.

### R2. Máquina de estados y clasificación por fase

Mantener los estados existentes del esquema (`PENDING`, `ISSUING`, `AUTHORIZED`, `FAILED`, `UNKNOWN`, `NOT_REQUIRED`) y los estados de intento (`PREPARING`, `ISSUING`, `AUTHORIZED`, `FAILED`, `UNKNOWN`). No añadir un estado que confunda pago con emisión.

| Evento | Estado durable requerido | Reintentable |
|---|---|---|
| Reserva inicial, antes de trabajo de emisión | `PENDING` + intento `PREPARING` | No mientras el intento siga activo |
| Error de validación/preparación/secuencia, confirmado antes del marcador de despacho | `FAILED` | Sí, con nueva validación y nuevo número de intento |
| Marcador durable completado justo antes del POST | `ISSUING` | No |
| Rechazo remoto inequívoco que prueba que no se autorizó comprobante | `FAILED` | Sí |
| Timeout, desconexión, respuesta malformada/indeterminada o fallo de proceso después del posible despacho | `UNKNOWN` | No, requiere reconciliación |
| Respuesta autorizada válida y persistida, con total exacto | `AUTHORIZED` | No; solo impresión/reimpresión |
| Respuesta remota autorizada o evidencia de autorización, pero no se pudo persistir la autorización | `UNKNOWN` hasta reconciliar | No |
| Elección explícita Remito | `NOT_REQUIRED`, sin intento AFIP | No aplica; terminal |

- El callback/marcador durable de despacho debe ejecutarse dentro del adaptador inmediatamente antes del POST irreversible y solo después de completar validación, obtención de numeración, construcción y serialización del request. Si no puede guardarse, el adaptador no realiza el POST y el resultado es `FAILED`.
- Cualquier estado `ISSUING` abandonado por caída debe pasar a `UNKNOWN`, no a `FAILED`. Una reserva `PENDING/PREPARING` abandonada antes del marcador puede pasar a `FAILED` porque se puede probar que no hubo despacho. La resolución de estados vencidos debe ser condicional y transaccional para no pisar una actualización concurrente.
- No reportar éxito de factura antes de persistir los datos autorizados validados. Si la persistencia falla tras respuesta autorizada, conservar evidencia permitida y bloquear reemisión; no degradar el caso a un fallo reintentable.

### R3. Reconciliación sin emisión

1. Para `UNKNOWN`, proveer una operación/acción explícita de **verificar emisión** que sea de solo lectura respecto de AFIP y no pueda invocar `createVoucher`.
2. La reconciliación debe identificar de forma autoritativa el resultado de **ese intento/pago**, usando un contrato remoto que permita correlacionarlo (preferentemente una clave idempotente por intento y consulta por esa clave; alternativamente otra evidencia remota inequívoca documentada). Debe devolver `authorized`, `absent/rejected` o `unresolved` y evidencia mínima tipada.
3. `getLastVoucher` por sí solo, una diferencia de contadores, coincidencia aproximada de importe/fecha o una búsqueda no única no prueban que una factura pertenezca al pago ni que esté ausente. No marcar `FAILED` ni permitir retry con esas señales.
4. Si se confirma autorización, validar identidad/correlación, tipo/POS/número/CAE y total contra el snapshot inmutable del intento. El total se compara como decimal exacto: `123`, `123.0` y `123.00` equivalen; `123.4` no coincide con 123 y no se redondea. Solo evidencia completa con total exacto lleva a `AUTHORIZED` e impresión.
5. Si se confirma ausencia/rechazo de modo inequívoco, persistir `FAILED` y permitir un nuevo intento explícito. Si no hay evidencia suficiente, la reconciliación retorna `UNKNOWN`, guarda solo observaciones seguras y mantiene bloqueada la emisión.
6. La API de reconciliación debe ser autenticada, validada y acotada por el negocio de sesión y `cashMovementId`; no acepta del cliente importe, resultado, CAE, número, tenant, estado ni observaciones de AFIP.
7. **Dependencia de liberación:** el gateway inspeccionado no implementa una consulta autoritativa por pago/intento; el adaptador actual retorna `unresolved`. No declarar resuelto el flujo de reconciliación ni habilitar retry en `UNKNOWN` hasta acordar y verificar el contrato con el propietario de la integración. Si no se puede agregar tal consulta, el caso permanece bloqueado y requiere una resolución manual auditada con evidencia oficial, aprobada como alcance separado; no se simula reconciliación automática.

### R4. Integración con la factura y la persistencia

- Reutilizar `PaymentVoucher` y `PaymentVoucherAttempt` existentes, con restricción única en `PaymentVoucher.cashMovementId` y unicidad del número de intento. No crear una tabla paralela ni almacenar factura de pago en `Order`.
- `PaymentVoucher.amount` y el importe de cada intento deben representar exactamente el importe de movimiento previamente normalizado. Toda respuesta AFIP con importe no entero o distinto queda `UNKNOWN`, no imprimible y no reintentable hasta reconciliarse.
- Usar transacciones PostgreSQL cortas para (a) el registro del pago + su intención/primer intento, (b) el cambio durable a `ISSUING`, y (c) guardar el resultado. Nunca mantener una transacción abierta durante `getLastVoucher`, la llamada de emisión o la reconciliación remota.
- Persistir en el intento el `billType`, `invoicePointOfSale`, monto y snapshot del destinatario usados en esa llamada; resultado/reintento no muta intentos históricos. Guardar solo campos permitidos y evidencia remota saneada; nunca payloads completos, errores sin filtrar ni credenciales.
- Preservar los controles ya existentes: autenticación/tenant del servidor, autorización del movimiento y su orden, tipo A/B/C permitido, punto de venta perteneciente a la configuración vigente del negocio, reglas de habilitación AFIP y credenciales comprobadas por el flujo de emisión.
- Cualquier clave de idempotencia generada localmente debe tener unicidad por intento y conservarse a través de las repeticiones locales. No se debe afirmar entrega exactamente una vez en ARCA a menos que el gateway remoto acepte y aplique esa clave.

### R5. Acciones y contratos recomendados

Seguir el patrón de Server Actions públicas: validar con Zod, autenticar y autorizar cada operación en servidor, limitar DTOs y derivar negocio/actor desde `auth()`. Las interfaces siguientes describen contratos, no código prescriptivo:

```ts
interface RegisterPaymentInput {
  orderId: string;
  idempotencyKey: string; // UUID/opaque key stable across retransmission of this confirmation
  amount: number;
  paymentMethod: string;
  businessId: string; // compatibilidad/consistencia solamente, nunca autoridad
  billType: "Factura A" | "Factura B" | "Factura C" | "Remito";
  ptoVenta?: number; // propuesta requerida y validada para A/B/C
}

interface PaymentVoucherAttemptInput {
  cashMovementId: string;
  attemptNumber: number; // control interno; validar contra el registro durable
}

interface ReconcilePaymentVoucherInput {
  cashMovementId: string;
}

type PaymentVoucherOutcome =
  | { paymentRecorded: false; error: string }
  | { paymentRecorded: true; voucherStatus: "AUTHORIZED"; invoiceNumber: number; invoicePointOfSale: number }
  | { paymentRecorded: true; voucherStatus: "FAILED"; retryAllowed: true; message: string }
  | { paymentRecorded: true; voucherStatus: "UNKNOWN"; reconciliationRequired: true; message: string }
  | { paymentRecorded: true; voucherStatus: "PENDING" | "ISSUING" | "NOT_REQUIRED" };
```

- La emisión/retry solo recibe identidad del movimiento y selección fiscal permitida cuando corresponda. No acepta importes, orden, cliente, snapshot fiscal, CAE, número de factura, credenciales ni empresa autoritativos del navegador.
- Respuesta `registerPayment` distingue explícitamente `paymentRecorded` del `voucherStatus`. Si la transacción inicial falla, `paymentRecorded` es falso; si el commit ocurrió y luego AFIP falla/queda incierto, `paymentRecorded` es verdadero.
- Errores públicos usan mensajes permitidos y seguros; no exponen texto Prisma, proveedor, stack ni payloads. Logs acotados a códigos de diagnóstico, fase, IDs internos necesarios y si el despacho pudo comenzar; excluyen datos fiscales personales y secretos.

### R6. Presentación y recuperación en cuenta corriente

- En el historial de pagos de `src/app/(protected)/account-ledger/[id]/page.tsx`, presentar el estado durable por cada movimiento y conservar separados importe/pago de factura.
- `PENDING/ISSUING`: estado de proceso, controles de emisión deshabilitados. Si vence `ISSUING`, presentar `UNKNOWN` tras actualización/consulta segura.
- `FAILED`: informar que el pago se registró pero la factura no se emitió solo cuando el fallo sea definitivamente pre-despacho/rechazo; ofrecer retry explícito con tipo A/B/C y POS vigente.
- `UNKNOWN`: presentar el aviso de verificación y un control con etiqueta **Verificar emisión** que solo llame a reconciliación. No mostrar un botón “reintentar”, no habilitar el submit de emisión y no convertir errores de la action de reconciliación en retry. Si la consulta sigue inconclusa, mantener la advertencia y estado no imprimible.
- `AUTHORIZED`: mostrar/imprimir solo el comprobante vinculado al movimiento y persistido como autorizado. Impresión/reimpresión es lectura; no llama a AFIP ni crea/reintenta.
- `NOT_REQUIRED`: mantener el estado pasivo “Sin emisión AFIP (Remito)”, sin emisión, reconciliación ni impresión de factura.
- `MISSING` legado: no inferir que el movimiento se facturó. El control de creación puede reservar/empezar una emisión solo si el sistema puede acreditar que no existió un intento previo; dada la ventana del diseño anterior, primero se debe ejecutar el procedimiento seguro de migración/reconciliación definido para legados. No convertir automáticamente todos los `MISSING` existentes en retryables si no puede excluirse un despacho previo.
- No cambiar el comprobante original de orden, la cuenta corriente, ni el print de ventas completas.

## Límites de alcance

### Incluido

- Pago parcial individual, registro durable de intención y resultado de facturación; idempotencia local, estados, clasificación de error, reconciliación y prevención de duplicados.
- Acciones de Server, acceso Prisma y detalle/historial de pagos necesarios para recuperar cada emisión.
- Migración aditiva solo si se detecta que el esquema actual necesita campos mínimos para soportar correlación/observaciones o un contrato de reconciliación; preferir las columnas existentes `observed*`, `lastErrorCode` y `safeErrorCode` antes de agregar otras.
- Compatibilidad de lectura con pagos/vouchers históricos y recuperación explícita de estados abandonados.

### Excluido

- Reemitir automáticamente una factura, crear otro movimiento para “corregir” el pago, o cancelar/eliminar un pago que ya quedó registrado.
- Alterar la factura, CAE, datos fiscales o importes de la orden por emitir la factura del pago.
- Nuevas reglas de IVA/tax, cambios de producto contable, cambio de Factura A/B/C o redondeo/ajuste de la respuesta de ARCA.
- Concluir que `getLastVoucher` acredita por sí solo la emisión/ausencia de una factura individual.
- Cambios generales de UI/estilo de cuenta corriente, de impresiones de venta completa, notas de crédito o administración de clientes no necesarios para esta recuperación.

## Archivos e interfaces recomendados

| Archivo | Responsabilidad propuesta |
|---|---|
| `src/app/(protected)/account-ledger/[id]/AddPaymentForm.tsx` | Mantener una clave idempotente por confirmación lógica ante retransmisión/error de red; renovar la clave solo al iniciar un pago distinto confirmado intencionalmente. No interpretar el estado de emisión como resultado del registro del pago. |
| `prisma/schema.prisma` + `prisma/migrations/` | Añadir una clave idempotente nullable a los movimientos nuevos (o modelo de solicitud equivalente) con unicidad por negocio; compatibilidad con filas históricas sin clave. Añadir solo los campos mínimos faltantes para correlación/reconciliación. |
| `src/actions/unpaid-orders.ts` | Mantener el lock de orden y contabilidad atómica; validar clave idempotente y devolver estado previo en retransmisión; persistir la reserva/primer intento A/B/C junto al movimiento; separar resultado del pago del efecto de emisión. Mantener Remito atómico y no AFIP. |
| `src/lib/server/payment-voucher.ts` | Orquestar intentos durables, reservar/continuar estado existente, clasificar fases, asegurar transiciones condicionales y bloquear `UNKNOWN`; no retornar error no clasificado como retryable. |
| `src/lib/server/afip-voucher.ts` | Mantener el marcador inmediatamente antes del POST; devolver resultados tipados; exponer el mínimo dato de correlación necesario. No ejecutar transport si falla marcador. |
| `src/lib/server/payment-voucher-reconciliation.ts` (o adaptador cohesionado en el módulo existente) | Consultar el contrato remoto autoritativo; validar evidencia contra el intento; permitir solo `AUTHORIZED`, `FAILED` confirmada o `UNKNOWN`. No llamar emisión. |
| `src/actions/payment-voucher.ts` | Endpoints pequeños para estado, emisión/retry, impresión y reconciliación, con Zod, sesión y tenant en cada acción. Conectar el endpoint de reconcile ya exportado a una implementación real y segura. |
| `src/components/account-ledger/PaymentVoucherRowAction(Client).tsx` | Añadir flujo UI de reconciliación de solo lectura en `UNKNOWN`, estados de loading/error y refresco de estado persistido. El estado `UNKNOWN` nunca vuelve a abrir el formulario de emisión. |
| `src/app/(protected)/account-ledger/[id]/page.tsx` | Proyectar estado mínimo de voucher/attempt por movimiento; mantener el monto como dato del movimiento y `Order` fiscal separado. |
| Gateway AFIP/ARCA externo | Contrato de idempotencia/correlación y consulta por intento necesarios para resolver `UNKNOWN` sin ambigüedad. Requiere coordinación del propietario del gateway; no presumir soporte ya existente. |

## Criterios de aceptación comprobables

- **AC-01 — Idempotencia de confirmación:** dos llamadas concurrentes o repetidas con la misma `idempotencyKey` generan exactamente un `CashMovement`, una asociación fiscal y una aplicación de cada actualización contable; la segunda llamada retorna el movimiento/estado existente y no crea otro intento. Puede continuar solo el mismo intento pre-despacho si gana una transición atómica; en `ISSUING`/`UNKNOWN` no dispara ningún POST. Dos confirmaciones distintas con claves diferentes pueden generar pagos separados aun con igual orden/importe/método. Una clave ausente, inválida o de ámbito de otro negocio no crea registros.
- **AC-02 — Commit indivisible de pago e intención:** al registrar un pago A/B/C se crea exactamente un `CashMovement`, se aplican exactamente una vez las actualizaciones contables existentes y se crea una única asociación/reserva `PaymentVoucher`/intento para ese movimiento en la misma transacción. Una falla al persistir la reserva revierte todo el commit y la acción reporta pago no registrado. No existe una ventana confirmada donde el pago nuevo sea visible como `MISSING`.
- **AC-03 — Emisión fuera de la transacción:** observar que el commit de pago/reserva finalizó antes de `getLastVoucher` o `createVoucher`; verificar que no queda transacción Prisma abierta durante llamadas remotas. Toda actualización de estado o resultado final ocurre en transacciones cortas posteriores.
- **AC-04 — Aislamiento del pago y factura de la orden:** verificar que éxito, rechazo, timeout, persistencia fallida, reconciliación, retry e impresión modifican solo registros del pago-voucher y no alteran ningún campo de factura/fiscal de `Order`. Dos `CashMovement` distintos de la misma orden conservan asociaciones independientes.
- **AC-05 — Fallo antes de despacho:** inyectar error en validación, credenciales, consulta de numeración, preparación, construcción/serialización o guardado del marcador. Verificar cero POST cuando el marcador no se completó, estado durable `FAILED`, pago según resultado transaccional registrado una sola vez, mensaje seguro y retry explícito permitido solo después de volver a validar.
- **AC-06 — Resultado ambiguo después del despacho:** hacer completar el marcador, luego provocar timeout, reset, respuesta inválida o caída antes de persistir éxito. Verificar `UNKNOWN` (o `ISSUING` solo mientras aún no se detecta la caída), conservar el pago, bloquear print y cualquier segundo POST, y retornar advertencia de reconciliación en lugar de fallo reintentable.
- **AC-07 — Fallo de persistencia final:** si AFIP devuelve autorización pero falla la transacción que guarda CAE/número/estado, el pago no se duplica, el resultado no se presenta como éxito imprimible, el estado queda o se resuelve a `UNKNOWN` y ninguna acción de retry produce un segundo POST sin reconciliación.
- **AC-08 — Recuperación de intento abandonado:** un `PREPARING/PENDING` vencido, cuyo marcador de despacho no ocurrió, puede resolverse a `FAILED`; un `ISSUING` vencido se resuelve a `UNKNOWN`. La transición es condicional/atómica y no sobrescribe una respuesta concurrente ya persistida.
- **AC-09 — Reconciliación sin reemisión:** desde `UNKNOWN`, el control “Verificar emisión” llama solo a la operación de consulta. Una respuesta `unresolved`, error de red o falta de evidencia conserva `UNKNOWN`, muestra el aviso y registra cero llamadas a creación.
- **AC-10 — Autorización reconciliada exacta:** evidencia autoritativa de la factura correcta, con identificadores completos y total exacto, se adjunta al `PaymentVoucher` de ese movimiento y permite imprimir sin nueva emisión. Evidencia de otro POS/tipo/número, incompleta o que no identifica inequívocamente el pago deja `UNKNOWN` y no se imprime.
- **AC-11 — Ausencia confirmada antes del retry:** solamente evidencia autoritativa de ausencia/rechazo para el intento actual pasa a `FAILED` y habilita un retry explícito. `getLastVoucher`, diferencia de secuencia, misma fecha o importe similar no cambian `UNKNOWN` a `FAILED` y no habilitan emisión.
- **AC-12 — Comparación exacta de importe:** para movimiento de 123 pesos, reconciliación/resultado `123`, `123.0` o `123.00` puede pasar validación monetaria; `123.4`, importe ausente, inválido o diferente conserva `UNKNOWN`, no se redondea y no es imprimible/reintentable. El pago/orden permanecen intactos.
- **AC-13 — Retry de fallo definitivo:** un retry explícito desde `FAILED` crea el siguiente `attemptNumber`, con importe congelado y selección A/B/C/POS nuevamente validada; una repetición del mismo retry no duplica el intento ni el POST. Un voucher `AUTHORIZED`, `NOT_REQUIRED`, `PENDING`, `ISSUING` o `UNKNOWN` no acepta retry.
- **AC-14 — Acción pública y tenant:** requests sin sesión, sin negocio, con movimiento inexistente/de otro negocio, orden de otro negocio o campos forjados se rechazan con respuesta segura y cero consultas de emisión/reconciliación fuera del tenant. En requests no confiables, solo `cashMovementId` y selección permitida llegan a servir como propuesta; no se confían importe, actor, negocio, CAE ni datos fiscales enviados por navegador.
- **AC-15 — UI por estado:** actualizar/abrir detalle desde base persistida representa correctamente `MISSING` legado, `PENDING`, `ISSUING`, `FAILED`, `UNKNOWN`, `AUTHORIZED` y `NOT_REQUIRED`. `UNKNOWN` ofrece solo “Verificar emisión”, nunca “Reintentar”; `AUTHORIZED` solo impresión; `FAILED` permite retry explícito; `NOT_REQUIRED` no ofrece factura/reconciliación/impresión.
- **AC-16 — Impresión aislada:** el print action acepta únicamente registro persistido `AUTHORIZED` y snapshot fiscal autorizado de ese pago; repite sin mutaciones ni red AFIP. `UNKNOWN`, importe discordante, asociación de otro movimiento o ausencia de CAE válido no retorna DTO imprimible. Nunca usa los datos de factura de `Order` como fallback.
- **AC-17 — Estados Remito existentes:** al seleccionar Remito, una transacción guarda exactamente un movimiento y `NOT_REQUIRED`, no registra intento ni realiza llamada de emisión o reconciliación. Lecturas/reintentos posteriores preservan `NOT_REQUIRED`; la contabilidad no suma dos veces el movimiento.
- **AC-18 — Compatibilidad de datos anteriores:** los movimientos preexistentes sin asociación continúan visibles sin backfill que invente `NOT_REQUIRED` o autorización. Antes de habilitar creación/retry para pagos históricos potencialmente afectados, definir y ejecutar una política de reconciliación/seguridad que nunca trate un caso de despacho incierto como ausencia comprobada.
- **AC-19 — Mensajes, logs y secretos:** los resultados y avisos diferencian pago registrado de estado de factura y nunca contienen texto Prisma/proveedor, stack, credenciales, claves, payload completo, documento fiscal completo o CAE no validado. Los logs usan códigos/fase y datos mínimos para soporte.
- **AC-20 — Dependencia externa verificada:** antes de habilitar resolución de `UNKNOWN`, un contrato del gateway y una prueba de integración aislada demuestran correlación inequívoca por clave de intento/pago y resultados de autorización/ausencia. Si el gateway no dispone de ello, la aplicación permanece fail-closed, sin retry desde `UNKNOWN`, y el criterio no se marca cumplido mediante mocks que simulen autoridad no disponible en producción.

## Bloqueos y decisiones para implementación

1. El contrato remoto vigente inspeccionado no ofrece consulta de factura por `cashMovementId`/intento; el adaptador actual siempre responde `unresolved`. El responsable del gateway debe definir soporte para clave idempotente y consulta correlacionada (o aportar mecanismo oficial equivalente). Sin esto se puede impedir duplicar, pero no completar una reconciliación automática segura.
2. Determinar la política operativa de los pagos A/B/C históricos que se encuentren en `MISSING` o con estados incoherentes; no asumir que ausencia de fila implica ausencia de factura.
3. Confirmar que el gateway devuelve identificadores oficiales y total legibles, y que existe evidencia autoritativa para asociar una factura al intento. Este SPEC no aprueba reglas tributarias ni corrige el tratamiento fiscal de la línea `Pago parcial`.

## Restricciones de implementación

- Aplicar la guía del repositorio para Server Actions: validación, autenticación y autorización dentro de cada action; datos mínimos serializables al cliente.
- Mantener tipos estrictos, transacciones Prisma para operaciones locales de varios pasos y condiciones de transición respaldadas por unicidad/estado durable.
- No hacer cambios de esquema/migración hasta confirmar que las columnas/relaciones existentes no cubren el contrato; cualquier migración de producción es aditiva y no reescribe migraciones aplicadas.
- Esta tarea finaliza en especificación: no crear código, migraciones ni archivos de prueba durante la etapa de arquitectura.
