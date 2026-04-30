# SPEC: Multiple Cashboxes and Sessions

## Objective
Update the architecture to support multiple cashboxes per business. Admins can create cashboxes and assign them to users. Users must open a cashbox session before creating a new bill, and can close the session at the end of their shift to generate a Z-Report.

## Acceptance Criteria
1. **Data Models**:
   - `CashBox` model is updated to remove `businessId` uniqueness and include a `name` field.
   - `User` model is updated to include `cashboxId`.
   - A new `CashboxSession` model is created to track active sessions (with fields: `userId`, `cashboxId`, `initialBalance`, `finalBalance`, `startTime`, `endTime`, `status`, `zReport`).
   - `Order` and `CashMovement` models are updated to reference `cashboxSessionId`.
2. **Admin Management**:
   - Admin can view, create, and edit cashboxes for their business.
   - Admin can assign a cashbox to a user in the User Management page.
3. **User Flow (Session Management)**:
   - When a user visits `/newBill`, if they don't have an open `CashboxSession`, a modal prompts them to open one, requiring an initial balance.
   - Users cannot create sales if they don't have an active session.
   - When processing a sale, the `Order` and `CashMovement` are linked to the active `CashboxSession`.
   - User can close their session. This calculates totals (sales, discounts, payment methods), saves the Z-Report as JSON on the session, and sets status to CLOSED.
4. **Z-Report**:
   - The UI displays the Z-Report after closing a session, detailing totals and payment methods.

## Technical Details

### Prisma Schema Changes
```prisma
model CashBox {
  id         String   @id @default(cuid())
  name       String   @default("Caja Principal") // Added
  total      Float    @default(0)
  businessId String
  business   Business @relation(fields: [businessId], references: [id], onDelete: Cascade)
  updatedAt  DateTime @updatedAt

  users      User[]
  sessions   CashboxSession[]
  
  // Removed @@unique([businessId]) - now we can have multiple
}

model User {
  // ... existing fields
  cashboxId  String?
  cashbox    CashBox? @relation(fields: [cashboxId], references: [id])
  sessions   CashboxSession[]
}

model CashboxSession {
  id             String    @id @default(cuid())
  cashboxId      String
  cashbox        CashBox   @relation(fields: [cashboxId], references: [id])
  userId         String
  user           User      @relation(fields: [userId], references: [id])
  businessId     String
  business       Business  @relation(fields: [businessId], references: [id])
  
  startTime      DateTime  @default(now())
  endTime        DateTime?
  initialBalance Float     @default(0)
  finalBalance   Float?
  status         SessionStatus @default(OPEN)
  
  zReport        Json?
  
  orders         Order[]
  cashMovements  CashMovement[]

  @@index([businessId, startTime])
}

enum SessionStatus {
  OPEN
  CLOSED
}

// In Order:
// cashboxSessionId String?
// cashboxSession   CashboxSession? @relation(fields: [cashboxSessionId], references: [id])

// In CashMovement:
// cashboxSessionId String?
// cashboxSession   CashboxSession? @relation(fields: [cashboxSessionId], references: [id])
```

### Affected Files
- `prisma/schema.prisma`
- `src/actions/sales.ts` (link sales to active session)
- `src/actions/cashbox.ts` (new actions for opening/closing sessions, creating cashboxes)
- `src/app/(protected)/newBill/page.tsx` (add session check modal)
- `src/components/actions/users.ts` (handle assigning cashbox)
- `src/app/(protected)/admin/users/page.tsx` (UI to assign cashbox)
- (New) `/src/app/(protected)/cashboxes/...` (admin cashbox management UI)

## Migration Strategy
1. Add `name` to `CashBox` with a default value.
2. Remove `@unique` from `businessId` in `CashBox`.
3. Add `CashboxSession`, `SessionStatus`, and foreign keys.
4. Run `npx prisma db push`.

---

# SPEC: Multiple Product Selection Modal & Bulk Print

## Overview

Replace the "Ranking" button in the product dashboard's `StockFilterPanel` with a new **"Seleccion Multiple"** button that opens a multiple product selection modal. This modal allows filtering, selecting, bulk price updating, and printing product labels with enlarged description and sale price.

---

## 1. Current State Analysis

