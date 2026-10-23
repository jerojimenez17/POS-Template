# Nota de Crédito: neto e IVA del comprobante original

## Estado y alcance

- **Etapa:** especificación arquitectónica TDD únicamente. No se modifican código, esquema ni pruebas en esta entrega.
- **Objetivo:** emitir una Nota de Crédito (NC) por reversión total con los mismos importes fiscales —neto, IVA por alícuota y demás componentes— que el comprobante original, evitando que la Cloud Function construya un `ImpNeto > 0` sin `Iva`.
- **Alcance posterior:** completar la trazabilidad fiscal al emitir facturas normales, persistir un snapshot fiscal inmutable del comprobante autorizado, propagarlo al flujo de NC y hacer que la Cloud Function construya WSFE desde ese snapshot.
- **Fuera de alcance:** NC parciales, cambiar precios o descuentos de ventas, seleccionar una alícuota según condición actual del cliente/vendedor, alterar el proceso de stock/caja, o inventar un desglose para facturas históricas.
- **Dependencias:** se requiere cambiar y desplegar de manera coordinada la Cloud Function `createAFIPVoucher`. Su fuente no está en este repositorio; el cambio solo del cliente Next.js no puede garantizar que el servicio remoto use el desglose.

## Diagnóstico sustentado en el repositorio

### Flujo de factura normal

1. `src/components/Billing/BillParametersForm.tsx` envía al estado de facturación el tipo (A/B/C), la condición de IVA del comprador, documento y totales. `src/context/BillReducer.ts` mantiene importes de productos y calcula `totalWithDiscount` aplicando el descuento porcentual y redondeando a pesos.
2. `src/actions/afip.ts:createAfipVoucherAction` deriva actor y negocio de la sesión y llama a `prepareAfipVoucherForActor`/`issuePreparedAfipVoucher` en `src/lib/server/afip-voucher.ts`.
3. En la preparación/serialización (`afip-voucher.ts`, `getEffectiveUnitPrice` y construcción de `minimalBillState`), la app normaliza precios, cantidad, `discount`, `total` y `totalWithDiscount`, y envía `billType`, `IVACondition`/`clientIvaCondition`, productos y otros datos. **La app no calcula ni envía `ImpNeto`, `ImpIVA` ni `Iva` en ese flujo.** La creación efectiva de los campos del request WSFE se delega a la Cloud Function.
4. `src/actions/sales/process.ts` persiste CAE, tipo, número, punto de venta, condición del comprador, documento, descuento e ítems/precios. `prisma/schema.prisma` (`Order` y `OrderItem`) no persiste condición histórica del emisor ni neto, IVA, alícuotas o bases fiscales. La respuesta que el cliente interpreta en `src/services/afip/voucher-response.ts` solo normaliza CAE, vencimiento, número, QR y punto de venta; no devuelve un snapshot de importes fiscales.

Por lo tanto, el flujo normal aporta a la Cloud Function los productos, total y descuento, pero este checkout **no conserva después** el cálculo fiscal producido al autorizar la factura. El repositorio permite establecer ese límite, pero no permite describir línea por línea la fórmula remota que actualmente genera `ImpNeto`/`Iva`: la Cloud Function no está versionada aquí. La respuesta recibida (`AFIP_API_ERROR (10070): Si ImpNeto es mayor a 0 el objeto IVA es obligatorio`) sí acredita el invariante incumplido en el request WSFE final: se presentó un `ImpNeto` positivo sin el objeto IVA requerido.

### Rama actual de Nota de Crédito

