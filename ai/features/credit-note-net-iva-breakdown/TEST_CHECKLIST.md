# QA checklist — desglose neto/IVA de Nota de Crédito

Fuente normativa: [`SPEC.md`](./SPEC.md). El checklist define el contrato local que debe implementar esta feature; `PENDIENTE` no significa que se haya validado hoy.

## Estado de QA local

En las secciones siguientes `[x]` indica que el escenario local fue cubierto y pasó en la ejecución indicada; no certifica la migración en un entorno real ni la integración o entrega del servicio remoto.

- [x] Suites dirigidas: los cinco archivos de esta feature y las suites `invoice-nro-asociado-classification` y `persistence-and-history` pasan en la ejecución final registrada abajo.
- [ ] Suite global: no pasa en la ejecución registrada abajo; los fallos/errores observados se detallan sin atribuirles una causa no demostrada.
- [ ] Typecheck global: no se volvió a ejecutar en esta ronda. La ejecución anterior registrada reportó errores en otros tests del repo; no se considera una verificación actual.
- [x] En esta ronda solo se actualizaron fixtures de pruebas y este checklist; no hubo cambios de producción tras el resultado anterior.

Ejecución QA final (2026-10-05): `npm run test -- ai/features/credit-note-net-iva-breakdown ai/features/invoice-nro-asociado-classification/invoice-nro-asociado-classification.test.ts ai/features/factura-a-receipt-client-data/persistence-and-history.test.ts --reporter=dot` — **7 archivos, 76 tests, todos pasan** (duración reportada: 8.74 s).

Ejecución completa (2026-10-05): `npm run test` con timeout de 180 s **no expiró**; Vitest terminó con error. Se observaron 9 tests fallidos en `src/__tests__/actions/round-excel-prices.test.ts` y luego un error no manejado `Error: kill EPERM` de un proceso hijo de Vitest. Esta salida no basta para atribuir una causa raíz ni para afirmar que el error sea externo al código.

## Gates pendientes fuera de las suites locales

- [ ] Confirmar que la migración `20261005000000_add_authorized_fiscal_snapshot` se aplicó en la base PostgreSQL objetivo. La presencia del archivo de migración en el repositorio no demuestra despliegue.
- [ ] Ejecutar/verificar integración contra PostgreSQL real si todavía no se ha realizado; esta ronda ejecutó Vitest y no aporta evidencia de esa integración.
- [ ] Mantener pendiente la verificación y el despliegue coordinado de la Cloud Function externa; los tests locales no certifican entrega remota.

## Factura autorizada y snapshot server-side

- [ ] En emisión normal A/B/C, obtener el snapshot de los datos fiscales retornados/autorizados por el servicio, no calcularlo con precios redondeados del catálogo ni aceptar libremente un objeto del navegador.
- [x] Test de contrato: la respuesta de factura autorizada normalizada incluye el `fiscalSnapshot` versionado completo.
- [ ] Un CAE sin snapshot completo se mantiene compatible como factura histórica, pero no se interpreta como snapshot fiscal ni habilita una NC.
- [ ] Guardar snapshot inmutable en la misma persistencia exitosa que CAE, tipo, POS, número y datos de la factura. **Pendiente: el checkout actual no expone una frontera server-trusted que enlace autorización normal con `processSaleAction`; no se inventa ni se prueba una entrada fiscal controlada por el navegador.**
- [ ] No reemplazar/alterar snapshot autorizado al editar posteriormente venta, productos o precios.
- [ ] Recuperar el snapshot persistido por la consulta de venta dentro del negocio/tenant autenticado, conservando centavos y códigos de alícuota.
- [ ] Rechazar o ignorar datos fiscales que el cliente intente adjuntar a `processSaleAction`; permitir solo información cuya procedencia server-side esté acreditada.

## Elegibilidad, tenant y límites del checkout

- [x] El request público de NC acepta solo identificador/confirmación/idempotencia y campos metadata expresamente permitidos; rechaza `fiscalBreakdown`, neto, IVA, total y descuento extra por strict schema.
- [x] Releer orden y snapshot desde el tenant autenticado; jamás seleccionar la venta solo por id ni tomar el desglose del cliente.
- [x] Snapshot ausente o histórico sin consulta autoritativa completa: devolver `NOT_ELIGIBLE` con mensaje accionable; cero nueva reserva/reclamación de `SaleReturn` y cero `createVoucher`.
- [x] Snapshot no válido: versión/origen/moneda/tipo/POS/número/CAE incompatible, importes no finitos/negativos, discrepancia de total superior a ARS 0,01, IVA/grupos incoherentes, códigos inválidos o duplicados sin regla expresa: rechazo antes de reserva/emisión.
- [x] Tolerancia de redondeo no debe ocultar la ausencia de grupos/tasa/base fiscal.
- [ ] Nunca completar importes faltantes desde `missingFiscalData`; ese mecanismo solo puede completar identificadores fiscales permitidos.
- [ ] Si hubiera consulta de ARCA implementada, aceptar solo resultado autoritativo completo validado contra CUIT, tipo, POS, número y CAE del original; si falta cualquier dato, tratar como snapshot ausente.

## Construcción de NC total

