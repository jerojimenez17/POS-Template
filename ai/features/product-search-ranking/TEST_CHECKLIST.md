# Product Search Prefix Ranking — QA Checklist

Source of truth: `ai/features/product-search-ranking/SPEC.md`.

- [ ] AC1: Description prefixes rank before later-occurrence matches, while exact code/codebar remains strongest.
- [ ] AC2: Case variants (`acido`, `ACIDO`, `AcIdO`) produce the same prefix tier and order; query edge whitespace is ignored.
- [ ] AC3: `Producto acido` is not a prefix match for `acido`.
- [ ] AC4: `leche descremada` is ranked as one complete phrase; `leche entera` is not a prefix match.
- [ ] AC5: `null` descriptions are safe and never prefix-ranked.
- [ ] AC6: Similarity remains the secondary order within prefix and non-prefix tiers, followed by deterministic description/id tie-breakers.
- [ ] AC7: Ranking is applied before pagination; page boundaries cannot place a lower-tier result before a prefix result.
- [ ] AC8: Business, category, brand, and unit filters preserve the eligible set.
- [ ] AC9: `codeOnly` excludes description prefix ranking and description eligibility.
- [ ] AC10: `exactCode` keeps exact code/codebar lookup and the unchanged response contract.
- [ ] AC11: Empty and short queries use non-ranked behavior without invoking `pg_trgm` SQL.
- [ ] AC12: The `pg_trgm` failure fallback remains prefix-aware before slicing the page.
- [ ] AC13: Product-dashboard debounce/loading/navigation/refresh remain API-compatible (no client API changes).
- [ ] AC14: Raw ranking SQL uses Prisma parameter binding for search and filter values; no user-input interpolation.
- [ ] AC15: No Product schema, migration, or dependency changes are required.

## Test execution

The action tests use Vitest module mocks for `auth` and Prisma. They are deterministic and do not require PostgreSQL or the `pg_trgm` extension. The fallback suite deliberately rejects `$queryRaw` to exercise the no-extension path.
