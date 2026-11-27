# SPEC: Product Search Prefix Ranking

## 1. Summary

Improve the product search used by `src/app/(protected)/stock/productDashboard/` so that products whose `description` starts with the entered search term appear before products that only contain or approximately match the term.

Example: with the query `acido`, `Acido...` products must precede products such as `Colorante acido...` or other lower-relevance matches.

## 2. Current Context

- The page renders `ProductDashboard` from `src/components/stock/product-dashboard.tsx`.
- Search is debounced by 300 ms and calls `getProductsPaginated` in `src/actions/stock.ts`.
- Queries with at least three characters use `getProductsPaginatedWithRanking`, which currently orders primarily by exact code and weighted `pg_trgm` similarity.
- The fallback path orders by `description ASC`, so it does not express search relevance.
- The response is paginated; ranking must be applied before slicing the requested page.
- `Product.description` is nullable. Null descriptions must never be treated as prefix matches.

## 3. Detailed Requirements

### 3.1 Prefix relevance

1. For a non-empty search query, calculate whether the product description begins with the complete normalized query.
2. Prefix matching must be case-insensitive and must ignore leading/trailing whitespace in the query.
3. Prefix matches receive higher priority than non-prefix matches, regardless of their lower `pg_trgm` similarity score.
4. Existing exact code/codebar priority remains higher than description prefix priority when `exactCode` is not enabled, preserving barcode lookup behavior.
5. Within the same priority tier, retain the existing relevance ranking (similarity and its current field weights), with a deterministic description/id tie-breaker.
6. A description containing the query later in the string is not a prefix match.
7. Multi-word queries are treated as one phrase for prefix ranking; the complete normalized phrase must begin the description. Existing filtering behavior remains unchanged unless needed to calculate the rank.

### 3.2 Search modes and pagination

1. Apply the ranking to the product-dashboard path (`getProductsPaginated`) for searches of three or more characters and its ILIKE fallback.
2. Preserve `codeOnly`: when enabled, description prefix ranking must not be used; code/codebar relevance remains the only ranking concern.
3. Preserve `exactCode`: exact code/codebar lookup continues to bypass general ranked search.
4. Apply ordering in the database ranking query before `LIMIT`/page slicing. It is not sufficient to reorder only the products already returned for one page.
5. Preserve the existing business, category, brand, and unit filters.
6. Empty and short searches must retain the existing non-search behavior except for deterministic ordering improvements explicitly required by the implementation.
7. The result contract (`products`, `total`, `page`, `pageSize`, `totalPages`) must not change.

### 3.3 Compatibility and performance

1. Do not add a Product column, ranking table, or user-visible configuration.
2. Use parameterized Prisma SQL for any raw ranking query; search text and business/filter values must never be interpolated into SQL strings.
3. Preserve the existing fallback when `pg_trgm` is unavailable, but make its ordering prefix-aware as well.
4. Keep the existing maximum candidate behavior documented in the action. If the candidate limit can cause a valid prefix result to be omitted, the implementation must either rank all filtered candidates before pagination or explicitly document and test a safe limit strategy.
5. No new npm dependency is required. A PostgreSQL extension or migration is not required for the core case unless accent-insensitive matching is approved as part of clarification below.

## 4. Ambiguities and Decisions

### 4.1 Meaning of “starts with”

Recommended decision: rank only descriptions whose first character/phrase begins with the query (`description ILIKE query + '%'`), not descriptions where a later word begins with it. This directly satisfies “names start with `acido`” and prevents `Colorante acido` from being promoted to the top tier.

### 4.2 Accents

The request uses `acido`, while Spanish product names may be stored as `Ácido`. The core acceptance criteria require case-insensitive matching. Product/QA should confirm whether accent-insensitive matching is required. Recommended UX decision: yes, treat `acido` and `ácido` equivalently, implemented consistently in both filtering and ranking using an approved PostgreSQL `unaccent` strategy. If that strategy is not already enabled, the first implementation may defer accent handling and record it as a follow-up rather than silently adding a database extension.

### 4.3 Exact code versus description prefix

Recommended decision: preserve exact code/codebar as the strongest existing signal. The feature changes ordering among general name/search matches and must not make a name prefix outrank a deliberate exact barcode/code lookup.

## 5. Acceptance Criteria