- [x] Conservar por separado snapshot fiscal, POS/tipo/número del comprobante asociado y POS seleccionado de emisión.
- [x] Tipos correlativos sin mezclar el tipo de NC con `CbtesAsoc.Tipo`: factura 1→NC 3, 6→8, 11→13; asociación refiere al tipo original.
- [x] Usar en NC total exactamente magnitudes positivas del snapshot autorizado: total, neto, IVA, no gravado, exento, otros tributos y todos los grupos `{Id, BaseImp, Importe}`.
- [x] Total original post-descuento coincide con `Order.total` dentro de ARS 0,01.
- [x] La NC fija `total` y `totalWithDiscount` al total original y `discount: 0`; no vuelve a aplicar el descuento ya reflejado en el snapshot.
- [x] Productos/precios/costos/subtotales y catálogo actual no intervienen en bases, tasas, neto ni IVA. Probar cambio de catálogo después de venta.
- [x] Cambio de condición IVA actual de negocio/cliente no recalcula ni reemplaza condiciones contextuales ni snapshot autorizado.
- [ ] Factura B gravada mantiene el IVA fiscal que efectivamente se autorizó, aunque no se discrimine visualmente al comprador.
- [x] Factura C con grupos IVA inventados se rechaza en el builder/payload local; falta validar el request C permitido en el servicio remoto.
- [x] Invariante de salida: `ImpNeto > 0` implica `Iva` presente/no vacío; `sum(Iva[].Importe)` cuadra con `ImpIVA` conforme al redondeo WSFE documentado.
- [x] Validar sumas de neto + IVA + conceptos no gravados/exentos + otros tributos contra total según regla oficial documentada.

## Serialización local a `createAFIPVoucher`

- [x] El test verifica el payload en el límite HTTP real/mock de `issuePreparedAfipVoucher`, después de su serializador mínimo, no solo el builder.
- [x] Mantener bloque lógico/versionado `fiscalBreakdown`, mapeando `source`, `version`, tipo original, `ImpTotal`, `ImpNeto`, `ImpIVA`, `ImpTotConc`, `ImpOpEx`, `ImpTrib` e `Iva[{Id,BaseImp,Importe}]` sin pérdida.
- [x] Conservar `arca.tipoFactura` como tipo de NC y `CbtesAsoc` como referencia del original.
- [x] Cero credenciales en resultados/logs públicos; credenciales existentes solo en el request server-to-server autenticado.
- [x] Facturación normal mantiene tipos A/B/C, totales/descuento, productos y respuesta CAE compatible sin exigir un snapshot en el request del navegador.
- [x] Acción pública: Factura B con `nroAsociado: 0` recorre el flujo de factura (tipo AFIP 6 y operación `invoice`), no cae en el rechazo de NC.
- [x] La acción pública rechaza una NC enviada directamente sin asociación/snapshot fiscal autorizado server-side; no consulta numeración ni llama a `createVoucher`.
- [x] Grant válido: se consume una sola vez y su snapshot normalizado se persiste con la venta; segundo consumo no crea una segunda orden.
- [x] Grants no elegibles: tenant distinto, grant expirado y CAE/tipo/número/POS discordantes dejan cero órdenes y cero snapshot persistido.
- [ ] Si un error determinístico de función acredita de forma estructurada que no comenzó WSFE por desglose inválido, clasificar como no emisión; no deducirlo de texto/HTTP genérico.

## Idempotencia, reserva y reconciliación

- [x] La suite verifica que ausencia o snapshot incoherente bloquea antes de reserva/emisión.
- [x] Rechazo pre-reserva no causa efectos locales de reversión ni llamada de emisión.
- [x] Repetición con misma clave y resultado autorizado devuelve el resultado persistido sin segundo `createVoucher`.
- [x] Clave distinta tras autorización produce conflicto; `PENDING` no reemite automáticamente.
- [x] Timeout, 5xx, respuesta sin CAE o resultado incierto después de iniciar emisión mantiene `PENDING`/conciliación; reintento no envía una segunda emisión.
- [ ] Rechazo autoritativo solo libera/rechaza reserva con la señal estructurada acordada; conservar política actual de idempotencia.
- [ ] La llamada remota permanece fuera de la transacción de base de datos.

## Cloud Function externa — gate de release no cubierto por tests locales

- [ ] Conseguir/confirmar contrato consumidor real de `createAFIPVoucher`; la fuente y la implementación WSFE están fuera de este checkout.
- [ ] Desplegar coordinadamente una versión que consuma `fiscalBreakdown` y no regenere bases/IVA desde productos ni aplique descuento otra vez.
- [ ] Probar contra contrato remoto real payloads autorizados A multi-alícuota, B gravada y C; confirmar su proyección WSFE y el invariante `ImpNeto > 0 => Iva` antes de WSFE.
- [ ] Comprobar error determinístico estructurado anterior a WSFE y respuesta compatible con el parser local.
- [ ] Verificar autorización de ARCA/WSFE en homologación o entorno autorizado y reconciliar el comprobante emitido con el original.
- [ ] Registrar versión desplegada y evidencia de pruebas remotas. **No declarar la feature entregada ni asumir que los tests locales simulan o validan una implementación remota ausente.**

## Archivos de pruebas de esta etapa

- `fiscal-snapshot-contract.test.ts`: normalización de snapshot, correlación A/B/C, preservación del builder, payload y fallos de invariantes.
- `checkout-boundary.test.ts`: strict request, tenant-scoped reread, snapshot faltante/inválido antes de reserva y desacoplamiento del catálogo/condición actual.
- `afip-voucher-transport.test.ts`: contrato HTTP local luego del serializador real, rechazo antes de emisión y regresión de facturación ordinaria.
- `public-afip-zero-association.test.ts`: clasificación de la acción pública AFIP para Factura B con sentinel cero y rechazo de NC caller-direct sin snapshot autorizado.
- `fiscal-snapshot-grant-consumption.test.ts`: consumo grant una sola vez y rechazo tenant/expiración/CAE/tipo/número/POS en la persistencia de la venta.
