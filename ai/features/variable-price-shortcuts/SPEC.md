# SPEC: Configurable Keyboard Shortcuts for Variable-Price Products

## 1. Detailed Requirements

### 1.1 Problem

The admin cannot assign keyboard shortcuts (F1, F2, F3) to products with variable price. Currently:
- F1/F2/F3 are hardcoded to open invoice/remito/account modals on the bill page
- Products with variable price (e.g., custom items where the cashier types a price) must be found via search every time
- No admin UI exists to configure product shortcuts
- The price column in the products table is read-only

### 1.2 Scope

1. **New Prisma model** `ShortcutConfig` — stores per-business keyboard shortcut → product associations
2. **Server Actions** — CRUD operations for shortcut configs + product lookup by shortcut
3. **Admin Settings UI** — new section in `/admin/settings/` with 3 rows (F1, F2, F3) each with a product search
4. **Bill Page Keyboard Remapping**:
   - F1, F2, F3 → shortcut product lookup + add to cart with `salePrice=0` + focus price input
   - F4 → Factura (invoice) modal (was F1)
   - F9 → Remito (delivery note) modal (was F2)
   - F10 → A cuenta (add to account) modal (was F3)
   - F5 → Presupuesto (budget) modal (was F4, feature-gated)
5. **Editable Price** — price cell in `PrintableTable` becomes editable inline (click to edit)
6. **Auto-focus** — when a shortcut product is added, focus the price input for that row

### 1.3 Non-Goals

- Do **not** change the existing product search/scan flow
- Do **not** add new npm packages
- Do **not** modify the thermal/PDF print logic
- Do **not** change the `Product` domain model class

---

## 2. Acceptance Criteria

### 2.1 Data Model — `ShortcutConfig`

- [ ] **AC1**: A new `ShortcutConfig` model exists in `prisma/schema.prisma` with fields: `id`, `businessId`, `key` (String), `productId`, and relations to `Business` and `Product`.
- [ ] **AC2**: The model has a unique constraint on `[businessId, key]` so each key can have at most one config per business.
- [ ] **AC3**: Deleting a `Business` or `Product` cascades to delete associated `ShortcutConfig` rows.
- [ ] **AC4**: An index exists on `businessId` for efficient queries.

### 2.2 Server Actions — `src/actions/shortcuts.ts`

- [ ] **AC5**: `getShortcutConfigsAction(businessId)` returns an array of `{ id, key, productId, product: { id, description, code, salePrice } }` for the given business.
- [ ] **AC6**: `saveShortcutConfigAction(businessId, key, productId)` performs an upsert — if a config exists for that `businessId + key`, it updates the `productId`; otherwise creates a new record. Returns `{ success: true, data: ShortcutConfig }` or `{ success: false, error: string }`.
- [ ] **AC7**: `saveShortcutConfigAction` validates input with Zod: `key` must be one of `"F1" | "F2" | "F3"`, `productId` must be a non-empty string.
- [ ] **AC8**: `deleteShortcutConfigAction(businessId, key)` removes the record and returns `{ success: true }` or `{ success: false, error: string }`.
- [ ] **AC9**: `getProductByShortcutAction(key)` uses the current session's `businessId`, looks up the `ShortcutConfig` and returns the associated `Product` (via Prisma adapter) or `null` if not configured.
- [ ] **AC10**: All server actions authenticate via `auth()` and return `{ error: "No autorizado" }` if no session or no `businessId`.
- [ ] **AC11**: Database errors are caught, logged, and returned as `{ error: "mensaje legible" }`.

### 2.3 Admin Settings UI — `/admin/settings/`

- [ ] **AC12**: A new section "Atajos de teclado" (Keyboard Shortcuts) appears below the ARCA form on `/admin/settings/`.
- [ ] **AC13**: The section shows 3 rows labeled F1, F2, F3, each with:
  - A product search input (reusing the same search logic as `ProductSearchBar`)
  - The currently configured product description/code displayed when a product is selected
  - A "×" button to clear the shortcut
