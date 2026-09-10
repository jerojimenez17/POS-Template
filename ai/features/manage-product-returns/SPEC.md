# SPEC: Manage Product Returns from `newBill` — Devoluciones

> **Clarificación incorporada (2026-09-04, aprobada por PO):** "this return has to discount of sales because it has a return of the money. has to have an order negative if there are a return of money"
>
> **Interpretación vinculante:** La devolución **no es solo auditoría**. Debe (1) **descontar/offsetear los totales de ventas** en reportes, totales diarios y caja, y (2) **generar/visibilizarse como una orden negativa / venta negativa** cuando hay reintegro de dinero (comportamiento nota de crédito, aun sin fiscalidad AFIP en Fase 1). Esta versión de la SPEC enmienda la anterior para satisfacer ambos puntos sin romper invariantes de `BillState`.

## 1. Objetivo

Añadir un **botón "Gestionar devoluciones" en `src/app/(protected)/newBill/page.tsx`** que permita procesar devoluciones de productos sin abandonar el flujo de facturación. La solución debe reutilizar el modelo existente `SaleReturn`/`SaleReturnItem`/`StockMovement` (`RETURN`) y la acción `processReturnAction` ya optimizada, garantizando trazabilidad (`Order` → `SaleReturn`), restitución de stock, ajuste de caja y validación de sesión. No debe introducir cantidades negativas en el carrito vivo (`BillState`).

**Requisitos adicionales de la clarificación:**

1.  Toda devolución con reintegro debe **descontar los totales de ventas** (`netSales = sum(Order.total) - sum(SaleReturn.total)` o equivalente). Los reportes diarios/mensuales/anuales y cualquier agregado de ingresos deben exponer `totalSales`, `totalReturns` y `netTotal`.
2.  Toda devolución con reintegro debe **visibilizarse como orden/venta negativa** en el sistema (fila roja con `-total`, vinculada a la `Order` origen), aun en Fase 1 no fiscal. La fuente de verdad sigue siendo `SaleReturn`; la "orden negativa" es una **proyección de lectura** (view-model) — ver §2.4 y §4.5 para trade-off con `Order` correctivo persistido.

**Ubicación exigida:** header de `newBill/page.tsx`, junto a `SessionManager` y `PrintModeSelector`, dentro del `BillProvider` (ver §5.1).

---

## 2. Hallazgos del código actual

### 2.1 Página `newBill`

```tsx
// src/app/(protected)/newBill/page.tsx — Server Component
// - auth() + getActiveSession() + getBusinessPrintSettingsAction() en paralelo
// - Resuelve ptoVentas[] y initialBillType vía business.condicionIva -> getDefaultBillType()
// - Render: BillProvider(initialBillType, defaultPtoVenta, qzTrayEnabled)
//   ├─ Header: BillParametersForm + SessionManager + PrintModeSelector
//   └─ ProductsTable(session) -> PrintableTable + BillButtons
```

- Es un **Server Component** con `Suspense`. El header usa `flex justify-between`.
- `BillProvider` expone `BillState`, `dispatch`, `addItem/removeItem`, `onOrderResetRef`, `initialBillType`, `defaultPtoVenta`, `printMode`, etc.
- **No hay estado de devolución.** Todo el flujo actual es "venta hacia adelante".

### 2.2 Estado de facturación (`BillState` / `BillReducer` / `BillContext`)

- `BillState.products: Product[]` donde `Product.amount: number` siempre es **positivo**. `total` y `totalWithDiscount` se derivan como `sum(salePrice*amount)` redondeado.
- Reducer soporta `addItem`, `addUnit`, `removeUnit`, `removeItem`, `removeAll`, `discount`, `billType`, `ptoVenta`, etc. — **no hay acción negativa**.
- `BillParametersForm` sincroniza `billType`/`ptoVenta` con el context y registra `onOrderResetRef` para reset de formulario.
- `PrintableTable` y `BillButtons` dependen de que `total > 0` para habilitar confirmaciones (`createSale` valida `totalAmount > 0`).

**Conclusión:** Inyectar `amount` negativo rompería:
1. Cálculo de totales/descuento (asume positivos).
2. Validación `totalAmount <= 0 → error`.
3. Lógica AFIP (`finalTotal`, `getEffectiveUnitPrice`).
4. Auditoría (mezcla venta y devolución en el mismo `Order`).

### 2.3 Persistencia existente para devoluciones

**Prisma Schema (ya existente, sin migración necesaria si se reutiliza):**

```prisma
model SaleReturn {
  id         String   @id @default(cuid())
  date       DateTime @default(now())
  total      Float    @default(0)
  reason     String?
  orderId    String
  order      Order    @relation(fields: [orderId], references: [id])
  businessId String
  business   Business @relation(fields: [businessId], references: [id])
  items      SaleReturnItem[]
  @@index([businessId, date])
}
model SaleReturnItem {
  id           String     @id @default(cuid())
  returnId     String
  saleReturn   SaleReturn @relation(fields: [returnId], references: [id], onDelete: Cascade)
  orderItemId  String
  orderItem    OrderItem  @relation(fields: [orderItemId], references: [id])
  productId    String?
  product      Product?   @relation(fields: [productId], references: [id], onDelete: SetNull)
  quantity     Float      // positivo: cuánto se devuelve
  refundAmount Float      @default(0)
}
model StockMovement {
  type     MovementType // SALE | RETURN | ADJUSTMENT | PURCHASE
  quantity Float        // RETURN es positivo (restituye), SALE negativo
  productId String
  orderId   String?
  businessId String
  reason    String?
}
model Order { returns SaleReturn[] }
model Product { saleReturnItems SaleReturnItem[] }
```

- `processReturnAction({ orderId, items: {productId, quantity, refundAmount}[], reason })` en `src/actions/sales/process.ts`:
  - Valida `auth()` → `businessId`.
  - Requiere `CashboxSession` OPEN del usuario actual → `throw "No hay una sesión de caja abierta."`
  - `$transaction({maxWait:10000, timeout:60000})`:
    1. `saleReturn.create` con `total = sum(refundAmount)`
    2. `orderItem.findMany` para mapear `productId → orderItemId`
    3. `bulkUpdateStock([{id, change: +quantity}])` (1 SQL bulk)
    4. `stockMovement.createMany` type `RETURN`, `quantity: +qty`
    5. `saleReturnItem.createMany`
    6. `cashBox.update decrement totalRefund` + `cashMovement.create {total: -refund, paidMethod:"Devolución"}`
  - `after()` → `revalidateTag(STOCK,CASHBOX,ORDERS,SALES)` + `pusher trigger orders-*`.
  - Retorna `{success:true, returnId}` o `fail("Error al procesar la devolución")`.
- Existe `updateOrderAction` que revierte stock y recrea items (edición), distinta de devolución parcial.

