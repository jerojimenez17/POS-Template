# SPEC.md — Overdue Account Indicator

## Feature Name
`overdue-account-indicator`

## Goal
Add a visual red indicator (badge/dot) to the Account Ledger (Cuenta Corriente) page that clearly marks overdue accounts — orders whose payment is past due by more than 30 days. This helps business owners quickly identify which clients are "morosos" (delinquent) without having to manually inspect order dates.

---

## Background

The Account Ledger page currently displays all unpaid orders with their client name, total, date, status, and action buttons. However, there is no visual cue to distinguish between:
- A **recent** unpaid order (e.g., placed 2 days ago — normal delay)
- An **overdue** unpaid order (e.g., placed 45 days ago — concerning)

The business needs a quick way to spot delinquent accounts. All required data (`date`, `paidStatus`, `status`) already exists in the `OrderWithClient` type returned by the `getUnpaidOrders` server action. No database schema changes are needed.

---

## Requirements

### R1: Overdue Detection Logic
An order is considered **overdue** when ALL of the following conditions are true:
1. `paidStatus === "inpago"` (the order is unpaid)
2. `date < (current date - 30 days)` (the order was placed more than 30 days ago)
3. `status !== "pendiente"` (the order is confirmed — pending orders are not overdue)

### R2: Visual Indicator
- Show a **red filled circle/dot** (🔴) next to the client name for each overdue order in the table.
- The indicator must be clearly visible and distinguishable from other UI elements.
- Use a size that is prominent but not overwhelming (e.g., 8-10px diameter).

### R3: Tooltip Explanation
- When the user hovers over the red dot, show a tooltip explaining the overdue status.
- Tooltip text (Spanish): `"Moroso — más de 30 días sin pagar"` (or similar).
- The tooltip must work on both desktop (mouse hover) and mobile (tap).

### R4: Works Across All Tabs
- The indicator must appear in **all** status filter tabs:
  - "Pendientes de Pago" (`inpago`)
  - "Pagados" (`pago`) — though unlikely, overdue items in paid should still show if data conditions are met.
  - "Todos" (`all`) — the indicator is most valuable here since it shows all states.
  - "Por Confirmar" (`pendiente`) — by definition, pending orders are NOT overdue (R1 condition 3), so they will never show the indicator.

### R5: Pure Frontend — No Database Changes
- The overdue check must be computed entirely on the frontend (in the `OrdersTable` component).
- No new database fields, no new Prisma queries, no new server action endpoints.
- The `getUnpaidOrders` action already returns all the data needed (`date`, `paidStatus`, `status`).

### R6: No Breaking Changes
- Existing functionality (status badges, action buttons, date display, search, sorting) must continue to work identically.
- The overdue indicator is additive only.

---

## Technical Design

### 1. Overdue Detection Utility

Create a utility function `isOrderOverdue(order): boolean` that encapsulates the overdue check logic.

```typescript
function isOrderOverdue(order: OrderWithClient): boolean {
  if (order.paidStatus !== "inpago") return false;
  if (order.status === "pendiente") return false;

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  thirtyDaysAgo.setHours(0, 0, 0, 0); // Compare from start of day

  return new Date(order.date) < thirtyDaysAgo;
}
```

**Why a utility function?**
- Single source of truth for the overdue definition.
- Easy to unit test independently.
- If the overdue threshold changes (e.g., 30 → 45 days), only one place needs updating.

**Time-of-day consideration:**
- The `thirtyDaysAgo` date is set to midnight (start of day) so that "exactly 30 days ago" is the boundary. An order placed at 3:00 PM 30 days ago with today's date being the 31st day would be overdue. This aligns with user expectation: "more than 30 days."

### 2. Overdue Indicator Component

Create a new client component `OverdueIndicator` that renders a red circle with a tooltip.

```typescript
// src/components/ui/OverdueIndicator.tsx
"use client";

import * as Tooltip from "@radix-ui/react-tooltip";
// or use the HoverCard approach if tooltip isn't available

export function OverdueIndicator() {
  return (
    <Tooltip.Provider>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>
          <span className="inline-flex items-center justify-center w-2.5 h-2.5 rounded-full bg-red-500 cursor-help" />
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content
            className="...tooltip styling..."
            sideOffset={5}
          >
            Moroso — más de 30 días sin pagar
            <Tooltip.Arrow className="fill-red-500" />
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  );
}
```

**Design details:**
- Red dot: `w-2.5 h-2.5 rounded-full bg-red-500` (10px × 10px circle)
- Subtle pulse animation optionally via Tailwind `animate-pulse` to draw attention
- `cursor-help` to indicate interactive tooltip
- Tooltip text in Spanish: `"Moroso — más de 30 días sin pagar"`

**Tooltip library:** `@radix-ui/react-tooltip` (already installed at `^1.2.8`).