### 1.1 Ranking Button Location
**File:** `src/components/stock/stock-filter-panel.tsx:85-92`

```tsx
<Button
  variant="secondary"
  onClick={() => router.push("productDashboard/products-ranking")}
>
  <BarChart3 className="h-4 w-4" />
  <span className="hidden sm:inline">Ranking</span>
</Button>
```

This button navigates to a separate ranking page. It will be **replaced** with a button that opens the new modal.

### 1.2 Related Components
| Component | Purpose |
|-----------|---------|
| `product-dashboard.tsx` | Main dashboard page container |
| `stock-filter-panel.tsx` | Contains the button to be replaced |
| `code-bar-modal.tsx` | Reference for print implementation |
| `product-form.tsx` | Product type definitions (`ProductExtended`) |

### 1.3 Product Model (Prisma)
Key fields for this feature:
- `id`, `code`, `description`
- `brandId` → `Brand` (name)
- `categoryId` → `Category` (name)
- `subCategoryId` → `Subcategory` (name)
- `salePrice`, `price` (cost), `gain`
- `unit`

---

## 2. Requirements

### 2.1 Functional Requirements

#### FR-1: Replace Ranking Button
- Remove the "Ranking" button from `StockFilterPanel`
- Add a new "Seleccion Multiple" button with a check-square icon

#### FR-2: Product Selection Modal
- Opens when "Etiquetas" button is clicked
- Displays a list of all products with checkboxes
- **All products are checked by default**
- Users can uncheck specific products
- Shows product info: code, description, category, brand, sale price

#### FR-3: Filtering
- **Text search**: Filter by description or code
- **Category filter**: Dropdown with all categories
- **Brand filter**: Dropdown with all brands
- **Unit filter** (optional): Filter by unit type

#### FR-4: Bulk Price Update
- Input field for percentage (e.g., "10" for 10% increase)
- "Aplicar" button to update prices of **selected** products
- Shows confirmation before applying
- Calls existing or new server action to update products

#### FR-5: Print Selected Products
- "Imprimir" button to print selected products
- Opens a print preview modal similar to `code-bar-modal.tsx`
- **Print layout requirements:**
  - Description: **VERY LARGE** font (e.g., 32-48px)
  - Sale price: **VERY LARGE** font (e.g., 36-52px)
  - Barcode: Present but smaller (standard size from reference)
  - Product code: Medium font below barcode
  - Layout optimized for 80mm thermal paper

### 2.2 Non-Functional Requirements

- **Performance**: Product list should handle 500+ products efficiently
- **UX**: Loading states, clear feedback on actions
- **Code Style**: Follow existing patterns (TypeScript strict, Radix UI, Tailwind)

---

## 3. Acceptance Criteria

| ID | Criterion | Status |
|----|-----------|--------|
| AC-1 | Ranking button removed from StockFilterPanel | Pending |
| AC-2 | New "Etiquetas" button opens ProductSelectionModal | Pending |
| AC-3 | Modal loads and displays all products | Pending |
| AC-4 | All products checked by default | Pending |
| AC-5 | Text search filters by description OR code | Pending |
| AC-6 | Category dropdown filters products | Pending |
| AC-7 | Brand dropdown filters products | Pending |
| AC-8 | Price increment applies only to selected products | Pending |
| AC-9 | Print modal shows selected products | Pending |
| AC-10 | Print output has description and price MUCH larger than barcode | Pending |
| AC-11 | Thermal print format (80mm width) works correctly | Pending |
| AC-12 | Bulk Unit Update section visible in ProductSelectionModal | Pending |
| AC-13 | Mode selector (set/add/subtract) available for unit update | Pending |
| AC-14 | Amount input accepts numeric values for unit update | Pending |
| AC-15 | Unit update applies only to selected products | Pending |
| AC-16 | Confirmation dialog appears before applying unit update | Pending |
| AC-17 | Server action bulkUpdateAmounts updates product amounts correctly | Pending |

---

## 4. Data Models & Interfaces

### 4.1 ProductSelectionModal Props
```typescript
interface ProductSelectionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  products: ProductExtended[];
  categories: { id: string; name: string }[];
  brands: { id: string; name: string }[];
  onRefresh: () => void;
}
```

