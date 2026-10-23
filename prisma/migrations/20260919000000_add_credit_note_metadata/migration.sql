ALTER TABLE "Order"
  ADD COLUMN "billType" TEXT,
  ADD COLUMN "afipVoucherType" INTEGER,
  ADD COLUMN "invoiceNumber" INTEGER,
  ADD COLUMN "invoicePointOfSale" INTEGER,
  ADD COLUMN "invoiceIssuedAt" TIMESTAMP(3);

CREATE TYPE "SaleReturnStatus" AS ENUM ('PENDING', 'AUTHORIZED', 'REJECTED');
CREATE TYPE "SaleReturnKind" AS ENUM ('CREDIT_NOTE', 'MANUAL_RETURN');

ALTER TABLE "SaleReturn"
  ADD COLUMN "kind" "SaleReturnKind" NOT NULL DEFAULT 'MANUAL_RETURN',
  ADD COLUMN "status" "SaleReturnStatus" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "idempotencyKey" TEXT NOT NULL DEFAULT md5(random()::text || clock_timestamp()::text),
  ADD COLUMN "authorizedAt" TIMESTAMP(3),
  ADD COLUMN "requestedById" TEXT,
  ADD COLUMN "creditNoteBillType" TEXT,
  ADD COLUMN "creditNoteAfipType" INTEGER,
  ADD COLUMN "creditNoteCAE" TEXT,
  ADD COLUMN "creditNoteNumber" INTEGER,
  ADD COLUMN "creditNotePointOfSale" INTEGER,
  ADD COLUMN "originalCAE" TEXT,
  ADD COLUMN "originalVoucherType" INTEGER,
  ADD COLUMN "originalNumber" INTEGER,
  ADD COLUMN "originalPointOfSale" INTEGER,
  ADD COLUMN "refundMethod" TEXT;

ALTER TABLE "SaleReturn"
  ADD CONSTRAINT "SaleReturn_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE UNIQUE INDEX "SaleReturn_orderId_kind_key" ON "SaleReturn"("orderId", "kind");
CREATE UNIQUE INDEX "SaleReturn_businessId_idempotencyKey_key" ON "SaleReturn"("businessId", "idempotencyKey");