1. `src/app/(protected)/sales/[id]/page.tsx` expone `createCreditNoteAction` desde el detalle de venta; la acción autentica y relee la orden con `businessId` de sesión en `src/actions/sales/credit-note.ts`.
2. La acción usa la metadata original para mapear A/B/C a tipo NC 3/8/13 y asociar el comprobante. En cambio, arma los productos con `costPrice ?? price` en `price`, precio de venta snapshot en `salePrice`, y cantidad; asigna `order.total` tanto a `total` como a `totalWithDiscount`, además de `IVACondition` del comprador almacenada (con fallback a Consumidor Final). No toma de la orden un snapshot de neto/IVA, de alícuotas o de impuestos.
3. `buildCreditNoteVoucherState` en `src/services/afip/credit-note.ts` copia tipo, productos, total, condiciones y asociación, pero no tiene campos fiscales para `ImpNeto`, `ImpIVA` o `Iva`. `buildCreditNoteCreateVoucherPayload` reconstruye una lista permitida a partir de esa entrada y tampoco agrega/valida un desglose fiscal.
4. El transporte real de NC también recorre `issuePreparedAfipVoucher` en `src/lib/server/afip-voucher.ts`: serializa un estado mínimo con precios, cantidades, descuento (en la NC actual queda ausente y se normaliza a 0) y totales; no serializa valores de IVA ni bases. La función remota debe inferir los importes desde esos datos y el tipo de comprobante.
5. La posible pérdida de descuento es significativa: los ítems originales guardan subtotales/precios sin un snapshot de asignación fiscal del descuento; la NC recibe el total final rebajado (`order.total`) junto a productos que siguen a precio snapshot completo y sin el porcentaje/importe de descuento original. Incluso una recalculación sobre esos productos puede derivar una base distinta. Además, `Product`/`OrderItem` no tienen una alícuota IVA histórica por ítem.

**Diagnóstico:** no hay un desglose histórico fiable que la rama NC pueda reutilizar hoy. El request actual le da a la función externa datos comerciales insuficientes para reproducir exactamente el cálculo de una factura, y tampoco le entrega la matriz `Iva` explícita; el error demuestra que la rama remota terminó generando `ImpNeto > 0` omitiendo dicho objeto. No debe corregirse agregando una alícuota constante ni recalculando neto desde `OrderItem.price`, `subTotal`, catálogo actual o condición IVA actual.

## Decisión fiscal

### La NC hereda el comprobante, no recalcula desde los productos

Para la NC total, la fuente de verdad es el **snapshot fiscal autorizado del comprobante original** (o una consulta autoritativa de ARCA/AFIP al comprobante original, solo si existe y valida todos los datos). No son fuentes de verdad los datos actuales del catálogo, los precios de costo, productos/proveedor, la condición actual del negocio ni una condición del comprador enviada desde el navegador.

"Igual al de la factura que se anula" significa:

- El **importe total** de NC debe igualar, como magnitud positiva, el total autorizado del comprobante original y la reversión local existente debe seguir usando el total de la venta. En NC completa, la semántica del tipo NC invierte el efecto contable; no se envían valores negativos salvo que el contrato WSFE documentado del endpoint lo requiera expresamente.
- El **neto y los componentes fiscales** deben ser los importes fiscales originales post-descuento, sin derivarlos del total ni de productos. Si la factura tenía más de una base/alícuota, se preservan los grupos por separado. Las sumas de bases, IVA, otros tributos y conceptos deben reconciliar con los importes originales, sujeto a la regla de redondeo documentada por WSFE.
- Las **alícuotas** no son “iguales al total”: se copian los identificadores de alícuota y sus bases/IVA originales por grupo. La condición IVA de comprador/vendedor puede participar en la elegibilidad/tipo del comprobante al emitir la factura original, pero por sí sola no define una tasa ni permite reconstruir su base.
- Se conserva el tipo fiscal original y su NC correlativa: Factura A (tipo 1) → NC A (3), Factura B (6) → NC B (8), Factura C (11) → NC C (13). No convertir A/B/C según la condición actual del negocio o del cliente.

