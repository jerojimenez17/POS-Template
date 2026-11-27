# SPEC: Corregir datasource Prisma al abrir el libro de cuenta

## Descripción y evidencia confirmada

Al cargar `src/app/(protected)/account-ledger/`, la acción `getUnpaidOrders` falla al ejecutar `db.order.findMany()` con Prisma `P6001`:

> Error validating datasource db: the URL must start with the protocol prisma:// or prisma+postgres://

El usuario confirmó que la aplicación debe conectarse **directamente a PostgreSQL** y que la variable de runtime correspondiente tiene esquema `postgresql://`. No se registra ni solicita aquí la URL completa, host, usuario, contraseña, parámetros ni secretos.

La categoría de esquema confirmada contradice el protocolo que el proceso que falla exige. Eso vuelve menos probable que el problema sea simplemente una URL de runtime con el esquema equivocado, pero no demuestra qué cliente, configuración o artefacto está cargado en ese proceso. P6001 sigue siendo un fallo de configuración del datasource/runtime, no evidencia de un error en SQL, datos o modelos del ledger.

## Hallazgos del repositorio

1. `prisma/schema.prisma` declara `provider = "postgresql"`, `url = env("DATABASE_URL")` y `directUrl = env("DATABASE_URL_UNPOOLED")`. Por tanto, el nombre que el schema versionado configura para la URL principal es `DATABASE_URL`; su categoría de esquema runtime reportada es `postgresql://`.
   - `db.order.findMany()` usa el datasource principal (`DATABASE_URL`).
   - `DATABASE_URL_UNPOOLED` está declarada como `directUrl`; no es un fallback automático de runtime ni debe sustituir silenciosamente a `DATABASE_URL` para resolver este fallo.
2. `src/lib/db.ts` importa `PrismaClient` desde `@prisma/client` y crea `new PrismaClient()` sin `accelerateUrl`, extensión `withAccelerate()`, adaptador ni lectura explícita de otra variable.
3. No se encontró `prisma.config.*` ni integración/configuración Accelerate en los archivos revisados. El schema tampoco declara un `engineType` alternativo. Esto describe el repositorio, no prueba qué artefacto está ejecutándose en el despliegue.
4. `package.json` declara rangos, no versiones exactas:
   - `@prisma/client`: `^6.5.0` (dependencia).
   - `prisma`: `^6.19.2` (devDependency).
   El rango caret permite resolver versiones compatibles dentro de la major 6; por sí solo no identifica el paquete que se instaló ni el cliente generado.
5. `package-lock.json` fija actualmente:
   - `node_modules/@prisma/client`: `6.19.2`.
   - `node_modules/prisma`: `6.19.3`.
   - `@prisma/engines` y otros paquetes internos de Prisma observados: `6.19.3`.
   Así que **el lockfile sí determina la resolución local reproducible con `npm ci`, pero hoy deja `@prisma/client` y la CLI en versiones diferentes**. El Client `6.19.3` reportado para el runtime no coincide con `@prisma/client@6.19.2` del lockfile revisado. No es correcto decir que package.json demuestra que el Client efectivo desplegado sea 6.19.3; tampoco queda demostrado que el despliegue haya usado este lockfile.
6. En `package.json`, `postinstall` ejecuta `prisma generate`, `build` ejecuta `next build` y no hay un script de build personalizado que reconfigure Prisma. `next.config.ts` solo define el límite de Server Actions y opciones de imágenes; no configura Prisma. `.next/` y `node_modules/` están excluidos por `.gitignore`, de modo que un cache/build externo podría contener artefactos generados que no se ven en el repositorio. No se encontró workflow raíz de CI/deploy en los paths revisados; el proveedor y sus reglas de cache/build siguen siendo evidencia externa.
7. `src/actions/unpaid-orders.ts` llama al singleton `db` y conserva el fallo como error. No se debe convertir un fallo del datasource en una lista vacía ni alterar el filtro, ámbito o paginación para ocultarlo.

### Respuesta explícita: ¿la versión efectiva está en `package.json`?

No. `package.json` muestra **rangos solicitados** (`@prisma/client: ^6.5.0`, `prisma: ^6.19.2`), no la resolución instalada. Para el árbol reproducible del repositorio, la referencia precisa es `package-lock.json` (Client `6.19.2`, CLI `6.19.3`). Para la versión efectiva de un proceso o despliegue, hay que comprobar los paquetes del artefacto/runtime y el cliente realmente generado/cargado; el manifiesto y lockfile no prueban qué instaló una imagen externa ni qué caché usó.

