# Proposal: FR-001 — Fix Invoice Flow Data Corruption

## Intent

Fix a data corruption bug (FR-001) where clicking "Facturar" without the AFIP billing feature saves an invoice with empty CAE to the DB, clears the cart, and decrements stock. Also fix a secondary bug where the AFIP feature name `"hasBilling"` (wrong) blocks all users from ever creating AFIP vouchers.

## Scope

### In Scope
- [x] Client-side abort: null-check `caeData` after `handleCreateVoucher()` in `createSale()`, show blocking Dialog
- [x] Server-side gate: conditional `requireFeature("hasAfipBilling")` in `processSaleAction()` when CAE present
- [x] Fix feature name: `requireFeature("hasBilling")` → `requireFeature("hasAfipBilling")` in `createAfipVoucherAction`
- [x] Tests: server gate (3 scenarios), client abort (2 scenarios), fix existing security test mock

### Out of Scope
- Migrating `ProductsTable` to the newer `BillButtons` (named export) — UX change, separate task
- UX improvements to billing UI

## Capabilities

### New Capabilities
None — bug fix, no new capabilities introduced.

### Modified Capabilities
None — `feature-blocked-modal` spec already covers blocking modal behavior; no requirement changes.

## Approach

Three-layer defense:

| Layer | Location | Mechanism |
|-------|----------|-----------|
| 1 — Client abort | `BillButtons.tsx:241` | Null-check `caeData` after `handleCreateVoucher()`, set `openFeatureBlockedModal=true`, return `undefined` |
| 2 — Server gate | `process.ts:46` | `requireFeature("hasAfipBilling")` when `billState.CAE` is present, return error before `$transaction` |
| 3 — Fix existing | `afip.ts:13` | Change `"hasBilling"` → `"hasAfipBilling"` |

**User blocked UI**: `Dialog` with title "Funcionalidad no disponible", message "Esta funcionalidad no está incluida en tu plan actual.", WhatsApp button (`https://wa.me/5492265418113`) and "Entendido" button. No toast.

## Affected Areas

| File | Action | Impact |
|------|--------|--------|
| `src/components/Billing/BillButtons.tsx` | Modify | Add null-check + abort in `createSale()`, feature-blocked Dialog |
| `src/actions/sales/process.ts` | Modify | Conditional feature gate before `$transaction` |
| `src/actions/afip.ts` | Modify | Fix feature name string |
| `src/__tests__/actions/processSaleAction.test.ts` | Add 3 tests | Server gate scenarios |
| `src/__tests__/components/BillButtons.test.tsx` | New file | Client abort scenarios |
| `tests/actions/security.test.ts` | Modify | Fix mock to use `hasAfipBilling` |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Remito flow blocked by CAE gate | Low | Conditional on `billState.CAE` — only invoices with CAE trigger the check |
| Test mocks bypass feature check | Medium | Integration tests with real `requireFeature` mock; verify `$transaction` NOT called when blocked |

## Rollback Plan

Revert each layer independently by reverting the specific file change. Highest priority: revert `BillButtons.tsx` change only (layer 1) — layers 2 + 3 are additive safety. If urgent, deploy previous commit via `git revert <sha>`.

## Dependencies

None — all changes isolated to existing files, no new packages or services.

## Success Criteria

- [ ] "Facturar" with AFIP feature disabled → Dialog shown, no DB write, cart intact, stock unchanged
- [ ] "Facturar" with AFIP feature enabled → normal flow, CAE saved, stock decremented
- [ ] Remito (no CAE) with feature disabled → saves normally (gate skipped)
- [ ] `createAfipVoucherAction` works for users WITH `hasAfipBilling` feature
- [ ] All 5+ new tests pass
