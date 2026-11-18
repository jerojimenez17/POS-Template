CREATE TYPE "PaymentVoucherStatus" AS ENUM ('PENDING', 'ISSUING', 'AUTHORIZED', 'FAILED', 'UNKNOWN');
CREATE TYPE "PaymentVoucherAttemptStatus" AS ENUM ('PREPARING', 'ISSUING', 'AUTHORIZED', 'FAILED', 'UNKNOWN');

ALTER TABLE "Client"
  ADD COLUMN "fiscalDocumentType" TEXT,
  ADD COLUMN "fiscalDocumentNumber" TEXT;

CREATE TABLE "PaymentVoucher" (
    "id" TEXT NOT NULL,
    "cashMovementId" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "status" "PaymentVoucherStatus" NOT NULL DEFAULT 'PENDING',
    "amount" DECIMAL(12,2) NOT NULL,
    "billType" TEXT NOT NULL,
    "afipVoucherType" INTEGER,
    "invoiceNumber" INTEGER,
    "invoicePointOfSale" INTEGER,
    "cae" TEXT,
    "caeVencimiento" TEXT,
    "qrData" TEXT,
    "issuedAt" TIMESTAMP(3),
    "fiscalSnapshot" JSONB,
    "observedTotal" DECIMAL(12,2),
    "observedCae" TEXT,
    "observedInvoiceNumber" INTEGER,
    "observedInvoicePointOfSale" INTEGER,
    "observedIssuedAt" TIMESTAMP(3),
    "currentAttempt" INTEGER NOT NULL DEFAULT 0,
    "lastErrorCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PaymentVoucher_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PaymentVoucherAttempt" (
    "id" TEXT NOT NULL,
    "paymentVoucherId" TEXT NOT NULL,
    "attemptNumber" INTEGER NOT NULL,
    "status" "PaymentVoucherAttemptStatus" NOT NULL,
    "billType" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "invoicePointOfSale" INTEGER NOT NULL,
    "recipientSnapshot" JSONB NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "safeErrorCode" TEXT,
    CONSTRAINT "PaymentVoucherAttempt_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PaymentVoucher_cashMovementId_key" ON "PaymentVoucher"("cashMovementId");
CREATE INDEX "PaymentVoucher_businessId_idx" ON "PaymentVoucher"("businessId");
CREATE INDEX "PaymentVoucher_status_updatedAt_idx" ON "PaymentVoucher"("status", "updatedAt");
CREATE UNIQUE INDEX "PaymentVoucherAttempt_paymentVoucherId_attemptNumber_key" ON "PaymentVoucherAttempt"("paymentVoucherId", "attemptNumber");
CREATE INDEX "PaymentVoucherAttempt_paymentVoucherId_startedAt_idx" ON "PaymentVoucherAttempt"("paymentVoucherId", "startedAt");

ALTER TABLE "PaymentVoucher"
  ADD CONSTRAINT "PaymentVoucher_cashMovementId_fkey"
  FOREIGN KEY ("cashMovementId") REFERENCES "CashMovement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PaymentVoucher"
  ADD CONSTRAINT "PaymentVoucher_businessId_fkey"
  FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PaymentVoucherAttempt"
  ADD CONSTRAINT "PaymentVoucherAttempt_paymentVoucherId_fkey"
  FOREIGN KEY ("paymentVoucherId") REFERENCES "PaymentVoucher"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
