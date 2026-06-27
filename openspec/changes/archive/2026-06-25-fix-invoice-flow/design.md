# Design: FR-001 — Fix Invoice Flow Data Corruption

## Technical Approach

Three-layer defense against data corruption when AFIP billing feature is disabled: (1) client abort in `createSale()` after null CAE, (2) server-side conditional gate in `processSaleAction()`, (3) fix feature name `"hasBilling"` → `"hasAfipBilling"` in `createAfipVoucherAction`. Layers 1+2 prevent the write entirely; layer 3 unblocks legit AFIP users.

---

## Sequence Diagrams

### Scenario A: Facturar — Feature Disabled (abort)

```
[Facturar click] → [CheckoutModal → onConfirm → createSale(true)]
    ↓
handleCreateVoucher() → createAfipVoucherAction
    → requireFeature("hasAfipBilling") → FAIL
    → returns { error } → handleCreateVoucher returns null
    ↓
createSale: afip=true, caeData=null
    → if (afip && !caeData) → setOpenFeatureBlockedModal(true)
    → setBlockButton(false) → return undefined  ← ABORT
    ↓
[CheckoutModal sees !caeResult → close win, setBlockButton(false)]
    → NO DB WRITE, cart intact, stock unchanged
```

### Scenario B: Facturar — Feature Enabled (success)

```
[Facturar click] → [CheckoutModal → onConfirm → createSale(true)]
    ↓
handleCreateVoucher() → createAfipVoucherAction
    → requireFeature("hasAfipBilling") → PASS
    → AFIP API → returns CAE data
    ↓
createSale: caeData={CAE, nroComprobante, ...}
    → handleSaveSale({...BillState, CAE: caeData})
    → processSaleAction(billState with CAE)
        → requireFeature("hasAfipBilling") → PASS (gate condition)
        → db.$transaction → order + stock + movements
    → toast success → print → clear cart
```

### Scenario E: Remito — Feature Disabled (gate skipped)

```
[Remito click] → [CheckoutModal → onConfirm → createSale(false)]
    ↓
afip=false → skip handleCreateVoucher entirely
    ↓
handleSaveSale({...BillState, CAE: null})
    → processSaleAction(billState without CAE)
        → billState.CAE falsy → SKIP feature gate
        → db.$transaction → order + stock + movements
    → toast success → print → clear cart
```

---

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `src/components/Billing/BillButtons.tsx` | Modify | Add null-check + block modal in `createSale()`; add `openFeatureBlockedModal` state + Dialog |
| `src/actions/sales/process.ts` | Modify | Add conditional `requireFeature("hasAfipBilling")` gate before `$transaction` when CAE present |
| `src/actions/afip.ts` | Modify | Change `requireFeature("hasBilling")` → `requireFeature("hasAfipBilling")` (line 13) |
| `src/__tests__/actions/processSaleAction.test.ts` | Modify | Add 3 unit tests for server gate scenarios |
| `src/__tests__/components/BillButtons.test.tsx` | Create | New component tests for client abort (2 scenarios) |
| `tests/actions/security.test.ts` | Modify | Fix `hasBilling` → `hasAfipBilling` in existing mock (line 146) |

---

## Component Changes

### BillButtons.tsx — createSale() modification

After `handleCreateVoucher()` (line 242), add abort guard:

```typescript
if (afip && !caeData) {
  setOpenFeatureBlockedModal(true);
  setBlockButton(false);
  return undefined; // ABORT — no DB write
}
```

### BillButtons.tsx — New modal state

```typescript
const [openFeatureBlockedModal, setOpenFeatureBlockedModal] = useState(false);
```

Inline Dialog (no `DialogHeader`, no `DialogDescription`, just `DialogTitle`):

