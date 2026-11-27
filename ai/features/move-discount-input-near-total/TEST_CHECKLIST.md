# TEST_CHECKLIST.md — Move Discount Input Near Total

**Feature:** Relocate discount percentage input into the Totals Section of `PrintableTable`.

---

## DiscountControl Unit Tests (`DiscountControl.test.tsx`)

### Rendering
- [ ] Renders an `<input>` element (role=spinbutton)
- [ ] Displays the current `discount` value from `BillState` (e.g. `10` shows "10")
- [ ] Displays `"0"` when `discount` is 0
- [ ] Displays a `"%"` suffix or label
- [ ] Has an associated `<label>` containing the text "Descuento"
- [ ] Has `aria-label="Porcentaje de descuento"`
- [ ] Has `inputMode="numeric"`
- [ ] Has `autoComplete="off"`

### Committing Changes
- [ ] Dispatches `{ type: "discount", payload }` on Enter key press
- [ ] Dispatches `{ type: "discount", payload }` on blur
- [ ] Commits `0` when input is cleared (empty string)
- [ ] Dispatches the correct numeric value when the user types a number

### Clamping
- [ ] Clamps negative values (e.g. `-5`) to `0`
- [ ] Clamps values > 100 (e.g. `150`) to `100`
- [ ] Accepts fractional values like `9.5`
- [ ] Treats non-numeric strings as `0`

### Read-only Mode (`editable=false`)
- [ ] Renders a disabled or readOnly input
- [ ] Does NOT dispatch on Enter
- [ ] Does NOT dispatch on blur

### External State Sync
- [ ] Re-renders when `BillState.discount` changes externally (e.g. order reset)

---

## PrintableTable Discount Integration Tests (`PrintableTable-discount.test.tsx`)

### DiscountControl Placement
- [ ] Renders a `DiscountControl` input (role=spinbutton) inside the totals section
- [ ] Renders the `%` suffix near the totals
- [ ] Renders the `Descuento` label near the totals

### Descuento Row Visibility
- [ ] Shows the Descuento row when `discount > 0`
- [ ] Does NOT show the Descuento row when `discount = 0`
- [ ] Shows the correct percentage in the Descuento row label (e.g. "Descuento (10%)")

### Discount Amount Calculation
- [ ] Calculates and displays the correct discount amount (subtotal × discount%)
- [ ] Handles fractional percentages correctly (e.g. 7.5%)

### Total Reflects Discount
- [ ] Total equals Subtotal when discount is 0
- [ ] Total equals `subtotal × (1 - discount/100)` after discount is applied
- [ ] Handles 100% discount (total = 0)

### Subtotal Independence
- [ ] Subtotal always shows the gross amount (no discount applied)

### Multiple Products
- [ ] Calculates correct totals with multiple products and a discount

### Print:hidden
- [ ] DiscountControl wrapper has `print:hidden` class (not visible in print output)

---

## Acceptance Criteria Cross-Reference (from SPEC §7)

| # | Criterion | Verified By |
|---|-----------|-------------|
| 1 | Placement: editable discount input in Totals Section, no "edit mode" needed | DiscountControl placement tests |
| 2 | Data contract: edits `BillState.discount` as percentage number | Committing changes tests |
| 3 | Live recompute: Total row updates in real time | Total reflects discount tests |
| 4 | Edge cases: empty→0, negatives→0, >100→100, Total never negative | Clamping tests |
| 5 | No duplication: form discount input removed | (Manual verification / lint) |
| 6 | Print: interactive control absent from print output | Print:hidden tests |
| 7 | Accessibility: label, aria-label, inputMode, Enter/blur commit | Rendering tests |
| 8 | Dark mode: uses existing `dark:` classes | (Manual verification) |
| 9 | Read-only contexts: not editable via `editable=false` prop | Read-only mode tests |
| 10 | Regression: lint + build + existing tests pass | CI verification |
