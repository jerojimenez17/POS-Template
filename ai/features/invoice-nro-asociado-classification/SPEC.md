# Clasificación de comprobante por `nroAsociado`

## Estado y alcance

- **Estado:** especificación arquitectónica; esta entrega no implementa cambios ni escribe pruebas.
- **Objetivo:** evitar que el `nroAsociado: 0` predeterminado clasifique una factura normal como Nota de Crédito (NC), sin dejar de detectar una NC cuando existe un número asociado no nulo o cualquier otro indicador explícito de asociación.
- **Alcance mínimo:** corregir únicamente la decisión de clasificación de factura/NC en `src/lib/server/afip-voucher.ts:isCreditNoteState` y conservar las validaciones y flujos que corresponden a cada rama.
- **Fuera de alcance:** cambiar valores iniciales o de reset del estado, editar `BillState` o el snapshot de checkout, modificar UI/UX, cambiar modelos o persistencia, alterar reglas de asociación, modificar autorización/POS/CAE/transportes de ARCA, o cambiar mapeos de comprobantes.
- **Dependencias/esquema:** no se requieren dependencias ni cambios de Prisma o de base de datos.

## Evidencia y causa raíz

- `src/context/BillProvider.tsx` inicia una factura con `nroAsociado: 0` y `src/context/BillReducer.ts` restablece ese campo a `0`.
- `src/utils/billing.ts:createBillCheckoutSnapshot` conserva el valor del estado; por tanto, `0` llega al preflight de servidor y no se convierte en `undefined`.
- `src/lib/server/afip-voucher.ts:isCreditNoteState` hoy trata cualquier valor distinto de `undefined` como indicador de NC. El `0` predeterminado activa la rama NC antes de llamar a ARCA, donde el preflight espera datos válidos de comprobante asociado y termina rechazando una factura normal.
- La selección del código ya distingue operación y tipo: factura A/B/C utiliza respectivamente `1/6/11`; NC A/B/C utiliza `3/8/13`. En particular, Factura B debe seguir usando `6` y NC B `8`.

**Causa raíz:** `undefined` se utiliza implícitamente como único valor de “sin número asociado”, aunque el estado normal usa `0` para representar esa misma ausencia.

## Regla de clasificación normativa

La rama de NC se activa si se cumple **al menos una** de estas condiciones:

1. `nroAsociado` es un número (`typeof value === "number"`) y es distinto de `0` (`value !== 0`). Esta decisión es únicamente clasificación; no declara válido el número.
2. `ptoVentaAsociado !== undefined`.
3. `caeAsociado !== undefined`.
4. `CbtesAsoc` es un arreglo con al menos un elemento.

En consecuencia:

- `nroAsociado === undefined` o `nroAsociado === 0` **no activa por sí solo** la rama NC.
- `-0` equivale a `0` para esta regla y no activa la rama por sí solo.
- Todo valor numérico distinto de cero activa NC, aunque luego sea inválido como número de comprobante: por ejemplo, negativo, fraccionario, no seguro, `NaN` o infinito. Debe rechazarse en la validación existente; no debe degradarse a factura.
- No se deben coaccionar strings, booleanos u otros valores a número para clasificar. Un valor no numérico en `nroAsociado` no activa por sí solo la rama; cualquier otro indicador explícito de asociación sigue siendo evaluado independientemente.
- Los otros tres indicadores de asociación mantienen exactamente su detección actual. Esto preserva la clasificación NC de una asociación parcial real incluso cuando `nroAsociado` es `0` o está ausente.

Una vez clasificada como NC, se mantienen las validaciones existentes de integridad del comprobante asociado y de POS/tipo. En el preflight actual, un `nroAsociado` no positivo o no entero seguro, o un `ptoVentaAsociado` no positivo o no entero seguro, debe producir un error local antes de consultar numeración (`getVoucherNumberForActor`) y antes de iniciar la emisión (`createVoucher`). No se debe reparar, ignorar ni reinterpretar una asociación incompleta como factura.

## Contrato por tipo de comprobante

| Tipo seleccionado | Sin asociación (factura) | Con asociación (NC) |
|---|---:|---:|
| Factura A | `1` | `3` |
| Factura B | `6` | `8` |
| Factura C | `11` | `13` |

La nueva clasificación elige entre las columnas de factura y NC; no cambia el tipo original, el mapeo A/B/C, la lista de códigos soportados, ni el contrato enviado al servicio ARCA.

## Requisitos funcionales

1. Cambiar únicamente la señal de `nroAsociado` para que el cero predeterminado no active NC y cualquier número distinto de cero sí la active.
2. Mantener como señales independientes `ptoVentaAsociado`, `caeAsociado` y `CbtesAsoc` no vacío.
3. Ejecutar la validación existente después de clasificar. Un valor no válido distinto de cero debe entrar a validación NC y fallar ahí, antes de la consulta de numeración/emisión; nunca debe usar código de factura.
4. Para valores `undefined` o `0` y sin otros indicadores de asociación, ejecutar la validación y solicitud de numeración de la rama de factura con el código A/B/C correspondiente.
5. No modificar `nroAsociado: 0` en el provider, reducer o snapshot para resolver el problema: la frontera de servidor debe manejar correctamente el estado actual y mantener compatibilidad con productores que envían `undefined`.

## Casos funcionales requeridos

### Facturas normales A/B/C

