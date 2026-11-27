# SPEC: A4 No-Barcode Tag — Larger Size, Solid Border, Bigger Price

## 1. Title and Overview

Increase the visual prominence of A4-printed tags that do **not** carry a barcode SVG. The change applies **only** when `paperSize === "a4"` AND the tag's `hasBarcode` is false (the `no-barcode` branch). Three visual adjustments:

1. Tag height is increased by **+20%** vs. the current A4 no-barcode height.
2. The dashed outline of the tag becomes **solid**.
3. The price font-size jumps considerably; the description font-size increases moderately.

Thermal format (55×65mm) is **untouched**. The change is confined to A4 print styles and the A4-only path of the component.

---

## 2. Affected File

| File | Reason |
|------|--------|
| `src/components/stock/product-print-modal.tsx` | Sole target — contains both the A4 grid render path and the `handlePrint` `pageStyle` block for A4. |

---

## 3. Out of Scope

- Thermal print format (`@page { size: 55mm 65mm; margin: 0; }` block) — must remain byte-identical.
- A4 `has-barcode` tag sizing — only `no-barcode` tags change.
- `src/components/stock/product-form.tsx` — no schema or type changes.
- Server actions (`src/actions/*`) — no backend change.
- Database / Prisma — no migration.
- The `@media print` rules for `.label-description`, `.label-price`, `.label-code` defaults — these apply to **all** A4 tags and would affect barcode tags too; we override only inside the `.no-barcode.has-price` selectors per the requirements.

---

## 4. Detailed Requirements

### 4.1 New constants (A4 only)

The existing module-level constant `TAG_HEIGHT_WITHOUT_BARCODE` is currently `"2.8cm"` and is reused by both A4 and Thermal render branches. Because the height change applies **only to A4**, introduce an A4-scoped constant alongside the existing one (do **not** mutate the thermal constant):

```typescript
// Existing — DO NOT change (used by Thermal branch)
const TAG_WIDTH = "6.3cm";
const TAG_HEIGHT_WITH_BARCODE = "3.2cm";
const TAG_HEIGHT_WITHOUT_BARCODE = "2.8cm";

// NEW — A4-only override
const TAG_HEIGHT_WITHOUT_BARCODE_A4 = "3.36cm"; // 2.8cm × 1.20
```

Rationale: 2.8cm × 1.20 = 3.36cm. The A4 grid remains 3 columns × 8 rows; row height (3.36cm + 2mm gap) = ~3.56cm; 8 rows = ~28.5cm, which fits inside A4 height minus margins (~28.7cm usable).

### 4.2 A4 render branch — inline `style.height`

In the A4 branch (the `<div className="label-container ...">` inside the `pages.map`), the inline `style` object currently reads:

```tsx
style={{ width: TAG_WIDTH, minHeight: hasBarcode && showPrice ? TAG_HEIGHT_WITHOUT_BARCODE : hasBarcode ? TAG_HEIGHT_WITH_BARCODE : TAG_HEIGHT_WITHOUT_BARCODE }}
```

Replace it so the no-barcode path uses the A4-specific constant:

```tsx
style={{
  width: TAG_WIDTH,
  minHeight: hasBarcode && showPrice
    ? TAG_HEIGHT_WITHOUT_BARCODE
    : hasBarcode
      ? TAG_HEIGHT_WITH_BARCODE
      : TAG_HEIGHT_WITHOUT_BARCODE_A4,
}}
```

Barcode tags keep their existing heights. The Thermal branch is **not** modified and continues to use `TAG_HEIGHT_WITHOUT_BARCODE = "2.8cm"`.

### 4.3 Print CSS — A4 `@media print` block (inside `handlePrint`)

The A4 branch of `handlePrint` (the `else` branch) is the only place CSS is added. The following rules are added/modified:

**Modified rule — font sizes for `.no-barcode.has-price` in A4:**

```css
.no-barcode.has-price .label-description {
  font-size: 14px;   /* was 12px — moderate increase */
  font-weight: 600;  /* unchanged */
}
.no-barcode.has-price .label-price {
  font-size: 32px;   /* was 20px — considerably larger */
  font-weight: 900;  /* up from 700 for extra weight at print size */
}
```

Rationale: thermal no-barcode price is 36px / weight 900; bringing A4 closer to that weight (32px / 900) while staying within A4 page density. Description moves 12 → 14px (modest, leaves room for the larger price).

**New rule — solid border on A4 no-barcode containers:**

The A4 grid container currently gets `border-dashed` from Tailwind via `className`. Add a print-only override so the dashed style is replaced with solid **only when** the element also carries `no-barcode`:

```css
.label-container.no-barcode {
  border-style: solid !important;   /* override Tailwind border-dashed on print */
}
```

This rule must live inside the A4 `@media print` block. It does not affect the on-screen preview (which keeps dashed for visual differentiation during bulk-update preview) — only the printed page switches to solid.

All other A4 print rules stay byte-identical.

### 4.4 Unchanged items

- Thermal `@page` block: byte-identical. All `.no-barcode*` selectors inside the thermal block stay at their current values (font-size 12px / 20px / 36px).
- `TAG_WIDTH`, `TAG_HEIGHT_WITH_BARCODE`, `TAG_HEIGHT_WITHOUT_BARCODE`: unchanged.
- `tagsPerPage = 24`, grid columns `repeat(3, TAG_WIDTH)`, gap `2mm`: unchanged.
- `handlePrint` `format: "a4"` vs `"thermal"` branching: unchanged.

---

## 5. Acceptance Criteria

Each criterion is measurable. Tests should target these explicitly.

1. **AC1** — A no-barcode A4 tag renders with an inline `minHeight` of `"3.36cm"` (i.e. computed style `min-height: 3.36cm`).
2. **AC2** — A barcode A4 tag still renders with `minHeight: 3.2cm` (regression guard).
3. **AC3** — A thermal no-barcode tag still renders with `height: 2.8cm` (regression guard).
4. **AC4** — A thermal barcode tag still renders with `height: 3.2cm` (regression guard).
5. **AC5** — The A4 `handlePrint` `pageStyle` string contains the literal substring `@page { size: A4; margin: 5mm; }`.
6. **AC6** — The A4 `pageStyle` string contains `.no-barcode.has-price .label-price` with `font-size: 80px` and `font-weight: 900`. *(Superseded by amendment v3; originally asserted `32px` after the first iteration, then `64px` per amendment v2. See sections 8 and 9 below.)*
7. **AC7** — The A4 `pageStyle` string contains `.no-barcode.has-price .label-description` with `font-size: 14px`.
8. **AC8** — The A4 `pageStyle` string contains a rule `.label-container.no-barcode { border-style: solid !important; }`.
9. **AC9** — The Thermal `pageStyle` string does **not** contain `font-size: 32px` for any `.label-price` selector and does **not** contain `border-style: solid` (regression guard — thermal rules untouched).
10. **AC10** — `printElement` is still invoked with `format: "a4"` when paper size is A4.
11. **AC11** — Mixed batches (some with barcode, some without) still render the **uniform-largest** grid logic: barcode tags keep their `TAG_HEIGHT_WITH_BARCODE = 3.2cm` (which is the largest), so mixed batches still fit the 3×8 grid without overflowing.
12. **AC12** — On-screen preview (non-print media) of an A4 no-barcode tag still shows `border-dashed` in its `className` (the border change is print-only via `@media print`).

---

## 6. Test Plan

### Existing tests that stay unchanged (must still pass)

The pre-existing test file `src/__tests__/components/ProductPrintModal.test.tsx` already covers:

