# Nota de compatibilidad: default de venta nueva

El contrato vigente de esta feature establece que `BillProvider` sin
`initialBillType` usa `Factura C`. `Factura B` sólo se obtiene cuando
`/newBill` resuelve `RESPONSABLE_INSCRIPTO` y pasa explícitamente ese tipo al
proveedor y al formulario.

`new-sale-defaults.test.tsx` conserva expectativas anteriores que exigen
`Factura B` para la llamada sin `initialBillType` (incluidos `removeAll` y el
reset del formulario). No existe una solución de producción limpia que
satisfaga ambas expectativas sin hacer que el comportamiento dependa de la
forma en que se monta el componente: la misma entrada debe producir un único
resultado determinista.

Por eso esas aserciones antiguas quedan fuera de contrato; no se modifica el
SPEC ni se introduce un fallback contextual para hacer pasar esa prueba.
