# Public Catalog Page Specification

## Overview

The public catalog page (`/catalogo`) is a client-facing product browsing interface for a POS system. It displays products from Firebase Firestore with search functionality, cart management, and order creation capabilities for unauthenticated users.

## Project Stack

- **Framework**: Next.js 15 with App Router, React 19
- **Styling**: Tailwind CSS v4 with Radix UI components
- **Database**: Firebase Firestore for products
- **Language**: TypeScript (strict mode)
- **State Management**: React Context with useReducer

---

## Current Implementation Analysis

### Existing Files

| File | Purpose |
|------|---------|
| `src/app/catalogo/page.tsx` | Server component wrapper with CartProvider |
| `src/components/catalog/product-selector.tsx` | Main product grid with search |
| `src/components/catalog/order-button-modal.tsx` | Cart slide-out sheet |
| `src/components/catalog/context/CartProvider.tsx` | Cart state management |
| `src/components/catalog/context/CartReducer.ts` | Cart reducer actions |
| `src/components/catalog/context/CartContext.tsx` | Cart context definition |

### Data Flow

```
Firebase (stock collection)
    │
    ▼
ProductSelector (onSnapshot listener)
    │
    ▼
CartContext (addItem, removeItem, etc.)
    │
    ▼
OrderButtonSheet (displays cart items)
```

---

## Requirements

### R1: Product Display

- Display product cards in a responsive grid layout
- Each card shows:
  - Product image (with fallback to `no-image.svg`)
  - Product description (truncated to prevent overflow)
  - Sale price formatted in Argentine locale (2 decimal places)
  - Brand name
  - Product code
  - Current stock quantity (when `catalogo` is false)
- Support click-to-view product details via `ProductModal`

### R2: Search & Filtering

- Real-time search across product fields:
  - Product code (`cod`)
  - Category
  - Brand
  - Description
- Search is case-insensitive
- Clear search functionality

### R3: Cart Management

- Add products with specified quantity
- Increment/decrement item quantity in cart
- Remove items from cart
- Clear entire cart
- Display cart item count badge
- Calculate and display cart total
- Persist cart state per session

### R4: Public Order Submission

- Allow unauthenticated users to create orders
- Collect contact information (email or phone)
- Validate contact info via `AccountSchema`
- Store order in database for later processing
- Display confirmation message

### R5: Responsive Design

- Mobile-first responsive grid
- Cards adapt from 1 column (mobile) to multiple columns (desktop)
- Touch-friendly input controls
- Sheet drawer from bottom on mobile

---

## Acceptance Criteria

### AC1: Product Display
- [ ] Products load from Firebase Firestore `stock` collection
- [ ] Loading state shows `SkeletonCard` placeholder
- [ ] Images display correctly or show fallback
- [ ] Price displays with `$` prefix and 2 decimal places
- [ ] Product description truncates at 64 characters with ellipsis

### AC2: Search
- [ ] Typing in search input filters products in real-time
- [ ] Search matches code, category, brand, or description
- [ ] Clearing search shows all products
- [ ] Search is case-insensitive

### AC3: Cart
- [ ] Adding item shows toast/banner confirmation
- [ ] Cart badge shows correct item count
- [ ] Cart sheet opens/closes smoothly
- [ ] Quantity increments/decrements correctly
- [ ] Removing last unit removes item from cart
- [ ] Total updates automatically

### AC4: Public Ordering
- [ ] Guest users can submit orders
- [ ] Order form validates email or phone
- [ ] Order saves to database
- [ ] Error messages display for failed submissions

### AC5: Accessibility
- [ ] All interactive elements have ARIA labels
- [ ] Keyboard navigation works throughout
- [ ] Focus states are visible
- [ ] Color contrast meets WCAG AA standards

### AC6: Performance
- [ ] Initial page load < 2 seconds
- [ ] Search filtering < 100ms response
- [ ] Cart operations feel instant (< 50ms)

---

## Data Models

### Product (existing)

```typescript
interface Product {
  id: string;
  code: string;
  description: string;
  brand: string;
  subCategory: string;
  price: number;
  salePrice: number;
  gain: number;
  suplier: Supplier;
  client_bonus: number;
  unit: string;
  image: string;
  imageName: string;
  amount: number;
  last_update: Date;
  creation_date: Date;
  category: string;
}
```

### CartItem (extends Product)

```typescript
interface CartItem extends Product {
  quantity: number;  // Amount in cart
}
```

### Order (existing)

```typescript
interface Order {
  id: string;
  client: Client;
  products: Product[];
  date: Date;
  total: number;
  status: Status;
  seller: string;
  paidStatus: PaidStatus;
}
```

### PublicOrderInput (new)

```typescript
interface PublicOrderInput {
  clientName: string;
  clientEmail?: string;
  clientPhone?: string;
  products: CartItem[];
  total: number;
}
```

---

## File Structure

```
src/
├── app/
│   └── catalogo/
│       └── page.tsx              # Server component (keep)
├── components/
│   └── catalog/
│       ├── product-selector.tsx  # Main product grid (refactor)
│       ├── order-button-modal.tsx # Cart sheet (refactor)
│       ├── context/
│       │   ├── CartProvider.tsx   # Cart state (keep, clean up)
│       │   ├── CartReducer.ts     # Reducer logic (keep, clean up)
│       │   └── CartContext.tsx    # Context definition (keep)
│       ├── product-card-skeleton.tsx # MISSING - create
│       ├── product-card.tsx       # MISSING - extract card
│       └── product-modal.tsx      # MISSING - create from stock/
├── actions/
│   └── orders/
│       └── create-public-order.ts # MISSING - server action
└── schemas/
    └── index.ts                  # Add PublicOrderSchema
```

