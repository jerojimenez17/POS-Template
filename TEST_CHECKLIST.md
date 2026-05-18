# TEST CHECKLIST: Implementación ptoVenta y ARCA

## Validación de Esquemas y Tipos
- [ ] Validar que `ArcaFieldsSchema` acepte un arreglo de enteros para `ptoVenta`
- [ ] Validar que `BillParametersSchema` acepte el `ptoVenta` seleccionado (entero)

## Server Actions (ARCA)
- [ ] `updateBusinessArcaData` debe permitir guardar un arreglo de `ptoVenta`
- [ ] `updateBusinessArcaData` debe poder ser invocado por un rol `ADMIN` para su propio negocio

## Server Actions (Vouchers)
- [ ] `getLastVoucher` (frontend) debe rechazar peticiones si el usuario no tiene rol apropiado
- [ ] `getLastVoucher` (frontend) debe invocar la URL de la Cloud Function y retornar el resultado exitoso
- [ ] `getLastVoucher` (frontend) debe retornar error si la Cloud Function falla

## UI Components
- [ ] `arca-form.tsx`: Se debe renderizar y permitir añadir al menos un elemento a `ptoVenta`
- [ ] `BillParametersForm.tsx`: El punto de venta inicial debe obtenerse del primer elemento del arreglo cargado en el context/business