### 2.4 Cómo se calcula hoy el total de ventas y qué falta para "descontar devoluciones"

| Capa | Archivo | Estado actual | Gap respecto a clarificación |
|------|---------|---------------|------------------------------|
| **Reporte diario/mensual/anual** | `src/actions/sales/history.ts` → `getDailyReportAction(start,end)` + `src/components/DailyReport.tsx` / `PeriodicReport.tsx` | **Ya descuenta.** Hace `Promise.all([orders, returns, stockMovements])`, calcula `totalSales = sum(orders.total)`, `totalReturns = sum(returns.total)`, expone `netTotal = totalSales - totalReturns` y lo renderiza como "Neto en Caja" + tarjetas de Devoluciones. | Ninguno — es el modelo canónico. La SPEC debe declararlo patrón de referencia y prohibir duplicar lógica. |
| **Historial de ventas / SalesTable** | `src/components/Billing/SalesTable.tsx` + `src/actions/sales/history.ts` → `getSalesAction` + `src/app/(protected)/searchBill/page.tsx` | Solo lista `Order` donde `paidStatus='pago'`, paginado por cursor. `const total = filteredSales.reduce((acc,s)=>acc+(s.totalWithDiscount||0),0)` — **suma bruta, no descuenta retornos**. No muestra `SaleReturn`. | **Falta.** Debe (a) exponer neto, (b) mostrar devoluciones como filas negativas interleaved, o al menos enriquecer cada venta con su `totalReturned` y `netTotal`. |
| **Caja** | `src/actions/sales/process.ts` → `processSaleAction` / `processReturnAction` + `src/actions/cashbox.ts` | `processSaleAction` incrementa `CashBox` solo si `paidMethod==='Efectivo'` (parcial si dos métodos). `processReturnAction` siempre hace `decrement totalRefund` + `cashMovement.total = -refund`. | Correcto para Fase 1. Fase 2 necesitará `refundMethod` selector si la venta fue tarjeta. |
| **Detalle de venta** | `src/app/(protected)/sales/[id]/page.tsx` → `getSaleByIdAction` | Muestra solo `Order` + `OrderItem`s. | Debe mostrar sección "Devoluciones asociadas" con totales negativos y stock restituido. |
| **Ranking / stock** | `processSaleAction` `after()` → `ProductRanking.upsert increment` | Ranking no se decrementa en devolución. | Decisión preexistente: ranking eventual, no crítico. Se mantiene. |

### 2.5 Decisión arquitectónica — cómo cumplir "orden negativa" sin romper invariantes

| Opción | Descripción | Pros | Contras | Veredicto |
|--------|-------------|------|---------|-----------|
| **A. Cantidades negativas en BillState** | Permitir `amount: -2` o `salePrice: -x`, total negativo | Reusa carrito | Rompe reducer/totales/AFIP/validaciones; no auditable; no restituye stock via RETURN; confunde impresión | **Descartada** |
| **B. Nota de crédito fiscal inmediata (AFIP Cbte. Tipo 3/8/13)** | Generar CAE de crédito que referencie factura original | Correcta fiscalmente | Requiere integración AFIP nueva, tipos fuera de `getAfipVoucherTypeCode` (1/6/11), ptoVenta adicional, `cbteAsoc`; no está en pedido | **Reservada para Fase 2** |
| **C. SaleReturn desacoplado + proyección "orden negativa" (recomendada para Fase 1)** | Mantener `SaleReturn` como fuente de verdad (ya existe). Las devoluciones se **visibilizan como órdenes negativas** vía capa de lectura: union `SaleHistoryEntry = {kind:'SALE', bill:BillState} | {kind:'RETURN', return:SaleReturn, parentOrderId}` ordenada por `date desc` y renderizada con estilo negativo (`-total` rojo). Los agregados calculan `net = sum(SALE.total) - sum(RETURN.total)`. | Reusa modelo/tx probado; sin migración; sin duplicar `Order`; `DailyReport` ya sigue este patrón; fácil evolucionar a Nota de Crédito | Requiere nueva query/proyección y ajuste de `SalesTable` | **Adoptada Fase 1** |
| **D. Order correctivo persistido con total negativo** | En la misma tx crear además de `SaleReturn` un `Order` con `total = -refund`, `status='confirmado'`, `paidStatus='pago'`, `notes='Devolución #...'` y `items` espejo negativos | Físicamente hay "una orden negativa" en `Order` (literal a lo pedido); reportes `sum(Order.total)` ya dan neto sin lógica extra | Duplica datos (`SaleReturn` + `Order` negativo) → riesgo de doble conteo si no se migra `getDailyReportAction` a `sum(Order.total)` único; viola invariante `Order.total >0` asumida en `BillState`/AFIP/impresión; requiere migración `OrderType` o `isReturn` + índices; complica reversión | **Descartada para Fase 1, opcional Phase 1b si PO exige fila física en `Order`** — si se elige, debe ir con `OrderType enum SALE|RETURN` o `isReturn Boolean @default(false)` + `@@index([businessId, isReturn, date])`, y `getDailyReportAction` debe evitar doble resta |

**Principio adoptado:** La devolución es una entidad **separada** de la venta, vinculada por `orderId`. El carrito de venta (`BillState`) permanece para ventas; la devolución vive en su propio modal/estado. La "orden negativa" se cumple vía **proyección negativa de lectura** que el usuario percibe como orden negativa (requisito funcional satisfecho) sin contaminar `Order.total` negativo.

> Si en revisión PO insiste en fila física en tabla `Order`, aplicar variante **D** como migración aditiva: `enum OrderType { SALE RETURN }` + `Order.type OrderType @default(SALE)` (o `isReturn Boolean`) y crear el `Order` espejo en la misma tx. Esta SPEC documenta el trade-off; la implementación por defecto es **C**. El QA debe cubrir ambos si se migra.

Futuro crédito fiscal: el `SaleReturn` podrá extenderse con `caeNotaCredito`, `tipoCbte: 3|8|13`, `ptoVentaNota`, `nroCbteNota` sin romper Fase 1 (campos opcionales). No modelarlo ahora.

---

## 3. Alcance

### 3.1 Incluido (Fase 1 — no fiscal pero con "orden negativa" visible)

1. Botón en `newBill/page.tsx` (header, junto a `SessionManager`/`PrintModeSelector`).
2. Modal/Drawer **ReturnManager** con:
   - Búsqueda de venta por ID corto, cliente, fecha o lista de ventas recientes (paginada).
   - Detalle de `Order` + `OrderItem`s con cantidades ya devueltas (para evitar sobre-devolución).
   - Selector de cantidades a devolver por item (0 … `disponible = quantity - sum(prevReturns.quantity)`).
   - Campo `reason` obligatorio (min 3 chars).
   - Cálculo de `refundAmount` por línea y total (usa `OrderItem.price` original, respeta descuento proporcional si aplica — ver §4.2).