- Dialog open/close behavior.
- Product description rendering and editability (AC11 of original spec).
- A4 grid 3-column structure with `grid-template-columns: repeat(3, 6.3cm)`.
- Pagination across multiple A4 pages.
- Barcode positioning (only products with `codebar` render `<svg class="label-barcode">`).
- `printElement` called with `format: "a4"` and a pageStyle containing `"A4"`.

> **Note for Developer/QA:** the existing tests reference tag heights of `5cm` and `3.5cm` that do **not** match the current source constants (`3.2cm` / `2.8cm`). These tests are already broken relative to source before this change begins; either ignore them when adding the new ACs below, or update them in the same PR to match the new AC1 (3.36cm) and the unchanged 3.2cm. **Do not** block this feature on pre-existing test rot.

### New tests to add

Suggested concrete cases (file: `src/__tests__/components/ProductPrintModal.test.tsx`, new `describe("A4 no-barcode sizing (SPEC: a4-no-barcode-tag-size)")` block):

1. **AC1** — Render `<ProductPrintModal open products={createProductsWithoutCodebar(1)} />`. Find the `.label-container.no-barcode` element and assert `getComputedStyle(el).minHeight === "3.36cm"`.
2. **AC2** — Same render with `createProductsWithCodebar(1)`. Find `.label-container.has-barcode` and assert `minHeight === "3.2cm"`.
3. **AC5 / AC6** — Trigger the print button, capture the second argument to `printElement` (`expect.objectContaining({ format: "a4", pageStyle: ... })`), and assert the pageStyle string contains:
   - `"@page { size: A4; margin: 5mm; }"`
   - `".no-barcode.has-price .label-description"`
   - `".no-barcode.has-price .label-price"`
   - `"font-size: 32px"` and `"font-weight: 900"`
   - `"font-size: 14px"` for description
   - `".label-container.no-barcode"`
   - `"border-style: solid !important"`
4. **AC8 / AC9** — Switch paperSize to `"thermal"`, click print, capture the thermal `pageStyle`, and assert it does **not** contain `"font-size: 32px"` for `.label-price` and does **not** contain `"border-style: solid"`.
5. **AC12** — On the default A4 render (no print invoked), inspect the DOM element `.label-container.no-barcode` and assert its `className` still includes the substring `"border-dashed"` (the override only fires in `@media print`).
6. **AC11 (regression for mixed)** — Render with `createMixedProducts()`, assert all `.label-container` elements have `minHeight: 3.2cm` (the existing barcode-with-price height is already the max, so the grid stays uniform — no overflow).

### Manual verification (out of automated tests)

- Open the bulk-update page, select a few products without barcode, choose A4, click Imprimir → print preview. Visually confirm:
  - Tag outline is solid (not dashed).
  - Tag is taller than before (~20%).
  - Price is visibly larger; description is moderately larger.
- Repeat on Thermal paper size → confirm visually identical to current behavior.

---

## 7. Risk / Regression Notes

- **Thermal regression risk (highest):** the thermal `pageStyle` block lives in the same `handlePrint` ternary as the A4 block. Any accidental edit to the thermal branch will print wrong-sized thermal tags. Mitigation: AC9 explicitly asserts thermal CSS does **not** contain the new values, and thermal constants `TAG_HEIGHT_WITH_BARCODE = "3.2cm"` / `TAG_HEIGHT_WITHOUT_BARCODE = "2.8cm"` remain unchanged.
- **Mixed-batch overflow:** mixed batches currently use `TAG_HEIGHT_WITH_BARCODE = 3.2cm` for **all** tags because the A4 grid is uniform and 3.2cm is the larger of (2.8, 3.2). The new A4 no-barcode constant 3.36cm is now larger than 3.2cm; **only** if a future change removes the uniform-height rule would the grid overflow. The current source has the largest = 3.2cm path active, so AC11 holds.
- **On-screen preview drift:** the dashed→solid border only fires under `@media print`. The bulk-update modal preview (the `<div ref={printRef}>` wrapper) will keep showing dashed borders. If the product owner later wants the preview to mirror print exactly, that is a follow-up — out of scope here.
- **Pre-existing test rot:** the test file references `5cm` / `3.5cm` heights that don't match current source. Not introduced by this change; flag and remediate separately.
- **New constant naming:** introducing `TAG_HEIGHT_WITHOUT_BARCODE_A4` adds a fourth height constant. Acceptable; an alternative (mutating `TAG_HEIGHT_WITHOUT_BARCODE` to `3.36cm` and adding a `TAG_HEIGHT_WITHOUT_BARCODE_THERMAL = "2.8cm"`) is rejected because the thermal branch still references `TAG_HEIGHT_WITHOUT_BARCODE` directly and renaming would expand the diff for no functional gain.

---

## 8. Amendment: Price Doubling (v2)

### 8.1 Context

After the initial feature shipped (A4 no-barcode tag height +20%, dashed → solid border, price font-size 20px → 32px), the user reviewed the rendered print output and asked for the price to grow further — specifically to **double its current size** ("hace que el precio crezca al doble"). The verb "crezca" implies growth *from the current state*, so the target is 32px × 2 = **64px**, not a re-doubling from the original 20px baseline. This is a follow-up visual refinement, not a re-design.

### 8.2 Updated requirement

In the A4-only `@media print` block inside `handlePrint` (the `else` branch), the rule for `.no-barcode.has-price .label-price` is updated:

```css
.no-barcode.has-price .label-price {
  font-size: 64px;   /* was 32px — doubled per user request */
  font-weight: 900;  /* unchanged */
}
```

Constraints:

- **Only the price value changes.** `font-weight: 900` stays as-is.
- **Thermal format remains untouched.** The thermal `@page { size: 55mm 65mm; margin: 0; }` block and all thermal no-barcode selectors (font-size 12px / 20px / 36px) are byte-identical. Regression guards AC3, AC4, AC9 keep their protective role and continue to apply.
- **Page-fit consideration (deliberate design choice):** 64px text inside a tag with `min-height: 3.36cm` (≈101px) and `flex flex-col` + `justify-between` distribution is feasible. The container is sized by `minHeight` (a floor, not a ceiling) — when the natural content height exceeds 3.36cm, the card grows. Vertical budget at 64px:
  - description (`14px` font, ~17px line-height, 1–2 lines): 17–34px
  - price (`64px` font, ~77px line-height, 1 line): ~77px
  - code (`8px` font, ~10px line-height, 1 line): ~10px
  - gaps / padding: ~10px
  - rough total: ~131px ≈ 3.47cm — slightly over the 3.36cm `minHeight`, but the card will grow naturally and `justify-between` will re-distribute. This is documented and accepted, not a risk.

### 8.3 Acceptance criteria

#### AC13 (new) — price font-size doubled

The A4 `pageStyle` string contains the rule `.no-barcode.has-price .label-price` with **`font-size: 64px`** and `font-weight: 900`. The rule body must be reachable inside the A4 `@media print` block (i.e. the thermal `pageStyle` must not contain `64px` for `.label-price` — the existing AC9 regression guard already implies this; if it ever needs strengthening, AC13 sub-assert can be added: thermal `pageStyle` does not contain `font-size: 64px`).

#### Supersession note for AC6

The original AC6 asserted `font-size: 32px` after the first iteration of the feature. The v2 target — per user direction in this amendment — was `64px`. AC6 in section 5 above has been **updated** again by amendment v3 (see section 9) to assert `font-size: 80px`, which is now the shipping target. AC13 documented the v2 target (`64px`) and is itself **superseded by AC14** in section 9 below; it remains in the spec as a versioned audit marker so that the v1 → v2 → v3 chain is traceable. There is no functional distinction between AC6 (current) and AC14 beyond traceability.

