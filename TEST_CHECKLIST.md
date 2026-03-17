# TEST_CHECKLIST.md - Order Item Tracking and Editing Tests

## Feature: Order Item Tracking and Editing for Account Ledger

---

## R1: OrderItem addedAt Field

- [ ] **R1-T1**: Prisma schema should have `addedAt` field (DateTime) in OrderItem model
- [ ] **R1-T2**: Creating new unpaid order should set `addedAt` to current timestamp for all items
- [ ] **R1-T3**: Adding items to existing unpaid order should set `addedAt` to current timestamp
- [ ] **R1-T4**: Items should display grouped by `addedAt` date in UI
- [ ] **R1-T5**: `npx prisma generate` should run successfully after schema update
- [ ] **R1-T6**: `npx prisma db push` should apply changes to database

---

## R2: Edit Unpaid Orders from Detail Page

### Button Visibility
- [ ] **R2-T1**: Edit Items button should only be visible for unpaid orders (paidStatus === 'inpago')
- [ ] **R2-T2**: Edit Items button should be hidden/disabled for paid orders

### Editing Capabilities
- [ ] **R2-T3**: User can increase item quantity
- [ ] **R2-T4**: User can decrease item quantity
- [ ] **R2-T5**: User can modify item price
- [ ] **R2-T6**: User can remove items from order
- [ ] **R2-T7**: User can add new items to order

### Calculations
- [ ] **R2-T8**: Order total should update automatically when items change
- [ ] **R2-T9**: Client balance should update correctly after item changes

### History Tracking
- [ ] **R2-T10**: OrderUpdate record should be created for item additions
- [ ] **R2-T11**: OrderUpdate record should be created for item removals
- [ ] **R2-T12**: OrderUpdate record should be created for item quantity/price updates

---

## R3: ClientSelectionModal Smart Client Selection

### Unpaid Order Detection
- [ ] **R3-T1**: When client with unpaid order is selected, system should detect existing unpaid order
- [ ] **R3-T2**: When client without unpaid order is selected, system should return null

### User Choice Flow
- [ ] **R3-T3**: Modal should show option to add items to existing unpaid order
- [ ] **R3-T4**: Modal should show option to create new order
- [ ] **R3-T5**: User can choose to add to existing order
- [ ] **R3-T6**: User can choose to create new order

### Items Grouping
- [ ] **R3-T7**: Items added to existing order should have their own addedAt timestamp
- [ ] **R3-T8**: Items should be displayed grouped by date added in order detail view
- [ ] **R3-T9**: Date grouping should show "Agregado el: DD/MM/YYYY HH:MM" format

### Confirmation
- [ ] **R3-T10**: User should receive success message after operation completes

---

## AC1: Data Model

- [ ] **AC1-T1**: Prisma schema updated with addedAt field in OrderItem model
- [ ] **AC1-T2**: npx prisma generate runs successfully
- [ ] **AC1-T3**: npx prisma db push applies changes to database

---

## AC2: Item Date Tracking

- [ ] **AC2-T1**: New orders created via ClientSelectionModal have items with addedAt timestamp
- [ ] **AC2-T2**: Items added to existing unpaid orders have their own addedAt timestamp
- [ ] **AC2-T3**: Items table displays items grouped by date added
- [ ] **AC2-T4**: Date format is DD/MM/YYYY HH:MM (Argentine format)

---

## AC3: Order Editing

- [ ] **AC3-T1**: Edit Items button visible on unpaid order detail page
- [ ] **AC3-T2**: Can increase/decrease item quantity
- [ ] **AC3-T3**: Can modify item price
- [ ] **AC3-T4**: Can remove items from order
- [ ] **AC3-T5**: Can add new items to order
- [ ] **AC3-T6**: Order total updates automatically when items change
- [ ] **AC3-T7**: Client balance updates correctly after changes
- [ ] **AC3-T8**: Cannot edit items on paid orders (button hidden or disabled)

---

## AC4: Client Selection Flow

- [ ] **AC4-T1**: When client with unpaid order is selected, new items are added to existing order
- [ ] **AC4-T2**: When client without unpaid order is selected, new order is created
- [ ] **AC4-T3**: Items are clearly marked with their addition date
- [ ] **AC4-T4**: User receives confirmation message after operation

---

## AC5: Validation and Error Handling

- [ ] **AC5-T1**: Stock validation for new items added to existing order
- [ ] **AC5-T2**: Cannot reduce quantity below available stock
- [ ] **AC5-T3**: Appropriate error messages displayed
- [ ] **AC5-T4**: Transaction rollback on failure

---

## AC6: Code Quality

- [ ] **AC6-T1**: TypeScript strict mode passes
- [ ] **AC6-T2**: ESLint passes with no errors
- [ ] **AC6-T3**: All new components have proper types
- [ ] **AC6-T4**: Server actions return proper ActionResult types

---

## Test Files

| Test File | Coverage |
|-----------|----------|
| `src/__tests__/unpaid-orders/schema.test.ts` | Zod schemas for R1, R2, R3 input validation |
| `src/__tests__/unpaid-orders/actions.test.ts` | Server actions: addItemsToOrder, updateOrderItem, removeOrderItem, getClientUnpaidOrder |
| `src/__tests__/components/ClientSelectionModal.test.tsx` | Modal behavior, client detection, user choice flow |
| `src/__tests__/components/OrderItemsTable.test.tsx` | Date grouping, editing capabilities, calculations |

---

## Running Tests

```bash
# Run all tests
npm run test

# Run tests for specific feature
npm run test -- --testNamePattern="R1"

# Run tests for specific file
npm run test -- src/__tests__/unpaid-orders/
```

---

## Expected Test Results

**Before Implementation**: All tests should FAIL (red)
**After Implementation**: All tests should PASS (green)

This TDD approach ensures:
1. Each requirement is tested before implementation
2. Tests serve as living documentation
3. Regression protection for future changes
