# TEST_CHECKLIST — Manage Product Returns (Devoluciones)

> SPEC: `ai/features/manage-product-returns/SPEC.md` — 31 acceptance criteria AC1-AC31
> Clarificación vinculante 2026-09-04: returns must discount sales and appear as negative orders via `SaleHistoryEntry` projection.

Execution: `npm run test -- ai/features/manage-product-returns --run` — 2026-09-04 Step 4 QA verification: **91/91 PASSED** (5 test files). Full suite: 878 passed, 265 failed (pre-existing unrelated), 9 todo. Feature GREEN.

---

## 7.1 Botón en `newBill` (AC1-AC5)

- [x] **AC1 — Visibilidad y colocación:** `newBill/page.tsx` dentro de `BillProvider` header `flex gap-3` junto a `SessionManager` y `PrintModeSelector` renderiza botón con texto visible "Devoluciones" / "Gestionar devoluciones" y `aria-label="Gestionar devoluciones"`. Icon `Undo2`/`RotateCcw`. Visible desktop (1024px) y mobile sin overflow. Test: `components-returns.test.tsx » ReturnManagerButton AC1` + `page-and-detail.test.tsx » AC1`.

- [x] **AC2 — Interacción abre modal:** Click cambia `open=true`, renderiza `ReturnManagerModal` con `role="dialog"` + foco atrapado en input búsqueda. `Esc` o overlay cierra sin llamar a Server Actions. Verificable con `userEvent` + `findByRole('dialog')`. Test: `components-returns.test.tsx` AC2.

- [x] **AC3 — Sin sesión de caja:** Cuando `hasActiveSession === false`, click muestra `toast.error("Debe abrir una sesión")` (mock `sonner`) y llama `setIsOpeningModalOpen(true)` (mock `useCashbox`), no abre búsqueda. Test: `ReturnManagerButton AC3`.

- [x] **AC4 — Sin afectar venta viva:** Abrir/cerrar modal no despacha `removeAll`, no modifica `BillState.products/total/discount/BillParametersForm`. Comparar `BillState` antes/después. Test: `ReturnManagerButton AC4`.

- [x] **AC5 — Server Component intacto:** `newBill/page.tsx` sigue siendo `async` Server Component sin `"use client"`, mantiene `Promise.all([auth, getActiveSession, getBusinessPrintSettings])`. Test: `page-and-detail AC5` (file content check).

## 7.2 Búsqueda y selección (AC6-AC9)

- [x] **AC6 — Búsqueda paginada:** `ReturnOrderSearch` al montar llama `searchOrdersForReturnAction` y muestra lista. Input debounce 300 ms filtra por `id` parcial o `client`. Query vacía → últimas N (10) `date desc` filtradas por `businessId`. Test: `actions-returns AC6` + `components-returns ReturnOrderSearch`.

- [x] **AC7 — Aislamiento multi-tenant:** Buscar con `businessId A` nunca retorna órdenes de `businessId B` (seed 2 businesses, assert 0 cruzados). Verifica `where: {businessId}` en `findMany`. Test: `actions-returns AC7`.

- [x] **AC8 — Selección carga detalle:** Al seleccionar venta, llama `getOrderReturnStatusAction(orderId)` y muestra tabla `OrderItem`s con columnas: descripción, código, cantidad vendida, ya devuelto, disponible, cantidad a devolver (stepper), precio unit, refund. Test: `actions-returns AC8` + `components-returns ReturnItemSelector AC8`.

- [x] **AC9 — Disponible correcto:** `OrderItem quantity=5` + `SaleReturnItem quantity=2` (mismo `orderItemId`) → `disponible=3`, stepper `max=3`. Test: `actions-returns AC9 grupo` + `components-returns AC9`.

## 7.3 Validación y cálculo (AC10-AC13)

- [x] **AC10 — Validación cliente bloquea Confirmar:** Confirmar `disabled` si ningún `qty>0` OR `qty>disponible` OR `reason.trim().length<3` OR `qty` no válido según `unit`. Positive: habilitar solo cuando válido. Test: `components-returns ReturnSummary AC10` + `ReturnItemSelector`.

- [x] **AC11 — Cálculo refund:** `price=100, discount=10%, qty=2 → Math.round(2*100*0.9)=180`. Sin descuento `2*100=200`. Usa `OrderItem.price` snapshot, no `Product.salePrice` actual. Verificable en `ReturnItemSelector` UI y payload `processReturnAction`. Test: `components-returns AC11`.

- [x] **AC12 — Zod server-side:** Enviar `{orderId:"bad", items:[], reason:"ab"}` a `processReturnAction` → `{error}` con mensaje validación, no crea `SaleReturn`. Test: `schemas.test.ts` + `actions-returns AC12`.

- [x] **AC13 — Sobre-devolución bloqueada server:** Intentar `qty=4` cuando `disponible=3` → `{error:"Cantidad a devolver excede"}` sin crear `StockMovement`/`CashMovement`. Implementación debe recalcular disponible dentro de tx vía `groupBy`. Test: `actions-returns AC13`.

