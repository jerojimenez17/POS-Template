# SPEC.md — Edit Units on Double-Click

## Feature Name
`edit-units-on-dblclick`

## Goal
Allow users to directly edit the quantity of products with `"unidades"` / `"unidad"` units by double-clicking or tapping on the amount number in the `PrintableTable` component. Currently these products show a static `<span>` with increment (`+`) / decrement (`−`) buttons. The goal is to transform the static amount into an inline editable field on double-click/touch, mirroring the user experience of the `DecimalInput` used for other units (e.g., `"kg"`).

## Requirements (Spanish, matching user request)
> "Al hacer doble click o touch en las unidades se permite editar el numero mediante el teclado"

1. **Visual State — Display Mode (default)**:
   - For products with `unit === "unidades"` or `"unidad"`, the amount is shown as a static `<span>` (as today), with the `−` and `+` buttons beside it.
   - No visible change to existing users until they interact.

2. **Activation — Double-Click / Tap**:
   - A double-click (mouse) or double-tap (touch) on the `<span>` containing the amount number transitions that cell into **Edit Mode**.
   - The `−` and `+` buttons should remain visible and functional during edit mode.

3. **Edit Mode**:
   - The static `<span>` is replaced by an `<input type="text" inputMode="numeric">` pre-filled with the current amount value.
   - The input is auto-focused and its content is selected (highlighted) for immediate replacement.
   - The input width should be similar to the span it replaces (keep `w-12` or adjust slightly for usability).

4. **Save on Enter**:
   - Pressing the `Enter` key saves the value and returns to display mode.

5. **Save on Blur**:
   - Clicking/tabbing outside the input (blur event) saves the value and returns to display mode.

6. **Cancel on Escape**:
   - Pressing the `Escape` key reverts to the original amount value and returns to display mode (no save).

7. **Validation**:
   - On save, parse the input as a number (accepting both `.` and `,` as decimal separators).
   - If the parsed value is **not a positive number** (NaN, zero, negative, or empty), **reject the input**: revert to the original amount, do NOT call `updateProductAmount`.
   - Optionally show a brief visual feedback (e.g., a quick red border flash) on invalid input, but this is a **nice-to-have**, not required for MVP.

8. **Decimal Support**:
   - The input must accept decimal values for "unidades"/"unidad" (e.g., `1.5`, `2,5`). Even though these are "units", the existing `updateProductAmount` works with `number`, and the Product model's `amount` is `number` (floats are valid).

9. **Touch Support**:
   - On touch devices, double-tap should trigger the edit mode. Use the `onDoubleClick` event (React normalizes this for both mouse and touch).

10. **Increment/Decrement Buttons**:
    - The `−` and `+` buttons must continue to work in both display and edit modes. If the user clicks them while in edit mode, the edit is saved (blur) or cancelled — this is acceptable as long as it doesn't break. Simpler approach: clicking `−`/`+` while editing should **blur the input first** (triggering save/cancel naturally), or remain functional without losing edit state on the first click.

## Acceptance Criteria (for QA / Test-Driven Development)

### AC-01: Display Mode for "unidades"/"unidad" products
- **Given** a product with `unit = "unidades"` or `"unidad"`
- **When** the `PrintableTable` renders
- **Then** the amount is displayed as a `<span>` (not an `<input>`), with `−` and `+` buttons visible

### AC-02: Enter Edit Mode on Double-Click
- **Given** a product with `unit = "unidades"` or `"unidad"` in display mode
- **When** the user double-clicks on the amount `<span>`
- **Then** the `<span>` is replaced by an `<input>` pre-filled with the current amount, auto-focused, and the input text is selected

### AC-03: Save on Enter Key
- **Given** the input is in edit mode with a modified value (e.g., `5`)
- **When** the user presses Enter
- **Then** `updateProductAmount` is called with the new amount (`5`), and the cell returns to display mode showing the new value

### AC-04: Save on Blur (Click Outside)
- **Given** the input is in edit mode with a modified value (e.g., `3`)
- **When** the input loses focus (blur event)
- **Then** `updateProductAmount` is called with the new amount (`3`), and the cell returns to display mode

