# SPEC.md - Order Item Tracking and Editing for Account Ledger

## Feature Request Summary
1. Track when each item was added to unpaid orders (add addedAt field)
2. Allow editing unpaid orders from the detail page (add/edit/remove items)
3. When client selects existing client in ClientSelectionModal, add items to their existing unpaid order or create new one with items grouped by date added

---

## Requirements

### R1: OrderItem addedAt Field
**Description:** Track when each item was added to an unpaid order for identification purposes.

- [ ] Add addedAt field (DateTime) to OrderItem model in Prisma schema
- [ ] When creating items, set addedAt to current timestamp
- [ ] When adding items to existing unpaid order, set addedAt to current timestamp
- [ ] Items should display grouped by addedAt date in the UI

### R2: Edit Unpaid Orders from Detail Page
**Description:** Allow editing unpaid orders (add/edit/remove items) from the account-ledger/[id] page.

- [ ] Show Edit Items button only for unpaid orders (paidStatus === inpago)
- [ ] Enable editing product quantity
- [ ] Enable editing product price
- [ ] Enable removing items from order
- [ ] Enable adding new items to order
- [ ] Recalculate order total when items change
- [ ] Update client balance accordingly
- [ ] Create OrderUpdate records for all changes

### R3: ClientSelectionModal Behavior
**Description:** When selecting an existing client, add items to their existing unpaid order or create new one with items grouped by date.

- [ ] Check if client has existing unpaid order (paidStatus === inpago)
- [ ] If unpaid order exists: add new items to it with current timestamp
- [ ] If no unpaid order exists: create new order with items
- [ ] Display items grouped by date added in order detail view
- [ ] Show date grouping in the items table (e.g., Agregado el: DD/MM/YYYY HH:MM)

---

## Acceptance Criteria

### AC1: Data Model
- [ ] Prisma schema updated with addedAt field in OrderItem model
- [ ] npx prisma generate runs successfully
- [ ] npx prisma db push applies changes to database

### AC2: Item Date Tracking
- [ ] New orders created via ClientSelectionModal have items with addedAt timestamp
- [ ] Items added to existing unpaid orders have their own addedAt timestamp
- [ ] Items table displays items grouped by date added
- [ ] Date format: DD/MM/YYYY HH:MM (Argentine format)

### AC3: Order Editing
- [ ] Edit Items button visible on unpaid order detail page
- [ ] Can increase/decrease item quantity
- [ ] Can modify item price
- [ ] Can remove items from order
- [ ] Can add new items to order
- [ ] Order total updates automatically when items change
- [ ] Client balance updates correctly after changes
- [ ] Cannot edit items on paid orders (button hidden or disabled)

### AC4: Client Selection Flow
- [ ] When client with unpaid order is selected, new items are added to existing order
- [ ] When client without unpaid order is selected, new order is created
- [ ] Items are clearly marked with their addition date
- [ ] User receives confirmation message after operation

### AC5: Validation and Error Handling
- [ ] Stock validation for new items added to existing order
- [ ] Cannot reduce quantity below available stock
- [ ] Appropriate error messages displayed
- [ ] Transaction rollback on failure

### AC6: Code Quality
- [ ] TypeScript strict mode passes
- [ ] ESLint passes with no errors
- [ ] All new components have proper types
- [ ] Server actions return proper ActionResult types

---

## Data Model Changes

### Prisma Schema (prisma/schema.prisma)

Add addedAt field to OrderItem model:

model OrderItem {
  id          String   @id @default(cuid())
  orderId     String
  order       Order    @relation(fields: [orderId], references: [id], onDelete: Cascade)
  
  productId   String?
  product     Product? @relation(fields: [productId], references: [id])

  code        String?
  description String?
  costPrice   Float    @default(0)
  price       Float    @default(0)
  quantity    Float    @default(0) 
  subTotal    Float    @default(0) 
  
  // NEW: Track when item was added
  addedAt     DateTime @default(now())

  returnItems SaleReturnItem[]
  @@index([orderId])
}

---

## File Structure Recommendations