### 4.2 ProductExtended (from product-form.tsx)
```typescript
interface ProductExtended {
  id: string;
  code: string | null;
  description: string | null;
  salePrice: number;
  price: number;
  unit: string | null;
  category?: { id: string; name: string } | null;
  brand?: { id: string; name: string } | null;
  subCategory?: { id: string; name: string } | null;
}
```

### 4.3 Filter State
```typescript
interface ProductSelectionFilters {
  search: string;        // Search by description or code
  categoryId: string;    // Empty string = all
  brandId: string;       // Empty string = all
  unit: string;          // Empty string = all
}
```

### 4.4 Print Item Interface
```typescript
interface PrintProduct {
  id: string;
  code: string;
  description: string;
  salePrice: number;
  unit?: string;
}
```

---

## 5. Component Architecture

### 5.1 File Structure
```
src/
├── components/
│   └── stock/
│       ├── product-selection-modal.tsx      # Main modal (new)
│       ├── product-selection-table.tsx      # Table with checkboxes (new)
│       ├── product-selection-filters.tsx    # Filter panel (new)
│       ├── bulk-price-update.tsx            # Price update form (new)
│       ├── bulk-unit-update.tsx             # Unit/stock update form (new)
│       ├── product-print-modal.tsx          # Print preview modal (new)
│       ├── product-print-label.tsx          # Single label component (new)
│       ├── stock-filter-panel.tsx           # MODIFIED: Replace ranking button
│       └── code-bar-modal.tsx               # Reference (unchanged)
├── actions/
│   └── stock.ts                             # ADD: bulkUpdatePrices, bulkUpdateAmounts actions
└── types/
    └── product-selection.ts                 # New types file (optional)
```

### 5.2 Component Hierarchy
```
product-dashboard.tsx
└── StockFilterPanel (modified)
    └── "Etiquetas" button → opens ProductSelectionModal

ProductSelectionModal
├── ProductSelectionFilters
│   ├── Search input (description/code)
│   ├── Category select
│   ├── Brand select
│   └── Unit select (optional)
├── ProductSelectionTable
│   ├── Select All checkbox
│   └── Product rows with checkboxes
│       ├── Checkbox
│       ├── Code
│       ├── Description
│       ├── Category
│       ├── Brand
│       └── Sale Price
├── BulkPriceUpdate
│   ├── Percentage input
│   └── Apply button
├── BulkUnitUpdate
│   ├── Mode selector (set/add/subtract)
│   ├── Amount input (numeric)
│   └── Apply button
└── Action buttons
    ├── "Imprimir" → opens ProductPrintModal
    └── "Cerrar"

ProductPrintModal
├── Print preview (ProductPrintLabel × N)
└── Print button
```

---

## 6. Data Flow

### 6.1 Opening the Modal
1. User clicks "Etiquetas" button in `StockFilterPanel`
2. `ProductDashboard` sets state to open `ProductSelectionModal`
3. `ProductSelectionModal` receives `products` prop (already fetched by parent)
4. All products start as "selected" (checked)

### 6.2 Filtering Flow (Server-Side)
1. User types in search or selects filter
2. Trigger `getProductsFiltered` server action with filter parameters (search, categoryId, brandId, unit)
3. Server action fetches filtered products from database
4. Local state updates with returned filtered products
5. Show loading state during fetch

### 6.3 Bulk Price Update Flow
1. User enters percentage (e.g., 10 for 10% increase)
2. User clicks "Aplicar"
3. Confirmation dialog appears
4. On confirm, call server action:
   ```typescript
   bulkUpdatePrices(selectedProductIds, percentage)
   ```
5. Server action updates products in database
6. Refresh product list in dashboard

### 6.4 Print Flow
1. User clicks "Imprimir" in selection modal
2. `ProductPrintModal` opens with selected products
3. For each product, generate barcode using `JsBarcode`
4. User clicks "Imprimir" in print modal
5. Call `printElement()` with thermal print settings
6. Print layout shows huge description and price

### 6.5 Bulk Unit Update Flow
1. User enters amount value (numeric)
2. User selects mode: "Set Exact" (set), "Add" (add), or "Subtract" (subtract)
3. User clicks "Aplicar" for unit update
4. Confirmation dialog appears
5. On confirm, call server action:
   ```typescript
   bulkUpdateAmounts(selectedProductIds, amountChange, mode)
   ```
