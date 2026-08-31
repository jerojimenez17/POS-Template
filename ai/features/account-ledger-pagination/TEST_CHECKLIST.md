# Checklist QA — paginación de Cuenta Corriente

## Contrato server/action

- [ ] La respuesta de listado es `ActionResult<{ orders, nextCursor, hasMore }>`; el detalle `orderId` conserva `client` y `cashMovements`.
- [ ] `pago`/`all` usan 50 por página (configurable) y consultan `take + 1`; ningún `take` supera 101.
- [ ] `inpago`/`pendiente` usan exactamente 100 como tamaño fijo y nunca consultan la colección completa.
- [ ] El cursor es opaco, está ligado a `status + search` y continúa con nombre normalizado, fecha descendente e `id` ascendente.
- [ ] La orden total es estable para clientes nulos, nombres iguales, acentos y fechas iguales; no hay duplicados ni saltos.
- [ ] La búsqueda hace `trim`, ignora espacios vacíos y aplica `client.name contains insensitive`.
- [ ] Se conservan alias `pagado`, exclusión de `pendiente` y filtros de `all`.
- [ ] La autorización usa siempre `auth().user.businessId`; sin sesión/business no hay datos.
- [ ] Cada página usa una consulta set-based y solo la proyección de tabla; no hay N+1.

## Cliente

- [x] `account-ledger-list.test.ts` inspecciona el componente real en `src/app/(protected)/account-ledger/AccountLedgerList.tsx`; se eliminó el duplicado auxiliar `ai/src/...` para evitar que una copia satisficiera el contrato.

- [ ] Solo `pago` y `all` registran `IntersectionObserver`; el sentinel es accesible.
- [ ] No hay carga automática por scroll en `inpago`/`pendiente`; sus controles son explícitos, de 100 filas, y reemplazan la página visible.
- [ ] `loadingMore` evita solicitudes concurrentes y la carga incremental conserva las filas existentes.
- [ ] Cambiar `status`, `search`, filtros o `router.refresh()` reinicia cursor/página y no mezcla queries.
- [ ] El error inicial conserva el mensaje actual; un error posterior conserva filas, muestra “No se pudieron cargar más órdenes” y permite reintentar el mismo cursor.
- [ ] El final de la colección oculta sentinel/indicador; las acciones y enlaces de las filas siguen funcionando.

## Verificación G2

Ejecutar:

```bash
npm run test -- ai/features/account-ledger-pagination
```

En Windows, la configuración actual (`pool: "forks"`) puede producir `Timeout waiting for worker to respond`/`kill EPERM`. Para una verificación estable:

```bash
npx vitest run --pool=threads --maxWorkers=1 ai/features/account-ledger-pagination
```

Tras la implementación, ese comando debe pasar completo; luego ejecutar `npm run lint` y `npm run build`.
