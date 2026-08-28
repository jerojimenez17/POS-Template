# Test checklist — `a4-label-missing-barcode`

- [ ] AC1: A4 sin `showBarcode` no renderiza `.label-code`, código interno ni SVG.
- [ ] AC1 edge: producto sin `codebar` ni `code` tampoco deja un código vacío.
- [ ] AC2: A4 con código válido renderiza exactamente un SVG y un `.label-code` antes del barcode.
- [ ] AC3: `thermal` y `label-45x55` mantienen visible el código sin SVG.
- [ ] AC4: descripción A4 sin barcode/con precio usa al menos `20px`, `width: 100%` y wrapping; sin precio no baja de `20px`.
- [ ] AC5: precio A4 sin barcode usa al menos `72px` en impresión y un preview equivalente, sin `48px`.
- [ ] AC6: `$` e importe son elementos separados; el símbolo usa una regla menor y exclusiva de A4.
- [ ] AC7: se conservan `6.5cm × 4.5cm`; una descripción larga no elimina ni recorta visualmente el precio.
- [ ] AC8: impresión sigue usando `format: "a4"`, A4 con margen de `5mm`, tres columnas de `6.5cm` y paginación existente.
- [ ] AC9: no se cambian las reglas/medidas de `thermal` ni `label-45x55`.

## Ejecución

```bash
npm run test -- ai/features/a4-label-missing-barcode/product-print-modal-a4-label-missing-barcode.test.tsx
```

Las pruebas se dejan intencionalmente en rojo antes de la implementación. La configuración existente de Vitest/RTL (`vitest.config.mts`, `tests/setup.ts` y dependencias ya instaladas) es suficiente; no se añadió configuración ni dependencias.
