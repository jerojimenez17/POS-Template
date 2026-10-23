# AFIP: payload serializable para emitir facturas

## Estado y alcance

- **Estado:** especificación arquitectónica autorizada para implementación posterior. En esta entrega no se implementa código ni se escriben pruebas.
- **Objetivo:** evitar que el estado de caja con clases o referencias no serializables atraviese la frontera de una Server Action o falle al preparar el comprobante; devolver errores serializables en vez de una respuesta HTTP 500 cuando la preparación falle.
- **Alcance:** payload de factura normal desde `BillButtons` hasta `createAfipVoucherAction`, normalización defensiva en servidor, snapshot previo a emisión y resultados de la acción.
- **Fuera de alcance:** cambiar las reglas fiscales, el endpoint/contrato funcional de la Cloud Function, la autenticación o autorización, los grants fiscales confiables, el comportamiento de notas de crédito, la respuesta CAE, el esquema de base de datos o iniciar reintentos automáticos.

## Evidencia y diagnóstico

### Hechos observados

1. Un intento de factura normal tardó **1345 ms** en `createAfipVoucherAction`; el POST de Next terminó en HTTP 500 con `TypeError: Cannot set property message of ... which has only a getter`.
2. En el navegador se observó además `function(){throw Error("Attempted to call a temporary Client Reference from the server but it is on the client...")} could not be cloned.`
3. Los logs de la Cloud Function no registran solicitud correspondiente a ese intento. Por tanto, la llamada de creación no llegó a la Cloud Function.
4. `BillButtons.tsx` invoca la acción con `createBillCheckoutSnapshot`. `src/utils/billing.ts:52-59` copia superficialmente el estado, productos y CAE, pero conserva referencias anidadas y otros valores del estado original.
5. `Product` y `Suplier` son clases (`src/models/Product.ts` y `src/models/Suplier.ts`); una instancia puede seguir anidada en `product.suplier` aunque el producto exterior se copie con spread.
6. `prepareAfipVoucherForActor` hace actualmente `structuredClone(billState)` en `src/lib/server/afip-voucher.ts:207-210`, después de validaciones/preflight de numeración y antes de devolver el preparado. `issuePreparedAfipVoucher` realiza el `axios.post` sólo más adelante.
7. `createAfipVoucherAction` no captura actualmente una excepción de `prepareAfipVoucherForActor`, por lo que una excepción puede escapar como error de Server Action/HTTP 500.

### Conclusión probatoria

La hipótesis principal es que algún dato no clonable —posiblemente una referencia temporal de cliente— permanece en el árbol del estado y provoca el fallo de serialización/clonado antes de emitir. Sin embargo, no se cuenta con stack completo ni ruta de campo que identifique el valor exacto; **no debe documentarse como causa raíz demostrada ni atribuirse específicamente a `Product.suplier`**. Las clases `Product`/`Suplier` y las referencias retenidas son riesgos concretos a eliminar mediante DTO explícito.

La ausencia de la solicitud en los logs de Cloud Function, junto con el orden del flujo (`prepare` antes de `issue`/POST), confirma que este intento no alcanzó la función. El estado CAE no está en duda para este intento, salvo que aparezca evidencia distinta que muestre una solicitud emitida.

La consulta de numeración es un preflight de lectura y puede haber ocurrido antes de fallar el clonado. Su posible ejecución no equivale a una solicitud de emisión ni autoriza afirmar que se emitió un comprobante.

## Decisión arquitectónica

Adoptar un contrato explícito de datos planos para la frontera de facturación electrónica:

