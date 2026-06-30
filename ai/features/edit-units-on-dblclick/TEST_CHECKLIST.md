# TEST_CHECKLIST.md — Edit Units on Double-Click

## Feature: `edit-units-on-dblclick`

### AC-01: Display Mode for "unidades"/"unidad" products
- [ ] Unit products display the amount as `<span>` (not `<input>`)
- [ ] `−` and `+` buttons are visible beside the amount span
- [ ] The span text content equals the `amount` prop

### AC-02: Enter Edit Mode on Double-Click
- [ ] Double-clicking the amount `<span>` replaces it with an `<input>` element
- [ ] The `<input>` is pre-filled with the current amount
- [ ] The `<input>` has `inputMode="numeric"`
- [ ] The `<input>` is auto-focused on double-click (content selected)

### AC-03: Save on Enter Key
- [ ] Pressing `Enter` in edit mode calls `updateProductAmount` with the new value
- [ ] After `Enter`, the cell returns to display mode (span visible, input gone)

### AC-04: Save on Blur (Click Outside)
- [ ] Blurring the input (click/tab outside) calls `updateProductAmount` with the new value
- [ ] After blur, the cell returns to display mode

### AC-05: Cancel on Escape Key
- [ ] Pressing `Escape` does NOT call `updateProductAmount`
- [ ] After `Escape`, the cell shows the **original** amount (not the edited value)
- [ ] After `Escape`, the cell returns to display mode (span visible)

### AC-06: Reject Invalid Values
- [ ] Empty string + blur → reverts to original, no update call
- [ ] `"0"` + Enter → reverts to original, no update call
- [ ] `"-1"` + blur → reverts to original, no update call
- [ ] `"abc"` + Enter → reverts to original, no update call

### AC-07: Accept Decimal Values
- [ ] `"2,5"` (comma decimal) + save → calls `updateProductAmount(prodId, 2.5)`
- [ ] `"1.5"` (dot decimal) + save → calls `updateProductAmount(prodId, 1.5)`

### AC-08: Double-Click Works for Both Mouse and Touch
- [ ] React's `onDoubleClick` event activates edit mode (handles both mouse and touch)

### AC-09: Increment/Decrement Buttons Still Functional
- [ ] Clicking `−` calls `updateProductAmount` with `amount - 1` (no regression)
- [ ] Clicking `+` calls `updateProductAmount` with `amount + 1` (no regression)

### AC-10: Increment/Decrement While Editing
- [ ] Clicking `−` or `+` while in edit mode does not crash or break the UI
- [ ] Graceful handling: edit is committed or cancelled before button action fires

### AC-11: Keyboard Navigation — Tab Order
- [ ] Tab order within the table includes the editable amount cells
- [ ] Tabbing away from the edit input triggers blur (save)

## Edge Cases
- [ ] Rapid consecutive double-clicks do not cause issues (React batches state updates)
- [ ] Tab navigation: user tabs into input, types, tabs away → blur triggers save
- [ ] Very long numbers are accepted (no explicit length limit)
- [ ] Floating point precision: `"1.1"` parses as `1.1` (uses `parseFloat`)
- [ ] Empty product list: no impact (component renders per product row)
- [ ] Print mode: edit functionality is wrapped in `print:hidden` (no double-click in print)
- [ ] Unit comparison case-insensitivity: already handled by `.toLowerCase()`
- [ ] Mobile double-tap zoom: `touch-action: manipulation` prevents zoom interference

## Test Files
- [ ] `src/components/Billing/__tests__/InlineAmountInput.test.tsx` — unit tests for the component
- [ ] `src/components/Billing/__tests__/PrintableTable.test.tsx` — integration tests (CA-13 block)

## Implementation Status
- [ ] `src/components/Billing/InlineAmountInput.tsx` — component created
- [ ] `src/components/Billing/PrintableTable.tsx` — modified to use `InlineAmountInput`
- [ ] All unit tests pass
- [ ] All integration tests pass
- [ ] No regressions in existing tests