La Factura B no debe interpretarse como “sin IVA fiscal” solo porque el comprobante visible al comprador no discrimine el impuesto: se conserva el desglose fiscal que efectivamente autorizó la factura original cuando el request original tiene base gravada. La Factura C no debe recibir IVA inventado. La transformación específica de los campos WSFE para C y los campos no gravados/exentos debe respetar la respuesta/snapshot original y el contrato oficial del endpoint; no se debe poner una base gravada positiva sin el objeto IVA que la respalda. En cualquier tipo, si el request final lleva `ImpNeto > 0`, `Iva` debe existir y contener los grupos aplicables. La función debe rechazar estados incompatibles antes de llamar al WSFE, en lugar de enviar una estructura incompleta.

El tipo A/B/C ya guardado es el dato histórico de clasificación disponible. `Order.clientIvaCondition` puede conservar la condición del comprador para contexto, pero `Business.condicionIva` es mutable y no se guarda en `Order`; ninguna de esas condiciones actuales puede reemplazar el snapshot tributario original. El snapshot nuevo debe incluir la condición del emisor observada en la emisión y la condición del comprador usada, como contexto/validación, no como sustitutos de importes y alícuotas.

### Ventas históricas sin desglose

Los campos actuales (`Order.CAE`, `billType`, número/POS, total, descuento e ítems) no permiten inferir unívocamente alícuotas ni bases fiscales. Para estas ventas:

1. Primero se permite usar únicamente un resultado **autoritativo y completo** de consulta del comprobante original en ARCA, validado por CUIT de la empresa, tipo, punto de venta, número y CAE. Esa capacidad no está presente en el flujo inspeccionado y no debe presuponerse.
2. Si ni el snapshot fiscal persistido ni una consulta autoritativa están disponibles, devolver fallo seguro `NOT_ELIGIBLE` con mensaje accionable, por ejemplo: “No se puede emitir la Nota de Crédito porque no está disponible el desglose fiscal original. Consulte/recupere el comprobante en ARCA antes de volver a intentar”. No reservar/reclamar `SaleReturn`, no invocar `createVoucher` y no autorizar la devolución fiscal/local como si se hubiera emitido.
3. No añadir los importes o alícuotas faltantes a `missingFiscalData`: ese mecanismo solo completa identificadores fiscales faltantes permitidos; ningún dato fiscal financiero se admite del cliente.

## Contrato de datos y payload esperado

### Snapshot fiscal canónico

Persistir, con la autorización de cada factura normal, un snapshot fiscal versionado e inmutable asociado a `Order` (campo JSON dedicado sugerido, por ejemplo `fiscalSnapshot`; no sobreescribir el objeto CAE actual). El contenido mínimo requerido es:

```ts
interface AuthorizedFiscalSnapshotV1 {
  version: 1;
  source: "AUTHORIZED_VOUCHER";
  billType: "Factura A" | "Factura B" | "Factura C";
  afipVoucherType: 1 | 6 | 11;
  issuerIvaCondition: string; // valor histórico leído server-side al emitir
  buyerIvaCondition: string;  // valor autorizado de esa emisión
  currency: "ARS";
  total: number;              // mismo total autorizado/post-descuento que Order.total
  net: number;
  vat: number;
  nonTaxed: number;
  exempt: number;
  otherTaxes: number;
  iva: Array<{ id: number; base: number; amount: number }>;
}
```

La API real debe usar exactamente los nombres de códigos/unidades que la función mapea al request WSFE. El snapshot debe derivarse en el servidor a partir del resultado/autorización de factura normal, nunca aceptarse como un campo de entrada libre del navegador. Si hoy la Cloud Function no devuelve sus campos fiscales, se amplía su respuesta normalizada y se persiste bajo el mismo criterio de éxito/CAE; la app no reconstruye el snapshot independientemente con datos redondeados de catálogo. Un CAE válido sin snapshot completo no habilita emisión de NC hasta que se recupere el comprobante autoritativamente.

### Emisión de Nota de Crédito