6. Server action updates product amounts in database based on mode
7. Refresh product list in dashboard

---

## 7. Print Layout Specifications

### 7.1 Label Dimensions (80mm thermal paper)
- **Width**: 80mm (standard thermal receipt)
- **Height**: Auto (based on content)
- **Margins**: 0 (full bleed)

### 7.2 Typography Scale
| Element | Size | Weight | Notes |
|---------|------|--------|-------|
| Description | 36-48px | Bold | Much larger than barcode |
| Sale Price | 40-52px | Extra Bold | Largest element |
| Product Code | 14-16px | Normal | Below barcode |
| Barcode | 40px height | - | Less prominent, smaller than text |

### 7.3 Layout Structure (per label)
```
┌─────────────────────────┐
│   PRODUCT DESCRIPTION   │ <- 36-48px bold, centered
│   (wrapped text)        │
│                         │
│   $1,234.56             │ <- 40-52px extra bold, centered
│                         │
│   [barcode image]       │ <- standard size
│   CODE123               │ <- 14px, centered
│                         │
└─────────────────────────┘
```

### 7.4 CSS for Print
```typescript
const pageStyle = `
  @page { size: 80mm auto; margin: 0; }
  @media print {
    body { -webkit-print-color-adjust: exact; }
    .no-print { display: none !important; }
    .label-description {
      font-size: 42px;
      font-weight: 700;
      text-align: center;
      line-height: 1.2;
      margin-bottom: 8px;
    }
    .label-price {
      font-size: 48px;
      font-weight: 800;
      text-align: center;
      margin-bottom: 12px;
    }
    .label-barcode {
      text-align: center;
      margin: 8px 0;
    }
    .label-code {
      font-size: 14px;
      text-align: center;
    }
  }
`;
```

---

## 8. Server Actions

### 8.1 bulkUpdatePrices
**File:** `src/actions/stock.ts` (add to existing file)

```typescript
"use server";

export const bulkUpdatePrices = async (
  productIds: string[],
  percentage: number
) => {
  try {
    const updatePromises = productIds.map(id =>
      db.product.update({
        where: { id },
        data: {
          salePrice: {
            multiply: (100 + percentage) / 100,
          },
          gain: {
            // Recalculate gain based on new salePrice and cost (price)
          },
        },
      })
    );
    
    await db.$transaction(updatePromises);
    return { success: true };
  } catch (error) {
    console.error("Error updating prices:", error);
    return { success: false, error: "Error al actualizar precios" };
  }
};
```

### 8.2 bulkUpdateAmounts
**File:** `src/actions/stock.ts` (add to existing file)

```typescript
"use server";

export const bulkUpdateAmounts = async (
  productIds: string[],
  amountChange: number,
  mode: 'set' | 'add' | 'subtract'
) => {
  try {
    const updatePromises = productIds.map(id => {
      let amountUpdate;
      
      switch (mode) {
        case 'set':
          amountUpdate = amountChange;
          break;
        case 'add':
          amountUpdate = { increment: amountChange };
          break;
        case 'subtract':
          amountUpdate = { decrement: amountChange };
          break;
      }
      
      return db.product.update({
        where: { id },
        data: {
          amount: mode === 'set' ? amountChange : amountUpdate,
        },
      });
    });
    
    await db.$transaction(updatePromises);
    return { success: true };
  } catch (error) {
    console.error("Error updating amounts:", error);
    return { success: false, error: "Error al actualizar stock" };
  }
};
```

---

## 9. Implementation Steps (Ordered)

### Step 1: Modify StockFilterPanel
- [ ] Remove Ranking button (lines 85-92)
- [ ] Add new "Etiquetas" button with Printer/Tag icon
- [ ] Button opens modal via callback prop

### Step 2: Create ProductSelectionModal
- [ ] Create `product-selection-modal.tsx`
- [ ] Add Dialog with proper sizing (large, scrollable)
- [ ] Integrate filters, table, and bulk actions

### Step 3: Create ProductSelectionFilters
- [ ] Search input with icon
- [ ] Category dropdown (fetch from existing action or props)
- [ ] Brand dropdown (fetch from existing action or props)

