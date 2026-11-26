# SPEC: retirar el subproyecto Remotion `video/`

## 1. Objetivo

Retirar del repositorio el subproyecto independiente de Remotion ubicado exactamente en la raíz como `video/`. El motivo inmediato es que el `tsconfig.json` raíz incluye `**/*.ts` y `**/*.tsx` y excluye solamente `node_modules`; por ello TypeScript/Next puede inspeccionar `video/remotion.config.ts`, cuyo import `@remotion/cli/config` no resuelve en las dependencias de la aplicación POS.

El resultado debe dejar de incluir el subproyecto, sus salidas y documentación/tests dedicados, sin cambiar el funcionamiento, dependencias ni configuración propia del POS. No se debe resolver el error instalando Remotion en la aplicación, ni ocultando el problema con una exclusión amplia del `tsconfig`.

## 2. Inventario inspeccionado e impacto

### 2.1 Contenido de `video/`

Archivos de primer nivel observados:

- `video/.gitignore`
- `video/.prettierrc`
- `video/README.md`
- `video/eslint.config.mjs`
- `video/package.json`
- `video/package-lock.json`
- `video/remotion.config.ts`
- `video/studio.log` (artefacto local ignorado)
- `video/tsconfig.json`

Código de composición:

- `video/src/index.ts`, `video/src/Root.tsx`, `video/src/Showcase.tsx`
- `video/src/scenes/AccountLedgerScene.tsx`
- `video/src/scenes/BrandReveal.tsx`
- `video/src/scenes/CatalogScene.tsx`
- `video/src/scenes/CheckoutScene.tsx`
- `video/src/scenes/ClosingScene.tsx`
- `video/src/scenes/InventoryScene.tsx`
- `video/src/scenes/OperationsScene.tsx`

Asset y entregables observados:

- `video/public/LOGO.png` (asset local usado por el vídeo; no se encontró referencia desde el POS).
- `video/out/stock-ia-showcase.mp4`.
- `video/out/inspection/final-inventory.png` y `video/out/inspection/element-0060.png`, `element-0250.png`, `element-0300.png`, `element-0540.png`, `element-0600.png`, `element-0780.png`, `element-0840.png`, `element-1000.png`, `element-1050.png`, `element-1100.png`, `element-1380.png` y `element-1560.png`.
- Existe además `video/node_modules/`, ignorado por Git, como instalación local del proyecto de vídeo. La enumeración anterior es el inventario de archivos del proyecto y salidas visibles; el borrado recursivo de `video/` también retira los archivos ignorados/generados que sigan allí.

`video/package.json` declara como dependencias `@remotion/cli`, `remotion`, `react` y `react-dom`, y ofrece los scripts locales `studio`, `render`, `bundle` y `lint`. Son dependencias y comandos propios del subproyecto, no del manifiesto raíz.

### 2.2 Relación con Next.js y TypeScript

- `tsconfig.json` raíz tiene inclusiones recursivas `**/*.ts` y `**/*.tsx`, y solo excluye `node_modules`. Eso hace que `video/remotion.config.ts` forme parte del alcance de tipado raíz, aun cuando `video/tsconfig.json` tenga una configuración separada y excluya ese mismo archivo en el proyecto local.
- `video/remotion.config.ts` importa `Config` desde `@remotion/cli/config`; el paquete está declarado en `video/package.json`, no en el `package.json` raíz.
- `next.config.ts` no contiene referencias a `video/`, ni `include`/`exclude` de Next apuntan explícitamente al directorio. La causa identificada es la inclusión amplia del TypeScript raíz.
- Los scripts raíz `build`, `dev`, `start` y `lint` no invocan Remotion. El `build` raíz es `next build`; el lint raíz apunta a `eslint src/`.
- El `package.json` y `package-lock.json` raíz no declaran paquetes `remotion` o `@remotion/*`. La búsqueda del código runtime `src/` tampoco encontró importaciones Remotion ni referencias al proyecto de vídeo.

### 2.3 Referencias documentales y pruebas

- `video/README.md` documenta la instalación, preview/render local, escenas y salida del showcase; se retira junto con `video/`.
- No se encontró una mención o enlace a `video/` o al MP4 en el `README.md` raíz. Ese README debe permanecer sin cambios.
- `ai/features/remotion-showcase-video/` contiene exclusivamente `SPEC.md`, `TEST_CHECKLIST.md` y `remotion-showcase-video.test.ts`. Los tres describen o validan los archivos/rutas de vídeo; el test espera el README, el MP4, el logo y los fuentes dentro de `video/`, por lo que quedaría obsoleto y fallaría al retirar el proyecto. Retirar esos tres archivos/la carpeta de feature como parte de esta operación.
- No mover el logo ni los PNG/MP4 a `public/`, `src/` u otra carpeta: no hay evidencia de que sean assets de runtime del POS. El material pertenece al entregable Remotion que se retira.

## 3. Alcance de implementación

### En alcance

