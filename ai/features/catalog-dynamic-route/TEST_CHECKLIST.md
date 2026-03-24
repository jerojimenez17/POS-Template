# Dynamic Business Catalog Route - Test Checklist

## Overview

This checklist verifies all acceptance criteria for the dynamic business catalog feature implementation.

---

## AC1: Route Navigation

- [ ] `/[slug]/catalogo` renders correct business products
- [ ] `/non-existent-business/catalogo` returns 404
- [ ] Business slug is case-insensitive

### Test Cases

| ID | Description | Expected Result | Status |
|----|-------------|-----------------|--------|
| AC1-T1 | Navigate to valid business slug | Products displayed | ⬜ |
| AC1-T2 | Navigate to non-existent business | 404 page shown | ⬜ |
| AC1-T3 | Navigate with uppercase slug | Products displayed (case-insensitive) | ⬜ |
| AC1-T4 | Navigate with mixed case slug | Products displayed | ⬜ |

---

## AC2: Data Fetching

- [ ] Products are fetched from PostgreSQL via Prisma
- [ ] Only `salePrice` is displayed (not `price`)
- [ ] Products are filtered by businessId
- [ ] Products are sorted alphabetically by description

### Test Cases

| ID | Description | Expected Result | Status |
|----|-------------|-----------------|--------|
| AC2-T1 | Verify products come from PostgreSQL | DB query executed | ⬜ |
| AC2-T2 | Verify salePrice displayed in cards | Price visible | ⬜ |
| AC2-T3 | Verify cost price NOT displayed | No price leakage | ⬜ |
| AC2-T4 | Verify products filtered by businessId | Only business products shown | ⬜ |
| AC2-T5 | Verify products sorted alphabetically | A-Z order | ⬜ |
| AC2-T6 | Verify products with salePrice=0 excluded | Only products with price > 0 | ⬜ |

---

## AC3: Display Requirements

- [ ] Business name/logo shown in header
- [ ] Product cards display: image, description, salePrice, brand, code
- [ ] Search filters by code, description, brand, category
- [ ] Cart functionality works

### Test Cases

| ID | Description | Expected Result | Status |
|----|-------------|-----------------|--------|
| AC3-T1 | Business name visible in header | Name displayed | ⬜ |
| AC3-T2 | Business logo visible when present | Logo image shown | ⬜ |
| AC3-T3 | Product image displayed | Image renders | ⬜ |
| AC3-T4 | Product description displayed | Description text shown | ⬜ |
| AC3-T5 | Product salePrice displayed | Price visible | ⬜ |
| AC3-T6 | Product brand displayed | Brand text shown | ⬜ |
| AC3-T7 | Product code displayed | Code text shown | ⬜ |
| AC3-T8 | Search by code works | Products filtered | ⬜ |
| AC3-T9 | Search by description works | Products filtered | ⬜ |
| AC3-T10 | Search by brand works | Products filtered | ⬜ |
| AC3-T11 | Search by category works | Products filtered | ⬜ |
| AC3-T12 | Search is case-insensitive | Filter works | ⬜ |
| AC3-T13 | Add to cart button works | Item added | ⬜ |
| AC3-T14 | Cart displays correct items | Cart sheet shows items | ⬜ |
| AC3-T15 | Cart total calculation correct | Sum matches | ⬜ |

---

## AC4: Performance

- [ ] Server-side data fetching (no client-side Firebase)
- [ ] Static generation where possible (`generateStaticParams`)
- [ ] Incremental regeneration for product updates

### Test Cases

| ID | Description | Expected Result | Status |
|----|-------------|-----------------|--------|
| AC4-T1 | No Firebase SDK loaded | Firebase not in bundle | ⬜ |
| AC4-T2 | Products fetched server-side | SSR used | ⬜ |
| AC4-T3 | generateStaticParams exists | Static params exported | ⬜ |
| AC4-T4 | revalidate configured | ISR working | ⬜ |

---

## AC5: Compatibility

- [ ] Existing cart/context still works
- [ ] Order creation flow preserved
- [ ] Mobile responsive design maintained

### Test Cases

| ID | Description | Expected Result | Status |
|----|-------------|-----------------|--------|
| AC5-T1 | CartProvider still wraps catalog | Context available | ⬜ |
| AC5-T2 | Add item to cart works | State updated | ⬜ |
| AC5-T3 | Remove item from cart works | State updated | ⬜ |
| AC5-T4 | Cart persists across navigation | State maintained | ⬜ |
| AC5-T5 | Mobile layout works | Responsive | ⬜ |
| AC5-T6 | Touch interactions work | Mobile usable | ⬜ |

---

## Unit Test Coverage

### Server Actions

| Action | Test File | Coverage |
|--------|-----------|----------|
| `getBusinessBySlug` | `src/__tests__/actions/catalog.test.ts` | ⬜ |
| `getPublicProductsByBusinessId` | `src/__tests__/actions/catalog.test.ts` | ⬜ |

### Component Tests

| Component | Test File | Coverage |
|-----------|-----------|----------|
| `ProductSelector` | `src/__tests__/components/CatalogPage.test.tsx` | ⬜ |
| `CartProvider` | N/A (integration test) | ⬜ |

---

## Manual Test Script

### Pre-conditions
- [ ] Database seeded with test business and products
- [ ] Application running locally

### Test Execution

1. **Route Navigation**
   ```bash
   # Open browser to /test-business/catalogo
   # Verify products displayed
   
   # Open browser to /non-existent/catalogo  
   # Verify 404 page
   ```

2. **Product Display**
   - [ ] Check all product cards have image, description, price, brand, code
   - [ ] Verify cost price (price field) is NOT visible

3. **Search Functionality**
   - [ ] Search "P001" - should find product with code P001
   - [ ] Search "Test" - should find products with "Test" in description
   - [ ] Search "Brand A" - should find products with "Brand A"
   - [ ] Search "Category X" - should find products with "Category X"

4. **Cart Functionality**
   - [ ] Click "Agregar" button on a product
   - [ ] Open cart sheet
   - [ ] Verify item added with correct price
   - [ ] Verify total calculation correct
   - [ ] Remove item and verify removed

5. **Mobile Testing**
   - [ ] Open DevTools mobile view
   - [ ] Verify layout responsive
   - [ ] Test add to cart on mobile

### Browser Console
- [ ] No errors in console
- [ ] No Firebase related logs
- [ ] No React warnings

---

## Defect Log

| Defect ID | Description | Severity | Status | Notes |
|-----------|-------------|----------|--------|-------|
| | | | | |

---

## Sign-off

| Role | Name | Date | Signature |
|------|------|------|-----------|
| QA Engineer | | | |
| Developer | | | |

---

## Test Results Summary

- **Total Test Cases**: 
- **Passed**: 
- **Failed**: 
- **Blocked**: 
- **Pass Rate**: %

---

_Last Updated: March 2026_