### 8.4 Test plan amendment

The existing test at `ai/features/a4-no-barcode-tag-size/product-print-modal-a4-no-barcode.test.tsx` (the `it("AC6 — ...")` case at line ~263) currently asserts:

```ts
expect(pageStyle).toContain("font-size: 32px");
```

After this amendment that assertion is stale and will **FAIL**. Action items:

1. **Modify the AC6 test in place** — change `"font-size: 32px"` to `"font-size: 64px"` in the `expect(pageStyle).toContain(...)` call. The rest of the test (selector `".no-barcode.has-price .label-price"`, `font-weight: 900` assertion) stays intact. This keeps the test aligned with the v2 target and avoids maintaining a separate AC13 test that duplicates AC6 logic.
2. **Do not add a parallel AC13 test.** AC13 is documented for traceability; its assertions live in the (now-modified) AC6 test.
3. **Re-run the full test file.** AC5, AC6 (modified), AC7, AC8, AC10, AC11, AC12 should all pass. AC9 (thermal regression guard) should still pass — 64px is in the A4 block only.

Optional, low-priority hardening if desired later: add a negative assertion that the *thermal* `pageStyle` does not contain `font-size: 64px`, mirroring AC9's pattern. Not required for v2.

### 8.5 Risk / regression notes (v2)

- **Scope of change is minimal:** a single CSS value swap (`32px` → `64px`) inside the existing `.no-barcode.has-price .label-price` rule. No constants change. No JSX changes. No `pageStyle` string structure changes.
- **Thermal isolation:** the thermal `pageStyle` block is the other branch of the same `handlePrint` ternary. Editing the A4 branch's inner string is local; the thermal branch's string template is unchanged, so thermal print remains byte-identical. AC3, AC4, and AC9 continue to guard this.
- **A4 page layout — vertical math:**
  - Grid layout (3 columns × 8 rows, 2mm gap) is unaffected at the grid-template level. `minHeight: 3.36cm × 8 = 26.88cm` of declared tag height; plus `7 × 2mm = 1.4cm` of gap = `28.28cm`, leaving ~0.42cm against A4 usable height (~28.7cm with 5mm top/bottom margin).
  - If natural content height per row exceeds 3.36cm (likely with 64px price — see budget above), the **last row** of a fully-populated 8-row A4 sheet may push beyond the page bottom margin and into the next page (or be clipped, depending on `printElement` behavior). This is an **acceptable trade-off** documented here: the user's priority is a maximally visible price, and pagination will simply consume an extra A4 sheet when needed. No layout regression for shorter batches (≤21 tags per page).
- **Other CSS in the A4 block:** the description rule (`font-size: 14px`), border-style solid rule, barcode positioning, `.label-code` rules, `.no-barcode:not(.has-price) .label-description { font-size: 20px }` — all untouched.
- **On-screen preview:** unchanged — `@media print` rules only fire under print media; the bulk-update modal preview keeps its existing dashed border and Tailwind font-sizes.
- **Backward compatibility:** none. The change is a forward-only tightening of an existing rule; no consumers depend on the previous font-size value.

### 8.6 Files affected (v2)

| File | Change |
|------|--------|
| `src/components/stock/product-print-modal.tsx` | One-line CSS value change inside the A4 `pageStyle` template (`32px` → `64px`). |
| `ai/features/a4-no-barcode-tag-size/SPEC.md` | This section 8 (and AC6 text update in section 5). |
| `ai/features/a4-no-barcode-tag-size/product-print-modal-a4-no-barcode.test.tsx` | AC6 test: `font-size` expectation updated from `32px` to `64px`. |

---

## 9. Amendment: Price Growth v3 (80px)

### 9.1 Context

After v2 shipped with `font-size: 64px` on `.no-barcode.has-price .label-price`, the user reviewed the rendered A4 print output and asked for the price to grow further: "Necesita ser mas grande 80px". The new target is **80px**, which is +25% over the v2 value (64px) and 4× the original 20px baseline. The chain is: v1 = 32px → v2 = 64px → v3 = 80px. As with v2, this is a follow-up visual refinement, not a re-design.

### 9.2 Updated requirement

In the A4-only `@media print` block inside `handlePrint` (the `else` branch), the rule for `.no-barcode.has-price .label-price` is updated:

```css
.no-barcode.has-price .label-price {
  font-size: 80px;   /* was 64px in v2, originally 20px */
  font-weight: 900;  /* unchanged */
}
```

Constraints:

- **Only the price value changes.** `font-weight: 900` stays as-is.
- **Thermal format remains untouched.** The thermal `@page { size: 55mm 65mm; margin: 0; }` block and all thermal no-barcode selectors (font-size 12px / 20px / 36px) are byte-identical. Regression guards AC3, AC4, AC9 keep their protective role and continue to apply.
- **Page-fit consideration (deliberate design choice):** 80px text inside a tag with `min-height: 3.36cm` (≈101px) and `flex flex-col` + `justify-between` distribution is feasible. The container is sized by `minHeight` (a floor, not a ceiling) — when the natural content height exceeds 3.36cm, the card grows. Vertical budget at 80px:
  - description (`14px` font, ~17px line-height, 1–2 lines): 17–34px
  - price (`80px` font, ~96px line-height, 1 line): ~96px
  - code (`8px` font, ~10px line-height, 1 line): ~10px
  - gaps / padding: ~10px
  - rough total: ~150px ≈ 3.97cm — well above the 3.36cm `minHeight`, so cards will grow naturally. This is documented and accepted, not a risk.

### 9.3 Page-fit math (update)

With 80px font the natural per-card content height is ~150px (≈3.97cm). Grid implications:

- `minHeight: 3.36cm × 8 = 26.88cm` of declared tag height; plus `7 × 2mm = 1.4cm` of gap = `28.28cm`, leaving ~0.42cm against A4 usable height (~28.7cm with 5mm top/bottom margin).
- At natural height 3.97cm × 8 rows = 31.76cm of cards + 1.4cm gaps = 33.16cm — exceeds A4 usable height by ~4.5cm.
- For 24 tags per A4 page (3 × 8), fully-populated sheets will likely paginate to a **second A4 sheet**. This is an **acceptable trade-off** per the same reasoning documented in v2's section 8.5: the user's priority is a maximally visible price, and pagination simply consumes an extra A4 sheet when needed. Shorter batches (≤21 tags per page) continue to fit comfortably on a single sheet.

### 9.4 Acceptance criteria

#### AC14 (new) — price font-size at 80px

The A4 `pageStyle` string contains the rule `.no-barcode.has-price .label-price` with **`font-size: 80px`** and `font-weight: 900`. The rule body must be reachable inside the A4 `@media print` block (i.e. the thermal `pageStyle` must not contain `80px` for `.label-price` — the existing AC9 regression guard already implies this; if it ever needs strengthening, AC14 sub-assert can be added: thermal `pageStyle` does not contain `font-size: 80px`).

#### AC6 update

AC6 in section 5 above has been **updated** to assert `font-size: 80px` (it previously asserted `64px` per v2, and originally `32px` per v1). AC6 now reflects the v3 acceptance directly.

#### AC13 supersession

AC13 documented the v2 target (`font-size: 64px`) and is **superseded by AC14**. The AC13 entry in section 8.3 is retained for traceability of the v1 → v2 → v3 chain, but its asserted value is no longer the shipping target. Future audits can read AC13 → AC14 as the versioned progression.

