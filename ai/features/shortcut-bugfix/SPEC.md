# SPEC: Fix Shortcut Products Not Working

## 1. Bug Descriptions

### Bug A — Shortcuts Don't Work on Billing Page

**Symptom**: After configuring shortcuts on `/admin/settings` (F1, F2, F3 → product), pressing those keys on the billing page produces no result:
- No product is added to the bill
- No "Producto agregado" toast appears
- No error toast appears
- No "Debe abrir una sesión de caja" toast appears

**Severity**: High — the feature is completely non-functional from the user's perspective.

### Bug B — Settings Page Doesn't Show Saved Configs

**Symptom**: After saving shortcuts successfully (toast says "Atajos guardados correctamente"), when the user navigates away from `/admin/settings` and returns later, the shortcut inputs appear empty — no pre-populated search terms, no selected product info.

**Note**: The immediate post-save UI refresh (`fetchConfigs()` called within `handleSave`) does show the configs correctly. The bug manifests **only when navigating away and back**.

**Severity**: High — the user cannot verify or modify existing shortcut configurations.

---

## 2. Acceptance Criteria

### 2.1 Billing Page Shortcuts

- [ ] **AC1**: Pressing F1/F2/F3 on the billing page, when a shortcut product is configured, adds the product to the bill with `salePrice: 0` and `amount: 1`, focuses the price input, and shows a success toast.
- [ ] **AC2**: Pressing F1/F2/F3 when no shortcut is configured results in a no-op (no toast, no modal).
- [ ] **AC3**: Pressing F1/F2/F3 when there's no active cash session shows the "Debe abrir una sesión de caja" toast (same as other actions).
- [ ] **AC4**: All existing remapped keys (F4→Factura, F9→Remito, F10→A cuenta, F5→Presupuesto) continue to work correctly after the fix.
- [ ] **AC5**: The `getProductByShortcutAction` server action returns the full product correctly for configured shortcuts, and the client-side handler properly handles all possible response shapes.

### 2.2 Settings Display

- [ ] **AC6**: When navigating to `/admin/settings`, the ShortcutConfigSection fetches and displays existing shortcut configs with pre-populated search terms (e.g., "VAR001 - Producto Precio Variable") and selected product info.
- [ ] **AC7**: The component correctly handles the case where `getShortcutConfigsAction` returns configs with `product` relations that have all required fields.
- [ ] **AC8**: After saving shortcuts, the UI refreshes and shows the updated configs correctly.
- [ ] **AC9**: Loading state ("Cargando...") is shown while configs are being fetched.

### 2.3 Error Handling

- [ ] **AC10**: If `getProductByShortcutAction` returns `{ success: true, data: null }` (the config exists but the product was deleted), the client shows an error toast and does not silently fail.
- [ ] **AC11**: If `getShortcutConfigsAction` returns an error, the settings section displays an appropriate message (not just an empty state).
- [ ] **AC12**: If `getShortcutConfigsAction` returns an error on the billing page, the `shortcutMap` remains empty and F1/F2/F3 produce no-ops (safe fallback).

---

## 3. Root Cause Analysis

### 3.1 Root Cause of Bug A (Billing Page)

**Primary Root Cause: Missing handling for `{ success: true, data: null }` in `BillButtonsDefault` keydown handler**

In `src/components/Billing/BillButtons.tsx`, lines 132-148:

```typescript
getProductByShortcutAction(shortcutKey).then((result) => {
  if ("success" in result && result.success && result.data) {
    // ✅ Branch A: product found — add to bill
  } else if (!("success" in result) || !result.success) {
    // ✅ Branch B: error — show error toast
  }
  // ❌ Branch C MISSING: { success: true, data: null }
  //     → silently does nothing, no toast, no product
});
```

The `getProductByShortcutAction` server action returns `{ success: true, data: null }` when:
1. The `ShortcutConfig` is found but `config.product` is `null` (product deleted outside of cascade, e.g., via raw SQL or direct DB manipulation)
2. Both the config and product exist, but the Prisma include returns `product: null` due to a DB-level foreign key inconsistency