- `createCreditNoteAction` relee la orden y el snapshot fiscal desde Prisma dentro del tenant autenticado; el navegador solo solicita `orderId`, confirmación/clave de idempotencia y los metadatos de identificador ya permitidos. Ningún total, neto, descuento, tasa o desglose procede del request del navegador.
- `buildCreditNoteVoucherState` debe recibir un snapshot fiscal validado y tipado; debe retener separado el POS/tipo/número del comprobante asociado y el POS de emisión ya definido en la feature existente.
- `buildCreditNoteCreateVoucherPayload` debe preservar el desglose, no descartarlo al reconstruir el estado, y mapearlo explícitamente hacia el contrato versionado de Cloud Function. No debe inferirlo de `products`.
- El request de emisión a la Cloud Function debe contener, además de las credenciales/configuración ya existentes y la asociación, un bloque serializable equivalente a:

```ts
{
  action: "createVoucher",
  arca: { puntoVenta: emissionPointOfSale, tipoFactura: 3 | 8 | 13, /* credenciales */ },
  billState: {
    billType: "Factura A" | "Factura B" | "Factura C", // clasificación original
    total: originalSnapshot.total,
    totalWithDiscount: originalSnapshot.total,
    discount: 0, // ya incluido en el snapshot; no volver a descontar
    nroAsociado: originalNumber,
    ptoVentaAsociado: originalPointOfSale,
    CbtesAsoc: [{ Tipo: 1 | 6 | 11, PtoVta: originalPointOfSale, Nro: originalNumber }],
    fiscalBreakdown: {
      source: "AUTHORIZED_VOUCHER",
      version: 1,
      originalAfipVoucherType: 1 | 6 | 11,
      ImpTotal: originalSnapshot.total,
      ImpNeto: originalSnapshot.net,
      ImpIVA: originalSnapshot.vat,
      ImpTotConc: originalSnapshot.nonTaxed,
      ImpOpEx: originalSnapshot.exempt,
      ImpTrib: originalSnapshot.otherTaxes,
      Iva: originalSnapshot.iva.map(({ id, base, amount }) => ({ Id: id, BaseImp: base, Importe: amount })),
    },
    // identidad y productos pueden persistir para presentación/auditoría,
    // pero no participan del cálculo de ImpNeto/IVA de la reversión.
  },
}
```

Los nombres del bloque son el contrato lógico que deberán acordar el adaptador y la función; si la función consume esos importes directamente con otra nomenclatura, mantener una única conversión testeada en ese límite. La función debe usar `arca.tipoFactura` como tipo NC nuevo, `CbtesAsoc` como identidad del original y `fiscalBreakdown` como importe original. No debe regenerar `ImpNeto`/`Iva` desde el precio de los productos ni aplicar el descuento otra vez.

### Invariantes antes de reservar o emitir

Validar en servidor, antes de reservar `SaleReturn` y de cualquier llamada irreversible:

- Snapshot presente, `version` soportada, origen autorizado y compatible con el tipo/número/POS/CAE original ya normalizados.
- Números finitos, moneda soportada, totales no negativos, sumas internamente coherentes con las reglas y precisión WSFE documentadas; `total` coincide con `Order.total` a precisión de centavo. Rechazar discrepancias mayores a ARS 0,01; tolerancias de redondeo no pueden ocultar una tasa/banda faltante.
- `ImpIVA` coincide con la suma de importes IVA de `Iva`, y `ImpNeto`/demás componentes coinciden con el total según la regla oficial del comprobante. Cualquier `ImpNeto > 0` lleva al menos una alícuota aplicable en `Iva`; cada grupo tiene código, base e importe finitos no negativos; no duplicar códigos sin una regla expresa.
- Factura/NC C no adquiere grupos IVA inventados. Factura/NC A o B con neto gravado copia los grupos y bases autorizados originalmente. Rechazar combinación de tipo y snapshot contradictoria.
- Los importes del payload de NC se envían como magnitudes fiscales equivalentes a las del original; no multiplicar/descontar una segunda vez ni cambiar alícuotas por comprador/emisor actual.

No mover la llamada externa dentro de una transacción. Si la validación falla, se mantiene el contrato seguro actual de idempotencia/reintentos, se devuelve `NOT_ELIGIBLE`, no se crea una nueva reserva ni se llama al endpoint de emisión. Una falla o resultado incierto posterior a iniciar la emisión mantiene la política `PENDING`/conciliación actual; no habilitar reemisión automática.

