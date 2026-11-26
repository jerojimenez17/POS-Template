# SPEC — Diagnóstico y corrección del registro de pagos parciales y sus comprobantes

## Estado y alcance

- **Estado:** especificación de arquitectura basada en la inspección del código; no contiene implementación ni cambios de pruebas.
- **Objetivo:** corregir el fallo reportado al confirmar un pago en el detalle de cuenta corriente, separando de forma verificable el commit contable del pago de la emisión de su comprobante.
- **Ruta afectada:** `src/app/(protected)/account-ledger/[id]/`.
- **Restricción:** no solicitar ni registrar secretos, URLs, cookies, tokens, certificados, claves, identificadores fiscales completos ni cuerpos completos de requests/responses.
- **Alcance de este paso:** investigación de UI, Server Action, validación, capa de comprobantes/AFIP, persistencia, migraciones y tests; documentación únicamente. No implementar.

## Conclusión del diagnóstico

### RCA actualizada — `P2022` en `idempotency` antes de transacción

**Evidencia examinada:** `src/actions/unpaid-orders.ts` (búsqueda durable en la línea 553 y helper `findPaymentByIdempotencyKey`), `prisma/schema.prisma` (`CashMovement`), el historial completo de `prisma/migrations/` y el lockfile raíz. El diagnóstico runtime disponible es exactamente `phase: 'idempotency'`, `commitOutcome: 'not_started'`, `prismaCode: 'P2022'`.

1. En la fase `idempotency`, antes de marcar `transactionStarted`, `registerPayment` llama `db.cashMovement.findUnique` con `where: { businessId_idempotencyKey: { businessId, idempotencyKey } }`. Esto hace que la consulta requiera la columna física `"CashMovement"."idempotencyKey"`; la consulta también selecciona campos relacionados para reconstruir una repetición ya registrada.
2. `prisma/schema.prisma` declara `CashMovement.idempotencyKey String?` y la clave única compuesta `@@unique([businessId, idempotencyKey])` (líneas 542–560). El nombre físico esperado por la migración es literalmente `idempotencyKey`.
3. **Sí existe una migración creada en el repositorio:** `prisma/migrations/20261122000000_add_cash_movement_idempotency_key/migration.sql`. Añade `"idempotencyKey" TEXT` a `"CashMovement"` y crea el índice único `CashMovement_businessId_idempotencyKey_key`. El schema y el código ya esperan esa columna. Por tanto, la condición operacional que explica este fallo es que la base a la que se conectó ese runtime no tenga la columna disponible para la consulta (por ejemplo, migración pendiente o deriva de esquema).
4. `commitOutcome: 'not_started'` concuerda con el flujo: el lookup idempotente ocurre antes de `db.$transaction` y antes de `transactionStarted = true`. Este intento no llegó a abrir la transacción de registro; no se debe tratar como fallo de emisión de factura ni atribuirle un pago parcial nuevo comprometido.
5. El `P2022` no incluye en el log seguro `meta.column`, y la consulta también lee campos de movimiento/voucher/attempt. Así que el repositorio identifica con precisión el campo requerido por la ruta de idempotencia y la migración pertinente, pero **no permite certificar por sí solo el estado físico de la DB runtime ni demostrar qué columna nombró internamente Prisma**. No afirmar que la migración está pendiente o que el campo está ausente hasta verificar el mismo entorno. La evidencia actual apunta directamente a `CashMovement.idempotencyKey`; no justifica inventar un nombre alternativo.
6. `package.json` y `package-lock.json` fijan `prisma` y `@prisma/client` en `6.19.3`. Esto describe las dependencias versionadas en este checkout; no prueba qué artefacto/cliente generado atiende producción.

**RCA operativa sustentada:** el fallo sucede en la consulta de idempotencia anterior a la transacción, que requiere `CashMovement.idempotencyKey`; el repositorio contiene la migración aditiva que introduce ese campo. La hipótesis que debe comprobarse primero es migración no aplicada en la DB del runtime o drift equivalente. El estado de aplicación del entorno no se puede deducir del archivo SQL y queda pendiente de evidencia runtime.

### RCA adicional — despliegue detenido por `Business.qzTray` existente (P3018 / PostgreSQL 42701)

**Alcance y evidencia local:** inspección de solo lectura del árbol versionado en `prisma/migrations/`, `prisma/schema.prisma`, `src/actions/business-print-settings.ts` y los puntos de impresión que consumen esta configuración. No hubo conexión a una base de datos ni ejecución de comandos Prisma. El incidente reporta que el artefacto de despliegue encontró 18 migraciones, aplicó `20260626000001_add_pg_trgm_search` y se detuvo en `20260813000000_add_business_qz_tray` con P3018 y PostgreSQL 42701 (`column "qzTray" of relation "Business" already exists`). El usuario indicó además que quizá aplicó algunas migraciones manualmente: esto vuelve **probable** la hipótesis de DDL manual, pero no la confirma ni determina cuáles migraciones/efectos fueron realizados. Hay que verificarlo contra el destino y el artefacto reales.

#### SQL exacto y alcance de la migración que falló

El archivo versionado `prisma/migrations/20260813000000_add_business_qz_tray/migration.sql` contiene exactamente una línea/una sentencia:

```sql
ALTER TABLE "Business" ADD COLUMN "qzTray" BOOLEAN NOT NULL DEFAULT false;
```