- [ ] **AC14**: A "Guardar" (Save) button at the bottom saves all 3 configs at once (or each individually).
- [ ] **AC15**: On page load, the existing configs are fetched and pre-populated.
- [ ] **AC16**: Success/error toast notifications appear after save.

### 2.4 Bill Page — Keyboard Remapping (`BillButtons.tsx`)

- [ ] **AC17**: On mount, `BillButtonsDefault` fetches the shortcut configs for the current business via `getShortcutConfigsAction` and stores them in a local state map (e.g., `{ F1: productId, F2: productId, F3: productId }`).
- [ ] **AC18**: When F1, F2, or F3 is pressed **and** a shortcut is configured:
  - `e.preventDefault()` is called
  - The product is fetched via `getProductByShortcutAction(key)`
  - The product is dispatched to the bill with `salePrice: 0` and `amount: 1`
  - The focus is moved to the price input for that row
  - A toast "Producto agregado — ingrese el precio" appears
- [ ] **AC19**: When F1, F2, or F3 is pressed **and** no shortcut is configured, nothing happens (the key is ignored — no modal opens).
- [ ] **AC20**: F4 opens the "Factura" confirmation modal (was F1).
- [ ] **AC21**: F9 opens the "Remito" confirmation modal (was F2).
- [ ] **AC22**: F10 opens the "A cuenta" modal (was F3).
- [ ] **AC23**: F5 opens the "Presupuesto" modal (moved from F4), feature-gated by `hasBudget`.
- [ ] **AC24**: The shortcut fetching is skipped when `isEditing` is true.

### 2.5 Editable Price Field (`PrintableTable.tsx`)

- [ ] **AC25**: The salePrice cell for each product row displays as an inline editable input (not just text).
- [ ] **AC26**: The input is styled to match the existing table design (no jarring visual change when not focused).
- [ ] **AC27**: The input validates that the value is a positive number on blur/Enter.
- [ ] **AC28**: On value change, the product's `salePrice` is updated via a new dispatch action `updateSalePrice` in the bill reducer.
- [ ] **AC29**: When `focusPriceProductId` is set in context, the corresponding price input receives focus automatically.

### 2.6 Auto-Focus on Shortcut Add

- [ ] **AC30**: A new state `focusPriceProductId` is added to `BillContext`, initially `null`.
- [ ] **AC31**: After a shortcut product is added (AC18), `focusPriceProductId` is set to the new product's `id`.
- [ ] **AC32**: `PrintableTable` watches `focusPriceProductId` — when it changes, it focuses the price input for that row and then resets the context state back to `null`.

### 2.7 Tests

- [ ] **AC33**: Unit tests for `src/actions/shortcuts.ts` cover: successful CRUD, authentication failure, validation errors, database errors.
- [ ] **AC34**: Component tests for the admin settings shortcut section cover: rendering existing configs, selecting a product, saving, clearing.
- [ ] **AC35**: Component tests for `BillButtonsDefault` cover: shortcut key handling (F1/F2/F3 with and without config), remapped keys (F4, F9, F10, F5).

---

## 3. Data Models and Interfaces

### 3.1 Prisma Model — Add to `prisma/schema.prisma`

```prisma
model ShortcutConfig {
  id         String   @id @default(cuid())
  businessId String
  business   Business @relation(fields: [businessId], references: [id], onDelete: Cascade)
  key        String   // "F1" | "F2" | "F3"
  productId  String
  product    Product  @relation(fields: [productId], references: [id], onDelete: Cascade)

  @@unique([businessId, key])
  @@index([businessId])
}
```

### 3.2 TypeScript Types — `src/models/ShortcutConfig.ts`

```typescript
// Domain type matching what the UI needs
export interface ShortcutConfigView {
  id: string;
  key: "F1" | "F2" | "F3";
  productId: string;
  product: {
    id: string;
    description: string;
    code: string;
    salePrice: number;
  } | null;
}

// Type for the action input
export type ShortcutKey = "F1" | "F2" | "F3";

// Map used in the bill page
export type ShortcutMap = Partial<Record<ShortcutKey, string>>; // key → productId
```

### 3.3 Zod Schema — Add to `src/schemas/index.ts`

