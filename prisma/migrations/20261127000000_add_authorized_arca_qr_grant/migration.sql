ALTER TABLE "Order" ADD COLUMN "qrDataPolicyVersion" INTEGER;

UPDATE "Order" SET "qrDataPolicyVersion" = 0;

ALTER TABLE "Order" ALTER COLUMN "qrDataPolicyVersion" SET DEFAULT 1;
ALTER TABLE "Order" ALTER COLUMN "qrDataPolicyVersion" SET NOT NULL;

CREATE TABLE "AuthorizedArcaQrGrant" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "cae" TEXT NOT NULL,
    "billType" TEXT NOT NULL,
    "afipVoucherType" INTEGER NOT NULL,
    "invoiceNumber" INTEGER NOT NULL,
    "pointOfSale" INTEGER NOT NULL,
    "fiscalAmount" DECIMAL(12,2) NOT NULL,
    "issuerCuit" TEXT NOT NULL,
    "requestDate" DATE NOT NULL,
    "recipientIvaCondition" TEXT NOT NULL,
    "recipientDocumentType" TEXT,
    "recipientDocumentNumber" TEXT,
    "payload" JSONB,
    "rawQrData" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),

    CONSTRAINT "AuthorizedArcaQrGrant_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AuthorizedArcaQrGrant_tokenHash_key" ON "AuthorizedArcaQrGrant"("tokenHash");
CREATE INDEX "AuthorizedArcaQrGrant_businessId_cae_consumedAt_idx" ON "AuthorizedArcaQrGrant"("businessId", "cae", "consumedAt");
CREATE INDEX "AuthorizedArcaQrGrant_expiresAt_idx" ON "AuthorizedArcaQrGrant"("expiresAt");

ALTER TABLE "AuthorizedArcaQrGrant" ADD CONSTRAINT "AuthorizedArcaQrGrant_businessId_fkey"
FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
