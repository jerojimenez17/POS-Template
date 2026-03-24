# Dynamic Business Catalog Route Specification

## Overview

Migrate the public catalog page from a static route `/catalogo` to a dynamic route `[business]/catalogo` that displays products from a specific business using PostgreSQL instead of Firebase.

## Project Stack

- **Framework**: Next.js 15 with App Router, React 19
- **Database**: Prisma ORM with PostgreSQL
- **Styling**: Tailwind CSS v4 with Radix UI components
- **Language**: TypeScript (strict mode)

---

## Current Implementation Analysis

### Existing Structure

| File | Purpose |
|------|---------|
| `src/app/catalogo/page.tsx` | Static catalog page wrapper |
| `src/components/catalog/product-selector.tsx` | Product grid with search |
| `src/components/catalog/order-button-modal.tsx` | Cart slide-out sheet |
| `src/components/catalog/context/CartProvider.tsx` | Cart state management |
| `src/actions/stock.ts` | Product CRUD operations (requires auth) |
| `src/actions/business.ts` | Business operations (requires auth) |

### Data Flow (Target)

```
Dynamic Route: /[businessSlug]/catalogo
    │
    ▼
Page Component (Server)
    │
    ├─► getBusinessBySlug(slug) → Business | null
    │
    ├─► getProductsByBusinessId(businessId) → Product[]
    │
    ▼
ProductSelector (Client)
    │
    ▼
CartContext (addItem, removeItem, etc.)
```

---

## Route Structure Design

### URL Pattern

```
/[slug]/catalogo
```

- `[slug]` = Business `slug` field from PostgreSQL (URL-safe, lowercase)
- Example: `/mi-negocio/catalogo`, `/acme-store/catalogo`

### Route Implementation

```typescript
// src/app/[business]/catalogo/page.tsx
export default async function PublicCatalogPage({
  params,
}: {
  params: Promise<{ business: string }>;
}) {
  const { business: businessSlug } = await params;
  
  // 1. Validate business exists
  const business = await getBusinessBySlug(businessSlug);
  if (!business) notFound();
  
  // 2. Fetch products
  const products = await getPublicProductsByBusinessId(business.id);
  
  return (
    <CartProvider>
      <ProductSelector 
        products={products}
        business={business}
        catalogo={true} 
      />
    </CartProvider>
  );
}
```

---

## Data Models

### Business (from Prisma)

```typescript
interface Business {
  id: string;
  name: string;
  slug: string;        // Unique URL-safe identifier
  logo: string | null;
  // Billing fields (not needed for public catalog)
}
```

### Product (from Prisma)

```typescript
interface Product {
  id: string;
  code: string | null;
  description: string | null;
  
  brandId: string | null;
  brand: Brand | null;
  
  categoryId: string | null;
  category: Category | null;
  
  subCategoryId: string | null;
  subCategory: Subcategory | null;

  price: number;        // Cost price (NOT shown in public catalog)
  salePrice: number;     // Only this is displayed
  gain: number;
  amount: number;
  unit: string | null;
  image: string | null;
  imageName: string | null;
  client_bonus: number;
  
  businessId: string;
  last_update: Date;
  creation_date: Date;
}
```

### PublicCatalogProduct (filtered view)

```typescript
interface PublicCatalogProduct {
  id: string;
  code: string | null;
  description: string | null;
  brand: string | null;     // Extracted from brand relation
  category: string | null;   // Extracted from category relation
  salePrice: number;
  unit: string | null;
  image: string | null;
  amount: number;
}
```

---

## Server Actions Required

### 1. getBusinessBySlug

```typescript
// src/actions/business.ts

export const getBusinessBySlug = async (slug: string) => {
  try {
    const business = await db.business.findUnique({
      where: { slug: slug.toLowerCase() },
      select: {
        id: true,
        name: true,
        slug: true,
        logo: true,
      },
    });
    return business;
  } catch (error) {
    console.error("Error fetching business by slug:", error);
    return null;
  }
};
```

### 2. getPublicProductsByBusinessId (NEW)

