# TEST_CHECKLIST.md — Configurable Keyboard Shortcuts for Variable-Price Products

## Acceptance Criteria Verification

### Data Model — `ShortcutConfig`

| ID | Criterion | Status |
|----|-----------|--------|
| AC1 | New `ShortcutConfig` model exists in `prisma/schema.prisma` with fields: `id`, `businessId`, `key`, `productId`, and relations to `Business` and `Product` | [ ] |
| AC2 | Unique constraint on `[businessId, key]` | [ ] |
| AC3 | Cascade delete when `Business` or `Product` is deleted | [ ] |
| AC4 | Index on `businessId` | [ ] |

### Server Actions — `src/actions/shortcuts.ts`

| ID | Criterion | Status |
|----|-----------|--------|
| AC5 | `getShortcutConfigsAction(businessId)` returns config array with product data | [ ] |
| AC6 | `saveShortcutConfigAction(businessId, key, productId)` upserts correctly | [ ] |
| AC7 | `saveShortcutConfigAction` validates input with Zod (key in F1\|F2\|F3, productId non-empty) | [ ] |
| AC8 | `deleteShortcutConfigAction(businessId, key)` removes record | [ ] |
| AC9 | `getProductByShortcutAction(key)` finds product via current session's businessId | [ ] |
| AC10 | All actions return `{ error: "No autorizado" }` when no session/businessId | [ ] |
| AC11 | Database errors are caught, logged, and returned as user-friendly error | [ ] |

### Admin Settings UI — `/admin/settings/`

| ID | Criterion | Status |
|----|-----------|--------|
| AC12 | "Atajos de teclado" section appears below ARCA form | [ ] |
| AC13 | 3 rows (F1, F2, F3) with product search, current product display, clear button | [ ] |
| AC14 | "Guardar" button saves configs | [ ] |
| AC15 | Existing configs fetched and pre-populated on page load | [ ] |
| AC16 | Success/error toast notifications after save | [ ] |

### Bill Page — Keyboard Remapping (`BillButtons.tsx`)

| ID | Criterion | Status |
|----|-----------|--------|
| AC17 | On mount, fetches shortcut configs and stores in local state map | [ ] |
| AC18 | F1/F2/F3 with config: preventDefault, fetch product, dispatch salePrice=0, focus price input, toast | [ ] |
| AC19 | F1/F2/F3 without config: ignored (no-op) | [ ] |
| AC20 | F4 opens "Factura" confirmation modal (was F1) | [ ] |
| AC21 | F9 opens "Remito" confirmation modal (was F2) | [ ] |
| AC22 | F10 opens "A cuenta" modal (was F3) | [ ] |
| AC23 | F5 opens "Presupuesto" modal (was F4), feature-gated by `hasBudget` | [ ] |
| AC24 | Shortcut fetching skipped when `isEditing` is true | [ ] |

### Editable Price Field (`PrintableTable.tsx`)

| ID | Criterion | Status |
|----|-----------|--------|
| AC25 | salePrice cell is inline editable input (not just text) | [ ] |
| AC26 | Input styled to match existing table design | [ ] |
| AC27 | Validates positive number on blur/Enter | [ ] |
| AC28 | `updateSalePrice` dispatch updates product's salePrice in reducer | [ ] |
| AC29 | `focusPriceProductId` triggers auto-focus on corresponding price input | [ ] |

### Auto-Focus on Shortcut Add

| ID | Criterion | Status |
|----|-----------|--------|
| AC30 | New `focusPriceProductId` state in `BillContext`, initially `null` | [ ] |
| AC31 | After shortcut product added, `focusPriceProductId` set to product's `id` | [ ] |
| AC32 | PrintableTable watches `focusPriceProductId`, focuses input, then resets to `null` | [ ] |

### Test Coverage

| ID | Criterion | Status |
|----|-----------|--------|
| AC33 | Unit tests for `src/actions/shortcuts.ts` cover: CRUD, auth failure, validation errors, DB errors | [ ] |
| AC34 | Component tests for admin settings `ShortcutConfigSection` | [ ] |
| AC35 | Component tests for `BillButtonsDefault`: shortcut keys (F1/F2/F3 with/without config), remapped keys (F4, F9, F10, F5) | [ ] |

---

## Test Files

| File | What It Tests | Status |
|------|---------------|--------|
| `tests/actions/shortcuts.test.ts` | Server actions: CRUD, validation, auth, errors | [ ] |
| `tests/components/BillButtons.shortcuts.test.tsx` | BillButtons keyboard remapping + shortcut handling | [ ] |
| `tests/context/BillReducer.shortcuts.test.ts` | BillReducer `updateSalePrice` action | [ ] |

---

## Detailed Test Scenarios

### `tests/actions/shortcuts.test.ts`

