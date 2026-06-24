# SPEC: Print Tags with A4 Grid Layout and Correct Dimensions

## 1. Detailed Requirements

### A) Individual Tag Dimensions (per-product logic)

Two tag sizes depending on whether the product has a barcode:

| Condition | Tag Size (W×H) | Content |
|-----------|----------------|---------|
| `codebar` is `null` or empty | **6cm × 3.5cm** | description, price, product code |
| `codebar` is present | **6cm × 5cm** | description, price, barcode (bottom), product code |

- Barcode must be **at the bottom** of the tag when present.
- Tag content (from top to bottom):
  1. Product description (editable, as currently implemented)
  2. Price (formatted with unit suffix)
  3. Product code (small text)
  4. Barcode SVG (only if `codebar` exists)

### B) Bulk Print from A4 (multi-page grid)

- Tags are laid out in a **CSS grid** designed for **A4 paper (210mm × 297mm)**.
- **Without barcode** (6cm × 3.5cm): ~3 columns × ~8 rows = **~24 tags per page**.
- **With barcode** (6cm × 5cm): ~3 columns × ~5 rows = **~15 tags per page**.
- The grid must **dynamically calculate** columns/rows based on tag height (auto-detect whether tags have barcode).
- **Page breaks** (`page-break-after`) must be inserted after each page's worth of tags.
- If products have **mixed barcode presence**, use the **largest tag height (5cm)** for all tags on that batch to keep the grid uniform.

### C) Print Output Configuration

| Scenario | `format` | `pageStyle` |
|----------|----------|-------------|
| Single tag (code-bar-modal.tsx) | `"thermal"` | Keep current approach but update tag sizes |
| Bulk A4 (product-print-modal.tsx) | `"a4"` | `@page { size: A4; margin: 5mm; }` |

---

## 2. Acceptance Criteria

- [ ] **AC1**: When `codebar` is null/empty, `code-bar-modal.tsx` renders tags at **6cm × 3.5cm**.
- [ ] **AC2**: When `codebar` is present, `code-bar-modal.tsx` renders tags at **6cm × 5cm** with barcode at bottom.
- [ ] **AC3**: `code-bar-modal.tsx` uses `format: "thermal"` with updated page dimensions.
- [ ] **AC4**: In `product-print-modal.tsx`, tags are rendered in an **A4 grid** (210mm × 297mm) using `format: "a4"`.
- [ ] **AC5**: Tags without barcode are 6cm × 3.5cm → ~24 per A4 page (3 cols × 8 rows).
- [ ] **AC6**: Tags with barcode are 6cm × 5cm → ~15 per A4 page (3 cols × 5 rows).
- [ ] **AC7**: Mixed batch uses the larger 5cm height uniformly, fitting ~15 per page.
- [ ] **AC8**: Page breaks are automatically inserted between pages in bulk A4 mode.
- [ ] **AC9**: Each tag shows: description, price, product code, and optional barcode.
- [ ] **AC10**: The "Copies per product" multiplier still works in bulk A4 mode (total tags = products × copies, paginated across A4 pages).
- [ ] **AC11**: Editable description in `product-print-modal.tsx` is preserved for A4 layout.

---

## 3. Data Models / Component Interfaces

### Props — No changes needed

Both components already receive the required data:

```typescript
// code-bar-modal.tsx — Props (unchanged)
interface Props {
  code: string;          // Internal product code
  codebar?: string;      // Barcode (nullable)
  description: string;
  salePrice: number;
  unit?: string;
}

// product-print-modal.tsx — Props (unchanged)
interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  products: ProductExtended[];  // codebar is optional on Prisma Product model
}
```

### Derived constants to add

```typescript
// Shared constants (can be inlined or placed in a helper)
const TAG_WIDTH = "6cm";
const TAG_HEIGHT_WITHOUT_BARCODE = "3.5cm";
const TAG_HEIGHT_WITH_BARCODE = "5cm";
```

---

## 4. File Structure Recommendations

### Files to MODIFY

| File | Changes Required |
|------|------------------|
| `src/components/stock/code-bar-modal.tsx` | Update individual tag dimensions (6cm × 3.5cm or 6cm × 5cm), conditionally show barcode at bottom, keep thermal format |
| `src/components/stock/product-print-modal.tsx` | Convert from flex-wrap layout to A4 CSS grid, calculate page breaks, use `format: "a4"` with proper `@page` CSS |

### Files to CREATE

| File | Purpose |
|------|---------|
| (none) | All changes are contained within existing files. If a shared constants file is desired later, it can be extracted, but for now inline constants are sufficient per the feature scope. |