### Step 4: Create ProductSelectionTable
- [ ] Table with checkboxes
- [ ] "Select All" header checkbox
- [ ] Default: all checked
- [ ] Show product details in rows

### Step 5: Create BulkPriceUpdate
- [ ] Percentage input (type="number")
- [ ] "Aplicar" button
- [ ] Confirmation dialog
- [ ] Call server action

### Step 5.1: Create BulkUnitUpdate
- [ ] Mode selector dropdown (set/add/subtract)
- [ ] Amount input (type="number", numeric validation)
- [ ] "Aplicar" button for unit update
- [ ] Confirmation dialog
- [ ] Call bulkUpdateAmounts server action

### Step 6: Create ProductPrintModal
- [ ] Reference `code-bar-modal.tsx` for structure
- [ ] Use `JsBarcode` for barcode generation
- [ ] Implement large text layout
- [ ] Call `printElement` with proper thermal settings

### Step 7: Create Server Action
- [ ] Add `bulkUpdatePrices` to `src/actions/stock.ts`
- [ ] Implement transaction-based updates
- [ ] Recalculate gain after price change

### Step 8: Integration
- [ ] Wire up everything in `product-dashboard.tsx`
- [ ] Pass products, categories, brands as props
- [ ] Handle refresh after bulk update

---

## 10. UI/UX Notes

### Button Replacement
- **Old**: "Ranking" button with `BarChart3` icon
- **New**: "Etiquetas" button with `Tags` or `Printer` icon from lucide-react

### Modal Size
- Product Selection Modal: `max-w-5xl` (extra large)
- Print Preview Modal: `max-w-2xl` (similar to code-bar-modal)

### Loading States
- Show spinner while fetching products (handled by parent)
- Disable buttons during bulk update
- Show toast/alert on successful actions

---

## 11. Testing Considerations

Since no test framework is currently configured:
- Manual testing checklist should be created
- Verify print output with actual thermal printer
- Test with various product counts (10, 100, 500+)
- Verify barcode scanning after print

---

## 12. Questions & Assumptions

### Assumptions
1. Products are already fetched by `ProductDashboard` and passed down
2. Categories and brands can be fetched in the modal or passed as props
3. Thermal printer is 80mm width (standard)
4. User has permission to update all products in their business

### Open Questions
1. Should the modal fetch its own products or receive them as props?
   - **Recommendation**: Receive as props (already fetched by parent)
2. Should price update affect cost price (`price`) or just sale price?
   - **Recommendation**: Only sale price, recalculate gain
3. How many labels per row in print preview?
   - **Recommendation**: 1 per row (80mm width limitation)

---

## Appendix: Relevant Code References

| File | Key Lines | Purpose |
|------|-----------|---------|
| `stock-filter-panel.tsx` | 85-92 | Ranking button to replace |
| `code-bar-modal.tsx` | 1-188 | Print modal reference |
| `code-bar-modal.tsx` | 79-93 | `printElement` usage |
| `code-bar-modal.tsx` | 52-66 | JsBarcode generation |
| `product-dashboard.tsx` | 13-84 | Parent component structure |
| `prisma/schema.prisma` | 178-215 | Product model |

---

# SPEC: Barcode Scanner Detection in Product Search

## Feature Overview

Modify the product search input in `PrintableTable.tsx` to detect barcode scanner input (fast keystrokes) and immediately search by product code using `getProductByCode`. The existing behavior (description search via `getProductsBySearch`) should be preserved for manual typing.

---

## Requirements

### Functional Requirements

| ID | Requirement | Notes |
|----|-------------|-------|
| FR-01 | Detect barcode scanner input by measuring inter-keystroke timing | Barcode scanners typically send characters with <50ms between keystrokes |
| FR-02 | When barcode mode is detected, immediately call `getProductByCode` with the full input | Skip the 2+ character threshold used for description search |
| FR-03 | Keep existing description search behavior for manual typing | Triggers on 2+ characters via `getProductsBySearch` |
| FR-04 | Reset barcode mode detection after a timeout (e.g., 300ms after last keystroke) | Allows the search input to be reused for manual typing after scanning |
| FR-05 | Clear input after successful barcode product addition | Standard UX pattern for barcode scanning |
| FR-06 | Show visual indicator when barcode mode is detected | Optional: brief visual feedback (e.g., highlight border) |

