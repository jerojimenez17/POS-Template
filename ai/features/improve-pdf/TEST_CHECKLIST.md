# Test checklist — improve-pdf (G2)

## Criterios de aceptación

- [ ] Una venta nueva persiste exactamente el `billType` seleccionado (A, B, C, Presupuesto o Remito).
- [ ] La facturación posterior persiste el tipo elegido junto con el CAE.
- [ ] `getSalesAction` y `getSaleByIdAction` exponen el tipo persistido.
- [ ] La reimpresión usa el tipo histórico, no la condición IVA/configuración actual del negocio.
- [ ] El fallback `Factura C` se usa únicamente si falta el tipo en una venta oficial legada.
- [ ] Un Remito sin CAE conserva `Remito`; la falta de CAE omite CAE, QR y numeración oficial.
- [ ] Un tipo no vacío desconocido no se transforma silenciosamente en `Factura C`.
- [ ] El PDF declara una escala centralizada `1.30 ± 0.05`, aplicada al layout y legibilidad.
- [ ] El PDF conserva contenido, totales, QR, CAE y paginación sin overflow horizontal.

## Escenarios positivos

1. Nueva Factura A/B/C: persistencia, lectura histórica y PDF muestran el mismo tipo.
2. Venta sin CAE facturada luego como B: el update conserva B para reimpresión.
3. Presupuesto y Remito: se muestran como documentos no fiscales sin inventar una factura.
4. PDF con 3 o más productos, CAE y QR válido: contenido y sección de autorización visibles.
5. PDF con muchas filas: se permite salto vertical de página y no se recortan filas/totales.

## Escenarios negativos

1. Sesión sin `businessId`: acciones devuelven `No autorizado` y no escriben en la base.
2. Error de persistencia de venta: resultado `Error al procesar la venta`.
3. Error al actualizar CAE: resultado `Error al actualizar CAE de la venta`.
4. Tipo desconocido no vacío: se conserva de forma segura, sin degradar a `Factura C`.
5. QR ausente/inválido: PDF válido, sin imagen rota; CAE permanece legible.

## Edge cases

- `billType` `null`, vacío, código ARCA numérico o etiqueta conocida/desconocida.
- CAE `null`, vacío o compuesto sólo por espacios.
- Venta histórica sin tipo persistido: fallback observable y documentado, nunca aplicado a ventas nuevas.
- CAE sin punto de venta: no fabricar número de comprobante.
- Nombres y descripciones largos: wrapping sin desbordamiento.
- Descuento cero/positivo y total descontado igual a cero.
- Remito sin CAE, y registro legado creado por `saveOrderAction`.

## Errores esperados

- `No autorizado`
- `Error al procesar la venta`
- `Error al actualizar CAE de la venta`
- Fallos de render PDF no deben perder la venta ni alterar la impresión térmica.