1. En el cliente, crear antes de invocar la Server Action un DTO de factura con campos allowlisted y valores primitivos/`Date` válidos; no propagar el `BillState` completo con spreads como payload de emisión.
2. En el servidor, aceptar/validar una entrada no confiable y reconstruir de nuevo un DTO allowlisted. La normalización de cliente no reemplaza esta validación.
3. Sustituir `structuredClone(billState)` por una reconstrucción/snapshot plano que sólo incluya campos necesarios. No clonar el objeto completo ni permitir que propiedades inesperadas sean copiadas al payload de la Cloud Function.
4. Encapsular el camino de normalización/preparación en `createAfipVoucherAction`: fallos anteriores al POST se devuelven como `{ error: string, issuanceNotStarted: true }` plain y serializable.
5. Mantener intactos los controles de autenticación, rol, feature entitlement, validación de punto y número, grants fiscales y emisión de un solo uso. `fiscalBreakdown` no se acepta desde una solicitud de factura ni se usa como dato confiable del cliente.

La normalización debe ocurrir antes de los usos del payload en el servidor que puedan fallar por estructura inesperada. El lookup de numeración puede ejecutarse como preflight conforme al flujo actual; si el snapshot/clone posterior falla, **no** debe consumirse el preparado ni realizarse el POST a Cloud Function.

## Contrato del DTO de factura

### Reglas generales

- Definir un tipo de entrada de factura serializable separado de `BillState`/`Product`; los DTO de frontera no deben depender de instancias de clases.
- Enumerar explícitamente campos permitidos en cliente y servidor. Ignorar/rechazar de forma segura campos extra; en particular, nunca copiar propiedades inesperadas por spread al DTO ni al objeto `billState` enviado por HTTP.
- Valores admitidos: strings, números finitos y booleanos donde el campo lo requiera, `null`/`undefined` sólo donde el contrato permita ausencia, arrays de objetos planos con esquema conocido, y una fecha validada/convertida explícitamente. No admitir funciones, símbolos, instancias arbitrarias, referencias React/Next, referencias temporales de cliente, getters con efectos o objetos con prototipos no planos.
- Una instancia de `Product` o `Suplier` en el estado de UI no se transmite como instancia. Proyectar sólo los campos de producto requeridos por la Cloud Function y no incluir el proveedor anidado. No recorrer/copiar recursivamente objetos arbitrarios.
- No se debe cambiar silenciosamente un dato fiscal inválido a un valor fiscal distinto. Los valores opcionales sólo reciben defaults enumerados abajo; cualquier dato requerido inválido impide el comienzo de emisión.

### Compatibilidad de factura normal y Cloud Function

El DTO/snapshot debe conservar los campos contractuales de `billState` que actualmente consume el armado HTTP en `src/lib/server/afip-voucher.ts`, sin ampliar el contrato de la Cloud Function:

- Cabecera: `id`, `seller`, `typeDocument`, `IVACondition`, `twoMethods`, `secondPaidMethod`, `totalSecondMethod`, `entrega`, `pago`, `billType`, `paidMethod`, `clientId`, `client`, `clientIvaCondition`, `clientDocumentNumber`, `discount`, `documentNumber`, `total`, `totalWithDiscount` y `date`, según presencia y significado actual.
- Productos: array con los campos necesarios `id`, `code`, `description`, `price`, `salePrice` y `amount`. El servidor debe seguir usando el mismo precio efectivo vigente (`salePrice` positivo, si no `price` positivo, en otro caso cero) y la misma representación enviada actualmente a la función. Ningún atributo ajeno, incluido `suplier`, se debe filtrar al payload remoto.
- `ptoVenta` se mantiene como dato interno de preparación y en `arca.puntoVenta`; debe seguir excluido de `billState` HTTP tal como ahora.
- Mantener el identificador habitual de factura **`id: "6"`** cuando ése sea el valor enviado por el checkout actual; esta normalización no debe reemplazarlo por un id sintético ni omitirlo.
- Si no viene `billType` para una factura normal, usar el default actual **`"Factura B"`** en servidor. No reinterpretar un tipo explícito válido ni cambiar el código AFIP asociado.
- `documentNumber` conserva el default actual **`0`** cuando está ausente/no utilizable, antes de formar el `billState` HTTP.
- Mantener cálculo y precedencia de `discount`, `total`, `totalWithDiscount` y `date` descritos en el código actual: default de descuento 0; total efectivo con descuento coherente con el comportamiento vigente; fecha transportada como ISO string para `Date` o string validada, sin transportar una referencia de objeto no serializable.
- La petición `axios.post` conservará `action: "createVoucher"`, la estructura `arca` (access token, CUIT, punto y tipo), headers y ruta de `billState` mínimo. Credenciales/secretos permanecen exclusivamente server-side.