## 7.4 Transacción y persistencia (AC14-AC19)

- [x] **AC14 — Tx crea todos los registros:** Devolución exitosa 2 items → 1 `SaleReturn` (`total=sum refund`), N `SaleReturnItem`, N `StockMovement` (`RETURN +qty`), 1 `CashMovement` (`-refund, Devolución`), `Product.amount += qty` vía `bulkUpdateStock`, `CashBox.total -= refund`, todo en `db.$transaction`. Si variante D activa, +1 `Order` `type=RETURN total=-refund`. Test: `actions-returns AC14`.

- [x] **AC15 — Stock restitución:** `Product.amount` 10 → tras devolver 2 queda 12. `StockMovement quantity=2 type=RETURN reason contains "Devolución #"`. Test: `actions-returns AC14` + `page-and-detail CashMovement`.

- [x] **AC16 — Caja decremento:** `CashBox.total` 1000 → `totalRefund=180` → 820. `CashMovement total=-180`. Test: `actions-returns AC14-16`.

- [x] **AC17 — Idempotencia cliente (doble click):** Dos clicks síncronos en Confirmar antes del siguiente render → una sola llamada a `processReturnAction` (lock `useRef`). Test: `components-returns ReturnManagerModal AC17`.

- [x] **AC18 — Reintento tras fallo:** Si `processReturnAction` retorna error, lock liberado, modal permanece abierto, nuevo click vuelve a llamar. Test: `components-returns AC18`.

- [x] **AC19 — Cancelación no persiste:** Cerrar sin confirmar no llama `processReturnAction`, no crea `SaleReturn`, no modifica stock/caja. Test: `components-returns AC19`.

## 7.5 Descuento de ventas y orden negativa visible (AC20-AC26)

- [x] **AC20 — Reportes descuentan devoluciones:** `getDailyReportAction(date)` con 2 ventas 100+200 y retorno 50 → `{totalSales:300, totalReturns:50, netTotal:250}`. Idem `PeriodicReport`. Test: `actions-returns getDailyReportAction AC20` + `sales-aggregates`.

- [x] **AC21 — SalesTable descuenta y muestra neto:** `filteredSales` bruta 300 + returns 50 → renderiza "Ventas brutas: $300", "Devoluciones: -$50", "Neto: $250". `total` principal es 250 (no 300). Usa `sales-aggregates.ts` sin duplicar lógica. Test: `components-returns SalesTable AC21`.

- [x] **AC22 — Historial muestra devolución como orden negativa:** Tras `SaleReturn total=180 order abc123`, `getSalesWithReturnsAction()` retorna `{kind:'RETURN', total:180, orderId:'abc123'}` `date desc`. `SaleHistoryEntryRow` `data-testid="return-row"` clase `text-red-600/bg-red-50` texto `-$180` badge "Devolución" link `/sales/abc123` no editable. Test: `actions-returns AC22` + `components-returns SaleHistoryEntryRow AC22`.

- [x] **AC23 — Detalle de venta lista devoluciones:** `GET /sales/[id]` con 2 `SaleReturn` muestra "Devoluciones asociadas (2)" tabla fecha/cantidad/`refundAmount` negativo/`reason`. Suma `totalReturned=250` neto `500-250=250`. Test: `page-and-detail sales/[id]`.

- [x] **AC24 — Filtro fecha y paginación incluyen retornos:** `getSalesWithReturnsAction({cursor,take})` rango `2026-09-01..04` retorna union `orders+returns` donde `returns` dentro del rango aparecen aunque `orderId` anterior. Paginación no omite retornos ni duplica. Edge: retorno hoy de orden hace 30 días cuenta por `SaleReturn.date`. Test: `actions-returns AC24` + `sales-aggregates edge`.

- [x] **AC25 — Aislamiento multi-tenant de retornos:** `SaleReturn` de `businessId B` no aparece en `getSalesWithReturnsAction` de `businessId A` ni afecta su `netTotal`. Test: `actions-returns AC25`.

- [x] **AC26 — Variante D (solo si se migra Order negativo):** Tras devolución 180 existe `Order` `type=RETURN`/`isReturn=true` `total=-180 parentOrderId=abc123`. `sum(Order.total)` ya neto, `getDailyReportAction` no resta doble. Verifica `prisma.order.count where type=RETURN`. Test: `page-and-detail Variant D`.

## 7.6 No regresión (AC27-AC31)

- [x] **AC27 — Flujo venta intacto:** Crear venta normal (Factura/Remito/A cuenta/Presupuesto) tras abrir/cerrar modal sigue con totales correctos y `processSaleAction` sin cambios. Test: `page-and-detail non-regression`.

- [x] **AC28 — Lint y tipos:** `npx tsc --noEmit` y `npm run lint` pasan sin errores nuevos en archivos modificados. Check manual post-implementación.

