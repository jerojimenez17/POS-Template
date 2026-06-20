# TEST CHECKLIST: Implementación ptoVenta y ARCA

## Validación de Esquemas y Tipos
- [ ] Validar que `ArcaFieldsSchema` acepte un arreglo de enteros para `ptoVenta`
- [ ] Validar que `BillParametersSchema` acepte el `ptoVenta` seleccionado (entero)

## Server Actions (ARCA)
- [ ] `updateBusinessArcaData` debe permitir guardar un arreglo de `ptoVenta`
- [ ] `updateBusinessArcaData` debe poder ser invocado por un rol `ADMIN` para su propio negocio

## Server Actions (Vouchers)
- [ ] `getLastVoucher` (frontend) debe rechazar peticiones si el usuario no tiene rol apropiado
- [ ] `getLastVoucher` (frontend) debe invocar la URL de la Cloud Function y retornar el resultado exitoso
- [ ] `getLastVoucher` (frontend) debe retornar error si la Cloud Function falla

## UI Components
- [ ] `arca-form.tsx`: Se debe renderizar y permitir añadir al menos un elemento a `ptoVenta`
- [ ] `BillParametersForm.tsx`: El punto de venta inicial debe obtenerse del primer elemento del arreglo cargado en el context/business

---

# ProductCard Refactoring — Acceptance Checklist

## Image & Layout
- [ ] Image container uses `aspect-[4/3]` instead of `aspect-square`
- [ ] Product `<Image>` has `width=640` and `height=480` (was 400×400)

## Motion-Safe Animations
- [ ] Card hover shadow uses `motion-safe:transition-shadow` and `motion-safe:duration-300`
- [ ] Add-to-cart button uses `motion-safe:transition-colors` and `motion-safe:duration-300`
- [ ] Product image zoom uses `motion-safe:transition-transform` and `motion-safe:duration-500`
- [ ] Overlay hover uses `motion-safe:transition-colors` with `motion-safe:duration-300`
- [ ] Info icon hover uses `motion-safe:transition-transform` with `motion-safe:duration-300`

## Accessibility
- [ ] Card wrapper has an `aria-label` attribute with product description
- [ ] Add-to-cart button keeps `aria-label` matching product description
- [ ] Quantity `<Input>` has `autoComplete="off"`

## Transition Specificity
- [ ] Card uses `transition-shadow` instead of `transition-all`
- [ ] Add-to-cart button uses `transition-colors` instead of `transition-all`
- [ ] No `transition-all` class remains anywhere in the component

---

# Product Codebar Feature — Acceptance Checklist

## 1. Schema & Validation Tests
- [ ] Zod schema: `ProductSchema` validates `codebar` as an optional string.
- [ ] Prisma model: `Product` model includes `codebar` field.
- [ ] Prisma model: `Product` model has `@@index([businessId, codebar])`.

## 2. Server Actions & Business Logic
- [ ] `getProductByCode` finds a product by exact match of `codebar` or `code`.
- [ ] `createProduct` saves the `codebar` field if provided.
- [ ] `updateProduct` updates the `codebar` field (including setting it to null or empty).
- [ ] Supplier prefix: If a supplier is selected, the internal `code` is prefixed with the first 3 characters of the supplier name (lowercased, spaces removed).
- [ ] Supplier prefix: Prefix is not re-applied if it's already there (starts with `{prefix}-`).
- [ ] Search operations: `getProductsPaginated`, `getProductsBySearch`, and `getProductsFiltered` search by `codebar` alongside `code` and `description`.

## 3. UI Components & Integrations
- [ ] Product Form: Input for "Código de Barras" exists and scanner button is beside it.
- [ ] Product Form: The scanner button populates the "Código de Barras" field.
- [ ] Product Form: Selecting a supplier auto-prefixes the internal `code` (e.g. `pro-123`).
- [ ] Excel Upload: Automatically detects `codebar` columns via keywords (ean, barcode, upc, etc.) and parses them.
- [ ] Barcode Print Modal / CodeBarModal: Renders barcode using `codebar` as primary source, falling back to `code`.
- [ ] Product Tables: Displays "Cód. Barras" column.
- [ ] `SetCodebarModal` allows setting and clearing the barcode of an existing product, and refreshes the table.