3. Validación cliente y servidor (Zod), control de sesión de caja, idempotencia cliente.
4. Ejecución vía `processReturnAction` (o wrapper nuevo que lo delega) dentro de transacción Prisma.
5. Feedback: toasts, deshabilitado sin sesión, confirmación, actualización optimista vía Pusher/revalidate.
6. **Descuento de ventas:** todo agregado de ventas debe exponer `totalSales`, `totalReturns`, `netTotal = totalSales - totalReturns` siguiendo el patrón canónico de `getDailyReportAction`. `PeriodicReport`/`DailyReport` ya lo hacen — no regresión. `SalesTable` y cualquier nuevo listado deben adoptar el mismo cálculo (ver §4.5).
7. **Orden negativa visible:** en historial de ventas (`searchBill` / `SalesTable`) las devoluciones aparecen como **filas negativas** (amount rojo, `-$total`, badge "Devolución", link a venta origen `#OrderId`). El detalle de venta (`sales/[id]`) muestra sección "Devoluciones asociadas". La proyección se ordena cronológicamente interleaved con ventas por `date desc`. El `CashMovement` negativo ya existente (`total: -refund, paidMethod:"Devolución"`) permanece y debe ser visible en movimientos de caja.
8. Testabilidad y accesibilidad.

### 3.2 Fuera de alcance (explícitamente no hacer en Fase 1)

- Nota de Crédito AFIP/ARCA automática (tipos 3,8,13), CAE de devolución, QR de crédito (Fase 2).
- Cantidades negativas, totales negativos en `BillState`, modificación de `BillReducer` para soportar negativos.
- **Persistir `Order` con `total` negativo salvo decisión explícita de migrar a `OrderType.RETURN` (variante D).** Por defecto no se crea fila en `Order`; la orden negativa es view-model.
- Cambios de `prisma/schema.prisma` salvo que se adopte variante D (`Order.type`/`isReturn`) o futuros campos fiscales (`SaleReturn.caeNotaCredito` etc.) — en ese caso migración aditiva con `default(SALE)/default(false)` y sin downtime.
- Ajuste de `ProductRanking` en devolución (ranking es eventual, no crítico; si se incluye, será en `after()`).
- Devoluciones sin `orderId` (producto suelto sin trazabilidad).
- Edición de `Order` vía devolución; son flujos distintos.
- Cambios visuales a impresión térmica/PDF de devolución en Fase 1 (se imprime ticket simple de devolución o reutiliza flujo existente si se desea, pero no bloqueante).

---

## 4. Diseño propuesto

### 4.1 UX / Colocación del botón

```
newBill/page.tsx Header (bg-white / dark)
┌────────────────────────────────────────────────────────────────────┐
│ BillParametersForm                      SessionManager  [Devolución]  PrintModeSelector │
│ (Factura/IVA/Pago)                    (Abrir/Cerrar)  [↩︎ Gestionar    (thermal/pdf)  │
│                                                        devoluciones]                    │
└────────────────────────────────────────────────────────────────────┘
ProductsTable (abajo, sin cambios)
```

- **Componente:** `ReturnManagerButton` (client, `"use client"`), renderizado **dentro** de `BillProvider` para poder leer `session` si necesita, pero sin leer/escribir `BillState`.
- **Estilo:** `variant="outline"` con icono `Undo2`/`RotateCcw`, `rounded-lg h-10`, coherente con `BillButtons` (shadcn `Button`). No duplica estilos de `BillButtonsDefault`.
- **Habilitación:** Siempre visible. Si `!hasActiveSession`, click muestra `toast.error("Debe abrir una sesión...")` y abre `SessionManager` (reusa `useCashbox().setIsOpeningModalOpen(true)`). Si `!isOnline`, toast offline.
- **Atajo opcional:** `F6` abre el modal (no colisiona con F1-F5,F7,F9,F10 usados).
- **Accesibilidad:** `aria-label="Gestionar devoluciones"`, foco atrapado en modal, `Esc` cierra.

**Wiring en `newBill/page.tsx` (Server Component) — cambio mínimo:**

```tsx
// src/app/(protected)/newBill/page.tsx
import ReturnManagerButton from "@/components/Billing/ReturnManagerButton";
// dentro del header, dentro de BillProvider:
<div className="flex items-center gap-3">
  <SessionManager hasActiveSession={hasActiveSession} />
  <ReturnManagerButton session={session} />
  <PrintModeSelector />
</div>
```

No se altera `BillProvider` ni `ProductsTable` salvo importar el botón.

### 4.2 Flujo de devolución (state machine)

```
[Idle] -- click "Gestionar devoluciones" --> [Modal Open: Search]
  Search --> getSalesAction({cursor,take}) o searchOrdersAction(query)
         --> selecciona Order --> [Detail: items + ya devuelto]
Detail -- ajusta cantidades (steppers) + reason --> [Validating]
Validating -- 0<qty<=disponible && reason>=3 && session OPEN --> habilita Confirmar
Confirmar -- acquire lock (useRef) --> processReturnAction({orderId, items, reason})
        -- success --> toast.success, cierra modal, revalidate, pusher
        -- error   --> toast.error, libera lock, permanece en Detail para reintento
Cancelar/Esc --> cierra sin side-effects
```

**Cálculo de `refundAmount`:**

```ts
// Por cada OrderItem seleccionado:
const available = item.quantity - sumPrevReturnsForThisOrderItem;
const qtyToReturn = clamp(userInput, 0, available);
// Precio efectivo = OrderItem.price (snapshot al vender), no Product.salePrice actual
// Si la venta tuvo descuento, el refund proporcional:
const discountFactor = order.discountPercentage > 0 ? (1 - order.discountPercentage/100) : 1;
const refundAmount = Math.round(qtyToReturn * item.price * discountFactor);
// totalReturn = sum(refundAmount)
```

- Si la venta no tuvo descuento, factor =1.
- No se permite `refundAmount` manual libre en Fase 1 para evitar fraude; derivado automáticamente. Si negocio necesita monto libre, Fase 2 lo añade como override con permiso ADMIN.

**Validación de sobre-devolución (clave):** El servidor debe recalcular `available` dentro de la tx; el cliente solo pre-valida. Si dos usuarios devuelven concurrentemente, el segundo que exceda disponible falla con `fail("Cantidad a devolver excede lo disponible")`.

### 4.3 Interfaces y contratos

#### Zod Schemas (`src/schemas/index.ts` o `src/schemas/returns.ts`)

