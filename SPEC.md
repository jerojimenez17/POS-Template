# SPEC.md - Excel Upload: Actualizar Productos

## Feature
Agregar checkbox "Actualizar productos" en excel-upload-modal.tsx

## Requirements

### R0: Manejo de Stock cuando columna NO está mapeada
**Regla**: La cantidad (stock) de un producto NO debe variar si la columna cantidad NO fue definida/mapeada en el Excel.

- [ ] Cuando `colAmount` está vacío/vacío en el modal de importación
- [ ] Al actualizar un producto existente: **mantener el stock actual** (no modificar)
- [ ] Al crear un nuevo producto: usar stock = 0 por defecto

### R1: Checkbox en UI
- [ ] Agregar checkbox "Actualizar productos" en el modal
- [ ] State: `updateExisting: boolean`
- [ ] Default: `false`
- [ ] Posición: Debajo de las columnas opcionales

### R2: Comportamiento cuando checked (true)
- [ ] Por cada producto del Excel
- [ ] Buscar producto por código en DB
- [ ] Si existe → actualizar `salePrice` (mantener stock si colAmount no está mapeado)
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
- **Importante:** Enviar `null` en lugar de `undefined` cuando la columna NO está mapeada para distinguir entre "no actualizar" vs "actualizar a 0"

### Backend Changes
- **File:** `src/actions/stock.ts`
- Modificar función `createProductsBulk`
- Agregar parámetro opcional `updateExisting?: boolean`
- **Lógica de actualización de stock:**
  - Si `amount` es `undefined` (columna no mapeada): NO incluir en el update (mantener valor actual)
  - Si `amount` tiene valor numérico: actualizar con ese valor
  - Para nuevos productos: siempre usar `amount: 0` si no se proporciona

## Acceptance Criteria

- [ ] Checkbox visible en el modal con label "Actualizar productos"
- [ ] Con checked: productos con mismo código se actualizan
- [ ] Con checked: productos nuevos se crean
- [ ] Sin checked: solo se crean productos que NO existen
- [ ] Sin checked: productos existentes se ignoran
- [ ] **CRÍTICO:** Si colAmount está vacío, mantener stock actual al actualizar
- [ ] Tests pasan
- [ ] Lint y typecheck pasan
