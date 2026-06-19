# Spec: bundle-optimization

**Source:** C-14  
**Phase:** 2 — Bundle & Performance  
**Effort:** ~3 days  
**Risk:** Medium  

## Requirements

### R1: moment → date-fns (9 files)
Replace all `moment()` calls with `date-fns` equivalents. `date-fns` is already installed.
- `format()` → `format(date, 'pattern')`
- `moment().format('DD/MM/YYYY')` → `format(new Date(), 'dd/MM/yyyy')`
- `moment(date).format(...)` → `format(date, ...)`
- `moment/locale/es` → use `date-fns/locale/es`
- Files: updateRanking.tsx, Account.ts, page.tsx, PrintableTable.tsx, SaleHistory.tsx, FilterBillPanel.tsx, pick-date-stock-ranking.tsx, AccountLedgerModal.tsx

### R2: Dynamic import xlsx (2 files)
- `excel-upload-modal.tsx` — replace `import * as XLSX from 'xlsx'` with dynamic `import('xlsx')`
- `seed-debts.ts` — same pattern

### R3: Dynamic import jspdf + html2canvas (1 file)
- `PDFExport.ts` — replace static imports with dynamic `import('jspdf')` and `import('html2canvas')`

### R4: framer-motion → CSS transitions (3 files)
- `MenuCard.tsx` — replace `motion.div` with CSS transitions + Tailwind
- `register-form.tsx` — replace AnimatePresence with simpler CSS
- `login-form.tsx` — same

### R5: react-hot-toast → sonner (4 files)
- `layout.tsx` — replace `Toaster` from react-hot-toast with sonner's `Toaster`
- `AddButton.tsx`, `EditButton.tsx`, `PaymentStatusGuard.tsx` — replace `toast` import from react-hot-toast to sonner
- Remove `react-hot-toast` from package.json and `Toaster` from layout

## Acceptance Criteria
- [ ] moment removed from dependencies, all imports replaced
- [ ] xlsx dynamically imported
- [ ] jspdf + html2canvas dynamically imported
- [ ] framer-motion removed, replaced with CSS
- [ ] react-hot-toast removed, all toasts use sonner
- [ ] npm run build passes
- [ ] npm run test — no regressions (expected: same or better)