```ts
export const ReturnItemSchema = z.object({
  productId: z.string().cuid(),
  quantity: z.number().positive().refine(n => Number.isFinite(n)),
  refundAmount: z.number().nonnegative(),
});
export const ProcessReturnSchema = z.object({
  orderId: z.string().cuid(),
  items: z.array(ReturnItemSchema).min(1, "Seleccione al menos un producto"),
  reason: z.string().trim().min(3, "Motivo mínimo 3 caracteres").max(500),
});
export type ProcessReturnInput = z.infer<typeof ProcessReturnSchema>;
```

#### Server Actions

**Reutilizar existente + wrappers de lectura/escritura:**

```ts
// src/actions/sales/process.ts — YA EXISTE, no modificar firma salvo validación Zod interna
export async function processReturnAction(
  data: ProcessReturnInput
): Promise<{success:true; returnId:string} | {error:string}>;

// Nuevo (o en src/actions/sales/history.ts):
export async function searchOrdersForReturnAction(
  query: string, // id parcial, cliente, o vacío = recientes
  opts?: { take?: number; cursor?: string }
): Promise<{success:true; data: Array<Pick<Order, "id"|"date"|"total"|"seller"> & {clientName?:string; itemCount:number}>} | {error:string}>

export async function getOrderReturnStatusAction(orderId:string)
  : Promise<{success:true; data:{
      order: BillState; // mapeado via mapOrderToBillState
      prevReturns: Array<{orderItemId:string; productId:string; quantity:number}>;
      availableByItem: Array<{orderItemId:string; productId:string; available:number}>
    }} | {error:string}>

// NUEVO para cumplir clarificación "descontar ventas / orden negativa visible":
// Proyección unificada para historial (patrón recomendado C — view-model, sin migración Order)
export type SaleHistoryEntry =
  | { kind: "SALE";   id: string; date: Date; bill: BillState; total: number }
  | { kind: "RETURN"; id: string; date: Date; saleReturn: SaleReturn & {items: SaleReturnItem[]}; orderId: string; total: number /* positivo almacenado, se renderiza como -total */; reason: string | null }

export async function getSalesWithReturnsAction(params?: {cursor?:string; take?:number})
  : Promise<{ entries: SaleHistoryEntry[]; nextCursor: string | null }>

export async function getSaleReturnsForOrderAction(orderId:string)
  : Promise<{success:true; data: Array<SaleReturn & {items: (SaleReturnItem & {product: Product|null})[]}>} | {error:string}>

// Agregado neto (reusa getDailyReportAction; si se necesita helper ligero):
export async function getNetSalesSummaryAction(start:Date, end:Date)
  : Promise<{success:true; data:{totalSales:number; totalReturns:number; netTotal:number; orderCount:number; returnCount:number}} | {error:string}>
```

- Todas las acciones: `auth()` → `businessId` → `403` si falta; validan con Zod; usan `db.$transaction`; `revalidateTag` + `pusher` en `after()`.
- `getSalesWithReturnsAction` debe filtrar **siempre por `businessId`** (aislamiento multi-tenant) y ordenar `entries` por `date desc` interleaved.

#### Componentes (client)

```ts
// src/components/Billing/ReturnManagerButton.tsx
"use client";
interface Props { session: Session | null }
export default function ReturnManagerButton({session}: Props) {
  const [open, setOpen] = useState(false);
  // lock ref para idempotencia
}

// src/components/Billing/ReturnManagerModal.tsx
interface ReturnManagerModalProps {
  open: boolean; onOpenChange: (v:boolean)=>void;
  session: Session | null;
}

// src/components/Billing/ReturnOrderSearch.tsx
// - Input + debounce 300ms -> searchOrdersForReturnAction
// - Lista paginada, seleccionar

// src/components/Billing/ReturnItemSelector.tsx
// props: { order: BillState; availableByItem: Map; onChange: (items:ReturnItem[])=>void }
// - Tabla con steppers por item, muestra disponible, precio, subtotal refund

// src/components/Billing/ReturnSummary.tsx
// props: { items: ReturnItem[]; reason: string; onReasonChange; totalRefund: number }

// NUEVO para "orden negativa visible":
// src/components/Billing/SaleHistoryEntryRow.tsx
// props: { entry: SaleHistoryEntry }
// - Si kind==='SALE' renderiza fila normal (como hoy en SaleAccordion)
// - Si kind==='RETURN' renderiza fila negativa: bg-red-50, texto text-red-600, "-$total", badge "Devolución", subtítulo "Ref: Venta #<orderId.slice(-6)>", tooltip reason/date
```

- No se añade estado global a `BillContext`; el modal maneja su propio `useState`/`useReducer` local. Si se desea compartir lock, usar `useRef` local (como `BillButtons`).

### 4.4 Transacción y consistencia (Prisma + PostgreSQL)

- **Isolation:** `db.$transaction` default `Serializable` es suficiente; usar `maxWait`/`timeout` como `processSaleAction`.
- **Orden de writes dentro de tx (ya implementado en processReturnAction):**
  1. `findMany orderItem` (lectura)
  2. Validar `available` (calcular `sum(prevReturns)` si se añade check — requiere `saleReturnItem.findMany where orderItemId in [...]`)
  3. `saleReturn.create`
  4. `bulkUpdateStock (+qty)`
  5. `stockMovement.createMany RETURN`
  6. `saleReturnItem.createMany`
  7. `cashBox.update decrement` + `cashMovement.create -total`
  - **Variante D (si se migra a Order negativo):** paso 8 dentro de la **misma tx** → `order.create { total: -totalRefund, status: confirmado, paidStatus: pago, businessId, clientId: parent.clientId, seller, paymentMethod: "Devolución", notes: "Devolución #${returnRecord.id} ref ${orderId}", items: create mirror con quantity y price negativos o positivos según convención }`. Esta fila es la que hace `sum(Order.total)` ya neto. En ese caso `getDailyReportAction` debe dejar de restar `SaleReturn` para evitar doble descuento.
- **Agregar validación de sobre-devolución** (mejora sobre implementación actual que no valida disponible):
  ```ts
  const prev = await tx.saleReturnItem.groupBy({
    by: ['orderItemId'], where: { orderItem:{ orderId: data.orderId } }, _sum:{quantity:true}
  });
  // verificar cada item solicitado <= (orderItem.quantity - prevSum)
  ```
- **Cashbox:** solo decrementa efectivo (devolución siempre es salida de efectivo en Fase 1). Si la venta original fue con tarjeta/cuenta, la devolución igualmente debita caja salvo que se modele devolución por mismo método (Fase 2).
- **Ranking:** opcional decrementar `ProductRanking.totalSold/totalIncome` en `after()`; no bloquea respuesta.

### 4.5 Modelo de "orden negativa" y reglas de agregación (nuevo — satisface clarificación)

**Definición de verdad:**

- `SaleReturn.total` se **almacena positivo** (ej. `180`), pero **se presenta como `-180`** en UI y se **resta** en agregados.
- `CashMovement` de devolución se almacena **negativo** (`total: -180, paidMethod:"Devolución"`), decrementa `CashBox` y es auditable por sesión.

