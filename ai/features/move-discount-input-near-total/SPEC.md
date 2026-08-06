# SPEC — Move discount input near the Total

**Feature:** Relocate the discount percentage input so it sits visually next to the Total in the "Totals Section" of the products area, for fast access.
**Scope:** New Bill page only. No data-model changes. No new dependencies.

---

## 1. Problem

On the **New Bill** page (`src/app/(protected)/newBill/page.tsx`) the discount percentage is currently editable **only** inside `src/components/Billing/BillParametersForm.tsx`, and only when the user toggles into "edit parameters" mode (the `editParamters` state swaps the header for a 3-column grid whose "Descuento" column contains the discount input, lines 343–376). This is an extra, hidden interaction for a field that cashiers adjust constantly.

The Total is rendered in the "Totals Section" of `src/components/Billing/PrintableTable.tsx` (lines ~401–438), which shows **Subtotal**, **Descuento (only when `discount > 0`)**, and **Total**, right-aligned in a `w-72` box on a `bg-gray-50 dark:bg-gray-700/30` strip.

The ask: make the discount percentage editable right where the staff reads the Total, without forcing them to enter "edit parameters" mode.

---

## 2. Goals

- Keep the discount as a **percentage** (stored as `BillState.discount`, e.g. `10` = 10%), driving the existing totals logic — **no data-contract changes**.
- Put a compact, always-available discount input immediately adjacent to the Descuento/Total rows.
- Preserve all existing behavior (order creation, printing, `BillParametersForm` header badges, total math, the "Descuento" row that renders when `> 0`).

## 3. Non-Goals (explicitly out of scope)

- No change to the discount **data model**: the reducer `discount` action, `BillState.discount`, `totalWithDiscount`, and the print `receiptData.discount` semantics remain unchanged.
- No persistence or server-action changes (discount editing is a client-only concern on the composed bill).
- Do not change the layout of `sales/[id]` detail pages or other consumers; they keep their existing read-only display.

---

## 4. Design Overview

### 4.1 Source of truth
`BillState.discount` (percent) remains the single source of truth. Totals are computed centrally in `PrintableTable`'s existing `useMemo` (lines 217–224) which already reads `state.discount` and `state.totalWithDiscount`.

### 4.2 Reuse the existing reducer `discount` action
The `BillReducer` already implements `{ type: "discount"; payload: number }` (`src/context/BillReducer.ts`, lines 159–172). It recomputes `totalWithDiscount = Math.round(rawTotal * (1 - discount/100))` from **live product state**, and also flips it to the raw total when discount resolves to `0`. This gives us *live, reactive* Total updates for free and is already exercised by `CartProvider`.

> Because the `totals` `useMemo` in `PrintableTable` prefers `state.totalWithDiscount` when defined (line 220–222), dispatching the `discount` action immediately updates the Total row. No other wiring needed.

### 4.3 New component: `DiscountControl`
Create a small, self-contained **client** component `src/components/Billing/DiscountControl.tsx`:

- Reads `BillState.discount` and `dispatch` from `BillContext`.
- Renders a compact inline row: a visible **"Descuento"** label + a narrow numeric input (≈ `w-20`) + a `%` suffix.
- Commits changes by calling `dispatch({ type: "discount", payload })`.
- Is `print:hidden` (it is a screen-only editing affordance; the printable Descuento/Total rows remain as today).
- Props:
  - `editable?: boolean` (default `true`) — when `false`, render a read-only Descuento row instead of the input (used in view/print contexts, see §5.4).
  - `className?: string` for layout injection.

### 4.4 Where it goes in `PrintableTable`
Place `<DiscountControl editable={...}/>` **inside the existing right-aligned `w-72`/`w-80` totals box**, rendered just before the **Descuento** row and **Total** row (i.e. directly flanking the Total, satisfying "near the Total"). It lives next to `State.discount > 0 && (...)Descuento...)` block so that when the user types a discount the row appears immediately below the label.

### 4.5 Remove duplication in `BillParametersForm`
- **Remove** the discount `FormField` + "preview discount" box (lines 343–412) from the "Descuento" column in edit mode, and the column's heading is dropped (empty column would otherwise render).
- Keep `discount: 0` in the form's `defaultValues` / `form.reset` so the `SetSchema` shape stays shallow-compatible, but **stop relying on it**.
- The **non-edit header** discount badge (lines 465–472) must now read from **`BillState.discount`** instead of `form.getValues().discount`, so it reflects the DiscountControl's value.
- In the edit-mode `onSubmit`, use **`BillState.discount`** (from context) when building the `setState` payload instead of `data.discount`, to keep discount from "reverting" to the form's stale value after the DiscountControl changed it.

### 4.6 Editing UX micro-decisions
- **Commit strategy:** live-parse on change **and** commit on `Enter`/`blur`; using the reducer action means the Total row updates in real time (fast access).
- **Empty input** → commit `0` (i.e., no discount).
- **Negative input** → clamp to `0`.
- **`> 100`** → clamp to `100` (Total never goes below `0`; also avoids negative-value receipts).
- Use a **local editing string** so users can clear and retype (a pure controlled `number` bound to `state.discount` fights typing "0" then "1"). Resync the local string when `BillState.discount` changes externally (e.g. order reset, `setState` from form).

