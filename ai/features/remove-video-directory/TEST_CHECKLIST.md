# TEST_CHECKLIST — retirar `video/`

## Alcance

- [x] No existe el directorio exacto `video/` en la raíz del repositorio.
- [x] No existe el directorio exacto `ai/features/remotion-showcase-video/`.
- [x] Se conservan `package.json` y `package-lock.json` raíz del POS; ninguno declara dependencias `remotion` ni `@remotion/*`.
- [x] Se conserva la configuración raíz POS: scripts `build`/`lint`, inclusión TypeScript recursiva existente y `next.config.ts`, sin workarounds para vídeo/Remotion.
- [x] El test importa explícitamente `describe`, `it` y `expect` de Vitest, por lo que no depende de globals tipados.
- [x] El ajuste se limita al test focalizado y este checklist; no modifica implementación ni tests ajenos.

## Evidencia

- Prueba focalizada: `ai/features/remove-video-directory/remove-video-directory.test.ts`.
- Las rutas se resuelven desde la raíz del repositorio y se comprueban como rutas completas, no por coincidencias de nombre parciales.
- La prueba compara las dependencias raíz declaradas con las entradas de dependencias del paquete raíz en el lockfile.
- El test focalizado se ejecutó tras las eliminaciones: 5/5 aserciones pasaron.

## Comandos de validación

```bash
npm run test -- ai/features/remove-video-directory/remove-video-directory.test.ts
npx tsc --noEmit
npm run build
```

La prueba focalizada debe pasar después de completar las dos eliminaciones. Para el typecheck y el build, verificar específicamente que no aparezcan errores ni intentos de resolver `@remotion/cli/config` desde `video/`.

## Resultados de esta validación

- `npm run test -- ai/features/remove-video-directory/remove-video-directory.test.ts`: **PASS**, 1 archivo y 5 tests.
- `npx tsc --noEmit`: **FAIL** por errores ajenos a esta feature en tests POS (`src/__tests__/actions/codebar.test.ts`, `getProductsPaginated.test.ts`, `ProductDetail.test.tsx`, `ProductSelectionModal.test.tsx`, `RootMenu.test.tsx`; `tests/actions/arca.test.ts`, `security.test.ts`, `seed-debts.test.ts`, `shortcuts.test.ts`, `voucher.test.ts` y `context/BillReducer.shortcuts.test.ts`). No reporta errores en `ai/features/remove-video-directory/remove-video-directory.test.ts`; en particular, ya no aparecen TS2582/TS2304 para `describe`, `it` ni `expect`.
- `npm run build`: **PASS histórico; reintento de QA inconcluso**. Tras un primer intento que venció a los 120 s luego de “Compiled successfully” y al llegar a “Running TypeScript”, el reintento más largo anterior sí terminó con `npm run build` **PASS**. QA realizó después otro intento: el primero volvió a vencer y el reintento con 300 s fue rechazado por conflicto con otro proceso de Next; ese intento de QA no produjo un resultado final y no invalida ni reemplaza el PASS histórico. En esta revisión se observó un proceso `next dev --turbopack` activo en este repositorio (que comparte `.next`); no se inició otro build para evitar contención ni se detuvo ningún proceso ajeno.
- La comprobación exacta de ambas rutas confirmó que no existen. `git status` y `git diff` no muestran cambios en `package.json`, `package-lock.json`, `tsconfig.json`, `next.config.ts` ni las configuraciones raíz de Vitest; los manifiestos/dependencias raíz se mantienen intactos.

## Cierre de Paso 5

- No se identifican fallos de implementación atribuibles a la retirada: la prueba focalizada informó **5/5 PASS**, y el `tsc` reportado ya no muestra errores en el test de esta feature ni intenta resolver globals de Vitest allí. Los diagnósticos que permanecen pertenecen a tests/fixtures ajenos, según el resultado de QA.
- El build tiene evidencia histórica de **PASS**, pero el intento posterior de QA es **inconcluso** por timeout/conflicto de proceso; no se presenta ese intento como un fallo del código ni como una nueva aprobación. No se reejecutó en esta revisión por el proceso Next activo y el riesgo de contención sobre `.next`.
- No se modificaron tests ni implementación durante este cierre; el único cambio de esta revisión es esta aclaración documental dentro del alcance de retirada.

## Nota sobre bloqueos ajenos

Hay bloqueos de TypeScript en áreas ajenas a esta retirada. Si `npx tsc --noEmit`, el build o lint fallan por problemas ajenos, registrar el error y separarlo de los criterios de esta feature; no corregirlos dentro de este alcance. El test focalizado importa directamente las APIs de Vitest y no añade errores de TypeScript. Un fallo atribuible a Remotion o a `video/` sí es relevante para la aceptación.
