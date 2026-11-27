# TEST_CHECKLIST.md - Optional IVA Column in Excel Import

## Checklist

### 1. Shared IVA Parser Unit Tests
- [ ] `parseExcelIva("A")` should return `{ percent: 21, hasLetter: true }`
- [ ] `parseExcelIva("a")` should return `{ percent: 21, hasLetter: true }`
- [ ] `parseExcelIva("21%")` should return `{ percent: 21, hasLetter: false }`
- [ ] `parseExcelIva("10.5%")` should return `{ percent: 10.5, hasLetter: false }`
- [ ] `parseExcelIva("0%")` should return `{ percent: 0, hasLetter: false }`
- [ ] `parseExcelIva("21")` should return `{ percent: 21, hasLetter: false }`
- [ ] `parseExcelIva("10,5")` should return `{ percent: 10.5, hasLetter: false }`
- [ ] `parseExcelIva("")` should return `{ percent: null, hasLetter: false }`
- [ ] `parseExcelIva(null)` should return `{ percent: null, hasLetter: false }`
- [ ] `parseExcelIva(undefined)` should return `{ percent: null, hasLetter: false }`
- [ ] `parseExcelIva("invalid-text")` should return `{ percent: null, hasLetter: false }`

### 2. Bulk Product Action Integration Tests (price calculations)
- [ ] Letter "A": Product created with costPrice using 21% IVA, ignoring supplier's general/default IVA.
- [ ] Custom Percentage "10.5%": Product created with costPrice using 10.5% IVA, ignoring supplier's general/default IVA.
- [ ] Custom Percentage "0%": Product created with costPrice using 0% IVA, ignoring supplier's general/default IVA.
- [ ] Empty value: Product created falling back to applying supplier's general/default IVA (e.g. 21%).
- [ ] Empty value with no supplier: Product created with 0% IVA.

### 3. Client UI Rendering Logic Tests
- [ ] Auto-detection of header fields matches "iva", "alícuota", "alicuota", "tasa".
- [ ] Preview calculations on client-side display correctly computed adjusted price according to letter, custom percentage, or supplier fallback.
