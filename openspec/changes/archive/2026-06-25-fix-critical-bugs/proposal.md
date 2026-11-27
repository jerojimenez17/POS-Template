# Proposal: fix-critical-bugs

> PRD ref: FR-003 to FR-010 — Phase 2 of POS stabilization

## Intent

Fix 8 critical bugs causing: (a) page crashes (FR-004), (b) data integrity risks (FR-005), (c) broken filtering (FR-008), (d) form UX (FR-010, FR-009), (e) inconsistent feature gating UX (FR-003), (f) wrong ledger view (FR-007), and (g) navigation (FR-006). All discovered and analyzed during exploration.

## Scope

### In Scope
- **FR-004**: Add try/catch in catalog page, return `{ error }` from action instead of throw
- **FR-005**: Wrap delete button in `AlertDialog` — "¿Eliminar [producto]?"
- **FR-008**: Fix endDate — `T00:00:00` → `T23:59:59`
- **FR-010**: Add `form.reset()` before `onClose()` in user-modal success handler
- **FR-009**: Add `images` to Prisma query includes + fallback display in table
- **FR-006**: Verify CashRegister back link; switch to `router.push("/")` if broken
- **FR-003**: Extract `FeatureBlockedModal` component; replace all `toast.error()` for feature gates
- **FR-007**: Rewrite `AccountLedgerContent` to query clients with balance > 0, show per-client summary

### Out of Scope
- FR-011 (edit sales — separate batch)
- FR-001 (already completed)
- Plan enforcement refactor (Phase 4)

## Capabilities

### New Capabilities
- `feature-blocked-modal`: Reusable modal for feature-not-enabled, plan-blocked, and overdue-payment states

### Modified Capabilities
- `account-ledger`: Changes from order-level list to client-level summary (balance > 0)
- None for remaining bugs — pure bugfixes at implementation level

## Approach

Execute in priority order (user impact → complexity):

| # | Bug | Complexity | How |
|---|-----|-----------|-----|
| 1 | FR-004 | Simple | try/catch in page.tsx + return `{ error }` from catalog.ts:33 |
| 2 | FR-005 | Simple | Wrap `<Trash2>` button in `AlertDialog` (use users-table.tsx pattern) |
| 3 | FR-008 | Simple | One-line: `T00:00:00` → `T23:59:59` |
| 4 | FR-010 | Simple | Add `form.reset()` in success handler before `onClose()` |
| 5 | FR-009 | Simple | Add `images: { select: { url: true } }` to query; fallback `imageUrl = row.original.image \|\| row.original.images?.[0]?.url` |
| 6 | FR-006 | Simple | Verify `CashRegister.tsx:88` Link; if broken → `router.push("/")` |
| 7 | FR-003 | Medium | Extract `FeatureBlockedModal` from BillButtons.tsx inline Dialog; replace toast.error() in 4 callers |
| 8 | FR-007 | Medium | Rewrite AccountLedgerContent: fetch clients with `balance > 0`, show summary cards; keep `[id]` detail page as-is |

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `src/app/[business]/catalogo/page.tsx` | Modified | Add error handling for disabled catalog |
| `src/actions/catalog.ts` | Modified | Return error instead of throw |
| `src/components/Billing/PrintableTable.tsx` | Modified | Add AlertDialog to delete button |
| `src/components/Billing/FilterBillPanel.tsx` | Modified | Fix endDate time |
| `src/components/admin/user-modal.tsx` | Modified | Add form.reset() |
| `src/actions/stock/products.ts` | Modified | Add images to include |
| `src/components/ProductDataTable.tsx` | Modified | Show images from relation |
| `src/components/CashRegister.tsx` | Modified | Fix back nav if broken |
| `src/components/Billing/BillButtons.tsx` | Modified | Replace toast → FeatureBlockedModal |
| `src/app/(protected)/account-ledger/AccountLedgerContent.tsx` | Rewritten | Client summary view |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| FR-003 toast removal might miss a caller | Low | Search for all `requireFeature` error handlers |
| FR-007 rewrite breaks existing detail page | Low | Keep `[id]` route untouched |
| FR-006 already works (false positive bug) | Med | Verify first, skip if working |

## Rollback Plan

Each bugfix is an independent commit. Revert specific commit for any broken fix. No schema or DB changes, so zero migration risk.

## Dependencies

None. All changes are self-contained within the codebase.

## Success Criteria

- [ ] FR-004: Catalog page shows friendly message instead of crash
- [ ] FR-005: Delete requires confirmation via AlertDialog
- [ ] FR-008: Same-day filter includes all 24h of selected day
- [ ] FR-010: User modal form resets after successful creation
- [ ] FR-009: Stock table shows uploaded product images
- [ ] FR-006: Back button on CashRegister navigates to home
- [ ] FR-003: All feature-gate errors show unified modal, not toast
- [ ] FR-007: Account ledger shows client debt summaries, not order list
