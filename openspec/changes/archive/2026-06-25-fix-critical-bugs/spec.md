# Spec: fix-critical-bugs

Bugfix requirements for Phase 2 POS stabilization (FR-004, FR-005, FR-008, FR-010, FR-009, FR-006).

## Requirements

### R3 (FR-004): Catalog crash prevention

Catalog page MUST show a friendly message when `hasPublicCatalog=false` instead of crashing.

| Scenario | Precondition | Action | Outcome |
|----------|-------------|--------|---------|
| A — Feature disabled | Business has `hasPublicCatalog=false` | User navigates to `/catalogo` | Friendly message shown; no crash or 500 |
| B — Feature enabled | Business has `hasPublicCatalog=true` | User navigates to `/catalogo` | Products displayed normally |

### R4 (FR-005): Delete confirmation

Removing a product from cart MUST show a confirmation dialog.

| Scenario | Precondition | Action | Outcome |
|----------|-------------|--------|---------|
| C — Confirm deletion | Product is in cart | User clicks delete + confirms | Product removed from cart |
| D — Cancel deletion | Product is in cart | User clicks delete + cancels | Product stays in cart |

### R5 (FR-008): Day filter end time

Date range filter SHALL use 23:59:59 as end-of-day timestamp.

| Scenario | Precondition | Action | Outcome |
|----------|-------------|--------|---------|
| E — Same-day filter | Start and end on same day | User applies date filter | All sales from 00:00–23:59 included |

### R6 (FR-010): Form reset after creation

User creation form MUST reset to empty state after successful creation.

| Scenario | Precondition | Action | Outcome |
|----------|-------------|--------|---------|
| F — Form resets | Form filled with user data | User is created successfully | Form fields cleared for next entry |

### R7 (FR-009): Product photo in stock table

Stock table MUST show first uploaded image or placeholder if none exist.

| Scenario | Precondition | Action | Outcome |
|----------|-------------|--------|---------|
| G — Product with images | Product has uploaded images | Stock table renders | First image displayed |
| H — Product without images | Product has no uploaded images | Stock table renders | Placeholder image shown |

### R8 (FR-006): Back navigation

Back button in cash register SHALL navigate to home page.

| Scenario | Precondition | Action | Outcome |
|----------|-------------|--------|---------|
| I — Click back | User is in cash register view | User clicks back button | Navigates to home page |
