# TEST_CHECKLIST.md

## Test Scenarios for Product Deletion Fix

### Scenario 1: Product with Stock Movements Deletion
- [ ] Create a new Product.
- [ ] Create a `StockMovement` for this Product.
- [ ] Call `deleteProduct` on the backend.
- [ ] Verify the Product is successfully deleted from the database.
- [ ] Verify the `StockMovement` is also deleted (Cascade).

### Scenario 2: Product referenced in an Order (OrderItem)
- [ ] Create a new Product.
- [ ] Create an Order with an `OrderItem` using this Product.
- [ ] Call `deleteProduct`.
- [ ] Verify the Product is deleted.
- [ ] Verify the `OrderItem` remains in the database.
- [ ] Verify the `OrderItem.productId` is set to `null` (SetNull).

### Scenario 3: Product referenced in a SaleReturnItem
- [ ] Create a new Product, Order with OrderItem, and a SaleReturn with `SaleReturnItem` pointing to this Product.
- [ ] Call `deleteProduct`.
- [ ] Verify the `SaleReturnItem` remains in the database but its `productId` is `null` (SetNull).