**Secondary Root Cause: Server action uses session's `businessId` while config fetch uses parameter**

- `getShortcutConfigsAction(businessId)` uses the **parameter** `businessId` for the DB query (line 36 in `shortcuts.ts`)
- `getProductByShortcutAction(key)` uses the **server-side session's** `businessId` (line 130 in `shortcuts.ts`)
- These values should always match in normal operation, but if they ever diverge (e.g., stale JWT, multi-business switching), the config won't be found and `data: null` is returned silently

**Tertiary Root Cause: Fetch effect may not populate `shortcutMap` before first keypress**

The fetch effect (lines 81-96) is async and runs on mount. The `shortcutMapRef` sync effect (lines 67-69) runs after render. In rare cases (slow network, heavy rendering), the user could press a shortcut before the map is populated. However, this alone doesn't explain the bug being **consistently** broken — but combined with the silent `data: null` handling, it makes troubleshooting harder.

### 3.2 Root Cause of Bug B (Settings Display)

**Root Cause: `ShortcutConfigSection.fetchConfigs` doesn't handle the case where `config.product` is `null`**

In `src/components/AdminSettings/ShortcutConfigSection.tsx`, lines 58-69:

```typescript
for (const config of result.data) {
  if (config.key && config.product) {
    // Populate selectedProducts and searchTerms
  }
  // ❌ If config.product is null, this config is silently skipped
  //    → searchTerms remains "" for that key
  //    → selectedProducts remains null for that key
  //    → User sees empty inputs
}
```

If a `ShortcutConfig` record exists in the database but the related `Product` has been deleted (bypassing the cascade), `config.product` will be `null`. The config is skipped, and the input appears empty.

**But more importantly**: The `configs` state IS populated (line 50: `setConfigs(result.data)`), yet the display only shows selected product info based on `selectedProducts` and `searchTerms`. The `configs` array is only used to find the `existingConfig` for the delete button logic (line 268). The **input field's value** is driven by `searchTerms[key]` (line 222), which is only set when `config.product` is non-null.

**Secondary Root Cause: Auth/cookie mismatch between page render and client action**

The `settings/page.tsx` calls `auth()` server-side and passes `businessId` to `ShortcutConfigSection`. The component then calls `getShortcutConfigsAction(businessId)` which also calls `auth()` server-side. If the JWT cookie is not properly refreshed between the server page render and the client-side server action call (e.g., due to cookie size limits or expired tokens), the server action could return `unauthorized()` or the `businessId` could be stale.

---

## 4. Recommended Code Changes

### 4.1 Fix Bug A — Add handling for `{ success: true, data: null }` in `BillButtons.tsx`

**File**: `src/components/Billing/BillButtons.tsx`

Replace the F1/F2/F3 keydown handler (lines 132-148) to handle all response shapes:

```typescript
getProductByShortcutAction(shortcutKey).then((result) => {
  if ("success" in result && result.success && result.data) {
    // Product found — add to bill
    const productToAdd = {
      ...result.data,
      salePrice: 0,
      amount: 1,
    } as Product;
    addItem(productToAdd);
    if (setFocusPriceProductId) {
      setFocusPriceProductId(productToAdd.id);
    }
    toast.success("Producto agregado — ingrese el precio");
  } else if ("success" in result && result.success && !result.data) {
    // Config exists but product is null (deleted) — show error
    toast.error("El producto configurado para este atajo ya no existe");
  } else {
    // Error case
    const errResult = result as { error?: string };
    toast.error(errResult.error || "Error al obtener producto");
  }
});
```

**Additional fix in same file**: Add a missing error case for when `getShortcutConfigsAction` fails. Currently (lines 85-95):
```typescript
getShortcutConfigsAction(businessId).then((result) => {
  if ("success" in result && result.success) {
    // populate map
  }
  // ❌ No else branch — silent failure
});
```

Add an `else` that logs the error (no toast needed, but console.error would help debugging).

### 4.2 Fix Bug A — Add `businessId` parameter to `getProductByShortcutAction`