### 4.7 Accessibility & dark mode
- Input has an **associated `<label>`** ("Descuento") and `aria-label="Porcentaje de descuento"`.
- `inputMode="numeric"` for numeric keypad; `autoComplete="off"`.
- Dark mode: use the existing tailwind `dark:` variants already used across the page (e.g. `bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-600`, and boxed area `bg-gray-50 dark:bg-gray-700/30`). Tailwind is configured with `darkMode: "class"` (`tailwind.config.js`), consistent with the rest of the app.
- Focus state: match existing inputs (`focus-visible:ring` from `@/components/ui/input`).

---

## 5. Files & Changes

### New files
- `src/components/Billing/DiscountControl.tsx` — the reusable client component (§4.3). `"use client"`, uses `BillContext`, local editing string, clamping, `dispatch({ type: "discount" })`, dark mode + a11y, `print:hidden`.

### Modified files
| File | Change |
|------|--------|
| `src/components/Billing/PrintableTable.tsx` | Import and render `<DiscountControl>` inside the Totals box (near Total). Add the `editable` prop (`default` derived from `!externalState`), describe print/read-only gating. |
| `src/components/Billing/ProductsTable.tsx` | No change required if editing is derived, but verify it renders `PrintableTable` in the interactive New Bill path (it does today). |
| `src/components/Billing/BillParametersForm.tsx` | Remove discount `FormField`/preview from edit grid (line ~343–384) + empty column; make the non-edit discount badge read `BillState.discount` (lines 465–472); in `onSubmit` use `BillState.discount` (not `data.discount`). If the discount column becomes unused, drop the empty ``. |

### Unchanged
- `src/context/BillContext.tsx`, `BillProvider.tsx`, `BillReducer.ts`, `BillState.ts` — no changes needed (the `discount` action already exists).
- `src/schemas/index.ts` — `BillParametersSchema.discount` (`z.coerce.number()`) can remain; it will just no longer be sourced from the editable form. Optional: leave as-is to minimize churn.
- `SalesTable` (view-mode) — discount remains read-only (via `editable=false`), so no change.

---

## 6. Edge Cases & Rules

| Input | Expected behavior |
|-------|-------------------|
| blank / empty | commit `0`; no Descuento row; Subtotal == Total |
| `"0"` | as above |
| negative (e.g. `-5`) | clamp to `0` |
| `> 100` (e.g. `150`) | clamp to `100`; Total ≥ 0 |
| fractional (e.g. `9.5`) | accept and store as number; totals rounded via existing `Math.round` in reducer/memo |
| typing series `","ret"` → `10` | local editing string handles it; commit `10` |

- **Printing:** `DiscountControl` is `print:hidden`; the printed PDF/thermal receipt must show Subtotal / Descuento (when `> 0`) / Total identically to today.
- **View/read-only contexts:** when `externalState` is provided (e.g. `SalesTable`), `editable` is `false` and the control renders as read-only; it never mutates a saved sale on-screen.
- **Reset:** `onOrderResetRef`/`reset` flow still zeroes discount; DiscountControl reads from context and will reflect `0`.

---

## 7. Acceptance Criteria (measurable)

1. **Placement:** On the New Bill page, an editable discount input (with `%` suffix) is visible inside the Totals Section of `PrintableProductsArea`, within the same right-aligned totals box, immediately above the **Total** row. It is available **without** entering "edit parameters" mode.
2. **Data contract:** The input edits `BillState.discount` as a **percentage number** (e.g. `10` ⇒ 10%). `BillState.discount`, `BillState.totalWithDiscount`, and `totals.total` reuse existing logic; no schema/database change.
3. **Live recompute:** Typing/committing a discount updates the **Total** row and the **Descuento** row via `state.totalWithDiscount` in real time (reducer `discount` action + `useMemo`).
4. **Edge cases:** empty ⇒ `0`; `0` ⇒ no Descuento row and Subtotal == Total; negatives clamped to `0`; values `> 100` clamped to `100`; Total never negative.
5. **No duplication:** the edit-form discount input and its "preview" panel are removed from `BillParametersForm`'s edit grid; the header discount badge reflects `BillState.discount`.
6. **Print:** the interactive discount control is absent from printed/PDF/thermal output (`print:hidden`); Subtotal/Descuento/Total print identically to pre-change behavior.
7. **Accessibility:** input has an associated `<label>` and `aria-label="Porcentaje de descuento"`, `inputMode="numeric"`, `autoComplete="off"`; `Enter`/`blur` commit, `Escape` cancels.
8. **Dark mode:** control uses existing `dark:` classes and remains legible under `darkMode:"class"`.
9. **Read-only contexts:** in view/saved-sale usages (via `externalState`) the control is not editable and does not mutate the sale.
10. **Regression:** `npm run lint` passes; `npm run test` (existing `PrintableTable.test.tsx` discount case, and any DiscountControl unit test) passes; full `npm run build` succeeds.

---

## 8. Out of scope / open questions

- Whether the discount editor should also appear on the **Edit Sale** page (`sales/[id]/edit`) — current scope keeps that path with its existing (`setState`) editing only.
- Range upper bound defaulted to `100`; if a business needs negative or >100 (surge) discounts, that is a separate follow-up feature.

---

## 9. Definition of Done

- `DiscountControl` exists and is wired into `PrintableTable`'s Totals box.
- Discount reachable without "edit mode" and updates Totals live.
- EDTA discussion toward `BillParametersForm` cleanly removed.
- Existing totals/print behavior byte-for-byte preserved.
- Unit tests peer evaluate the edge-case matrix (§6) and the `PrintableTable` totals the discount test.