ALTER TABLE "AuthorizedArcaQrGrant" ADD COLUMN "orderId" TEXT;

CREATE UNIQUE INDEX "AuthorizedArcaQrGrant_orderId_key" ON "AuthorizedArcaQrGrant"("orderId");

ALTER TABLE "AuthorizedArcaQrGrant"
ADD CONSTRAINT "AuthorizedArcaQrGrant_orderId_fkey"
FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;