**Fórmulas canónicas (no duplicar):**

```ts
// getDailyReportAction ya implementa:
totalSales    = orders.reduce((a,o) => a + o.total, 0)          // sum(Order.total) where paidStatus='pago'
totalReturns  = returns.reduce((a,r) => a + r.total, 0)          // sum(SaleReturn.total)
netTotal      = totalSales - totalReturns
// PeriodicReport/DailyReport consumen {totalSales, totalDiscounts, totalReturns, returnCount, netTotal, paymentMethods}

// Para listados que hoy solo suman ventas (SalesTable):
// Antes (bug respecto a clarificación):
const grossTotal = filteredSales.reduce((a,s) => a + (s.totalWithDiscount||0), 0)
// Después (Fase 1, patrón C):
const grossTotal = /* sum(SALE) */;
const returnsTotal = /* sum(RETURN) en el mismo rango de fechas/filtros */;
const netTotal = grossTotal - returnsTotal;
// O bien consumir getSalesWithReturnsAction que ya retorna entries interleaved y computar neto en cliente.
```

**Reglas de UI:**

1. **Historial (`searchBill` / `SalesTable`):** consumir `getSalesWithReturnsAction` (o enriquecer `getSalesAction` para retornar también `returns`). Renderizar `SaleHistoryEntryRow` interleaved por `date desc`. Fila `RETURN` lleva: `Badge variant="destructive" "Devolución"`, `total` en `text-red-600` con signo `-`, `reason` tooltip, link "Ver venta origen #XXXXXX" → `/sales/[orderId]`, y no ofrece botón Editar.
2. **Totales del historial:** mostrar 3 valores: `Ventas brutas: $X`, `Devoluciones: -$Y`, `Neto: $Z`. El `total` hoy mostrado pasa a ser `netTotal` (o ambos si se quiere transición). El QA debe verificar que el neto descuenta exactamente el `SaleReturn` creado.
3. **Detalle de venta (`sales/[id]`):** bajo la tabla de productos, sección "Devoluciones asociadas" que lista `getSaleReturnsForOrderAction(orderId)` con `quantity`, `refundAmount` por item, `reason`, `date`. Si `sum(returns.quantity) === sum(orderItem.quantity)` mostrar badge "Devolución total".
4. **Caja / movimientos:** el `CashMovement` negativo ya creado por `processReturnAction` debe ser filtrable como "Devolución" en el reporte de caja. No crear segundo movimiento si se adopta variante D.
5. **Paginación/cursor:** `getSalesWithReturnsAction` pagina por `date desc` sobre union de dos tablas. Implementación simple Fase 1: `take` + `cursor` sobre `Order`, y `SaleReturn` en rango `[cursor.date, now]` con `take` similar, merge y slice. No N+1, usar `select` mínimo + `include items` solo para RETURN. Índices existentes `@@index([businessId, date])` en ambos modelos son suficientes.

**Variante D — si se migra a Order negativo persistido:**

```prisma
// prisma/schema.prisma — aditivo, sin downtime
enum OrderType { SALE RETURN }
model Order {
  // ...existing
  type     OrderType @default(SALE)
  // isReturn Boolean @default(false) // alternativa
  parentOrderId String? // nullable, FK a Order origen si type=RETURN
  parentOrder   Order?  @relation("ReturnParent", fields: [parentOrderId], references: [id])
  childReturns  Order[] @relation("ReturnParent")
  @@index([businessId, type, date])
}
```

En ese caso la "orden negativa" es fila real con `total: -refund` y `getDailyReportAction` debe cambiar a `totalSales = sum(Order.total where type=SALE)`, `totalReturns = sum(-Order.total where type=RETURN)` o simplemente `netTotal = sum(Order.total)` sin doble resta. La SPEC marca variante D como opcional; el implementador debe elegir C por defecto y documentar si migra.

### 4.6 Gestión de errores

| Caso | HTTP/App | Mensaje usuario | Reset |
|------|----------|-----------------|-------|
| Sin sesión auth | `{error:"No autorizado"}` | "Sesión expirada" | No |
| Sin `CashboxSession` OPEN | `throw` → `fail` | "Debe abrir una sesión de caja" + abre modal | No |
| Validación Zod falla | `{error}` | Mensaje Zod | No |
| `quantity > available` | `fail` | "Cantidad excede lo disponible" | No |
| `orderId` no pertenece a `businessId` | `fail` | "Venta no encontrada" | No |
| DB error | `fail` | "Error al procesar la devolución" | No; lock liberado |
| Offline | check `navigator.onLine` | "Sin conexión" | No |

Todos los errores liberan el lock de confirmación y mantienen el modal abierto para reintento. Éxito cierra modal y muestra `toast.success("Devolución #${returnId} procesada")`.

---

## 5. Estructura de archivos

### 5.1 Nuevos archivos

| Archivo | Propósito |
|---------|-----------|
| `src/components/Billing/ReturnManagerButton.tsx` | Botón header + orquestación modal (client) |
| `src/components/Billing/ReturnManagerModal.tsx` | Dialog con tabs Search/Detail/Confirm (shadcn Dialog) |
| `src/components/Billing/ReturnOrderSearch.tsx` | Búsqueda/paginación de órdenes |
| `src/components/Billing/ReturnItemSelector.tsx` | Tabla de items con stepper y cálculo refund |
| `src/components/Billing/ReturnSummary.tsx` | Total refund + textarea reason + Confirmar/Cancelar |
| `src/components/Billing/SaleHistoryEntryRow.tsx` | **NUEVO (clarificación):** fila unificada SALE/RETURN para historial (estilo negativo si RETURN) |
| `src/lib/sales-aggregates.ts` | **NUEVO (clarificación):** helpers `netTotal = totalSales - totalReturns`, `toHistoryEntries(orders, returns)` — evita duplicar lógica de `getDailyReportAction` |
| `src/actions/sales/returns.ts` *(opcional)* | `searchOrdersForReturnAction`, `getOrderReturnStatusAction`, `getSalesWithReturnsAction`, `getSaleReturnsForOrderAction` — o extender `history.ts`/`process.ts` |
| `src/schemas/returns.ts` *(o en `index.ts`)* | `ReturnItemSchema`, `ProcessReturnSchema` |

### 5.2 Archivos modificados