1. Eliminar recursivamente el directorio exacto `video/` de la raíz, incluyendo fuentes, configuraciones, manifiesto y lockfile del subproyecto, documentación, logo, MP4, imágenes de inspección y residuos locales ignorados que estén dentro de él.
2. Eliminar `ai/features/remotion-showcase-video/` completo, compuesto por los tres archivos enumerados arriba, para no conservar criterios y pruebas que prometan un entregable ya retirado.
3. Mantener intactos los manifiestos y lockfiles raíz, el `tsconfig.json` raíz, `next.config.ts`, scripts raíz y todo el código/configuración/datos de la aplicación POS. La ausencia del directorio, no un cambio de configuración global, debe quitar esos fuentes del alcance recursivo de TypeScript.

### Fuera de alcance e invariantes

- No editar ni borrar el directorio `README.md` raíz ni la documentación general del POS; el README raíz no contiene enlace al vídeo.
- No modificar `package.json` raíz, `package-lock.json` raíz, dependencias, scripts, Prisma, autenticación, rutas, componentes, servicios, APIs, datos o assets del POS.
- No añadir `@remotion/cli`, `remotion` u otros paquetes Remotion a la raíz.
- No cambiar el `include`/`exclude` de `tsconfig.json` raíz, `next.config.ts` ni crear configuraciones alternativas para silenciar la inspección.
- No borrar ni modificar otras rutas con el nombre `video`, `videos`, `remotion` o `showcase` fuera de las rutas exactas señaladas. No aplicar borrados por búsqueda textual o patrón global.
- No borrar `node_modules/` raíz ni dependencias compartidas. Aunque los paquetes de Remotion existan bajo `video/node_modules/`, son instalación local anidada y desaparecen solo con el directorio exacto `video/`.
- No borrar otras features o pruebas bajo `ai/features/`; únicamente `ai/features/remotion-showcase-video/` está dedicada a este entregable.
- No conservar ni reubicar el MP4, capturas, logo o README del subproyecto en una ruta nueva.

## 4. Operaciones de eliminación requeridas

La implementación debe eliminar estas dos rutas completas y nada más por efecto de este cambio:

1. `video/` — directorio raíz completo; incluye los archivos y subdirectorios descritos en 2.1 y también cualquier contenido ignorado/generado todavía presente allí.
2. `ai/features/remotion-showcase-video/` — carpeta completa, exactamente estos archivos: `SPEC.md`, `TEST_CHECKLIST.md` y `remotion-showcase-video.test.ts`.

No hay migración, reemplazo ni copia de assets prevista. Las únicas referencias a retirarse son las contenidas en los dos directorios anteriores. El README raíz y las configuraciones generales se conservan sin cambios.

## 5. Criterios de aceptación medibles

- **AC1 — Directorios retirados:** después del cambio no existe `video/` en la raíz ni `ai/features/remotion-showcase-video/`.
- **AC2 — Ningún archivo del proyecto Remotion queda suelto:** no quedan en otra ruta los fuentes/composición Remotion, `remotion.config.ts`, manifiesto/lockfile de vídeo, logo, MP4, PNGs de inspección ni README local enumerados en 2.1.
- **AC3 — Sin referencias activas obsoletas:** una búsqueda del repositorio excluyendo `.git`, dependencias y artefactos de build no encuentra referencias ejecutables/documentales a `video/`, `stock-ia-showcase` o `ai/features/remotion-showcase-video`. Menciones incidentales dentro del nuevo SPEC de retirada son permitidas.
- **AC4 — Sin dependencia compartida añadida o eliminada:** `package.json` y `package-lock.json` raíz permanecen sin cambios y no contienen dependencias Remotion. `node_modules/` raíz no se toca.
- **AC5 — Configuración de Next/TypeScript preservada:** `tsconfig.json` raíz y `next.config.ts` permanecen sin cambios; el motivo por el que desaparece `video/remotion.config.ts` del alcance es que el archivo ya no existe.
- **AC6 — Integridad POS:** no hay cambios fuera de los dos directorios en alcance. El código fuente POS, assets POS, datos, Prisma, scripts, configuración y README raíz son idénticos antes/después.
- **AC7 — Build y tipado sin el archivo causante:** `npx tsc --noEmit` y `npm run build` no intentan resolver `@remotion/cli/config` ni reportan errores bajo `video/`. Deben completarse sin errores atribuibles a Remotion; cualquier fallo independiente preexistente de entorno o de POS se reporta por separado y no se corrige dentro de este alcance.
- **AC8 — No hay borrado por nombre parecido:** revisión de cambios confirma que no se eliminó ni alteró ninguna otra ruta llamada `video`, `videos`, `remotion` o `showcase` aparte de los dos directorios exactos descritos en sección 4.

## 6. Validación y handoff

1. Revisar el diff y confirmar que las eliminaciones están limitadas a `video/` y `ai/features/remotion-showcase-video/`.
2. Confirmar que los manifiestos raíz, configuración Next/TypeScript, README raíz y fuentes POS no tienen cambios.
3. Ejecutar `npx tsc --noEmit` y `npm run build`; registrar el resultado de cada comando y distinguir fallos ajenos a la retirada.
4. Buscar las referencias obsoletas según AC3 y confirmar que no se instaló ni eliminó ninguna dependencia raíz.

Este cambio retira el showcase audiovisual; no produce una versión nueva del vídeo ni conserva una copia de archivo dentro del repositorio.
