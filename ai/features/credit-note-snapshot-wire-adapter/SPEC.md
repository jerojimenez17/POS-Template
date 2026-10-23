# Credit Note Snapshot Wire Adapter

## Objetivo

Conectar el mapper de payload de Nota de Crédito ya existente a la ruta server de `createCreditNoteAction`, para que el desglose fiscal autorizado que `prepareAfipVoucherForActor` requiere llegue en el formato wire `fiscalBreakdown`. Corregir el rechazo observado con el mensaje `No está disponible un desglose fiscal autorizado válido para la Nota de Crédito` cuando la venta sí tiene un snapshot autorizado válido.

## Alcance

- Único cambio de comportamiento: adaptar el `billState` construido en `src/actions/sales/credit-note.ts` antes de entregarlo a `prepareAfipVoucherForActor`.
- Completar el estado final de Nota de Crédito con `date` ISO válida generada en el servidor para la fecha actual de emisión. Este valor se agrega después de obtener el estado del mapper y antes de pasarlo a `prepareAfipVoucherForActor`; no se toma del cliente ni del comprobante original.
- La línea base para esta feature es el working tree que existía al inicio del bugfix, incluyendo cambios staged/unstaged preexistentes en `src/actions/sales/credit-note.ts`; el comportamiento observable debe preservarse respecto a esa línea base, no compararse contra `HEAD`. No revertir ni reemplazar esos cambios del usuario.
- Reutilizar `buildCreditNoteCreateVoucherPayload` de `src/services/afip/credit-note.ts`; no duplicar su mapeo ni cambiar el contrato del mapper.
- La fuente exclusiva del desglose wire es `order.fiscalSnapshot`, previamente validado por `normalizeAuthorizedFiscalSnapshot` y conservado/normalizado en el `fiscalSnapshot` del estado server.
- Usar el estado de Nota de Crédito retornado por el mapper como entrada de preparación, manteniendo el punto de venta de emisión del preflight. No enviar el objeto exterior de payload a `prepareAfipVoucherForActor`.
- No cambiar el input público/browser, persistencia, esquema Prisma, cálculo de importes, lógica de emisión, ni el contrato de `prepareAfipVoucherForActor`.

Fuera de alcance: modificación de la CF o del cliente de transporte, cambios de UI, reconstrucción fiscal desde productos/precios actuales, emisión parcial, migración de datos y refactors generales de Nota de Crédito.

También están explícitamente fuera de alcance y deben permanecer intactos respecto al working tree inicial: la autorización para `ADMIN`, la selección de cashbox antes de `prepareAfipVoucherForActor`, y el manejo existente de `PENDING`/finalize-local. No cambiar, reordenar, eliminar ni restaurar estas rutas al estado de `HEAD` como parte de esta feature.

## Flujo y límites de confianza

### Regresión observada: fecha ausente en el estado wire

`createCreditNoteAction` usa `buildCreditNoteCreateVoucherPayload` y pasa a `prepareAfipVoucherForActor` el `billState` retornado por el mapper, que no contiene `date`. En `src/lib/server/afip-voucher.ts`, `snapshotCreditNoteBillState` ejecuta `new Date(billState.date).toISOString()`; la fecha ausente produce `RangeError`, que el manejo de errores de preparación convierte en «Los datos de la factura no son válidos para preparar la emisión». El fallo ocurre después de `getVoucherNumberForActor` y antes de `issuePreparedAfipVoucher`/POST `createAFIPVoucher`; por ello no hay log de `CreateVoucher` en CF. La corrección especificada es completar el estado final tras el mapper y antes de `prepareAfipVoucherForActor`, sin cambiar las demás fronteras ni el orden de reserva/emisión.

1. `createCreditNoteAction` obtiene la venta de la base de datos y normaliza su metadata/snapshot autorizado con los datos del comprobante original y el total persistido. Un snapshot ausente, inválido o inconsistente se rechaza con el error existente antes de preparar/reservar.
2. La acción construye el estado canónico con `buildCreditNoteVoucherState`, usando el snapshot normalizado de DB.
3. La acción pasa ese estado al mapper existente `buildCreditNoteCreateVoucherPayload`, suministrando la configuración de tipo y el POS de emisión ya seleccionado. Toma `billState` de su resultado para `prepareAfipVoucherForActor`.
4. El `billState` que devuelve el mapper no incluye `date`. Antes de preparar, la acción lo completa con una fecha ISO válida de emisión, generada en el servidor en ese momento. Así, `snapshotCreditNoteBillState` puede serializarla sin lanzar `RangeError`.
5. `prepareAfipVoucherForActor` conserva la validación autoritativa del wire breakdown: grupo/tipo original y total deben coincidir. Una ausencia o discrepancia debe fallar antes de la emisión; el agregado de `date` no cambia el orden existente de lookup de numeración, reserva/idempotencia ni emisión.
6. Solo un resultado preparado permite continuar al camino existente de reserva/idempotencia y, después, a la emisión externa.

