# SPEC.md — Default Invoice Type by Business IVA Condition

## Feature Name
`default-invoice-type-by-iva-condition`

## Goal
Automatically set the default invoice type (Factura B or Factura C) based on the business's IVA condition (condición impositiva). When a business is "Responsable Inscripto", the default invoice type should be "Factura B". When a business is "Monotributo", the default should be "Factura C". This default is a preselection — users can still manually choose other invoice types.

---

## Background

Currently, the invoice type defaults to "Factura C" in all three places where it's initialized:
1. **BillParametersForm** — hardcoded `billType: BillTypes.C` (line 41)
2. **BillReducer** — hardcoded `billType: "Factura C"` in the `removeAll` case (line 104)
3. **BillingModal** — hardcoded `value="Factura C"` for existing sales (line 140)

This is incorrect for businesses with "Responsable Inscripto" status, which should default to "Factura B" per Argentine tax regulations (AFIP/ARCA). The business's IVA condition is stored in the `Business` model as `condicionIva: IvaCondition` (enum values: `RESPONSABLE_INSCRIPTO`, `MONOTRIBUTO`).

### Argentine Tax Context
- **Monotributo** → Emits **Factura C** (to consumers and other monotributistas)
- **Responsable Inscripto** → Emits **Factura B** (to consumers/monotributistas) or **Factura A** (to other responsables inscriptos)

The default should reflect the most common case for each business type.

---

## Requirements

### R1: Default Invoice Type Mapping
The default invoice type must be determined by the following mapping:

| Business `condicionIva` | Default `billType` |
|--------------------------|---------------------|
| `RESPONSABLE_INSCRIPTO` | `BillTypes.B` ("Factura B") |
| `MONOTRIBUTO` | `BillTypes.C` ("Factura C") |

### R2: Apply Default in BillParametersForm
- The form's `defaultValues.billType` must be dynamically set based on the business's IVA condition.
- The business data must be fetched from `getBusinessBillingInfoAction()` (which returns `condicionIva`).
- The default must also be applied in the `onOrderResetRef.current` reset function (line 90).

### R3: Apply Default in BillReducer `removeAll`
- The `removeAll` case (line 104) must reset `billType` to the correct default based on business IVA condition.
- **Challenge:** The reducer is a pure function with no access to business context. The reducer must receive the default bill type via the action payload or the state must carry this information.

### R4: Apply Default in BillingModal
- The `BillingModal` must display the correct default invoice type instead of hardcoded "Factura C".
- The business data must be fetched via `getBusinessBillingInfoAction()`.
- The disabled input must show the appropriate default: "Factura B" or "Factura C".

### R5: User Can Override Default
- The default is a **preselection**, not a constraint.
- Users must be able to manually select any invoice type (A, B, or C) from the dropdown.
- The BillParametersForm already allows this via the `<Select>` component for `billType`.

### R6: Default Applies to CAE/AFIP Invoicing
- The default invoice type affects the AFIP voucher generation flow.
- When the user generates a CAE, the selected invoice type is sent to `createAfipVoucherAction()`.
- The BillingModal handles this for existing sales.

### R7: Fallback Behavior
- If business data cannot be fetched (network error, null business, missing `condicionIva`), default to `"Factura C"` (current behavior).
- This ensures backward compatibility and prevents broken UI.

### R8: No Breaking Changes
- Existing functionality must continue to work.
- Users who currently select "Factura C" manually are unaffected.
- The change is additive — it only changes the initial/default selection.

---

## Technical Design

### 1. Utility Function: `getDefaultBillType`

Create a utility function that encapsulates the mapping logic:

```typescript
// src/utils/billing.ts (new file)
import { IvaCondition } from "@prisma/client";
import BillTypes from "@/models/billType";

/**
 * Returns the default invoice type based on the business's IVA condition.
 * 
 * - RESPONSABLE_INSCRIPTO → Factura B
 * - MONOTRIBUTO → Factura C
 * - Unknown/null → Factura C (safe fallback)
 */
export function getDefaultBillType(condicionIva?: IvaCondition | null): string {
  if (condicionIva === "RESPONSABLE_INSCRIPTO") {
    return BillTypes.B;
  }
  return BillTypes.C; // Default for MONOTRIBUTO and any unknown/null value
}
```

**Why a utility function?**
- Single source of truth for the mapping logic.
- Easy to unit test independently.
- If the mapping changes (e.g., add new IVA conditions), only one place needs updating.
- Can be imported by any component or reducer that needs the default.