src/
├── actions/
│   ├── unpaid-orders.ts        # Modify: addOrderItems, updateOrderItem, removeOrderItem
│   └── orders.ts               
├── components/
│   └── ledger/
│       ├── ClientSelectionModal.tsx  # Modify: check for existing unpaid order
│       ├── OrderItemsTable.tsx       # NEW: Grouped items display
│       ├── EditOrderItems.tsx        # NEW: Edit items component
│       └── AddItemForm.tsx           # NEW: Add item to order form
├── app/
│   └── (protected)/
│       └── account-ledger/
│           └── [id]/
│               └── page.tsx     # Modify: Add edit button, show grouped items
├── types/
│   └── order.ts                 # NEW: Order-related types
└── schemas/
    └── index.ts                 # Modify: Add validation for order item updates

---

## Server Actions to Implement

In src/actions/unpaid-orders.ts:

// Add items to existing order
export const addItemsToOrder = async (input: AddItemsToOrderInput): Promise<ActionResult>

// Update existing order item
export const updateOrderItem = async (input: UpdateOrderItemInput): Promise<ActionResult>

// Remove item from order
export const removeOrderItem = async (input: RemoveOrderItemInput): Promise<ActionResult>

// Check/get client unpaid order
export const getClientUnpaidOrder = async (clientId: string, businessId: string): Promise<ActionResult>

---

## Implementation Steps

### Step 1: Database Changes
1. Update Prisma schema with addedAt field
2. Run npx prisma generate
3. Run npx prisma db push

### Step 2: Update ClientSelectionModal
1. Fetch existing unpaid order for selected client
2. If exists: add items to it (call new action)
3. If not: create new order (existing behavior)

### Step 3: Create Order Item Editing Components
1. Create OrderItemsTable.tsx with date grouping
2. Create EditOrderItems.tsx for inline editing
3. Create AddItemForm.tsx for adding new items

### Step 4: Update Detail Page
1. Add Edit Items button for unpaid orders
2. Integrate editing components
3. Display items grouped by date

### Step 5: Implement Server Actions
1. Implement addItemsToOrder
2. Implement updateOrderItem
3. Implement removeOrderItem
4. Implement proper stock and balance updates

### Step 6: Testing
1. Test adding items to new client (no existing order)
2. Test adding items to client with existing unpaid order
3. Test editing items (quantity, price)
4. Test removing items
5. Test stock validation
6. Test balance updates
7. Test date grouping display

---

## Related Files to Modify

| File | Change Type | Description |
|------|-------------|-------------|
| prisma/schema.prisma | Modify | Add addedAt to OrderItem |
| src/components/ledger/ClientSelectionModal.tsx | Modify | Check existing unpaid order |
| src/app/(protected)/account-ledger/[id]/page.tsx | Modify | Add edit functionality |
| src/actions/unpaid-orders.ts | Modify | Add new server actions |
| src/types/order.ts | New | Add TypeScript types |
| src/components/ledger/OrderItemsTable.tsx | New | Display grouped items |
| src/components/ledger/EditOrderItems.tsx | New | Edit items component |

---

## Dependencies

---

## BillParametersForm Document Number Bug Fix

### Bug Description

In `src/components/Billing/BillParametersForm.tsx`, the document number field uses a **dynamic field name** based on the current client condition:

```typescript
name={
  form.watch("clientCondition") === ClientConditions.CUIT
    ? ClientConditions.CUIT
    : ClientConditions.DNI
}
```

However, in the `onSubmit` function, the code **always** tries to read `DNI`:

```typescript
documentNumber: form.getValues().DNI ?? 0,  // Line 52
```

### Root Cause Analysis

**Problematic Scenarios:**

| Scenario | Steps | Result |
|----------|-------|--------|
| Initial DNI → Change to CUIT | Select DNI, enter value, switch to CUIT, enter value, submit | `form.getValues().DNI` returns `undefined` because field is now named `"CUIT"` ❌ |
| Initial CUIT | Select CUIT, enter value, submit | `form.getValues().DNI` returns `undefined` ❌ |
| Initial DNI → Submit | Select DNI, enter value, submit | Works correctly ✓ |

**Schema Analysis (`src/schemas/index.ts:109-119`):**
```typescript
export const BillParametersSchema = z.object({
  clientCondition: z.string(),
  // ...
  CUIT: z.coerce.number().optional(),  // Only one exists at a time
  DNI: z.coerce.number().optional(),    // Only one exists at a time
  // ...
});
```

### Acceptance Criteria

