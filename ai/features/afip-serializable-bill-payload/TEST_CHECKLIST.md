# QA checklist — AFIP serializable bill payload

Casos de aceptación del paso QA/TDD. Marcar como verificados al implementar el contrato; los tests en RED describen comportamiento esperado, no certifican la implementación actual.

## DTO de checkout y normalización

- [ ] Checkout con instancias reales de `Product` y `Suplier` produce DTO plain allowlisted; el producto incluye únicamente `id`, `code`, `description`, `price`, `salePrice` y `amount`.
- [ ] El DTO preserva `id: "6"`, tipo explícito `Factura B`, montos, `discount`, `documentNumber` y fecha ISO.
- [ ] No se copia `product.suplier`, atributos sorpresa de producto/checkout, prototipos de clases ni referencias mutables no permitidas.
- [ ] Campos extra plain se ignoran o rechazan con seguridad; función/Client Reference, símbolo, getter con efecto, instancia arbitraria y prototipo no plano no causan excepción no controlada.
- [ ] Fecha inválida, tipos incompatibles y campos requeridos inválidos producen error plain antes de iniciar emisión; no se altera silenciosamente un dato fiscal inválido.
- [ ] Error en la normalización cliente bloquea la Server Action, persistencia e impresión.

## Servidor, preflight y emisión

- [ ] Entrada no confiable se vuelve a validar/normalizar en servidor y sólo el allowlist puede llegar al snapshot y al HTTP.
- [ ] Entrada no clonable devuelve exactamente `{ error: string, issuanceNotStarted: true }`; no escapa como HTTP 500, ni causa persistencia, grant o POST.
- [ ] El preflight de numeración es sólo lectura: puede ocurrir antes de un fallo de snapshot; cualquier fallo anterior a emisión resulta en cero llamadas `axios.post`.
- [ ] Un comprobante válido con preflight válido causa exactamente un POST `action: "createVoucher"`.
- [ ] Factura B válida mantiene `arca`, headers, CUIT/token server-side y la proyección HTTP; `ptoVenta` no aparece en `billState`.
- [ ] Factura válida mantiene `id: "6"`; falta de `billType` usa `Factura B` y falta/no-utilizable `documentNumber` usa `0`.
- [ ] Precio efectivo del producto conserva la precedencia actual: `salePrice` positivo, en otro caso `price` positivo, en otro caso cero; el HTTP mantiene `price`, `salePrice` y `amount` según el contrato actual.
- [ ] Montos y descuento conservan precedencia/cálculo vigente; `Date` válida se transporta como ISO string.
- [ ] Producto `Product` con `Suplier` no plano puede emitirse sin enviar proveedor ni atributos ajenos.

## Seguridad, grants y serialización

- [ ] Respuestas de éxito y error relevantes pasan `structuredClone` y no contienen instancias `Error`, prototipos no permitidos ni Client References.
- [ ] `fiscalBreakdown` del cliente no se usa como desglose fiscal autorizado; `fiscalSnapshot` y marcadores de nota de crédito siguen bloqueados por los guards públicos.
- [ ] Se conservan auth, rol, tenant, feature entitlement, validación de punto/número, issuer/business binding, condiciones y single-use/replay del grant fiscal.
- [ ] Resultado sin éxito impide persistencia/impresión; CAE válido mantiene el camino exitoso actual y no aparecen reintentos automáticos.
- [ ] Mensajes/logs no contienen BillState completo, referencias no allowlisted, payloads completos, credenciales ni secretos.

## Cobertura escrita en este paso

- [x] DTO de checkout con clases reales, allowlist, campos fiscales/montos/fecha e instancia clonable.
- [x] Fallo de entrada no clonable: error plain, preflight opcional y cero POST/grant.
- [x] Emisión válida una vez: Factura B, id `6`, fecha, montos, producto/precio efectivo, headers y exclusión de proveedor/ptoVenta.
- [x] Guards contra `fiscalBreakdown`, `fiscalSnapshot`, nota de crédito y autorización no permitida.
- [ ] Falta completar cobertura directa de errores de preflight/credenciales, error de respuesta HTTP posterior al POST, rama de fallo local cliente en `BillButtons` (persistencia/impresión), variaciones de precio y tests de regresión completos de grants single-use.