---

## Fixes Required

### F1: Remove Unused Imports

**`order-button-modal.tsx`** (lines 5, 8, 21):
```diff
- import { Card, CardDescription, CardHeader, CardTitle } from "../ui/card";
- import { off } from "process";
- import { auth } from "@/auth";
+ // Remove these imports
```

**`product-selector.tsx`** (lines 9, 30-33, 36):
```diff
- import { Suspense, ... } from "react";
- import { Form, useForm } from "react-hook-form";
- import { number, z } from "zod";
- import { zodResolver } from "@hookform/resolvers/zod";
- import { redirect } from "next/navigation";
- // Remove form variable and unused hooks
+ // Keep: useContext, useEffect, useState, useTransition
```

### F2: Missing Components

Create the following missing components:

1. **`src/components/catalog/product-card-skeleton.tsx`**
   - Loading placeholder for product cards
   - Matches card dimensions and styling

2. **`src/components/stock/product-modal.tsx`** (or `catalog/product-modal.tsx`)
   - Modal/dialog for product details
   - Wraps product image in card
   - Props: `product: Product`, `children: ReactNode`

3. **`src/components/ui/add-unit-button.tsx`**
   - Wrapper around PlusButton with default styles
   - Props: `onClick: () => void`, `disabled?: boolean`

4. **`src/components/ui/less-unit-button.tsx`**
   - Wrapper around LessButton with default styles
   - Props: `onClick: () => void`, `disabled?: boolean`

### F3: Import Path Corrections

Current imports in `order-button-modal.tsx`:
```diff
- import AddUnitButton from "../ui/add-unit-button";
- import LessUnitButton from "../ui/less-unit-button";
+ // Create these components OR use existing PlusButton/LessButton
```

---

## Improvements

### I1: Stock Status Indicator

Add visual indicator for stock availability:

```tsx
// In product-card.tsx
{product.amount > 0 ? (
  <Badge variant="success">En Stock ({product.amount})</Badge>
) : (
  <Badge variant="destructive">Sin Stock</Badge>
)}
```

### I2: Category Filtering

Add category tabs/filter chips:

```tsx
const categories = [...new Set(products.map(p => p.category))];

return (
  <div className="flex gap-2 overflow-x-auto">
    <Button variant={selectedCategory === null ? "default" : "outline"}
            onClick={() => setSelectedCategory(null)}>
      Todos
    </Button>
    {categories.map(cat => (
      <Button key={cat} variant={selectedCategory === cat ? "default" : "outline"}
              onClick={() => setSelectedCategory(cat)}>
        {cat}
      </Button>
    ))}
  </div>
);
```

### I3: Quick Add Button

Add one-click add button directly on product card:

```tsx
<Button 
  size="sm" 
  onClick={() => quickAdd(product)}
  disabled={product.amount === 0}
>
  <Plus className="h-4 w-4" /> Agregar
</Button>
```

### I4: Improved Accessibility

Add ARIA labels and roles:

```tsx
<Button 
  aria-label={`Agregar ${product.description} al carrito`}
  onClick={handleAdd}
>
  Agregar
</Button>

<input 
  type="number"
  aria-label={`Cantidad de ${product.description}`}
  min={0}
  max={product.amount}
/>
```

### I5: Error Handling

Add error boundaries and loading states:

```tsx
// Error boundary for Firebase connection
<ProductErrorBoundary>
  <ProductSelector />
</ProductErrorBoundary>

// Error state in component
if (error) {
  return (
    <div className="text-center p-4">
      <p>Error al cargar productos</p>
      <Button onClick={() => refetch()}>Reintentar</Button>
    </div>
  );
}
```

### I6: Mobile Optimizations

```tsx
// Use responsive grid
<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">

// Larger touch targets
<Button className="min-h-[44px] min-w-[44px]">

// Sticky cart button on mobile
<div className="sticky bottom-0 bg-white p-4 shadow-lg">
```

### I7: Cart Item Thumbnails

Improve cart table image display:

```tsx
<TableCell>
  <Image
    src={product.image}
    alt={product.description}
    width={48}
    height={48}
    className="rounded object-cover"
  />
</TableCell>
```

---

## Implementation Priority

1. **Phase 1: Fix Critical Issues**
   - Remove unused imports
   - Create missing components
   - Fix broken imports

2. **Phase 2: Core Functionality**
   - Category filtering
   - Stock status indicators
   - Error handling

3. **Phase 3: UX Improvements**
   - Quick add button
   - Mobile optimizations
   - Accessibility enhancements

---

## Testing Checklist

- [ ] Products load from Firebase
- [ ] Search filters products correctly
- [ ] Add to cart increments count
- [ ] Cart sheet displays items
- [ ] Quantity adjustment works
- [ ] Remove item works
- [ ] Total calculation is correct
- [ ] Print functionality works
- [ ] Mobile responsive layout
- [ ] No console errors
- [ ] No unused imports (verify with lint)
