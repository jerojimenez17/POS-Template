# SPEC: Paginación del libro de Cuenta Corriente

## 1. Resumen y objetivo

Optimizar la carga de `src/app/(protected)/account-ledger/` para que nunca sea necesario traer la colección completa de órdenes en una sola consulta o respuesta.

- **Pagados (`pago`) y Todos (`all`)**: carga incremental mediante infinite scroll, con requests sucesivos y cursor estable.
- **Pendientes de pago (`inpago`) y Por confirmar (`pendiente`)**: paginación explícita en lotes de 100, sin `IntersectionObserver` ni carga automática al acercarse al final.
- Se mantienen la búsqueda por cliente, filtros de estado, orden actual, acciones, mensajes y refresco por Pusher.

No se implementan cambios de código ni tests como parte de esta especificación.

## 2. Análisis del código existente

### 2.1 Página y flujo actual

`src/app/(protected)/account-ledger/page.tsx` es un Server Component. Obtiene `auth()` y `searchParams`, define `status` (por defecto `inpago`) y `search`, y renderiza `OrdersTable` dentro de `Suspense`. `OrdersTable` llama a `getUnpaidOrders` y actualmente recibe el array completo para renderizar una única tabla.

Los tabs se representan mediante URL (`/account-ledger?status=...`) y `SearchLedger` modifica `search` con `router.replace`. `PusherListener` usa `router.refresh()`, por lo que la navegación/refrescado server-side forma parte de la compatibilidad.

### 2.2 Acción y consulta actual

`src/actions/unpaid-orders.ts` expone `getUnpaidOrders`. La sesión determina el `businessId`; el valor enviado por el cliente no debe ganar precedencia. En el listado:

- `pendiente` consulta `status = pendiente`.
- Los demás estados excluyen `status = pendiente`.
- `pago` se traduce a `paidStatus = pago`; `pagado` es alias legado.
- `all` no aplica `paidStatus`.
- La búsqueda se realiza por `client.name` con `contains` e insensitive.
- La proyección ya debe ser mínima: orden (`id`, `date`, `total`, `status`, `paidStatus`, `clientId`, `notes`) y cliente (`id`, `name`).
- El orden observable es cliente ascendente, fecha descendente e `id` ascendente como desempate.

La rama `orderId` es de detalle y queda fuera de la paginación; debe conservar `client` y `cashMovements`.

### 2.3 Patrones reutilizables y discrepancias

La ruta `src/app/(protected)/clients/` mencionada en el requerimiento no está presente en el checkout inspeccionado. El patrón más cercano disponible es `src/components/Billing/SalesTable.tsx`: recibe una primera página y `nextCursor`, bloquea requests concurrentes, concatena resultados y detiene la carga cuando el cursor es `null`. También se revisó `src/actions/sales/history.ts`, que usa `take + 1`, cursor por `id` y `skip: 1`.

La implementación deberá verificar la rama que contenga el patrón de Clients antes de codificar; si sigue ausente, deberá adoptar el contrato de `SalesTable` y documentar la decisión.

### 2.4 Base de datos

`Order` tiene índices `[businessId, date]` y `[businessId, paidStatus, status, date]`. El segundo es relevante para este listado. La paginación debe usar un orden total y una condición de continuación que no produzca duplicados ni saltos bajo el snapshot lógico de una consulta. No se debe usar `skip` creciente para infinite scroll.

## 3. Arquitectura propuesta

### 3.1 Separación de responsabilidades

1. **Server Component de página**: autentica, conserva URL/search params y solicita únicamente la primera página del tab activo.
2. **Server Action de lectura**: valida parámetros, vuelve a autenticar, aplica el `where` completo, devuelve una página limitada y metadatos de continuación.
3. **Componente cliente de listado**: mantiene las filas del tab/query actual, cursor, página explícita (solo tabs no infinite), estados de request y sentinel para infinite scroll (solo `pago`/`all`).
4. **Presentación de fila**: permanece con las mismas acciones y enlaces; no hace consultas por fila.

