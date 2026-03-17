# SPEC.md - Order Item Tracking and Editing for Account Ledger

## Feature Request Summary
1. Track when each item was added to unpaid orders (add addedAt field)
2. Allow editing unpaid orders from the detail page (add/edit/remove items)
3. When client selects existing client in ClientSelectionModal, add items to their existing unpaid order or create new one with items grouped by date added

---

## Requirements

### R1: OrderItem addedAt Field
**Description:** Track when each item was added to an unpaid order for identification purposes.

- [ ] Add addedAt field (DateTime) to OrderItem model in Prisma schema
- [ ] When creating items, set addedAt to current timestamp
- [ ] When adding items to existing unpaid order, set addedAt to current timestamp
- [ ] Items should display grouped by addedAt date in the UI

### R2: Edit Unpaid Orders from Detail Page
**Description:** Allow editing unpaid orders (add/edit/remove items) from the account-ledger/[id] page.

- [ ] Show Edit Items button only for unpaid orders (paidStatus === inpago)
- [ ] Enable editing product quantity
- [ ] Enable editing product price
- [ ] Enable removing items from order
- [ ] Enable adding new items to order
- [ ] Recalculate order total when items change
- [ ] Update client balance accordingly
- [ ] Create OrderUpdate records for all changes

### R3: ClientSelectionModal Behavior
**Description:** When selecting an existing client, add items to their existing unpaid order or create new one with items grouped by date.

- [ ] Check if client has existing unpaid order (paidStatus === inpago)
- [ ] If unpaid order exists: add new items to it with current timestamp
- [ ] If no unpaid order exists: create new order with items
- [ ] Display items grouped by date added in order detail view
- [ ] Show date grouping in the items table (e.g., Agregado el: DD/MM/YYYY HH:MM)

---

## Acceptance Criteria

### AC1: Data Model
- [ ] Prisma schema updated with addedAt field in OrderItem model
- [ ] npx prisma generate runs successfully
- [ ] npx prisma db push applies changes to database

### AC2: Item Date Tracking
- [ ] New orders created via ClientSelectionModal have items with addedAt timestamp
- [ ] Items added to existing unpaid orders have their own addedAt timestamp
- [ ] Items table displays items grouped by date added
- [ ] Date format: DD/MM/YYYY HH:MM (Argentine format)

### AC3: Order Editing
- [ ] Edit Items button visible on unpaid order detail page
- [ ] Can increase/decrease item quantity
- [ ] Can modify item price
- [ ] Can remove items from order
- [ ] Can add new items to order
- [ ] Order total updates automatically when items change
- [ ] Client balance updates correctly after changes
- [ ] Cannot edit items on paid orders (button hidden or disabled)

### AC4: Client Selection Flow
- [ ] When client with unpaid order is selected, new items are added to existing order
- [ ] When client without unpaid order is selected, new order is created
- [ ] Items are clearly marked with their addition date
- [ ] User receives confirmation message after operation

### AC5: Validation and Error Handling
- [ ] Stock validation for new items added to existing order
- [ ] Cannot reduce quantity below available stock
- [ ] Appropriate error messages displayed
- [ ] Transaction rollback on failure

### AC6: Code Quality
- [ ] TypeScript strict mode passes
- [ ] ESLint passes with no errors
- [ ] All new components have proper types
- [ ] Server actions return proper ActionResult types

---

## Data Model Changes

### Prisma Schema (prisma/schema.prisma)

Add addedAt field to OrderItem model:

model OrderItem {
  id          String   @id @default(cuid())
  orderId     String
  order       Order    @relation(fields: [orderId], references: [id], onDelete: Cascade)
  
  productId   String?
  product     Product? @relation(fields: [productId], references: [id])

  code        String?
  description String?
  costPrice   Float    @default(0)
  price       Float    @default(0)
  quantity    Float    @default(0) 
  subTotal    Float    @default(0) 
  
  // NEW: Track when item was added
  addedAt     DateTime @default(now())

  returnItems SaleReturnItem[]
  @@index([orderId])
}

---

## File Structure Recommendations

src/
├── actions/
│   ├── unpaid-orders.ts        # Modify: addOrderItems, updateOrderItem, removeOrderItem
│   └── orders.ts               
├── components/
│   └── ledger/
│       ├── ClientSelectionModal.tsx  # Modify: check for existing unpaid order
│       ├── OrderItemsTable.tsx       # NEW: Grouped items display
│       ├── EditOrderItems.tsx        # NEW: Edit items component
│       └── AddItemForm.tsx           # NEW: Add item to order form
├── app/
│   └── (protected)/
│       └── account-ledger/
│           └── [id]/
│               └── page.tsx     # Modify: Add edit button, show grouped items
├── types/
│   └── order.ts                 # NEW: Order-related types
└── schemas/
    └── index.ts                 # Modify: Add validation for order item updates

---

## Server Actions to Implement

In src/actions/unpaid-orders.ts:

// Add items to existing order
export const addItemsToOrder = async (input: AddItemsToOrderInput): Promise<ActionResult>

// Update existing order item
export const updateOrderItem = async (input: UpdateOrderItemInput): Promise<ActionResult>

// Remove item from order
export const removeOrderItem = async (input: RemoveOrderItemInput): Promise<ActionResult>

// Check/get client unpaid order
export const getClientUnpaidOrder = async (clientId: string, businessId: string): Promise<ActionResult>

---

## Implementation Steps

### Step 1: Database Changes
1. Update Prisma schema with addedAt field
2. Run npx prisma generate
3. Run npx prisma db push

### Step 2: Update ClientSelectionModal
1. Fetch existing unpaid order for selected client
2. If exists: add items to it (call new action)
3. If not: create new order (existing behavior)

### Step 3: Create Order Item Editing Components
1. Create OrderItemsTable.tsx with date grouping
2. Create EditOrderItems.tsx for inline editing
3. Create AddItemForm.tsx for adding new items

### Step 4: Update Detail Page
1. Add Edit Items button for unpaid orders
2. Integrate editing components
3. Display items grouped by date

### Step 5: Implement Server Actions
1. Implement addItemsToOrder
2. Implement updateOrderItem
3. Implement removeOrderItem
4. Implement proper stock and balance updates

### Step 6: Testing
1. Test adding items to new client (no existing order)
2. Test adding items to client with existing unpaid order
3. Test editing items (quantity, price)
4. Test removing items
5. Test stock validation
6. Test balance updates
7. Test date grouping display

---

## Related Files to Modify

| File | Change Type | Description |
|------|-------------|-------------|
| prisma/schema.prisma | Modify | Add addedAt to OrderItem |
| src/components/ledger/ClientSelectionModal.tsx | Modify | Check existing unpaid order |
| src/app/(protected)/account-ledger/[id]/page.tsx | Modify | Add edit functionality |
| src/actions/unpaid-orders.ts | Modify | Add new server actions |
| src/types/order.ts | New | Add TypeScript types |
| src/components/ledger/OrderItemsTable.tsx | New | Display grouped items |
| src/components/ledger/EditOrderItems.tsx | New | Edit items component |

---

## Dependencies

- React 19 (use client components)
- Radix UI (existing)
- Tailwind CSS v4 (existing)
- Zod for validation (existing)
- react-hook-form (existing)
