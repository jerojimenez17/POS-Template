# SPEC: Excel Upload with Supplier, Price Adjustments & IVA

## 1. Requirements

### 1.1 Supplier Selection
- When uploading stock via Excel, the user must select or create a supplier that "owns" the file.
- All products loaded from this file will be linked to the selected supplier (via `supplierId`).
- Supplier selection: dropdown with existing suppliers + inline creation button.
- When supplier is selected, auto-fill discount/IVA/gain from the supplier's saved values.

### 1.2 Price Adjustments
Three percentage adjustments applied to the Excel file price in this order:

```
costPrice    = filePrice * (1 - discount/100) * (1 + iva/100)
salePrice    = costPrice * (1 + gain/100)
```

Where:
- **discount**: Supplier discount (reduces the cost). Stored on Supplier as `discount`.
- **IVA**: National tax (0%, 10.5%, or 21%). Stored on Supplier as `iva`.
- **gain**: Profit margin. Stored on Supplier as `gain`.

### 1.3 IVA Tax
- Dropdown select with only 3 options: `0%`, `10.5%`, `21%`.

### 1.4 Save Values to Supplier
- The `discount`, `iva`, and `gain` values used in the import are saved back to the Supplier record upon confirmation.
- The Supplier creation modal is updated to use these fields (replacing old `bonus`).

### 1.5 "Update Only" Mode
- A new checkbox: "Solo actualizar (no crear nuevos productos)".
- When checked together with "Update existing", the system will ONLY update prices on existing products and will NOT create new products.
- Disabled when "Update existing" is unchecked.

---

## 2. Data Model Changes

### 2.1 Supplier (Prisma Schema)

```prisma
model Supplier {
  id            String   @id @default(cuid())
  name          String
  email         String?
  phone         String?
  discount      Float    @default(0)   // replaces bonus
  iva           Float    @default(0)   // 0, 10.5, or 21
  gain          Float    @default(0)   // profit margin %
  creation_date DateTime @default(now())
  businessId String
  business   Business @relation(fields: [businessId], references: [id])
  products   Product[]
}
```

Migration: rename `bonus` → `discount`, add `iva` (Float, default 0), add `gain` (Float, default 0).

### 2.2 BulkProductInput (TypeScript)

```typescript
export interface BulkProductInput {
  code: string;
  description: string;
  price: number;
  amount?: number | null;
  brandName?: string;
  categoryName?: string;
  subCategoryName?: string;
  unit?: string;
  catalog?: boolean;
  details?: string;
  supplierId?: string;   // NEW
}
```

### 2.3 Server Action Signatures

```typescript
previewProductsBulk(
  productsData: BulkProductInput[],
  updateExisting?: boolean,
  updateOnly?: boolean,
  discount?: number,
  iva?: number,
  gain?: number,
  supplierId?: string
): Promise<PreviewProductsBulkResult>

createProductsBulk(
  productsData: BulkProductInput[],
  updateExisting?: boolean,
  updateOnly?: boolean,
  discount?: number,
  iva?: number,
  gain?: number,
  supplierId?: string
): Promise<{ success?: string; error?: string }>

createSupplier(data: {
  name: string;
  email?: string;
  phone?: string;
  discount?: number;
  iva?: number;
  gain?: number;
})
```

---

## 3. UI Changes

### 3.1 Excel Upload Modal (`excel-upload-modal.tsx`)
- Supplier dropdown + create button (inline modal)
- Price adjustments: discount %, iva select (0/10.5/21), gain %
- "Update only" checkbox
- Preview: show original price + adjusted price columns
- On confirm: pass all values to server action

### 3.2 Supplier Creation Modal (`create-attribute-modal.tsx`)
- Replace "Bonificación %" with:
  - "Descuento %" (number input)
  - "IVA %" (select: 0%, 10.5%, 21%)
  - "Ganancia %" (number input)

---

## 4. Acceptance Criteria

| # | Criteria |
|---|----------|
| 1 | Supplier dropdown shows all suppliers for the business |
| 2 | User can create a new supplier inline from the Excel modal |
| 3 | Selecting a supplier auto-fills discount, iva, gain fields |
| 4 | Discount input allows any value 0-100 |
| 5 | IVA select is restricted to 0%, 10.5%, 21% |
| 6 | Gain input allows any value 0-1000 |
| 7 | Price formula: `costPrice = filePrice * (1 - d/100) * (1 + iva/100)` |
| 8 | Price formula: `salePrice = costPrice * (1 + gain/100)` |
| 9 | "Update only" + "Update existing" → only updates existing, no new products |
| 10 | "Update only" unchecked + "Update existing" checked → update existing + create new |
| 11 | "Update only" disabled when "Update existing" is unchecked |
| 12 | New products are linked to the selected supplier via supplierId |
| 13 | Confirming import saves discount/iva/gain back to the Supplier record |
| 14 | Supplier creation modal saves discount/iva/gain (replaces bonus) |

---

## 5. Files to Modify

| File | Changes |
|------|---------|
| `prisma/schema.prisma` | Supplier: `bonus` → `discount`, +`iva`, +`gain` |
| `src/actions/stock.ts` | Update interfaces, preview, create, supplier actions |
| `src/components/stock/excel-upload-modal.tsx` | Add supplier, adjustments, update-only UI |
| `src/components/stock/create-attribute-modal.tsx` | Update supplier form fields |
| `src/schemas/index.ts` | Update `SuplierSchema` |
| `tests/excel-upload.test.ts` | Add tests for new functionality |
| `tests/setup.ts` | Add supplier mocks + Prisma generate |

---

## 6. Test Scenarios

### Server Action Tests (`tests/excel-upload.test.ts`)

1. **Price formula**: `createProductsBulk` with discount=5, iva=21, gain=50 correctly calculates:
   - costPrice = 100 * 0.95 * 1.21 = 114.95
   - salePrice = 114.95 * 1.50 = 172.425

2. **IVA 0%**: with iva=0, costPrice = filePrice * (1 - discount/100)

3. **IVA 10.5%**: correct calculation with 10.5% tax

4. **Update Only + product exists**: update, no create

5. **Update Only + product not exists**: skip (no create, no update)

6. **Update Existing + not update only**: existing behavior (update + create)

7. **Supplier ID on create**: new product gets `supplierId` connected

8. **Supplier update**: supplier's discount/iva/gain are saved back via `db.supplier.update`

9. **previewProductsBulk with updateOnly**: non-existing items get status "ignore"

10. **Supplier create with discount/iva/gain**: new fields saved correctly