### Non-Functional Requirements

| ID | Requirement | Notes |
|----|-------------|-------|
| NFR-01 | No new external dependencies | Use existing React hooks and browser APIs |
| NFR-02 | Maintain TypeScript strict mode compliance | All types must be explicit |
| NFR-03 | Preserve existing test coverage | Don't break existing CA-09 (Product search functionality) |

---

## Acceptance Criteria

### AC-01: Barcode Detection by Timing
**Given** the product search input is focused  
**When** keystrokes are detected with <50ms between them  
**Then** the component should switch to barcode mode

**Measurable:** Inter-keystroke time < 50ms triggers `isBarcodeMode = true`

---

### AC-02: Immediate Product Lookup by Code in Barcode Mode
**Given** barcode mode is detected  
**When** the input value reaches a complete barcode (e.g., 3+ characters)  
**Then** immediately call `getProductByCode` with the full input value

**Measurable:** `getProductByCode` is called as soon as input length >= 3 (typical barcode length) without waiting for further input or debounce

---

### AC-03: Description Search Preserved for Manual Typing
**Given** the user types manually (inter-keystroke time >= 50ms)  
**When** input reaches 2+ characters  
**Then** call `getProductsBySearch` to show suggestions

**Measurable:** `getProductsBySearch` is called when typing speed indicates manual input and length >= 2

---

### AC-04: Reset Barcode Mode After Timeout
**Given** barcode mode was activated  
**When** 300ms pass without a new keystroke  
**Then** reset to normal search mode and clear the input

**Measurable:** A timeout of 300ms after last keystroke resets `isBarcodeMode` to `false`

---

### AC-05: Successful Barcode Scan Adds Product
**Given** barcode mode detected and `getProductByCode` returns a valid product  
**When** the product is found  
**Then** add the product to the bill and clear the search input

**Measurable:** `addItem` is called with the adapted product, `searchCode` is cleared, suggestions are cleared

---

### AC-06: Handle Barcode Scan Failure
**Given** barcode mode detected and `getProductByCode` returns null  
**When** no product is found  
**Then** show error message "Producto no encontrado" and clear input

**Measurable:** `setErrorMessage` is called with "Producto no encontrado", input is cleared

---

### AC-07: Visual Feedback for Barcode Mode (Optional)
**Given** barcode mode is detected  
**When** the input is active  
**Then** briefly highlight the input border (e.g., blue glow for 500ms)

**Measurable:** Input receives a CSS class or inline style indicating barcode mode

---

## Data Models and Interfaces

### Existing Models (No Changes Required)

```typescript
// src/models/Product.ts
export default class Product {
  id = "";
  code = "";
  description = "";
  brand = "";
  subCategory = "";
  price = 0.0;
  salePrice = 0.0;
  gain = 0.0;
  suplier = new Suplier();
  client_bonus = 0.0;
  unit = "unidades";
  image = "";
  imageName = "";
  amount: number = 0;
  last_update = new Date(Date.now());
  creation_date = new Date(Date.now());
  category = "";
}
```

### Existing Server Actions (No Changes Required)

```typescript
// src/actions/stock.ts
export const getProductByCode = async (code: string) => {
  // Returns a single product or null
};

export const getProductsBySearch = async (query: string) => {
  // Returns array of products matching code or description
};
```

### Existing State Variables (To Be Used)

```typescript
// Already declared in PrintableTable.tsx component:
const lastKeystrokeTime = useRef<number>(0);     // Timestamp of last keystroke
const barcodeTimeout = useRef<NodeJS.Timeout | null>(null); // Timeout for resetting barcode mode
const [isBarcodeMode, setIsBarcodeMode] = useState(false); // Track barcode mode
```

---

## File Structure

### Files to Modify

| File | Changes |
|------|---------|
| `src/components/Billing/PrintableTable.tsx` | Add barcode detection logic in `handleSearch` function and `onKeyDown` handler |

### Files to Create (Tests)

