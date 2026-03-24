# Catalog Page Improvements Specification

## 1. Current Issues Analysis

### Performance Issues
| Issue | Location | Impact |
|-------|----------|--------|
| No memoization on product cards | `product-selector.tsx:93-182` | Every filter/search change re-renders all 100+ product cards |
| No content-visibility for long lists | `product-selector.tsx:80` | Renders all DOM nodes even when off-screen |
| Heavy ProductModal loaded eagerly | `product-selector.tsx:99,109` | `next/dynamic` should be used for modal |
| Full product data sent to client | `page.tsx:18` | Server serialization not optimized |

### Functionality Issues
| Issue | Location | Impact |
|-------|----------|--------|
| Category filtering removed | N/A | Users cannot filter by category |
| Search input disconnected | `product-selector.tsx:51` | `productSearch` state exists but never updates |
| Missing loading state | `product-selector.tsx:50` | `isLoading` is always false |
| No empty state | `product-selector.tsx:84` | No feedback when no products match filter |

### Architecture Issues
| Issue | Location | Impact |
|-------|----------|--------|
| Boolean prop `catalogo` | `product-selector.tsx:23` | Should use explicit variant per Vercel patterns |

### Accessibility Issues
| Issue | Location | Impact |
|-------|----------|--------|
| Missing aria-labels | `product-selector.tsx:69,106,113` | Screen readers lack context |
| No focus-visible states | Throughout | Keyboard navigation unclear |
| No keyboard handlers | `product-selector.tsx:139-178` | Enter key doesn't submit quantity |
| Non-semantic truncation | `product-selector.tsx:121` | Uses `…` instead of ellipsis character |

---

## 2. Specific Improvements to Implement

### 2.1 Performance Optimizations

#### A. Memoize Product Cards (rerender-memo)
```tsx
// Extract ProductCard to separate component with memo
const ProductCard = memo(function ProductCard({ product, onAdd }: Props) {
  // ... implementation
});

// Use useMemo for filtered results
const filteredProducts = useMemo(() => {
  return displayProducts.filter(product => 
    product.description.toLowerCase().includes(search.toLowerCase()) ||
    product.category.toLowerCase().includes(search.toLowerCase())
  );
}, [displayProducts, search, category]);
```

#### B. Content Visibility (content-visibility)
```tsx
<div 
  className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
  style={{ contentVisibility: 'auto' }}
>
  {filteredProducts.map(product => (...))}
</div>
```

#### C. Dynamic Import for Modal (bundle-dynamic-imports)
```tsx
const ProductModal = dynamic(
  () => import('@/components/stock/product-modal').then(mod => mod.ProductModal),
  { ssr: false, loading: () => <SkeletonImage /> }
);
```

#### D. Minimize Server Serialization
- Send only needed fields to client: `id, description, salePrice, image, category, brand, code, amount`
- Remove unused `Product` class transformation

### 2.2 Functionality

#### A. Search Input Connection
```tsx
const [search, setSearch] = useState("");
// Connect to Input
<Input 
  value={search}
  onChange={(e) => setSearch(e.target.value)}
  aria-label="Buscar productos"
/>
```

#### B. Category Filtering
```tsx
const [category, setCategory] = useState<string>("all");

const categories = useMemo(() => 
  [...new Set(products?.map(p => p.category).filter(Boolean))],
  [products]
);

// Filter dropdown
<Select value={category} onValueChange={setCategory}>
  <SelectTrigger aria-label="Filtrar por categoría">
    <SelectValue placeholder="Todas las categorías" />
  </SelectTrigger>
  <SelectContent>
    <SelectItem value="all">Todas</SelectItem>
    {categories.map(cat => (
      <SelectItem key={cat} value={cat}>{cat}</SelectItem>
    ))}
  </SelectContent>
</Select>
```

#### C. Empty State
```tsx
{filteredProducts.length === 0 && !isLoading && (
  <div className="flex flex-col items-center justify-center py-12 text-center">
    <SearchX className="h-12 w-12 text-muted-foreground mb-4" />
    <h3 className="text-lg font-semibold">No se encontraron productos</h3>
    <p className="text-muted-foreground">
      Try adjusting your search or filter criteria
    </p>
  </div>
)}
```

### 2.3 Architecture (Avoid Boolean Props)

#### Current:
```tsx
<ProductSelector catalogo={true} products={products} />
```

#### Improved (Explicit Variants):
```tsx
// Define variant type
type ProductSelectorVariant = "public-catalog" | "internal-selector";

// Props interface
interface Props {
  variant: ProductSelectorVariant;
  products?: PublicProduct[];
  business?: { name: string; logo: string | null };
}

// Usage
<ProductSelector variant="public-catalog" products={products} business={business} />
```

### 2.4 Accessibility Improvements

#### A. ARIA Labels
```tsx
// Search input
<Input 
  aria-label="Buscar productos por nombre, código o marca"
/>

// Product card actions
<Button 
  aria-label={`Agregar ${product.description} al carrito`}
>
  Agregar
</Button>

// Category filter
<Select aria-label="Filtrar por categoría">
```

#### B. Focus States
```tsx
// Add focus-visible to interactive elements
className="focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
```

#### C. Keyboard Navigation
```tsx
// Allow Enter to submit quantity
<Input
  onKeyDown={(e) => {
    if (e.key === 'Enter') handleAddProduct(product);
  }}
/>
```

#### D. Proper Ellipsis
```tsx
// Replace "..." with ellipsis character
<p className="truncate w-40">{product.description}</p>
```

---

## 3. Acceptance Criteria

### Performance
- [ ] Product cards render in <16ms (60fps) during filter changes
- [ ] Initial page load sends <50KB of product data to client
- [ ] ProductModal is loaded via dynamic import
- [ ] `content-visibility` applied to product grid

### Functionality
- [ ] Search input filters products by: description, code, brand, category
- [ ] Category dropdown shows unique categories from products
- [ ] Empty state displays when no products match filters
- [ ] Loading skeleton shows during data fetch

### Architecture
- [ ] `catalogo` boolean prop replaced with `variant` prop
- [ ] ProductCard extracted and memoized
- [ ] Filtered results use `useMemo`

### Accessibility
- [ ] All interactive elements have aria-labels
- [ ] Focus-visible rings on keyboard navigation
- [ ] Enter key submits quantity input
- [ ] Proper ellipsis character (not three dots)

---

## 4. Performance Targets

| Metric | Target | Current |
|--------|--------|---------|
| First Contentful Paint | <1.5s | Unknown |
| Time to Interactive | <3s | Unknown |
| Bundle size increase | <5KB | N/A |
| Re-render on filter | <16ms | >100ms |

---

## 5. Implementation Order

1. **Phase 1**: Extract ProductCard + memoize + useMemo for filters
2. **Phase 2**: Add search + category filtering UI
3. **Phase 3**: Replace boolean prop with variant
4. **Phase 4**: Add dynamic import for ProductModal
5. **Phase 5**: Accessibility improvements (aria, focus, keyboard)
6. **Phase 6**: Empty state + content-visibility
