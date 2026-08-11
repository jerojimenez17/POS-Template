# TEST_CHECKLIST.md — Fix blurry units on thermal printer ticket

**Feature:** Fix blurry units on thermal printer ticket
**Spec:** `ai/features/fix-thermal-printer-blurry-units/SPEC.md`
**Test file:** `ai/features/fix-thermal-printer-blurry-units/thermal-printer-css.test.ts`

---

## Acceptance Criteria Checklist

### AC1 — CSS change only

| # | Check | Test | Status |
|---|-------|------|--------|
| 1.1 | `.product-price` rule exists in `buildThermalPrintHTML()` source | `should contain a .product-price CSS rule in the source` | ⬜ |
| 1.2 | `font-size: 12px` (was 11px) | `should have font-size: 12px` | ⬜ |
| 1.3 | `font-weight: 700` (was not set) | `should have font-weight: 700` | ⬜ |
| 1.4 | `color: #000` (was #555) | `should have color: #000` | ⬜ |
| 1.5 | Complete rule contains all three properties with correct values | `should contain the complete CSS rule: font-size: 12px; font-weight: 700; color: #000;` | ⬜ |
| 1.6 | Old values (`font-size: 11px`, `color: #555`) are NOT present | Same test as 1.5 (uses `not.toContain`) | ⬜ |

### AC2 — HTML fallback renders bold units

| # | Check | Manual Verification | Status |
|---|-------|---------------------|--------|
| 2.1 | Quantity line renders in bold black text at 12px when QZ Tray is disabled | Print test ticket via HTML fallback (QZ Tray off) | ⬜ |
| 2.2 | Text is legible on thermal printer (203 DPI) | Visual inspection on physical printer | ⬜ |

### AC3 — QZ Tray path unaffected

| # | Check | Manual Verification | Status |
|---|-------|---------------------|--------|
| 3.1 | `generateThermalReceipt()` output is identical before/after | Compare ESC/POS output byte-for-byte | ⬜ |
| 3.2 | No changes to `ESCPOS` constants or `generateThermalReceipt()` function | Code review of `BrowserPrint.ts` | ⬜ |

### AC4 — Layout preserved

| # | Check | Test | Status |
|---|-------|------|--------|
| 4.1 | `.product-row` still uses `flex-wrap: wrap` | `should preserve flex-wrap: wrap on .product-row` | ⬜ |
| 4.2 | `.product-desc` styling unchanged (font-size: 12.5px) | `should still have font-size: 12.5px on .product-desc` | ⬜ |
| 4.3 | `.product-sum` styling unchanged (font-weight: 700, font-size: 13px) | `should not accidentally modify .product-sum styling` | ⬜ |
| 4.4 | Product row does not break for typical content (≤30 chars desc, ≤10 chars price) | Manual verification on 80mm ticket | ⬜ |

### AC5 — No regressions

| # | Check | Command | Status |
|---|-------|---------|--------|
| 5.1 | `npm run lint` passes | Run `npm run lint` | ⬜ |
| 5.2 | `npm run build` succeeds | Run `npm run build` | ⬜ |
| 5.3 | All existing tests pass | Run `npm run test` | ⬜ |

---

## Edge Cases

| # | Check | Status |
|---|-------|--------|
| EC1 | 12px fits within 80mm ticket width (~304px at 96 DPI) | ⬜ |
| EC2 | Bold text does not cause horizontal overflow with `flex-wrap: wrap` | ⬜ |
| EC3 | Typical product line `x2 $150.00` (~14 chars) renders at ~100px at 12px, well within 304px | ⬜ |

---

## Files Modified

| File | Change | Verified |
|------|--------|----------|
| `src/lib/print/BrowserPrint.ts` | `.product-price` CSS rule updated (line ~268) | ⬜ |

## Files NOT Modified (regression check)

| File | Verified |
|------|----------|
| `src/lib/print/BrowserPrint.ts` — `generateThermalReceipt()` | ⬜ |
| `src/components/Billing/PrintableTable.tsx` | ⬜ |
| `src/components/Billing/BillButtons.tsx` | ⬜ |
| `src/context/BillProvider.tsx` | ⬜ |
| `src/lib/print/PDFExport.ts` | ⬜ |

---

## Test Execution

Run the TDD tests:

```bash
npm run test -- ai/features/fix-thermal-printer-blurry-units/thermal-printer-css.test.ts
```

**Expected result BEFORE fix:** 4 tests FAIL (font-size, font-weight, color, full rule check)
**Expected result AFTER fix:** All tests PASS