**File**: `src/actions/shortcuts.ts`

Change `getProductByShortcutAction` to accept an optional `businessId` parameter, falling back to the session's `businessId` for backward compatibility:

```typescript
export async function getProductByShortcutAction(
  key: ShortcutKey,
  overrideBusinessId?: string
) {
  try {
    const session = await auth();
    const businessId = overrideBusinessId || getSessionBusinessId(session);
    if (!businessId) {
      return unauthorized();
    }
    // ... rest of the function
  }
}
```

**File**: `src/components/Billing/BillButtons.tsx`

Update the call to pass `businessId` from the session prop:

```typescript
const businessId = (session?.user as { businessId?: string })?.businessId;
// ...
getProductByShortcutAction(shortcutKey, businessId).then(...)
```

This ensures the same `businessId` is used for both the config fetch AND the product lookup, eliminating any possibility of mismatch.

### 4.3 Fix Bug B — Handle `config.product === null` in `ShortcutConfigSection.tsx`

**File**: `src/components/AdminSettings/ShortcutConfigSection.tsx`

**Option A (Recommended)**: When `config.product` is `null`, still populate the search term with a fallback message so the user can see that a shortcut is configured but the product is missing:

```typescript
for (const config of result.data) {
  if (config.key) {
    if (config.product) {
      // Normal case — populate as before
      const product = new Product();
      product.id = config.product.id;
      product.description = config.product.description;
      product.code = config.product.code;
      product.salePrice = config.product.salePrice;
      products[config.key] = product;
      terms[config.key] = `${config.product.code} - ${config.product.description}`;
    } else {
      // Product deleted — show placeholder
      terms[config.key] = "[Producto eliminado]";
    }
  }
}
```

**Option B**: Add `config.product` null-handling AND show a visual indicator in the UI that the shortcut is configured but the product is missing (e.g., red text, warning icon).

### 4.4 Fix Bug B — Add error state UI to `ShortcutConfigSection.tsx`

Currently, if `getShortcutConfigsAction` returns `{ success: false, error: "..." }`, the component just shows an empty state. Add:

```typescript
const [fetchError, setFetchError] = useState<string | null>(null);

const fetchConfigs = useCallback(async () => {
  setLoading(true);
  setFetchError(null);
  const result = await getShortcutConfigsAction(businessId);
  if ("success" in result && result.success) {
    // populate state
  } else {
    const errResult = result as { error?: string };
    setFetchError(errResult.error || "Error al cargar configuraciones");
  }
  setLoading(false);
}, [businessId]);
```

And in the render:

```typescript
if (fetchError) {
  return (
    <div className="mt-8 p-4 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
      <h2 className="text-xl font-semibold mb-4">Atajos de teclado</h2>
      <p className="text-red-500">{fetchError}</p>
    </div>
  );
}
```

### 4.5 Add Prisma migration guard

**File**: No code change — add a note that the `onDelete: Cascade` on the `ShortcutConfig.product` relation in `prisma/schema.prisma` should be verified. If a product is deleted via Prisma (which uses the cascade), the related `ShortcutConfig` should be deleted automatically. If the product is deleted via raw SQL, the cascade won't fire.

**Optional**: Add a cleanup migration or a database trigger to handle orphaned `ShortcutConfig` records, or add a `prisma.$transaction` in the product deletion action to also delete related `ShortcutConfig` records explicitly.

---

## 5. Test Scenarios

### 5.1 Unit Tests for `src/actions/shortcuts.ts`

| # | Scenario | Expected |
|---|----------|----------|
| 1 | `getProductByShortcutAction` with valid session and existing config | Returns `{ success: true, data: product }` |
| 2 | `getProductByShortcutAction` with valid session but config's product is deleted (simulate `config.product === null`) | Returns `{ success: true, data: null }` |
| 3 | `getProductByShortcutAction` with valid session but config doesn't exist | Returns `{ success: true, data: null }` |
| 4 | `getProductByShortcutAction` with no session | Returns `{ error: "No autorizado" }` |
| 5 | `getProductByShortcutAction` with override `businessId` that differs from session | Uses the override `businessId` for the lookup |
| 6 | `getShortcutConfigsAction` with configs where product relation is null | Includes those configs in the returned array with `product: null` |

