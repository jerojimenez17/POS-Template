# SPEC: Rendimiento del listado de órdenes pagadas en Cuenta Corriente

## 1. Resumen

### 1.1 Problema

`src/app/(protected)/account-ledger/page.tsx` renderiza `OrdersTable` como Server Component y, para cada cambio de estado, llama a `getUnpaidOrders` en `src/actions/unpaid-orders.ts`. Para el filtro `pago`, la consulta actual:

- ejecuta `findMany` sin `take`/paginación;
- incluye el objeto `client` completo aunque la tabla solo usa `id`, `name` y algunos campos de la orden;
- ordena por `date` en PostgreSQL, pero filtra por nombre de cliente y reordena toda la colección en memoria en el servidor;
- realiza una segunda `auth()` dentro de la Server Action, después de la `auth()` de la página.

El filtro pagado suele ser el conjunto más grande del libro. Por tanto, el coste crece con todas las órdenes pagadas del negocio, el volumen serializado hacia RSC y la ordenación en memoria. El índice existente `Order(businessId, date)` no está alineado con el predicado principal `businessId + paidStatus`.

### 1.2 Objetivo

Reducir de forma medible el tiempo y el volumen de datos del listado pagado, conservando la UI y el comportamiento funcional actuales: mismos filtros, mismas órdenes visibles, mismo orden alfabético por cliente, mismas acciones y mismas reglas multi-tenant.

### 1.3 Alcance

- Optimizar la lectura usada exclusivamente por el listado del ledger.
- Aplicar búsqueda de cliente en PostgreSQL en lugar de traer y filtrar todas las filas.
- Proyectar solamente los campos consumidos por la tabla.
- Añadir un índice compuesto apropiado para las consultas de ledger.
- Medir consulta, respuesta RSC y tiempo de interacción al cambiar a `Pagados`.

### 1.4 No objetivos

- No cambiar el significado de `pendiente`, `inpago`, `pago`, `all` ni el fallback de estado actual.
- No añadir paginación visible, infinite scroll ni cambiar el número de filas mostradas en esta iteración.
- No modificar la página de detalle `/account-ledger/[id]`, pagos, cancelaciones, Pusher ni la lógica de mutación.
- No cambiar el diseño visual ni introducir dependencias npm.
- No usar caché con datos potencialmente obsoletos para ocultar el problema; la actualización en tiempo real debe conservarse.

## 2. Diagnóstico y línea base

### 2.1 Cuello de botella identificado

El camino crítico es `AccountLedgerPage → OrdersTable → getUnpaidOrders → db.order.findMany`. El `where` del filtro pagado combina `businessId`, `paidStatus: pago` y `status: { not: pendiente }`, pero la consulta no limita columnas ni filas. Después, `OrdersTable` hace `filter` y `sort` sobre el resultado completo. La inclusión completa de `Client` aumenta lectura, serialización y memoria sin aportar datos a la tabla.

La implementación debe confirmar el diagnóstico con observabilidad temporal, no solo con inspección estática:

1. Medir el tiempo de `auth`, consulta Prisma, transformación/ordenación y render del listado.
2. Registrar temporalmente (sin datos personales) cantidad de filas, bytes aproximados de payload y duración.
3. Comparar `EXPLAIN (ANALYZE, BUFFERS)` de la consulta pagada antes y después del índice.

### 2.2 Métricas de aceptación

Con un dataset representativo de al menos 10.000 órdenes del negocio, 5.000 pagadas y una base de datos PostgreSQL equivalente a producción:

- **MA1 — base de datos:** p95 de la lectura pagada completa debe ser `<= 250 ms` o mejorar al menos `50%` respecto de la línea base, lo que sea más exigente.
- **MA2 — servidor:** p95 desde entrada a `OrdersTable` hasta datos listos para render debe ser `<= 500 ms` o mejorar al menos `40%`.
- **MA3 — navegador/RSC:** el payload específico del listado debe reducirse al menos `40%` respecto de la línea base; no se deben enviar campos de `Client` no utilizados.
- **MA4 — interacción:** p95 desde seleccionar `Pagados` hasta que la tabla está actualizada debe ser `<= 1.5 s` en entorno de staging, excluyendo latencia de red artificial.
- **MA5 — plan:** `EXPLAIN` debe demostrar uso del índice compuesto o un plan equivalente que no haga un sequential scan innecesario sobre todas las órdenes del negocio.

Si la medición inicial ya está por debajo de un umbral, se conserva como requisito mínimo una reducción de al menos 40% en lectura/payload y ausencia de regresión superior al 10% en los otros estados.