| File | Purpose |
|------|---------|
| `src/components/Billing/__tests__/PrintableTable.barcode.test.tsx` | Test barcode detection and behavior |

---

## Technical Constraints

1. **Use Existing Hooks:** Leverage `useRef`, `useState`, `useEffect` already imported in PrintableTable.tsx
2. **No New Dependencies:** Implement timing logic with native `Date.now()` and `setTimeout`
3. **Timing Threshold:** Use 50ms as the inter-keystroke threshold for barcode detection
4. **Reset Timeout:** Use 300ms timeout after last keystroke to reset barcode mode
5. **Minimum Barcode Length:** Assume barcodes are at least 3 characters (EAN-13 is 13 digits, Code 128 varies)
6. **Preserve Existing Behavior:** Manual typing still triggers `getProductsBySearch` at 2+ chars
7. **Error Handling:** Use existing `setErrorMessage` pattern for errors
8. **Code Conventions:** Follow AGENTS.md - PascalCase components, camelCase functions, interfaces over types

---

## Implementation Notes

### Key Implementation Details

1. **Detecting Barcode Input:**
   ```typescript
   const now = Date.now();
   const timeSinceLastKeystroke = now - lastKeystrokeTime.current;
   lastKeystrokeTime.current = now;
   
   if (timeSinceLastKeystroke < 50 && value.length >= 3) {
     setIsBarcodeMode(true);
     // Trigger barcode search
   }
   ```

2. **Barcode Search Flow:**
   - Detect fast input (<50ms between keystrokes)
   - Set `isBarcodeMode = true`
   - Call `getProductByCode(fullInput)` immediately
   - On success: `addItem`, clear input
   - On failure: show error, clear input
   - Reset `isBarcodeMode` after 300ms timeout

3. **Manual Typing Flow (Preserved):**
   - Detect normal input (>=50ms between keystrokes)
   - Call `getProductsBySearch` when length >= 2
   - Show suggestions dropdown
   - Allow selection via click or Enter key

4. **Reset Logic:**
   ```typescript
   if (barcodeTimeout.current) {
     clearTimeout(barcodeTimeout.current);
   }
   barcodeTimeout.current = setTimeout(() => {
     setIsBarcodeMode(false);
     setSearchCode("");
   }, 300);
   ```

---

## Ambiguities Clarified

| Ambiguity | Decision |
|-----------|----------|
| Exact timing threshold for barcode detection | Use <50ms between keystrokes (typical barcode scanner speed) |
| Minimum barcode length | Use 3+ characters (covers most barcode formats) |
| Visual indicator for barcode mode | Optional: brief blue border highlight |
| Input clearing after scan | Clear input after successful or failed barcode scan |
| Fallback to search if barcode fails | Yes, show error and reset to normal mode |
| Barcode mode persistence | Reset after 300ms of no keystrokes |

---

## Testing Strategy

Refer to TEST_CHECKLIST.md (to be created by QA Engineer) for detailed test scenarios covering:

- Positive cases: Successful barcode scan, multiple scans
- Negative cases: Invalid barcode, network errors
- Edge cases: Mixed manual typing and scanning, very short barcodes
- Timing verification: Ensure <50ms triggers barcode mode, >=50ms triggers search

---

## Affected Files

- `src/components/Billing/PrintableTable.tsx` (modified)
- `src/components/Billing/__tests__/PrintableTable.barcode.test.tsx` (new)
- `src/components/Billing/__tests__/PrintableTable.test.tsx` (verify existing tests still pass)

---

## Appendix: Relevant Code References

| File | Key Lines | Purpose |
|------|-----------|---------|
| `src/components/Billing/PrintableTable.tsx` | 61-67 | Existing barcode-related state variables |
| `src/components/Billing/PrintableTable.tsx` | 244-261 | `handleAddProduct` function (to be reused) |
| `src/components/Billing/PrintableTable.tsx` | 263-272 | `handleSearch` function (to be modified) |
| `src/components/Billing/PrintableTable.tsx` | 430-465 | Search input with `onChange` and `onKeyDown` handlers |
| `src/actions/stock.ts` | 377-395 | `getProductByCode` action |
| `src/actions/stock.ts` | 397-419 | `getProductsBySearch` action |
| `src/models/Product.ts` | 1-24 | Product model |