El allowlist de cabecera podrá conservar campos adicionales sólo si se demuestra que son parte del contrato ya consumido por la Cloud Function para factura normal; no incluir datos fiscales autoritativos, snapshot/grant ni propiedades arbitrarias del estado.

### Separación factura / datos fiscales de confianza

- Una factura normal no acepta `fiscalBreakdown` enviado por cliente, aunque el valor parezca válido o sea serializable. Debe descartarse o rechazarse según el guard existente; nunca copiarlo al snapshot ni a la Cloud Function para convertirlo en autoridad fiscal.
- Se mantienen las protecciones existentes contra `fiscalSnapshot` y solicitudes de nota de crédito en la acción pública. La factura ordinaria no puede usar esos campos para saltarse validación o crear un grant.
- La emisión válida debe mantener el mecanismo actual de `createAuthorizedFiscalSnapshotGrant` y sus condiciones de elegibilidad. No cambiar issuer, business binding, CAE, point of sale, número, tipo, total, vida/replay del grant ni autorización de rol/feature.

## Manejo de errores y serialización de resultados

- Toda excepción producida durante normalización del input o `prepareAfipVoucherForActor` se captura en el límite de `createAfipVoucherAction` y, al ser anterior a la llamada de creación, se transforma a un objeto plain `{ error: string, issuanceNotStarted: true }`.
- Errores de validación, entrada inesperada, fallo al construir el snapshot, fallo de preflight y otros rechazos anteriores al POST deben tener forma serializable. No devolver `Error`, `TypeError`, `AfipPointSaleError` como instancia, referencias de cliente, `cause` no serializable, ni mutar propiedades de error de sólo lectura.
- Para la rama de normalización/clonado, el mensaje devuelto debe ser legible, breve y no contener payload, secretos ni stack. Puede registrar en servidor el nombre/tipo de error y una ruta de campo si se conoce de forma segura, pero los datos completos de caja no se loguean.
- Los resultados exitosos y los errores posteriores a la emisión deben seguir usando valores plain compatibles con la serialización de Server Actions. No convertir una falla posterior al POST en `issuanceNotStarted: true` si ya se inició la solicitud; preservar la distinción vigente entre emisión no iniciada y resultado posiblemente incierto.
- En el cliente, consumir el error simple mostrando el mensaje retornado y no intentar persistir/impprimir/resolver CAE ante resultado fallido.

## Requisitos funcionales

### RF-01: proyección allowlisted en el cliente

Antes de `createAfipVoucherAction`, `BillButtons` construye un DTO nuevo para factura normal de forma explícita. La construcción no debe incluir instancias `Product`/`Suplier`, props de framework, campos no usados ni referencias anidadas que no estén definidas por el contrato. Un error en la normalización debe bloquear la llamada a la acción y el flujo de emisión, y presentarse como error simple al usuario.

### RF-02: validación y normalización autoritativa en servidor

La acción valida/normaliza la entrada como `unknown` o equivalente seguro antes de confiar en sus campos. Debe conservar auth, business id derivado de sesión, rol admin/super-admin, validación de feature y todas las verificaciones previas existentes. Nunca confiar en el actor, grants, desglose fiscal, credenciales o datos de autorización provistos por cliente.

### RF-03: snapshot seguro sin clonación completa

Reemplazar el `structuredClone` de todo `BillState` por la creación del DTO/snapshot plano seguro. La preparación no debe retener referencias del objeto de entrada y el objeto guardado en el handle preparado debe estar aislado de mutaciones posteriores. Sólo los campos allowlisted podrán llegar a `minimalBillState` y al cuerpo HTTP.

### RF-04: no emisión ante normalización fallida