## Decisión arquitectónica

La ruta requerida es **PostgreSQL directo**. No implementar ni introducir Prisma Accelerate/Data Proxy como alternativa, puente o workaround. No cambiar el `provider` a un proveedor de proxy, no cambiar el esquema URL a ciegas, y no tocar secretos o variables fuera del repositorio.

La configuración versionada y el runtime deben converger en:

- Schema PostgreSQL convencional (`provider = "postgresql"`).
- Cliente Prisma estándar, generado desde el `prisma/schema.prisma` versionado y cargado desde el `@prisma/client` del artefacto.
- URL runtime principal PostgreSQL directa con esquema `postgresql://`, suministrada de forma segura como `DATABASE_URL` según el schema actual.
- `DATABASE_URL_UNPOOLED` permanece separada para su función de `directUrl`; no se usa como fallback de la app.
- `prisma` CLI y `@prisma/client` deben quedar fijados a la misma versión exacta para el build corregido. Actualizar manifest y lockfile conjuntamente; no asumir que la generación por sí sola arregla el modo de conexión.

## Hipótesis comprobables (no causas ya demostradas)

El protocolo runtime informado y el P6001 siguen en contradicción. Antes de considerar el incidente corregido, el diagnóstico debe distinguir como mínimo:

1. **Cliente generado o build stale/inconsistente.** Una generación previa, cache de `node_modules`/`.next`, output de otra revisión o publicación parcial pudo dejar cargado un cliente distinto del schema y dependencias actuales. Comprobar en el artefacto el schema incorporado, versión efectiva de `@prisma/client`, versión de CLI que lo generó, salida exitosa de `prisma generate` y que el proceso ejecuta el build recién generado. No inferirlo solo de que exista el script `postinstall`.
2. **Versiones declaradas, resueltas y runtime distintas.** El lockfile resuelve `@prisma/client@6.19.2` y `prisma@6.19.3`, mientras el reporte runtime indica Client `6.19.3`. Verificar las versiones instaladas en un `npm ci` limpio y en el artefacto real. La discrepancia justifica alinearlas, pero no demuestra por sí sola que origine P6001.
3. **Modo de cliente / generación distinto del esperado.** Aunque los archivos versionados muestran un cliente estándar, una generación desde otro schema/configuración o un cliente extendido/artefacto diferente puede aplicar validación de URL de Accelerate. Inspeccionar el cliente efectivamente importado y su metadata/configuración sin exponer URLs; confirmar que no fue generado o envuelto para requerir Accelerate y que ningún código/runtime alternativo reemplaza el datasource.
4. **Mapeo/ámbito de variable o proceso diferente.** El esquema conocido es `postgresql://`, pero aún se debe corroborar de forma redactada que el proceso que produce P6001 consume `DATABASE_URL` de esa instancia y que no hay otra variable, revisión, servicio, slot o proceso antiguo implicado. Verificar solo nombre, presencia y categoría de esquema; nunca imprimir la URL ni sus componentes.
5. **Caché/orden del build.** `postinstall` llama `prisma generate`, pero no hay evidencia en el repo de cómo el proveedor ejecuta `npm ci`, usa cachés o conserva outputs. Verificar logs redactados del orden de instalación, generación, `next build` y arranque, junto con el identificador de revisión/build ejecutado. Los logs no deben imprimir variables.

Estas hipótesis son compatibles entre sí y deben confirmarse con evidencia del proceso real. No asumir que reemplazar una URL es la corrección: el usuario ya confirmó esquema PostgreSQL y el requisito de conexión directa.

## Ruta de corrección propuesta (sin implementación en este paso)