## 3. Requisitos funcionales y técnicos

### 3.1 Consulta del ledger

- RF1: Mantener la autorización por `businessId` derivado de la sesión. Nunca confiar exclusivamente en un `businessId` enviado por el cliente.
- RF2: Mantener las reglas actuales: `pendiente` filtra `status = pendiente`; los demás estados excluyen `status = pendiente`; `pago` se traduce a `PaidStatus.pago`; `all` no aplica `paidStatus`.
- RF3: Aplicar `search` en Prisma sobre la relación `client.name` con comparación insensible a mayúsculas, equivalente al `toLowerCase().includes()` actual.
- RF4: Usar `select` explícito para la orden: `id`, `date`, `total`, `status`, `paidStatus`, `clientId`, `notes`, y el cliente `{ id, name }`.
- RF5: Mantener la ordenación observable por nombre de cliente ascendente, tratando cliente inexistente como nombre vacío. Para empates, preservar el orden actual por `date desc` mediante un criterio secundario determinista compatible.
- RF6: Evitar `include: { client: true }` en el camino de listado. El detalle puede seguir usando su propia consulta completa.
- RF7: Mantener el contrato de `ActionResult` y los mensajes de error existentes salvo que sea necesario tiparlo de forma más precisa.
- RF8: No utilizar `findUnique`/consulta de detalle en el listado ni provocar N+1.

### 3.2 Índice

- RF9: Añadir un índice compuesto en `Order` alineado con el acceso más frecuente, como mínimo `[businessId, paidStatus, status, date]`, validando el plan real con PostgreSQL antes de cerrar la migración.
- RF10: Conservar `@@index([businessId, date])` porque otros caminos pueden depender de él; eliminar índices solo con evidencia de que no tienen otros consumidores.
- RF11: Crear una migración Prisma versionada y segura para PostgreSQL. En producción grande, documentar si debe ejecutarse de forma concurrente (`CREATE INDEX CONCURRENTLY`) y cualquier requisito operativo; no ejecutar una migración destructiva.

### 3.3 Render y navegación

- RF12: Mantener `searchParams`, `router.replace`, `router.refresh`, Suspense, enlaces de acciones y rutas actuales.
- RF13: Mantener el estado inicial por defecto `inpago` y la actualización por Pusher.
- RF14: No cambiar el texto de estados vacíos ni la presentación de columnas.
- RF15: Si se elimina la ordenación JavaScript, la consulta debe producir exactamente el mismo orden visible, incluidos clientes nulos y nombres empatados; si Prisma no permite esa semántica de forma fiable, conservar una ordenación final sobre el conjunto ya reducido.

## 4. Interfaces y datos

### 4.1 Entrada de lectura

```typescript
interface GetUnpaidOrdersInput {
  businessId: string; // fallback legado; la sesión tiene precedencia
  status?: "all" | "inpago" | "pago" | "pagado" | "pendiente" | "cancelado" | string;
  orderId?: string;
  search?: string;
}
```

El tipo final debe seguir la convención existente y no romper callers actuales. `search` se incorpora al input para que el filtrado ocurra en la base de datos. `orderId` conserva su camino de detalle y no debe recibir la proyección del listado si necesita sus relaciones actuales.

### 4.2 Salida mínima del listado

```typescript
interface AccountLedgerOrder {
  id: string;
  date: Date;
  total: number;
  status: string;
  paidStatus: string;
  clientId: string | null;
  client: { id: string; name: string | null } | null;
  notes: string | null;
}
```

La implementación puede exponer el tipo Prisma inferido mediante `Prisma.OrderGetPayload`, pero no debe devolver propiedades adicionales del cliente por accidente.

### 4.3 Compatibilidad de consultas

La página debe pasar `search` a `getUnpaidOrders`; ya no debe filtrar el array por nombre después de la consulta. La rama `orderId` conserva sus relaciones (`client`, `cashMovements`) y su comportamiento actual.

## 5. Escenarios edge

| Escenario | Resultado esperado |
|---|---|
| Cero órdenes pagadas | Mensaje existente “No se encontraron órdenes”; no error. |
| Búsqueda vacía o espacios | Equivalente a no aplicar búsqueda, sin filtro accidental por espacios. |
| Nombre con acentos/mayúsculas | Coincidencia insensible equivalente al comportamiento actual de JavaScript/DB configurada. |
| Cliente nulo | Sigue apareciendo como “Sin cliente” y participa como nombre vacío en el orden. |
| Nombres iguales | Orden estable/determinista compatible con `date desc` previo. |
| Estado `all` | Misma exclusión de órdenes `pendiente` que la implementación actual. |
| Cambio rápido entre tabs | Cada navegación muestra únicamente su resultado; no reutilizar respuesta de otro estado. |
| Evento Pusher durante carga | `router.refresh()` sigue funcionando sin suscripciones duplicadas ni N+1. |
| Usuario sin sesión/business | Redirección o error existente, sin permitir acceso por `input.businessId`. |
| Error de DB/índice no disponible | Se conserva `ActionResult` de error y logging seguro; no se exponen credenciales ni SQL con datos sensibles. |
| Dataset pequeño | No debe cambiar el número, contenido ni orden de filas. |

