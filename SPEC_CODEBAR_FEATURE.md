# Codebar Feature Specification

> **Status:** Approved  
> **Author:** Planning agent  
> **Executor:** Implementation agent  
> **Date:** 2026-06-19

---

## Overview

Add a new `codebar` (barcode) field to the `Product` model. The existing `code` field becomes an **internal code** used for product identification within the business. When a product has a supplier, the internal code is auto-prefixed with the first 3 characters of the supplier name (lowercased) for uniqueness across suppliers.

---

## Data Model Changes

### Prisma Schema (`prisma/schema.prisma`)

```prisma
// In model Product, after line 185 (code field)
code        String?
codebar     String?   // Barcode/UPC/EAN-13 for scanner — OPTIONAL
```

Add a new index after line 228:

```prisma
@@index([businessId, codebar])
```

**Key decision:** The `code` field stays nullable at the DB level (`String?`), matching its current state. The Zod schema enforces it as required at the application layer.

**Migration note:** `npx prisma generate` and `npx prisma db push` must be run after this change.

---

## Validation — Zod Schema (`src/schemas/index.ts`)

Around line 48, after `code`, add the `codebar` field:

```typescript
code: z.string().min(1, { message: "Codigo es obligatorio" }),
codebar: z.string().optional(),   // NEW — barcode is optional
```

---

## Domain Model — (`src/models/Product.ts`)

Around line 5, add default property:

```typescript
code = "";
codebar = "";    // NEW
```

---

## Adapters

### Prisma Adapter (`src/models/ProductPrismaAdapter.ts`)

Around line 16, add mapping:

```typescript
product.code = prismaProduct.code || "";
product.codebar = prismaProduct.codebar || "";   // NEW
```

### Firebase Adapter (`src/models/ProductFirebaseAdapter.ts`)

**`forBill` static method** (around line 32): add

```typescript
codebar: String(product.codebar || ""),     // NEW
```

**`fromDocumentData` method** (around line 73): add

```typescript
codebar: data.codebar || "",   // NEW
```

---

## Server Actions — (`src/actions/stock.ts`)

### 1. `UpdateProductInput` interface (lines ~550-568)

Add optional field:

```typescript
codebar?: string;   // NEW
```

### 2. `createProduct` function (lines ~62-101)

Add to create data:

```typescript
data: {
  code: data.code,
  codebar: data.codebar,    // NEW
  // ...
}
```

### 3. `updateProduct` function (lines ~550-622)

Add to update data:

```typescript
data: {
  code: data.code,
  codebar: data.codebar,     // NEW — update if provided
  // ...
}
```

### 4. `BulkProductInput` interface (lines ~103-115)

Add optional field:

```typescript
codebar?: string;   // NEW — optional in Excel imports
```

### 5. Bulk create — `processBulkProductBatch` (around line 440)

Add to create data:

```typescript
code: item.code.toString(),
codebar: item.codebar?.toString(),    // NEW
```

### 6. `getProductByCode` — **CRITICAL CHANGE** (lines ~748-766)

**This is the billing barcode scanner lookup.** Change from exact match on `code` to search **both** `code` and `codebar`:

```typescript
export const getProductByCode = async (code: string) => {
  const product = await db.product.findFirst({
    where: {
      businessId: session.user.businessId,
      OR: [
        { code: code },
        { codebar: code },
      ],
    },
    include: { supplier: true, brand: true, category: true, subCategory: true },
  });
  return product;
};
```

### 7. Search functions — add `codebar` to OR conditions

In **all three** search functions, add `codebar` to the `OR` array alongside `code` and `description`:

- `getProductsBySearch` (lines ~768-791)
- `getProductsFiltered` (lines ~810-846)
- `getProductsPaginated` (lines ~691-746)

Pattern:

```typescript
OR: [
  { code: { contains: query, mode: "insensitive" } },
  { codebar: { contains: query, mode: "insensitive" } },   // NEW
  { description: { contains: query, mode: "insensitive" } },
],
```

---

## Quick Add Product Action — (`src/components/actions/newProduct.ts`)

Around line 25, add to create data:

```typescript
const product = await db.product.create({
  data: {
    code: values.code,
    codebar: values.codebar,     // NEW
    // ...
  },
});
```