| Archivo | Cambio |
|---------|--------|
| `src/app/(protected)/newBill/page.tsx` | Importar y renderizar `ReturnManagerButton` junto a `SessionManager`/`PrintModeSelector` (3 líneas). Permanece Server Component. |
| `src/actions/sales/process.ts` | Añadir validación Zod + check de disponible antes de crear retorno (mejora, no breaking). Si se crea `returns.ts`, mover `processReturnAction` allí y re-exportar desde `process.ts` para compatibilidad. |
| `src/actions/sales/history.ts` | Añadir `getSalesWithReturnsAction`, `getSaleReturnsForOrderAction` y opcional `getNetSalesSummaryAction`. Mantener `getDailyReportAction` como patrón canónico neto. Si se adopta variante D, documentar cambio de agregación. |
| `src/components/Billing/SalesTable.tsx` | **Clarificación:** consumir `getSalesWithReturnsAction` o enriquecer `getSalesAction` para mostrar filas RETURN negativas y totales `gross/returns/net`. Mantener realtime `pusher orders-*`. |
| `src/app/(protected)/sales/[id]/page.tsx` | Añadir sección "Devoluciones asociadas" vía `getSaleReturnsForOrderAction`. |
| `src/app/(protected)/searchBill/page.tsx` | Pasar `entries` (SALE+RETURN) o mantener `sales` + `returns` separados; renderizar `SaleHistoryEntryRow`. |
| `prisma/schema.prisma` | **Sin cambios por defecto (patrón C).** Si se adopta variante D: añadir `Order.type OrderType @default(SALE)` + `parentOrderId` + índices (migración aditiva). Reservado Fase 2 para `SaleReturn.caeNotaCredito` etc. |

### 5.3 Diagrama de estructura

```
src/app/(protected)/newBill/page.tsx  (Server)
 └─ BillProvider
     ├─ Header: BillParametersForm | SessionManager | ReturnManagerButton* | PrintModeSelector
     └─ ProductsTable
          └─ PrintableTable + BillButtons

ReturnManagerButton (client)
 └─ ReturnManagerModal (Dialog)
     ├─ ReturnOrderSearch  -> searchOrdersForReturnAction
     ├─ ReturnItemSelector -> getOrderReturnStatusAction
     └─ ReturnSummary      -> processReturnAction

src/actions/sales/
 ├─ process.ts  (processSaleAction, processReturnAction + validación disponible)
 ├─ history.ts  (getSalesAction, getSaleByIdAction, getOrderReturnStatusAction*, getSalesWithReturnsAction*, getSaleReturnsForOrderAction*)
 └─ returns.ts* (opcional split)

src/lib/sales-aggregates.ts  (netTotal helpers — usa patrón getDailyReportAction)

src/components/Billing/SalesTable.tsx  -> consume getSalesWithReturnsAction -> SaleHistoryEntryRow (SALE | RETURN negativo)
src/app/(protected)/sales/[id]/page.tsx -> sección Devoluciones asociadas

src/schemas/returns.ts (Zod)
```

`*` opcional según preferencia de split; mantener `process.ts` como fuente única es válido.

---

## 6. Dependencias

| Dependencia | Tipo | Justificación |
|-------------|------|---------------|
| `@prisma/client` | Existente | Tipos `SaleReturn`, `OrderItem`, `StockMovement`, `OrderType` si variante D |
| `zod` | Existente | Validación `ProcessReturnSchema` |
| `sonner` | Existente | Toasts |
| `next/cache` `revalidateTag` | Existente | Invalidación STOCK/CASHBOX/ORDERS/SALES |
| `@/lib/pusher-server` | Existente | Trigger `orders-{businessId}` |
| `@/lib/batch-utils` `bulkUpdateStock` | Existente | Stock bulk update |
| `shadcn Dialog`, `Button`, `Input`, `Textarea`, `Badge` | Existente | UI modal + fila negativa |
| `lucide-react` `Undo2`/`RotateCcw`/`ArrowDownLeft` | Existente | Icono devolución / orden negativa |
| No nuevas dependencias | — | — |

---

## 7. Criterios de aceptación verificables (medibles, TDD-ready)

### 7.1 Botón en `newBill`

- [ ] **AC1 — Visibilidad y colocación:** En `newBill/page.tsx`, dentro del header y dentro de `BillProvider`, existe un botón con texto visible "Devoluciones" (o "Gestionar devoluciones") y `aria-label="Gestionar devoluciones"`, ubicado en el mismo `flex gap-3` que `SessionManager` y `PrintModeSelector`. El botón es visible en desktop (`min-width 1024`) y mobile sin overflow.
- [ ] **AC2 — Interacción abre modal:** Click en el botón cambia `open=true` y renderiza `ReturnManagerModal` con `role="dialog"` y foco atrapado. `Esc` o click en overlay cierra el modal sin llamar a ninguna Server Action.
- [ ] **AC3 — Sin sesión de caja:** Si `hasActiveSession === false`, click muestra `toast.error("Debe abrir una sesión")` (verificable con mock de `sonner`) y llama a `setIsOpeningModalOpen(true)` (mock `useCashbox`). No abre el flujo de búsqueda.
- [ ] **AC4 — Sin afectar venta viva:** Abrir/cerrar el modal no despacha `removeAll`, no modifica `BillState.products`, `total`, `discount` ni `BillParametersForm`. Verificable comparando `BillState` antes/después con `renderHook`.
- [ ] **AC5 — Server Component intacto:** `newBill/page.tsx` sigue siendo `async` Server Component, sin `"use client"`, y mantiene `Promise.all([auth, getActiveSession, getBusinessPrintSettings])`.

### 7.2 Búsqueda y selección de venta

- [ ] **AC6 — Búsqueda paginada:** `ReturnOrderSearch` al montar llama a `searchOrdersForReturnAction` (o `getSalesAction`) y muestra lista de ventas; input con debounce 300ms filtra por `id` parcial o `client`. Con query vacía muestra últimas N (ej. 10) ordenadas `date desc` filtradas por `businessId`.
- [ ] **AC7 — Aislamiento multi-tenant:** Buscar con `businessId` A nunca retorna órdenes de `businessId` B (test con 2 businesses, assert 0 resultados cruzados).
- [ ] **AC8 — Selección carga detalle:** Al seleccionar una venta, se llama a `getOrderReturnStatusAction(orderId)` (o `getSaleByIdAction`) y se muestra tabla de `OrderItem`s con columnas: descripción, código, `cantidad vendida`, `ya devuelto`, `disponible`, `cantidad a devolver` (stepper), `precio unit`, `refund` calculado.
- [ ] **AC9 — Disponible correcto:** Si un `Order` tiene `OrderItem quantity=5` y ya existe un `SaleReturnItem quantity=2` para ese `orderItemId`, el `disponible` mostrado es `3` y el stepper tiene `max=3`.

### 7.3 Validación y cálculo