### Other files — NO changes needed

| File | Reason |
|------|--------|
| `src/app/(protected)/stock/bulk-update/page.tsx` | Passes `products` list to `ProductPrintModal` — no interface change. |
| `src/lib/print/BrowserPrint.ts` | `printElement()` already supports `format: "a4"` and custom `pageStyle`. |
| `src/lib/print/index.ts` | Exports are sufficient. |
| `src/components/stock/product-form.tsx` | `ProductExtended` type is unchanged. |

---

## 5. Specific Lines to Change

### A) `code-bar-modal.tsx`

| Lines | Change |
|-------|--------|
| 145–170 | Replace fixed `70mm` tag width with dynamic `6cm` width. Set tag `height` to `3.5cm` or `5cm` based on whether `codebar` is present. Move barcode rendering to bottom of tag (conditionally). |
| 86–92 | Update `@page` CSS to use `size: 60mm auto` or appropriate thermal sizing. Keep `format: "thermal"`. |
| 44–73 | Logic: derive `tagHeight` from presence of `codebar`. Adjust `JsBarcode` height proportionally (smaller for 3.5cm, larger for 5cm). |
| 155–168 | Restructure card DOM order: description → price → code → barcode (conditional, at bottom). |

### B) `product-print-modal.tsx`

| Lines | Change |
|-------|--------|
| 80–126 | Replace `handlePrint` and `pageStyle`. Use `format: "a4"`, `@page { size: A4; margin: 5mm; }`. Add CSS grid layout for A4. |
| 129–130 | Replace single `copies` loop with a paginated multi-page render structure. |
| 163–167 | Replace `flex flex-wrap` container with a `div` per A4 page, each using CSS `grid` with 3 columns and auto-rows based on tag height. |
| 178–179 | Calculate and apply dynamic tag dimensions (6cm width, height based on barcode presence). |
| 47–63 | Add logic: determine uniform tag height for the batch (max of all tags). Calculate tags-per-page and insert page breaks. Pass correct height to `JsBarcode`. |
| 193–201 | Ensure barcode is conditionally rendered at **bottom** of tag (after product code). |

---

## 6. Proposed Solution Approach

### Step 1: Tag dimension helper

Create a small inline utility function (or two constants) to derive tag height from `codebar` presence:

```typescript
const TAG_HAS_BARCODE = "5cm";
const TAG_NO_BARCODE = "3.5cm";
function getTagHeight(codebar?: string | null): string {
  return codebar ? TAG_HAS_BARCODE : TAG_NO_BARCODE;
}
```

### Step 2: Update `code-bar-modal.tsx`

- Keep `format: "thermal"` but update the `@page` to match new tag sizes.
- Change each card from a fixed `70mm` width to `6cm`.
- Conditionally set card height to `3.5cm` or `5cm`.
- Move the barcode SVG **below** the product code (i.e., at the bottom of the tag).
- Adjust JsBarcode `height` parameter: use 40 for 3.5cm tags, 60 for 5cm tags.

### Step 3: Update `product-print-modal.tsx`

- **Determine uniform tag height**: If any product has `codebar`, use `5cm` for all tags in the batch (ensures grid alignment). Otherwise use `3.5cm`.
- **Calculate grid**: For `5cm` tags: 3 cols × 5 rows = 15 per page. For `3.5cm` tags: 3 cols × 8 rows = 24 per page.
- **Page structure**: Instead of one flat list, group tags into chunks of `tagsPerPage`. Wrap each chunk in a `<div>` with `page-break-after: always` (except last).
- **CSS for A4**: Replace the flex container with a CSS grid:
  ```css
  display: grid;
  grid-template-columns: repeat(3, 6cm);
  grid-auto-rows: <tagHeight>;
  gap: 2mm;
  justify-content: center;
  ```
- **Print options**: Change to `format: "a4"` and `@page { size: A4; margin: 5mm; }`.
- **Page break logic**: After every `tagsPerPage` tags (or after each page div), add `page-break-after: always`.

### Step 4: Edge cases

- **0 products** in `product-print-modal`: Dialog should still render (empty grid, print disabled or shows empty state).
- **Single product with copies**: e.g., 1 product × 50 copies = 50 tags → 2+ A4 pages.
- **Mixed barcode presence**: All tags use 5cm height → 15 per page. Some tags simply won't have a barcode rendered.
- **Copies multiplier**: Still applied as currently implemented (`cards` loop per product).

### No new dependencies

- `JsBarcode` is already used.
- `printElement` from `@/lib/print` is already used.
- No additional npm packages required.