1. Registrar como decisión cerrada la conexión directa PostgreSQL; conservar la URL como secreto externo y limitar el reporte a nombres/presencia/esquema.
2. En una instalación aislada y reproducible basada en el lockfile corregido, alinear `prisma` y `@prisma/client` a la misma versión exacta, ejecutar `npm ci` y después `npx prisma generate --schema=prisma/schema.prisma`. Capturar únicamente versiones, código de salida y confirmación del provider/esquema generado. La alineación debe modificar `package.json` y `package-lock.json` en el mismo cambio.
3. Construir desde cero sin reutilizar artefactos Prisma/Next previos (`node_modules` y `.next` regenerados), verificando el orden instalación → generación → `next build`. `npm run build` hoy solo invoca `next build`; el gancho `postinstall` es el único paso de generación declarado en `package.json`.
4. Verificar en el runtime/artefacto desplegado que se carga el `@prisma/client` de esa instalación limpia, que schema/client generado usan PostgreSQL directo y que el proceso consume la variable indicada por `prisma/schema.prisma` con categoría `postgresql://`. Contrastar con la versión de build/runtime sin mostrar valores de entorno.
5. Si P6001 persiste aun cuando esos hechos se verifican, detener el rollout y buscar una segunda fuente de cliente/configuración/runtime (por ejemplo proceso antiguo o artefacto/revisión equivocados). No añadir Accelerate ni cambiar secreto/prefijo para hacer desaparecer el mensaje; solicitar evidencia técnica saneada del proveedor/runtime.
6. Validar la consulta contra un PostgreSQL de QA/desechable con credenciales gestionadas fuera del repositorio. No usar producción en las pruebas.

## Requisitos funcionales y técnicos

1. La acción `getUnpaidOrders` debe ejecutar la consulta usando la conexión directa PostgreSQL aprobada.
2. Mantener el contrato PostgreSQL multi-tenant existente, autorización, filtros de negocio, estado, búsqueda y paginación; no cambiar resultados para disfrazar el fallo.
3. Mantener `provider = "postgresql"`, `url = env("DATABASE_URL")` y cliente estándar, salvo que una inspección de artefacto muestre un desvío que deba revertirse a esa configuración versionada.
4. No usar `DATABASE_URL_UNPOOLED` como fallback de runtime, ni agregar variable de Accelerate/adaptador/extensión.
5. Alinear versiones exactas de `prisma` y `@prisma/client` en manifiesto y lockfile para un siguiente cambio de implementación; verificar la identidad de ambas en instalación y artefacto. Que la versión del runtime actual sea 6.19.3 no vuelve reproducible la resolución actual de Client 6.19.2.
6. Mantener los errores operativos observables y sanitizados. No devolver `success: true` con `[]`, suprimir P6001, registrar URL/secretos ni cambiar el protocolo mediante reemplazo de texto.
7. No tocar secretos, variables externas, datos o configuración del proveedor desde este cambio documental. No añadir migraciones, modelos, endpoints ni dependencias de Accelerate.

## Archivos y áreas afectados

### Archivo actualizado en este paso de arquitecto

- `ai/features/fix-account-ledger-prisma-datasource/SPEC.md`

### Inspeccionados; candidatos para un cambio de implementación posterior

- `package.json` — rangos declarados, `postinstall: prisma generate` y `build: next build`.
- `package-lock.json` — versiones resolubles exactas; Client `6.19.2` versus CLI `6.19.3`.
- `prisma/schema.prisma` — provider, URL primaria y `directUrl`.
- `src/lib/db.ts` — import e inicialización del singleton Prisma estándar.
- `src/actions/unpaid-orders.ts` — conservar consulta, contrato y manejo de error.
- `next.config.ts`, `.gitignore` — no se encontró configuración Prisma en Next; `.next` y `node_modules` se excluyen, por lo que sus posibles cachés no quedan verificadas por git.
- Entorno del proveedor/runtime — verificar externamente y de forma redactada; no modificar secretos desde este workspace.

### Sin cambios esperados

- `src/app/(protected)/account-ledger/**` y modelos/migraciones de negocio.
- Esquema/tables de producción, datos, credenciales y configuración secreta.
- Integración Accelerate: fuera de alcance y contraria al requisito confirmado.

## Interfaces y datos

- Sin modelos, tablas, migraciones, contratos de entrada ni respuestas nuevos.
- `getUnpaidOrders` mantiene el tipo/contrato existente y el ámbito de `businessId` autenticado.
- Sin fallback entre `DATABASE_URL`, `DATABASE_URL_UNPOOLED` y un datasource Accelerate.

## Supuestos y límites de evidencia

- Confirmado por el usuario: conexión directa PostgreSQL; esquema de la variable runtime `postgresql://`; el error P6001 observado sigue exigiendo `prisma://` o `prisma+postgres://`.
- No se dispone de la URL completa ni se debe pedir/registrar; tampoco se verificaron secretos, host, usuario, query params o configuración externa del proveedor.
- El schema indica que la URL principal se lee de `DATABASE_URL`; la categoría comunicada no demuestra por sí sola qué proceso o instancia la leyó.
- La versión Client reportada por el runtime es `6.19.3`, pero el lockfile del repo resuelve `@prisma/client@6.19.2` y CLI `prisma@6.19.3`. No se conoce si el proceso desplegado usó otro lockfile, otra revisión, caché o instalación.
- No hay evidencia local disponible del cliente ya generado para esta app ni de la imagen/runtime externa. Los archivos versionados describen intención, no artefacto ejecutado.
- La diferencia de versión y el posible cliente/build stale son hipótesis verificables, no causas confirmadas.

