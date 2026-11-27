# pg-trgm-search Specification

## Purpose

Enable fuzzy text search across product codes, product barcodes, product descriptions, brand names, and supplier names using PostgreSQL's `pg_trgm` extension with GIN trigram indexes. Queries tolerate typos and partial matches that exact-match (`LIKE`) or full-text search (`tsvector`) would miss.

## Requirements

### Requirement: Extension Enabled

The `pg_trgm` extension **MUST** be enabled via `CREATE EXTENSION IF NOT EXISTS pg_trgm` before any trigram index is created. The migration `20260626000001_add_pg_trgm_search` handles this.

#### Scenario: Extension available

- GIVEN a database where `20260626000001_add_pg_trgm_search` has been applied
- WHEN `SELECT * FROM pg_extension WHERE extname = 'pg_trgm'` runs
- THEN exactly one row is returned

### Requirement: GIN Trigram Indexes

GIN indexes with `gin_trgm_ops` operator class **MUST** exist on the following columns for trigram-accelerated similarity search:

| Table | Column | Index Name |
|-------|--------|------------|
| `Product` | `description` | `idx_product_description_trgm` |
| `Product` | `code` | `idx_product_code_trgm` |
| `Product` | `codebar` | `idx_product_codebar_trgm` |
| `Brand` | `name` | `idx_brand_name_trgm` |
| `Supplier` | `name` | `idx_supplier_name_trgm` |

Each index **SHOULD** be created with `IF NOT EXISTS` for idempotent re-runs.

#### Scenario: Search with typo tolerance

- GIVEN a Product with description `"Coca-Cola 500ml"` and code `"COC500"`
- WHEN a user searches `"cocacola"` (fused, missing hyphen)
- THEN the Product is returned because trigram similarity exceeds the query threshold (`similarity > 0.3`)

#### Scenario: Search by partial code

- GIVEN a Product with code `"PROD-12345-XYZ"`
- WHEN a user searches `"12345"`
- THEN the Product is returned because the code trigram index matches the substring

#### Scenario: Search by codebar fragment

- GIVEN a Product with codebar `"7791234567890"`
- WHEN a user searches `"34567"`
- THEN the Product is returned because the codebar trigram index matches the substring

### Requirement: Query Usage Pattern

Code that performs fuzzy search **SHOULD** use `similarity()` or `%` operator with a minimum threshold of `0.3` to avoid noise from very low-similarity matches. Searches **MAY** order results by `similarity(column, query) DESC`.

#### Scenario: Relevance ordering

- GIVEN Products with codes `"COC500"`, `"COC1000"`, `"FAN500"`
- WHEN a user searches `"COC"`
- THEN results are ordered `COC500` first, then `COC1000`, then `FAN500` (if threshold met)
