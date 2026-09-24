# TEST CHECKLIST — ventas-pagination (Gate G2)

## Acción `getSalesAction`

- [ ] Filtra en Prisma antes de `take`: tipo de comprobante, medio canónico/histórico en `paymentMethod` o `paymentMethod2`, vendedor y fechas.
- [ ] `businessId` proviene exclusivamente de sesión y siempre incluye `paidStatus: "pago"`.
- [ ] Aplica `take + 1`, valida/clampa el límite y devuelve `nextCursor: null` sin más filas.
- [ ] Orden total `date DESC, id DESC`; fechas iguales recorren páginas sin duplicados ni omisiones.
- [ ] Cursor opaco contiene fecha e id y continúa con `date <` o fecha igual + `id <`.
- [ ] Cursor combinado con filtros conserva todos los predicados activos y el medio secundario.
- [ ] `startDate` y `endDate` son inclusivos (`gte`/`lte`).
- [ ] Filtros vacíos significan “sin restricción”; errores devuelven contrato seguro.

## Serialización de filtros

- [ ] Convierte estado UI a `SalesFilters` sin mutarlo.
- [ ] Normaliza nombres de comprobantes/medios y fechas a ISO.
- [ ] Omite vendedor y fechas inactivos; selecciones vacías no restringen.
- [ ] El estado inicial del `FiltersProvider` se serializa con `documentTypes` y `paymentMethods` vacíos (sin restricción) y vendedor/fechas inactivos, para que la primera solicitud de `SalesTable` incluya todas las ventas pagas.

## `SalesTable`

- [ ] Cambio de cualquier filtro usa snapshot nuevo, cursor ausente y página visual 1.
- [ ] “Cargar más” usa exactamente cursor visible y el mismo snapshot.
- [ ] Concatena sin duplicar por `sale.id`; `nextCursor: null` oculta el botón.
- [ ] Respuestas obsoletas no sobrescriben el snapshot vigente.
- [ ] Refresh de Pusher consulta primera página con filtros actuales y reinicia cursor/lista coherentemente.
- [ ] Lista, total y páginas visuales se derivan exclusivamente del conjunto cargado.

## Gate G2

- [ ] Pruebas presentes en este directorio y compilan contra los contratos esperados.
- [ ] Ejecutar `npm run test -- ai/features/ventas-pagination`.
- [ ] Los fallos esperados son RED por producción ausente/incompatible; no se agregan cambios de producción.