## Tests requeridos para la etapa QA (no escritos en esta entrega)

### Éxito

1. **Factura A, varias alícuotas:** factura original con dos grupos IVA, descuento y total autorizado. La NC A usa exactamente `ImpTotal`, `ImpNeto`, `ImpIVA` y cada `{Id, BaseImp, Importe}` post-descuento del snapshot; asociación tipo 1/POS/número originales intactos. Verificar `createVoucher` una vez y que cambio de precio de producto/catálogo después de la venta no altera el desglose.
2. **Factura B gravada:** NC B conserva exactamente el desglose fiscal autorizado original aunque el documento al comprador no muestre IVA discriminado. Comprobar que no se elimina `Iva` si `ImpNeto > 0` ni se calcula impuesto a partir de `clientIvaCondition`.
3. **Factura C:** NC C hereda los componentes del snapshot sin crear alícuotas IVA. La función construye el request C válido con `ImpIVA = 0` y los campos permitidos por el contrato C; no enviar `ImpNeto > 0` sin IVA.
4. **Descuento:** usar productos cuyo bruto supera el total neto de descuento. Afirmar que importes gravados y `Iva` enviados son el snapshot autorizado post-descuento, que `discount` no se aplica otra vez y que líneas/precios no recalculan bases.
5. **Independencia de condiciones actuales:** cambiar la condición de IVA del negocio y/o ficha de cliente tras la factura no altera tipo, importes ni grupos; el tipo NC es el correlativo del tipo original persistido.
6. **Persistencia normal:** al emitirse factura válida, guardar snapshot completo junto con los metadatos CAE; recuperar el detalle de venta y preparar NC produce el mismo snapshot sin pérdida de decimales/códigos de alícuota.
7. **Payload de extremo a extremo:** verificar los datos en el límite HTTP real/mock de `issuePreparedAfipVoucher`, y en el contrato consumidor de Cloud Function, no solo en el objeto builder. Ninguna credencial aparece en respuestas/logs; la función utiliza el bloque fiscal y entrega respuesta compatible con el parser vigente.

### Error / rechazo seguro

8. Ausencia de snapshot y consulta de comprobante original no disponible/incompleta: respuesta segura `NOT_ELIGIBLE`, cero escritura/reserva `SaleReturn`, cero `createVoucher`.
9. Snapshot malformado, versión desconocida, CAE/tipo/POS/número incompatibles, total distinto por más de ARS 0,01, bases/IVA no reconciliadas, códigos de alícuota inválidos o montos no finitos/negativos: mismos ceros de escritura y emisión.
10. `ImpNeto > 0` con `Iva` omitido/vacío, suma de grupos diferente a `ImpIVA`, o tipo C con grupos IVA fabricados: fallo local antes de reservar/emitir; ninguna llamada a Cloud Function.
11. Condición actual de negocio/comprador que difiere del snapshot no debe provocar recálculo; si contradice el tipo/snapshot de forma que no pueda validarse el documento, rechazar antes de emitir y reportar dato original inconsistente.
12. Datos fiscales enviados deliberadamente por navegador (`fiscalBreakdown`, neto, total o alícuotas) no sustituyen los guardados: ignorar/rechazar claves extra en las fronteras strict existentes; probar además manipulación de productos y descuentos.
13. Error determinístico de la función antes de envío al WSFE por falta/inconsistencia de desglose se clasifica como no emisión solo con señal estructurada que lo pruebe; rechazo autoritativo usa la política actual. Timeout, error 5xx o respuesta sin CAE sigue `PENDING`/conciliación y no produce un segundo `createVoucher` en reintentos.
14. Compatibilidad de facturación normal: tipos A/B/C siguen enviando sus datos normales, conservan descuentos/totales previos y registran el snapshot; una respuesta CAE histórica sin desglose no se presenta como snapshot completo ni hace emitible una NC.

