# QA checklist — credit-note-snapshot-wire-adapter

Fuente normativa: [`SPEC.md`](./SPEC.md). Los tests invocan `createCreditNoteAction` con DB, autenticación, billing preflight y la frontera AFIP mockeados. `prepareAfipVoucherForActor` captura su primer argumento y devuelve `issuanceNotStarted`, aislando el estado real enviado antes de lookup, reserva o emisión.

## Cobertura verificada

- [x] Factura A: snapshot autorizado desde DB, tipo original 1 asociado y tipo NC 3 usado por billing preflight.
- [x] Factura B: snapshot autorizado desde DB, tipo original 6 asociado y tipo NC 8 usado por billing preflight.
- [x] Factura C: snapshot canónico de Factura C, tipo original 11 asociado y tipo NC 13 usado por billing preflight.
- [x] Para los snapshots A/B de un grupo: wire exacto `source`, `version`, `originalAfipVoucherType`, `ImpTotal: 121`, `ImpNeto: 100`, `ImpIVA: 21`, `ImpTotConc: 0`, `ImpOpEx: 0`, `ImpTrib: 0`, `Iva: [{ Id: 5, BaseImp: 100, Importe: 21 }]`.
- [x] Snapshot y breakdown del caller no toman autoridad: la captura usa los datos persistidos. Las propiedades extra serializables del input público son rechazadas por el schema estricto antes de prepare.
- [x] Estado capturado conserva POS de emisión 9, POS original 42, número original 73, asociación `CbtesAsoc` con tipo original, total y `totalWithDiscount` 121, descuento cero y CAE original.
- [x] Preflight `prepare` fallido no causa lookup de numeración, issue, `$transaction`, creación, actualización ni reclamación de `SaleReturn`.
- [x] Snapshot DB ausente e inválido se rechazan antes de prepare, lookup, reserva o emisión.
- [x] Para Factura A/B/C, un snapshot persistido cuyo total no coincide con `order.total` se rechaza como `NOT_ELIGIBLE` antes de prepare, billing preflight, lookup de numeración, transacción, efectos de `SaleReturn` o issue.
- [x] Para Factura A/B/C, metadata persistida con `afipVoucherType` original que contradice `billType` se rechaza como `NOT_ELIGIBLE` antes de prepare, billing preflight, lookup de numeración, transacción, efectos de `SaleReturn` o issue.
- [x] Los tres casos de total inconsistente (snapshot total 121 frente a `order.total` 120, para A/B/C) verifican ausencia de llamadas a prepare, preflight, lookup, issue, transacción y operaciones de `SaleReturn`.
- [x] Los tres casos de tipo original inconsistente (A/B/C, `afipVoucherType` que contradice `billType`) verifican el mismo rechazo previo a billing y a cualquier efecto de emisión/reserva.
- [x] Follow-up de fecha (A/B/C): con fake timers y system time fijo, fixture de venta fechado `2024-01-01`, `prepare` recibe una `date` ISO válida igual al momento actual del servidor (distinta de la fecha original de la venta, no `undefined`) y permanecen intactos `fiscalBreakdown`, `CbtesAsoc` y `ptoVenta`.

## Nota sobre el fixture C

Fixture de contrato actualizado: un snapshot canónico válido de Factura C debe tener IVA cero y `iva: []`. A/B usan total 121, neto 100, IVA 21 y grupo ID 5; C usa total/neto 121, IVA 0 y `iva: []`, con el wire esperado `ImpTotal: 121`, `ImpNeto: 121`, `ImpIVA: 0` e `Iva: []`. Reutilizar el fixture A/B para C lo haría inválido según `normalizeAuthorizedFiscalSnapshot` y no probaría una ruta válida C.

## Resultado de ejecución

- Suites focalizadas de Nota de Crédito: 72/72 tests pasados (resultado focalizado previo comunicado para Step 4; no se repitieron aquí).
- Antes del follow-up de fecha, `action-wire-adapter.test.ts` tenía 12 casos: A/B/C, input caller falsificado, snapshot ausente/inválido, total discrepante para A/B/C y tipo original contradictorio para A/B/C.
- Paso 2 TDD (follow-up de fecha): `npm run test -- ai/features/credit-note-snapshot-wire-adapter/action-wire-adapter.test.ts` compila y queda RED intencional: 12 tests pasan y los 3 nuevos casos A/B/C fallan porque `billState.date` es `undefined` (esperado: string ISO del server time fijo). Cada caso se detiene en `prepare` con `issuanceNotStarted`; no alcanza lookup/reserva/emisión. `afterEach` restaura fake timers.
- Suite completa ejecutada una vez con `npm run test`, desde la raíz del repositorio. El output capturado muestra fallos en distintas suites; por ejemplo, `round-excel-prices.test.ts` (9), `seed-debts.test.ts` (5), `PrintableTable.test.tsx` (11), `PrintableTable.barcode.test.tsx` (11), `afip-no-cae-response.test.ts` (25) y otras. El output disponible está truncado y no expone el resumen final agregado, por lo que no se registra un total ni se atribuyen causas. Resultado: known failures observados; no es un pase de suite completa.
- QA final: `action-wire-adapter.test.ts` 15/15 y suites focalizadas de Nota de Crédito 75/75 pasaron; ESLint focalizado pasa. `npx tsc --noEmit` falla por errores en tests ajenos a esta feature, ya conocidos.
- Para los tests de esta feature, DB, autenticación, billing preflight y frontera AFIP se mockean; `prepare` se detiene antes de lookup/reserva/emisión. No prueban Prisma real ni una emisión remota.