El input `unknown`/browser nunca aporta ni sustituye `fiscalSnapshot` o `fiscalBreakdown`. Aunque incluya campos con esos nombres, se ignoran para esta derivación. No se confía en un breakdown preformado que venga del cliente.

## Contrato del adaptador

El mapper transforma el snapshot canonical normalizado al formato requerido por `prepareAfipVoucherForActor`:

| Snapshot canonical | Wire `fiscalBreakdown` |
| --- | --- |
| `total` | `ImpTotal` |
| `net` | `ImpNeto` |
| `vat` | `ImpIVA` |
| `nonTaxed` | `ImpTotConc` |
| `exempt` | `ImpOpEx` |
| `otherTaxes` | `ImpTrib` |
| Cada `iva: { id, base, amount }` | Cada `Iva: { Id, BaseImp, Importe }` |
| `source`, `version`, `afipVoucherType` | `source`, `version`, `originalAfipVoucherType` |

Se preserva el arreglo IVA del snapshot tal cual y en su orden, sin recalcularlo desde `products`; esto incluye el snapshot actualmente soportado de un grupo para Factura A/B (`Id: 5`). Este cambio solo conecta el snapshot en POS: no amplía la generación de alícuotas ni requiere cambios de catálogo/all rates o de la Cloud Function. Se excluye el snapshot canonical del estado wire final si así lo hace el mapper existente.

Se deben conservar sin alteración los campos de asociación al comprobante original (`billType`, `nroAsociado`, `ptoVentaAsociado`, `caeAsociado`/`CbtesAsoc`), el POS de emisión del preflight, el total de la nota (`total` y `totalWithDiscount` coherentes con el snapshot) y `discount: 0`.

El estado final enviado a preparación también debe incluir `date` en formato ISO válida, representando la fecha actual de emisión generada en servidor. No debe reutilizar una fecha aportada por el cliente ni la fecha del comprobante original. La fecha de emisión es independiente del snapshot fiscal y de la asociación al comprobante original.

Mapeo de tipos AFIP: factura original A/B/C (1/6/11) genera Nota de Crédito A/B/C (3/8/13), respectivamente. La asociación sigue indicando el tipo AFIP de la factura original (1/6/11), no el tipo de Nota de Crédito.

## Compatibilidad y efectos que deben preservarse

- Preservar el comportamiento observable de `createCreditNoteAction` tal como estaba en el working tree inicial del bugfix, incluidos sus cambios staged/unstaged preexistentes; `HEAD` no es la línea base de compatibilidad para esta tarea.
- Mantener autenticación, grants/feature eligibility y chequeos de tenant/negocio existentes.
- Mantener la regla existente de autorización para `ADMIN` sin alterarla.
- Mantener idempotencia y la respuesta para operaciones ya autorizadas o pendientes.
- Mantener la selección/verificación de cashbox antes de `prepareAfipVoucherForActor`, tal como existía en el working tree inicial.
- Mantener sin cambios el manejo existente de `PENDING` y finalize-local.
- Mantener el preflight de billing y la secuencia existente: preparar/validar antes de reservar o reclamar una `SaleReturn`; no mover la reserva, lock ni llamada de emisión.
- Un error de preparación no crea/reclama reserva y no emite. Un snapshot no válido no debe quedar convertido en un estado válido por el mapper.
- No agregar dependencias ni cambiar almacenamiento/datos persistidos.

## Criterios de aceptación

Los siguientes escenarios son testables y todos los grupos A-D forman parte de los criterios de aceptación.

### A. Conexión server y tipos

1. Para una acción con snapshot DB válido de tipo A, B y C, la llamada a `prepareAfipVoucherForActor` recibe `fiscalBreakdown` producido por el mapper y derivado del snapshot DB normalizado.
2. Los tipos de factura original 1/6/11 dan `arca.tipoFactura` de Nota de Crédito 3/8/13, respectivamente; el estado preparado conserva la asociación con el tipo original correspondiente.
3. El estado wire mantiene asociación, POS de emisión configurado por billing preflight, total original/autorizado, `totalWithDiscount` consistente y descuento cero.
4. Envíos con un `fiscalBreakdown` o `fiscalSnapshot` falsificado en el input/browser no alteran el estado wire enviado a preparación; sus importes/grupos coinciden con el snapshot persistido.

### B. Importes y grupos exactos

