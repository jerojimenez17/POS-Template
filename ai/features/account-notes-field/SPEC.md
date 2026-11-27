# SPEC.md — Account Notes Field

## Feature Name
`account-notes-field`

## Goal
Add an optional text field (`notes`) to orders in the Account Ledger system, enabling users to store additional information such as "who took the products away", delivery instructions, or any other relevant context. The field must be purely optional and fully backward compatible with existing orders that lack notes.

---

## Background

The Account Ledger system currently allows users to create "cuenta corriente" (credit) orders. Once created, orders appear in a table on the account-ledger page and have a detail page. Users frequently need to annotate orders with contextual information — for example, the name of the person who picked up the products, delivery notes, or special instructions. Currently there is no field to capture this data, forcing users to either leave no notes or use other workarounds.

This feature adds a simple, optional `notes` text field to the Order model and surfaces it in:
1. The order creation flow (via `ClientSelectionModal`)
2. The account-ledger table (below the client name)
3. The account detail page

---

## Requirements

### R1: Database — Optional `notes` Field
Add an optional string field `notes` to the `Order` model in the Prisma schema.
- Type: `String?` (nullable)
- No default value
- No unique constraint

### R2: Order Creation — Notes Input
When creating an order via `ClientSelectionModal`, the user must be able to enter optional notes text. This includes:
- A text input (textarea) in the order creation section of the modal
- Passing the notes value through the API route
- Persisting the notes value in the database via the `createUnpaidOrder` server action

### R3: Account Ledger Table — Display Notes
On the account-ledger table page (`src/app/(protected)/account-ledger/page.tsx`), when an order has notes, display them **below the client name** in the same table cell. The text should appear in a smaller, muted font.

### R4: Account Detail Page — Display Notes
On the account detail page (`src/app/(protected)/account-ledger/[id]/page.tsx`), show the notes in the client info section (or a dedicated notes section) when present.

### R5: Backward Compatibility
Existing orders without notes must continue to work without any errors. The UI must not break when `notes` is null/undefined.

---

## Technical Design

### 1. Database Schema Change

**File:** `prisma/schema.prisma`

Add a single field to the `Order` model (after `paidStatus` or in a logical grouping position):

```prisma
model Order {
  // ... existing fields ...
  paidStatus PaidStatus  @default(inpago)
  notes      String?     // ← NEW: optional notes/observations field
  seller     String?
  // ... rest of model ...
}
```

- **Migration:** Run `npx prisma generate` and `npx prisma db push` after the change.
- **No need for a formal migration** if using `db push` in development; production deployments will use `prisma migrate dev` or `prisma migrate deploy`.

### 2. Server Action — Update Input Type

**File:** `src/actions/unpaid-orders.ts`

**a.** Add `notes?: string` to the `CreateUnpaidOrderInput` interface:

```typescript
interface CreateUnpaidOrderInput {
  clientId: string;
  businessId: string;
  items: UnpaidOrderItem[];
  total: number;
  clientIvaCondition?: string;
  clientDocumentNumber?: string;
  notes?: string; // ← NEW
}
```

**b.** In the `createUnpaidOrder` function, pass `notes` through in the `tx.order.create` call:

```typescript
const order = await tx.order.create({
  data: {
    clientId: input.clientId,
    businessId,
    total: input.total,
    status: "confirmado",
    paidStatus: "inpago",
    date: new Date(),
    notes: input.notes || null,     // ← NEW: pass notes, default to null
    clientIvaCondition: input.clientIvaCondition,
    clientDocumentNumber: input.clientDocumentNumber,
    items: { /* ... */ },
  },
});
```

### 3. API Route — Pass Notes Field

**File:** `src/app/api/unpaid-orders/route.ts`

Destructure `notes` from the request body alongside the existing fields and pass it to `createUnpaidOrder`:

```typescript
const { clientId, items, total, clientIvaCondition, clientDocumentNumber, notes } = body;

const result = await createUnpaidOrder({
  clientId,
  businessId: session.user.businessId,
  items,
  total,
  clientIvaCondition,
  clientDocumentNumber,
  notes, // ← NEW
});
```

No validation is needed for `notes` — it is purely optional and accepts any string.

### 4. Client Selection Modal — Notes Input

**File:** `src/components/ledger/ClientSelectionModal.tsx`

**a.** Add a new state variable:
```typescript
const [orderNotes, setOrderNotes] = useState("");
```

