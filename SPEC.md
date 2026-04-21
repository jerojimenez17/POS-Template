# SPEC.md: Fix Product Deletion Integrity Constraint

## Problem Description
Users trying to delete a Product receive a Prisma `P2003` error: `Foreign key constraint violated on the constraint: StockMovement_productId_fkey`. Prisma blocks the deletion because the Product is referenced by `StockMovement`, `OrderItem`, and `SaleReturnItem` models. 

## Technical Requirements
We must allow a product to be deleted without breaking the historical records (Orders, Sales).
1. `OrderItem` needs `onDelete: SetNull` for `product` relation, so historical orders don't lose the item entirely (they have snapshot data like cost price, sale price, description).
2. `SaleReturnItem` needs `onDelete: SetNull` for `product` relation, so historical returns aren't broken.
3. `StockMovement` needs `onDelete: Cascade` for `product` relation, because if a product is deleted, its generic stock history can be purged without affecting the financial history of the sales (which is preserved via `OrderItem`).
4. Apply the Prisma schema changes and run `npx prisma db push` to synchronize the database.

## Acceptance Criteria
- [ ] User can successfully delete a product that has existing stock movements.
- [ ] Deleting a product does not delete historical orders that contain the product.
- [ ] Deleting a product removes its stock movements from the database.

## Architecture & Changes
- Modify `prisma/schema.prisma`:
  - `OrderItem.product`: Add `onDelete: SetNull`
  - `SaleReturnItem.product`: Add `onDelete: SetNull`
  - `StockMovement.product`: Add `onDelete: Cascade`