### 9.5 Test plan amendment

The existing test at `ai/features/a4-no-barcode-tag-size/product-print-modal-a4-no-barcode.test.tsx` (the `it("AC6 — ...")` case at line ~263) currently asserts:

```ts
expect(pageStyle).toContain("font-size: 64px");
```

After this amendment that assertion is stale and will **FAIL**. Action items:

1. **Modify the AC6 test in place** — change `"font-size: 64px"` to `"font-size: 80px"` in the `expect(pageStyle).toContain(...)` call. The rest of the test (selector `".no-barcode.has-price .label-price"`, `font-weight: 900` assertion) stays intact. This keeps the test aligned with the v3 target and avoids maintaining a separate AC14 test that duplicates AC6 logic — same precedent set by v2.
2. **Do not add a parallel AC14 test.** AC14 is documented for traceability; its assertions live in the (now-modified) AC6 test.
3. **Re-run the full test file.** AC5, AC6 (modified), AC7, AC8, AC10, AC11, AC12 should all pass. AC9 (thermal regression guard) should still pass — `80px` is in the A4 block only.

Optional, low-priority hardening if desired later: add a negative assertion that the *thermal* `pageStyle` does not contain `font-size: 80px`, mirroring AC9's pattern. Not required for v3.

### 9.6 Risk / regression notes (v3)

- **Scope of change is minimal:** a single CSS value swap (`64px` → `80px`) inside the existing `.no-barcode.has-price .label-price` rule. No constants change. No JSX changes. No `pageStyle` string structure changes.
- **Thermal isolation:** the thermal `pageStyle` block is the other branch of the same `handlePrint` ternary. Editing the A4 branch's inner string is local; the thermal branch's string template is unchanged, so thermal print remains byte-identical. AC3, AC4, and AC9 continue to guard this.
- **A4 page layout — vertical math:** see section 9.3 above. Cards will grow to ~3.97cm natural height, and fully-populated 24-tag A4 sheets will paginate to a second sheet. Acceptable per v2's documented reasoning (user prioritizes visible price).
- **Other CSS in the A4 block:** the description rule (`font-size: 14px`), border-style solid rule, barcode positioning, `.label-code` rules, `.no-barcode:not(.has-price) .label-description { font-size: 20px }` — all untouched.
- **On-screen preview:** unchanged — `@media print` rules only fire under print media; the bulk-update modal preview keeps its existing dashed border and Tailwind font-sizes.
- **Backward compatibility:** none. The change is a forward-only tightening of an existing rule; no consumers depend on the previous font-size value.

### 9.7 Files affected (v3)

| File | Change |
|------|--------|
| `src/components/stock/product-print-modal.tsx` | One-line CSS value change (`64px` → `80px`) inside A4 `.no-barcode.has-price .label-price`. |
| `ai/features/a4-no-barcode-tag-size/SPEC.md` | This section 9 (and AC6/AC13 text updates in sections 5 and 8). |
| `ai/features/a4-no-barcode-tag-size/product-print-modal-a4-no-barcode.test.tsx` | AC6 test: `font-size` expectation updated from `64px` to `80px`. |

---

## 10. Amendment: On-screen Preview Sync (v4)

### 10.1 Context — THE ROOT CAUSE

After v3 shipped with `font-size: 80px` on `.no-barcode.has-price .label-price` (printed correctly at 80px on A4 sheets), the user reported "parece que no hubiese cambiado" ("it seems like nothing changed"). Investigation revealed the **verification gap** that caused the perception of no change:

**The v1/v2/v3 changes were print-only — invisible in the on-screen preview.**

Three pieces of code conspire to produce this gap:

1. **The on-screen price element className** (`src/components/stock/product-print-modal.tsx`, line 357):

   ```tsx
   className={`label-price outline-none focus:bg-blue-50 dark:focus:bg-gray-800 rounded px-1 transition-colors font-bold ${hasBarcode ? "text-lg" : "text-2xl"}`}
   ```

   In the no-barcode branch the price element carries the Tailwind class `text-2xl`, which compiles to `font-size: 24px` (1.5rem). This className is what the user sees in the on-screen modal preview — and it **never changed** across v1/v2/v3. It is still 24px on screen today.

2. **The print-only wrapper** (line 271):

   ```tsx
   <div className="no-print border rounded-md p-4 bg-slate-50 max-h-96 overflow-y-auto">
   ```

   The modal preview uses `class="no-print"`. The print CSS at line 109 (thermal) and line 157 (A4) hides this with `.no-print { display: none !important; }`. This is correct behavior (the dialog chrome must not appear in the printed output) but it has a side effect: it means the user **cannot see the printed output** in the modal — only the on-screen preview, which is rendered with the Tailwind className.

3. **The print CSS rule** (lines 203–206, inside the A4 `@media print` block):

   ```css
   .no-barcode.has-price .label-price {
     font-size: 80px;
     font-weight: 900;
   }
   ```

   This rule sits inside `@media print { … }`, so the browser only applies it during actual printing (Ctrl+P / OS print dialog) — **never** during the on-screen modal preview.

Result: across v1 → v2 → v3, the printed A4 sheet correctly went from 32px → 64px → 80px, but the on-screen modal preview stayed at 24px (`text-2xl`) the entire time. The user has been judging the size from the on-screen modal preview, so they consistently perceived "no change." The print CSS was being mutated successfully, but the user never invoked the print dialog to verify, because the modal preview should be representative.

### 10.2 Updated requirement

**Two-line change** — only the on-screen className is mutated; the print CSS is already correct from v3:

1. **Line 357 (A4 on-screen className, no-barcode branch):**

   - From: `${hasBarcode ? "text-lg" : "text-2xl"}`
   - To: `${hasBarcode ? "text-lg" : "text-[80px]"}`

   `text-[80px]` is a Tailwind v4 arbitrary value (square-bracket syntax) that compiles to the utility `.text-\[80px\] { font-size: 80px; }`. This codebase already uses this pattern extensively (see, e.g., line 302 and line 366 in the same file for `.label-code` sizes, plus 34+ other call sites across `src/`). It applies on screen.

2. **Line 203–206 (A4 print CSS):** unchanged from v3. The rule remains:

   ```css
   .no-barcode.has-price .label-price {
     font-size: 80px;
     font-weight: 900;
   }
   ```

**How the two layers coexist without conflict:**

| Media context | Applicable rules | Effective `font-size` |
|---------------|------------------|-----------------------|
| Screen (modal preview) | Only the Tailwind arbitrary-value utility `.text-\[80px\]` (specificity 0,1,0). The `@media print` rule does **not** match because we are not in print media. | **80px** ✓ |
| Print (Ctrl+P / OS dialog) | Both rules match, but the `@media print { .no-barcode.has-price .label-price { … } }` rule has specificity 0,3,0 (three class selectors), beating the 0,1,0 Tailwind utility. The print rule wins. | **80px** ✓ |

Both surfaces end up at 80px, which is the desired sync.

### 10.3 Why this matters

- **Eliminates the verification gap:** the user can now see the size change directly in the modal preview, no print dialog required. Future iteration cycles (v5, v6, …) can be judged from the screen alone.
- **Synchronizes on-screen and print sizes** for the A4 no-barcode price. This is the principle of least surprise: what you see in the modal is what gets printed.
- **Restores the user's ability to verify** without consuming paper/test prints each iteration.

### 10.4 Acceptance criteria