**b.** Reset the notes state when the modal opens (in the existing `useEffect`):
```typescript
useEffect(() => {
  if (open) {
    fetchClients();
    setSelectedClientId("");
    setOrderClientCuit("");
    setOrderClientIva("");
    setOrderNotes("");      // ← NEW: reset notes
    setExistingOrders([]);
    setSelectedExistingOrderId(null);
    setShowExistingOrderDialog(false);
  }
}, [open]);
```

**c.** Add a textarea inside the `{selectedClientId && (...)}` section, after the CUIT/IVA fields:

```tsx
{selectedClientId && (
  <div className="space-y-2 border rounded-lg p-3">
    {/* existing CUIT field */}
    {/* existing IVA field */}

    {/* NEW: Notes field */}
    <div className="grid gap-2">
      <label htmlFor="orderNotes" className="text-xs font-medium">Notas / Observaciones (opcional)</label>
      <textarea
        id="orderNotes"
        placeholder="Ej: Retiró Juan Pérez, DNI 12345678"
        value={orderNotes}
        onChange={(e) => setOrderNotes(e.target.value)}
        rows={2}
        className="flex h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-none"
      />
    </div>
  </div>
)}
```

**d.** In the `createNewOrder` function, include `notes` in the fetch body:

```typescript
const response = await fetch("/api/unpaid-orders", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    clientId,
    businessId,
    items: orderItems,
    total,
    clientIvaCondition: orderClientIva || undefined,
    clientDocumentNumber: orderClientCuit || undefined,
    notes: orderNotes.trim() || undefined, // ← NEW
  }),
});
```

**Note:** If `notes` is empty or whitespace-only, pass `undefined` so it is not sent to the API.

### 5. Account Ledger Table — Display Notes

**File:** `src/app/(protected)/account-ledger/page.tsx`

**a.** Update the `OrderWithClient` type to include `notes`:

```typescript
type OrderWithClient = {
  id: string;
  date: Date;
  total: number;
  status: string;
  paidStatus: string;
  clientId: string | null;
  client: { id: string; name: string | null } | null;
  notes?: string | null; // ← NEW
};
```

**b.** In the client name table cell, add notes display below the client name:

```tsx
<TableCell className="font-medium">
  <div className="flex items-center gap-2">
    <User className="h-4 w-4 text-muted-foreground" />
    {isOrderOverdue(order) && <OverdueIndicator />}
    {order.client?.name || "Sin cliente"}
  </div>
  {/* NEW: Notes display */}
  {order.notes && (
    <p className="text-xs text-muted-foreground mt-1 ml-6 line-clamp-2" title={order.notes}>
      {order.notes}
    </p>
  )}
</TableCell>
```

**Design details:**
- Notes appear on a new line below the client name
- Indented (`ml-6`) to align with the text after the icon
- Small font (`text-xs`), muted color (`text-muted-foreground`)
- Truncated to 2 lines (`line-clamp-2`) with full text in `title` attribute for hover
- Only rendered when `order.notes` is truthy (not null, not empty)

### 6. Account Detail Page — Display Notes

**File:** `src/app/(protected)/account-ledger/[id]/page.tsx`

**a.** Update the `OrderWithRelations` type to include `notes`:

```typescript
interface OrderWithRelations {
  id: string;
  date: Date;
  total: number;
  // ... existing fields ...
  notes?: string | null; // ← NEW
  // ... remaining fields ...
}
```

**b.** Add a notes display section in the client info area (after the client name block, around line 144):

```tsx
<div className="flex items-center gap-3 p-3 bg-muted/30 rounded-lg">
  <User className="h-5 w-5 text-muted-foreground" />
  <div>
    <p className="text-xs text-muted-foreground uppercase font-medium">Cliente</p>
    <p className="font-medium">{order.client?.name || "Sin cliente"}</p>
    {/* NEW: Notes display */}
    {order.notes && (
      <p className="text-sm text-muted-foreground mt-1 whitespace-pre-wrap">
        {order.notes}
      </p>
    )}
  </div>
</div>
```

**Alternative placement:** If the notes are better displayed as a dedicated card or section below the client info, add a separate section:

```tsx
{order.notes && (
  <div className="flex items-start gap-3 p-3 bg-muted/30 rounded-lg">
    <div>
      <p className="text-xs text-muted-foreground uppercase font-medium">Notas / Observaciones</p>
      <p className="text-sm mt-1 whitespace-pre-wrap">{order.notes}</p>
    </div>
  </div>
)}
```