```typescript
export const ShortcutKeyEnum = z.enum(["F1", "F2", "F3"]);

export const SaveShortcutConfigSchema = z.object({
  key: ShortcutKeyEnum,
  productId: z.string().min(1, "Producto es obligatorio"),
});

export const DeleteShortcutConfigSchema = z.object({
  key: ShortcutKeyEnum,
});
```

### 3.4 BillContext Changes — `src/context/BillContext.tsx`

Add to the `BillContextProps` interface:

```typescript
export default interface BillContextProps {
  // ... existing fields
  focusPriceProductId: string | null;
  setFocusPriceProductId: (id: string | null) => void;
}
```

### 3.5 BillReducer Changes — `src/context/BillReducer.ts` & `src/context/billActions.ts`

Add new action type:

```typescript
// In billActions.ts
| { type: "updateSalePrice"; payload: { id: string; salePrice: number } }

// In BillReducer.ts
case "updateSalePrice":
  return {
    ...state,
    products: state.products.map((product) => {
      if (product.id === action.payload.id) {
        return {
          ...product,
          salePrice: action.payload.salePrice,
        };
      }
      return product;
    }),
  };
```

### 3.6 Server Action Return Types — `src/actions/shortcuts.ts`

```typescript
"use server";

import { ShortcutConfigView, ShortcutKey } from "@/models/ShortcutConfig";

export async function getShortcutConfigsAction(
  businessId: string
): Promise<{ success: true; data: ShortcutConfigView[] } | { success: false; error: string }>;

export async function saveShortcutConfigAction(
  businessId: string,
  key: ShortcutKey,
  productId: string
): Promise<{ success: true; data: ShortcutConfigView } | { success: false; error: string }>;

export async function deleteShortcutConfigAction(
  businessId: string,
  key: ShortcutKey
): Promise<{ success: true } | { success: false; error: string }>;

export async function getProductByShortcutAction(
  key: ShortcutKey
): Promise<{ success: true; data: import("@/models/Product").default } | { success: false; error: string } | { success: true; data: null }>;
```

---

## 4. File Structure Recommendations

### New Files

| File | Purpose |
|------|---------|
| `prisma/migrations/XXXXXXXXXXXXXX_add_shortcut_config/` | Migration for new model |
| `src/actions/shortcuts.ts` | Server actions for shortcut CRUD + product lookup |
| `src/models/ShortcutConfig.ts` | TypeScript domain type for shortcut configs |
| `src/components/AdminSettings/ShortcutConfigSection.tsx` | Admin UI section for configuring shortcuts |
| `src/components/Billing/PriceEditInput.tsx` | Reusable inline price editor component |

### Modified Files

| File | Changes |
|------|---------|
| `prisma/schema.prisma` | Add `ShortcutConfig` model |
| `src/schemas/index.ts` | Add shortcut validation schemas |
| `src/context/BillContext.tsx` | Add `focusPriceProductId` + `setFocusPriceProductId` |
| `src/context/BillProvider.tsx` | Implement new context fields |
| `src/context/BillReducer.ts` | Add `updateSalePrice` action case |
| `src/context/billActions.ts` | Add `updateSalePrice` action type |
| `src/components/Billing/BillButtons.tsx` | Keyboard remapping + shortcut product handler |
| `src/components/Billing/PrintableTable.tsx` | Editable price cells + auto-focus support |
| `src/components/Billing/ProductsTable.tsx` | Pass focus state between components |
| `src/app/admin/settings/page.tsx` | Add `ShortcutConfigSection` below ARCA form |

---

## 5. Architecture Design

### 5.1 Data Flow for Shortcut Product Add

```
User presses F1
  │
  ▼
BillButtonsDefault.handleKeyDown
  │  (checks shortcutMap state, finds productId for F1)
  │
  ├─► if no config → no-op (return)
  │
  └─► if config exists:
        │
        ├─► getProductByShortcutAction("F1")
        │     └─► db.shortcutConfig.findUnique + db.product.findUnique
        │
        ├─► dispatch({ type: "addItem", payload: { ...product, salePrice: 0, amount: 1 } })
        │     └─► BillReducer adds product to state.products
        │
        ├─► setFocusPriceProductId(product.id)
        │     └─► BillContext updated
        │
        └─► toast("Producto agregado — ingrese el precio")
              └─► sonner toast
```