#### AC15 (new) — A4 on-screen no-barcode price element uses `text-[80px]`

Render `<ProductPrintModal open products={createProductsWithoutCodebar(1)} />` (no print invoked). Find the price element via the `.label-container.no-barcode .label-price` selector chain and assert:

- `className` **contains** the literal substring `text-[80px]` (Tailwind v4 arbitrary-value syntax for `font-size: 80px`).
- `className` **does NOT contain** the substring `text-2xl` (the previous 24px class — its presence would mean the change was incomplete or reverted).

```ts
const priceEl = document.querySelector(
  ".label-container.no-barcode .label-price"
) as HTMLElement;
expect(priceEl).toBeInTheDocument();
expect(priceEl.className).toContain("text-[80px]");
expect(priceEl.className).not.toContain("text-2xl");
```

#### AC16 (new) — A4 on-screen barcode price element keeps `text-lg` (regression guard)

Render with `createProductsWithCodebar(1)`, click the "Generar" button to enable barcode rendering (`showBarcode = true`), find the barcode price element via `.label-container.has-barcode .label-price`, and assert:

- `className` **contains** `text-lg` (the existing on-screen barcode-price sizing — must not be collateral damage from the v4 change).

```ts
const toggleButton = screen.getByRole("button", { name: /generar/i });
fireEvent.click(toggleButton);
const barcodePriceEl = document.querySelector(
  ".label-container.has-barcode .label-price"
) as HTMLElement;
expect(barcodePriceEl).toBeInTheDocument();
expect(barcodePriceEl.className).toContain("text-lg");
```

This is a **regression guard**: v4 changes only the no-barcode branch of the className ternary. If a future refactor accidentally collapses both branches or swaps the conditions, AC16 catches it.

#### AC6 update (documentation note, no functional change)

AC6 in section 5 above already asserts `font-size: 80px` in the A4 `pageStyle` (carried over from v3). No functional change to AC6. Add a parenthetical to document the new coupling:

> **AC6** — The A4 `pageStyle` string contains `.no-barcode.has-price .label-price` with `font-size: 80px` and `font-weight: 900`. *(Print target, now coupled with the on-screen className per amendment v4. The on-screen mirror of AC6 is AC15.)*

#### AC13 / AC14 chain documentation

The versioned chain is now:

- **v1**: AC6 (original) — print `font-size: 32px`.
- **v2**: AC13 — print `font-size: 64px`. AC6 updated to match.
- **v3**: AC14 — print `font-size: 80px`. AC6 updated to match; AC13 superseded.
- **v4**: **AC15** — on-screen `text-[80px]` (mirrors AC6 to the on-screen layer). **AC16** — on-screen barcode `text-lg` regression guard. AC6 unchanged functionally; only a documentation note added to acknowledge the new coupling.

AC13 and AC14 remain in the spec as audit markers of the print-side v1→v2→v3 progression. AC15 is the on-screen mirror of AC6; AC16 is a new on-screen regression guard.

### 10.5 Test plan amendment

Add 2 new tests to `ai/features/a4-no-barcode-tag-size/product-print-modal-a4-no-barcode.test.tsx`. The existing 12 tests (AC1–AC12) stay **completely unchanged** — no edits to existing test bodies.

1. **AC15 test** — on-screen A4 no-barcode price className:

   ```ts
   it("AC15 — A4 on-screen no-barcode price element uses text-[80px] (on-screen mirror of AC6)", () => {
     render(
       <ProductPrintModal
         open={true}
         onOpenChange={mockOnOpenChange}
         products={createProductsWithoutCodebar(1)}
       />
     );
     const priceEl = document.querySelector(
       ".label-container.no-barcode .label-price"
     ) as HTMLElement;
     expect(priceEl).toBeInTheDocument();
     expect(priceEl.className).toContain("text-[80px]");
     // Old 24px class must be gone (no regression back to text-2xl).
     expect(priceEl.className).not.toContain("text-2xl");
   });
   ```

2. **AC16 test** — on-screen A4 barcode price className regression guard:

   ```ts
   it("AC16 — A4 on-screen barcode price element still uses text-lg (regression guard)", () => {
     render(
       <ProductPrintModal
         open={true}
         onOpenChange={mockOnOpenChange}
         products={createProductsWithCodebar(1)}
       />
     );
     const toggleButton = screen.getByRole("button", { name: /generar/i });
     fireEvent.click(toggleButton);
     const barcodePriceEl = document.querySelector(
       ".label-container.has-barcode .label-price"
     ) as HTMLElement;
     expect(barcodePriceEl).toBeInTheDocument();
     expect(barcodePriceEl.className).toContain("text-lg");
   });
   ```

After v4: the file contains **14 tests** (12 pre-existing AC1–AC12 + 2 new AC15–AC16).

### 10.6 Risk / regression notes (v4)

- **Scope of change is minimal:** one Tailwind class swap (`text-2xl` → `text-[80px]`) inside the existing className ternary on line 357. No CSS rule is added, modified, or removed. No constant changes. No `pageStyle` string structure changes.
- **Specificity in print:** the existing `@media print { .no-barcode.has-price .label-price { font-size: 80px } }` rule (specificity 0,3,0) still wins over the `.text-\[80px\]` Tailwind utility (specificity 0,1,0) in print media. Print size remains 80px ✓.
- **Specificity on screen:** only the Tailwind utility applies — the print rule is wrapped in `@media print { }` and does not match outside print media. Screen size becomes 80px ✓.
- **Tailwind v4 arbitrary values are well-established in this codebase.** The pattern `text-[10px]`, `text-[8px]`, etc. is used in 36+ places across `src/` (verified). The same file already uses this syntax on lines 302 and 366 for `.label-code`. No Tailwind config change is required.
- **Thermal branch (line 293)** uses `text-3xl` (30px) for no-barcode and `text-xl` (20px) for barcode. **NOT changed in v4.** The user's complaint is specific to A4 no-barcode. Thermal's on-screen sizing is governed by its own Tailwind classNames; thermal print continues to use its own `@media print` block (line 119–124, line 144–151).
- **AC3, AC4, AC9 thermal regression guards** still apply and should continue to pass — v4 touches only the A4 on-screen className (line 357), which lives in the A4 render branch (lines 322–385). The thermal render branch (lines 273–320) is unaffected.
- **AC11 mixed-batch:** no impact. The change is inside the className ternary `hasBarcode ? "text-lg" : "text-[80px]"`, which evaluates per-card based on `hasBarcode`. Mixed batches continue to assign the correct className to each card independently.
- **AC12 border-dashed:** no impact. v4 does not touch the `border-dashed` className or the `.label-container.no-barcode { border-style: solid !important; }` print rule.
- **Backward compatibility:** none. `text-[80px]` is a fresh addition; `text-2xl` was the only previous value in the no-barcode branch. No consumers depend on the old className value.
- **Specificity footnote:** `text-[80px]` in Tailwind v4 emits a utility selector like `.text-\[80px\]` (one class → 0,1,0). If a future refactor adds a more-specific Tailwind utility or inline style on the same element, that could override — out of scope for v4, but worth flagging in future audits.

### 10.7 Files affected (v4)

| File | Change |
|------|--------|
| `src/components/stock/product-print-modal.tsx` | Line 357 className: `"text-2xl"` → `"text-[80px]"` (A4 no-barcode branch only). Line 293 (thermal className) **NOT touched**. |
| `ai/features/a4-no-barcode-tag-size/SPEC.md` | This section 10 (and AC6 documentation note in section 5; chain documentation note in section 8 and section 9 referring to AC15/AC16). |
| `ai/features/a4-no-barcode-tag-size/product-print-modal-a4-no-barcode.test.tsx` | Add AC15 + AC16 tests (2 new tests). The existing 12 tests are **not modified**. Total after v4: **14 tests**. |