**Decision:** Include notes **inside the client info block** (inline approach). This keeps the layout compact and associates the notes directly with the client context. If notes are especially long, `whitespace-pre-wrap` preserves line breaks.

### 7. File Structure

| Action | File | Description |
|--------|------|-------------|
| **MODIFY** | `prisma/schema.prisma` | Add `notes String?` field to `Order` model |
| **MODIFY** | `src/actions/unpaid-orders.ts` | Add `notes?: string` to `CreateUnpaidOrderInput`; pass to `tx.order.create` |
| **MODIFY** | `src/app/api/unpaid-orders/route.ts` | Destructure `notes` from body; pass to `createUnpaidOrder` |
| **MODIFY** | `src/components/ledger/ClientSelectionModal.tsx` | Add state, textarea, and pass `notes` in fetch body |
| **MODIFY** | `src/app/(protected)/account-ledger/page.tsx` | Add `notes` to `OrderWithClient` type; render below client name |
| **MODIFY** | `src/app/(protected)/account-ledger/[id]/page.tsx` | Add `notes` to `OrderWithRelations` type; render in client info section |

No new files are needed. All changes are additive modifications to existing files.

### 8. Visual Design Specification

**Creation Modal (ClientSelectionModal):**

```
┌─────────────────────────────────────────┐
│  ✕  Crear Orden a Cuenta                │
│─────────────────────────────────────────│
│  🔍 [Buscar cliente...         ] [+ ]   │
│  ┌─────────────────────────────────┐    │
│  │  👤 Juan Pérez                  │    │
│  │  👤 María García                │    │
│  └─────────────────────────────────┘    │
│  ┌─────────────────────────────────┐    │
│  │ CUIT/CUIL (opcional)            │    │
│  │ [20-12345678-9           ]      │    │
│  │ Condición IVA (opcional)        │    │
│  │ [Seleccionar...        ▼]       │    │
│  │ Notas / Observaciones (opcional)│    │
│  │ ┌───────────────────────────┐   │    │
│  │ │ Retiró Juan Pérez,       │   │    │
│  │ │ DNI 12345678             │   │    │
│  │ └───────────────────────────┘   │    │
│  └─────────────────────────────────┘    │
│  Total:                   $15,000.00    │
│─────────────────────────────────────────│
│  [Cancelar]              [Confirmar]     │
└─────────────────────────────────────────┘
```

**Account Ledger Table:**

```
┌─────────────────────────────────────────────────────────────┐
│  Cliente         │ Total      │ Fecha       │ Estado       │
├─────────────────────────────────────────────────────────────┤
│  👤 Juan Pérez   │ $15,000    │ 15/05/2026  │ Pendiente   │
│  ─────────────── │           │             │             │
│  Retiró Juan     │           │             │             │  ← Notes
│  Pérez           │           │             │             │
├─────────────────────────────────────────────────────────────┤
│  👤 María García │ $8,200     │ 10/07/2026  │ Pagado      │
└─────────────────────────────────────────────────────────────┘
```

**Account Detail Page:**

```
┌──────────────────────────────────────────┐
│  Cliente                     Fecha       │
│  👤 Juan Pérez              📅 15/05/26 │
│  ┌─────────────────────┐                │
│  │ Retiró Juan Pérez,  │   ← Notes     │
│  │ DNI 12345678        │   (inline)    │
│  └─────────────────────┘                │
├──────────────────────────────────────────┤
│  Productos                               │
│  ...                                     │
└──────────────────────────────────────────┘
```

---

## Acceptance Criteria

### AC-01: Order model has optional `notes` field
- **Given** the Prisma schema
- **When** inspecting the `Order` model
- **Then** there is a `notes String?` field (nullable, optional)
- **Verification:** Prisma schema shows `notes String?`; `npx prisma generate` succeeds; type definitions include `notes: string | null`

### AC-02: Can save notes when creating an order
- **Given** the ClientSelectionModal is open with a selected client
- **When** the user fills in the "Notas / Observaciones" textarea and clicks "Confirmar"
- **Then** the new order is created with the notes text persisted in the database
- **Verification:** After creation, the order record in the database has the `notes` field populated with the entered text

### AC-03: Notes appear below client name in table row when present
- **Given** an order with notes exists in the account-ledger table
- **When** the OrdersTable component renders
- **Then** the notes text is visible below the client name in the same table cell, in a smaller muted font
- **Verification:** Visual inspection shows notes rendered with `text-xs text-muted-foreground` below the client name line; DOM contains the notes text

