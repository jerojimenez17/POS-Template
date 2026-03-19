# Billing Fields for Orders - Specification

## 1. Overview

**Feature**: Add billing fields to the Order model to persist client billing information (IVA condition, document number, CAE) from sales.

**Current State**:
- `BillState` interface already contains: `typeDocument`, `documentNumber`, `IVACondition`, `CAE`
- `BillParametersForm` collects: `clientCondition`, `documentNumber` via form
- `ProcessSaleInput` in `processSaleAction` does not receive these billing fields
- `Order` model in Prisma lacks billing fields

**Goal**: Persist client billing information with each order.

---

## 2. Requirements

### 2.1 Functional Requirements

| ID | Requirement |
|----|-------------|
| FR-001 | Add `clientIvaCondition` to Order model (stores IVA condition: "Consumidor Final", "CUIT", "DNI") |
| FR-002 | Add `clientDocumentNumber` to Order model (stores document number string) |
| FR-003 | Add `CAE` (optional) to Order model (stores CAE object with CAE number, expiry, nroComprobante, qrData) |
| FR-004 | Update `ProcessSaleInput` interface to include billing fields |
| FR-005 | Update `processSaleAction` to save billing fields to database |
| FR-006 | Update `getSalesAction` to return billing fields |
| FR-007 | Update `getSaleByIdAction` to return billing fields |
| FR-008 | Update `BillParametersForm` to pass billing fields to `processSaleAction` |

### 2.2 Data Flow

```
BillParametersForm
    ↓ (form submission)
BillContext.setState({ ..., clientIvaCondition, clientDocumentNumber, CAE })
    ↓ (onConfirmSale)
processSaleAction(ProcessSaleInput with billing fields)
    ↓ (db.$transaction)
tx.order.create({ ..., clientIvaCondition, clientDocumentNumber, CAE })
```

---

## 3. Data Models

### 3.1 Prisma Schema Changes

**File**: `prisma/schema.prisma`

```prisma
model Order {
  // ... existing fields ...

  // Billing fields
  clientIvaCondition   String?
  clientDocumentNumber String?
  CAE                  Json? // { cae: string, vencimiento: string, nroComprobante: number, qrData: string }
}
```

### 3.2 ProcessSaleInput Interface

**File**: `src/actions/sales.ts`

```typescript
interface ProcessSaleInput {
  // ... existing fields ...
  clientIvaCondition?: string;
  clientDocumentNumber?: string;
  CAE?: {
    CAE: string;
    vencimiento: string;
    nroComprobante: number;
    qrData: string;
  };
}
```

### 3.3 BillState Interface (No Changes Required)

**File**: `src/models/BillState.ts`

The interface already has:
- `typeDocument: string`
- `documentNumber: number`
- `IVACondition: string`
- `CAE?: CAE`

---

## 4. Implementation Plan

### 4.1 Step 1: Database Migration

1. Add fields to `prisma/schema.prisma`:
   - `clientIvaCondition String?`
   - `clientDocumentNumber String?`
   - `CAE Json?`

2. Run migration:
   ```bash
   npx prisma generate
   npx prisma db push
   ```

### 4.2 Step 2: Update Actions (`src/actions/sales.ts`)

1. **ProcessSaleInput**: Add optional billing fields
2. **processSaleAction**: Include billing fields in `tx.order.create()`
3. **getSalesAction**: Map billing fields from Order to BillState
4. **getSaleByIdAction**: Map billing fields from Order to BillState

### 4.3 Step 3: Update BillParametersForm

**File**: `src/components/Billing/BillParametersForm.tsx`

In `onSubmit`, add to `setState()`:
```typescript
setState({
  ...form.getValues(),
  // ... existing fields ...
  typeDocument: clientCondition,
  documentNumber,
  IVACondition: clientCondition,
  clientIvaCondition: clientCondition,
  clientDocumentNumber: String(documentNumber),
});
```

---

## 5. File Structure

```
prisma/
└── schema.prisma                    # Add: clientIvaCondition, clientDocumentNumber, CAE

src/
├── actions/
│   └── sales.ts                     # Update: ProcessSaleInput, processSaleAction, getSalesAction, getSaleByIdAction
├── components/
│   └── Billing/
│       └── BillParametersForm.tsx  # Update: pass billing fields to context
├── models/
│   └── BillState.ts                 # No changes (already has typeDocument, documentNumber, IVACondition, CAE)
```

---

## 6. Acceptance Criteria

| ID | Criteria | Verification |
|----|----------|--------------|
| AC-001 | Order records created via `processSaleAction` contain billing fields when provided | Query database after sale |
| AC-002 | `getSalesAction` returns orders with `typeDocument`, `documentNumber`, `IVACondition` populated from Order | Check response |
| AC-003 | `getSaleByIdAction` returns order with billing fields populated | Check response |
| AC-004 | CAE field is optional (not required for all sales) | Create sale without CAE |
| AC-005 | TypeScript compilation succeeds | `npm run build` |
| AC-006 | ESLint passes | `npm run lint` |

---

## 7. Backward Compatibility

- New fields are optional (`?`)
- Existing orders will have `null` for billing fields
- `getSalesAction` and `getSaleByIdAction` map missing fields to default values: `"Consumidor Final"`, `0`

---

## 8. Future Considerations

- Consider adding ARCA API integration to auto-fetch CAE during sale confirmation
- Consider storing CAE separately if multiple CAE numbers per order are needed