Por tanto, **esta migración contiene solamente el `ADD COLUMN` de `qzTray`**: no incluye índices, backfill explícito, cambios en `address`, otras columnas, restricciones adicionales ni operaciones sobre pagos/ledger. La sentencia falla porque el nombre de columna ya está presente en la tabla a la que se conectó el despliegue; el error 42701 no demuestra quién ni cuándo la creó. No se debe atribuir el conflicto a `20260626000001`: esa migración actúa sobre `pg_trgm` y los índices de búsqueda, no sobre `Business`.

`prisma/schema.prisma` declara `Business.qzTray Boolean @default(false)`. En Prisma, al no llevar `?`, el campo es no nullable. La forma física equivalente esperada es `Business.qzTray` de tipo PostgreSQL `boolean`, `NOT NULL`, con default `false` (el catálogo puede mostrar el default normalizado como `false` o `false::boolean`). El `ADD COLUMN` exitoso aplicaría dicho default a filas existentes y nuevas; el incidente reportado falló al intentar añadir una columna que PostgreSQL ya encuentra, por lo que **no se debe suponer que esta migración haya cambiado ningún dato ni que la columna preexistente sea equivalente**.

#### Historial versionado y lo que puede (y no puede) concluirse

- En las migraciones anteriores inspeccionadas, `20260124211155_add_multitenancy` crea `Business` sin `qzTray`; `20260125202448_add_logo_to_business`, `20260127035709_init_multitenancy` y `20260130195356_sync_schema` tampoco añaden ese campo. La búsqueda del historial SQL versionado encuentra `qzTray` únicamente en `20260813000000_add_business_qz_tray`.
- `20260626000001_add_pg_trgm_search` (la que el incidente dice aplicada) habilita `pg_trgm` y crea cinco índices GIN de trigramas en `Product`, `Brand` y `Supplier`. No toca `Business`. Según el resultado de deploy reportado, esta migración terminó antes de comenzar la que falló. Su estado no debe confundirse con el de `20260813000000`.
- El estado de `20260813000000_add_business_qz_tray` es fallido para este intento: el servidor rechazó su única sentencia. En PostgreSQL, la sentencia `ALTER TABLE` fallida no añade ni modifica la columna. Prisma registra un intento fallido en `_prisma_migrations`; confirmar los campos/estado exactos en el registro real, sin editarlo.
- Después de esa versión, el árbol local contiene migraciones hasta `20261122000000_add_cash_movement_idempotency_key` (entre ellas optimización de ledger, cambios fiscales/devoluciones y vouchers). El reporte de `migrate deploy` implica que las posteriores no se ejecutaron **en esa corrida**, no que estén pendientes globalmente: pudieron aplicarse en otro despliegue o manualmente. Hay que verificar su estado y efectos antes de reanudar; no basta con resolver `qzTray`.
- Discrepancia de artefacto a verificar: el checkout inspeccionado tiene el directorio `20260820000000_add_bill_type_to_order` vacío/sin `migration.sql`, mientras el incidente reporta 18 migraciones. Confirmar el commit/artefacto desplegado y la lista exacta de sus 18 migraciones. La lista de este checkout no sustituye el manifiesto del artefacto, ni se debe interpretar un directorio vacío como prueba de que el artefacto carece de SQL.

**RCA sustentada:** la operación `ADD COLUMN` incondicional colisiona con una columna homónima ya existente en el destino. Dado el reporte de posible aplicación manual, DDL aplicado fuera de Prisma es una hipótesis probable; todavía debe verificarse y no demuestra por sí sola que los otros cambios manuales correspondan a alguna migración. También deben considerarse otro artefacto/branch, restauración/copia de una base con esquema más nuevo, historial `_prisma_migrations` incompleto/alterado o conexión a una base/esquema distinto del previsto. La evidencia local no distingue estas hipótesis ni certifica la forma de la columna ni los efectos de las otras migraciones.

#### Uso vigente de `Business.qzTray`

- `src/actions/business-print-settings.ts` selecciona `id`, `qzTray` y `address` de `Business`; la acción de actualización persiste `qzTray` y dirección. El campo no es sólo una declaración de schema sin consumidores.
- `src/app/(protected)/newBill/page.tsx` y `src/app/(protected)/searchBill/page.tsx` transportan el valor de settings hacia los flujos de impresión; `BillProvider` lo expone al flujo de ventas.
- La preferencia se pasa como `qzTrayEnabled` en nueva impresión térmica (`PrintableTable`) y en la impresión histórica (`SalesTable`/`SaleAccordion`/`PrintOptionsPopover`). `src/app/(protected)/account-ledger/[id]/PrintOrderButton.tsx` también carga Business print settings y pasa el valor a `printThermalReceipt`.
- `src/lib/print/BrowserPrint.ts` usa el booleano para seleccionar QZ Tray frente al fallback de impresión del navegador. Los tests de `ai/features/business-print-settings/` fijan el contrato de Boolean no nullable/default false.

Por este consumo de runtime, no se debe eliminar ni renombrar la columna para hacer desaparecer 42701: la configuración de impresión dejaría de persistir/leerse correctamente y el cliente Prisma espera este campo.

#### Prerequisitos de verificación de solo lectura

Antes de decidir cualquier recuperación, obtener y conservar evidencia sanitizada del **mismo destino** usado por el despliegue:

1. Identificar de forma segura release, commit, artefacto, proveedor y base/esquema objetivo; confirmar que coincide con el entorno esperado sin revelar `DATABASE_URL`, host sensible, credenciales u otros secretos. Obtener del artefacto exacto el manifiesto completo de sus 18 migraciones, incluidos SQL/checksums, y resolver la discrepancia con el directorio vacío local `20260820000000_add_bill_type_to_order`.
2. Reconciliar **cada una de las 18 migraciones del artefacto**, no sólo `pg_trgm` y `qzTray`: contrastar nombre/orden/checksum cuando esté disponible, intento(s), `finished_at`, `rolled_back_at`, estado y resultado en `_prisma_migrations`, con los efectos físicos esperados por su SQL en el destino correcto. Registrar una matriz por migración (`aplicada`, `fallida`, `pendiente/no iniciada` o `divergente`) y evidencias de catálogo/datos pertinentes. La verificación comprende extensiones, columnas, defaults/nullability, índices, constraints, enums/tablas y cambios/backfills de datos; considerar que ciertos DDL o efectos manuales pueden no ser transaccionales o dejar efectos parciales. No inferir que una migración está satisfecha sólo por una marca del historial o por un objeto homónimo.
3. Para `20260813000000_add_business_qz_tray`, leer el catálogo del destino y confirmar schema/tabla exactos, existencia/nombre sensible a mayúsculas de `"Business"."qzTray"`, tipo PostgreSQL `boolean`, `NOT NULL` (`attnotnull`), default equivalente a `false` y columna normal (no generada). El resultado debe coincidir también con el schema Prisma. Nombre existente por sí solo no basta.
4. Si la columna es nullable, comprobar si hay NULLs sin leer/exportar filas de negocio. Columna con NULLs, tipo/default/nullability/schema/tabla divergentes o efectos adicionales inesperados **no es equivalente**. Documentar la procedencia mediante auditoría/DDL disponible; no presentar ausencia de auditoría como confirmación de aplicación manual.
5. Confirmar que `20260626000001_add_pg_trgm_search` sigue registrada como exitosa y que `pg_trgm` y sus cinco índices GIN están presentes conforme al estándar del entorno. Conservar esta migración aplicada: no revertirla ni confundirla con la fallida.
6. Verificar de forma explícita las migraciones posteriores a `20260813000000`, hasta la última del artefacto (`20261122000000_add_cash_movement_idempotency_key` si ésa es efectivamente la última): estado en `_prisma_migrations` y todos sus efectos físicos/de datos. No asumir que están pendientes sólo porque migrate deploy se detuvo en una corrida.

#### Recuperación segura / condiciones de desbloqueo

1. Pausar reintentos automáticos y despliegues que dependan de `migrate deploy`; conservar logs sanitizados y obtener/verificar un backup o snapshot recuperable antes de cualquier intervención. No revertir `20260626000001`: el reporte indica que se aplicó y no es la causa de este 42701.
2. No ejecutar comandos ni conectarse a la DB durante esta tarea de documentación. No borrar/editar `_prisma_migrations`, no eliminar ni volver a crear `qzTray`, no hacer `db push`, DDL ni cambios de schema/migraciones, y no forzar el despliegue. Un retry por sí solo repetirá la colisión; otras migraciones también podrían fallar después.
3. **Única opción operacional condicionada para `20260813000000_add_business_qz_tray`:** sólo si (a) el catálogo del destino correcto confirma que `"Business"."qzTray"` ya existe y es exactamente equivalente a `BOOLEAN NOT NULL DEFAULT false` (incluida la tabla/schema correctos y columna normal), y (b) `_prisma_migrations` confirma que esta migración tiene un intento fallido/no está aplicada satisfactoriamente, un DBA responsable puede evaluar, bajo backup/snapshot recuperable y aprobación explícita del DBA/operador de release, registrar la migración como satisfecha con `npx prisma migrate resolve --applied 20260813000000_add_business_qz_tray`. Es una opción de **reconciliación del historial solamente**: el comando no ejecuta el SQL de la migración ni valida por sí mismo que columna, default, nullability o cualquier efecto sean equivalentes. Antes de considerarla, documentar ambas evidencias y aprobar el plan de rollback/continuidad. Si `_prisma_migrations` ya la muestra aplicada exitosamente, no ejecutar este comando; investigar la discrepancia.
4. Si la columna o cualquier efecto esperado no coincide, hay NULLs o divergencias, la base/schema no es el destino correcto, o la equivalencia/historial no pueden demostrarse, **no recomendar ni ejecutar `--applied`**. Detener el despliegue y preparar una reparación específica para la divergencia, revisada por DBA, con backup y plan de datos; no adaptar/descartar datos para hacer pasar la migración ni inferir equivalencia por el nombre.
5. No resolver masivamente migraciones ni marcarlas como aplicadas porque parezcan ya ejecutadas manualmente. Para cada una de las 18, sólo un plan independiente y aprobado puede determinar su reconciliación, especialmente si tiene efectos de datos/backfill, índices, enums, constraints o DDL parcialmente ejecutado. Si una migración está aplicada en historial pero faltan efectos, o los efectos existen pero el historial no coincide, detenerse y diseñar reparación/reconciliación específica.
6. Sólo reanudar cuando la matriz completa de las 18 migraciones demuestre historial, efectos físicos/de datos y artefacto coherentes; resolver discrepancias individualmente con aprobación; luego validar `migrate status` y revisar cada migración posterior. Confirmar por separado que `pg_trgm` permanece aplicada y que los efectos de las posteriores están presentes según estado real. No presentar ninguna migración como satisfecha sin evidencia.