### AC-04: Table row looks normal when no notes exist
- **Given** an order without notes (null/undefined)
- **When** the OrdersTable component renders
- **Then** the client name cell shows only the client name (and overdue indicator if applicable) — no extra text, no layout shift
- **Verification:** The row displays normally; no empty `<p>` tags or extra whitespace from notes rendering

### AC-05: Notes visible on account detail page
- **Given** an order with notes
- **When** the user navigates to the account detail page (`/account-ledger/[id]`)
- **Then** the notes text is displayed in the client info section or as a separate notes section
- **Verification:** The account detail page renders the notes text

### AC-06: Existing orders without notes do NOT break
- **Given** an existing order that has `notes = null` (created before this feature)
- **When** viewing the account-ledger table or the account detail page
- **Then** the pages render without errors, showing no notes display
- **Verification:** The page loads successfully; no console errors; no unexpected UI elements

### AC-07: Backend accepts empty/null notes without error
- **Given** the API route or server action
- **When** called without a `notes` field, with `notes: null`, or with `notes: ""`
- **Then** the order is created successfully without validation errors
- **Verification:** API responds with `{ success: true }`; database record has `notes = null` for empty/missing input

---

## Edge Cases

| # | Case | Expected Behavior |
|---|------|-------------------|
| 1 | **Notes not sent in request** (missing field) | `createUnpaidOrder` receives `notes: undefined`; `input.notes || null` → `null` stored. No error. |
| 2 | **Notes sent as empty string `""`** | Trimmed to `undefined` on client side; falls through to `null` in DB. |
| 3 | **Notes sent as `null`** | `input.notes || null` → `null` stored. No error. |
| 4 | **Very long notes (1000+ characters)** | Textarea should allow long text. Database `String?` in Prisma maps to `text` or `varchar` depending on provider. PostgreSQL `text` has no practical limit. UI should handle overflow with `line-clamp-2` on table and full display on detail page. |
| 5 | **Notes with special characters** (HTML, SQL injection, emojis) | Notes pass through Zod? Currently `notes` is not Zod-validated — it flows as `string | undefined`. Prisma parameterizes queries, so SQL injection is not a concern. XSS is not a concern since the app uses React's safe rendering (`{order.notes}` escapes HTML). Emojis and Unicode are handled natively by PostgreSQL UTF-8 support. |
| 6 | **Notes with line breaks** | On the table view, line breaks should be hidden by `line-clamp-2`. On the detail page, `whitespace-pre-wrap` preserves line breaks for readability. |
| 7 | **Notes on orders created via budget mode** | Budget mode (`mode === "budget"`) in ClientSelectionModal calls a different action (`createBudgetAction`). The notes field should NOT be added to budgets unless separately requested — out of scope for this feature. |
| 8 | **Notes on orders created via "add to existing order"** | Notes are only captured at order creation. Adding items to an existing order does not change notes. This is acceptable — the user can add notes when the order is first created. |
| 9 | **Multiple orders with notes in the table** | Each row independently renders its notes. The `line-clamp-2` ensures consistent row height for most cases. Very long notes are truncated and visible via `title` attribute on hover. |
| 10 | **Empty whitespace-only notes** | Trimmed to `undefined` in the modal before sending; stored as `null`. No "invisible" notes displayed. |

---

## Dependencies

No new npm packages required. All UI primitives (`textarea`, `label`) are already available via existing components or native HTML elements.

---

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| **Long notes break table layout** | Variable row heights could make the table look inconsistent | Use `line-clamp-2` to limit visible lines; full text available on hover via `title` attribute |
| **SQL injection via notes field** | Theoretical, but Prisma parameterizes all queries | Prisma client uses parameterized queries — no raw SQL is used, so no injection risk |
| **XSS via notes field** | Notes displayed in UI could contain malicious script | React's JSX escapes all string content by default (`{order.notes}` is safe) |
| **Migration fails on existing database** | Adding a nullable column to a large table could cause locking | `notes String?` is nullable with no default — this is the safest possible schema change. PostgreSQL adds nullable columns almost instantly (metadata-only operation) |
| **Notes lost when order is canceled** | Cancel deletes the order | Currently cancel does a hard delete. If notes need preservation, a soft-delete pattern would be needed — out of scope for this feature |