### 2. Modify BillParametersForm

**File:** `src/components/Billing/BillParametersForm.tsx`

**Changes:**

a. **Import** `getBusinessBillingInfoAction` and `getDefaultBillType`:
```typescript
import { getBusinessBillingInfoAction } from "@/actions/business";
import { getDefaultBillType } from "@/utils/billing";
```

b. **Add state** to hold the business IVA condition:
```typescript
const [businessIvaCondition, setBusinessIvaCondition] = useState<IvaCondition | null>(null);
```

c. **Fetch business data** in a `useEffect`:
```typescript
useEffect(() => {
  const fetchBusinessInfo = async () => {
    const info = await getBusinessBillingInfoAction();
    if (info?.condicionIva) {
      setBusinessIvaCondition(info.condicionIva);
    }
  };
  fetchBusinessInfo();
}, []);
```

d. **Update form defaultValues** to use dynamic default:
```typescript
const form = useForm<z.infer<typeof BillParametersSchema>>({
  resolver: zodResolver(BillParametersSchema),
  defaultValues: {
    paidMethod: PaidMethods.EFECTIVO,
    clientCondition: ClientConditions.CONSUMIDOR_FINAL,
    discount: 0,
    twoMethods: false,
    billType: getDefaultBillType(businessIvaCondition), // Dynamic
    totalSecondMethod: 0,
    secondPaidMethod: PaidMethods.DEBITO,
    ptoVenta: ptoVentas.length > 0 ? ptoVentas[0] : undefined,
  },
});
```

e. **Update the `onOrderResetRef` reset** to use dynamic default:
```typescript
useEffect(() => {
  onOrderResetRef.current = () => {
    form.reset({
      paidMethod: PaidMethods.EFECTIVO,
      clientCondition: ClientConditions.CONSUMIDOR_FINAL,
      discount: 0,
      twoMethods: false,
      billType: getDefaultBillType(businessIvaCondition), // Dynamic
      totalSecondMethod: 0,
      secondPaidMethod: PaidMethods.DEBITO,
      ptoVenta: ptoVentas.length > 0 ? ptoVentas[0] : undefined,
    });
    setEditParameters(false);
  };
}, [form, onOrderResetRef, businessIvaCondition]);
```

**Note:** The `useEffect` dependency array must include `businessIvaCondition` to ensure the reset function uses the latest value.

### 3. Modify BillReducer `removeAll` Case

**File:** `src/context/BillReducer.ts`

**Challenge:** The reducer is a pure function with no access to business context. There are two approaches:

#### Approach A: Pass default via action payload (Recommended)
Modify the `removeAll` action to carry the default bill type:

**File:** `src/context/billActions.ts`
```typescript
// Change from:
| { type: "removeAll"; payload: null }
// To:
| { type: "removeAll"; payload: { defaultBillType: string } }
```

**File:** `src/context/BillReducer.ts` (line 99-116)
```typescript
case "removeAll":
  return {
    ...state,
    products: [],
    documentNumber: 0,
    billType: action.payload.defaultBillType, // Use payload instead of hardcoded
    IVACondition: "Consumidor Final",
    nroAsociado: 0,
    total: 0,
    date: new Date(),
    paidMethod: "Efectivo",
    totalWithDiscount: 0,
    pago: false,
    entrega: 0,
    discount: 0,
    typeDocument: "",
    CAE: { CAE: "", nroComprobante: 0, vencimiento: "", qrData: "" },
  };
```

**Callers of `removeAll`:** Find all places that dispatch `{ type: "removeAll", payload: null }` and update them to pass the default bill type. These callers should fetch the business IVA condition or receive it from context.

#### Approach B: Store default in BillState (Alternative)
Add a `defaultBillType` field to `BillState` that is set once when the business loads:

**File:** `src/models/BillState.ts`
```typescript
export default interface BillState {
  // ... existing fields
  defaultBillType?: string; // New field
}
```

This approach is more invasive and changes the BillState interface, which affects many components. **Approach A is preferred** because it's more explicit and doesn't pollute the state model.

### 4. Modify BillingModal

**File:** `src/components/Billing/BillingModal.tsx`

**Changes:**

a. **Import** `getBusinessBillingInfoAction` and `getDefaultBillType`:
```typescript
import { getBusinessBillingInfoAction } from "@/actions/business";
import { getDefaultBillType } from "@/utils/billing";
```

b. **Add state** for business IVA condition:
```typescript
const [businessIvaCondition, setBusinessIvaCondition] = useState<IvaCondition | null>(null);
```