- [ ] **AC10 — Validación cliente bloquea Confirmar:** Botón Confirmar está `disabled` si: ningún item con `qty>0`, o algún `qty > disponible`, o `reason.trim().length <3`, o `qty` no es entero/float válido según `unit`.
- [ ] **AC11 — Cálculo refund:** Para `OrderItem price=100`, `discount=10%`, `qtyToReturn=2`, el `refundAmount` mostrado y enviado es `Math.round(2*100*0.9)=180`. Sin descuento, `2*100=200`. Verificable en `ReturnItemSelector` y en payload de `processReturnAction`.
- [ ] **AC12 — Zod server-side:** Enviar `{orderId:"bad", items:[], reason:"ab"}` a `processReturnAction` retorna `{error: string}` con mensaje de validación, no crea `SaleReturn`.
- [ ] **AC13 — Sobre-devolución bloqueada server:** Intentar devolver `qty=4` cuando `disponible=3` retorna `{error:"Cantidad a devolver excede"}` (o similar) y no crea registros, ni `StockMovement`, ni `CashMovement`.

### 7.4 Transacción y persistencia

- [ ] **AC14 — Tx crea todos los registros:** Una devolución exitosa con 2 items crea exactamente: 1 `SaleReturn` (`total=sum refund`), N `SaleReturnItem`, N `StockMovement` (`type RETURN, quantity +qty`), 1 `CashMovement` (`total -refund, paidMethod Devolución`), y actualiza `Product.amount += qty` (via `bulkUpdateStock`) y `CashBox.total -= refund` — todo dentro de `db.$transaction`. Verificable con `prisma.saleReturn.findUnique` + counts. Si variante D está activa, además crea 1 `Order` con `type=RETURN` y `total=-refund` en la misma tx.
- [ ] **AC15 — Stock restitución:** `Product.amount` antes `10`, tras devolver `2` queda `12`. `StockMovement` correspondiente tiene `quantity=2, type=RETURN, reason` contiene `Devolución #`.
- [ ] **AC16 — Caja decremento:** `CashBox.total` antes `1000`, `totalRefund=180` → después `820`. `CashMovement` creado con `total=-180`.
- [ ] **AC17 — Idempotencia cliente (doble click):** Dos clicks síncronos en Confirmar antes del siguiente render producen **una sola** llamada a `processReturnAction` (lock `useRef` verificable con `vi.fn` mock, `expect(mock).toHaveBeenCalledTimes(1)`).
- [ ] **AC18 — Reintento tras fallo:** Si `processReturnAction` retorna error, el lock se libera, el modal permanece abierto, y un nuevo click vuelve a llamar a la acción (segundo intento posible).
- [ ] **AC19 — Cancelación no persiste:** Cerrar modal sin confirmar no llama a `processReturnAction`, no crea `SaleReturn`, no modifica stock/caja.

### 7.5 Descuento de ventas y orden negativa visible (nuevo — clarificación)

- [ ] **AC20 — Reportes descuentan devoluciones:** `getDailyReportAction(date)` con 2 ventas de `100` y `200` y 1 devolución de `50` retorna `{totalSales:300, totalReturns:50, netTotal:250}`. Idem `PeriodicReport` para rango mensual/anual. Verificable con seed DB y `expect(res.data.netTotal).toBe(250)`.
- [ ] **AC21 — SalesTable descuenta y muestra neto:** `SalesTable` con `filteredSales` bruta `300` y `returns` `50` renderiza "Ventas brutas: $300", "Devoluciones: -$50", "Neto: $250" y el `total` principal es `250` (no `300`). El cálculo usa `sales-aggregates.ts` sin duplicar lógica de `getDailyReportAction`.
- [ ] **AC22 — Historial muestra devolución como orden negativa:** Tras crear `SaleReturn total=180` (order `abc123`), `getSalesWithReturnsAction()` retorna `entries` con `{kind:'RETURN', total:180, orderId:'abc123'}` ordenada `date desc`. `SalesTable` renderiza una fila con `data-testid="return-row"`, clase `text-red-600`/`bg-red-50`, texto `-$180`, badge `Devolución`, y link a `/sales/abc123`. La fila no es editable (no `Edit`).
- [ ] **AC23 — Detalle de venta lista devoluciones:** `GET /sales/[id]` con 2 `SaleReturn` asociadas muestra sección `Devoluciones asociadas (2)` con tabla: fecha, cantidad, `refundAmount` negativo, `reason`. Suma `totalReturned = 180+70 =250` y muestra `Neto de la venta: total(500) - devuelto(250) = 250`.
- [ ] **AC24 — Filtro por fecha y paginación incluyen retornos:** `getSalesWithReturnsAction({cursor, take})` con `take=10` y rango `2026-09-01..2026-09-04` retorna union `orders+returns` donde `returns` dentro del rango aparecen aunque su `orderId` sea de fecha anterior. Paginación no omite retornos ni duplica.
- [ ] **AC25 — Aislamiento multi-tenant de retornos:** `SaleReturn` de `businessId B` no aparece en `getSalesWithReturnsAction` de `businessId A`, ni afecta su `netTotal`. Test con 2 businesses.
- [ ] **AC26 — Variante D (solo si se migra Order negativo):** Tras devolución `180`, existe `Order` con `type=RETURN` (o `isReturn=true`), `total=-180`, `parentOrderId=abc123`. `sum(Order.total)` ya da neto y `getDailyReportAction` no resta doble. Test verifica `prisma.order.count where type=RETURN` y `sum`.

### 7.6 No regresión

- [ ] **AC27 — Flujo de venta intacto:** Crear una venta normal (Factura/Remito/A cuenta/Presupuesto) después de abrir/cerrar el modal de devolución sigue funcionando, con totales correctos y `processSaleAction` sin cambios.
- [ ] **AC28 — Lint y tipos:** `npx tsc --noEmit` y `npm run lint` pasan sin errores nuevos en archivos modificados.
- [ ] **AC29 — Revalidate y realtime:** Tras éxito, se llama a `revalidateTag(STOCK)`/`CASHBOX`/`ORDERS`/`SALES` y `pusherServer.trigger("orders-{businessId}","orders-update")` (verificable con mocks). `SalesTable` y `PeriodicReport` se refrescan sin reload.
- [ ] **AC30 — Accesibilidad:** Modal tiene `DialogTitle`, `DialogDescription`, foco inicial en búsqueda, tab order lógico, contraste AA, y el botón es `keyboard` accesible (`Enter`/`Space`). Fila RETURN tiene `aria-label="Devolución -$180 ref venta #abc123"`.
- [ ] **AC31 — Performance:** Búsqueda no hace N+1; usa `findMany` con `take` + `cursor` y `select` mínimo. `processReturnAction` mantiene `bulkUpdateStock` + `createMany` (2-3 queries, no 2N). `getSalesWithReturnsAction` hace 2 queries paralelas (`Order` + `SaleReturn`) + merge, no N+1.

---

## 8. Estrategia de pruebas TDD (para QA)

### 8.1 Orden de implementación