## Criterios de aceptación medibles

- **AC-01:** En una NC total, el total y cada componente fiscal serializado coinciden con los del comprobante original autorizado dentro de ARS 0,01; la lista de códigos de alícuota y la cantidad de grupos coinciden exactamente.
- **AC-02:** En el caso `ImpNeto > 0`, el payload final de WSFE contiene `Iva` no vacío y `sum(Iva[].Importe) === ImpIVA` sujeto exclusivamente al redondeo explícito documentado. Nunca se permite este estado contradictorio hacia el endpoint.
- **AC-03:** No se deriva `ImpNeto`, base imponible ni tasa a partir de `OrderItem.price`, `costPrice`, `subTotal`, productos actuales, condición del comprador o condición actual del emisor.
- **AC-04:** Los importes reflejan el descuento original exactamente una vez: el snapshot es post-descuento y el flujo NC no vuelve a aplicar porcentaje/descuento.
- **AC-05:** Se mantiene la correspondencia de tipos 1→3, 6→8 y 11→13, separada de `CbtesAsoc.Tipo` (tipo del comprobante original).
- **AC-06:** Un snapshot ausente/inválido no causa nueva reserva/reclamación ni llamada de emisión; una consulta original solo habilita la NC si devuelve y valida todos los campos fiscales requeridos.
- **AC-07:** El snapshot se genera en la emisión normal, se persiste junto al CAE como registro versionado no editable por el cliente y se recupera para la reversión.
- **AC-08:** La forma final del request se prueba después de `afip-voucher.ts` y en el contrato de la Cloud Function; no basta con probar solamente `buildCreditNoteVoucherState`.
- **AC-09:** La ausencia de código fuente de Cloud Function queda resuelta como dependencia de release: no se da por entregada la corrección hasta desplegar/verificar la versión que consume el nuevo contrato y confirma la validación ARCA.
- **AC-10:** El tratamiento de errores conserva idempotencia: rechazo seguro antes de emisión deja cero nuevos efectos; resultado incierto tras iniciar emisión requiere conciliación y nunca reemite automáticamente.

## Archivos relevantes para implementación posterior

- `src/actions/sales/credit-note.ts`: cargar y validar el snapshot tenant-scoped antes de reserva; no calcular importes desde productos.
- `src/services/afip/credit-note.ts`: introducir tipos/validación fiscal y transportar sin pérdida el snapshot en state/payload de NC.
- `src/lib/server/afip-voucher.ts`: conservar el bloque validado hasta el límite HTTP y no eliminarlo al construir `minimalBillState`.
- `src/actions/afip.ts` y `src/services/afip/voucher-response.ts`: conservar compatibilidad de factura y normalizar el retorno del snapshot en el camino server-side.
- `src/actions/sales/process.ts`, `src/actions/sales/update.ts` y `src/actions/sales/history.ts`: persistir/recuperar snapshot de emisión sin permitir que una edición de la venta cambie una factura ya autorizada.
- `prisma/schema.prisma`: añadir snapshot fiscal versionado/nullable para compatibilidad con órdenes históricas; migración aditiva, sin fabricar valores para registros existentes.
- Cloud Function externa `createAFIPVoucher`: consumir desglose explícito y proyectar los campos WSFE según el tipo A/B/C; validar `ImpNeto`/`Iva` antes del envío.

## Limitación comprobada

No se encontró fuente de `createAFIPVoucher` ni de la implementación WSFE en este checkout; `docs/09-arca-afip.md` describe la integración, pero no sus cálculos de neto/IVA. Por ello el diagnóstico identifica con certeza la brecha del contrato local y el invariante roto que reporta ARCA, no una línea concreta dentro de la función remota. Antes de escribir tests de integración se debe obtener/publicar el contrato real del endpoint y contrastar con payloads autorizados A, B y C. No asumir qué campos de importe usa hoy la función ni corregir exclusivamente del lado Next.js.