| # | Scenario | Expected Result | Status |
|---|----------|----------------|--------|
| SA1 | `getShortcutConfigsAction` returns configs for a valid business | Array of `ShortcutConfigView` with product data | [ ] |
| SA2 | `getShortcutConfigsAction` returns empty array when no configs exist | `{ success: true, data: [] }` | [ ] |
| SA3 | `getShortcutConfigsAction` catches DB error | `{ success: false, error: "mensaje legible" }` | [ ] |
| SA4 | `saveShortcutConfigAction` creates new config (upsert - insert) | `{ success: true, data: ShortcutConfigView }` | [ ] |
| SA5 | `saveShortcutConfigAction` updates existing config (upsert - update) | `{ success: true, data: ShortcutConfigView }` with new productId | [ ] |
| SA6 | `saveShortcutConfigAction` rejects invalid key "F4" | `{ success: false, error: "mensaje de validación" }` | [ ] |
| SA7 | `saveShortcutConfigAction` rejects empty productId | `{ success: false, error: "Producto es obligatorio" }` | [ ] |
| SA8 | `deleteShortcutConfigAction` deletes existing config | `{ success: true }` | [ ] |
| SA9 | `deleteShortcutConfigAction` tries to delete non-existent config | `{ success: false, error: "mensaje legible" }` | [ ] |
| SA10 | `getProductByShortcutAction` returns product when configured | `{ success: true, data: Product }` | [ ] |
| SA11 | `getProductByShortcutAction` returns null when not configured | `{ success: true, data: null }` | [ ] |
| SA12 | `getProductByShortcutAction` catches DB error | `{ success: false, error: "mensaje legible" }` | [ ] |
| SA13 | All actions return auth error when no session | `{ error: "No autorizado" }` | [ ] |
| SA14 | All actions return auth error when session has no businessId | `{ error: "No autorizado" }` | [ ] |

### `tests/components/BillButtons.shortcuts.test.tsx`

| # | Scenario | Expected Result | Status |
|---|----------|----------------|--------|
| BB1 | F1 pressed with shortcut configured → product fetched and dispatched with salePrice=0 | `getProductByShortcutAction("F1")` called, `addItem` dispatched with `salePrice: 0` | [ ] |
| BB2 | F1 pressed without shortcut configured → no-op | No action dispatched, no toast | [ ] |
| BB3 | F2 pressed with shortcut configured | Same as BB1 but for F2 | [ ] |
| BB4 | F3 pressed with shortcut configured | Same as BB1 but for F3 | [ ] |
| BB5 | F4 pressed → Factura modal opens | `setOpenFacturaModal(true)` called | [ ] |
| BB6 | F9 pressed → Remito modal opens | `setOpenRemitoModal(true)` called | [ ] |
| BB7 | F10 pressed → A cuenta modal opens | `setOpenAcuentaModal(true)` called | [ ] |
| BB8 | F5 pressed with `hasBudget` → Presupuesto modal opens | `setOpenBudgetModal(true)` called | [ ] |
| BB9 | F5 pressed without `hasBudget` → nothing happens | No budget modal opens | [ ] |
| BB10 | Shortcut configs fetched on mount | `getShortcutConfigsAction` called on mount | [ ] |
| BB11 | `isEditing=true` → no shortcuts processed | All keydown events ignored | [ ] |

### `tests/context/BillReducer.shortcuts.test.ts`

| # | Scenario | Expected Result | Status |
|---|----------|----------------|--------|
| BR1 | `updateSalePrice` updates salePrice of matching product | Product's `salePrice` changes to new value | [ ] |
| BR2 | `updateSalePrice` does not affect other products | Other products in state remain unchanged | [ ] |
| BR3 | `updateSalePrice` with non-existent id does nothing | State unchanged | [ ] |
| BR4 | Multiple `updateSalePrice` calls work sequentially | Each call correctly updates the price | [ ] |

---

## Running Tests

```bash
# Run shortcut server action tests
npm run test -- tests/actions/shortcuts.test.ts

# Run BillButtons shortcut tests
npm run test -- tests/components/BillButtons.shortcuts.test.tsx

# Run BillReducer updateSalePrice tests
npm run test -- tests/context/BillReducer.shortcuts.test.ts

# Run all tests
npm run test
```

---

## Notes

- All tests marked with `[ ]` are expected to **FAIL** initially (TDD Red phase)
- Tests will pass once the Developer implements the corresponding source code
- Source files that need to be created:
  - `src/actions/shortcuts.ts`
  - `src/models/ShortcutConfig.ts`
  - `src/components/AdminSettings/ShortcutConfigSection.tsx`
  - `src/components/Billing/PriceEditInput.tsx`
- Source files that need to be modified:
  - `prisma/schema.prisma` (add `ShortcutConfig` model)
  - `src/schemas/index.ts` (add shortcut validation schemas)
  - `src/context/BillContext.tsx` (add `focusPriceProductId` + `setFocusPriceProductId`)
  - `src/context/BillProvider.tsx` (implement new context fields)
  - `src/context/BillReducer.ts` (add `updateSalePrice` action case)
  - `src/context/billActions.ts` (add `updateSalePrice` action type)
  - `src/components/Billing/BillButtons.tsx` (keyboard remapping + shortcut handler)
  - `src/components/Billing/PrintableTable.tsx` (editable price cells + auto-focus)
  - `src/components/Billing/ProductsTable.tsx` (pass focus state)
  - `src/app/admin/settings/page.tsx` (add ShortcutConfigSection)