La frontera Server/Client debe recibir únicamente valores serializables. Las `Date` deben seguir el mecanismo serializable ya aceptado por Server Components o mapearse de forma consistente antes de pasar props.

### 3.2 Contrato de una lectura paginada

Se recomienda ampliar el input existente sin romper llamadas de detalle:

```typescript
type LedgerStatus = "all" | "inpago" | "pago" | "pagado" | "pendiente" | "cancelado";

interface GetUnpaidOrdersInput {
  businessId: string;          // legado; solo fallback tipado, nunca autoridad
  status?: LedgerStatus | string;
  orderId?: string;            // camino de detalle, sin paginación
  search?: string;
  limit?: number;
  cursor?: string | null;      // token opaco, no exponer el objeto interno
}

interface AccountLedgerPage {
  orders: AccountLedgerOrder[];
  nextCursor: string | null;
  hasMore: boolean;
}

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

El wrapper `ActionResult` existente se conserva. Para compatibilidad de `orderId`, su respuesta puede seguir siendo el objeto de detalle actual; el contrato paginado aplica únicamente cuando no hay `orderId`.

### 3.3 Límites

```text
INFINITE_PAGE_SIZE = 50 (configurable, máximo 100)
FIXED_PAGE_SIZE = 100 (fijo para inpago y pendiente)
MAX_PAGE_SIZE = 100
```

El servidor debe normalizar y acotar cualquier `limit` recibido; nunca aceptar tamaños mayores a 100. El cliente no puede modificar `FIXED_PAGE_SIZE`. Se consulta `limit + 1` para determinar `hasMore` sin ejecutar `count` en cada request.

## 4. Cursor y ordenación

### 4.1 Token

El cursor es opaco para el cliente y contiene, como mínimo, el último valor de orden (`clientName` normalizado/null, `date` e `id`) junto con un fingerprint de `status` y `search`. Debe validarse antes de construir la consulta; un cursor inválido devuelve error controlado o reinicia la primera página, nunca permite cambiar de negocio.

No incluir secretos ni información sensible en el token. Si se firma, usar la infraestructura criptográfica/configuración existente; no introducir claves en el repositorio.

### 4.2 Continuación

La consulta debe aplicar una comparación lexicográfica estricta sobre la misma clave de orden total:

1. nombre de cliente ascendente, con `NULL` tratado igual que el comportamiento vigente (`""` para ordenar);
2. `date` descendente;
3. `id` ascendente.

La solución preferida es una consulta Prisma tipada que reproduzca esta condición. Si Prisma no permite expresar de forma fiable el orden relacional, `NULL`, la normalización y la condición lexicográfica, se debe usar una consulta SQL parametrizada y revisada, o un adaptador de datos aislado; nunca interpolar `search`, cursor o `businessId` en SQL. Debe conservarse una ordenación final solo sobre la página obtenida, no sobre toda la colección.

El último registro de una página se convierte en `nextCursor` únicamente si se obtuvo el registro extra. El primer request usa `cursor = null`; el cambio de tab, búsqueda o cualquier filtro descarta el cursor anterior.

## 5. Comportamiento por tab

### 5.1 Pagados y Todos: infinite scroll

- La primera navegación devuelve como máximo `INFINITE_PAGE_SIZE` filas.
- El componente cliente muestra las filas y un sentinel accesible al final de la lista.
- Al entrar el sentinel en viewport, solicita el siguiente cursor.
- No se ejecuta otra solicitud si `loadingMore` es verdadero, si no hay `nextCursor` o si el query key cambió.
- Las páginas se concatenan solo cuando pertenecen al mismo `status + search`.
- Al terminar se oculta el sentinel/indicador y queda visible el conjunto ya cargado.
- Debe existir un estado de “Cargando más…” y, si la UX actual lo requiere, un control de reintento manual sin duplicar filas.

### 5.2 Pendientes de pago y Por confirmar: lotes de 100 sin infinite scroll

- Cada request trae exactamente hasta 100 filas (`FIXED_PAGE_SIZE`), nunca la colección completa.
- No se registra `IntersectionObserver` ni se dispara una carga automática al hacer scroll.
- Se usa paginación explícita (controles anterior/siguiente o equivalente ya disponible en la aplicación), conservando 100 como tamaño fijo. El cambio de página reemplaza las filas visibles en lugar de concatenarlas.
- Los controles se deshabilitan durante la solicitud y cuando no existe página anterior/siguiente.
- Si el diseño vigente no tiene controles reutilizables, se añadirá una navegación mínima y consistente con los componentes UI existentes; no se debe simular infinite scroll.

Esta decisión evita tanto la consulta monolítica como el crecimiento indefinido del DOM, y hace explícita la forma de acceder a órdenes posteriores en los dos tabs no incrementales.

### 5.3 Filtros y navegación

- `status` y `search` siguen en query string; al cambiar cualquiera se reinicia a la primera página.
- La búsqueda mantiene el `trim`, no genera filtro para espacios y se aplica en PostgreSQL sobre `client.name`.
- La búsqueda conserva su interacción actual con `router.replace`; si se añade debounce, debe evitar requests obsoletos y no alterar el texto ingresado.
- Las rutas de Ver, Imprimir, Pagar, Cancelar y Confirmar no cambian.
- El default continúa siendo `inpago`.

## 6. Estados de carga y error

### Primera carga

Conservar `Suspense`/fallback existente. El estado vacío se muestra solo cuando la primera página terminó correctamente y no contiene filas, no mientras está cargando.

### Carga incremental

Para infinite scroll mostrar un indicador al pie, mantener las filas existentes y no bloquear acciones ya renderizadas. Para paginación fija, mantener la tabla anterior hasta resolver o mostrar el estado de transición sin permitir doble request.

### Error

- Primer request: conservar el contrato `ActionResult` y el mensaje visible actual.
- Request posterior: conservar filas ya cargadas, mostrar error local (“No se pudieron cargar más órdenes”) y permitir reintentar el mismo cursor.
- Cursor inválido/expirado: reiniciar la consulta del query key actual o mostrar error recuperable, sin mezclar páginas.
- No exponer SQL, credenciales, tokens ni datos de otro negocio.

### Actualizaciones Pusher

`router.refresh()` debe seguir invalidando el listado. Al refrescar, se reinicia el estado paginado del tab activo para evitar combinar un cursor viejo con un snapshot nuevo. No crear suscripciones duplicadas ni hacer una consulta por orden.

## 7. Compatibilidad y seguridad

- La autorización siempre deriva de `auth().user.businessId`; `input.businessId` no puede consultar otro negocio.
- Se mantienen las reglas exactas de estado actuales, incluidos alias `pagado` y exclusión de `pendiente` en `all`.
- Se mantiene el orden observable: cliente ascendente, fecha descendente, `id` ascendente; se deben cubrir clientes nulos, nombres iguales, acentos y fechas iguales.
- La rama `orderId` no recibe `take`, `cursor` ni la proyección del listado.
- No cambiar modelos de pago, confirmación, cancelación, detalle ni Pusher salvo el reinicio de estado necesario.
- No añadir dependencias npm si los hooks y componentes UI existentes son suficientes.
- Revisar `prisma/schema.prisma` e índices con `EXPLAIN (ANALYZE, BUFFERS)`; si el plan demuestra que falta un índice, proponer migración versionada y no destructiva en la implementación.

## 8. Archivos previstos

| Archivo | Cambio previsto |
|---|---|
| `src/actions/unpaid-orders.ts` | Input paginado, límites, cursor, `take + 1`, salida de página, autorización y error tipados. |
| `src/app/(protected)/account-ledger/page.tsx` | Primera página, separación del contenedor cliente y preservación de estados/acciones. |
| `src/app/(protected)/account-ledger/AccountLedgerList.tsx` | Nuevo Client Component para concatenación/cambio de página, sentinel, estados y reintentos. |
| `src/app/(protected)/account-ledger/AccountLedgerPagination.tsx` | Opcional: controles de 100 para tabs no incrementales, si no existe un componente reutilizable. |
| `src/app/(protected)/account-ledger/SearchLedger.tsx` | Solo ajustes necesarios para reiniciar query/cursor sin cambiar UX. |
| `prisma/schema.prisma` y migración | Solo si `EXPLAIN` justifica un índice adicional/alineado. |
| `src/app/(protected)/account-ledger/PusherListener.tsx` | Verificar; no cambiar suscripción salvo coordinación explícita del reset. |

No modificar la página de detalle ni las acciones de mutación para implementar esta feature.

## 9. Observabilidad y validación

En staging, medir sin registrar nombres de clientes:

- duración y cantidad de filas de cada request;
- tamaño aproximado de payload por página;
- número de requests hasta cargar N filas;
- ausencia de requests concurrentes duplicados;
- p95 de primera página e interacción de “cargar más”/cambio de página;
- plan SQL para `pago`, `all`, `inpago` y `pendiente` con y sin búsqueda.

No usar `count` como requisito de cada página; si se necesitan totales para controles, documentar el coste y preferir `hasMore`/cursor.

## 10. Criterios de aceptación medibles

- **AC1**: Pagados y Todos hacen una primera consulta con `take <= 51` (o el tamaño configurado más uno), y nunca una consulta sin límite.
- **AC2**: Infinite scroll solicita la página siguiente únicamente con `nextCursor`, no usa `skip` creciente ni `IntersectionObserver` en `inpago`/`pendiente`.
- **AC3**: Cada request de Pendientes de pago y Por confirmar devuelve como máximo 100 filas y la navegación entre lotes es explícita, sin carga automática por scroll.
- **AC4**: Cambiar tab, búsqueda o filtros reinicia cursor/página y no mezcla filas de queries distintos.
- **AC5**: En un fixture de al menos 250 órdenes, la secuencia paginada contiene exactamente una vez cada orden que contiene la consulta monolítica equivalente, en el mismo orden.
- **AC6**: Búsqueda vacía/espacios, cliente nulo, acentos, nombres empatados y fechas iguales conservan la semántica existente.
- **AC7**: Se conserva el contenido y comportamiento de badges, acciones y enlaces para cada orden.
- **AC8**: No se realizan consultas por fila ni N+1; cada request de página usa una consulta set-based (más la autenticación).
- **AC9**: Una segunda solicitud mientras la primera está pendiente no genera una llamada duplicada; un error posterior permite reintentar el mismo cursor sin duplicados.
- **AC10**: Pusher refresca el tab activo y descarta cursores obsoletos; no deja suscripciones duplicadas.
- **AC11**: Una sesión sin `businessId` no obtiene datos, y un `businessId` malicioso no altera el filtro autorizado.
- **AC12**: El payload de cada página contiene únicamente la proyección necesaria para la tabla; el detalle `orderId` conserva su contrato completo.
- **AC13**: Los índices y el plan SQL se validan en staging; no se incorpora migración si no hay evidencia de necesidad, y cualquier migración es versionada/no destructiva.
- **AC14**: `npm run lint` y `npm run build` pasan tras la implementación; las pruebas nuevas/regresión quedan a cargo de las fases QA y Developer.

## 11. Plan de implementación recomendado

1. Confirmar el patrón real de `clients` en la rama de implementación y capturar línea base.
2. Extraer tipos de página y definir `PAGE_SIZE`/token de cursor.
3. Implementar y probar primero la acción con fixture ordenado, búsqueda y autorización.
4. Integrar primera página server-side y luego el Client Component.
5. Activar infinite scroll solo para `pago`/`all`; integrar paginación fija de 100 para `inpago`/`pendiente`.
6. Validar Pusher, cambios rápidos de query, errores, reintentos y acciones de fila.
7. Comparar payload, tiempos, planes SQL y criterios AC antes de aprobar.