c. **Fetch business data** in a `useEffect`:
```typescript
useEffect(() => {
  const fetchBusinessInfo = async () => {
    const info = await getBusinessBillingInfoAction();
    if (info?.condicionIva) {
      setBusinessIvaCondition(info.condicionIva);
    }
  };
  fetchBusinessInfo();
}, []);
```

d. **Update the disabled input** to show dynamic default:
```typescript
// Change from:
<Input
  disabled
  value="Factura C"
  className="col-span-3 border-gray-300"
/>
// To:
<Input
  disabled
  value={getDefaultBillType(businessIvaCondition)}
  className="col-span-3 border-gray-300"
/>
```

e. **Update the dialog description** to be dynamic:
```typescript
// Change from:
<DialogDescription>
  Genere una Factura C para esta venta existente.
</DialogDescription>
// To:
<DialogDescription>
  Genere una {getDefaultBillType(businessIvaCondition)} para esta venta existente.
</DialogDescription>
```

### 5. File Structure

| Action | File | Description |
|--------|------|-------------|
| **CREATE** | `src/utils/billing.ts` | `getDefaultBillType()` utility function |
| **MODIFY** | `src/components/Billing/BillParametersForm.tsx` | Dynamic default based on business IVA condition |
| **MODIFY** | `src/context/BillReducer.ts` | `removeAll` case uses payload for default bill type |
| **MODIFY** | `src/context/billActions.ts` | `removeAll` action carries `defaultBillType` payload |
| **MODIFY** | `src/components/Billing/BillingModal.tsx` | Dynamic default for existing sales |
| **MODIFY** | Callers of `removeAll` action | Pass `defaultBillType` in payload |

---

## Acceptance Criteria

### AC-01: Monotributo business defaults to Factura C
- **Given** a business with `condicionIva: "MONOTRIBUTO"`
- **When** the BillParametersForm loads
- **Then** the `billType` field defaults to `"Factura C"`
- **Verification:** Unit test `getDefaultBillType("MONOTRIBUTO")` returns `"Factura C"`; visual test confirms "Factura C" is pre-selected in the dropdown

### AC-02: Responsable Inscripto business defaults to Factura B
- **Given** a business with `condicionIva: "RESPONSABLE_INSCRIPTO"`
- **When** the BillParametersForm loads
- **Then** the `billType` field defaults to `"Factura B"`
- **Verification:** Unit test `getDefaultBillType("RESPONSABLE_INSCRIPTO")` returns `"Factura B"`; visual test confirms "Factura B" is pre-selected in the dropdown

### AC-03: User can override the default
- **Given** a business with `condicionIva: "MONOTRIBUTO"` (default: Factura C)
- **When** the user opens the bill type dropdown and selects "Factura B"
- **Then** the invoice type changes to "Factura B" and the form submits with that value
- **Verification:** Manual test: select different invoice type → confirm it's used in the submission

### AC-04: BillReducer resets to correct default
- **Given** a business with `condicionIva: "RESPONSABLE_INSCRIPTO"`
- **When** a sale completes and the reducer dispatches `removeAll`
- **Then** the state resets with `billType: "Factura B"`
- **Verification:** Unit test or integration test that dispatches `removeAll` with `defaultBillType: "Factura B"` and confirms the state resets correctly

### AC-05: BillingModal shows correct default for existing sales
- **Given** a business with `condicionIva: "RESPONSABLE_INSCRIPTO"`
- **When** the BillingModal opens for an existing sale
- **Then** the disabled invoice type input shows "Factura B"
- **Verification:** Visual test confirms the modal displays "Factura B" instead of "Factura C"

### AC-06: Fallback to Factura C when business data is unavailable
- **Given** a business where `getBusinessBillingInfoAction()` returns `null` or `condicionIva` is undefined
- **When** the BillParametersForm loads
- **Then** the `billType` field defaults to `"Factura C"` (safe fallback)
- **Verification:** Unit test `getDefaultBillType(null)` returns `"Factura C"`; `getDefaultBillType(undefined)` returns `"Factura C"`

### AC-07: No regressions on existing billing flow
- **Given** any business
- **When** creating a new bill, selecting products, choosing payment method, and submitting
- **Then** the entire billing flow works identically to before — only the default selection changes
- **Verification:** Existing tests pass; manual end-to-end test of complete billing flow