**Aceptación del diagnóstico:** (a) SQL exacto y alcance de `20260813000000` identificados; (b) estado aplicado de `pg_trgm` y `pg_trgm`/sus índices preservados; (c) la hipótesis de DDL manual se verificó o quedó explícitamente sin confirmar; (d) las 18 migraciones exactas del artefacto están reconciliadas individualmente contra `_prisma_migrations` y sus efectos físicos/de datos, o el despliegue sigue bloqueado señalando cuáles no se pudieron verificar; (e) la equivalencia de `qzTray` se demuestra con catálogo de sólo lectura, no se presume; (f) no se modificaron datos, schema ni `_prisma_migrations`; (g) cualquier `--applied` queda condicionado estrictamente a la equivalencia exacta, estado de historial no aplicado/fallido, backup y aprobación DBA, y se documenta que no corre SQL ni valida equivalencia; (h) no se marcan migraciones masivamente como aplicadas y las posteriores se verifican antes de reanudar.

### Condición de despliegue y pasos seguros

1. En el entorno de despliegue, reconciliar en modo de sólo lectura **las 18 migraciones del artefacto exacto** con `_prisma_migrations` y con los efectos físicos/de datos de cada SQL. La comprobación debe incluir, entre otros, que `20261122000000_add_cash_movement_idempotency_key` esté aplicada, terminada y no revertida y que `"CashMovement"."idempotencyKey"` y el índice único existan; además de tablas, columnas, índices, extensiones, enums, constraints y backfills de todas las demás migraciones. Comparar contra la misma base/esquema del proceso afectado sin copiar/imprimir `DATABASE_URL` ni secretos.
2. Confirmar que el artefacto que contiene el código ejecuta el cliente generado con la versión fijada (Prisma y `@prisma/client` 6.19.3 según lockfile) y que usa el schema/migraciones de ese release. No regenerar ni cambiar artefactos de producción como experimento.
3. **Condición para liberar/reanudar:** no desplegar el flujo de pago parcial ni continuar `migrate deploy` hasta que el historial y los efectos de las 18 migraciones estén alineados con el artefacto. Si alguna aparece pendiente, revisar todo el historial y efectos, incluidas posibles operaciones manuales/efectos parciales, y la ventana aprobada del release. La aplicación operativa de pendientes se realiza desde el artefacto y entorno correctos bajo el proceso aprobado, no desde el diagnóstico local.
4. Si el historial afirma que una migración se aplicó pero faltan efectos, o los efectos existen mientras el historial no está reconciliado, o el runtime sigue dando `P2022`, detener el cambio y diagnosticar drift, base/endpoint equivocado o artefacto/cliente desfasado. No marcar migraciones como resueltas ni reparar manualmente sin reconciliación individual; no inferir que resolver `qzTray` evita fallos en migraciones posteriores.
5. **No usar `prisma db push` en producción. No crear la columna manualmente antes de revisar `_prisma_migrations` y el historial de migraciones.** Una reparación manual puede dejar al historial inconsistente y provocar que el deploy repita una operación ya ejecutada.
6. Evidencia mínima a adjuntar, sanitizada: matriz de las 18 migraciones del artefacto con estado de historial y verificación de efectos; `migrate status`; fila/estado pertinente de cada migración y, para `qzTray`, el estado del intento; catálogo de la columna; identidad de release y versiones Prisma/client. Excluir URLs, credenciales, filas de negocio, SQL/log crudo y secretos.
7. Tras alinear DB y artefacto, repetir en QA con una clave idempotente de prueba y verificar el resultado del action y el movimiento durable. En el intento observado `not_started`, no hubo commit de esa invocación; si se repite una operación de negocio en producción, conservar la misma clave de idempotencia y comprobar previamente el estado durable para evitar generar una intención duplicada.

### Lo que el código permite concluir

1. `AddPaymentForm.tsx` llama a `registerPayment` como Server Action y comprueba `result.success`. El `200` del POST de Next solo indica que se atendió la petición HTTP de la Server Action; no significa que el valor de retorno sea `{ success: true }`. Una action puede responder HTTP 200 y devolver el resultado de negocio `{ success: false, error: ... }`.
2. Un diagnóstico anterior usaba `Error registering payment`/`errorType`, insuficiente para ubicar la operación. Ese diagnóstico fue reemplazado por la instrumentación actual: el log reportado incluye fase, resultado de inicio/commit y código Prisma seguro, y permite localizar este intento en `idempotency` antes de la transacción.
3. **El error de ese `catch` no identifica por sí mismo un error de factura.** En el flujo actual, `registerPayment` confirma en una transacción la contabilidad y, para A/B/C, crea también la reserva `PaymentVoucher(PENDING)` y el intento `PREPARING`. Tras el commit, Pusher y cada invalidación de caché tienen catches propios. La llamada a `issuePaymentVoucherForSession` está en otro `try/catch`; además, el wrapper de servicio la convierte en un resultado seguro. Por tanto, una falla de emisión ordinaria se comunica como pago registrado con `voucherStatus`/resultado de comprobante, no como `PAYMENT_REGISTRATION_FAILED` del catch exterior.
4. Para `billType: "Remito"`, el flujo no llama a `issuePaymentVoucherForSession`, no invoca el servicio AFIP y no necesita POS. En la misma transacción crea el movimiento y un `PaymentVoucher(NOT_REQUIRED)` con campos fiscales AFIP nulos; después devuelve éxito de pago. El error actual está localizado antes de todo ello, en la consulta de idempotencia, independientemente del tipo de comprobante.
5. El mensaje mostrado por `AddPaymentForm` (“No se pudo registrar el pago”) es coherente con `success: false`; para el caso actual el log añade la información relevante: `idempotency` y `not_started` descartan que esta invocación alcanzara el `SELECT ... FOR UPDATE`, escrituras contables o emisión. El metadato de columna específico de `P2022` no está incluido en el log.

