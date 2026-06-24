# Tasks: Report Access Restyling

## Phase 1: Icon Replacements

- [ ] **T1** — Replace `src/components/DeleteButton.tsx` SVG with lucide `Trash2`. Keep all props (`onClick`, `id`, `disable`), same button wrapper. Verify: DeleteButton renders Trash2 icon, not custom SVG.
- [ ] **T2** — Replace `src/components/stock/codebarButton.tsx` complex SVG with lucide `Barcode`. Keep theme-aware fill. Verify: CodeBarButton renders Barcode icon.

## Phase 2: Feature Flag — Hide Consultar

- [ ] **T3** — `src/components/ui/SideNav.tsx`: Add `consultarHidden` check on navItems filtering (`process.env.NEXT_PUBLIC_FEATURE_CONSULTAR !== "false"`). Verify: env=false hides Consultar link; unset shows it.
- [ ] **T4** — `src/components/ui/RootMenu.tsx`: Wrap Consultar `<MenuCard>` in conditional render with same env check. Verify: env=false hides Consultar card.

## Phase 3: Stock Page Redesign

- [ ] **T5** — `src/components/stock/product-dashboard.tsx`: Add header before `<StockFilterPanel>` — back arrow (`router.push("/")`), Package icon, "Stock" title, "Gestioná productos y stock" subtitle (match SearchBillHeader layout). Verify: header renders with all elements.
- [ ] **T6** — `src/components/ProductDataTable.tsx`: Change pagination buttons from `size="sm"` with text labels to `size="icon"` with only `ChevronLeft`/`ChevronRight`. Remove "Anterior"/"Siguiente" text. Verify: pagination shows icon-only arrows.

## Phase 4: Reports + URL Param Integration

- [ ] **T7** — `src/app/(protected)/report/page.tsx`: Add header before `<PeriodicReport>` components — back arrow, `FileBarChart` icon, "Reportes" title, "Accedé a reportes del negocio" subtitle. Verify: header renders above report cards.
- [ ] **T8** — `src/components/PeriodicReport.tsx`: Add navigation link per card to `/searchBill?report={period}&from=YYYY-MM-DD&to=YYYY-MM-DD` (daily→today, monthly→month start, yearly→year start). Verify: clicking link navigates with correct params.
- [ ] **T9** — `src/context/FiltersContext/FiltersReducer.ts`: Add `INIT_FROM_URL` action type and reducer case. Payload: `{ report?: string; from?: string; to?: string }`. Parse `from`/`to` to Date, set `startDate`/`endDate` with `active: true`. Discard invalid dates. Merge (spread existing state, override only supplied fields). Verify: dispatch updates dates, preserves other state.
- [ ] **T10** — `src/context/FiltersContext/FiltersContext.tsx` + `src/context/FiltersContext/FiltersProivder.tsx`: Add `initFromUrl` to context interface and provider with `useCallback` wrapper. Verify: provider exposes `initFromUrl` function.
- [ ] **T11** — `src/app/(protected)/searchBill/page.tsx`: Read `searchParams` prop. Create a `"use client"` wrapper (or modify `SearchBillHeader`) that parses `report`/`from`/`to` from URL and dispatches `INIT_FROM_URL` on mount via `useEffect`. Verify: navigating with params sets filter dates.

## Phase 5: Modal → AlertDialog (SaleAccordion, BillButtons, stock-table)

- [ ] **T12** — `src/components/Billing/SaleAccordion.tsx`: Replace `<Modal>` with Radix `<AlertDialog>` for delete confirmation. Use `openDelete` state, confirm→`handleDelete`, cancel→close. Verify: delete shows AlertDialog instead of Modal.
- [ ] **T13** — `src/components/Billing/BillButtons.tsx`: Replace `<Modal>` on line 537 with Radix `<Dialog>` for error display (dismiss only, no confirm). Verify: billing error shows Dialog instead of Modal.
- [ ] **T14** — `src/components/stock/stock-table.tsx`: Replace delete `<Modal>` with `<AlertDialog>`, replace edit `<Modal>` with `<Dialog>` (keep `<ProductForm>` children). Verify: delete shows AlertDialog, edit shows Dialog.

## Phase 6: Native Dialog → AlertDialog (Bulk Operations)

- [ ] **T15** — `src/app/(protected)/stock/bulk-update/page.tsx`: Replace all 5 `alert()`/`confirm()` calls with AlertDialog pattern (isConfirmOpen state + callback). Handle: invalid percentage, no selection, confirm action, success, error cases. Verify: bulk update uses AlertDialog, no native dialogs.
- [ ] **T16** — `src/components/stock/bulk-unit-update.tsx`: Replace all 6 `alert()`/`confirm()` calls with AlertDialog pattern. Handle: invalid amount, no selection, confirm action, success, error, catch cases. Verify: unit update uses AlertDialog, no native dialogs.