- [ ] `onSubmit` reads the correct field based on `clientCondition`
- [ ] When `clientCondition === "CUIT"`, use `form.getValues().CUIT`
- [ ] When `clientCondition === "DNI"`, use `form.getValues().DNI`
- [ ] When `clientCondition === "Consumidor Final"`, document number defaults to `0`
- [ ] `BillState.documentNumber` contains the correct value after form submission
- [ ] `BillState.typeDocument` and `IVACondition` correctly reflect `clientCondition`
- [ ] Display logic aligns with submission logic (show correct field based on condition)

### Proposed Fix

**Minimal Change - Modify `onSubmit` in `BillParametersForm.tsx:41-57`:**

```typescript
const onSubmit = () => {
  const clientCondition = form.getValues().clientCondition;
  const documentNumber = 
    clientCondition === ClientConditions.CUIT 
      ? form.getValues().CUIT ?? 0
      : clientCondition === ClientConditions.DNI 
        ? form.getValues().DNI ?? 0
        : 0;
      
  setState({
    ...form.getValues(),
    id: "",
    products: BillState.products,
    total: BillState.total,
    totalWithDiscount: BillState.totalWithDiscount,
    seller: BillState.seller,
    billType: form.getValues().billType,
    date: currentDate,
    typeDocument: clientCondition,
    documentNumber,
    IVACondition: clientCondition,
  });
  
  setEditParameters(false);
};
```

**Display Logic Fix (`BillParametersForm.tsx:326-330`):**

The display should use the same conditional logic:
```typescript
{form.watch("clientCondition") === ClientConditions.CUIT && form.getValues().CUIT && (
  <div className="flex items-center gap-1.5 text-gray-600 dark:text-gray-400">
    <span>CUIT:</span>
    <span className="font-medium text-gray-900 dark:text-gray-200">{form.getValues().CUIT}</span>
  </div>
)}

{form.watch("clientCondition") === ClientConditions.DNI && form.getValues().DNI && (
  <div className="flex items-center gap-1.5 text-gray-600 dark:text-gray-400">
    <span>DNI:</span>
    <span className="font-medium text-gray-900 dark:text-gray-200">{form.getValues().DNI}</span>
  </div>
)}
```

### Files to Modify

| File | Change | Line(s) |
|------|--------|---------|
| `src/components/Billing/BillParametersForm.tsx` | Fix `onSubmit` document number logic | 41-57 |
| `src/components/Billing/BillParametersForm.tsx` | Fix display logic | 326-330 |

### Test Cases

| Test | Steps | Expected Result |
|------|-------|-----------------|
| TC1 | Select DNI, enter 12345678, submit | `documentNumber: 12345678` |
| TC2 | Select CUIT, enter 20345678901, submit | `documentNumber: 20345678901` |
| TC3 | Select "Consumidor Final", submit | `documentNumber: 0` |
| TC4 | Select DNI, enter value, switch to CUIT, enter value, submit | `documentNumber` = new CUIT value |
| TC5 | Select CUIT, enter value, switch to DNI, enter value, submit | `documentNumber` = new DNI value |

---

## Printing Replacement: react-to-print → Cross-Browser Alternative

### 1. Análisis del Problema

#### ¿Por qué react-to-print falla en Android Chrome?

`react-to-print` funciona utilizando `window.print()` internamente, lo cual genera varios problemas en Android Chrome:

| Problema | Descripción |
|----------|-------------|
| **API de impresión limitada** | Android Chrome no expone correctamente la API de impresión en ciertos contextos |
| **WebViews** | Si la app corre dentro de una WebView (ej: desde otra app), la API de impresión puede no estar disponible |
| **Print Preview issues** | El preview de impresión en Android Chrome puede fallar o no renderizar correctamente |
| **Share dialog como fallback** | En lugar de abrir el diálogo de impresión, Android puede abrir el Share dialog |
| **Inconsistencia de estilos** | CSS `@media print` puede no aplicarse correctamente en el contexto de Android |

#### Problemas específicos reportados

1. **Issue #187 en react-to-print**: En iPad con Chrome, se imprime toda la UI en lugar del componente seleccionado
2. **Print.js issue #716**: PDF printing no funciona en Android Chrome/Edge
3. **Android WebView**: `window.print()` puede no estar disponible en absoluto

---

### 2. Comparación de Alternativas