If Radix Tooltip proves too complex to integrate, a simpler CSS-only approach can be used:
```typescript
<span
  className="inline-flex items-center justify-center w-2.5 h-2.5 rounded-full bg-red-500 cursor-help"
  title="Moroso — más de 30 días sin pagar"
/>
```
The native `title` attribute provides a built-in tooltip on hover. However, for better UX and mobile support, the Radix Tooltip is preferred.

### 3. Modify OrdersTable Component

In `src/app/(protected)/account-ledger/page.tsx`:

**a. Import** the `isOrderOverdue` utility and `OverdueIndicator` component.

**b. Apply the indicator** in the client name column (first cell of each row):

```tsx
<TableCell className="font-medium">
  <div className="flex items-center gap-2">
    <User className="h-4 w-4 text-muted-foreground" />
    {isOrderOverdue(order) && <OverdueIndicator />}
    {order.client?.name || "Sin cliente"}
  </div>
</TableCell>
```

**c. Alternative placement:** Show the indicator next to the status badge instead, which may be more semantically appropriate:

```tsx
<TableCell>
  <div className="flex items-center gap-2">
    {getStatusBadge(order.status, order.paidStatus)}
    {isOrderOverdue(order) && <OverdueIndicator />}
  </div>
</TableCell>
```

**Decision:** Show the indicator **next to the client name** (option b). This is the most natural location because:
- The client is the entity responsible for payment.
- The status badge already conveys payment status; the red dot adds an additional "time dimension."
- It preserves the clean left-to-right reading flow: Client → Overdue indicator → Total → Date → Status → Actions.

**d. No changes needed to:**
- `getStatusBadge` — remains unchanged.
- Sorting/search logic — the indicator is purely visual; sorting by client name is unaffected.
- The `StatusTab` navigation — no changes needed.
- The `getUnpaidOrders` server action — no changes needed.

### 4. File Structure

| Action | File | Description |
|--------|------|-------------|
| **CREATE** | `src/utils/overdue.ts` | `isOrderOverdue()` utility function with unit-testable logic |
| **CREATE** | `src/components/ui/OverdueIndicator.tsx` | Red dot with tooltip component |
| **MODIFY** | `src/app/(protected)/account-ledger/page.tsx` | Import and use `isOrderOverdue` + `OverdueIndicator` in `OrdersTable` |
| **CREATE** | `src/__tests__/utils/overdue.test.ts` | Unit tests for `isOrderOverdue` (if test framework exists) |

### 5. Visual Design Specification

```
┌─────────────────────────────────────────────────────────────┐
│  Cliente         │ Total      │ Fecha       │ Estado       │
├─────────────────────────────────────────────────────────────┤
│  👤 Juan Pérez 🔴 │ $15,000    │ 15/05/2026  │ Pendiente   │  ← Overdue
│  👤 María García   │ $8,200     │ 10/07/2026  │ Pendiente   │  ← Recent (not overdue)
│  👤 Ana López 🔴  │ $22,000    │ 02/04/2026  │ Pendiente   │  ← Overdue
└─────────────────────────────────────────────────────────────┘

🔴 = Red filled circle (10px), with tooltip on hover
```

---

## Acceptance Criteria

### AC-01: Overdue indicator appears for orders matching all three conditions
- **Given** an order with `paidStatus: "inpago"`, `status: "confirmado"`, and `date` = 35 days ago
- **When** the `OrdersTable` renders
- **Then** the red dot indicator is visible next to the client name
- **Verification:** Unit test `isOrderOverdue()` returns `true`; visual test confirms the red dot is rendered in the DOM

### AC-02: Overdue indicator does NOT appear for recently unpaid orders
- **Given** an order with `paidStatus: "inpago"`, `status: "confirmado"`, and `date` = 5 days ago
- **When** the `OrdersTable` renders
- **Then** NO red dot indicator appears
- **Verification:** Unit test `isOrderOverdue()` returns `false`; visual test confirms no red dot in the DOM for this row

### AC-03: Overdue indicator does NOT appear for paid orders
- **Given** an order with `paidStatus: "pago"`, `status: "confirmado"`, and `date` = 60 days ago (over 30 days)
- **When** the `OrdersTable` renders
- **Then** NO red dot indicator appears (because `paidStatus !== "inpago"`)
- **Verification:** Unit test `isOrderOverdue()` returns `false`

### AC-04: Overdue indicator does NOT appear for pending orders
- **Given** an order with `paidStatus: "inpago"`, `status: "pendiente"`, and `date` = 60 days ago
- **When** the `OrdersTable` renders
- **Then** NO red dot indicator appears (because `status === "pendiente"`)
- **Verification:** Unit test `isOrderOverdue()` returns `false`

### AC-05: Tooltip shows descriptive text on hover
- **Given** an overdue order with the red dot indicator visible
- **When** the user hovers over the red dot
- **Then** a tooltip displays the text `"Moroso — más de 30 días sin pagar"` (or equivalent)
- **Verification:** Manual test: hover over indicator → tooltip appears. If using Radix Tooltip, verify `Tooltip.Content` contains the expected text.