Also pass `codebar` in the `NewProductInput` type (if it exists as a standalone type; if it uses `ProductSchema` it's already covered).

---

## Product Form — (`src/components/stock/product-form.tsx`)

This is the most complex UI change.

### Initial values (around line 96-97)

```typescript
code: prod?.code || "",
codebar: prod?.codebar || "",   // NEW
```

### Form fields to restructure

**1. Rename existing code field label** (around line ~460):

| Before | After |
|--------|-------|
| `Codigo` | `Código Interno` |

Add helper text below the internal code field:

> El código interno se usa para identificar el producto. Si tiene proveedor, se auto-prefijará: `pro-{codigo}`.

**2. Add new barcode field** (insert between internal code and description fields):

```tsx
<FormField control={form.control} name="codebar" render={({ field }) => (
  <FormItem>
    <FormLabel>Código de Barras</FormLabel>
    <FormControl>
      <div className="flex gap-2">
        <Input {...field} placeholder="" type="text" autoComplete="off" disabled={isPending} />
        <Button type="button" variant="outline" size="icon"
          onClick={() => setScannerOpen(true)} title="Escanear código de barras">
          <ScanBarcode className="h-5 w-5" />
        </Button>
      </div>
    </FormControl>
    <FormMessage />
  </FormItem>
)} />
```

**3. Move the barcode scanner button** from the internal code field to the new `codebar` field.

### Supplier prefix auto-generation logic

When the supplier field changes OR the code field changes, if both have values, auto-generate the internal code:

```typescript
// Supplier effect — when supplier changes, re-compute internal code prefix
useEffect(() => {
  const supplier = form.watch("supplier");
  const currentCode = form.watch("code");
  if (supplier && currentCode) {
    const prefix = supplier.toLowerCase().replace(/\s+/g, '').slice(0, 3);
    form.setValue("code", `${prefix}-${currentCode}`);
  }
}, [supplierId]);
```

**Alternative approach:** Use a debounced watcher on both `supplier` and `code` fields:

```typescript
// Replace or add near line 900
const watchedSupplier = form.watch("supplier");
const watchedCode = form.watch("code");
const prevCode = useRef(watchedCode);
const manualEdit = useRef(false);

useEffect(() => {
  if (!watchedSupplier || !watchedCode || manualEdit.current) return;
  const prefix = watchedSupplier.toLowerCase().replace(/\s+/g, '').slice(0, 3);
  // Only auto-prefix if user didn't manually edit
  if (!watchedCode.startsWith(`${prefix}-`)) {
    form.setValue("code", `${prefix}-${watchedCode}`);
  }
}, [watchedSupplier, watchedCode, form]);

// Allow user to override by marking manual edit
const handleCodeChange = (e) => {
  manualEdit.current = true;
  // ... normal change handling
};
```

### Barcode scanner result (around lines ~873-879)

Change to populate `codebar` instead of `code`:

```typescript
// Before:
form.setValue("code", rawValue);
// After:
form.setValue("codebar", rawValue);
```

Also try to look up the product by barcode and fill in the rest of the form:

```typescript
const rawValue = result[0].rawValue;
form.setValue("codebar", rawValue);
// Optionally: fetch product by this barcode to see if it already exists
```

---

## Excel Upload — (`src/components/stock/excel-upload-modal.tsx`)

### Column detection (around line 120)

Add new column keyword mapping for `codebar`:

```typescript
// Existing:
code: ["código", "codigo", "cod", "code", "artículo", "articulo", "art", "sku"],
// NEW:
codebar: ["código de barras", "codigo de barras", "ean", "barcode", "upc", "código barras", "codigo barras"],
```

### Column state & UI (around lines ~400-410)

Add a new column selector row after the Código row:

```tsx
<div className="flex items-center gap-2">
  <Label>Código de Barras</Label>
  <Input
    value={colCodebar}
    onChange={e => setColCodebar(e.target.value)}
    placeholder="Opcional — Ej: B"
    className="w-20"
  />
</div>
```

### Parsing logic (around lines ~189-207)

When reading a row, extract `codebar` if column was specified:

```typescript
const codeVal = row[indices.code];
const codebarVal = indices.codebar !== undefined ? row[indices.codebar] : undefined;
// ...
parsedProducts.push({
  code: String(codeVal),
  codebar: codebarVal ? String(codebarVal) : undefined,   // NEW
  // ...
});
```

### `BulkProductInput` — already updated above in stock.ts

### Bulk preview table

Add optional column for `codebar` in the preview table if data exists.

---

## Barcode Print Modal — (`src/components/stock/product-print-modal.tsx`)

### Barcode generation (around lines ~50-62)

Use `codebar` as the primary source for barcode generation, fall back to `code`:

```typescript
// Before:
const code = product.code;
// After:
const code = product.codebar || product.code;
```

### Label display (around line ~204)

Show the actual value used:

```typescript
// Before:
{product.code}
// After:
{product.codebar || product.code}
```

---

## Set Codebar Button per Product Row — New Component

### `src/components/stock/set-codebar-modal.tsx` (NEW)

A modal that lets users assign a barcode to an **existing** product by typing or scanning.

**Props interface:**
```typescript
interface SetCodebarModalProps {
  productId: string;
  productCode: string;        // internal code (for display)
  productDescription: string;
  currentCodebar: string;     // existing barcode value (if any)
  onSuccess?: () => void;     // callback to refresh table
}
```

**Component structure:**
- `Dialog` (Radix UI) triggered by a button in each product row
- Text `Input` for typing a barcode value manually
- **Scanner button** → opens camera overlay using `@yudiel/react-qr-scanner`'s `Scanner` (same pattern as `stock-filter-panel.tsx` lines 95-123)
- **Save button** → calls `updateProduct(id, { codebar: value })` from `@/actions/stock`
- **Clear button** → removes the codebar value (sets to `""`)
- Success/error feedback via `sonner` toast

**Scanner pattern (copy from `stock-filter-panel.tsx:95-123`):**
```tsx
const [scannerOpen, setScannerOpen] = useState(false);
const [codebarValue, setCodebarValue] = useState(currentCodebar || "");

const handleScan = (result: IDetectedBarcode[]) => {
  if (result?.[0]?.rawValue) {
    setCodebarValue(result[0].rawValue);
    setScannerOpen(false);
  }
};

const handleSave = async () => {
  const result = await updateProduct(productId, { codebar: codebarValue || null });
  if (result.success) {
    toast.success("Código de barras guardado");
    onSuccess?.();
  } else {
    toast.error(result.error || "Error al guardar");
  }
};
```

**Dialog JSX layout:**
```
DialogTrigger: Button with ScanBarcode icon (from lucide-react)
DialogContent:
  Header: "Asignar Código de Barras"
  Subtitle: "{productCode} - {productDescription}"
  Body:
    - Row: [Text Input for barcode] [Camera Scanner button]
    - Badge showing current value if already set
  Footer:
    - Button "Limpiar" (variant: destructive, shown only if codebar has value)
    - Button "Guardar" (primary)
```

### Where to integrate

#### 1. `src/components/ProductDataTable.tsx`

**Desktop — actions column** (around line 166, after `CodeBarModal`):
```typescript
<div className="flex items-center justify-center gap-1">
  <Button variant="ghost" size="icon" onClick={...edit}>...</Button>
  <DeleteButton ... />
  <CodeBarModal ... />
  <SetCodebarModal                               // NEW
    productId={product.id}
    productCode={product.code || ""}
    productDescription={product.description || ""}
    currentCodebar={product.codebar || ""}
    onSuccess={onRefresh}
  />
</div>
```

**Mobile card view** (around line 448, after `CodeBarModal`):
```typescript
<SetCodebarModal
  productId={product.id}
  productCode={product.code || ""}
  productDescription={product.description || ""}
  currentCodebar={product.codebar || ""}
  onSuccess={onRefresh}
/>
```

**Optional: codebar visual indicator in mobile card** (around line 382, next to the code badge):
```typescript
{product.codebar && (
  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-mono bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 ml-1">
    {product.codebar}
  </span>
)}
```

#### 2. `src/components/stock/stock-table.tsx`

**Actions cell** (around line 194, after `CodeBarModal`):
```typescript
<SetCodebarModal
  productId={product.id}
  productCode={product.code || ""}
  productDescription={product.description || ""}
  currentCodebar={product.codebar || ""}
  onSuccess={fetchProducts}
/>
```

---

## UI Table Changes

### Data column for codebar

#### `src/components/ProductDataTable.tsx`

Add a new optional column (around line 97):
```typescript
{ accessorKey: "codebar", header: "Cód. Barras", cell: ({ getValue }) => (
  <span className="font-mono text-xs">{(getValue() as string) || "-"}</span>
)}
```

Or make it visible only when data exists (conditional column).

#### `src/components/stock/stock-table.tsx`

Add `codebar` to the filter logic (around line 97-100):
```typescript
const codebar = product.codebar || "";
// In the filter condition:
code.toLowerCase().includes(descriptionFilter.toLowerCase()) ||
codebar.toLowerCase().includes(descriptionFilter.toLowerCase())
```

Optionally add a `<TableCell>` for `codebar`.

### `CodeBarModal` updates

Update `code-bar-modal.tsx` props to accept `codebar` and use it as primary barcode source for label generation:

```typescript
interface Props {
  code: string;           // internal code (displayed as text on label)
  codebar?: string;       // barcode to encode in the SVG
  description: string;
  salePrice: number;
  unit?: string;
}
```

In `generateBarcodes` (around line 52-66):
```typescript
const barcodeValue = codebar || code;
JsBarcode(barcodeEl, barcodeValue, { ... });
```

---

## Order of Implementation

### Phase 1 — Data layer (safe, non-breaking)

1. `prisma/schema.prisma` — add field + index
2. Run `npx prisma generate` + `npx prisma db push`
3. `src/schemas/index.ts` — add `codebar` to `ProductSchema`
4. `src/models/Product.ts` — add default property
5. `src/models/ProductPrismaAdapter.ts` — add mapping
6. `src/models/ProductFirebaseAdapter.ts` — add mapping

### Phase 2 — Server actions (backwards compatible)

7. `src/actions/stock.ts`:
   - `BulkProductInput` — add `codebar?`
   - `createProduct` — add to create data
   - `updateProduct` — add to input + update data
   - `processBulkProductBatch` — add to create data
   - `getProductByCode` — add `OR: [{ code }, { codebar }]`
   - Add `codebar` to search `OR` in all 3 search functions
8. `src/components/actions/newProduct.ts` — add to create data

### Phase 3 — UI Components

9. `src/components/stock/product-form.tsx`:
   - Rename label, add helper text
   - Add `codebar` form field
   - Move scanner button to `codebar`
   - Supplier prefix auto-generation effect
   - Change scanner result to populate `codebar`

10. `src/components/stock/set-codebar-modal.tsx` — **Create new component:**
    - Modal with text input + camera scanner button
    - Saves `codebar` field via `updateProduct` server action
    - Reuses same scanner pattern as `stock-filter-panel.tsx`

11. `src/components/stock/excel-upload-modal.tsx`:
    - Add column keywords for `codebar`
    - Add column selector UI row
    - Parse `codebar` from rows

12. `src/components/stock/product-print-modal.tsx`:
    - Prefer `codebar` for barcode generation, fallback to `code`

13. `src/components/stock/code-bar-modal.tsx`:
    - Update props to accept optional `codebar`
    - Use `codebar || code` for JsBarcode generation

14. `src/components/ProductDataTable.tsx`:
    - Add `codebar` column (desktop)
    - Add `codebar` visual indicator in mobile card
    - Add `SetCodebarModal` button in actions (desktop + mobile)
    - Pass `codebar` to `CodeBarModal`

15. `src/components/stock/stock-table.tsx`:
    - Add `codebar` to filter logic
    - Add `SetCodebarModal` button in actions cell

### Phase 4 — Verification

16. Run `npm run build` to verify compilation
17. Run `npm run lint` to verify linting
18. Manual testing in dev environment

---

## Supplier Prefix Logic — Detailed Spec

### Inputs
- `supplier.name` — e.g., "Taladros Industriales"
- `code` (user-typed) — e.g., "71"

### Processing
```typescript
function generateInternalCode(supplierName: string, code: string): string {
  const prefix = supplierName
    .toLowerCase()
    .replace(/\s+/g, '')   // remove all whitespace
    .slice(0, 3);           // take first 3 chars
  return `${prefix}-${code}`;
}
```

### Examples
| Supplier Name | User Types | Generated Internal Code |
|--------------|------------|------------------------|
| Taladros Industriales | 71 | `tal-71` |
| Proveedor XYZ | 71 | `pro-71` |
| Ferretería El Martillo | A-123 | `fer-A-123` |

### Edge Cases
- **No supplier:** Internal code is used as-typed by user (no prefix)
- **Supplier changed:** Re-compute prefix on the existing code portion (strip old prefix). For simplicity: just let the user manually re-enter the code, OR strip any existing `xxx-` prefix and re-apply new one.
- **User manually edits after auto-prefix:** Mark as "manual override" and don't auto-prefix again
- **Empty supplier:** Skip prefix logic entirely

### Where to apply

**Client-side (form):** `src/components/stock/product-form.tsx` — real-time preview/auto-generation via `useEffect`

**Server-side (enforcement):** `src/actions/stock.ts` — inside `createProduct` and `updateProduct`, if `supplierId` is provided and `code` doesn't already start with the correct prefix, pre-pend it. This ensures consistency even if the client doesn't send the prefixed code.

```typescript
// Inside createProduct / updateProduct
if (data.supplierId && data.code) {
  const supplier = await db.supplier.findUnique({ where: { id: data.supplierId } });
  if (supplier) {
    const prefix = supplier.name.toLowerCase().replace(/\s+/g, '').slice(0, 3);
    if (!data.code.startsWith(`${prefix}-`)) {
      data.code = `${prefix}-${data.code}`;
    }
  }
}
```

---

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| Existing products without `codebar` field | Low — field is optional, defaults to `null` | All adapters handle `null` → `""` |
| Scanner behavior change (was `code`, now `codebar`) | Medium — users scanning barcodes in product form will now populate the new field | Communicate change; billing scanner searches both fields so POS workflow is unaffected |
| Internal code prefix may conflict with existing codes | Medium — if user has products with codes like "tal-71" manually entered before this feature | Systems are already in place to handle this; duplicate check is done in bulk import |
| Excel import: existing templates have no codebar column | Low — column is optional | Excel import works without codebar column; internal code matching is unchanged |