### Alcance que sigue sin poder inferirse desde el repositorio

La existencia de migraciones y del schema versionado no prueba su aplicación en la base runtime. El log no conserva el metadato `column` de Prisma, por lo que la identificación de `CashMovement.idempotencyKey` como campo focal de esta consulta debe cerrarse cotejando el catálogo del mismo runtime. La evidencia sí descarta que esta ejecución haya alcanzado la transacción o la emisión del comprobante: `not_started` es explícito y la lectura idempotente precede al límite transaccional.

## Hallazgos reproducibles del flujo

### UI y contrato de entrada

- `src/app/(protected)/account-ledger/[id]/page.tsx` calcula saldo desde el total y los `cashMovements` normalizados a pesos enteros. Monta el formulario solamente si la orden no figura pagada y queda saldo válido positivo. Pasa `orderId`, saldo, `businessId` de sesión y POS de negocio configurados.
- `AddPaymentForm.tsx` valida importe entero positivo, que no exceda saldo, tipo admitido y POS para A/B/C. Genera/conserva UUID de idempotencia en estado/sesión; para Remito omite `ptoVenta`. El negocio enviado es consistencia heredada; la action deriva el ámbito real de `auth()`.
- El formulario usa `toPositiveWholePesos`, el mismo redondeo entero positivo que la action. No envía cliente, datos fiscales ni importe/tipo de orden como autoridad.
- La action define su propio Zod estricto (no el schema global de `src/schemas/index.ts`): UUID, monto positivo finito, método, businessId, enum `Factura A | B | C | Remito`, POS opcional. `Remito + ptoVenta` se rechaza; A/B/C sin POS válido/configurado se rechaza antes de transacción.
- `src/schemas/index.ts` no contiene el schema de `registerPayment`; `BillParametersSchema` es otro contrato, usado por la facturación general, no valida esta Server Action. Debe evitarse modificarlo como supuesto arreglo de este flujo.

### Registro atómico de pago

`registerPayment` en `src/actions/unpaid-orders.ts`:

1. Valida el input y normaliza el importe con `toPositiveWholePesos`; aplica máximo monetario.
2. Autentica y compara el businessId recibido con el de sesión.
3. Consulta/reproduce idempotencia usando la clave única compuesta de `CashMovement(businessId, idempotencyKey)`. Para A/B/C comprueba además que el POS propuesto siga configurado.
4. Dentro de una transacción bloquea la fila de `Order` con `SELECT ... FOR UPDATE`, comprueba idempotencia durable y vuelve a leer la orden y pagos existentes. Calcula saldo en pesos enteros y rechaza balance inválido/sobrepago.
5. Crea un `CashMovement` (total = importe normalizado, business, UUID y orden). En esa misma transacción:
   - Para Remito: crea `PaymentVoucher(NOT_REQUIRED)` sin intento ni datos AFIP.
   - Para A/B/C: crea `PaymentVoucher(PENDING)` más `PaymentVoucherAttempt(PREPARING)` con importe, tipo, POS y snapshot de destinatario construidos desde el cliente ligado a la orden.
   - Decrementa una vez el saldo del cliente, si hay cliente, y actualiza `Order.paidStatus` según el saldo restante.
6. Si falla una escritura de esta transacción, PostgreSQL debe revertir movimiento, voucher, cambio de cliente y estado de orden conjuntamente.

### Comprobante, Remito y manejo de fases

- Remito retorna tras notificaciones/cache; no se manda al servicio de voucher/AFIP. El texto de UI declara “sin emisión AFIP”. La generación/impresión de Remito de venta completa en `BillButtons` es un flujo distinto y no debe confundirse con un recibo de pago parcial.
- Factura A/B/C continúa después del commit. `payment-voucher.ts` vuelve a cargar movimiento/orden/cliente/negocio, construye una sola línea `Pago parcial` por el valor del movimiento, valida el punto de venta y habilitación, reserva/controla el intento, prepara la operación y delega la emisión en `afip-voucher.ts`. La llamada remota no está dentro de la transacción contable.
- El servicio distingue rechazo/preparación (`FAILED`), emisión en progreso (`ISSUING`), autorización persistida (`AUTHORIZED`) y resultado no confirmable después del posible despacho (`UNKNOWN`). `UNKNOWN` bloquea reemisión; no es equivalente a `FAILED`.
- `PaymentVoucher` se asocia al `CashMovement`, no a los campos de factura de `Order`. Dos pagos de una orden pueden tener comprobantes separados; el importe de una factura parcial es el monto de ese movimiento, no el total/saldo de la orden.
- El catch exterior registra solo código genérico y tipo de error. Las fallas Pusher/cache se capturan individualmente. El catch de voucher produce resultado de emisión separado. Esta separación es el invariante central para la corrección.

### Persistencia Prisma y restricciones

- `CashMovement.idempotencyKey` es nullable para compatibilidad con datos históricos y único por `(businessId, idempotencyKey)`; `PaymentVoucher.cashMovementId` es único. Cada intento tiene unicidad `(paymentVoucherId, attemptNumber)`.
- La transacción inicial depende de tablas, FKs, enums y columnas sincronizados con `prisma/schema.prisma`, incluyendo `NOT_REQUIRED`, `CashMovement.idempotencyKey` y `PaymentVoucher`/`PaymentVoucherAttempt`.
- Las migraciones relevantes del repositorio son `20261104000000_add_payment_vouchers`, `20261118000000_add_not_required_payment_voucher_status` y `20261122000000_add_cash_movement_idempotency_key`. La última crea `CashMovement.idempotencyKey` y su índice único compuesto; existe en el repo, pero su aplicación en el runtime debe verificarse. Ver los pasos seguros anteriores; no imprimir connection strings ni modificar producción desde diagnóstico.
- El schema Prisma declara `PaymentVoucher.amount`/attempt amount como `Decimal(12,2)`, mientras el movimiento permanece `Float`; la lógica restringe pagos a enteros y máximo compatible. No cambiar tipos monetarios como parte de una corrección sin revisión independiente.