1. **Schemas:** `ReturnItemSchema`, `ProcessReturnSchema` — tests Zod.
2. **Actions:** `searchOrdersForReturnAction`, `getOrderReturnStatusAction`, `processReturnAction` (con validación disponible) — tests con `prisma` mock o DB test.
3. **Agregados y proyección negativa (nuevo):** `sales-aggregates.ts` + `getSalesWithReturnsAction` + `getSaleReturnsForOrderAction` — tests que `netTotal = totalSales - totalReturns`, que `entries` interleaved están ordenados y filtrados por `businessId`, y que `ReturnRow` renderiza `-total` rojo.
4. **Componentes puros:** `ReturnItemSelector` (cálculo, stepper limites), `ReturnSummary` (validación), `SaleHistoryEntryRow` (SALE vs RETURN).
5. **Integración modal:** `ReturnManagerButton` + `ReturnManagerModal` — mocks de actions, `useCashbox`, `sonner`.
6. **Página:** `newBill/page.tsx` — test que botón existe dentro de provider y no rompe Server Component.
7. **Reportes y caja:** `getDailyReportAction` + `PeriodicReport` neto, `SalesTable` neto, `sales/[id]` sección devoluciones.
8. **E2E opcional:** flujo completo buscar → seleccionar → confirmar → verificar DB → verificar SalesTable neto y fila negativa → verificar reporte diario neto.

### 8.2 Mocks necesarios

- `auth()` → `{user:{businessId, id, email}}`
- `db.$transaction` → callback con `tx` mock que registra calls
- `pusherServer.trigger` → `vi.fn()`
- `revalidateTag` → `vi.fn()`
- `useCashbox` → `{hasActiveSession, setIsOpeningModalOpen}`

### 8.3 Casos edge a cubrir

- Orden sin items (no debería ocurrir, pero modal muestra empty state).
- Producto eliminado (`productId null` en OrderItem) — mostrar snapshot `description/code` y permitir devolución sin link a Product (solo `orderItemId`).
- Devolución total (todos los items al 100% disponible) vs parcial.
- Concurrencia: dos devoluciones simultáneas que suman > disponible → segunda falla.
- Offline: `navigator.onLine === false` → bloquea Confirmar y muestra toast.
- **Nuevo:** Rango de reporte que incluye retorno cuyo `SaleReturn.date` es hoy pero `Order.date` es hace 30 días — el neto del día actual debe descontar ese retorno (retorno cuenta por `date` de devolución, no de venta).
- **Nuevo:** Devolución con múltiples métodos de pago en venta origen — refund total se descuenta de `CashBox` efectivo; documentar limitación y testear que no afecta `paymentMethods` breakdown de ventas (solo resta neto).
- **Nuevo:** Paginación `getSalesWithReturnsAction` con `cursor` en medio de interleaving — no perder retornos.

---

## 9. Decisiones y riesgos

| Decisión | Razón | Riesgo mitigado |
|----------|-------|-----------------|
| Reusar `SaleReturn` sin migración + proyección negativa (patrón C) | Ya probado, bulk ops optimizados, sin downtime; `getDailyReportAction` ya descuenta de este modo | Evita drift de schema, facilita review; cumple "orden negativa" como view-model sin violar `Order.total>0` |
| No tocar `BillState` para devoluciones | Preserva invariantes de venta, evita regresión AFIP | Previene totales negativos/CAE corrupto |
| Botón en header dentro de Provider | Reusa `hasActiveSession` y `session` sin prop drilling extra | Evita importar `auth()` en client |
| Validación disponible en server (groupBy) | Cliente puede ser manipulado; concurrencia real | Previene sobre-devolución y stock fantasma |
| Lock `useRef` en Confirmar | `blockButton` state no protege eventos síncronos | Previene doble `SaleReturn` por doble click |
| `after()` para pusher/revalidate | No bloquea respuesta al usuario | Mantiene latencia baja |
| Centralizar `netTotal` en `sales-aggregates.ts` + `getDailyReportAction` | Evita que `SalesTable` y `PeriodicReport` diverjan | Previene bugs de doble resta/omisión |
| Mostrar retornos como filas negativas interleaved | Satisface literal "has to have an order negative" sin fila física | Usuario ve orden negativa inmediata; fiscalidad futura puede migrar a variante D |
| Fase 1 sin Nota de Crédito AFIP | Complejidad fiscal requiere tipos 3/8/13 y ptoVenta; fuera de pedido | Entrega valor rápido sin riesgo fiscal |
| Documentar variante D (Order correctivo) sin implementarla por defecto | Deja puerta abierta si PO exige fila física en `Order` | Evita re-trabajo; QA sabe qué testear si se migra |

**Riesgo abierto:** Devoluciones de ventas con múltiples métodos de pago (efectivo+tarjeta). Fase 1 siempre debita `CashBox` en efectivo; si la venta fue tarjeta, el comerciante deberá gestionar reintegro externo. Documentar y planear Fase 2 con `refundMethod` selector. Si variante D se adopta, ese `Order` RETURN debe reflejar `paymentMethod:"Devolución"` para no contaminar breakdown por método.

---

## 10. Futuro (Fase 2 — Nota de Crédito)

- Extender `SaleReturn` con `caeNotaCredito?: Json`, `tipoCbteNota: Int (3=A,8=B,13=C)`, `ptoVentaNota`, `nroCbteNota`, `qrDataNota`.
- Acción `createAfipCreditNoteAction` similar a `createAfipVoucherAction` pero con `tipoFactura` crédito y `cbteAsoc` referenciando `Order.CAE.nroComprobante`.
- UI: checkbox "Generar Nota de Crédito AFIP" en `ReturnSummary` (feature-gated `hasAfipBilling`).
- Impresión: ticket de crédito con CAE y QR.
- Si se adoptó patrón C, la Nota de Crédito simplemente enriquece `SaleReturn`; si se adoptó D, la Nota referencia el `Order` RETURN.

No implementar en Fase 1; dejar campos reservados si se desea.

---

## 11. Checklist de entrega

- [ ] `SPEC.md` (este archivo) revisado con PO — clarificación 2026-09-04 incorporada.
- [ ] QA genera tests según §7 y §8, incluyendo AC20-AC26 (descuento y orden negativa).
- [ ] Dev implementa §5.1 con TDD, incluyendo `SaleHistoryEntryRow` y `sales-aggregates.ts` y `getSalesWithReturnsAction`.
- [ ] Reviewer verifica AC1-AC31 + `tsc`/`lint` + que `getDailyReportAction` y `SalesTable` coinciden en neto.
- [ ] Demo en staging con `businessId` de prueba: venta $500 → devolución parcial $180 → verificar stock/caja → verificar fila negativa `-$180` en `searchBill` → verificar `DailyReport` neto `320` → verificar detalle `sales/[id]` muestra devolución.
- [ ] Si PO exige Order físico negativo, ejecutar migración variante D y re-validar AC26.