## Criterios de aceptación medibles

1. **CA-1 — Decisión y secreto:** especificación e implementación indican PostgreSQL directo, sin Accelerate. Reportes/logs muestran como máximo variable/presencia y categoría de esquema; no incluyen URL completa, host, usuario, contraseña, query params ni secretos.
2. **CA-2 — Versiones claras:** `package.json` fija versiones exactas iguales para `prisma` y `@prisma/client`; `package-lock.json` resuelve exactamente ambas a la misma versión. `npm ci` más `npm ls prisma @prisma/client` informa esas versiones, sin depender de un rango no bloqueado.
3. **CA-3 — Generación limpia verificable:** tras eliminar/regenerar `node_modules` y `.next` en el workspace de build, `npm ci` y `npx prisma generate --schema=prisma/schema.prisma` terminan correctamente. Se verifica, sin secretos, que el cliente generado corresponde al schema PostgreSQL versionado y a la instalación exacta; el build registra que usa ese output, no un artefacto/cache anterior.
4. **CA-4 — Runtime congruente:** para la misma revisión/build que responde a la petición, se confirma que el proceso importa el cliente generado de ese artefacto, consume la variable configurada por el schema con esquema `postgresql://` y no activa modo Accelerate ni un cliente alternativo. La evidencia debe identificar versión/revisión y estar redactada.
5. **CA-5 — P6001 resuelto en el flujo real:** con el mismo artefacto y configuración equivalente a producción en QA, la primera carga paginada de `/account-ledger/` completa sin P6001 ni exigencia de prefijo Accelerate; `getUnpaidOrders` conserva respuesta, autenticación, filtros y aislamiento por `businessId`.
6. **CA-6 — Fuente de discrepancia registrada:** si el artefacto inicial difiere del lockfile/schema, la revisión de diagnóstico indica cuál hipótesis (cliente generado/build stale, modo/runtime diferente, variable/proceso diferente o cache/orden) se confirmó y qué evidencia redactada la confirma; si no se identifica, no se declara resuelto.
7. **CA-7 — Fallo seguro:** una URL ausente/incompatible en una prueba aislada permanece observable como error, no como lista vacía de éxito; el mensaje/log no revela su valor.
8. **CA-8 — Sin bypass/regresión:** diff y pruebas confirman que no se añadió Accelerate, no se reemplazó esquema de URL a ciegas, no hay fallback de variables, no se suprimió P6001 y no se alteró el contrato/consulta del ledger. Pruebas existentes, lint y `npx tsc --noEmit` pasan.
9. **CA-9 — No exposición externa:** ninguna prueba usa producción ni modifica secretos de proveedor; la integración de conectividad utiliza PostgreSQL desechable/QA y variables configuradas fuera del repositorio.

## Verificación propuesta para QA

- Validar rangos del `package.json` frente a versiones exactas en `package-lock.json`; después de la corrección de dependencias, ejecutar `npm ci`, `npm ls prisma @prisma/client` y `npx prisma generate --schema=prisma/schema.prisma`.
- Confirmar `provider = "postgresql"`, `DATABASE_URL` como URL principal y `DATABASE_URL_UNPOOLED` solo como `directUrl`; revisar `src/lib/db.ts` para garantizar que usa cliente estándar y que no introduce Accelerate/adaptador/fallback.
- Build desde limpio con `npm run build`; guardar código de salida, revisión, versiones y pasos ejecutados, nunca valores de entorno. Confirmar que el runtime arranca desde ese mismo artefacto y no desde cache/revisión anterior.
- Ejecutar tests unitarios de la acción para garantizar que un rechazo de Prisma sigue siendo error y no `{ success: true, data: [] }`; fixtures sintéticos no utilizables y sin secretos reales.
- Probar la primera carga contra PostgreSQL disposable/QA con la categoría de esquema directa confirmada. No usar producción.
- Si persiste P6001, comparar identidad de revisión, cliente cargado, schema generado, versiones y mapeo de variable con evidencia redactada; bloquear el rollout hasta resolver la contradicción. Nunca cambiar a Accelerate como prueba.