### Tests existentes y cobertura

`src/__tests__/unpaid-orders/register-payment.test.ts` ya cubre, con mocks:

- validación de tipos, POS, montos y máximo antes de transacción;
- suma de pagos previos, pago parcial/total, redondeo y sobrepago;
- serialización por orden y lock anterior a leer el saldo;
- errores inesperados con resultado seguro sin contenido crudo;
- Remito: movimiento + `NOT_REQUIRED` atómicos, sin llamada a AFIP, y rollback cuando falla la transacción;
- A/B/C: persistencia del movimiento/reserva e invocación posterior del servicio;
- diferencias entre pago comprometido y error de emisión (`FAILED`/`UNKNOWN`).

Los tests son unitarios con Prisma simulado: validan contratos y orden de llamadas, pero no ejecutan SQL real, no verifican migraciones aplicadas, cliente generado, enum PostgreSQL ni constraints de una base desplegada. Una prueba que satisface los mocks no descarta el riesgo de deriva esquema/runtime.

## Reproducción y verificación exigida

1. Reproducir en base aislada/QA con datos sintéticos: orden con saldo pendiente, sesión de negocio sintética y monto entero menor al saldo. Probar primero Remito y después A/B/C con POS permitido. No compartir IDs reales; no reutilizar un UUID entre diferentes ensayos salvo en el escenario de replay explícito.
2. Capturar por cada resultado únicamente: fase enum (validación, auth, lectura POS, transacción-lock, idempotencia, carga/saldo, movimiento, reserva voucher, contabilidad/commit, notificación/cache, emisión), resultado de commit (`committed | rolled_back | unknown`) y código de diagnóstico allowlisted. Para errores Prisma, registrar solamente códigos `P####` reconocidos y fase; no mensaje, query, parámetros, stack ni objeto serializado.
3. Confirmar en base aislada el estado antes/después: cantidad de movimientos del caso, asociación voucher/estado, total de movimientos del pedido, balance cliente y `paidStatus`. Si la transacción falla, las cuatro superficies deben conservar el estado previo.
4. Comparar `schema.prisma`, versión/identidad del cliente Prisma generado en el artefacto y estado de migraciones del mismo entorno. Para el fallo actual comprobar primero el registro de `20261122000000_add_cash_movement_idempotency_key` y la existencia física de `CashMovement.idempotencyKey`; para Remito comprobar además el enum `NOT_REQUIRED`. Reportar únicamente presencia/versión/estado de migración, nunca secretos ni datos.
5. Para Factura, separar la evidencia de acción de registro del resultado del voucher y del tráfico remoto. Un rechazo/timeout del proveedor luego de un commit no es reproducción de `PAYMENT_REGISTRATION_FAILED`.
6. El POST HTTP 200 no forma parte del criterio de éxito funcional; verificar el DTO de retorno de acción y el estado persistido.

## Decisiones de arquitectura para la corrección posterior

1. Mantener `registerPayment` como límite autenticado/validado; businessId autoritativo deriva de sesión y el cliente solo propone monto, método, tipo, POS y clave idempotente.
2. Mantener una transacción corta y serializada por orden. El movimiento, la reserva inicial del comprobante (o `NOT_REQUIRED`), los efectos contables y `paidStatus` deben confirmarse o revertirse juntos. No incluir llamadas de red en esa transacción.
3. Devolver un contrato discriminado que exprese `paymentRecorded` separadamente de `voucherStatus`. Error de commit significa `paymentRecorded: false`; falla/ambigüedad posterior de factura significa `paymentRecorded: true` más estado de voucher correspondiente. No inferir commit por status HTTP.
4. Agregar observabilidad segura por fases y códigos estables, sin devolver ni registrar errores crudos. El código debe ayudar a distinguir validación, falla DB/commit y falla de comprobante sin volcar información fiscal, parámetros SQL o secretos.
5. Para excepción transaccional de idempotencia, mantener la unicidad durable de DB como autoridad. La repetición con la misma clave/firma devuelve el pago comprometido y estado de voucher sin volver a aplicar saldo ni emitir; la misma clave con firma distinta se rechaza. Una nueva confirmación intencional requiere clave nueva.
6. Mantener la emisión A/B/C posterior al commit con transiciones durables y fail-closed. Ningún timeout, refresh o reenvío de action puede emitir una segunda factura para un estado `ISSUING`, `AUTHORIZED` o `UNKNOWN`. Solo un fallo definitivamente no despachado/confirmado como rechazo permite reintento explícito según la política existente.
7. Remito debe persistir `NOT_REQUIRED` junto al pago y mantenerse terminal: cero llamada AFIP, cero intento de factura, cero control de retry/reconciliación/imprimir factura. No introducir una impresión/remito de transporte como parte de esta corrección.
8. Solo crear migración aditiva si la inspección confirma schema/capacidad faltante. No editar una migración aplicada ni inferir que el fallo es una migración ausente sin estado del entorno. Alinear artefacto generado y DB antes de liberar.
9. Mantener reglas actuales de importe: pesos enteros normalizados, importe positivo, tope validado antes de transacción y facturación por importe de movimiento. No permitir sobrepago bajo concurrencia.

