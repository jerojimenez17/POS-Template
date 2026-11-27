# Proposal: report-access-restyling

## Intent

Unify UI patterns across Reports, Stock, Consultar — replace legacy SVGs/Modal/`alert()` with Radix, add Reports→Consultar drill-down via URL params.

## Scope

**In**: (1) Hide Consultar via feature flag (2) Reports→Consultar links via URL params (3) Stock header matching SearchBillHeader (4) Icon-only stock pagination (5-6) Trash2 + Barcode icons (7) Bulk alert/confirm→AlertDialog (8) Modal→AlertDialog in SaleAccordion/stock-table/BillButtons

**Out**: Bulk logic changes, FiltersContext refactor, URL-param tests

## Capabilities

### New Capabilities

- `report-navigation`: URL-param drill-down from Reports to searchBill

### Modified Capabilities

None — pure UI refactoring for 1,3-8; item 2 is new capability.

## Approach

1. `NEXT_PUBLIC_FEATURE_CONSULTAR` flag — conditional render in nav + menu
2. Reports cards link `/searchBill?report=daily&from=...`; searchBill reads `searchParams`, dispatches `INIT_FROM_URL` (merge, not replace)
3. Stock header copies SearchBillHeader layout
4. Pagination: `Button size="icon"` with ChevronLeft/ChevronRight
5-6. Straight SVG→lucide swap (Trash2, Barcode)
7. alert/confirm → open state + AlertDialog; confirm uses promise pattern
8. Modal→AlertDialog (ProductDataTable pattern)

## Affected Areas

- `SideNav.tsx`, `RootMenu.tsx` — conditional Consultar
- `report/page.tsx`, `PeriodicReport.tsx` — header + date links
- `searchBill/page.tsx` — read searchParams → init FiltersContext
- `FiltersContext/` — add `INIT_FROM_URL` action
- `stock/product-dashboard`, `ProductDataTable`, `stock-table`, `codebarButton` — header, pagination, AlertDialog, Barcode
- `DeleteButton.tsx` — Trash2
- `stock/bulk-update/page.tsx`, `bulk-unit-update.tsx` — AlertDialog
- `SaleAccordion.tsx`, `BillButtons.tsx` — Modal→AlertDialog

## Risks

- `confirm()` async replacement breaks sync flow (Med) → test each call site
- URL init conflicts with filter state (Low) → merge, not replace
- Missing flag hides Consultar (Low) → default `true`

## Rollback Plan

Per-commit revert on feature branch. Item 2 needs both report links + searchBill reader reverted together. No data changes.

## Success Criteria

- [ ] `FEATURE_CONSULTAR=false` hides Consultar links
- [ ] Report cards navigate to searchBill with date pre-filled
- [ ] Stock header matches SearchBillHeader layout
- [ ] All paginations use icon-only arrows
- [ ] DeleteButton/CodeBarButton use lucide icons
- [ ] Zero native `alert()`/`confirm()` calls remain
- [ ] No old `Modal` component used in changed files
