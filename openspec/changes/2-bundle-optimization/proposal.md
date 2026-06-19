# Change: bundle-optimization

**Source:** C-14 (docs/enhancements/03-cons.md)  
**Phase:** 2 — Bundle & Performance  
**Effort:** ~3 days  
**Risk:** Medium  

## Problem

Bundle size inflated by:
- `moment` (200KB) — deprecated, `date-fns` already installed
- `xlsx` (500KB) — used only in bulk upload
- `jspdf` (400KB) + `html2canvas` (200KB) — used only in print
- `framer-motion` (150KB) — alternatives exist
- `react-hot-toast` + `sonner` (30KB) — dual toast libraries

## Scope

`package.json`, all files importing these dependencies.

## Solution

1. Migrate all `moment` imports to `date-fns`
2. Dynamic import `xlsx` in bulk upload components
3. Dynamic import `jspdf` + `html2canvas` in print components
4. Replace `framer-motion` with CSS transitions where possible
5. Unify toasts: keep `sonner`, remove `react-hot-toast`

## Rollback

Restore removed packages. Static imports instead of dynamic.

## Affected Files

- `package.json`
- `src/components/Billing/PrintButton.tsx`, `PrintableTable.tsx`
- `src/components/stock/BulkUpload.tsx`
- All files importing `moment`
