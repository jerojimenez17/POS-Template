# QA checklist — `fix-account-ledger-prisma-datasource`

## Fase 2 — tests de configuración versionada y error saneado

Fixtures de pruebas únicamente ficticios. Las pruebas del archivo
`account-ledger-datasource.test.ts` no crean un `PrismaClient`, no usan variables
de entorno ni establecen conexiones. Los checks locales inspeccionan los archivos
versionados y simulan el rechazo de la consulta.

## Verificable localmente (Vitest, sin servicios externos)

- [x] `package.json` fija `prisma` y `@prisma/client` con versiones exactas (sin
  rangos) e iguales.
- [x] `package-lock.json` resuelve `node_modules/prisma` y
  `node_modules/@prisma/client` a esa misma versión exacta, y las declaraciones
  del paquete raíz concuerdan con `package.json`.
- [x] `prisma/schema.prisma` declara `provider = "postgresql"` y
  `url = env("DATABASE_URL")`; `DATABASE_URL_UNPOOLED` se mantiene solo como
  `directUrl`, sin datasource Accelerate.
- [x] `src/lib/db.ts` importa y crea el singleton con `PrismaClient` estándar
  desde `@prisma/client`, sin Accelerate, adapter, URL opcional ni lectura de
  variables de datasource.
- [x] Un rechazo sintético de `getUnpaidOrders` devuelve `success: false`, no
  devuelve `data: []` y expone el código saneado `P6001` en el error público.
- [x] El logger de `getUnpaidOrders` conserva el código `P6001` para diagnóstico,
  pero sus argumentos no incluyen el texto de error ni URL (se valida con un
  fixture ficticio `postgresql://...fixture.invalid/...`).
- [x] Los tests son deterministas, no leen `.env`/secretos ni contactan PostgreSQL,
  Accelerate, producción o cualquier servicio externo.
- [x] Ejecutar `npm run test -- ai/features/fix-account-ledger-prisma-datasource/account-ledger-datasource.test.ts`.
  Resultado local: 1 archivo, 6 tests aprobados. El primer intento excedió el
  timeout de 120 s; el reintento terminó correctamente en 14.26 s.

## Resultados QA local — 25 nov 2026

### Configuración local del workspace

- `npm ls prisma @prisma/client`: **OK**. Árbol instalado alineado en
  `prisma@6.19.3` y `@prisma/client@6.19.3` (incluida la resolución deduplicada
  desde `@auth/prisma-adapter`).
- `npx prisma generate --schema=prisma/schema.prisma`: **OK**. Generó Prisma
  Client v6.19.3 en el workspace actual. Esto no equivale a una instalación
  limpia ni demuestra qué artefacto consume el despliegue.
- Suite completa (`npm run test`): **INCOMPLETA / no aprobada**. El proceso llegó
  al límite de 600 s, no produjo resumen final y mostró fallos en múltiples
  suites y errores `EPERM` al terminar workers. No se infiere un total final ni
  se atribuyen esos fallos a este cambio.
- `npm run lint`: **FALLÓ**, con 49 errores y 21 warnings en `src/` (entre ellos
  reglas ESLint, tipos `any` y errores de hooks/imports en varios archivos).
- `npx tsc --noEmit`: **FALLÓ** con diagnósticos de TypeScript en múltiples
  pruebas existentes, incluidos fixtures Prisma incompatibles, propiedades y
  módulos faltantes y tipos de middleware.
- No se leyó ni registró contenido de `.env`, URLs o secretos. Los tests focalizados
  mockean la acción/consulta y no abren conexiones ni prueban infraestructura.

### Incidencia de instalación limpia

- `npm ci` limpio queda **PENDIENTE**. Según el reporte recibido, falló por
  `EBUSY` en un binario de lightningcss y un segundo intento encontró ausente el
  binario opcional de esbuild. Los checks locales anteriores usan el workspace
  instalado y no sustituyen la repetición en un entorno limpio reparado.

## Requiere instalación limpia / evidencia del artefacto (no lo prueba Vitest)

- [ ] **PENDIENTE — Build reproducible:** en workspace aislado y sin cachés previos, ejecutar
  `npm ci`, `npm ls prisma @prisma/client`,
  `npx prisma generate --schema=prisma/schema.prisma` y `npm run build`; registrar
  solo versiones, revisión y códigos de salida, nunca variables/URLs.
- [ ] **PENDIENTE — artefacto:** confirmar en el artefacto que el schema/client generado procede del schema
  versionado, usa PostgreSQL directo y corresponde a las versiones instaladas.
- [ ] **PENDIENTE — build/arranque:** confirmar que usa el artefacto recién generado, y no un
  output de Prisma/Next cacheado o una revisión anterior.

## Requiere deploy y QA externo (bloqueado localmente)

- [ ] **PENDIENTE — causa raíz runtime:** responsable del despliegue confirma para la misma revisión
  que atiende solicitudes el cliente importado, versión, schema/configuración y
  variable consumida. Reportar únicamente el nombre de variable, presencia o
  ausencia y categoría de esquema `postgresql://`; nunca URL, host, usuario,
  contraseña, parámetros ni secretos.
- [ ] **PENDIENTE — runtime externo:** verificar que no envuelve/reemplaza el singleton con
  Accelerate/adapter y que `DATABASE_URL_UNPOOLED` no es fallback de aplicación.
- [ ] **PENDIENTE — conectividad QA:** probar primera carga paginada de
  `/account-ledger/` y la consulta de `getUnpaidOrders` contra PostgreSQL
  desechable/de QA con credenciales gestionadas fuera del repositorio. Comprobar
  ausencia de P6001, respuesta, autorización, filtros, paginación y aislamiento
  por `businessId`. Nunca ejecutar contra producción.
- [ ] **PENDIENTE — diagnóstico condicional:** si P6001 persiste, detener rollout y registrar evidencia redactada sobre
  revisión, cliente, schema, versiones, mapping de variable y orden/cache del
  build; no sustituir el protocolo ni introducir Accelerate para ocultarlo.
- [ ] **PENDIENTE — fallo de configuración aislado:** para probar URL ausente/incompatible, usar solo QA y
  confirmar que el fallo sigue siendo observable y saneado; no cambiar secretos
  externos durante este paso.

## Regresiones y alcance

- [ ] Revisar que autorización, filtros, estado, búsqueda, límite/cursor y contrato
  de respuesta de ledger no cambien.
- [ ] Confirmar que no se agregó fallback entre `DATABASE_URL`,
  `DATABASE_URL_UNPOOLED` y Accelerate, ni se suprimió el error.
- [ ] Ningún secreto, archivo `.env`, migración, dependencia/configuración de
  Accelerate o dato productivo se modifica.
- [ ] **NO APROBADO — regresión/calidad global:** suite completa agotó el timeout
  y reportó fallos; lint terminó con errores; `npx tsc --noEmit` terminó con
  diagnósticos. No declarar la fase aprobada hasta resolver/verificar estos
  bloqueos y repetir las comprobaciones.
