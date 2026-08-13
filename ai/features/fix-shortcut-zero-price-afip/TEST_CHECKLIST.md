# TEST_CHECKLIST — fix-shortcut-zero-price-afip

> **Status:** Tests are intentionally FAILING at the time of writing (TDD red phase).
> The source `src/actions/afip.ts` has NOT been modified yet.
> Once the Developer implements the fix per `SPEC.md` §6, all tests should turn green.

## Gate G2

- [ ] The test file exists and compiles with TypeScript.
- [ ] All `afip-voucher.test.ts` tests pass after the fix in `src/actions/afip.ts`.
- [ ] The `src/actions/afip.ts` implementation is not modified by the QA agent.

## Acceptance Criteria Verification

| ID       | Criterion                                                                                                                                                                                                              | Test location                                                | Status |
|----------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|--------------------------------------------------------------|--------|
| **CA-01** | Shortcut product with confirmed `salePrice`: payload contains `price === salePrice` (not 0).                                                                                                                          | `tests/actions/afip-voucher.test.ts` → "CA-01"               | [ ] FAIL → expected green after fix |
| **CA-02** | Normal catalog product (`price === salePrice > 0`): payload contains `price === price` (no regression).                                                                                                                 | `tests/actions/afip-voucher.test.ts` → "CA-02"               | [x] PASS (no regression) |
| **CA-03** | Catalog product with `salePrice = 0` but `price > 0`: payload contains `price > 0` (fallback).                                                                                                                          | `tests/actions/afip-voucher.test.ts` → "CA-03"               | [x] PASS (existing behavior) |
| **CA-04** | Product with `price = 0, salePrice = 0, amount = 1` (E1): rejected locally, no HTTP call.                                                                                                                              | `tests/actions/afip-voucher.test.ts` → "CA-04"               | [ ] FAIL → expected green after fix |
| **CA-05** | `effectiveTotal === 0`: returns `{ error: "No se puede generar la factura: el monto total debe ser mayor a 0" }` and does NOT call the Cloud Function.                                                                  | `tests/actions/afip-voucher.test.ts` → "CA-05"               | [ ] FAIL → expected green after fix |
| **CA-06** | `effectiveTotal > 0`: Cloud Function is called normally.                                                                                                                                                               | `tests/actions/afip-voucher.test.ts` → "CA-06"               | [x] PASS (existing behavior) |
| **CA-07** | Credentials and `billState` structure are sent correctly (regression).                                                                                                                                                  | `tests/actions/afip-voucher.test.ts` → "CA-07"               | [x] PASS (existing behavior) |
| **CA-08** | Error message is in Spanish, no stack trace or AFIP raw error.                                                                                                                                                        | Verified by CA-05's literal string assertion                 | [ ] covered by CA-05 |
| **CA-09** | UI shows toast with the returned `error`.                                                                                                                                                                              | (UI test) `src/__tests__/components/BillButtons.test.tsx` (out of scope for this QA pass) | n/a (UI layer) |
| **CA-10** | No voucher is printed on error.                                                                                                                                                                                         | (UI test) existing toast flow                                | n/a (UI layer) |
| **CA-11** | Shortcut product without confirmed price: rejected locally, no AFIP call.                                                                                                                                               | Verified by CA-05 (salePrice=0 → effectiveTotal=0)           | [ ] covered by CA-05 |
| **CA-12** | Normal catalog products: no regression in payload.                                                                                                                                                                      | Verified by CA-02, CA-03, CA-07                               | [x] PASS |
| **CA-13** | Remito / Presupuesto / A cuenta: unaffected (out of scope; no changes).                                                                                                                                                  | (not modified by this fix)                                   | n/a (no change required) |
| **CA-14** | Existing UI validation in `BillButtons.tsx` is preserved (defense in depth).                                                                                                                                            | (not modified by this fix)                                   | n/a (no change required) |
| **CA-15** | `createAfipVoucherAction(billState: BillState)` signature unchanged.                                                                                                                                                   | Test file imports it without typing change                   | [x] PASS (signature preserved) |
| **CA-16** | `npm run lint` and `npx tsc --noEmit` pass.                                                                                                                                                                            | (run after implementation)                                   | [ ] pending implementation |

## Edge cases covered

| Edge | Description                                                                                                                       | Test location                                  | Status |
|------|-----------------------------------------------------------------------------------------------------------------------------------|------------------------------------------------|--------|
| E1   | `price=0, salePrice=0, amount=1` → rejected locally (no HTTP call).                                                                 | "CA-04"                                        | [ ] FAIL → expected green |
| E2   | `price=100, salePrice=0, amount=1` → sends `price=100` (rule not inverted).                                                          | "CA-03"                                        | [x] PASS |
| E3   | `price=0, salePrice=50.5, amount=2` → sends `price=50.5`, `effectiveTotal=101`.                                                      | "CA-01"                                        | [ ] FAIL → expected green |
| E4   | Discount wipes the total: `total=100, totalWithDiscount=0` → rejected locally.                                                       | "Edge: cuando un descuento…"                   | [ ] FAIL → expected green |
| E5   | `products.length === 0` → `effectiveTotal=0` → rejected (covered indirectly by CA-05 with all-zero products).                       | "CA-05"                                        | [ ] FAIL → expected green |
| E6   | `NaN` / negative / `undefined` in `salePrice`: protected by `Number.isFinite()` and `> 0` checks (covered by helper design).        | (not explicitly tested; design property)       | n/a (helper contract) |
| E7   | Negative `amount`: `Math.max(0, …)` guard.                                                                                          | (not explicitly tested; design property)       | n/a (helper contract) |
| E8   | Total validation runs AFTER `requireFeature` and `getArcaCredentialsForBilling`, BEFORE HTTP call.                                  | implicit order in "CA-05" + "CA-06" ordering   | [x] PASS (assertion order) |

## Mix of products

| Scenario | Description                                                                          | Test location | Status |
|----------|--------------------------------------------------------------------------------------|---------------|--------|
| Mix      | Shortcut + catalog in same bill; each product uses its own effective price.            | "Edge: mezcla de productos" | [ ] FAIL → expected green |

## Test file summary

| File                                             | Tests | Status at writing time |
|--------------------------------------------------|-------|------------------------|
| `tests/actions/afip-voucher.test.ts`              | 9     | 4 pass / 5 fail (TDD red phase — failures are the expected TDD signal) |

## How to run

```bash
# Run only the AFIP voucher fix tests
npm run test -- tests/actions/afip-voucher.test.ts

# Run the full test suite
npm run test

# Type check
npx tsc --noEmit

# Lint
npm run lint
```

## Mocks used

- `axios` — mocked `axios.post` via `vi.mock("axios", ...)` and a `vi.fn()` for `mockAxiosPost`.
- `@/lib/auth-gates` — mocked `requireFeature` to return `{ success: true }`.
- `@/actions/arca` — mocked `getArcaCredentialsForBilling` to return valid credentials.
- `process.env.AFIP_SDK_ACCESS_TOKEN` and `process.env.INTERNAL_AFIP_API_KEY` — set in `beforeEach` and cleared in `afterEach`.

## Notes

- The test fixtures intentionally do NOT exhaust the `Product` class shape (only the fields read by the action). They are cast to `BillState` via the `asBillState` helper.
- All test descriptions are in Spanish to match project convention.
- The 4 tests that pass without the fix (CA-02, CA-03, CA-06, CA-07) serve as **regression guards**: after the fix, they must continue to pass.
- The 5 tests that fail without the fix are the **new behavior** introduced by this PR; they encode the requirements of SPEC §3.1 and §3.2.
