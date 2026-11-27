# Spec: report-access-restyling

## 1. Feature Flag — Hide Consultar

SideNav and RootMenu MUST conditionally render Consultar based on `NEXT_PUBLIC_FEATURE_CONSULTAR` (default `true`).

| `FEATURE_CONSULTAR` | Consultar in SideNav | Consultar in RootMenu |
|---------------------|---------------------|----------------------|
| unset or `true` | Rendered | Rendered |
| `false` | Hidden | Hidden |

## 2. Stock Page Header

Stock page MUST render: back arrow `router.push("/")`, Package icon, title "Stock", subtitle "Gestioná productos y stock".

**Scenario**: User navigates to `/stock` → header renders with all elements. Back click calls `router.push("/")`.

## 3. Pagination — Icon-Only

ProductDataTable pagination MUST use `Button size="icon"` with ChevronLeft/ChevronRight. Text "Anterior"/"Siguiente" removed.

**Scenario**: Page count >1 → pagination shows icon-only arrows, no text.

## 4. DeleteButton → Trash2

DeleteButton MUST use lucide Trash2. All props (onClick, disabled) identical.

## 5. CodeBarButton → Barcode

CodeBarButton MUST use lucide Barcode. Trigger styling unchanged.

## 6. Alert/Confirm → AlertDialog (Bulk)

All 11 native dialog calls (5 in `bulk-update/page.tsx`, 6 in `bulk-unit-update.tsx`) MUST use Radix AlertDialog with async confirm pattern (isConfirmOpen state + callback).

| Pattern | Replaces | Behavior |
|---------|----------|----------|
| `alert()` | AlertDialog OK | Dismiss only, no side-effects |
| `confirm()` | AlertDialog Confirm/Cancel | Confirm proceeds, Cancel aborts |

**Scenario**: Bulk action triggers → AlertDialog renders instead of native dialog. Confirm/Cancel work correctly.

## 7. Modal → AlertDialog

SaleAccordion.tsx, BillButtons.tsx, stock-table.tsx MUST replace `<Modal>` with Radix AlertDialog (ProductDataTable pattern).

| Component | Trigger | Dialog |
|-----------|---------|--------|
| SaleAccordion | Delete click | AlertDialog confirm |
| BillButtons | Billing error | AlertDialog dismiss |
| stock-table | Delete/Edit | AlertDialog confirm/edit |

## 8. Reports → searchBill Drill-Down

### Header
report/page.tsx MUST render: back arrow, FileBarChart icon, title "Reportes", subtitle "Accedé a reportes del negocio".

### Card links with date params
Each PeriodicReport card MUST link to `/searchBill?report={period}&from=YYYY-MM-DD&to=YYYY-MM-DD`.

| Card | `report` | `from` | `to` |
|------|----------|--------|------|
| Diario | `daily` | today | today |
| Mensual | `monthly` | YYYY-MM-01 | today |
| Anual | `yearly` | YYYY-01-01 | today |

### URL → FiltersContext
searchBill/page.tsx MUST read `searchParams`. FiltersContext MUST add `INIT_FROM_URL` action that MERGES (not replaces) filter state.

#### Scenario: Card click navigates with params
- GIVEN user views daily card
- WHEN clicked → `/searchBill?report=daily&from=2026-06-19&to=2026-06-19`

#### Scenario: searchBill dispatches from URL
- GIVEN URL `/searchBill?report=monthly&from=2026-06-01&to=2026-06-19`
- WHEN page loads → `INIT_FROM_URL({ report: "monthly", from: "2026-06-01", to: "2026-06-19" })`

#### Scenario: Invalid dates discarded
- GIVEN `from=bad-date`
- WHEN page loads → invalid value discarded, valid params applied

#### Scenario: No params keeps defaults
- GIVEN `/searchBill` with no query
- WHEN page loads → `INIT_FROM_URL` not dispatched, filters at defaults

#### Scenario: Merge preserves existing state
- GIVEN filters have `query: "foo"`
- WHEN `INIT_FROM_URL({ report: "daily" })` dispatches
- THEN `query: "foo"` preserved, `report` set to `"daily"`