## Requisitos funcionales y no funcionales

- **F1:** La interfaz comunica si el pago no se guardó o si se guardó y solamente falló/quedó pendiente la factura.
- **F2:** El formulario y el servidor aplican validación independiente; datos inválidos, falta de POS para factura, POS desconfigurado, saldo inválido y sobrepago no generan movimiento.
- **F3:** Para un pago parcial válido, se descuenta exactamente el importe normalizado una sola vez y la orden permanece `inpago` cuando el saldo todavía es positivo.
- **F4:** Para pago que completa el saldo, `paidStatus` se actualiza a `pago` bajo el mismo lock/transacción que el movimiento.
- **F5:** Factura A/B/C reserva el comprobante del movimiento y solo factura el importe de ese movimiento; no altera la factura de la orden.
- **F6:** Remito se persiste como `NOT_REQUIRED` atómicamente y no alcanza ningún seam AFIP.
- **F7:** La acción no devuelve mensajes arbitrarios de Prisma/proveedor ni muestra resultado HTTP como proxy del éxito del negocio.
- **F8:** Logs seguros identifican etapa/resultado de commit y permiten distinguir al menos error de esquema/constraint conocido, error operacional DB no clasificado y error de emisión, sin texto crudo.
- **F9:** Repeticiones idempotentes y concurrencia no duplican pago, cambios de balance, intento ni factura.
- **F10:** `UNKNOWN` permanece no reintentable hasta reconciliación autoritativa; una falla de registro no queda etiquetada como error de factura ni viceversa.

## Criterios de aceptación comprobables

- **AC-01 — HTTP vs resultado de action:** para una action que devuelve `success: false`, una respuesta HTTP 200 no genera toast de éxito ni refresh que se interprete como pago registrado. La UI presenta fallo seguro de registro.
- **AC-02 — Fallo antes del commit:** inyectar fallo en cada operación de la transacción (lock/read, creación de movimiento, reserva Remito/voucher, actualización de cliente, actualización de orden). Se confirma rollback completo, cero cambios contables y `paymentRecorded: false`; el log contiene fase+código seguro, no mensaje/stack/datos.
- **AC-03 — Pago parcial válido:** orden total 100, movimientos previos 20, pago nuevo 30: exactamente un movimiento por 30, balance cliente decrementado 30, remaining 50 y `paidStatus: inpago`; Factura usa 30, no 50 ni 100.
- **AC-04 — Cierre exacto:** orden total 100, pagos previos 70, pago 30: una sola aplicación contable y `paidStatus: pago`.
- **AC-05 — Sobrepago/concurrencia:** pago mayor al saldo se rechaza sin escrituras. Dos pagos simultáneos cuya suma excedería saldo permiten solo los compatibles con saldo bajo lock DB; saldo agregado nunca supera total.
- **AC-06 — Repetición de clave:** repetir mismo request con UUID igual retorna el movimiento/status ya comprometido y no cambia por segunda vez movimiento, balance de cliente, status de orden ni número de intentos; misma clave con request distinto se rechaza sin efectos.
- **AC-07 — Aislamiento de factura:** confirmar transacción antes de iniciar cualquier llamada remota. Si el servicio de factura devuelve `FAILED`, `UNKNOWN` o `AUTHORIZED`, el resultado conserva `paymentRecorded: true`; los efectos de emisión no alteran el movimiento ni la contabilidad ya comprometidos.
- **AC-08 — No doble factura:** simular reenvío/concurrencia/reinicio antes y después de despacho. Estados `ISSUING`, `AUTHORIZED`, `UNKNOWN` no hacen segundo POST. Solo fallo inequívocamente predespacho/ausencia confirmada habilita acción explícita conforme a la máquina de estados.
- **AC-09 — Remito sin AFIP:** una confirmación Remito crea un movimiento y `NOT_REQUIRED` en la misma transacción, sin POS, intento, lookup/prepare/POST/reconcile ni invocación a `issuePaymentVoucherForSession`. Una falla de escritura del voucher revierte también el movimiento y las actualizaciones contables.
- **AC-10 — Deriva Prisma/base:** prueba de integración en PostgreSQL desechable con migraciones aplicadas confirma creación de `NOT_REQUIRED`, clave compuesta, FK y unicidad. La verificación operacional compara el artefacto real, historial y cliente generado sin exponer valores del entorno; los mocks solos no satisfacen este criterio.
- **AC-11 — Diagnóstico sanitario:** para errores conocidos de Prisma registrar únicamente código safe y fase; para errores inesperados registrar fase y categoría genérica. No aparecen en log/respuesta mensaje Prisma, SQL, parámetros, payload, stack, credenciales ni datos fiscales.
- **AC-12 — Distinguir comprobante:** fallo preflight/rechazo definido produce pago comprometido + voucher `FAILED`; timeout luego del marcador produce pago comprometido + `UNKNOWN` no reintentable. Estos casos nunca se informan como si el pago hubiera fallado.
- **AC-13 — Tests de regresión:** todos los tests existentes de `register-payment.test.ts` siguen pasando; agregar pruebas de rollback/fases y una prueba de integración PostgreSQL aislada donde sea viable. Los mocks por sí solos no satisfacen AC-10.
- **AC-14 — No exposición/no secretos:** inspección de diff y logs de QA demuestra que no se solicitaron ni agregaron secretos, URLs completas, documentos fiscales completos o respuestas crudas del proveedor.
- **AC-15 — Reconciliación íntegra de migraciones:** antes de reanudar un despliegue, existe una matriz de las 18 migraciones exactas incluidas en el artefacto que coteja para cada una `_prisma_migrations` (estado, intentos, éxito/fallo/checksum cuando disponible) con todos sus efectos físicos y de datos. Incluye migraciones anteriores, la fallida y todas las posteriores; la falta de evidencia para cualquier fila mantiene el despliegue bloqueado. La discrepancia del directorio vacío local se resuelve contra el artefacto real, no por suposición.
- **AC-16 — Reconciliación excepcional de `qzTray`:** sólo se considera `npx prisma migrate resolve --applied 20260813000000_add_business_qz_tray` si una verificación de catálogo en el destino correcto demuestra exactamente `BOOLEAN NOT NULL DEFAULT false` y el historial demuestra un intento fallido/no aplicada satisfactoriamente. La decisión requiere backup recuperable y aprobación DBA; se documenta que el comando sólo registra estado en `_prisma_migrations`, no ejecuta SQL ni verifica equivalencia. Si falla una sola condición, no se recomienda `--applied`, se detiene el despliegue y se diseña reparación específica. AC-16 prohíbe marcar en masa migraciones manuales, especialmente las de datos, índices o enums.