### 5.2 Data Flow for Price Auto-Focus

```
BillContext.focusPriceProductId = "abc123"
  │
  ▼
PrintableTable reads focusPriceProductId
  │
  ├─► useEffect detects change (non-null)
  │
  ├─► useRef + querySelector to find the price input for product "abc123"
  │
  ├─► input.focus()
  │
  └─► setFocusPriceProductId(null)  // reset
```

### 5.3 Admin Settings Page Integration

```
AdminSettingsPage (server component)
  │
  ├─► Fetches ARCA data (existing)
  │
  └─► Renders:
        ├─► ArcaForm (existing)
        └─► ShortcutConfigSection (NEW, client component)
              │
              ├─► On mount: getShortcutConfigsAction(businessId)
              │
              ├─► UI: 3 rows (F1, F2, F3) with product search
              │
              └─► On save: saveShortcutConfigAction(businessId, key, productId)
```

### 5.4 Keyboard Shortcut Remapping Summary

| Old Key | Old Action | New Key | New Action |
|---------|-----------|---------|------------|
| F1 | Factura modal | F4 | Factura modal |
| F2 | Remito modal | F9 | Remito modal |
| F3 | A cuenta modal | F10 | A cuenta modal |
| F4 | Presupuesto modal | F5 | Presupuesto modal |
| F1/F2/F3 | — | F1/F2/F3 | Shortcut product add (if configured) |

### 5.5 Component Responsibility Diagram

```
ProductsTable (wrapper, owns focusPriceProductId state)
  │
  ├── PrintableTable
  │     ├── ProductSearchBar (unchanged)
  │     ├── Product rows with PriceEditInput (NEW editable price)
  │     └── Totals section (unchanged)
  │
  └── BillButtonsDefault (modified)
        ├── Pre-fetches shortcut configs on mount
        ├── Handles F1-F3 shortcut products
        ├── Handles F4, F9, F10, F5 remapped keys
        └── Modals (Factura, Remito, A cuenta, Presupuesto) — unchanged
```

### 5.6 Migration Strategy

1. **Generate Prisma migration**: `npx prisma migrate dev --name add_shortcut_config`
2. **No data migration needed**: New model has no default data requirements
3. **Backward compatibility**: If `ShortcutConfig` table is empty, F1/F2/F3 produce no-op (safe fallback). Old keyboard mappings (F1→Factura etc.) no longer apply — this is a breaking change for existing users who rely on the old shortcuts. Mitigation: The button labels and tooltips will be updated to reflect the new keybindings.

### 5.7 Caching Strategy

- Server actions use `revalidatePath` on save/delete to refresh the admin settings page
- Shortcut configs on the bill page are fetched on mount (client-side) and cached in component state — no need for server cache since they rarely change during a session
- Product lookups (`getProductByShortcutAction`) use Prisma's built-in connection-level cache for repeated calls

---

## 6. Dependencies

| Dependency | Type | Reason |
|-----------|------|--------|
| `@prisma/client` | Existing | Prisma types for ShortcutConfig |
| `zod` | Existing | Input validation |
| `sonner` | Existing | Toast notifications |
| `react-hook-form` | Existing | Form handling (admin settings) |
| No new packages required | — | — |

---

## 7. Implementation Order

1. **Phase 1**: Prisma schema → migration → generate client
2. **Phase 2**: Zod schemas + TypeScript types (`ShortcutConfig.ts`)
3. **Phase 3**: Server actions (`shortcuts.ts`) + tests
4. **Phase 4**: BillContext/BillProvider/BillReducer changes (focus state + updateSalePrice action)
5. **Phase 5**: Admin settings UI (`ShortcutConfigSection.tsx`)
6. **Phase 6**: BillButtons keyboard remapping + shortcut handler
7. **Phase 7**: Editable price (`PriceEditInput.tsx`) + auto-focus in PrintableTable
8. **Phase 8**: Integration — ProductsTable wiring
9. **Phase 9**: Tests for all new/modified components and actions
