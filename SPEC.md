# SPEC.md - Excel Upload: Actualizar Productos

## Feature
Agregar checkbox "Actualizar productos" en excel-upload-modal.tsx

## Requirements

### R1: Checkbox en UI
- [ ] Agregar checkbox "Actualizar productos" en el modal
- [ ] State: `updateExisting: boolean`
- [ ] Default: `false`
- [ ] Posición: Debajo de las columnas opcionales

### R2: Comportamiento cuando checked (true)
- [ ] Por cada producto del Excel
- [ ] Buscar producto por código en DB
- [ ] Si existe → actualizar `salePrice` 
- [ ] Si no existe → crear nuevo

### R3: Comportamiento cuando unchecked (false)  
- [ ] Por cada producto del Excel
- [ ] Buscar producto por código en DB
- [ ] Si NO existe → crear nuevo
- [ ] Si existe → ignorar (no hacer nada)

## Technical Details

### Frontend Changes
- **File:** `src/components/stock/excel-upload-modal.tsx`
- Agregar `const [updateExisting, setUpdateExisting] = useState(false);`
- Agregar checkbox con Label
- Pasar `updateExisting` a `createProductsBulk`

### Backend Changes
- **File:** `src/actions/stock.ts`
- Modificar función `createProductsBulk`
- Agregar parámetro opcional `updateExisting?: boolean`
- Agregar lógica de búsqueda y actualización

## Acceptance Criteria

- [ ] Checkbox visible en el modal con label "Actualizar productos"
- [ ] Con checked: productos con mismo código se actualizan
- [ ] Con checked: productos nuevos se crean
- [ ] Sin checked: solo se crean productos que NO existen
- [ ] Sin checked: productos existentes se ignoran
- [ ] Tests pasan
- [ ] Lint y typecheck pasan