## 6. Archivos previstos

### Modificar

| Archivo | Cambio previsto |
|---|---|
| `src/app/(protected)/account-ledger/page.tsx` | Pasar `search` a la lectura y eliminar el filtrado/ordenación redundante solo cuando la consulta garantice el mismo resultado; conservar UI y estados. |
| `src/actions/unpaid-orders.ts` | Ampliar el input de lectura, aplicar búsqueda relacional, `select` mínimo y ordenación/transformación compatible; mantener auth y contrato de errores. |
| `prisma/schema.prisma` | Declarar el índice compuesto de `Order`, sujeto a validación del plan. |
| `prisma/migrations/<timestamp>_optimize_account_ledger_paid_orders/migration.sql` | Crear el índice de forma versionada y segura para PostgreSQL. |

### Verificar, sin cambio esperado

| Archivo | Motivo |
|---|---|
| `src/app/(protected)/account-ledger/SearchLedger.tsx` | Debe conservar debounce/navegación; su query string alimentará la consulta server-side. |
| `src/app/(protected)/account-ledger/PusherListener.tsx` | Debe conservar `router.refresh()`. |
| `src/app/(protected)/account-ledger/[id]/page.tsx` | Consulta de detalle fuera del alcance. |
| Acciones de pago/cancelación/confirmación | Deben seguir invalidando/refrescando el listado como antes. |

### Validación prevista, no implementar en esta fase

- Actualizar o crear pruebas unitarias de `getUnpaidOrders` para verificar `where`, `select`, estado, búsqueda y autorización.
- Añadir una prueba de integración/SQL que capture el plan de la consulta y confirme el índice.
- Ejecutar `npm run lint`, `npm run build` y la suite existente cuando Developer/QA implementen.

## 7. Criterios de aceptación

- [ ] AC1: El filtro `Pagados` devuelve exactamente las mismas órdenes que antes para el mismo snapshot de datos.
- [ ] AC2: Los filtros `Por Confirmar`, `Pendientes de Pago` y `Todos` mantienen contenido, orden y acciones.
- [ ] AC3: El nombre se filtra en PostgreSQL; no existe un `orders.filter` equivalente sobre todas las filas en `OrdersTable`.
- [ ] AC4: La consulta de listado usa `select` mínimo y no serializa campos no usados de `Client`.
- [ ] AC5: No hay consultas por orden ni N+1.
- [ ] AC6: El índice compuesto está reflejado tanto en `schema.prisma` como en una migración aplicable.
- [ ] AC7: `EXPLAIN (ANALYZE, BUFFERS)` valida el plan esperado en el dataset representativo.
- [ ] AC8: Se cumplen MA1–MA5 o queda documentada una justificación técnica con la medición comparativa.
- [ ] AC9: Pusher, búsqueda, enlaces de detalle, pago, cancelación y actualización no cambian funcionalmente.
- [ ] AC10: Sesiones inválidas no pueden consultar órdenes de otro negocio.
- [ ] AC11: `npm run lint` y `npm run build` pasan sin errores después de la implementación.

## 8. Orden de implementación recomendado

1. Capturar línea base y plan SQL sin modificar comportamiento.
2. Definir el tipo/entrada y actualizar la consulta con `search` + `select`.
3. Preservar y validar la semántica de ordenación con fixtures de clientes nulos, acentos y empates.
4. Añadir y aplicar la migración del índice; repetir `EXPLAIN`.
5. Ejecutar pruebas de regresión, lint/build y mediciones p95.
6. Comparar resultados contra MA1–MA5 antes de aprobar el cambio.

## 9. Dependencias y decisiones

- No se requieren nuevas dependencias npm.
- Se usan App Router/Server Components existentes, Prisma 6 y PostgreSQL.
- La optimización es server-side y compatible con el modelo actual de refresco por URL/Pusher.
- La paginación queda explícitamente fuera de alcance para no alterar el comportamiento funcional de mostrar el conjunto completo; puede evaluarse en una iniciativa posterior si el volumen sigue creciendo.
