-- Rows created before credit-note metadata was introduced are ordinary manual
-- returns.  Only rows with no credit-note AFIP metadata can be backfilled
-- safely; an explicitly-created pending/authorized credit note is preserved.
UPDATE "SaleReturn"
SET "kind" = 'MANUAL_RETURN'
WHERE "kind" = 'CREDIT_NOTE'
  AND "creditNoteAfipType" IS NULL
  AND "creditNoteCAE" IS NULL
  AND "creditNoteNumber" IS NULL
  AND "creditNotePointOfSale" IS NULL;

ALTER TABLE "SaleReturn"
  ALTER COLUMN "kind" SET DEFAULT 'MANUAL_RETURN';
