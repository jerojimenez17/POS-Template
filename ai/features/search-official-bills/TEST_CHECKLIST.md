# TEST CHECKLIST — búsqueda de facturas oficiales

## Gate G2 (QA RED)

- [x] Tests deterministas creados antes del arreglo de producción.
- [x] Los tests ejercitan el mapper `Order -> BillState`, `parseCAE` y la
      clasificación oficial/remito usada por la UI.
- [ ] El suite pasa después de propagar `CAE: parseCAE(order.CAE)` en el mapper.
- [ ] El suite pasa sin cambios en la consulta, paginación, schema o filtros
      server-side.

## Criterios de aceptación

- [ ] Una orden paga con `Order.CAE.CAE` no vacío conserva el mismo CAE en
      `BillState.CAE.CAE`.
- [ ] El CAE se conserva con sus metadatos (`vencimiento`, `nroComprobante`,
      `qrData` y `ptoVenta` cuando están presentes).
- [ ] La clasificación basada en `isAFIPAuthorized` marca como oficial una
      venta con CAE y como remito una venta sin CAE.
- [ ] Con Remito activo y FacturaC inactivo, la venta oficial no se muestra
      como remito; con FacturaC activo, sí aparece.
- [ ] La venta oficial muestra el número de comprobante y no muestra
      `Facturar`.
- [ ] La misma regla se mantiene para primera página, `nextCursor` y refresco
      por Pusher.
- [ ] `null`, CAE ausente, JSON no objeto, objeto sin `CAE`, tipo inválido,
      cadena vacía y cadena de espacios no lanzan excepciones y quedan como no
      oficiales.
- [ ] Un CAE válido mantiene su clasificación oficial aunque falten datos
      accesorios de factura; la elegibilidad de nota de crédito es separada.
- [ ] `nroComprobante` numérico y string se conservan y permiten el formato
      histórico de número.
- [ ] Si falta `ptoVenta` en el JSON del CAE, el número puede usar el punto de
      venta fiscal normalizado del `BillState`.
- [ ] Las formas históricas soportadas por `parseCAE` (objeto y JSON
      serializado) siguen siendo aceptadas.
- [ ] `billType`, punto de venta fiscal, número, cliente, pagos, fechas,
      devoluciones y metadatos de nota de crédito no se alteran.
- [ ] Un `billType`/`afipVoucherType` legado sin CAE no se considera oficial.
- [ ] No se agregan consultas, cambios de esquema ni dependencias.

## Escenarios negativos y edge

- [ ] CAE vacío o con espacios.
- [ ] CAE malformado/no JSON o JSON sin propiedad `CAE`.
- [ ] CAE con tipo no string.
- [ ] CAE válido con contenido fiscal incompleto.
- [ ] CAE histórico con comprobante numérico o string.
- [ ] Orden sin CAE pero con tipo fiscal legado.
- [ ] Resultados distribuidos en más de una página.
- [ ] Resultado actualizado por evento Pusher.

## Verificación

```bash
npm run test -- ai/features/search-official-bills/search-official-bills.test.ts
```

Resultado esperado en este paso: **RED**; al menos los casos de propagación
del CAE y rechazo de CAE vacío deben fallar contra la implementación actual.