## Riesgos y mitigaciones

| Riesgo | Impacto | Mitigación/requisito |
|---|---|---|
| Error DB durante transacción comunicado de manera genérica | El operador puede reintentar o buscar factura aunque nunca hubo commit; sin fase tampoco hay RCA | Registrar fase, outcome de commit y código allowlisted. La UI debe decir “pago no registrado” solo cuando se conoce rollback/no commit. |
| Migración/cliente generado desfasado | Escrituras fallan por falta de tabla, columna, índice o valor enum; regresión puede afectar Remito específicamente | Verificar artefacto y estado migratorio de QA/runtime; añadir migración solo cuando se confirme; no inferir desde archivos del repo. |
| Desconocimiento de resultado del commit por pérdida de respuesta | Reintento con clave nueva podría duplicar pago; un error HTTP no prueba rollback | Durable unique idempotency key, resolver replay con la misma clave, proteger el botón y no generar clave nueva salvo nueva intención confirmada. |
| Factura remota no atómica con PostgreSQL | Pago puede existir sin factura, o el proveedor puede autorizar antes de perderse respuesta | Persistir reserva antes del despacho; aislar pago vs voucher; `UNKNOWN` bloqueado y no reemitir sin reconciliación autoritativa. |
| Factura duplicada por retry ciego | Duplicidad fiscal para un solo pago | Máquina de estados por movimiento/intento, transiciones compare-and-set, unicidad de voucher y no retry en `ISSUING`/`UNKNOWN`/`AUTHORIZED`. |
| Error de comprobante tratado como fallo de pago | Operador repite pago y duplica contabilidad aunque el primer movimiento ya existe | Contrato UI/action explícito `paymentRecorded` + `voucherStatus`; validar resultado persistido antes de reintentar. |
| Pagos parciales sumados o facturados contra saldo incorrecto | Sobrepago, status pagado incorrecto, comprobante por importe equivocado | Bloqueo DB por orden, pesos enteros, uso de `CashMovement.total` como importe del comprobante y tests con pagos previos/concurrentes. |
| Dependencia entre servicios externos dentro de transacción | Locks largos, timeouts y rollback ambiguo | Toda llamada Pusher/cache/AFIP queda después de commit; ninguna espera remota dentro de la transacción Prisma. |
| Logging diagnóstico expone datos | Exposición de documentos, CAE, secretos, payload o datos del cliente | Solo eventos/fase/códigos permitidos y booleano de resultado de commit; no serializar `Error` ni queries/requests. |

## Archivos e interfaces candidatos para una implementación posterior

| Área | Responsabilidad |
|---|---|
| `src/app/(protected)/account-ledger/[id]/AddPaymentForm.tsx` | Mantener key y estado visual, diferenciar fallo de pago vs resultado de comprobante. |
| `src/actions/unpaid-orders.ts` | Instrumentar etapas con códigos seguros; preservar validación/tenant, lock, atomicidad, idempotencia y clasificación de post-commit. |
| `src/lib/server/payment-voucher.ts` + `payment-voucher-outcome.ts` | Mantener estado y error de factura separados del registro contable. |
| `prisma/schema.prisma` y `prisma/migrations/` | Cambiar solo si verificación de schema runtime demuestra necesidad; preservar claves y relaciones fiscales. |
| `src/__tests__/unpaid-orders/register-payment.test.ts` | Extender unit tests para rollback y distinción por etapa. |
| Test PostgreSQL aislado | Verificar migraciones, enum/constraints e interacción Prisma real, no mocks. |

## Fuera de alcance / decisiones pendientes

- No implementar aún, no emitir prueba contra AFIP/ARCA real y no efectuar migraciones contra producción.
- No cambiar reglas fiscales, IVA, impresión de factura de venta completa, factura de orden ni tratamiento legal del Remito.
- No eliminar ni compensar un pago posiblemente comprometido para hacer desaparecer una falla de factura.
- RCA exacta del caso en vivo requiere evidencia safe de fase/código o estado técnico del mismo artefacto/base que atendió la acción. No hace falta ni se debe pedir un secreto para obtenerla.
- Antes de definir un workaround al fallo reportado, verificar que el log corresponde al checkout/artefacto actual: hay varias especificaciones previas sobre el feature y el estado de deployment/base no se deriva del código local.