```typescript
// src/actions/catalog.ts (new file)

import { db } from "@/lib/db";

export interface PublicProduct {
  id: string;
  code: string | null;
  description: string | null;
  brand: string | null;
  category: string | null;
  salePrice: number;
  unit: string | null;
  image: string | null;
  amount: number;
}

export const getPublicProductsByBusinessId = async (businessId: string) => {
  try {
    const products = await db.product.findMany({
      where: { 
        businessId: businessId,
        salePrice: { gt: 0 }, // Only products with sale price
      },
      select: {
        id: true,
        code: true,
        description: true,
        salePrice: true,
        unit: true,
        image: true,
        amount: true,
        brand: { select: { name: true } },
        category: { select: { name: true } },
      },
      orderBy: { description: "asc" },
    });

    return products.map((p) => ({
      id: p.id,
      code: p.code,
      description: p.description,
      brand: p.brand?.name ?? null,
      category: p.category?.name ?? null,
      salePrice: p.salePrice,
      unit: p.unit,
      image: p.image,
      amount: p.amount,
    }));
  } catch (error) {
    console.error("Error fetching public products:", error);
    return [];
  }
};
```

---

## File Structure Changes

```
src/
├── app/
│   ├── catalogo/
│   │   └── page.tsx              # DELETE (moved)
│   ├── [business]/               # NEW - dynamic segment
│   │   └── catalogo/
│   │       └── page.tsx          # NEW - public catalog page
│   └── (protected)/              # Existing
├── actions/
│   ├── catalog.ts                # NEW - public catalog actions
│   ├── stock.ts                  # MODIFY - add getBusinessBySlug
│   └── business.ts               # MODIFY - add getBusinessBySlug
├── components/
│   └── catalog/
│       ├── product-selector.tsx  # MODIFY - accept products as prop
│       └── ...                   # Existing
└── ...
```

---

## Component Changes

### ProductSelector Props Update

```typescript
// src/components/catalog/product-selector.tsx

interface Props {
  clientSelected?: Client;
  session?: Session | null;
  catalogo: boolean;
  order?: Order;
  products?: PublicProduct[];        // NEW - accept products as prop
  business?: {                      // NEW - accept business info
    name: string;
    logo: string | null;
  };
}
```

### Remove Firebase/Local State

The component should no longer:
- Use `useState<Product[]>([])` for products
- Have empty `useEffect` hook
- Fetch products internally

Instead:
- Receive products as a prop
- Accept products from server component

---

## Acceptance Criteria

### AC1: Route Navigation
- [ ] `/[slug]/catalogo` renders correct business products
- [ ] `/non-existent-business/catalogo` returns 404
- [ ] Business slug is case-insensitive

### AC2: Data Fetching
- [ ] Products are fetched from PostgreSQL via Prisma
- [ ] Only `salePrice` is displayed (not `price`)
- [ ] Products are filtered by businessId
- [ ] Products are sorted alphabetically by description

### AC3: Display Requirements
- [ ] Business name/logo shown in header
- [ ] Product cards display: image, description, salePrice, brand, code
- [ ] Search filters by code, description, brand, category
- [ ] Cart functionality works

### AC4: Performance
- [ ] Server-side data fetching (no client-side Firebase)
- [ ] Static generation where possible (`generateStaticParams`)
- [ ] Incremental regeneration for product updates

### AC5: Compatibility
- [ ] Existing cart/context still works
- [ ] Order creation flow preserved
- [ ] Mobile responsive design maintained

---

## Implementation Steps

### Phase 1: Create Server Actions

1. Create `src/actions/catalog.ts` with `getPublicProductsByBusinessId`
2. Add `getBusinessBySlug` to `src/actions/business.ts`

### Phase 2: Create Dynamic Route

1. Create directory `src/app/[business]/catalogo/`
2. Create `page.tsx` with dynamic route handling
3. Add `notFound()` for invalid business slugs

### Phase 3: Update Components

1. Update `ProductSelector` to accept `products` prop
2. Update type definitions for `PublicProduct`
3. Remove unused state and effects

### Phase 4: Static Generation (Optional)

1. Add `generateStaticParams` to pre-render known business slugs
2. Configure `revalidate` for incremental updates

---

## Testing Checklist

- [ ] Navigate to `/{valid-slug}/catalogo` - products display
- [ ] Navigate to `/{invalid-slug}/catalogo` - 404 page
- [ ] Search filters products correctly
- [ ] Add to cart increments count
- [ ] Cart sheet displays items with correct prices
- [ ] Total calculation is correct
- [ ] Mobile responsive layout
- [ ] No console errors
- [ ] No Firebase code in catalog