- [ ] **AC1 — Prefix precedence:** Given matching products `Acido citrico`, `Acido...`, `Producto acido`, and `Acidificante`, a search for `acido` returns all descriptions beginning with `acido` before `Producto acido` (subject to exact-code precedence).
- [ ] **AC2 — Case insensitivity:** `acido`, `ACIDO`, and `AcIdO` produce the same prefix tier and equivalent ordering for the same dataset.
- [ ] **AC3 — No false prefix:** A description containing the term only after its first character is not assigned the prefix tier.
- [ ] **AC4 — Complete phrase:** For query `leche descremada`, only descriptions beginning with that complete phrase receive prefix priority; a description beginning with only `leche` does not.
- [ ] **AC5 — Null safety:** A product with `description = null` never receives prefix priority and does not cause the request to fail.
- [ ] **AC6 — Similarity within tiers:** Two products in the same prefix/non-prefix tier are ordered by the existing relevance score, then by deterministic tie-breakers.
- [ ] **AC7 — Pagination correctness:** With more than one page of matches, every prefix match appears before any lower-tier match across the full result set, not merely within each fetched page.
- [ ] **AC8 — Filters:** Business isolation and category, brand, and unit filters return the same eligible product set as before, with only ordering changed.
- [ ] **AC9 — Code-only mode:** With `codeOnly = true`, description prefix status does not affect ordering or eligibility.
- [ ] **AC10 — Exact-code mode:** With `exactCode = true`, exact code/codebar behavior and response shape remain unchanged.
- [ ] **AC11 — Short/empty queries:** Empty and short queries continue to return the existing eligible products without errors; no ranking SQL requiring `pg_trgm` is invoked for unsupported short-query behavior.
- [ ] **AC12 — Fallback:** If the ranked PostgreSQL query fails because `pg_trgm` is unavailable, the fallback still returns prefix matches before other ILIKE matches.
- [ ] **AC13 — Regression:** Product-dashboard search, loading, page navigation, refresh, and 300 ms debounce continue to function without UI API changes.
- [ ] **AC14 — Security:** Search and filter inputs are passed through Prisma parameter binding; static review finds no raw SQL interpolation of user input.
- [ ] **AC15 — No schema churn:** The change requires no new Prisma model, field, migration, or npm package.

## 6. Interfaces and Ranking Contract

### Existing public action interface (unchanged)

```typescript
interface GetProductsPaginatedParams {
  page?: number;
  pageSize?: number;
  search?: string;
  categoryId?: string;
  brandId?: string;
  unit?: string;
  codeOnly?: boolean;
  exactCode?: boolean;
}

interface PaginatedProducts<TProduct> {
  products: TProduct[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}
```

### Internal ranking contract (recommended)

```typescript
interface ProductSearchRankingOptions {
  search: string;
  codeOnly: boolean;
}

interface ProductSearchRank {
  exactCode: number;       // existing exact-code precedence
  descriptionPrefix: number; // 1 for prefix, 0 otherwise
  relevanceScore: number;  // existing similarity/field-weight score
  description: string;     // deterministic tie-breaker
  id: string;              // final deterministic tie-breaker
}
```

The exact representation may remain SQL-only; this interface documents the required ordering semantics and is not a requirement to expose rank values to the client.

## 7. Recommended File Structure

### Modified files

| File | Responsibility |
|---|---|
| `src/actions/stock.ts` | Add prefix rank to `getProductsPaginatedWithRanking`; update the ILIKE fallback ordering; preserve existing filters, modes, and response shape. |
| `src/components/stock/product-dashboard.tsx` | No functional change expected; verify it continues to consume the unchanged action contract. |

### Optional internal file

| File | Responsibility |
|---|---|
| `src/lib/product-search-ranking.ts` | Only if ranking expression construction can be cleanly extracted without duplicating Prisma SQL or weakening type safety. Keep database-specific scoring close to the action if extraction adds complexity. |

### Verification locations (for the QA workflow)

| File | Coverage |
|---|---|
| `src/__tests__/actions/getProductsPaginated.test.ts` or the repository’s existing stock action test location | Prefix precedence, ties, pagination, filters, modes, null descriptions, and fallback behavior. |

## 8. Architecture and Data Flow

```text
StockFilterPanel
  -> ProductDashboard (300 ms debounce)
  -> getProductsPaginated(params)
  -> authenticate and constrain by session businessId
  -> exact-code path OR ranked pg_trgm path OR ILIKE fallback
  -> filter eligible products
  -> order by exact code, description prefix, existing relevance, stable tie-breakers
  -> paginate
  -> ProductDataTable
```

The client should not fetch all products or sort pages locally. Ranking belongs in the server-side data access layer so pagination, business isolation, and ordering remain consistent.

## 9. Implementation Notes and Non-Goals

- Do not alter product creation/editing, barcode scanning, bulk update, catalog search, or the separate products-ranking page.
- Do not change displayed product fields or add a relevance indicator.
- Do not replace `pg_trgm` similarity; prefix priority is an additional leading ranking component.
- Keep `auth()` and the existing business scoping intact.
- The Developer should inspect the actual generated Prisma/PostgreSQL behavior before choosing `ILIKE`, `lower(...)`, or `unaccent(...)` expressions, and should preserve the existing no-extension fallback.

## 10. Suggested Implementation Order

1. Confirm the “description begins with the full phrase” and accent decisions.
2. Define the ordering precedence and deterministic tie-breakers.
3. Update the ranked query and ensure IDs are sliced only after ranking.
4. Update the fallback ordering without changing filtering or response types.
5. Have QA validate the acceptance scenarios, including multi-page results and `codeOnly`/`exactCode` regressions.
6. Run lint and TypeScript checks during review; no code or test implementation is part of this architecture deliverable.
