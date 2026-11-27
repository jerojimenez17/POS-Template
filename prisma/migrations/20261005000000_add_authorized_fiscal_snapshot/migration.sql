ALTER TABLE "Order" ADD COLUMN "fiscalSnapshot" JSONB;

CREATE TABLE "AuthorizedFiscalSnapshotGrant" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "cae" TEXT NOT NULL,
    "billType" TEXT NOT NULL,
    "invoiceNumber" INTEGER NOT NULL,
    "pointOfSale" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),

    CONSTRAINT "AuthorizedFiscalSnapshotGrant_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "AuthorizedFiscalSnapshotGrant_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "AuthorizedFiscalSnapshotGrant_tokenHash_key" ON "AuthorizedFiscalSnapshotGrant"("tokenHash");
CREATE INDEX "AuthorizedFiscalSnapshotGrant_businessId_cae_consumedAt_idx" ON "AuthorizedFiscalSnapshotGrant"("businessId", "cae", "consumedAt");
CREATE INDEX "AuthorizedFiscalSnapshotGrant_expiresAt_idx" ON "AuthorizedFiscalSnapshotGrant"("expiresAt");