---

## 11. Amendment: Size Reduction (v5)

### 11.1 Context

After v4 shipped with `text-[80px]` on the on-screen A4 no-barcode price className and `font-size: 80px` in the A4 print CSS (synchronized at 80px across both surfaces), the user could finally **see** the change for the first time in the on-screen modal preview. They confirmed:

- "Se ve el cambio" — the verification gap from v1–v3 is resolved.
- "Fue demasiado" — 80px is too large.
- "Debería ser un poco menos" — wants it smaller but still visible/prominent.

No exact value was specified. The target chosen is **64px**, based on:

- 64px was the v2 print-side value (which the user reviewed but never saw on-screen due to the v1–v3 verification gap that v4 just fixed).
- 64px is a "round" design-system value.
- 64px sits between v3/v4 (80px) and the original baseline (20px), giving the user a clear "smaller than now but still prominent" change.
- 64px ≈ 80% of the current 80px, matching the user's "un poco menos" wording.

Chain so far: **original = 20px → v1 = 32px (print) → v2 = 64px (print) → v3 = 80px (print) → v4 = 80px on-screen + 80px print → v5 = 64px on-screen + 64px print.**

### 11.2 Updated requirement

**Two-line change:**

1. **Line 357 (A4 on-screen className, no-barcode branch):**

   - From: `${hasBarcode ? "text-lg" : "text-[80px]"}`
   - To: `${hasBarcode ? "text-lg" : "text-[64px]"}`

2. **Line 203–206 (A4 print CSS):**

   - From: `font-size: 80px;`
   - To: `font-size: 64px;`

Both surfaces converge at **64px** (per the v4 specificity analysis in section 10.2). This restores the v2 print value while keeping v4's on-screen visibility fix. No structural change — same two locations that v4 modified, just with smaller values.

### 11.3 Acceptance criteria

#### AC17 (new) — on-screen A4 no-barcode price element uses `text-[64px]`

Update AC15's expected on-screen className from `text-[80px]` to `text-[64px]`. The AC15 test's `toContain("text-[64px]")` assertion must pass; the negative assertion `not.toContain("text-2xl")` stays intact (the regression guard against reverting to 24px remains valid — 24px is the original baseline, never an accepted target).

#### AC18 (new) — A4 print CSS `.no-barcode.has-price .label-price` uses `font-size: 64px`

Update AC6's expected print `font-size` from `80px` to `64px`. AC6's `toContain("font-size: 64px")` assertion must pass. The selector (`.no-barcode.has-price .label-price`) and `font-weight: 900` assertions remain unchanged.

#### AC16 (regression guard) — unchanged

The barcode branch of the on-screen className still uses `text-lg`. AC16's test is not modified — it continues to guard against the v4-style refactor that accidentally collapsed both branches or swapped conditions. Barcode tags remain unaffected by v5.

#### AC6 documentation note

AC6 in section 5 has been the shipping target for the print font-size since v3 (80px). v5 updates AC6's asserted value to `64px`. The parenthetical now reads:

> **AC6** — The A4 `pageStyle` string contains `.no-barcode.has-price .label-price` with `font-size: 64px` and `font-weight: 900`. *(Print target, coupled with the on-screen className per amendment v4. The on-screen mirror of AC6 is AC15, which is in turn mirrored by AC17.)*

#### AC13 / AC14 / AC15 chain documentation

The versioned chain is now:

- **v1**: AC6 (original) — print `font-size: 32px`.
- **v2**: AC13 — print `font-size: 64px`. AC6 updated to match.
- **v3**: AC14 — print `font-size: 80px`. AC6 updated to match; AC13 superseded.
- **v4**: AC15 — on-screen `text-[80px]` (mirrors AC6 to the on-screen layer). AC16 — on-screen barcode `text-lg` regression guard. AC6 unchanged functionally; documentation note added.
- **v5**: **AC17** — on-screen `text-[64px]` (mirrors AC6's new 64px value to the on-screen layer). **AC18** — print `font-size: 64px` (documented in AC6; AC18 makes the assertion explicit and traceable). AC15 and AC14 superseded by AC17 and AC18 respectively. AC13 remains as the original v2 audit marker.

AC13, AC14, and AC15 remain in the spec as audit markers of the v1 → v2 → v3 → v4 progression. AC17 is the on-screen mirror of the new AC6; AC18 documents the print-side 64px assertion explicitly.

### 11.4 Test plan amendment

Modify **2 existing tests in place** in `ai/features/a4-no-barcode-tag-size/product-print-modal-a4-no-barcode.test.tsx` (per the precedent set in v2 and v3 — both amendments modified the AC6 test in place rather than adding parallel tests):

1. **AC15 test** — change `text-[80px]` to `text-[64px]` in the `toContain` assertion. Keep the negative assertion against `text-2xl`. Keep the selector chain `.label-container.no-barcode .label-price`. Result:

   ```ts
   expect(priceEl.className).toContain("text-[64px]");
   expect(priceEl.className).not.toContain("text-2xl");
   ```

2. **AC6 test** — change `font-size: 80px` to `font-size: 64px` in the `toContain` assertion. Keep the selector `.no-barcode.has-price .label-price` and the `font-weight: 900` assertion. Result:

   ```ts
   expect(pageStyle).toContain("font-size: 64px");
   expect(pageStyle).toContain("font-weight: 900");
   ```

**Do NOT add new tests.** Total stays at **14 tests** (12 pre-existing AC1–AC12 + AC15 + AC16; AC15 body modified, AC6 body modified). AC16 (barcode regression guard), AC17/AC18 documentation, and the AC13/AC14/AC15 audit chain all live in the spec without requiring new test code.

Re-run the full test file. Expected outcome:

- AC1, AC2, AC3, AC4, AC5, AC6 (modified), AC7, AC8, AC9, AC10, AC11, AC12 — all pass.
- AC15 (modified) — passes with the 64px assertion.
- AC16 (unchanged) — passes (barcode branch still `text-lg`).

AC9 (thermal regression guard) continues to pass — 64px is added to the A4 block only.

### 11.5 Risk / regression notes (v5)

- **Scope of change is minimal:** a single value swap in two locations (the Tailwind arbitrary-value className on line 357 and the `font-size` value on line 204 of the print CSS). No constants change. No JSX structure changes. No `pageStyle` string structure changes.
- **64px is the v2 value — restoring it preserves all v2-era ACs** and brings the print CSS back to a previously-reviewed state (32px → 64px → 80px → 64px). The print-side history is fully traceable through AC6/AC13/AC14/AC18.
- **Thermal branch (line 293 className, line 148 print CSS) is unchanged.** AC3, AC4, AC9 thermal regression guards continue to apply and protect the thermal branch.
- **Specificity in print:** the existing `@media print { .no-barcode.has-price .label-price { font-size: 64px } }` rule (specificity 0,3,0) still wins over the `.text-\[64px\]` Tailwind utility (specificity 0,1,0) in print media. Print size remains 64px ✓.
- **Specificity on screen:** only the Tailwind utility applies — the print rule is wrapped in `@media print { }` and does not match outside print media. Screen size becomes 64px ✓.
- **Layout impact:** 64px was previously validated in v2 (section 8.2 page-fit math). Natural per-card content height at 64px ≈ 131px (≈3.47cm), slightly above the 3.36cm `minHeight` — the card grows naturally and `justify-between` re-distributes. This is the same behavior v2 documented and was acceptable to the user (who reviewed 64px print output during v2).
- **AC11 mixed-batch:** no impact. The change is inside the className ternary `hasBarcode ? "text-lg" : "text-[64px]"`, which evaluates per-card based on `hasBarcode`. Mixed batches continue to assign the correct className to each card independently.
- **AC12 border-dashed:** no impact. v5 does not touch the `border-dashed` className or the `.label-container.no-barcode { border-style: solid !important; }` print rule.
- **Tailwind v4 arbitrary values are well-established.** `text-[64px]` follows the same pattern as the v4 `text-[80px]` and the 36+ other arbitrary-value uses across `src/`. No Tailwind config change is required.
- **Backward compatibility:** none. `text-[64px]` replaces `text-[80px]` (introduced in v4); `font-size: 64px` replaces `font-size: 80px` (introduced in v3). Both values have been live in this codebase recently and reverted cleanly, so no consumer can depend on the intermediate 80px value.

### 11.6 Files affected (v5)

| File | Change |
|------|--------|
| `src/components/stock/product-print-modal.tsx` | Line 357 className: `"text-[80px]"` → `"text-[64px]"` (A4 no-barcode branch only). Line 204 (in A4 print CSS): `font-size: 80px` → `font-size: 64px`. Line 293 (thermal className) and line 148 (thermal print CSS) **NOT touched**. |
| `ai/features/a4-no-barcode-tag-size/SPEC.md` | This section 11 (and AC6 documentation note in section 5; chain documentation note in section 8, 9, 10 referring to AC17/AC18). |
| `ai/features/a4-no-barcode-tag-size/product-print-modal-a4-no-barcode.test.tsx` | AC15 test: `text-[80px]` → `text-[64px]`. AC6 test: `font-size: 80px` → `font-size: 64px`. AC16 (regression guard) **NOT modified**. Total stays at **14 tests**. |

---

## 12. Amendment: Further Size Reduction (v6)

### 12.1 Context

After v5 shipped with `text-[64px]` on the on-screen A4 no-barcode price className and `font-size: 64px` in the A4 print CSS (synchronized at 64px across both surfaces), the user reviewed the modal preview again and reported "**muy poco**" — they still feel the price is too prominent and want a noticeable further reduction. No exact value was specified.

The target chosen is **48px**, based on:

- **48px ≈ 75% of 64px** — a clear "smaller" jump that matches the user's "muy poco" wording (noticeably smaller than v5, not just a tweak).
- **48px is a clean, common design-system value** — typically used for "subtitle" or "large emphasis" sizes in typography systems. Easy to remember and verify.
- **48px is still 2.4× the original 20px baseline** — still visibly larger than the unmodified state, so the visual emphasis gained across v1–v6 is preserved (the price remains the dominant element in the no-barcode tag).
- **48px sits comfortably below the v5 value of 64px** — giving the user a clearly distinguishable reduction without dropping into the unmodified baseline territory (20–32px).
- **Page-fit sweet spot** — see section 12.3 below; at 48px the natural content height drops back under the `minHeight` of 3.36cm, so cards no longer need to grow. This is a better fit than v3/v4/v5.

Full chain so far:

- **Original** = 20px (baseline, unmodified A4 no-barcode price).
- **v1** = 32px (print only — invisible on-screen due to the verification gap later diagnosed in v4).
- **v2** = 64px (print only — still invisible on-screen).
- **v3** = 80px (print only — still invisible on-screen).
- **v4** = 80px on-screen + 80px print (sync — visible at last, but too big).
- **v5** = 64px on-screen + 64px print (smaller, but user said "muy poco").
- **v6** = 48px on-screen + 48px print (further reduction per "muy poco").

### 12.2 Updated requirement

**Two-line change (mirroring v5's structure):**

1. **Line 357 (A4 on-screen className, no-barcode branch):**

   - From: `${hasBarcode ? "text-lg" : "text-[64px]"}`
   - To: `${hasBarcode ? "text-lg" : "text-[48px]"}`

2. **Line 203–206 (A4 print CSS):**

   - From:

     ```css
     .no-barcode.has-price .label-price {
       font-size: 64px;
       font-weight: 900;
     }
     ```

   - To:

     ```css
     .no-barcode.has-price .label-price {
       font-size: 48px;
       font-weight: 900;
     }
     ```

Both surfaces converge at **48px** (per the v4 specificity analysis in section 10.2 still holds). No structural change — same two locations that v4 introduced and v5 modified, just with smaller values. The className ternary's barcode branch (`text-lg`) and the print rule's `font-weight: 900` remain untouched.

### 12.3 Page-fit math (update)

With 48px font the natural per-card content height drops back under the `minHeight` floor:

- description (`14px` font, ~17px line-height, 1–2 lines): 17–34px
- price (`48px` font, ~58px line-height, 1 line): ~58px
- code (`8px` font, ~10px line-height, 1 line): ~10px
- gaps / padding: ~10px
- rough total: ~112px ≈ **2.96cm** — **below** the 3.36cm `minHeight`, so cards no longer need to grow beyond the declared floor.

This is a **sweet spot**:

- The price remains the dominant element in the visual hierarchy (2.4× the description's 14px, ~6× the code's 8px).
- The card height returns to its declared `minHeight` of 3.36cm — no natural overflow, no `justify-between` redistribution needed.
- The grid math returns to the original v1 assumption: 3.36cm × 8 rows = 26.88cm of declared tag height + 7 × 2mm = 1.4cm of gaps = **28.28cm**, leaving ~0.42cm against A4 usable height (~28.7cm with 5mm top/bottom margin). Fully-populated 24-tag A4 sheets fit on a **single sheet** again (unlike v3/v4/v5, which forced pagination).
- Shorter batches (≤24 tags per page) fit cleanly with no second sheet.

Comparison vs prior versions at the same card width:

| Version | Price font | Estimated natural card height | Fits single A4 sheet (24 tags)? |
|---------|-----------|-------------------------------|----------------------------------|
| v1 (original) | 20px | ~80px (~2.1cm) | Yes (cards smaller than `minHeight`) |
| v2 | 64px | ~131px (~3.47cm) | Yes (cards grow to 3.47cm, sheet still fits at 28.5cm) |
| v3 / v4 | 80px | ~150px (~3.97cm) | No — paginates to a second sheet |
| v5 | 64px | ~131px (~3.47cm) | Yes (same as v2) |
| **v6** | **48px** | **~112px (~2.96cm)** | **Yes — cleanly, no growth needed** |

### 12.4 Acceptance criteria

#### AC19 (new) — on-screen A4 no-barcode price element uses `text-[48px]`

Update AC15's expected on-screen className from `text-[64px]` to `text-[48px]`. The AC15 test's `toContain("text-[48px]")` assertion must pass; the negative assertion `not.toContain("text-2xl")` stays intact (the regression guard against reverting to 24px remains valid — 24px is the original baseline, never an accepted target).

#### AC20 (new) — A4 print CSS `.no-barcode.has-price .label-price` uses `font-size: 48px`

Update AC6's expected print `font-size` from `64px` to `48px`. AC6's `toContain("font-size: 48px")` assertion must pass. The selector (`.no-barcode.has-price .label-price`) and `font-weight: 900` assertions remain unchanged.

#### AC16 (regression guard) — unchanged

The barcode branch of the on-screen className still uses `text-lg`. AC16's test is not modified — it continues to guard against any refactor that accidentally collapses both branches or swaps conditions. Barcode tags remain unaffected by v6.

#### AC6 documentation note

AC6 in section 5 has been the shipping target for the print font-size across v2 → v3 → v4 → v5 (32 → 64 → 80 → 80 → 64 → **48**). v6 updates AC6's asserted value to `48px`. The parenthetical now reads:

> **AC6** — The A4 `pageStyle` string contains `.no-barcode.has-price .label-price` with `font-size: 48px` and `font-weight: 900`. *(Print target, coupled with the on-screen className per amendment v4. The on-screen mirror of AC6 is AC15, which is in turn mirrored by AC17 (v5) and AC19 (v6).)*

#### AC13 / AC14 / AC15 / AC17 / AC18 / AC19 / AC20 chain documentation

The versioned chain is now:

- **v1**: AC6 (original) — print `font-size: 32px`.
- **v2**: AC13 — print `font-size: 64px`. AC6 updated to match.
- **v3**: AC14 — print `font-size: 80px`. AC6 updated to match; AC13 superseded.
- **v4**: AC15 — on-screen `text-[80px]` (mirrors AC6 to the on-screen layer). AC16 — on-screen barcode `text-lg` regression guard. AC6 unchanged functionally; documentation note added.
- **v5**: AC17 — on-screen `text-[64px]` (mirrors AC6's v5 64px value to the on-screen layer). AC18 — print `font-size: 64px` (documented in AC6; AC18 makes the assertion explicit and traceable). AC15 and AC14 superseded by AC17 and AC18 respectively.
- **v6**: **AC19** — on-screen `text-[48px]` (mirrors AC6's new 48px value to the on-screen layer). **AC20** — print `font-size: 48px` (documented in AC6; AC20 makes the assertion explicit and traceable). AC17 and AC18 superseded by AC19 and AC20 respectively. AC13 remains as the original v2 audit marker.

AC13, AC14, AC15, AC17, and AC18 remain in the spec as audit markers of the v1 → v2 → v3 → v4 → v5 progression. AC19 is the on-screen mirror of the new AC6; AC20 documents the print-side 48px assertion explicitly.

### 12.5 Test plan amendment

Modify **2 existing tests in place** in `ai/features/a4-no-barcode-tag-size/product-print-modal-a4-no-barcode.test.tsx` (per the precedent set in v2, v3, and v5 — all previous value-swap amendments modified the AC6 / AC15 tests in place rather than adding parallel tests):

1. **AC15 test** — change `text-[64px]` to `text-[48px]` in the `toContain` assertion. Keep the negative assertion against `text-2xl`. Keep the selector chain `.label-container.no-barcode .label-price`. Result:

   ```ts
   expect(priceEl.className).toContain("text-[48px]");
   expect(priceEl.className).not.toContain("text-2xl");
   ```

2. **AC6 test** — change `font-size: 64px` to `font-size: 48px` in the `toContain` assertion. Keep the selector `.no-barcode.has-price .label-price` and the `font-weight: 900` assertion. Result:

   ```ts
   expect(pageStyle).toContain("font-size: 48px");
   expect(pageStyle).toContain("font-weight: 900");
   ```

**Do NOT add new tests.** Total stays at **14 tests** (12 pre-existing AC1–AC12 + AC15 + AC16; AC15 body modified, AC6 body modified). AC16 (barcode regression guard), AC19/AC20 documentation, and the AC13/AC14/AC15/AC17/AC18 audit chain all live in the spec without requiring new test code.

Re-run the full test file. Expected outcome:

- AC1, AC2, AC3, AC4, AC5, AC6 (modified), AC7, AC8, AC9, AC10, AC11, AC12 — all pass.
- AC15 (modified) — passes with the 48px assertion.
- AC16 (unchanged) — passes (barcode branch still `text-lg`).

AC9 (thermal regression guard) continues to pass — 48px is added to the A4 block only.

### 12.6 Risk / regression notes (v6)

- **Scope of change is minimal:** a single value swap in two locations (the Tailwind arbitrary-value className on line 357 and the `font-size` value on line 204 of the print CSS). No constants change. No JSX structure changes. No `pageStyle` string structure changes.
- **48px is a clean design-system value** (commonly used for "subtitle" or "emphasis" sizes in typography systems). It is also exactly 2× the description's 14px and 6× the code's 8px, giving consistent visual rhythm across the three text tiers in the no-barcode tag.
- **Both surfaces converge at 48px** (per the v4 specificity analysis still holds): the existing `@media print { .no-barcode.has-price .label-price { font-size: 48px } }` rule (specificity 0,3,0) wins over the `.text-\[48px\]` Tailwind utility (specificity 0,1,0) in print media; only the Tailwind utility applies on screen. Both surfaces = 48px ✓.
- **Page-fit improves vs v3/v4/v5:** at 48px the natural content height (~2.96cm) is below the 3.36cm `minHeight`, so cards no longer need to grow beyond the declared floor. This restores the original v1 page-fit behavior while keeping the price visually prominent — a better outcome than v5 (3.47cm natural, slight growth) or v3/v4 (3.97cm natural, forced second-sheet pagination).
- **Thermal branch (line 293 className, line 148 print CSS) is unchanged.** AC3, AC4, AC9 thermal regression guards continue to apply and protect the thermal branch.
- **AC11 mixed-batch:** no impact. The change is inside the className ternary `hasBarcode ? "text-lg" : "text-[48px]"`, which evaluates per-card based on `hasBarcode`. Mixed batches continue to assign the correct className to each card independently. Card-level minHeight logic (3.36cm vs 3.2cm vs 2.8cm) is unchanged.
- **AC12 border-dashed:** no impact. v6 does not touch the `border-dashed` className or the `.label-container.no-barcode { border-style: solid !important; }` print rule.
- **Tailwind v4 arbitrary values are well-established.** `text-[48px]` follows the same pattern as `text-[64px]` (v5), `text-[80px]` (v4), `text-[10px]`, `text-[8px]`, etc. — 36+ arbitrary-value uses across `src/`. No Tailwind config change is required.
- **Specificity footnote:** `text-[48px]` in Tailwind v4 emits a utility selector like `.text-\[48px\]` (one class → 0,1,0). If a future refactor adds a more-specific Tailwind utility or inline style on the same element, that could override — same caveat documented in v4's section 10.6.
- **Backward compatibility:** none. `text-[48px]` replaces `text-[64px]` (introduced in v5); `font-size: 48px` replaces `font-size: 64px` (introduced in v2, restored in v5). Both values have been live in this codebase recently and reverted cleanly, so no consumer can depend on the intermediate 64px value.

### 12.7 Files affected (v6)

| File | Change |
|------|--------|
| `src/components/stock/product-print-modal.tsx` | Line 357 className: `"text-[64px]"` → `"text-[48px]"` (A4 no-barcode branch only). Line 204 (in A4 print CSS): `font-size: 64px` → `font-size: 48px`. Line 293 (thermal className) and line 148 (thermal print CSS) **NOT touched**. |
| `ai/features/a4-no-barcode-tag-size/SPEC.md` | This section 12 (and AC6 documentation note in section 5; chain documentation note in sections 8, 9, 10, 11 referring to AC19/AC20). |
| `ai/features/a4-no-barcode-tag-size/product-print-modal-a4-no-barcode.test.tsx` | AC15 test: `text-[64px]` → `text-[48px]`. AC6 test: `font-size: 64px` → `font-size: 48px`. AC16 (regression guard) **NOT modified**. Total stays at **14 tests**. |