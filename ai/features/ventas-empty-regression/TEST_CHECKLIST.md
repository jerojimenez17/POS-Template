# TEST_CHECKLIST — regresión de ventas vacías

- [ ] Una orden con `paidStatus = "pago"` y `billType = "Remito"` aparece al seleccionar Remito.
- [ ] La selección de Facturas incluye `Factura A`, `Factura B` y `Factura C`.
- [ ] El snapshot inicial convierte las etiquetas UI (`remito`, `facturac`, `efectivo`) a tokens de consulta y valores persistidos compatibles; no produce un listado vacío por desajuste de casing/etiqueta.
- [ ] Un medio seleccionado coincide con `paymentMethod` o con `paymentMethod2`.
- [ ] `paidStatus = "inpago"` no se incorpora al historial de ventas pagas.
- [ ] Tipos y medios vacíos no agregan restricciones al `where` y conservan `businessId`/`paidStatus = "pago"`.
- [ ] Los filtros se aplican en la consulta server-side antes de `take`, sin filtrado local.
- [ ] La prueba de regresión falla actualmente en la inclusión de Factura A/B y pasa después de resolver el contrato A/B/C.

## Resultado Gate G2

Ejecutar:

```bash
npm run test -- ai/features/ventas-empty-regression/ventas-empty-regression.test.ts
```

G2 se alcanza cuando todas las casillas pasan. En el estado regresivo actual deben fallar las expectativas de Factura A y B (el backend solo genera `Factura C`).
