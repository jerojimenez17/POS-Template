# Checklist de pruebas: clasificación por `nroAsociado`

## Factura sin asociación

- [ ] Factura A usa la operación `invoice` y el tipo AFIP `1` con `nroAsociado` omitido, `undefined`, `0` o `-0` y sin otras señales.
- [ ] Factura B usa la operación `invoice` y el tipo AFIP `6` con `nroAsociado` omitido, `undefined`, `0` o `-0` y sin otras señales.
- [ ] Factura C usa la operación `invoice` y el tipo AFIP `11` con `nroAsociado` omitido, `undefined`, `0` o `-0` y sin otras señales.
- [ ] La Factura B predeterminada con `nroAsociado: 0` supera el preflight invoice, llama una vez a `getVoucherNumberForActor(9, 6, "invoice", actor)` y emite payload `createVoucher` con `tipoFactura: 6`; no solicita tipo `8` como NC.
- [ ] Un array vacío `CbtesAsoc: []` no cuenta como señal de asociación.
- [ ] Strings, `null`, booleanos y otros valores no numéricos en `nroAsociado` no activan NC por sí solos ni se convierten/coaccionan en números.

## Nota de Crédito con asociación válida

- [ ] Asociación válida para Factura A usa operación `credit-note` y tipo AFIP `3`.
- [ ] Asociación válida para Factura B usa operación `credit-note` y tipo AFIP `8`.
- [ ] Asociación válida para Factura C usa operación `credit-note` y tipo AFIP `13`.
- [ ] La solicitud de numeración y el payload de emisión mantienen la clasificación/tipo de NC correspondiente.

## Fronteras inválidas y asociaciones parciales

- [ ] Cada número no-cero de tipo number activa la ruta de validación NC incluso si es negativo, fraccionario, no seguro, `NaN` o infinito.
- [ ] Los números asociados no válidos retornan error local de datos originales de NC con `issuanceNotStarted: true`.
- [ ] Un número asociado no válido no llama a `getVoucherNumberForActor` ni a `createVoucher` (axios).
- [ ] `ptoVentaAsociado` definido por sí solo mantiene la clasificación NC con `nroAsociado: 0` o ausente; si faltan datos numéricos obligatorios, la validación rechaza antes de lookup y emisión.
- [ ] `caeAsociado` definido por sí solo mantiene la clasificación NC con `nroAsociado: 0` o ausente; si faltan datos numéricos obligatorios, la validación rechaza antes de lookup y emisión.
- [ ] `CbtesAsoc` no vacío mantiene la clasificación NC con `nroAsociado: 0` o ausente; si faltan datos numéricos obligatorios, la validación rechaza antes de lookup y emisión.
- [ ] Una asociación parcial nunca cae en la rama invoice ni produce una emisión de factura.

## Límites

- [ ] Las pruebas cubren exclusivamente el contrato observable de clasificación del servidor y las llamadas/non-llamadas de numeración y transporte.
- [ ] No se modifican provider, reducer, snapshot, mappings ni otro código de producción.
