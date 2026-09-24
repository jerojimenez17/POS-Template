# Checklist QA — reset seguro de BillState

Las pruebas de esta feature son TDD: describen el contrato esperado y deben
mostrar rojo antes de la implementación.

## Reducer / `removeAll`

- [ ] Vacía `products`, `total`, `totalWithDiscount` y `discount`.
- [ ] Vacía CAE (`CAE`, número, vencimiento y QR).
- [ ] Restablece `documentNumber`, `typeDocument`, `nroAsociado` y `entrega` a
      sus valores iniciales.
- [ ] Elimina `id`, cliente y todos sus datos (`client`, `clientId`, condición y
      documento).
- [ ] Restablece pago simple: `pago=false`, `twoMethods=false`, segundo medio
      vacío/`0` y `paidMethod="Efectivo"`.
- [ ] Usa el `defaultBillType` recibido para Factura A, B y C; sin parámetro el
      reducer aislado usa Factura B y el provider usa su default efectivo.
- [ ] Conserva únicamente el `ptoVenta` configurado para el nuevo checkout,
      nunca el del comprobante anterior.
- [ ] No conserva datos accidentales de la venta anterior (`seller` incluido)
      y renueva `date`.

## Formulario

- [ ] `onOrderResetRef.current()` ejecuta `form.reset` con medio Efectivo,
      consumidor final, descuento 0, sin pago dividido, default de tipo y el
      primer punto de venta configurado.
- [ ] El callback baja `editParamters` y actualiza `billTypeRef`.
- [ ] El callback no despacha `setState` ni puede reinyectar productos,
      totales, cliente, descuento, pagos, documento o CAE del snapshot previo.

## Factura AFIP / impresión / concurrencia

- [ ] Solo después de guardado exitoso y CAE válido se crea un único trabajo de
      impresión y un único reset.
- [ ] El trabajo conserva productos, totales, tipo, punto de venta, número y
      CAE tanto para impresión térmica como PDF aunque el contexto ya esté
      vacío.
- [ ] Un reset pendiente queda asociado a una revisión/token de checkout; al
      iniciar una nueva venta se invalida y no borra sus productos, totales,
      cliente, CAE ni tipo.
- [ ] No quedan timers/callbacks pendientes al completar, reemplazar o
      desmontar el provider.
- [ ] Doble clic síncrono en `Confirmar` Factura produce una sola llamada AFIP y
      una sola persistencia.
- [ ] Doble clic síncrono en `Confirmar` Remito produce una sola persistencia y
      no llama a AFIP.
- [ ] La reentrada por teclado, evento duplicado o activación programática
      mientras la promesa está pendiente es un no-op.
- [ ] Un fallo de AFIP o guardado libera el lock, conserva la venta visible y
      permite un reintento explícito sin ejecutar `removeAll`.
- [ ] Cada confirmación que alcanza guardado invoca `processSaleAction` una sola
      vez; el lock se libera al finalizar sin esperar cinco segundos.

## Errores y cancelación

- [ ] Rechazo AFIP, excepción de AFIP, CAE ausente o inválido no limpian.
- [ ] Fallo de guardado, pérdida de conexión o excepción de creación no limpian.
- [ ] Cancelar cualquier modal no guarda, no imprime ni ejecuta `removeAll`.

## Flujos existentes

- [ ] Remito sigue la ruta no AFIP, imprime y limpia una sola vez.
- [ ] Presupuesto imprime el snapshot como Presupuesto y el siguiente checkout
      usa el default del negocio, no Presupuesto.
- [ ] A cuenta conserva selector de cliente, guardado y limpieza sin impresión
      ni AFIP.
- [ ] Edición no activa el reset de nueva venta ni altera la redirección.
- [ ] Suite existente, `npx tsc --noEmit` y `npm run lint` siguen pasando.

## Archivos TDD

- `remove-all.contract.test.ts`
- `form-reset.contract.test.tsx`
- `snapshot-and-reset.contract.test.ts`
- `confirmation-reentrancy.contract.test.tsx`