5. Dado el snapshot autorizado actual de un grupo para Factura A/B, con total 121, neto 100, IVA 21, no gravado 0, exento 0, otros impuestos 0 y grupo `[{ id: 5, base: 100, amount: 21 }]`, el wire contiene exactamente `ImpTotal: 121`, `ImpNeto: 100`, `ImpIVA: 21`, `ImpTotConc: 0`, `ImpOpEx: 0`, `ImpTrib: 0` y `Iva: [{ Id: 5, BaseImp: 100, Importe: 21 }]`, incluidos source/version/tipo original coherentes.
6. El arreglo `Iva` del snapshot se preserva sin omitir, fusionar, recalcular ni reconstruir sus grupos, aunque los precios/productos actuales impliquen valores distintos. Este criterio cubre el snapshot actual de un grupo y no exige ampliar las alícuotas generadas por la Cloud Function.

### C. Rechazos y límite de preparación

7. Snapshot DB ausente, inválido o con total/tipo original inconsistente produce el rechazo fiscal visible existente; no llama a `prepareAfipVoucherForActor`, no crea/reclama reserva y no inicia emisión.
8. Una llamada directa a `prepareAfipVoucherForActor` con breakdown ausente, malformado, de tipo original no coincidente, o con componentes/grupos que no coinciden con el total es rechazada como `issuanceNotStarted`; no llama al lookup `getVoucherNumberForActor` ni al transporte de emisión.
9. Si el mapper/estado resultara inconsistente, el rechazo ocurre antes de reservar/reclamar la `SaleReturn` y antes de cualquier emisión externa. Los caminos existentes de idempotencia y cashbox no se alteran.
10. El flujo solo puede alcanzar la CF/cliente de emisión después de que `prepareAfipVoucherForActor` devuelve un handle preparado. Un fallo fiscal durante `prepare` no invoca la CF.
11. Para una Nota de Crédito elegible, la acción agrega al estado del mapper una `date` ISO válida generada en servidor como fecha actual de emisión y `prepareAfipVoucherForActor` recibe esa fecha. La prueba verifica que recibe una fecha válida; la fecha no procede del input/browser ni del comprobante original, y el preflight no falla con el `RangeError` convertido en «Los datos de la factura no son válidos para preparar la emisión» por ausencia de `date`.
12. Añadir `date` no modifica el snapshot/breakdown fiscal ni los campos de asociación al comprobante original, y no reordena el lookup de numeración, la reserva/idempotencia ni la emisión.

### D. Límite del diff y preservación del working tree

13. Al comparar el diff propio de esta feature con el working tree inicial del bugfix (no con `HEAD`), los cambios funcionales en `src/actions/sales/credit-note.ts` se limitan a mapear el snapshot fiscal normalizado de DB al breakdown wire con `buildCreditNoteCreateVoucherPayload`, completar el estado mapeado con la fecha de emisión de servidor y pasar ese estado a `prepareAfipVoucherForActor`.
14. El resto de `createCreditNoteAction` permanece intacto respecto al working tree inicial: en particular, autorización `ADMIN`, selección de cashbox antes de `prepareAfipVoucherForActor` y manejo de `PENDING`/finalize-local conservan su orden y comportamiento observable. No se revierte ni se reescribe código preexistente para igualarlo con `HEAD`.

## Limitación / confirmación de usuario

Esta especificación cubre conectar el adaptador y validar la frontera de preparación; no certifica una autorización AFIP/CF exitosa. La CF no se invoca hasta que la preparación haya validado el estado y devuelto el handle preparado. La acción debe continuar exponiendo el mensaje de error fiscal visible observado; la confirmación de que la UI lo presenta al usuario corresponde a confirmación manual del usuario, no a un cambio de UI incluido aquí.

## Archivos involucrados

- Modificar en implementación: `src/actions/sales/credit-note.ts` (conexión del mapper al estado enviado a preparación).
- Reutilización, sin modificación prevista: `src/services/afip/credit-note.ts` (`buildCreditNoteCreateVoucherPayload`).
- Frontera a verificar, sin cambio previsto: `src/lib/server/afip-voucher.ts` (`prepareAfipVoucherForActor`).
- Añadir pruebas en el paso QA/TDD; esta especificación no implementa pruebas.

## Decisiones

- Sin cambio de API ni schema: el breakdown wire y la fecha de emisión agregada al estado final son valores efímeros generados en servidor, no datos nuevos persistidos.
- El mapper existente es la única traducción canonical → wire; cualquier rechazo de normalización/validación sigue siendo fail-closed.
- El alcance se limita a esta ruta server y no debe ampliar ni reordenar la reserva/idempotencia/emisión.