#### 2.1 `@thermal-print/react` (v0.4.0)

**Repository**: npm - @thermal-print/react  
**Última actualización**: Diciembre 2025  
**Weekly Downloads**: ~5 (muy nuevo)  
**Compatibilidad React**: ^18.0.0  

| Aspecto | Detalle |
|--------|---------|
| **Pros** | ✅ Ofrece 3 paths: ESC/POS, PrintNode IR, HTML/PDF |
| | ✅ Migration guide desde @react-pdf/renderer |
| | ✅ Soporte para browser printing |
| | ✅ React 18/19 compatible |
| **Contras** | ❌ Muy nuevo (Dic 2025), riesgo de cambios API |
| | ❌ Pocos downloads, comunidad pequeña |
| | ❌ No hay issues abiertos para revisar estabilidad |

#### 2.2 `react-thermal-printer` (v0.22.0)

**Repository**: https://github.com/seokju-na/react-thermal-printer  
**Stars**: 450 | **Forks**: 62  
**Weekly Downloads**: ~3,000  
**Última actualización**: Marzo 2026  
**Compatibilidad React**: ^18.0.0 || ^19  

| Aspecto | Detalle |
|--------|---------|
| **Pros** | ✅ Maduro y estable (desde 2022) |
| | ✅ Soporte React 19 |
| | ✅ Genera ESC/POS bytes directamente |
| **Contras** | ❌ Requiere conexión WebUSB/WebSerial al printer |
| | ❌ No usa dialog de impresión del browser |
| | ❌ Solo funciona con impresoras térmicas ESC/POS |

#### 2.3 `html2canvas` + `jspdf` (Manual)

| Aspecto | Detalle |
|--------|---------|
| **Pros** | ✅ Total control sobre el output |
| | ✅ Funciona en todos los browsers |
| | ✅ PDF generado puede descargarse o imprimirse |
| **Contras** | ❌ Bundle size alto (~500KB combined) |
| | ❌ Renderizado asíncrono puede causar FOUC |

#### 2.4 `prntr` (Print.js fork)

| Aspecto | Detalle |
|--------|---------|
| **Pros** | ✅ Muy ligero |
| **Contras** | ❌ **Explicitamente NO funciona en Chrome Mobile** |
| | ❌ **Explicitamente NO funciona en Safari Mobile** |

#### Comparación Resumida

| Librería | Android Chrome | iOS Safari | Desktop | Thermal Printers |
|----------|---------------|------------|---------|------------------|
| `react-to-print` (actual) | ⚠️ Problemas | ✅ | ✅ | ❌ |
| `@thermal-print/react` | ✅ Esperado | ✅ Esperado | ✅ | ✅ |
| `react-thermal-printer` | N/A (WebUSB) | ❌ | ✅ (WebUSB) | ✅ |
| `html2canvas + jspdf` | ✅ | ✅ | ✅ | ❌ |

---

### 3. Recomendación

#### Solución Híbrida Recomendada

**Elegir**: `@thermal-print/react` + Fallback con `html2canvas` + `jspdf`

#### Justificación

1. **`@thermal-print/react`** ofrece:
   - Conversion a HTML (para browser printing estándar)
   - Conversion a ESC/POS (para impresoras térmicas directas)
   - Migration guide desde `@react-pdf/renderer` (similar API a lo actual)

2. **Fallback con `html2canvas` + `jspdf`**:
   - Si `@thermal-print/react` falla
   - Genera PDF que puede descargarse o imprimirse
   - Funciona en todos los browsers móviles

3. **Arquitectura propuesta**:

```
PrintableTable.tsx
       │
       ▼
┌─────────────────────────────────────────────────────────────┐
│                    PrintProvider.tsx                         │
│  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐  │
│  │ BrowserPrint  │  │ ThermalPrint  │  │  PDFExport    │  │
│  │ (default)     │  │ (optional)    │  │  (fallback)   │  │
│  └───────────────┘  └───────────────┘  └───────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

---

### 4. Requisitos Detallados

#### 4.1 Requisitos Funcionales

| ID | Requisito | Prioridad |
|----|-----------|-----------|
| RF-01 | Imprimir ticket/factura desde Android Chrome | Crítico |
| RF-02 | Imprimir ticket/factura desde iOS Safari | Crítico |
| RF-03 | Imprimir ticket/factura desde Desktop browsers | Crítico |
| RF-04 | Mantener diseño actual del ticket | Alta |
| RF-05 | Mantener funcionalidad de QR code (CAE) | Alta |
| RF-06 | Soporte para impresoras térmicas via ESC/POS (opcional) | Media |

#### 4.2 Requisitos No Funcionales

| ID | Requisito | Prioridad |
|----|-----------|-----------|
| RNF-01 | Compatibilidad con React 19 | Crítico |
| RNF-02 | Compatibilidad con Next.js 15 | Crítico |
| RNF-03 | TypeScript strict mode | Crítico |
| RNF-04 | Mantener bundle size razonable (<200KB adicional) | Alta |

---

### 5. Criterios de Aceptación

| # | Criterio | Método de Verificación |
|---|----------|------------------------|
| CA-01 | Impresión funciona en Android Chrome (Chrome 120+) | Test manual en dispositivo físico |
| CA-02 | Impresión funciona en iOS Safari (iOS 17+) | Test manual en simulador/dispositivo |
| CA-03 | Impresión funciona en Chrome Desktop (Windows/Mac) | Test manual |
| CA-04 | QR Code CAE se imprime correctamente | Verificación visual del ticket |
| CA-05 | Diseño del ticket se mantiene idéntico | Comparación screenshot antes/después |
| CA-06 | npm run build exitoso | Verificación automática |
| CA-07 | npm run lint exitoso | Verificación automática |

---

### 6. Estructura de Archivos

#### 6.1 Archivos a Modificar

```
src/
├── components/
│   └── Billing/
│       ├── PrintableTable.tsx     # MODIFICAR - Reemplazar react-to-print
│       └── PrintableTable.css     # NUEVO - Estilos de impresión
├── lib/
│   └── print/                     # NUEVO - Módulo de utilidades
│       ├── index.ts
│       ├── BrowserPrint.ts
│       ├── ThermalPrint.ts
│       └── PDFExport.ts
```

#### 6.2 Archivos a Crear

| Archivo | Descripción |
|---------|-------------|
| `src/lib/print/index.ts` | Exports centralizados |
| `src/lib/print/BrowserPrint.ts` | Print via browser API |
| `src/lib/print/ThermalPrint.ts` | Print via ESC/POS (opcional) |
| `src/lib/print/PDFExport.ts` | Fallback PDF |

#### 6.3 Archivos a Eliminar

| Archivo | Razón |
|---------|-------|
| `react-to-print` (dependency) | Reemplazado |

---

### 7. Nuevas Dependencias

#### Dependencias Principales

```json
{
  "dependencies": {
    "@thermal-print/react": "^0.4.0",
    "html2canvas": "^1.4.1",
    "jspdf": "^2.5.2"
  }
}
```

#### Análisis de Bundle Size

| Paquete | Tamaño Estimado |
|---------|-----------------|
| `@thermal-print/react` | ~50KB |
| `html2canvas` | ~300KB |
| `jspdf` | ~200KB |

**Total mínimo estimado**: ~350KB

---

### 8. Plan de Implementación

#### Fase 1: Setup y Configuración
1. Instalar dependencias
2. Crear estructura de archivos `src/lib/print/`
3. Crear módulo de utilidades

#### Fase 2: Implementación Core
1. Implementar `BrowserPrint.ts` con fallback logic
2. Modificar `PrintableTable.tsx` para usar el nuevo sistema
3. Testear en Desktop

#### Fase 3: Mobile Testing
1. Testear en Android Chrome (device real)
2. Testear en iOS Safari (device real)
3. Ajustar si es necesario

#### Fase 4: Cleanup
1. Remover `react-to-print` de package.json
2. Verificar build y lint

---

### 9. Checklist de Implementación

```markdown
- [ ] Instalar dependencias (@thermal-print/react, html2canvas, jspdf)
- [ ] Crear src/lib/print/
- [ ] Implementar BrowserPrint.ts
- [ ] Implementar PDFExport.ts
- [ ] Modificar PrintableTable.tsx
- [ ] Test Desktop browsers
- [ ] Test Android Chrome
- [ ] Test iOS Safari
- [ ] Verificar QR code
- [ ] npm run build exitoso
- [ ] npm run lint exitoso
- [ ] Remover react-to-print de package.json
```
