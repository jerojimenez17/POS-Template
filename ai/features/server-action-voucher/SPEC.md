# Corrección de Server Action de numeración de comprobantes

## Estado y alcance

- **Estado:** especificación arquitectónica; no incluye implementación ni pruebas.
- **Alcance:** corregir la compilación de Next.js para que `getVoucherNumberAction` pueda ser importada por el Client Component `BillParametersForm` como una Server Action válida.
- **Fuera de alcance:** cambios en el contrato funcional de numeración, cambios de Prisma, cambios en la autenticación/autorización, refactor de la integración AFIP/ARCA o cambios visuales del formulario.

## Causa raíz

`src/actions/voucher.ts` no declara `"use server"` a nivel de módulo. En cambio, `getVoucherNumberAction` contiene `"use server"` dentro del cuerpo de la función. Esa forma define una inline Server Action.

`src/components/Billing/BillParametersForm.tsx` es un Client Component (`"use client"`) e importa `getVoucherNumberAction` directamente. Next.js no permite que un Client Component importe una inline Server Action definida en otro módulo, por lo que la compilación falla con:

> It is not allowed to define inline use server annotated Server Actions in Client Components.

Además, `voucher.ts` reexporta `parseAfipPointSaleError`, aunque dicha función es lógica pura de dominio y debe permanecer en `src/services/afip/point-sale-validation.ts`. Un módulo de acciones no debe ser el punto de exportación de ese servicio.

## Decisión arquitectónica

Convertir `src/actions/voucher.ts` en un módulo de Server Actions mediante `"use server"` como primera directiva del archivo. `getVoucherNumberAction` seguirá siendo una exportación nombrada del mismo módulo, pero se eliminará la directiva inline de su cuerpo.

`parseAfipPointSaleError` continuará implementada y exportada únicamente desde `src/services/afip/point-sale-validation.ts`. Los consumidores que necesiten el parser deberán importarlo desde el servicio puro, no desde `@/actions/voucher`.

## Requisitos funcionales

### R1. Módulo de Server Actions

- `src/actions/voucher.ts` debe comenzar con la directiva de módulo `"use server"`.
- No debe existir otra directiva `"use server"` dentro del cuerpo de `getVoucherNumberAction`.
- `getVoucherNumberAction` debe conservar su nombre, exportación nombrada, parámetros `(puntoVenta: number, tipoFactura: number)` y resultado observable (`VoucherNumberResult`), salvo ajustes de tipos estrictamente necesarios.
- Deben conservarse autenticación, autorización por rol, validación Zod, consultas Prisma, credenciales exclusivamente server-side y manejo de errores existente.

### R2. Importación desde el cliente

- `BillParametersForm.tsx` debe continuar pudiendo importar `getVoucherNumberAction` desde `@/actions/voucher`.
- La llamada desde el `useEffect` debe conservar su comportamiento y argumentos.
- No se deben mover credenciales, acceso a Prisma, `auth()` ni secretos al cliente.

### R3. Servicio puro de errores AFIP

- Eliminar la reexportación de `parseAfipPointSaleError` desde `src/actions/voucher.ts`.
- Mantener `parseAfipPointSaleError` exportada desde `src/services/afip/point-sale-validation.ts` sin dependencias de Server Actions, Next.js, Prisma, `auth()` o APIs de navegador.
- Actualizar los consumidores que actualmente importan el parser desde `@/actions/voucher` para importar desde `@/services/afip/point-sale-validation`.
- `src/actions/afip.ts` debe conservar una importación directa desde el servicio.

### R4. Compatibilidad

- No cambiar la ruta del módulo ni el nombre de `getVoucherNumberAction`, para mantener compatibilidad con `BillParametersForm`, `src/actions/afip.ts` y los mocks existentes.
- Los tests que sólo importan/mocken `getVoucherNumberAction` deben seguir usando `@/actions/voucher` sin cambios de contrato.
- El test o consumidor que importe `parseAfipPointSaleError` desde `@/actions/voucher` debe migrarse al servicio puro; no se debe restaurar la reexportación como mecanismo de compatibilidad.
- No crear un barrel que vuelva a exponer el parser desde el módulo de acciones.

## Archivos recomendados

### Cambios esperados

- `src/actions/voucher.ts`: agregar `"use server"` al inicio, eliminar la directiva inline y eliminar la reexportación del parser.
- `src/services/afip/point-sale-validation.ts`: conservar el parser y sus tipos como API pura del dominio; modificar sólo si la migración de imports lo requiere.
- `src/components/Billing/BillParametersForm.tsx`: verificar que mantenga el import de la acción y no importe el parser desde el módulo de acciones.
- `src/actions/afip.ts`: verificar imports directos del servicio y compatibilidad con la acción.
- `tests/actions/voucher.test.ts`: conservar el import de la acción y validar el contrato existente; no agregar pruebas en esta entrega.
- `ai/features/afip-point-sale-validation/voucher-11002.test.ts`: migrar el import del parser al servicio puro; no cambiar la lógica bajo prueba.
- Cualquier otro consumidor encontrado por búsqueda de `parseAfipPointSaleError` desde `@/actions/voucher`: migrar al servicio.

### Sin cambios esperados

- `prisma/schema.prisma` y migraciones.
- Variables de entorno y configuración de autenticación.
- Contrato de la API AFIP/ARCA.

## Criterios de aceptación medibles

- **AC-01:** `src/actions/voucher.ts` tiene `"use server"` como primera directiva ejecutable del módulo.
- **AC-02:** una búsqueda del literal `"use server"` en `src/actions/voucher.ts` devuelve exactamente una ocurrencia, ubicada a nivel de módulo y fuera del cuerpo de la función.
- **AC-03:** `npm run build` finaliza correctamente sin el error `It is not allowed to define inline use server annotated Server Actions in Client Components`.
- **AC-04:** `BillParametersForm.tsx` mantiene exactamente un import de `getVoucherNumberAction` desde `@/actions/voucher` y puede invocarla desde el cliente sin convertir la función en código cliente.
- **AC-05:** `parseAfipPointSaleError` no aparece en la lista de exports de `src/actions/voucher.ts` y permanece disponible desde `src/services/afip/point-sale-validation.ts`.
- **AC-06:** no existe ningún import productivo ni de test de `parseAfipPointSaleError` desde `@/actions/voucher`; todos apuntan al servicio puro.
- **AC-07:** los consumidores de `getVoucherNumberAction` conservan el mismo path de importación y la misma forma de llamada, incluyendo `src/actions/afip.ts`, `BillParametersForm.tsx` y los tests existentes.
- **AC-08:** la compilación mantiene `auth()`, Prisma, certificados, keys, tokens y claves internas exclusivamente en el bundle/ejecución server-side; ninguna de esas credenciales se expone al Client Component.
- **AC-09:** la lógica de parseo AFIP, incluidos códigos como `11002`, sigue siendo importable sin depender de Next.js y no cambia su contrato ni sanitización.
- **AC-10:** después de la migración de imports, lint y TypeScript no reportan imports sin resolver ni exports inexistentes.

## Verificación requerida para Developer/QA

1. Buscar todas las referencias a `parseAfipPointSaleError` antes de modificar imports.
2. Confirmar que no existan imports indirectos del parser a través de `@/actions/voucher`.
3. Ejecutar build para validar la frontera Server Action/Client Component.
4. Ejecutar lint y typecheck según los scripts disponibles en el proyecto.
5. Ejecutar la suite existente para confirmar que los mocks de `getVoucherNumberAction` y el parser migrado conservan su comportamiento.
