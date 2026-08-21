# Test checklist — sincronización del tipo inicial de factura

## Gate G2 — pruebas TDD

- [ ] **CA-01:** con `RESPONSABLE_INSCRIPTO`, la primera UI y `BillContext` muestran `Factura B`.
- [ ] **CA-02:** con `MONOTRIBUTO`, condición ausente o error, UI, formulario y contexto muestran `Factura C`.
- [ ] **CA-03:** el primer `createAfipVoucherAction` recibe `billType: "Factura B"` cuando el default inicial es B; no hay llamada previa con C, Remito, vacío o `undefined`.
- [ ] **CA-04:** la primera llamada a `processSaleAction` conserva exactamente el mismo `billType` que ARCA y el selector.
- [ ] **CA-05:** elegir A, B o C y confirmar sin una segunda selección conserva el valor elegido en el payload.
- [ ] **CA-06:** A→B→C (y cualquier secuencia) deja formulario, contexto y checkout en el último valor, incluso tras rerender.
- [ ] **CA-07:** `removeAll`/reset devuelve formulario, resumen y contexto al default inicial, nunca a Remito ni al tipo anterior.
- [ ] **CA-08:** el primer voucher lookup usa A=1, B=6 y C=11.

## Regresiones

- [ ] **CA-09:** Remito, Presupuesto, edición y `BillingModal` conservan sus contratos y tipos independientes.
- [ ] Error de consulta de negocio: no existe una segunda fuente cliente que cambie el default inicial.
- [ ] El input oculto no contiene un tipo contradictorio (`Factura C` mientras se muestra B).
- [ ] Agregar producto, cambiar precio/descuento/medio de pago y abrir/cerrar el formulario no cambia el tipo seleccionado.
- [ ] No se agregan dependencias, migraciones, secretos ni cambios de esquema.
- [ ] `npm run lint` y `npm run build` deben pasar tras la implementación.

## Criterio de salida

G2 queda aprobado cuando todos los casos anteriores pasan, no hay llamadas ARCA/persistencia con un tipo divergente y las pruebas existentes permanecen verdes.
