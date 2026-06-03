# SPEC: Product Form Select Groups Collapse on `md:grid-cols-2`

## Bug Description

On screens >= 768px (md breakpoint), the product form's 4 select groups (category, subcategory, brand, supplier) fail to display in a 2-per-row grid layout. Instead of appearing side by side, the selects appear collapsed, uneven, or as if they're not respecting the 2-column grid. The visual result is a broken/staggered layout where selects do not fill their grid columns.

### Affected Routes
- **`/dashboard`** via `product-dashboard.tsx` — uses `DialogContent` with `sm:max-w-2xl`
- **Stock table edit** via `stock-table.tsx` — uses legacy `<Modal>` component with `w-lg` (512px)

---

## Root Cause Analysis

### Primary Cause: Missing `flex-1` on `FormItem` in Select Groups

The form grid is defined at `product-form.tsx:286`:
```tsx
className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4"
```

Each select group is a grid child with:
```tsx
<div className="flex flex-row items-end gap-2">
  <FormField ...>
    <FormItem>   {/* ← NO width control on 3 of 4 groups */}
      <FormLabel>...</FormLabel>
      <Select>
        <FormControl>
          <SelectTrigger className="...">  {/* has w-full */}
```

**The DOM/CSS chain explaining the bug:**

1. The grid correctly assigns each flex div as a grid item with full column width
2. Inside the flex row, two children exist: `FormItem` (renders `<div>`) and `CreateAttributeModal` button (renders `<div>`)
3. `FormItem` renders as `<div className="space-y-2">` — a block div with **no width control**
4. Without `flex-1` or `w-full`, the `FormItem` **shrink-wraps** to its content width (the label text + SelectTrigger intrinsic width)
5. `SelectTrigger` has `w-full` (select.tsx:40), but this means 100% of `FormItem`'s shrink-wrapped width — **not** 100% of the grid column
6. The `CreateAttributeModal` button takes its natural icon-button width
7. Remaining space in the flex row is unoccupied — the select appears visually collapsed/narrow

**Only Category (line 433) has `<FormItem className="w-full">`**, which is why it appears differently from the other three. However, `w-full` in a flex context is less idiomatic than `flex-1` — `flex-1` correctly sets `flex: 1 1 0%` to fill available space along the main axis.

### Secondary Cause: Insufficient Dialog / Modal Width

| Container | Max Width | Padding | Form Area | Column Width (2-col) |
|-----------|-----------|---------|-----------|---------------------|
| `DialogContent` (default) | `sm:max-w-lg` = 512px | p-6 (48px) + form p-4 (32px) | 432px | **208px** |
| `product-dashboard.tsx` | `sm:max-w-2xl` = 672px | p-6 (48px) + form p-4 (32px) | 592px | **288px** |
| `stock-table.tsx` `<Modal>` | `w-lg` = 512px | px-12 (96px) + form p-4 (32px) | 384px | **184px** |

At 184px–208px per column, a labeled `<Select>` with a `<CreateAttributeModal>` button has very little horizontal room. Any overflow or minimum-width enforcement causes visual breakage.

### Tertiary Cause: Inconsistent Styling Across Groups

| Property | Category (line 428) | Subcategory (line 460) | Brand (line 493) | Supplier (line 525) |
|----------|---------------------|------------------------|------------------|---------------------|
| `FormItem` width | `w-full` | none | none | none |
| `SelectTrigger` class | `border border-black` | `h-9` | `h-9` | `h-9` |
| Button wrapper class | `pb-1` | `pt-6` | `pt-6` | `pt-6` |
| `FormLabel` class | default | `text-sm font-medium` | `text-sm font-medium` | `text-sm font-medium` |

These inconsistencies make the 4 groups render at different heights/widths, compounding the visual collapse when `md:grid-cols-2` activates.

---

## Acceptance Criteria

1. **On screens >= 768px (md):** The 4 select groups display as 2 per row — Category+Subcategory on row 1, Brand+Supplier on row 2
2. **Each select fills its grid column width:** No empty space between the SelectTrigger and the CreateAttributeModal button
3. **All 4 groups render identically:** Same height, same width behavior, same alignment
4. **No regressions on mobile:** Single-column layout remains unchanged
5. **No horizontal overflow:** No scrollbars or clipping within the form grid
6. **Works in both containers:** `DialogContent` (product-dashboard) and `<Modal>` (stock-table)

---

## Proposed Solution

### Fix 1: Add `flex-1` to all `FormItem` components in select groups

This ensures each `FormItem` grows to fill available space in the flex row, pushing the `<CreateAttributeModal>` button to the right edge.

| File | Line | Current | Change |
|------|------|---------|--------|
| `product-form.tsx` | 433 | `<FormItem className="w-full">` | `<FormItem className="flex-1">` |
| `product-form.tsx` | 465 | `<FormItem>` | `<FormItem className="flex-1">` |
| `product-form.tsx` | 498 | `<FormItem>` | `<FormItem className="flex-1">` |
| `product-form.tsx` | 530 | `<FormItem>` | `<FormItem className="flex-1">` |

