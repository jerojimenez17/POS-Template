ALTER TABLE "CashMovement"
ADD COLUMN "idempotencyKey" TEXT;

CREATE UNIQUE INDEX "CashMovement_businessId_idempotencyKey_key"
ON "CashMovement"("businessId", "idempotencyKey");
