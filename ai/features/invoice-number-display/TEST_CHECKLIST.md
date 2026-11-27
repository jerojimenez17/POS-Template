# Checklist QA — invoice-number-display

## Formato y compatibilidad

- [ ] Punto de venta `1` y comprobante `23` producen exactamente `001-0023`.
- [ ] El padding es 3 dígitos para punto de venta y 4 para comprobante; no se usa `4+8`.
- [ ] El combinado histórico de 7 dígitos se interpreta como `3+4`.
- [ ] Un combinado de 12 dígitos sin mapeo explícito se omite.
- [ ] Cero, `null`, `undefined`, `NaN`, blancos, texto inválido y componentes incompletos no generan placeholders.
- [ ] Los valores mayores al ancho esperado se normalizan sin truncarse.

## Regla fiscal

- [ ] Solo `Boolean(cae?.CAE?.trim())` identifica una factura oficial.
- [ ] CAE con espacios alrededor sigue siendo oficial; CAE vacío/blanco o ausente es remito/no fiscal.
- [ ] Remitos no muestran `N°`, `Nro`, `Factura`, CAE, QR residual ni número de comprobante.
- [ ] Una factura oficial sin número conserva tipo y CAE y omite únicamente la línea del número.

## Salidas

- [ ] Histórico (`SaleAccordion`/`SalesTable`) muestra `001-0023`, nunca el CAE.
- [ ] Filtros Factura C/Remito siguen dependiendo exclusivamente del CAE no vacío.
- [ ] `PrintableTable` muestra el número en vista imprimible solo para facturas oficiales.
- [ ] ESC/POS y fallback HTML muestran una única línea `Nro: 001-0023`.
- [ ] PDF muestra `N° 001-0023` solo en facturas oficiales.
- [ ] Thermal, HTML, PDF e histórico reciben el mismo par punto de venta/comprobante.
- [ ] Cuenta corriente/`PrintOrderButton` continúa imprimiendo presupuesto o comprobante sin número fiscal.

## Persistencia y no regresión

- [ ] El histórico conserva `CAE.ptoVenta` y acepta JSON CAE antiguo sin romperlo.
- [ ] Una nueva factura persiste el punto de venta junto con el CAE para sobrevivir a una recarga.
- [ ] Totales, productos, CAE, QR, permisos, paginación, nombres de archivo y facturación posterior no cambian.

## Factura B: nueva venta, estado y formulario

- [ ] `BillTypes.B` (`Factura B`) es el valor inicial observable de `BillProvider`/`INITIAL_STATE` al abrir una nueva venta (`/newBill`).
- [ ] Abrir una nueva venta no hereda `Remito` ni `Factura C` como tipo inicial.
- [ ] `BillReducer.removeAll` conserva `Factura B` y limpia los datos de una venta nueva, incluyendo CAE y productos.
- [ ] `BillReducer.billType` conserva cualquier valor explícitamente seleccionado (`Remito`, `Presupuesto` o `Factura C`).
- [ ] `BillReducer.setState` conserva sin normalizar el `billType`, CAE, número e identidad de una venta histórica cargada.
- [ ] `BillParametersForm` usa `BillTypes.B` como `defaultValues` y muestra `Factura B` en su primera renderización.
- [ ] El reset de `BillParametersForm` vuelve a `Factura B`, sin modificar estados históricos ni selecciones explícitas de otros flujos.
- [ ] Con `Factura B` desde el primer render y después del reset, la consulta del próximo comprobante usa tipo ARCA `6`.
- [ ] El estado del proveedor, el reducer y el formulario permanecen coherentes durante el flujo de nueva venta y sus resets.