### AC-05: Cancel on Escape Key
- **Given** the input is in edit mode with a modified value (e.g., changed from `2` to `10`)
- **When** the user presses Escape
- **Then** the cell returns to display mode showing the **original** value (`2`), and `updateProductAmount` is NOT called

### AC-06: Reject Invalid Values
- **Given** the input is in edit mode
- **When** the user enters an empty string, `"0"`, `"-1"`, `"abc"`, or any non-positive value and triggers save (Enter/blur)
- **Then** the cell reverts to the original amount, and `updateProductAmount` is NOT called

### AC-07: Accept Decimal Values
- **Given** the input is in edit mode with a value of `"2,5"` (comma decimal) or `"1.5"` (dot decimal)
- **When** the user saves (Enter/blur)
- **Then** `updateProductAmount` is called with the correct numeric value (`2.5` or `1.5`)

### AC-08: Double-Click Works for Both Mouse and Touch
- **Given** the component renders on a device
- **When** the user double-clicks (mouse) or double-taps (touch) on the amount
- **Then** edit mode is activated (use React's `onDoubleClick` which handles both)

### AC-09: Increment/Decrement Buttons Still Functional
- **Given** a product in display mode
- **When** the user clicks `−` or `+` buttons
- **Then** `updateProductAmount` is called with `amount - 1` or `amount + 1` as before (no regression)

### AC-10: Increment/Decrement While Editing
- **Given** the input is in edit mode
- **When** the user clicks `−` or `+`
- **Then** the behavior should be one of:
  - The edit is committed (blur/save) and then the button action fires; OR
  - The edit is cancelled and the button action fires
  - (Either is acceptable — the key is no crash or broken state)

### AC-11: Keyboard Navigation — Tab Order
- **Given** multiple products in the table
- **When** the user tabs into an editable amount cell and presses Enter (or types)
- **Then** the input should behave as a standard form input within the tab order

## Data Models / Interfaces

### New Component Props (InlineAmountInput)
```typescript
interface InlineAmountInputProps {
  /** Current product amount */
  amount: number;
  /** Product ID for update callback */
  productId: string;
  /** Callback invoked when amount is confirmed (Enter/blur with valid value) */
  updateAmount: (productId: string, newAmount: number) => void;
}
```

No changes to existing models (`Product`, `BillState`) are required.

## File Structure

| Action | File | Description |
|--------|------|-------------|
| **CREATE** | `src/components/Billing/InlineAmountInput.tsx` | New component encapsulating the editable-span-with-double-click logic |
| **MODIFY** | `src/components/Billing/PrintableTable.tsx` | Replace the `<span>{product.amount}</span>` block (line ~313) with `<InlineAmountInput>` inside the "unidades"/"unidad" branch |
| **MODIFY** | `src/components/Billing/__tests__/PrintableTable.test.tsx` | Add new test cases for AC-01 through AC-11 (see below) |

### Detailed Component Design: `InlineAmountInput`

**State**:
- `isEditing: boolean` — whether the input is currently shown
- `editValue: string` — current text in the input
- `cachedOriginal: number` — the original amount when edit started (for Escape cancel)

**Lifecycle**:
1. Display mode: renders a `<span>` with the amount + `onDoubleClick` handler
2. On double-click: set `isEditing = true`, `editValue = String(amount)`, `cachedOriginal = amount`
3. In edit mode: renders `<input>` with `value={editValue}`, `onChange`, `onKeyDown`, `onBlur`
4. `onKeyDown`: Enter → `handleSave()`, Escape → `handleCancel()`
5. `onBlur`: `handleSave()`
6. `handleSave()`: parse value, if valid positive number → call `updateAmount(productId, parsed)`; if invalid → revert silently
7. `handleCancel()`: `setIsEditing(false)` without calling update

**Styling**:
- The `<input>` should match the existing `<span>` dimensions (`w-12`, `text-center`, `font-medium`, `tabular-nums`)
- Add `focus-visible:ring-2 focus-visible:ring-blue-500 outline-none` for keyboard accessibility (similar to `DecimalInput`)
- Use `inputMode="numeric"` for mobile numeric keyboard

### Changes to `PrintableTable.tsx`

In the "unidades"/"unidad" conditional branch (lines 304–321), replace:
```tsx
<span className="w-12 text-center font-medium tabular-nums">{product.amount}</span>
```
with:
```tsx
<InlineAmountInput
  amount={product.amount}
  productId={product.id}
  updateAmount={updateProductAmount}
/>
```

The `−` and `+` buttons remain unchanged.

### Import to add in `PrintableTable.tsx`
```typescript
import InlineAmountInput from "./InlineAmountInput";
```

## Test Plan (for `PrintableTable.test.tsx`)

All new tests should be added in a new describe block, e.g.:
```typescript
describe("CA-13: Inline edit of units on double-click", () => { ... });
```

### Test Cases

| # | Test | Covers AC |
|---|------|-----------|
| 1 | renders a `<span>` (not `<input>`) for "unidades" products in display mode | AC-01 |
| 2 | double-click on the amount span switches to an `<input>` pre-filled with the amount | AC-02 |
| 3 | entering a new value and pressing Enter calls `updateProductAmount` and returns to span | AC-03 |
| 4 | entering a new value and blurring calls `updateProductAmount` and returns to span | AC-04 |
| 5 | pressing Escape reverts to original value, does NOT call `updateProductAmount` | AC-05 |
| 6 | entering empty string and saving reverts to original, no update call | AC-06 |
| 7 | entering `"0"` and saving reverts to original, no update call | AC-06 |
| 8 | entering `"-1"` and saving reverts to original, no update call | AC-06 |
| 9 | entering `"abc"` and saving reverts to original, no update call | AC-06 |
| 10 | entering `"2,5"` (comma decimal) and saving calls `updateProductAmount` with `2.5` | AC-07 |
| 11 | entering `"1.5"` (dot decimal) and saving calls `updateProductAmount` with `1.5` | AC-07 |
| 12 | `−` and `+` buttons still work (increment/decrement) in display mode | AC-09 |
| 13 | double-clicking then clicking `−` or `+` doesn't break the UI (graceful handling) | AC-10 |
| 14 | the `<input>` has `inputMode="numeric"` and is auto-focused on double-click | AC-02 |

These tests should be written against the `InlineAmountInput` component directly (unit tests) and/or via integration in `PrintableTable` (using `fireEvent` or `userEvent`).

## Edge Cases

1. **Rapid double-clicks**: Consecutive double-clicks should not cause issues (React batches state updates).
2. **Tab navigation**: User tabs into the input → types → tabs away triggers `onBlur` → saves.
3. **Very long numbers**: The `input` should accept reasonable numeric lengths; no explicit limit needed beyond standard `number` precision.
4. **Floating point precision**: Parsing `"1.1"` should produce `1.1`, not `1.0999999...` — use `parseFloat` which is sufficient.
5. **Empty product list**: No impact — the component only renders per product row.
6. **Print mode**: The edit functionality is wrapped in the `print:hidden` div (line 303), so double-click is not available in print mode — correct behavior.
7. **Unit comparison case-insensitivity**: Already handled by `.toLowerCase()` in the existing condition (line 304).
8. **Value truncation in display**: The `<span>` shows `product.amount` as a raw number. For display consistency after editing, use the same format (no `.toFixed()` needed unless decimals are involved — keep as-is).
9. **Interleaving with `updateProductAmount` from buttons**: Since `updateProductAmount` uses `removeItem` + `addItem`, the product reference changes. Ensure the `InlineAmountInput` doesn't hold stale references (it should receive `amount` and `productId` as props and not store internal copies beyond the edit session).
10. **Mobile double-tap zoom**: React's `onDoubleClick` fires on double-tap, but the browser may also zoom. Use `touch-action: manipulation` on the container to prevent zoom interference.
