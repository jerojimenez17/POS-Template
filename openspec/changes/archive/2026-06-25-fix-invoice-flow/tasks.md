# Tasks: FR-001 — Fix Invoice Flow Data Corruption

## Phase 1: Feature name fix

- [x] **T1: Fix feature name in createAfipVoucherAction** — `src/actions/afip.ts:13`: change `requireFeature("hasBilling")` → `requireFeature("hasAfipBilling")`

## Phase 2: Server-side gate

- [x] **T2: Add conditional feature gate in processSaleAction** — `src/actions/sales/process.ts`: after businessId check, before try block, add `if (billState.CAE)` guard with `import { requireFeature } from "@/lib/auth-gates"` → `requireFeature("hasAfipBilling")`; return error on fail

## Phase 3: Client-side abort

- [x] **T3: Add abort check in createSale()** — `src/components/Billing/BillButtons.tsx`: after `handleCreateVoucher()` returns null, add `if (afip && !caeData) → setOpenFeatureBlockedModal(true); setBlockButton(false); return undefined`
- [x] **T4: Create blocking modal Dialog** — `src/components/Billing/BillButtons.tsx`: inline Dialog with Lock icon in red circle, title "Funcionalidad no disponible", body + WhatsApp link `https://wa.me/5492265418113`, add `openFeatureBlockedModal` state. **Post-archive modification (2026-06-25):** "Entendido" dismiss button removed — only WhatsApp contact button remains (full width)

## Phase 4: Tests

- [x] **T5: Server gate tests (3 cases)** — `src/__tests__/actions/processSaleAction.test.ts`: (1) feature disabled + CAE → error, no `$transaction`; (2) feature enabled + CAE → success, `$transaction` called; (3) feature disabled + no CAE → gate skipped, `$transaction` called
- [x] **T6: Component tests for BillButtons abort (NEW)** — `src/__tests__/components/BillButtons.test.tsx`: (1) createAfipVoucherAction fails → processSaleAction NOT called, blocked modal opens; (2) createAfipVoucherAction succeeds → processSaleAction called, success toast
- [x] **T7: Fix existing security test mock** — `tests/actions/security.test.ts`: change mock feature from `hasBilling: false` to `hasAfipBilling: false`
