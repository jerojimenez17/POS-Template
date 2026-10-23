DROP INDEX IF EXISTS "SaleReturn_orderId_kind_key";

CREATE UNIQUE INDEX "SaleReturn_one_credit_note_per_order_key"
  ON "SaleReturn" ("orderId")
  WHERE "kind" = 'CREDIT_NOTE';