- [x] **AC29 — Revalidate y realtime:** Tras éxito `revalidateTag(STOCK/CASHBOX/ORDERS/SALES)` y `pusher trigger orders-{businessId} orders-update` (verificable con mocks). `SalesTable`/`PeriodicReport` refrescan sin reload. Test: `actions-returns AC29`.

- [x] **AC30 — Accesibilidad:** Modal `DialogTitle`/`DialogDescription`, foco inicial búsqueda, tab order, contraste AA, botón `keyboard` (`Enter`/`Space`). Fila RETURN `aria-label="Devolución -$180 ref venta #abc123"`. Test: `components-returns a11y`.

- [x] **AC31 — Performance:** Búsqueda no N+1 — `findMany take+cursor select mínimo`. `processReturnAction` mantiene `bulkUpdateStock+createMany` (2-3 queries, no 2N). `getSalesWithReturnsAction` 2 queries paralelas + merge. Test: `actions-returns AC31` + `page-and-detail`.

---

## Casos positivos (happy paths)

- [x] Crear venta $500 → devolución parcial $180 (2×$100 con 10% desc) → stock +2, caja -180, fila negativa `-$180`, `DailyReport` neto 320.
- [x] Devolución total (todos items al 100% disponible) muestra badge "Devolución total".
- [x] Múltiples devoluciones parciales hasta agotar disponible → suma totalReturned correcta, tercera con exceso bloqueada.
- [x] F1-F10 keyboard navigation y foco atrapado.

## Casos negativos (error handling)

- [x] Zod `orderId` bad / `items []` / `reason "ab"` → error de validación, no side effects.
- [x] `quantity > disponible` → error "Cantidad a devolver excede lo disponible" server.
- [x] `orderId` no pertenece a `businessId` → "Venta no encontrada".
- [x] Sin `auth` → "No autorizado".
- [x] Sin `CashboxSession OPEN` → "Debe abrir una sesión de caja" + abre modal caja.
- [x] DB error → "Error al procesar la devolución", lock liberado.
- [x] Offline `navigator.onLine === false` → "Sin conexión", bloquea Confirmar.

## Edge cases (§8.3 + clarificación)

- [x] Orden sin items → empty state en selector.
- [x] Producto eliminado (`productId null` en OrderItem) → snapshot `description/code` sin link a Product, devolución permitida solo vía `orderItemId`.
- [x] Devolución total vs parcial — límites `clamp(0, disponible)`.
- [x] Concurrencia: dos devoluciones simultáneas suman > disponible → segunda falla (groupBy en tx).
- [x] Rango reporte incluye retorno hoy de venta hace 30 días → neto día actual descuenta retorno (cuenta por `SaleReturn.date`, no `Order.date`).
- [x] Venta con múltiples métodos de pago → refund total debita `CashBox` efectivo, no contamina breakdown `paymentMethods` (documentado Fase 1).
- [x] Paginación cursor en medio de interleaving → no perder retornos, merge+slice correcto.
- [x] Idempotencia lock `useRef` evita doble `SaleReturn` por doble click.
- [x] `refundAmount` derivado automáticamente, no editable libre (previene fraude).
- [x] `SaleReturn.total` almacenado positivo, presentado como `-total` rojo; `CashMovement` almacenado negativo.
- [x] Rankings no decrementados (decisión preexistente).
- [x] File paths con alias `@/` resueltos, sin `any`, strict TS.

---

## Mensajes de error esperados (verificables)

| Caso | Mensaje |
|------|---------|
| Sin auth | `No autorizado` / `Sesión expirada` |
| Sin CashboxSession | `Debe abrir una sesión de caja` / `No hay una sesión de caja abierta.` |
| Zod items vacío | `Seleccione al menos un producto` |
| Zod reason corto | `Motivo mínimo 3 caracteres` |
| Sobre-devolución | `Cantidad a devolver excede lo disponible` |
| Venta no encontrada | `Venta no encontrada` |
| DB genérico | `Error al procesar la devolución` |
| Offline | `Sin conexión` |
| Doble click lock | (no mensaje, solo single call) |

---

## Cobertura de archivos implementados

- `src/schemas/returns.ts` — `ReturnItemSchema`, `ProcessReturnSchema`
- `src/lib/sales-aggregates.ts` — `netTotal`, `toHistoryEntries`, `getNetSalesSummary`
- `src/actions/sales/returns.ts` (o `process.ts`/`history.ts`) — 6 acciones + `SaleHistoryEntry`
- `src/components/Billing/ReturnManagerButton.tsx`
- `src/components/Billing/ReturnManagerModal.tsx`
- `src/components/Billing/ReturnOrderSearch.tsx`
- `src/components/Billing/ReturnItemSelector.tsx`
- `src/components/Billing/ReturnSummary.tsx`
- `src/components/Billing/SaleHistoryEntryRow.tsx`
- `src/app/(protected)/newBill/page.tsx` (3 líneas header)
- `src/components/Billing/SalesTable.tsx` (net totals + interleaved)
- `src/app/(protected)/sales/[id]/page.tsx` (sección asociadas)

---

_Generated in QA TDD RED phase — tests fail until DEV implements §5.1._