Si la construcción, validación, normalización o snapshot seguro falla, devolver `{ error: string, issuanceNotStarted: true }`. Se puede haber realizado el lookup de numeración previo al snapshot de servidor cuando corresponda, pero no se llama a `issuePreparedAfipVoucher` para ese payload fallido y no se llama a `axios.post`/Cloud Function. No persistir venta, CAE ni grant como efecto de fallo previo.

### RF-05: compatibilidad de emisión válida

Una factura válida mantiene tipo A/B/C, punto de venta, montos, descuento, cliente, fecha, productos, id `"6"`, default de tipo `"Factura B"` y `documentNumber` default 0 de acuerdo con el contrato vigente. La forma HTTP esencial para `createVoucher` y su proyección de productos no cambia. En condiciones de respuesta válida de la Cloud Function, el CAE sigue propagándose y el flujo actual puede guardar/imprimir sólo después de validar el éxito.

### RF-06: resultado serializable

Todos los retornos de `createAfipVoucherAction` deben contener únicamente valores serializables ordinarios. Los errores pre-POST usan `{ error: string, issuanceNotStarted: true }`; éxitos conservan el contrato canónico actual. No se permiten instancias de Error ni referencias temporales en el objeto de retorno.

### RF-07: seguridad fiscal y de autorización sin regresiones

No se acepta `fiscalBreakdown` del cliente para factura; no cambia la protección de notas de crédito y snapshot; no cambia ni se debilita grant, identidad, autorización por rol/feature, validación de punto o prevención de replay. Los secretos y el payload completo no se exponen en logs/respuestas.

## Archivos previstos

- `src/utils/billing.ts`: definir o utilizar una proyección DTO dedicada y plana para la acción AFIP, separada del snapshot general de checkout/impresión/persistencia si sus necesidades difieren.
- `src/components/Billing/BillButtons.tsx`: construir y pasar el DTO AFIP antes de la Server Action; bloquear la emisión ante fallo local de normalización.
- `src/actions/afip.ts`: validar entrada, conservar checks de seguridad, capturar excepción de preparación y normalizar las respuestas de error a plain serializable objects.
- `src/lib/server/afip-voucher.ts`: preparar snapshot allowlisted plano, eliminar el `structuredClone(billState)` completo y mantener intactos el preflight, handle de un solo uso y llamada HTTP existente.
- `src/models/` o `src/services/afip/`: colocar el tipo DTO/esquema de validación compartido adecuado, evitando importar clases de UI al boundary si no hace falta.
- Pruebas futuras de la utilidad, acción y servicio/preparación para los escenarios enumerados abajo. **Esta especificación no crea ni modifica archivos de prueba.**

No se prevén cambios en Prisma, grants almacenados, Cloud Function ni configuración de credenciales.

## Matriz de pruebas requerida para implementación/QA

1. Un checkout que contiene instancias reales de `Product` y `Suplier` anidada genera un DTO plano que excluye prototipos/referencias de clases y permite una llamada de Server Action serializable.
2. Probar las combinaciones relevantes de proveedor anidado plain y no plain, producto no plain, propiedades extra inesperadas y un valor inesperado/no clonable; ninguna referencia no allowlisted llega a servidor ni al HTTP remoto.
3. Una fecha válida y todos los campos admitidos producen el snapshot y los campos HTTP contractuales esperados; fechas/tipos inválidos producen error plain antes de emisión.
4. Fallo en normalización del cliente: resultado de error simple, cero llamadas a la Server Action/Cloud Function, cero persistencia y cero impresión.
5. Fallo en normalización/snapshot del servidor: resultado exacto plain serializable `{ error: string, issuanceNotStarted: true }`; se permite que el mock de lookup de numeración haya sido llamado si el orden lo requiere, pero la Cloud Function se llama cero veces.
6. Excepción de `prepareAfipVoucherForActor`: la acción no escapa con HTTP 500/TypeError; retorna error plain y la Cloud Function no es llamada.
7. Serializar todos los resultados de éxito y error relevantes mediante el mecanismo de serialización del proyecto/entorno de prueba (o `structuredClone` para objetos de retorno plain) sin excepción; verificar ausencia de `Error`, referencias React/Client Reference y prototipos no permitidos.
8. Factura válida: con preflight válido, la Cloud Function se invoca **exactamente una vez** y recibe `action`, `arca` y campos/productos HTTP contractuales equivalentes al comportamiento anterior, incluidos id `"6"`, tipo correcto/default B, `documentNumber: 0` por defecto, fecha y montos.
9. Una factura válida con producto `Product` y `suplier` no plain sigue emitiéndose una sola vez sin transmitir campos del proveedor.
10. Intentos con `fiscalBreakdown`, `fiscalSnapshot` o marcadores de nota de crédito no eluden los guards vigentes; el desglose del cliente nunca participa como input fiscal autorizado.
11. Resultado sin éxito o error impide persistencia e impresión como ahora; un CAE válido conserva el camino exitoso existente y no cambia las reglas del grant fiscal.
12. Revisar errores/logs: contienen sólo mensaje/tipo o ruta segura; no contienen payload íntegro, secretos, credenciales ni referencias serializadas.