```tsx
<Dialog open={openFeatureBlockedModal} onOpenChange={setOpenFeatureBlockedModal}>
  <DialogContent className="sm:max-w-md">
    <div className="flex flex-col items-center text-center gap-4 py-4">
      <div className="h-14 w-14 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
        <Lock className="h-7 w-7 text-red-500" />
      </div>
      <DialogTitle className="text-lg font-semibold">Funcionalidad no disponible</DialogTitle>
      <p className="text-sm text-muted-foreground">
        Esta funcionalidad no está incluida en tu plan actual.
      </p>
      <p className="text-xs text-muted-foreground">
        Contactanos vía WhatsApp para activarlo.
      </p>
      <div className="flex flex-col gap-2 w-full mt-2">
        <a
          href="https://wa.me/5492265418113"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium text-white"
          style={{ backgroundColor: "#25D366" }}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
          Contactar por WhatsApp
        </a>
        <Button variant="outline" className="rounded-lg" onClick={() => setOpenFeatureBlockedModal(false)}>
          Entendido
        </Button>
      </div>
    </div>
  </DialogContent>
</Dialog>
```

### processSaleAction — feature gate

```typescript
// After businessId check, before try block
if (billState.CAE) {
  const { requireFeature } = await import("@/lib/auth-gates");
  const featureCheck = await requireFeature("hasAfipBilling");
  if (!featureCheck.success) {
    return { error: featureCheck.error || "Facturación AFIP no disponible" };
  }
}
```

### createAfipVoucherAction — fix feature name (line 13)

```typescript
// BEFORE: const featureResult = await requireFeature("hasBilling");
// AFTER:
const featureResult = await requireFeature("hasAfipBilling");
```

---

## Data Flow

```
[Facturar click]
    ↓
[CheckoutModal → onConfirm → createSale(true)]
    ↓
[handleCreateVoucher() → createAfipVoucherAction]
    ├── requireFeature("hasAfipBilling") ← FIXED NAME
    │   ├── FAIL → return error → handleCreateVoucher returns null
    │   │   → createSale: afip && !caeData → ABORT → feature blocked modal
    │   └── PASS → create AFIP voucher → returns CAE data
    │       → createSale continues → handleSaveSale({...BillState, CAE})
    ↓
[handleSaveSale → processSaleAction(billState)]
    ├── if (billState.CAE) → requireFeature("hasAfipBilling")
    │   ├── FAIL → return { error } → NO DB writes
    │   └── PASS → continue to db.$transaction
    └── if (!billState.CAE) → skip gate → continue to db.$transaction
```

---

## Architecture Decisions

| Decision | Option | Chosen | Rationale |
|----------|--------|--------|-----------|
| Gate type in `processSaleAction` | Unconditional vs Conditional on CAE | Conditional on CAE | Remitos (no CAE) must not be blocked |
| Modal implementation | Separate `FeatureBlockedModal` component vs inline Dialog | Inline Dialog | Dialog already imported; avoids new file for ~40 lines |
| Feature name | `hasBilling` vs `hasAfipBilling` | `hasAfipBilling` | Matches existing Prisma schema; existing `BillButtons` already uses `hasFeature("hasAfipBilling")` |
| Import style for server gate | Static import at top vs dynamic `import()` | Dynamic `import()` | Avoids changing top-level imports; keeps auth-gates dependency local to the gate |

---

## Testing Strategy

### Unit: processSaleAction gate (add to existing test file)

| # | Setup | Assert |
|---|-------|--------|
| 1 | Mock `requireFeature` → fail, input has CAE | Returns `{ error }`, `$transaction` NOT called |
| 2 | Mock `requireFeature` → pass, input has CAE | Calls `$transaction`, returns `{ success }` |
| 3 | Mock `requireFeature` → fail, input has NO CAE | Gate skipped, calls `$transaction`, returns `{ success }` |

### Component: BillButtons abort (new test file)

| # | Setup | Assert |
|---|-------|--------|
| 1 | Mock `createAfipVoucherAction` → `{ error }` | `processSaleAction` NOT called, blocked modal opens |
| 2 | Mock `createAfipVoucherAction` → `{ data: { CAE } }` | `processSaleAction` called, success toast |

### Fix existing security test

| # | File | Change |
|---|------|--------|
| 1 | `tests/actions/security.test.ts:146` | Change mock feature from `hasBilling: false` to `hasAfipBilling: false` |

---

## Migration / Rollout

No migration required. Rollback is per-file revert hierarchy: layer 1 (BillButtons.tsx) first, layers 2+3 are additive safety.

## Open Questions

None.
