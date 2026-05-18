# Modal de Atributos Unificado

## Problema

Existían 4 archivos de modal con código repetido para crear categoría, subcategoría, marca y proveedor:

- `new-category-modal.tsx`
- `new-subcategory-modal.tsx`
- `new-brand-modal.tsx`
- `new-suplier-modal.tsx`

Cada modal seguía el mismo patrón: abrir → capturar nombre → crear en DB → cerrar. Esto violates el principio DRY y dificulta el mantenimiento.

## Solución

Un componente `CreateAttributeModal` que recibe `type` y `onSuccess` callback, unificando toda la lógica de creación de atributos en un solo lugar.

## Props

```typescript
interface CreateAttributeModalProps {
  type: "category" | "subcategory" | "brand" | "supplier";
  parentId?: string;
  onSuccess: (result: { id: string; name: string }) => void;
}
```

## Flujo

1. El modal recibe el `type` y renderiza el formulario correspondiente
2. Para subcategoría, requiere `parentId` (categoryId)
3. Al crear, retorna `{ id, name }` al componente padre
4. El padre actualiza el select mostrando el nuevo item seleccionado

## Archivos Modificados

- `product-form.tsx`:
  - Reemplazó 4 imports con 1
  - Agregó 4 handlers para abrir el modal según el tipo

## Archivo Creado

- `create-attribute-modal.tsx`

## Archivos Eliminados

- `new-category-modal.tsx`
- `new-subcategory-modal.tsx`
- `new-brand-modal.tsx`
- `new-suplier-modal.tsx`

## Acceptance Criteria

- [ ] Crear categoría desde el form funciona
- [ ] Crear subcategoría funciona (requiere categoryId)
- [ ] Crear marca funciona
- [ ] Crear proveedor con sus 4 campos funciona
- [ ] El nuevo item aparece seleccionado en el select después de crearlo