**Why `flex-1` over `w-full`:** In a `flex flex-row` container, `flex-1` sets `flex: 1 1 0%`, which correctly distributes remaining space along the main axis. `w-full` sets `width: 100%`, which in a flex context can interact unpredictably with `flex-shrink` and may not produce the desired fill behavior.

### Fix 2: Increase Dialog Width in `product-dashboard.tsx`

Change the dialog max-width to give the 2-column grid more room.

| File | Line | Current | Change |
|------|------|---------|--------|
| `product-dashboard.tsx` | 42 | `sm:max-w-2xl` | `sm:max-w-3xl` |

- `max-w-3xl` = 48rem = 768px at `sm` (640px+, but effectively applies at md+ where the dialog opens)
- New column width: (768 - 48 - 32 - 16) / 2 = **336px** (up from 288px)
- This gives a comfortable ~50px margin for selects + button per column

### Fix 3: Standardize `SelectTrigger` Classes

Unify all 4 select triggers to use the same classes for consistent height and border styling.

| File | Line | Current | Change |
|------|------|---------|--------|
| `product-form.tsx` | 440 | `className="border border-black"` | Remove (SelectTrigger default `border-input` is applied automatically — line 40 of select.tsx) |
| `product-form.tsx` | 473 | `className="h-9"` | Remove (SelectTrigger default `data-[size=default]:h-9` — line 40 of select.tsx) |
| `product-form.tsx` | 505 | `className="h-9"` | Remove |
| `product-form.tsx` | 537 | `className="h-9"` | Remove |

All triggers will use the default SelectTrigger styling, which already includes `w-full`, `h-9`, and proper border classes.

### Fix 4: Standardize `CreateAttributeModal` Button Wrapper Alignment

Unify the vertical alignment of the button wrapper to use consistent padding.

| File | Line | Current | Change |
|------|------|---------|--------|
| `product-form.tsx` | 456 | `className="pb-1"` | `className="pt-1.5"` |
| `product-form.tsx` | 489 | `className="pt-6"` | `className="pt-1.5"` |
| `product-form.tsx` | 521 | `className="pt-6"` | `className="pt-1.5"` |
| `product-form.tsx` | 553 | `className="pt-6"` | `className="pt-1.5"` |

The `pt-1.5` aligns the icon button vertically with the SelectTrigger (which is `h-9`) while considering the label height above it.

### Fix 5: Standardize `FormLabel` Classes

| File | Line | Current | Change |
|------|------|---------|--------|
| `product-form.tsx` | 466 | `className="text-sm font-medium"` | Remove (consistent with other labels) |
| `product-form.tsx` | 499 | `className="text-sm font-medium"` | Remove |
| `product-form.tsx` | 531 | `className="text-sm font-medium"` | Remove |

---

## Summary of All Changes

### `product-form.tsx`

| Line | Element | Change |
|------|---------|--------|
| 433 | `<FormItem className="w-full">` | `w-full` → `flex-1` |
| 440 | `<SelectTrigger className="border border-black">` | Remove `className` |
| 456 | `<div className="pb-1">` | `pb-1` → `pt-1.5` |
| 465 | `<FormItem>` | Add `className="flex-1"` |
| 466 | `<FormLabel className="text-sm font-medium">` | Remove `className` |
| 473 | `<SelectTrigger className="h-9">` | Remove `className` |
| 489 | `<div className="pt-6">` | `pt-6` → `pt-1.5` |
| 498 | `<FormItem>` | Add `className="flex-1"` |
| 499 | `<FormLabel className="text-sm font-medium">` | Remove `className` |
| 505 | `<SelectTrigger className="h-9">` | Remove `className` |
| 521 | `<div className="pt-6">` | `pt-6` → `pt-1.5` |
| 530 | `<FormItem>` | Add `className="flex-1"` |
| 531 | `<FormLabel className="text-sm font-medium">` | Remove `className` |
| 537 | `<SelectTrigger className="h-9">` | Remove `className` |
| 553 | `<div className="pt-6">` | `pt-6` → `pt-1.5` |

### `product-dashboard.tsx`

| Line | Element | Change |
|------|---------|--------|
| 42 | `<DialogContent className="... sm:max-w-2xl">` | `sm:max-w-2xl` → `sm:max-w-3xl` |

---

## Verification Steps

1. Open the product form modal in `/dashboard` at viewport width >= 768px
2. Confirm the 4 select groups render as 2 per row
3. Confirm each SelectTrigger fills its grid column evenly
4. Confirm all 4 groups have identical height and styling
5. Open the edit modal from the stock table and repeat verification
6. Resize to < 768px and confirm single-column layout is preserved
7. Run `npm run build` to check for TypeScript/compilation errors