- Para cada tipo A, B y C, con `nroAsociado: 0` y sin `ptoVentaAsociado`, `caeAsociado` ni `CbtesAsoc` con elementos, clasificar como factura y usar `1`, `6` y `11`, respectivamente.
- Para cada tipo A, B y C, repetir con `nroAsociado: undefined` (o campo omitido) y sin otros indicadores; el resultado debe seguir siendo factura.
- Una Factura B normal con el valor inicial real `0` debe superar el preflight asociado como factura y pedir numeración con código `6`, no `8`.

### Notas de Crédito completas

- Con un número asociado distinto de cero y datos asociados completos y válidos, clasificar como NC y mantener el mapeo A/B/C existente; para tipo B, solicitar numeración con código `8`.
- Una asociación completa activada por otro indicador debe seguir clasificando como NC aunque `nroAsociado` sea cero o esté ausente.

### Asociación parcial e inválida

- Con `nroAsociado: 0` y sólo `ptoVentaAsociado` definido, clasificar como NC y fallar la validación NC del número; no consultar numeración ni emitir una factura.
- Con `nroAsociado: 0` y sólo `caeAsociado` definido, clasificar como NC y fallar la validación NC por datos numéricos requeridos ausentes; no consultar numeración ni emitir factura.
- Con `nroAsociado: 0` y un `CbtesAsoc` no vacío, clasificar como NC y pasar por validación NC; la asociación no puede convertirse silenciosamente en factura.
- Con un valor numérico distinto de cero que no sea un entero positivo seguro (incluyendo un número negativo o fraccionario; también `NaN`/infinito en una prueba de frontera), clasificar como NC y rechazar localmente por validación, antes de `getVoucherNumberForActor` y `createVoucher`.

## Límites de implementación futura

- **Archivo de producción esperado:** `src/lib/server/afip-voucher.ts`, función privada `isCreditNoteState` y sólo lo estrictamente necesario para preservar el orden de clasificación/validación ya existente.
- **No modificar:** `src/context/BillProvider.tsx`, `src/context/BillReducer.ts`, `src/utils/billing.ts`, `src/models/BillState.ts`, mapeadores A/B/C, validaciones de POS, persistencia, ni endpoint/servicio de ARCA.
- No introducir conversiones de tipo, defaults nuevos, dependencias, cambios de contratos públicos o lógica de base de datos.
- Las pruebas pertenecen a una etapa posterior. Esta entrega sólo define sus escenarios y criterios; no crea ni actualiza archivos de test.

## Criterios de aceptación medibles

1. **Factura B predeterminada:** dado un BillState Factura B con `nroAsociado: 0` y sin los otros tres indicadores, la preparación toma la rama `invoice`, llama a `getVoucherNumberForActor` una vez con tipo `6` y operación `"invoice"`, y no lo llama como `"credit-note"`.
2. **Ausencia opcional:** con el campo omitido/`undefined` y sin otros indicadores, A/B/C usa la rama de factura con códigos `1/6/11` respectivamente.
3. **Matriz A/B/C NC:** con asociación válida y explícita, A/B/C usa la rama NC con códigos `3/8/13` respectivamente; en particular Factura B asociada nunca solicita numeración `6`.
4. **Cualquier número no nulo activa NC:** para valores numéricos representativos distintos de cero (válido, negativo, fraccionario y valores de frontera no finitos), la rama seleccionada es NC. Los valores inválidos fallan antes de `getVoucherNumberForActor` y `createVoucher`.
5. **Señales de asociación preservadas:** con `nroAsociado` en `0` o ausente, cada uno de `ptoVentaAsociado`, `caeAsociado` y `CbtesAsoc` no vacío, evaluado individualmente, selecciona NC y no la rama factura. Si faltan datos numéricos obligatorios, el preflight los rechaza antes de pedir numeración.
6. **Cero sin asociación:** `0` —incluyendo el valor generado por provider/reset— no se considera una asociación ni causa por sí mismo un error de validación NC.
7. **Sin regresiones de contrato:** no se altera el payload ni el tipo de comprobante una vez elegida correctamente la rama; no se agregan conversiones, cambios de esquema, dependencias o cambios a provider/reducer/snapshot.
8. **No emisión ante asociación inválida:** cada fixture de asociación incompleta/numéricamente inválida resulta en un error preflight, cero llamadas a `getVoucherNumberForActor` y cero llamadas a `createVoucher`.

## Ambigüedades analizadas y decisiones

- **¿Cero es ausencia o error?** Se resuelve como ausencia sólo para la señal `nroAsociado`; así se conserva el valor predeterminado ya presente. No invalida una factura normal.
- **¿Todo valor distinto de cero es una NC válida?** No. Todo valor numérico no cero selecciona la rama NC, pero la validación posterior conserva el requisito de número positivo entero seguro. Clasificación y validez son decisiones separadas.
- **¿Debe validarse el tipo de runtime?** Sí. Sólo un valor de tipo `number` distinto de cero activa la señal del campo. No se agregan coerciones para cadenas como `"12"`; BillState declara el campo como `number` opcional.
- **¿Qué sucede con una NC parcial que sólo tenga otros datos asociados?** Los indicadores actuales se conservan como señales de clasificación incluso cuando el número está en `0`/ausente. La validación no debe permitir que esos estados se emitan como factura.
- **¿Se deben normalizar los productores para omitir cero?** No para este alcance. Cambiar provider/reducer/snapshot amplía el arreglo y dejaría expuestos otros productores; la clasificación se corrige en el boundary de servidor.

## Gate G1 — especificación

**Definido.** La causa en la frontera de clasificación, los valores de ausencia frente a asociación, el tratamiento de valores inválidos, los indicadores parciales que deben preservarse, los mapeos A/B/C, el scope mínimo y los resultados observables antes de ARCA están especificados. No se implementó código ni se escribieron pruebas.