### 5.2 Component Tests for `BillButtonsDefault`

| # | Scenario | Expected |
|---|----------|----------|
| 7 | F1 pressed with configured shortcut `→ getProductByShortcutAction` returns product | `addItem` called with `salePrice: 0`, `amount: 1`, success toast shown |
| 8 | F1 pressed with configured shortcut `→ getProductByShortcutAction` returns `{ success: true, data: null }` | Error toast "El producto configurado para este atajo ya no existe" is shown |
| 9 | F1 pressed with configured shortcut `→ getProductByShortcutAction` returns error | Error toast with error message is shown |
| 10 | F1 pressed with empty `shortcutMap` (no configs) | No-op — no server action called |
| 11 | F4/F9/F10/F5 pressed (remapped keys) | Still work as before after the fix |
| 12 | `getShortcutConfigsAction` returns error on mount | `shortcutMap` stays empty, no crash, F1/F2/F3 produce no-ops |

### 5.3 Component Tests for `ShortcutConfigSection`

| # | Scenario | Expected |
|---|----------|----------|
| 13 | `getShortcutConfigsAction` returns configs with valid product relations | Search inputs pre-populated with `code - description`, selected product info shown |
| 14 | `getShortcutConfigsAction` returns configs where one config has `product: null` | That key's input shows placeholder text ("[Producto eliminado]"), other keys work normally |
| 15 | `getShortcutConfigsAction` returns error | Error message displayed to user |
| 16 | `getShortcutConfigsAction` returns empty array | Empty inputs, no errors |
| 17 | After saving shortcuts and `fetchConfigs` re-runs | Same assertions as #13 |

### 5.4 Integration / E2E Scenarios

| # | Scenario | Expected |
|---|----------|----------|
| 18 | Full flow: Save shortcut F1 on settings → navigate to billing → press F1 | Product appears in bill with price input focused |
| 19 | Full flow: Save shortcuts → navigate away → navigate back to settings | Shortcut configs are pre-populated in the UI |
| 20 | Full flow: Configure F1 → delete the product from stock → press F1 on billing | Error toast about product no longer existing |

---

## 6. Implementation Order

1. **Phase 1**: Fix `shortcuts.ts` — add `overrideBusinessId` parameter to `getProductByShortcutAction`
2. **Phase 2**: Fix `BillButtons.tsx` — add missing `data: null` handling in keydown handler + pass `businessId` to `getProductByShortcutAction`
3. **Phase 3**: Fix `ShortcutConfigSection.tsx` — handle `config.product === null` case + add error state UI
4. **Phase 4**: Update existing tests in `tests/actions/shortcuts.test.ts` to cover new scenarios
5. **Phase 5**: Update existing tests in `tests/components/BillButtons.shortcuts.test.tsx` to cover error handling
6. **Phase 6**: Manual verification on `(protected)/newBill` page

---

## 7. Files to Modify

| File | Changes Required |
|------|-----------------|
| `src/actions/shortcuts.ts` | Add `overrideBusinessId` param to `getProductByShortcutAction`. Use it for DB query when provided. |
| `src/components/Billing/BillButtons.tsx` | (1) Add `data: null` branch to keydown handler. (2) Pass `businessId` to `getProductByShortcutAction`. (3) Add error logging for failed fetch. |
| `src/components/AdminSettings/ShortcutConfigSection.tsx` | (1) Handle `config.product === null` in `fetchConfigs`. (2) Add `fetchError` state. (3) Show error UI. |
| `tests/actions/shortcuts.test.ts` | Add tests for `overrideBusinessId`, `config.product === null`, and `data: null` scenarios. |
| `tests/components/BillButtons.shortcuts.test.tsx` | Add tests for `data: null` error handling, error toast on fetch failure. |

## 8. Dependencies

No new npm packages. All changes are self-contained within existing files and patterns.
