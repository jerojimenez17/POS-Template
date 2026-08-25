# TEST_CHECKLIST — fix-shortcut-price-total

## Gate G2

- [ ] Las pruebas del feature existen en esta carpeta y compilan con TypeScript.
- [ ] La suite objetivo pasa después de corregir `updateSalePrice`.
- [ ] No se modifica la implementación durante esta etapa.

## Criterios de aceptación

- [ ] **CA-01 Positivo:** un producto agregado por shortcut, con cantidad 1 y precio inicial 0, actualizado a `125.50`, produce `total = 126` y `totalWithDiscount = 126`.
- [ ] **CA-02 Positivo:** al cambiar el segundo de dos productos `(10 × 2)` y `(25 × 1)` a `40`, el total es `60`.
- [ ] **CA-03 Positivo:** con descuento 10% y raw total 150, el total es `150` y el total con descuento es `135`.
- [ ] **CA-04 Positivo:** sin descuento, `totalWithDiscount` coincide con el nuevo `total`.
- [ ] **CA-05 Positivo:** blur y Enter en `PriceEditInput` despachan el mismo `updateSalePrice`, sin duplicados.
- [ ] **CA-06 Negativo:** un id inexistente no modifica productos, total ni total con descuento.
- [ ] **CA-07 Regresión:** las pruebas existentes de cantidades (`addItem`, `changeUnit`, `addUnit`, `removeUnit`) continúan pasando.
- [ ] **CA-08 Calidad:** no se añaden dependencias ni cambios de esquema.

## Edge cases cubiertos

- [ ] Precio editado a `0` vuelve los totales a cero.
- [ ] Cantidad decimal se multiplica sin asumir cantidad 1.
- [ ] Precio decimal con coma se normaliza a número en blur.
- [ ] Se conserva el redondeo `Math.round` en total y descuento.
- [ ] La actualización es inmutable: estado original y producto no coincidente permanecen intactos.
- [ ] Actualizaciones consecutivas de productos distintos no sobrescriben sus precios.

## Comandos de verificación

```bash
npx vitest run ai/features/fix-shortcut-price-total/update-sale-price.test.ts ai/features/fix-shortcut-price-total/price-edit-input-confirmation.test.tsx
npx tsc --noEmit
```