### AC-06: Indicator works across all status tabs
- **Given** the Account Ledger page
- **When** the user switches between "Pendientes de Pago", "Pagados", "Todos" tabs
- **Then** overdue indicators appear consistently in all tabs where overdue orders exist
- **Verification:** Navigate through all tabs and confirm overdue indicators are present only where expected

### AC-07: Borderline case — exactly 30 days ago is NOT overdue
- **Given** an order with `paidStatus: "inpago"`, `status: "confirmado"`, and `date` = exactly 30 days ago at 00:00:00
- **When** `isOrderOverdue()` is called
- **Then** it returns `false` (date must be *more than* 30 days ago)
- **Verification:** Unit test with date set to `now - 30 days` at midnight → returns `false`

### AC-08: Borderline case — 30 days + 1 second is overdue
- **Given** an order with `paidStatus: "inpago"`, `status: "confirmado"`, and `date` = 30 days ago minus 1 second (i.e., 30 days + 1 second in the past)
- **When** `isOrderOverdue()` is called
- **Then** it returns `true`
- **Verification:** Unit test confirms `true` for dates slightly beyond the 30-day threshold

### AC-09: No regressions — existing table functionality works
- **Given** the Account Ledger page
- **When** loading orders, searching, sorting, viewing details, paying, or canceling
- **Then** all existing behavior is unchanged
- **Verification:** Existing functionality test pass; visual inspection confirms action buttons, status badges, date display, search, and sorting work as before

---

## Edge Cases

| # | Case | Expected Behavior |
|---|------|-------------------|
| 1 | **Order with `date` in the future** | `futureDate < thirtyDaysAgo` is `false` → NOT overdue. `isOrderOverdue()` returns `false`. |
| 2 | **Order with `date = null`** | Cannot happen in practice (Prisma schema likely has `date` as required). If it does occur, `new Date(null)` creates epoch → would be overdue. Add a null guard: `if (!order.date) return false`. |
| 3 | **Order with `paidStatus` not "inpago" but unpaid-like values** | Future-proofing: only `"inpago"` triggers the check. Any other value (e.g., a new status like `"partial"`) would not be marked overdue unless explicitly added to the condition. |
| 4 | **Order with `status` not "pendiente" but also not "confirmado"** (e.g., `"entregado"`, `"consignacion"`) | These are confirmed orders → they CAN be overdue. The condition only excludes `"pendiente"`, all other statuses are eligible. |
| 5 | **Many overdue orders on screen** | All overdue orders show the indicator. The red dots collectively signal to the business owner that there are multiple delinquent accounts. |
| 6 | **Tab switching preserves overdue state** | Since `isOrderOverdue()` runs on each render, switching tabs recalculates correctly. No stale state concerns. |
| 7 | **Daylight saving time / timezone** | The comparison uses the server's local time (Node.js). If the server and client are in different timezones, the exact "30 days" boundary could vary by an hour. This is acceptable for a POS application — a ±1 hour difference at the 30-day boundary is negligible. |
| 8 | **Leap year / month boundaries** | `setDate(getDate() - 30)` handles all calendar edge cases correctly (months with 28/29/30/31 days). JavaScript's `Date` object handles leap years and month rollovers automatically. |
| 9 | **Accessibility — screen readers** | The red dot should have an `aria-label` attribute: `aria-label="Moroso, más de 30 días sin pagar"` so screen readers announce the overdue status. |
| 10 | **Color blindness** | The red dot relies solely on color. Add a subtle text or icon in the tooltip, but the dot itself is color-only. Consider adding `[ title ]` attribute or a small "!" icon inside the dot as a future enhancement. For now, the tooltip provides the full context. |

---

## Dependencies

No new npm packages required. `@radix-ui/react-tooltip` is already installed at `^1.2.8`.

---

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| `isOrderOverdue()` runs on every render | Negligible — pure function, O(1) computation | No mitigation needed |
| Tooltip doesn't work on mobile (tap) | Mobile users can't see the explanation | Radix Tooltip supports pointer events; falls back to tap. Additionally, the `title` attribute on a `<span>` provides an alternative. |
| Overdue definition changes (e.g., 30 → 45 days) | Threshold needs updating | Only one line in `isOrderOverdue()` needs changing |
| New orders created with future dates | Could incorrectly show as not overdue | `isOrderOverdue()` correctly returns `false` for future dates. This is a data integrity concern, not a feature bug. |
| Server-side rendering mismatch | The 30-day calculation depends on server time | Since `isOrderOverdue()` is called within a Server Component (`OrdersTable` is `async` but NOT `"use client"`), the date comparison uses the server's clock. This is acceptable — the server clock is the source of truth for "today." |
