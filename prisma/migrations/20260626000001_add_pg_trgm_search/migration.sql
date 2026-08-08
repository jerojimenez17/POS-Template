-- Enable pg_trgm extension for fuzzy text search
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- GIN indexes for trigram-based similarity search on Product fields
CREATE INDEX IF NOT EXISTS idx_product_description_trgm ON "Product" USING GIN (description gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_product_code_trgm ON "Product" USING GIN (code gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_product_codebar_trgm ON "Product" USING GIN (codebar gin_trgm_ops);

-- GIN indexes for trigram search on related entity names
CREATE INDEX IF NOT EXISTS idx_brand_name_trgm ON "Brand" USING GIN (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_supplier_name_trgm ON "Supplier" USING GIN (name gin_trgm_ops);
