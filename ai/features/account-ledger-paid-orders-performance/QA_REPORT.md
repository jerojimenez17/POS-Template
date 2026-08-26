# QA Report — account-ledger-paid-orders-performance

**Paso:** 5 — corrección posterior al rechazo del reviewer  
**Fecha:** 2026-08-25  
**Alcance:** revisión y corrección de la implementación; no se modificaron tests ni SPEC/checklist.

## Ejecuciones

| Comando | Resultado |
|---|---|
| `npm run test -- ai/features/account-ledger-paid-orders-performance/account-ledger-paid-orders-performance.test.ts --pool=forks` | **PASS** — 1 archivo, 13/13 tests. |
| `npm run test` | **FAIL/INCONCLUSO** — excedió 180 s y terminó con workers que no pudieron finalizar (`kill EPERM`); se observaron fallos en suites no relacionadas |
| `npx eslint src/actions/unpaid-orders.ts src/app/(protected)/account-ledger/page.tsx` | **FAIL preexistente** — `prefer-const` en las tres declaraciones `let rankingItems` restauradas fuera del alcance de la feature; la página modificada pasa lint. |
| `npx tsc --noEmit` | **INCONCLUSO** — excedió 120 s, sin diagnóstico final |
| `npm run build` | **PASS** — compilación, TypeScript y generación de páginas completadas. |
| `npx prisma validate` | **PASS** — schema PostgreSQL válido. |

La suite completa mostró fallos en componentes y features ajenos: `PrintableTable`, `ProductPrintModal`, `mixed-payment`, `bulkUpdateAmounts`, `budget`, `OrderItemsTable`, configuración de impresión y otros. También falló `tests/unpaid-orders.test.ts`, pero exclusivamente en mutaciones/infraestructura de mocks (`Producto Test no encontrado`, `revalidateTag`, `$executeRaw`), no en la lectura optimizada de ledger. Estos fallos ya se habían observado en la ejecución anterior y se clasifican como **preexistentes/no relacionados** con este cambio; el timeout y `kill EPERM` del pool son problemas del entorno de ejecución.

## Verificación de la corrección solicitada

- Búsqueda textual en `src/app/(protected)/account-ledger`: **no se encontró** `orders.sort` ni otro `.sort(...)` en `OrdersTable`.
- La consulta conserva `orderBy` para favorecer el plan, pero la acción vuelve a ordenar la proyección mínima con `client.name?.toLowerCase() || ""` ascendente, cliente nulo primero, `date desc` e `id asc` determinista. No se delega la semántica observable a la collation/NULL ordering de PostgreSQL.
- `OrdersTable` no filtra ni ordena la colección completa; recibe el resultado ya reducido y ordenado.

## Checklist

| Ítem | Estado | Evidencia |
|---|---|---|
| Estados `pago`, `pendiente`, `inpago`, `pagado` y `all` | **PASS** | Tests enfocados pasan; `getUnpaidOrders` conserva los `where` esperados. |
| Búsqueda relacional, trim e insensibilidad | **PASS** | Test enfocado pasa; usa `client.name.contains` con `mode: insensitive`. |
| Proyección mínima | **PASS** | `select` explícito con solo campos de orden y `client.id/name`; test pasa. |
| Sin `include` completo/N+1 en listado | **PASS** | Test pasa; el `findUnique/include` queda solo en la rama explícita de detalle (`orderId`). |
| Orden por cliente y desempate por fecha | **PASS** | La consulta pide `client.name asc`, `date desc`, `id asc`, el test pasa y ya no existe sort redundante en `OrdersTable`. |
| Autorización multi-tenant | **PASS** | Test pasa: prevalece `session.user.businessId` y sesión ausente devuelve `No autorizado`. |
| Contrato de error | **PASS** | Test de fallo Prisma pasa. |
| Página pasa `search` y no hace `orders.filter` | **PASS** | Test de flujo de datos pasa. |
| Índice en schema y migración | **PASS** | Existe `@@index([businessId, paidStatus, status, date])` y migración versionada no destructiva. |
| Texto de estado vacío/acciones/UI | **NO VERIFICADO** | No existe prueba enfocada de render de `OrdersTable`; inspección conserva el texto y acciones actuales. |
| Search, query navigation, Suspense, refresh y Pusher | **NO VERIFICADO** | Inspección conserva `router.replace`, `Suspense`, `router.refresh()` y suscripción; no hubo prueba de integración. |
| Métricas MA1–MA5 / `EXPLAIN` | **NO VERIFICADO** | La base de datos representativa/medible no está disponible en este entorno; no se inventan p95, payload ni plan `EXPLAIN`. |

## Fallos restantes y clasificación

- **Relacionado con esta feature:** ninguno en la prueba enfocada; sus 13 casos pasan.
- **Preexistente/no relacionado:** fallos de suites de impresión/UI, `mixed-payment`, `bulkUpdateAmounts`, `budget` y mutaciones de `unpaid-orders`, presentes también en la ejecución previa.
- **Entorno:** la suite completa previa no logró finalizar por timeout/`kill EPERM` de workers de Vitest en Windows.
- **Preexistente/no relacionado:** el lint focalizado reporta `prefer-const` en las tres declaraciones `let rankingItems` que se conservaron/restauraron porque no pertenecen a esta feature.
- **Pendiente de verificación, no fallo observado:** métricas MA1–MA5, `EXPLAIN (ANALYZE, BUFFERS)`, payload RSC y pruebas UI/integración.

## Conclusión

**Resultado QA: aprobado para el alcance funcional cubierto por esta feature, sin regresiones relacionadas observadas.** La prueba enfocada pasa y la ordenación final preserva explícitamente la semántica anterior sin cargar sort/filter en `OrdersTable`. La aprobación global del repositorio queda bloqueada por la suite completa incompleta/fallida por problemas preexistentes y de entorno; MA1–MA5 y `EXPLAIN` permanecen sin medir porque no hay una PostgreSQL representativa disponible.
