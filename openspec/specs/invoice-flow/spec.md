# Spec: Invoice Flow — AFIP Billing Feature Gate

## Requirements

### Requirement: R1 — Client-side abort on disabled AFIP feature

When "Facturar" is pressed and AFIP feature is unavailable, the system MUST abort the sale before any side effects. The system MUST NOT save to DB, clear cart, decrement stock, or create cash movements. A blocking modal MUST be shown instead.

#### Scenario: A — Feature disabled, user clicks Facturar

- GIVEN user's business lacks `hasAfipBilling` feature
- WHEN user clicks Facturar → CheckoutModal → confirmar
- THEN blocking modal appears with title "Funcionalidad no disponible"
- AND sale is NOT saved, cart NOT cleared, stock NOT decremented

#### Scenario: B — Feature enabled, user clicks Facturar

- GIVEN user's business HAS `hasAfipBilling` feature
- WHEN user clicks Facturar → CheckoutModal → confirmar
- THEN no blocking modal appears
- AND AFIP voucher created, sale saved, cart cleared (normal flow)

### Requirement: R2 — Server-side gate in processSaleAction

`processSaleAction` MUST verify `requireFeature("hasAfipBilling")` when payload contains CAE data. If disabled, MUST return FORBIDDEN error with NO DB writes. Without CAE data (remito, "a cuenta"), the gate MUST be skipped.

#### Scenario: C — Feature disabled, direct API call with CAE

- GIVEN external caller sends payload WITH CAE to `processSaleAction`
- WHEN action processes payload
- THEN `requireFeature("hasAfipBilling")` returns false → FORBIDDEN error returned
- AND `$transaction` is NOT called — no DB writes occur

#### Scenario: D — Feature disabled, direct API call without CAE

- GIVEN external caller sends payload WITHOUT CAE (remito) to `processSaleAction`
- WHEN action processes payload
- THEN feature gate is SKIPPED
- AND sale saves normally

#### Scenario: E — Feature disabled, Remito flow

- GIVEN user WITHOUT `hasAfipBilling` feature
- WHEN user clicks "Confirmar Remito" → CheckoutModal → confirmar (`createSale(false, false)`)
- THEN sale saves normally (no CAE present)
- AND no blocking modal appears

### Requirement: R3 — Fix feature name in createAfipVoucherAction

`createAfipVoucherAction` MUST call `requireFeature("hasAfipBilling")`, NOT `requireFeature("hasBilling")`.

#### Scenario: F — Correct feature name

- GIVEN `createAfipVoucherAction` is invoked
- WHEN it checks feature availability
- THEN it uses `requireFeature("hasAfipBilling")`
- AND it does NOT use `requireFeature("hasBilling")`

### Requirement: R4 — Blocking modal UI

The blocking modal SHALL show: title "Funcionalidad no disponible", body "Esta funcionalidad no está incluida en tu plan actual. Contactanos vía WhatsApp para activarla.", and WhatsApp button at `https://wa.me/5492265418113` with icon. The modal MUST NOT include an "Entendido" dismiss button — the only action is contacting via WhatsApp. No toast.

#### Scenario: G — Modal renders correctly

- GIVEN user has triggered the feature-blocked state
- WHEN blocking modal renders
- THEN title, body, and WhatsApp link are displayed
- AND no "Entendido" dismiss button or toast notification appears