## Criterios de aceptación medibles

- **AC-01:** el payload enviado por `BillButtons` a la acción AFIP se construye por allowlist; una búsqueda/prueba de regresión confirma que no se envía `BillState` completo ni se copia el producto con spread como objeto AFIP.
- **AC-02:** el DTO de cliente y el snapshot de servidor no contienen instancias de `Product`/`Suplier`, valores no plain fuera de `Date` permitida ni campos fuera del allowlist.
- **AC-03:** `src/lib/server/afip-voucher.ts` no usa `structuredClone` sobre el `BillState` completo para preparar factura normal; el snapshot incluye sólo datos planos allowlisted y no comparte referencias mutables de input.
- **AC-04:** errores del cliente al normalizar impiden exactamente el 100% de las llamadas de emisión y devuelven un error legible sin guardar o imprimir.
- **AC-05:** errores/excepciones de normalización o preparación en servidor devuelven `{ error: string, issuanceNotStarted: true }` serializable; ninguna de esas excepciones escapa desde `createAfipVoucherAction` como error HTTP 500.
- **AC-06:** si el snapshot/clone seguro falla después del lookup, se permite el lookup de preflight, pero la cantidad de llamadas a `axios.post`/Cloud Function es **0**.
- **AC-07:** con una factura válida y un preflight válido, la cantidad de llamadas a Cloud Function es exactamente **1**.
- **AC-08:** la solicitud válida conserva el contrato de HTTP `createVoucher` y los campos de producto `id`, `code`, `description`, precio efectivo, `salePrice`, `amount`; preserva id `"6"`, tipo B por default cuando falta el tipo y número de documento `0` por default.
- **AC-09:** el 100% de los escenarios de errores cubiertos y resultados exitosos de action pasan una verificación de serialización sin propiedades de error/clase o Client References.
- **AC-10:** `fiscalBreakdown` enviado por cliente no es aceptado/usado como autoritativo y todos los controles de auth, roles, feature, punto de venta, grants y single-use siguen operativos sin relajación.
- **AC-11:** la Cloud Function, CAE parser, condiciones para guardar/imprimir y política de grant conservan su comportamiento ante una respuesta válida; no se introducen reintentos automáticos.
- **AC-12:** los logs y mensajes no contienen el BillState completo, credenciales o referencias completas a datos no allowlisted.

## Verificación / límites del diagnóstico

Para cerrar la implementación, correlacionar un intento válido en logs de la acción, lookup de numeración y Cloud Function: un rechazo local/preflight puede no emitir; una factura válida debe generar exactamente una solicitud de creación. No usar el síntoma de serialization como evidencia de rechazo de ARCA ni asumir que hubo consulta de CAE para el intento de 1345 ms. La ruta exacta del campo culpable sólo podrá elevarse de hipótesis a hecho si se obtiene un stack/path diagnóstico reproducible.
