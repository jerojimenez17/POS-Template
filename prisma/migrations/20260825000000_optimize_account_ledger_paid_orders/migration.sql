-- Supports the ledger's tenant, payment and status predicates before date ordering.
-- This is intentionally non-destructive and idempotent for safe deployment retries.
CREATE INDEX IF NOT EXISTS "Order_businessId_paidStatus_status_date_idx"
  ON "Order" ("businessId", "paidStatus", "status", "date");

-- On large production tables, run this statement outside Prisma's transaction as
-- CREATE INDEX CONCURRENTLY, then mark the equivalent migration as applied.
