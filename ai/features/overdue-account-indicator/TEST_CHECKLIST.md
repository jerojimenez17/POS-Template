# TEST_CHECKLIST.md — Overdue Account Indicator

## Acceptance Criteria Coverage

| Criteria | Description | Test File | Test Name | Status |
|----------|-------------|-----------|-----------|--------|
| **AC-01** | Red dot appears for unpaid, non-pending orders > 30 days old | `src/__tests__/utils/overdue.test.ts` | `AC-01: returns true when paidStatus=inpago, status≠pendiente, date>30 days ago` | ❌ FAIL (no impl) |
| **AC-01** | (Component) Red circle renders in DOM | `src/__tests__/components/OverdueIndicator.test.tsx` | `AC-01: renders a red circle element` | ❌ FAIL (no impl) |
| **AC-01** | (Component) Red circle has correct sizing classes | `src/__tests__/components/OverdueIndicator.test.tsx` | `AC-01: red circle has the correct sizing classes` | ❌ FAIL (no impl) |
| **AC-01** | (Component) Red circle has cursor-help class | `src/__tests__/components/OverdueIndicator.test.tsx` | `AC-01: red circle has cursor-help indicating an interactive tooltip` | ❌ FAIL (no impl) |
| **AC-02** | No indicator for unpaid orders < 30 days old | `src/__tests__/utils/overdue.test.ts` | `AC-02: returns false when date < 30 days ago (recent unpaid)` | ❌ FAIL (no impl) |
| **AC-03** | No indicator for paid orders (even if old) | `src/__tests__/utils/overdue.test.ts` | `AC-03: returns false when paidStatus=pago even if date>30 days ago` | ❌ FAIL (no impl) |
| **AC-04** | No indicator for pending orders (even if old) | `src/__tests__/utils/overdue.test.ts` | `AC-04: returns false when status=pendiente even if date>30 days ago` | ❌ FAIL (no impl) |
| **AC-05** | Tooltip shows "Moroso — más de 30 días sin pagar" on hover | `src/__tests__/components/OverdueIndicator.test.tsx` | `AC-05: renders tooltip content with the expected overdue message` | ❌ FAIL (no impl) |
| **AC-05** | Tooltip arrow renders | `src/__tests__/components/OverdueIndicator.test.tsx` | `AC-05: renders tooltip arrow element` | ❌ FAIL (no impl) |
| **AC-06** | Indicator works across all status tabs | _Integration test — verified by rendering in account-ledger page_ | — | ❌ PENDING (e2e) |
| **AC-07** | Exactly 30 days ago at midnight is NOT overdue | `src/__tests__/utils/overdue.test.ts` | `AC-07: returns false when date is exactly 30 days ago at midnight (boundary)` | ❌ FAIL (no impl) |
| **AC-08** | 30 days + 1ms ago IS overdue | `src/__tests__/utils/overdue.test.ts` | `AC-08: returns true when date is 30 days ago minus 1ms (just past boundary)` | ❌ FAIL (no impl) |
| **AC-09** | No regressions to existing functionality | _Covered by existing test suite_ | — | ❌ PENDING |

## Edge Case Coverage

| # | Case | Test File | Test Name | Status |
|---|------|-----------|-----------|--------|
| 1 | Order with `date` in the future | `src/__tests__/utils/overdue.test.ts` | `returns false when date is in the future` | ❌ FAIL (no impl) |
| 2 | Order with `date = null` (null guard) | `src/__tests__/utils/overdue.test.ts` | `returns false when date is null (null guard)` | ❌ FAIL (no impl) |
| 2b | Order with `date = undefined` | `src/__tests__/utils/overdue.test.ts` | `returns false when date is undefined` | ❌ FAIL (no impl) |
| 3 | `paidStatus` not "inpago" (e.g., "cancelado") | `src/__tests__/utils/overdue.test.ts` | `returns false when paidStatus is a non-inpago value (e.g., cancelado)` | ❌ FAIL (no impl) |
| 4 | `status` = "entregado" (confirmed, not pending) | `src/__tests__/utils/overdue.test.ts` | `returns true when status=entregado, old, and unpaid` | ❌ FAIL (no impl) |
| 4b | `status` = "consignacion" (confirmed, not pending) | `src/__tests__/utils/overdue.test.ts` | `returns true when status=consignacion, old, and unpaid` | ❌ FAIL (no impl) |
| 5 | Multiple statuses not "pendiente" all eligible | `src/__tests__/utils/overdue.test.ts` | `returns true for any non-pendiente status when other conditions are met` | ❌ FAIL (no impl) |
| 7 | DST / timezone (handled by server clock) | _Cannot unit-test meaningfully_ | — | ❌ N/A |
| 8 | Leap year / month boundaries | `src/__tests__/utils/overdue.test.ts` | `handles month boundary crossing correctly (e.g., from March 31 go back 30 days)` | ❌ FAIL (no impl) |
| 9 | Accessibility — screen reader aria-label | `src/__tests__/components/OverdueIndicator.test.tsx` | `AC-09: includes an aria-label for accessibility` | ❌ FAIL (no impl) |
| — | 29 days ago (just under threshold) | `src/__tests__/utils/overdue.test.ts` | `returns false for an order 29 days ago` | ❌ FAIL (no impl) |
| — | 31 days ago (just over threshold) | `src/__tests__/utils/overdue.test.ts` | `returns true for an order 31 days ago` | ❌ FAIL (no impl) |
| — | Today's date (current) | `src/__tests__/utils/overdue.test.ts` | `returns false for an order placed today` | ❌ FAIL (no impl) |

## Running the Tests

```bash
# Run all tests (will show failures since impl doesn't exist yet)
npm run test

# Run only overdue-related tests
npm run test -- src/__tests__/utils/overdue.test.ts
npm run test -- src/__tests__/components/OverdueIndicator.test.tsx

# Watch mode
npm run test -- --watch
```

## Legend

| Status | Meaning |
|--------|---------|
| ✅ PASS | Test passes |
| ❌ FAIL | Test fails (expected — no implementation yet) |
| ❌ PENDING | Cannot run until implementation exists |
| ❌ N/A | Not applicable / cannot unit test |