### AC-08: Default is applied on form reset after sale
- **Given** a business with `condicionIva: "MONOTRIBUTO"`
- **When** a sale completes and `onOrderResetRef.current()` is called
- **Then** the form resets with `billType: "Factura C"`
- **Verification:** Unit test or integration test that calls the reset function and confirms the form resets to the correct default

### AC-09: AFIP voucher generation uses correct invoice type
- **Given** a business with `condicionIva: "RESPONSABLE_INSCRIPTO"` and the user selects "Factura B" (either default or manual)
- **When** the user clicks "Facturar" in the BillingModal
- **Then** `createAfipVoucherAction()` receives a BillState with `billType: "Factura B"`
- **Verification:** Integration test or manual test: generate a CAE → confirm the AFIP request uses the correct invoice type

---

## Edge Cases

| # | Case | Expected Behavior |
|---|------|-------------------|
| 1 | **Business is `null` or not authenticated** | `getBusinessBillingInfoAction()` returns `null`. `getDefaultBillType(null)` returns `"Factura C"` (fallback). No errors thrown. |
| 2 | **Business has `condicionIva` as `null` or `undefined`** | Prisma enum field with `@default(MONOTRIBUTO)` — should never be null in practice. If it is, `getDefaultBillType(null)` returns `"Factura C"`. |
| 3 | **Network error fetching business info** | `getBusinessBillingInfoAction()` catches errors and returns `null`. Fallback to `"Factura C"`. Form loads normally. |
| 4 | **Business IVA condition changes after initial load** | The form was already initialized with the old default. This is acceptable — the user can manually change the selection. A page refresh would pick up the new default. |
| 5 | **BillingModal opens before business data is fetched** | The input momentarily shows "Factura C" (the initial state), then updates to the correct default. This is a minor flash — acceptable for an admin-facing modal. |
| 6 | **User has already selected a different invoice type and resets the form** | The reset uses the business-based default, overriding the user's manual selection. This is correct behavior — reset means "start fresh." |
| 7 | **BillType A (Factura A) is never the default** | Correct — Factura A is only used when both the business AND the client are Responsable Inscripto. It's not a sensible default for any business type. |
| 8 | **Multiple businesses in the same session** | Each business has its own `condicionIva`. The business info is fetched per-session via `getBusinessBillingInfoAction()` (which uses the authenticated user's `businessId`). No cross-business contamination. |
| 9 | **BillReducer `removeAll` dispatched before business info is loaded** | The `defaultBillType` payload must be provided by the caller. Callers should ensure business info is available before dispatching. If not, they should pass `"Factura C"` as fallback. |
| 10 | **TypeScript strict mode** | All types must be explicit. `getDefaultBillType` accepts `IvaCondition | null | undefined` and returns `string`. No `any` types introduced. |

---

## Dependencies

No new npm packages required. The feature uses:
- `getBusinessBillingInfoAction()` — existing server action
- `@prisma/client` — `IvaCondition` type (already generated)
- `@/models/billType` — `BillTypes` enum (existing)

---

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Reducer `removeAll` change breaks callers | Medium — could break sale completion flow | Find all callers and update them; add fallback default of `"Factura C"` in each caller |
| Business data fetch adds latency to form load | Low — `getBusinessBillingInfoAction` is a lightweight query | The form already has loading states; the default fetch runs in parallel with other init |
| BillingModal flash of wrong default | Low — brief visual inconsistency | Acceptable for admin modal; could add a loading skeleton if needed in future |
| IvaCondition enum adds new values in future | Low — mapping would need updating | `getDefaultBillType` defaults to `"Factura C"` for unknown values, so no breakage |

---

## Testing Strategy

### Unit Tests
1. `getDefaultBillType("RESPONSABLE_INSCRIPTO")` → `"Factura B"`
2. `getDefaultBillType("MONOTRIBUTO")` → `"Factura C"`
3. `getDefaultBillType(null)` → `"Factura C"`
4. `getDefaultBillType(undefined)` → `"Factura C"`

### Integration Tests
1. BillParametersForm renders with correct default for each business type
2. BillReducer `removeAll` resets to correct default when payload is provided
3. BillingModal displays correct invoice type for each business type

### Manual Tests
1. Login as Monotributo business → open new bill → confirm "Factura C" is default
2. Login as Responsable Inscripto business → open new bill → confirm "Factura B" is default
3. Change invoice type manually → confirm selection is respected
4. Complete a sale → confirm form resets to correct default
5. Open BillingModal for existing sale → confirm correct invoice type shown
6. Generate CAE → confirm correct invoice type is sent to AFIP
