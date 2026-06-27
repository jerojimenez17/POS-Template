# Design: fix-critical-bugs

> Phase 2 of POS stabilization — 8 independent bugfixes

## Technical Approach

Each bug is a self-contained, linear fix — no cross-cutting concerns, no shared modules. Execute in priority order: page crashes first, data integrity next, UX cleanup last. All changes are scoped to the files identified in the proposal.

---

## Architecture Decisions

| Decision | Choice | Alternative | Rationale |
|----------|--------|-------------|-----------|
| FR-004 error handling | try/catch in Server Component + fallback JSX | Error boundary | SC already renders — inline fallback avoids client boundary |
| FR-005 confirmation | AlertDialog wrapper (existing `@/components/ui/alert-dialog`) | Custom modal | Follows `admin/users-table.tsx` pattern exactly — consistent UX |
| FR-003 component placement | `@/components/ui/feature-blocked-modal.tsx` | Keep inline in BillButtons | Extracted for reuse; `ui/` for cross-feature utility |
| FR-007 data source | New action `getClientsWithBalance` | Modify `getUnpaidOrders` | Keeps existing action untouched; clear separation of concerns |
| FR-007 states | Client component with loading/empty/error | Server fetch + streaming | Current pattern is client-side fetch — keep consistent |

---

## Data Flow

### FR-007: Ledger View (new flow)

```
AccountLedgerContent (client)
  │
  ├─ useEffect → getClientsWithBalance(businessId)
  │                   └─ Prisma: Client.findMany({ where: { businessId, balance: { gt: 0 } }, include: { orders } })
  │
  ├─ Loading state → <Loader2 /> spinner
  ├─ Empty state → "No hay clientes con deuda" message
  ├─ Error state → error message with retry
  └─ Data state → client cards with: name, formatted balance, last order date
```

### FR-004: Catalog Error Handling (modified flow)

```
getPublicProductsByBusinessId()
  ├─ Feature disabled → return { error: string }
  └─ Success → return PublicProduct[]

PublicCatalogPage (Server Component)
  ├─ try/catch around action call
  ├─ On error → render error banner (inline JSX, no modal)
  └─ On success → ProductSelector as before
```

---

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `src/actions/catalog.ts:33` | Modify | Replace `throw new Error(...)` → `return { error: "..." }` |
| `src/app/[business]/catalogo/page.tsx` | Modify | Wrap in try/catch; render error fallback |
| `src/components/Billing/PrintableTable.tsx:395-403` | Modify | Wrap delete Trash2 button in AlertDialog |
| `src/components/Billing/FilterBillPanel.tsx:366` | Modify | `T00:00:00` → `T23:59:59` for endDate |
| `src/components/admin/user-modal.tsx:99-106` | Modify | Add `form.reset()` before `onClose()` |
| `src/actions/stock/products.ts:236` | Modify | Add `images: { select: { url: true } }` to `include` |
| `src/components/ProductDataTable.tsx:71-74` | Modify | Fallback: `imageUrl = row.original.images?.[0]?.url` |
| `src/components/CashRegister.tsx:88` | Verify | Link `<href="/">` already correct — no change needed |
| `src/components/ui/feature-blocked-modal.tsx` | **Create** | Reusable FeatureBlockedModal component |
| `src/components/Billing/BillButtons.tsx:620-636` | Modify | Replace inline Dialog with imported FeatureBlockedModal |
| `src/actions/clients.ts` | **Create** | New action `getClientsWithBalance(businessId)` |
| `src/app/(protected)/account-ledger/AccountLedgerContent.tsx` | Rewrite | Replace order-list with client-summary view |

---

## Interfaces / Contracts

### FR-003: FeatureBlockedModal
```typescript
// src/components/ui/feature-blocked-modal.tsx
interface FeatureBlockedModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  feature: string;           // e.g. "Cuenta Corriente", "Facturación Electrónica"
  reason: "plan" | "overdue";
}
```

### FR-007: ClientWithBalance
```typescript
// Return type from getClientsWithBalance
interface ClientWithBalance {
  id: string;
  name: string;
  balance: number;
  lastOrderDate: Date | null;
}
```

### FR-004: Updated action return
```typescript
// getPublicProductsByBusinessId returns
PublicProduct[] | { error: string }
// Page checks: if (error in result)
```

---

## Testing Strategy

| Layer | What | Approach |
|-------|------|----------|
| Manual | FR-004 | Load catalog page without feature enabled → see error banner, not crash |
| Manual | FR-005 | Click Trash2 → AlertDialog appears → confirm/cancel works |
| Manual | FR-008 | Select same day for from/to → orders from entire day appear |
| Manual | FR-010 | Create user → modal closes, form fields are empty on reopen |
| Manual | FR-009 | Product with uploaded image → image visible in table |
| Manual | FR-006 | Click back arrow on CashRegister → navigates to `/` |
| Manual | FR-003 | Feature-blocked state shows modal with WhatsApp link |
| Manual | FR-007 | Account ledger shows client summary cards with debt |

---

## Migration / Rollout

No migration required. No schema changes, no feature flags, no data transforms. Each fix is independently revertable via its commit hash.

---

## Open Questions

- [ ] **FR-003**: Which specific `toast.error()` calls are "feature-disabled toasts"? Lines 147 and 189 in BillButtons are operational errors (AFIP voucher failure, sale save failure) — not feature-gated. Only line 247 triggers the feature modal. **Recommendation**: keep lines 147/189 as is (operational toasts), replace any future feature-gated toast with the new modal. Confirm with PO.
- [ ] **FR-006**: `<Link href="/">` already works — confirming it's correct. No action needed.
