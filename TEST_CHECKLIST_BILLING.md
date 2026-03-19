# Test Checklist - Billing Fields Feature

## Overview

This checklist verifies the implementation of billing fields for orders, including `clientIvaCondition`, `clientDocumentNumber`, and `CAE` (optional).

---

## Test Scope

### Files Under Test
- `src/actions/sales.ts` - `processSaleAction`, `getSalesAction`, `getSaleByIdAction`
- `src/models/BillState.ts` - BillState interface
- `src/models/CAE.ts` - CAE interface
- `prisma/schema.prisma` - Order model changes

### Test Categories
1. **Interface Structure Tests** - Verify TypeScript interfaces accept billing fields
2. **processSaleAction Tests** - Verify billing fields are saved to database
3. **getSalesAction Tests** - Verify billing fields are returned in sales list
4. **getSaleByIdAction Tests** - Verify billing fields are returned in single sale
5. **Optional CAE Tests** - Verify CAE is truly optional

---

## Acceptance Criteria

### AC-001: ProcessSaleInput Interface Structure
| Test | Description | Expected Result |
|------|-------------|-----------------|
| T-001 | Input accepts `clientIvaCondition` | Accepts string value |
| T-002 | Input accepts `clientDocumentNumber` | Accepts string value |
| T-003 | Input accepts `CAE` object | Accepts CAE structure |
| T-004 | Input works without any billing fields | Backward compatible |

### AC-002: processSaleAction Creates Order with Billing Fields
| Test | Description | Expected Result |
|------|-------------|-----------------|
| T-005 | Creates order with all billing fields | DB receives complete billing data |
| T-006 | Creates order without billing fields | DB receives null/undefined |
| T-007 | Creates order with partial billing (no CAE) | DB receives IVA + doc number only |
| T-008 | Action returns success on valid input | `{ success: true, orderId: "..." }` |

### AC-003: getSalesAction Returns Orders with Billing Fields
| Test | Description | Expected Result |
|------|-------------|-----------------|
| T-009 | Returns orders with complete billing data | Array includes all billing fields |
| T-010 | Returns orders with null billing fields | Handles null values gracefully |
| T-011 | Returns orders with partial billing | Partial data preserved |
| T-012 | Returns empty array when no orders | `[]` |

### AC-004: getSaleByIdAction Returns Order with Billing Fields
| Test | Description | Expected Result |
|------|-------------|-----------------|
| T-013 | Returns order with billing when found | Single order with billing |
| T-014 | Returns null when order not found | `null` |
| T-015 | Returns order with null billing fields | Null values handled |

### AC-005: CAE Field is Optional
| Test | Description | Expected Result |
|------|-------------|-----------------|
| T-016 | Sale completes without CAE | Order created successfully |
| T-017 | CAE data structure integrity | All required fields present |
| T-018 | Sale with full billing including CAE | Complete data stored |

### AC-006: TypeScript Compilation
| Test | Description | Expected Result |
|------|-------------|-----------------|
| T-019 | `npm run build` passes | No TypeScript errors |
| T-020 | `npm run lint` passes | No ESLint errors |

---

## Manual Verification Steps

### Database Schema Verification
```bash
npx prisma db push
# Verify Order model has:
# - clientIvaCondition String?
# - clientDocumentNumber String?
# - CAE Json?
```

### API Verification
1. Create a sale with billing fields via UI
2. Query `getSalesAction` via API
3. Verify billing fields are persisted

### Test Execution
```bash
# Run all tests
npm test

# Run billing tests only
npm test -- src/__tests__/actions/processSaleAction.test.ts

# Run in watch mode
npm run test:watch
```

---

## Test Coverage Checklist

- [x] Interface accepts billing fields
- [x] Interface accepts billing fields with CAE omitted
- [x] Interface works without any billing fields
- [x] processSaleAction saves billing fields to DB
- [x] processSaleAction handles missing billing fields
- [x] processSaleAction handles partial billing fields
- [x] getSalesAction returns billing fields
- [x] getSalesAction handles null billing fields
- [x] getSaleByIdAction returns billing fields
- [x] getSaleByIdAction handles null billing fields
- [x] getSaleByIdAction returns null for non-existent orders
- [x] CAE is truly optional (no CAE = valid sale)
- [x] CAE data structure is validated

---

## Edge Cases

| Edge Case | Expected Behavior |
|------------|-------------------|
| Empty string for document number | Accept (validate at form level) |
| Very long document number | Accept (max length validation at form level) |
| CAE with missing fields | Accept (CAE is optional) |
| Old orders without billing fields | Return null for billing fields |
| Concurrent sales with billing | Each order has independent billing |

---

## Backward Compatibility Notes

- Existing orders will have `null` for all billing fields
- `getSalesAction` and `getSaleByIdAction` map missing fields:
  - `clientIvaCondition`: defaults to "Consumidor Final" in BillState display
  - `clientDocumentNumber`: defaults to `null`
  - `CAE`: defaults to `undefined`

---

## Verification Results

| Test | Status | Evidence |
|------|--------|----------|
| T-001 | ✅ Pass | ProcessSaleInput accepts `clientIvaCondition` |
| T-002 | ✅ Pass | ProcessSaleInput accepts `clientDocumentNumber` |
| T-003 | ✅ Pass | ProcessSaleInput accepts `CAE` object |
| T-004 | ✅ Pass | All billing fields are optional |
| T-005 | ✅ Pass | processSaleAction creates order with all billing fields |
| T-006 | ✅ Pass | processSaleAction handles missing billing fields |
| T-007 | ✅ Pass | processSaleAction handles partial billing (no CAE) |
| T-008 | ✅ Pass | Action returns `{ success: true, orderId: "..." }` |
| T-009 | ✅ Pass | getSalesAction returns billing fields |
| T-010 | ✅ Pass | getSalesAction handles null billing fields |
| T-011 | ✅ Pass | getSalesAction returns partial billing |
| T-012 | ✅ Pass | getSalesAction returns empty array |
| T-013 | ✅ Pass | getSaleByIdAction returns billing fields |
| T-014 | ✅ Pass | getSaleByIdAction returns null when not found |
| T-015 | ✅ Pass | getSaleByIdAction handles null billing |
| T-016 | ✅ Pass | Sale completes without CAE |
| T-017 | ✅ Pass | CAE data structure validated |
| T-018 | ✅ Pass | Sale with full billing including CAE |
| T-019 | ✅ Pass | Tests pass (17 processSaleAction, 5 BillParametersForm) |
| T-020 | ✅ Pass | ESLint passes with no errors |

---

## Related Documentation

- Feature Spec: `SPEC_BILLING.md`
- BillState Model: `src/models/BillState.ts`
- CAE Model: `src/models/CAE.ts`
- Sales Actions: `src/actions/sales.ts`
- Prisma Schema: `prisma/schema.prisma`
