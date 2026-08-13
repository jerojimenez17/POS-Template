# TEST_CHECKLIST.md - Default Invoice Type by IVA Condition

## Feature: `default-invoice-type-by-iva-condition`

**Created by:** QA Engineer Agent
**Date:** 2026-08-11
**Status:** TDD - Tests written first, awaiting implementation

---

## Test Files Created

| # | File | Type | Tests | Purpose |
|---|------|------|-------|---------|
| 1 | `src/__tests__/utils/billing.test.ts` | Unit | 10 | `getDefaultBillType()` utility function |
| 2 | `src/__tests__/context/BillReducer-removeAll-default.test.ts` | Unit | 6 | BillReducer `removeAll` with dynamic default |
| 3 | `src/__tests__/components/BillParametersForm-default-type.test.tsx` | Integration | 4 | BillParametersForm uses utility for defaults |
| 4 | `src/__tests__/components/BillingModal-default-type.test.tsx` | Integration | 5 | BillingModal shows correct default |

---

## Acceptance Criteria Test Coverage

### AC-01: Monotributo business defaults to Factura C
- [ ] `billing.test.ts` - "returns Factura C when condicionIva is MONOTRIBUTO"
- [ ] `billing.test.ts` - "returns 'Factura C' string when condicionIva is MONOTRIBUTO"
- [ ] `BillParametersForm-default-type.test.tsx` - "uses getDefaultBillType with MONOTRIBUTO"
- [ ] `BillingModal-default-type.test.tsx` - "displays Factura C when business is MONOTRIBUTO"

### AC-02: Responsable Inscripto business defaults to Factura B
- [ ] `billing.test.ts` - "returns Factura B when condicionIva is RESPONSABLE_INSCRIPTO"
- [ ] `billing.test.ts` - "returns 'Factura B' string when condicionIva is RESPONSABLE_INSCRIPTO"
- [ ] `BillParametersForm-default-type.test.tsx` - "uses getDefaultBillType with RESPONSABLE_INSCRIPTO"
- [ ] `BillingModal-default-type.test.tsx` - "displays Factura B when business is RESPONSABLE_INSCRIPTO"

### AC-03: User can override the default
- [ ] `BillParametersForm-default-type.test.tsx` - "renders with the default bill type from getDefaultBillType, not hardcoded Factura C"
- [ ] (Manual verification: user can change bill type via Select dropdown)

### AC-04: BillReducer resets to correct default
- [ ] `BillReducer-removeAll-default.test.ts` - "resets billType to Factura B when defaultBillType is Factura B"
- [ ] `BillReducer-removeAll-default.test.ts` - "resets billType to Factura C when defaultBillType is Factura C"
- [ ] `BillReducer-removeAll-default.test.ts` - "resets billType to the passed defaultBillType, not the current billType"
- [ ] `BillReducer-removeAll-default.test.ts` - "resets all fields correctly alongside billType reset"

### AC-05: BillingModal shows correct default
- [ ] `BillingModal-default-type.test.tsx` - "displays Factura B when business is RESPONSABLE_INSCRIPTO"
- [ ] `BillingModal-default-type.test.tsx` - "displays Factura C when business is MONOTRIBUTO"
- [ ] `BillingModal-default-type.test.tsx` - "shows description with correct invoice type, not hardcoded Factura C"

### AC-06: Fallback to Factura C when business data unavailable
- [ ] `billing.test.ts` - "returns Factura C when condicionIva is null (fallback)"
- [ ] `billing.test.ts` - "returns Factura C when condicionIva is undefined (fallback)"
- [ ] `billing.test.ts` - "returns Factura C when called with no arguments (fallback)"
- [ ] `billing.test.ts` - "returns Factura C for any unrecognized value (fallback)"
- [ ] `BillParametersForm-default-type.test.tsx` - "uses getDefaultBillType with null when business data unavailable"
- [ ] `BillingModal-default-type.test.tsx` - "displays Factura C when business IVA condition is null"

### AC-07: No regressions on existing billing flow
- [ ] Existing `BillReducer.test.ts` - All existing tests still pass
- [ ] Existing `BillParametersForm.test.tsx` - All existing tests still pass
- [ ] Manual: Run full billing flow with Monotributo business
- [ ] Manual: Run full billing flow with Responsable Inscripto business

### AC-08: Default applied on form reset after sale
- [ ] `BillReducer-removeAll-default.test.ts` - "returns Factura B as default after a Responsable Inscripto sale is cleared"
- [ ] `BillReducer-removeAll-default.test.ts` - "returns Factura C as default after a Monotributo sale is cleared"
- [ ] (Manual verification: `onOrderResetRef` calls form.reset with correct default)

### AC-09: AFIP voucher generation uses correct invoice type
- [ ] `BillingModal-default-type.test.tsx` - "calls getDefaultBillType to determine the correct invoice type for the sale"
- [ ] (Manual verification: AFIP action receives correct billType)

---

## Implementation Required

To make all tests pass, the Developer must:

1. **Create `src/utils/billing.ts`**
   - Export `getDefaultBillType(condicionIva?: string | null): string`
   - Map `RESPONSABLE_INSCRIPTO` → `"Factura B"`
   - Map `MONOTRIBUTO` → `"Factura C"`
   - Fallback (null/undefined/other) → `"Factura C"`

2. **Update `src/context/billActions.ts`**
   - Add optional `defaultBillType` to `removeAll` action type

3. **Update `src/context/BillReducer.ts`**
   - In `removeAll` case, use `action.defaultBillType ?? "Factura C"` instead of hardcoded `"Factura C"`

4. **Update `src/components/Billing/BillParametersForm.tsx`**
   - Import `getDefaultBillType`
   - Fetch business IVA condition (via `getBusinessBillingInfoAction` or from context)
   - Use `getDefaultBillType(businessIvaCondition)` for form `defaultValues.billType`
   - Update `onOrderResetRef` to use the computed default

5. **Update `src/components/Billing/BillingModal.tsx`**
   - Import `getDefaultBillType`
   - Accept or derive business IVA condition
   - Use `getDefaultBillType(...)` for the disabled input value and description text
   - Pass correct billType to `createAfipVoucherAction`

---

## Running Tests

```bash
# Run all new tests
npm run test -- src/__tests__/utils/billing.test.ts src/__tests__/context/BillReducer-removeAll-default.test.ts src/__tests__/components/BillParametersForm-default-type.test.tsx src/__tests__/components/BillingModal-default-type.test.tsx

# Run with watch mode
npm run test -- --watch src/__tests__/utils/billing.test.ts
```

## Expected Before Implementation

All 25 tests should **FAIL** because:
- `src/utils/billing.ts` does not exist (module not found)
- `BillAction` type does not include `defaultBillType` on `removeAll`
- `BillParametersForm` hardcodes `BillTypes.C`
- `BillingModal` hardcodes `"Factura C"`

## Expected After Implementation

All 25 tests should **PASS**.
