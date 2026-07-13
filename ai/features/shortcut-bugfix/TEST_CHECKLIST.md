# TEST_CHECKLIST.md — Shortcut Bug Fixes

## Acceptance Criteria

### 2.1 Billing Page Shortcuts

- [ ] **AC1**: Pressing F1/F2/F3 on the billing page, when a shortcut product is configured, adds the product to the bill with `salePrice: 0` and `amount: 1`, focuses the price input, and shows a success toast.
- [ ] **AC2**: Pressing F1/F2/F3 when no shortcut is configured results in a no-op (no toast, no modal).
- [ ] **AC3**: Pressing F1/F2/F3 when there's no active cash session shows the "Debe abrir una sesión de caja" toast (same as other actions).
- [ ] **AC4**: All existing remapped keys (F4→Factura, F9→Remito, F10→A cuenta, F5→Presupuesto) continue to work correctly after the fix.
- [ ] **AC5**: The `getProductByShortcutAction` server action returns the full product correctly for configured shortcuts, and the client-side handler properly handles all possible response shapes (product found, product null, error).

### 2.2 Settings Display

- [ ] **AC6**: When navigating to `/admin/settings`, the ShortcutConfigSection fetches and displays existing shortcut configs with pre-populated search terms (e.g., "VAR001 - Producto Precio Variable") and selected product info.
- [ ] **AC7**: The component correctly handles the case where `getShortcutConfigsAction` returns configs with `product` relations that have all required fields.
- [ ] **AC8**: After saving shortcuts, the UI refreshes and shows the updated configs correctly.
- [ ] **AC9**: Loading state ("Cargando...") is shown while configs are being fetched.

### 2.3 Error Handling

- [ ] **AC10**: If `getProductByShortcutAction` returns `{ success: true, data: null }` (the config exists but the product was deleted), the client shows an error toast "El producto configurado para este atajo ya no existe" and does not silently fail.
- [ ] **AC11**: If `getShortcutConfigsAction` returns an error, the settings section displays an appropriate message (not just an empty state).
- [ ] **AC12**: If `getShortcutConfigsAction` returns an error on the billing page, the `shortcutMap` remains empty and F1/F2/F3 produce no-ops (safe fallback).

---

## Test Scenarios

### 5.1 Unit Tests for `src/actions/shortcuts.ts`

- [ ] **T1**: `getProductByShortcutAction` with valid session and existing config → Returns `{ success: true, data: product }`
- [ ] **T2**: `getProductByShortcutAction` with valid session but config's product is deleted (simulate `config.product === null`) → Returns `{ success: true, data: null }`
- [ ] **T3**: `getProductByShortcutAction` with valid session but config doesn't exist → Returns `{ success: true, data: null }`
- [ ] **T4**: `getProductByShortcutAction` with no session → Returns `{ error: "No autorizado" }`
- [ ] **T5**: `getProductByShortcutAction` with override `businessId` that differs from session → Uses the override `businessId` for the lookup
- [ ] **T6**: `getShortcutConfigsAction` with configs where product relation is null → Includes those configs in the returned array with `product: null`

### 5.2 Component Tests for `BillButtonsDefault`

- [ ] **T7**: F1 pressed with configured shortcut → `getProductByShortcutAction` returns product → `addItem` called with `salePrice: 0`, `amount: 1`, success toast shown
- [ ] **T8**: F1 pressed with configured shortcut → `getProductByShortcutAction` returns `{ success: true, data: null }` → Error toast "El producto configurado para este atajo ya no existe" is shown
- [ ] **T9**: F1 pressed with configured shortcut → `getProductByShortcutAction` returns error → Error toast with error message is shown
- [ ] **T10**: F1 pressed with empty `shortcutMap` (no configs) → No-op — no server action called
- [ ] **T11**: F4/F9/F10/F5 pressed (remapped keys) → Still work as before after the fix
- [ ] **T12**: `getShortcutConfigsAction` returns error on mount → `shortcutMap` stays empty, no crash, F1/F2/F3 produce no-ops

### 5.3 Component Tests for `ShortcutConfigSection`

- [ ] **T13**: `getShortcutConfigsAction` returns configs with valid product relations → Search inputs pre-populated with `code - description`, selected product info shown
- [ ] **T14**: `getShortcutConfigsAction` returns configs where one config has `product: null` → That key's input shows placeholder text ("[Producto eliminado]"), other keys work normally
- [ ] **T15**: `getShortcutConfigsAction` returns error → Error message displayed to user
- [ ] **T16**: `getShortcutConfigsAction` returns empty array → Empty inputs, no errors
- [ ] **T17**: After saving shortcuts and `fetchConfigs` re-runs → Same assertions as T13

### 5.4 Integration / E2E Scenarios

- [ ] **T18**: Full flow: Save shortcut F1 on settings → navigate to billing → press F1 → Product appears in bill with price input focused
- [ ] **T19**: Full flow: Save shortcuts → navigate away → navigate back to settings → Shortcut configs are pre-populated in the UI
- [ ] **T20**: Full flow: Configure F1 → delete the product from stock → press F1 on billing → Error toast about product no longer existing

---

## Bugs Verified

- [ ] **Bug A fixed**: After saving shortcuts, pressing F1/F2/F3 on the billing page no longer silently fails. Product is added (if valid) or error toast is shown (if product deleted).
- [ ] **Bug B fixed**: After saving shortcuts and navigating away/back to settings, saved products display in the UI with pre-populated search terms.
