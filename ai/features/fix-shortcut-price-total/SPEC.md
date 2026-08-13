# SPEC: Actualizar el total al editar el precio de un producto agregado por atajo

## 1. Contexto y diagnóstico

En `/newBill`, un producto agregado con F1/F2/F3 se crea con `salePrice: 0` y luego se edita mediante `PriceEditInput`. El subtotal de la fila y el subtotal general se calculan desde `state.products`, por lo que reflejan el precio ingresado. Sin embargo, el `BillReducer` actualmente implementa `updateSalePrice` modificando únicamente `products`; no recalcula `total` ni `totalWithDiscount`.

`PrintableTable` usa `state.totalWithDiscount` para mostrar el total cuando no hay descuento, mientras que los cambios de unidad (`changeUnit`, o el flujo equivalente de cantidad) sí recalculan ambos campos. Por eso el total permanece con el valor anterior hasta que otra acción que recalcula totales ocurre.

La causa probable es, por tanto, una actualización incompleta del estado derivado en `BillReducer`, no un problema de foco, de F1 ni de renderizado de la página Server Component.

## 2. Objetivo y alcance

### Objetivo

Garantizar que al confirmar un nuevo precio en cualquier producto de la factura, el total general visible se actualice inmediatamente y conserve el comportamiento de descuentos existente.

### Alcance

- Corregir el caso `updateSalePrice` en `src/context/BillReducer.ts`.
- Mantener una única regla de cálculo: sumar `salePrice * amount`, aplicar el redondeo vigente y recalcular el total con descuento.
- Cubrir el flujo de edición de `PriceEditInput` y el agregado mediante shortcut con pruebas de reducer/componente.

### Fuera de alcance

- Cambiar la configuración o el comportamiento de F1/F2/F3.
- Cambiar el modelo `Product`, Prisma, acciones de servidor, persistencia o APIs.
- Modificar el diseño de `newBill`, la lógica de autofocus o la impresión.
- Añadir dependencias.

## 3. Requisitos funcionales

1. Al procesar `updateSalePrice`, el reducer debe actualizar el `salePrice` del producto identificado y recalcular `total` a partir de todos los productos.
2. El cálculo debe usar `rawTotal = sum(product.salePrice * product.amount)`.
3. `total` debe conservar el redondeo actual (`Math.round(rawTotal)`).
4. `totalWithDiscount` debe ser `Math.round(rawTotal * (1 - discount / 100))` cuando `discount > 0`; sin descuento debe coincidir con el total redondeado.
5. La acción debe ser inmutable y no modificar productos que no coincidan con el id.
6. El total visible en `PrintableTable` debe reflejar el nuevo precio después de blur o Enter en `PriceEditInput`, sin requerir cambiar la unidad u otra acción posterior.
7. El flujo debe funcionar igual para productos agregados por shortcut y para productos agregados por búsqueda normal.
8. Si el id no existe, la acción no debe alterar `products`, `total` ni `totalWithDiscount`.

## 4. Criterios de aceptación medibles

- **CA-01 — Precio de producto con shortcut:** dado un producto agregado por F1 con cantidad 1 y precio inicial 0, al confirmar el precio `125.50`, el subtotal de la fila y el total general mostrado deben ser `126` según el redondeo vigente, sin pulsar ningún botón de unidad.
- **CA-02 — Múltiples productos:** con productos de `(10, cantidad 2)` y `(25, cantidad 1)`, al cambiar el precio del segundo a `40`, `total` debe ser `60` y el subtotal general debe mostrar `60.00`.
- **CA-03 — Descuento activo:** con `discount = 10`, productos cuyo `rawTotal` sea `100`, al cambiar un precio y obtener `rawTotal = 150`, `total` debe ser `150` y `totalWithDiscount` debe ser `135`.
- **CA-04 — Sin descuento:** con `discount = 0`, después de `updateSalePrice`, `totalWithDiscount` debe quedar igual a `total`; no debe conservar el valor anterior.
- **CA-05 — Confirmación por blur y Enter:** editar el input de precio y confirmar primero mediante blur y luego mediante Enter debe producir el mismo estado calculado, sin agregar duplicados ni requerir un cambio de unidad.
- **CA-06 — Identidad inexistente:** ejecutar `updateSalePrice` con un id ausente debe dejar invariantes `products`, `total` y `totalWithDiscount`.
- **CA-07 — No regresión de cantidades:** `addItem`, `changeUnit`, `addUnit` y `removeUnit` deben continuar calculando `total` y `totalWithDiscount` con las mismas reglas actuales.
- **CA-08 — Calidad:** no se agregan dependencias ni cambios de esquema; los tests relevantes, `npm run lint` y `npx tsc --noEmit` deben finalizar correctamente.

## 5. Escenarios edge

- Precio `0` después de editar: el total debe poder volver a cero.
- Cantidad decimal o mayor que 1: el total debe multiplicar por la cantidad almacenada sin asumir cantidad 1.
- Precio decimal con coma: `PriceEditInput` ya normaliza la entrada; el reducer recibe un número y debe calcularlo igual que un decimal con punto.
- Descuento `0`, descuento positivo y cambio de precio varias veces consecutivas.
- Redondeos fraccionarios en subtotal y descuento deben conservar `Math.round` en los mismos puntos que el código actual.
- Dos productos con ids distintos y precios editados en secuencia no deben sobrescribirse entre sí.
- Id inexistente, lista vacía y producto con cantidad válida deben conservar un estado coherente.

## 6. Interfaces y archivos afectados

### Cambio principal

`src/context/BillReducer.ts`

- Completar el caso `updateSalePrice` para construir `updatedProducts`, calcular `rawTotal`, `newTotal` y `newTotalWithDiscount`, y devolverlos junto con `products`.
- No cambiar la forma de la acción existente.

### Interfaces existentes que deben conservarse

`src/context/billActions.ts`

```typescript
type BillAction =
  | { type: "updateSalePrice"; payload: { id: string; salePrice: number } }
  // ...acciones existentes
```

`src/context/BillContext.tsx` y `src/context/BillProvider.tsx`

- No requieren una nueva API. Deben seguir exponiendo `dispatch` y el estado `BillState` al `PriceEditInput`/`PrintableTable`.

`src/components/Billing/PriceEditInput.tsx`

- No requiere cambio funcional previsto: al confirmar debe seguir despachando `updateSalePrice`.
- Solo debe tocarse si una prueba demuestra que el evento de confirmación no llega al reducer.

`src/components/Billing/PrintableTable.tsx`

- No requiere cambio funcional previsto: sus cálculos de fila y subtotal ya leen `state.products`, y el total debe quedar consistente al corregir el reducer.
- Verificar que no se introduzca un segundo cálculo de negocio que diverja del reducer.

`src/app/(protected)/newBill/page.tsx`

- No debe modificarse. Continúa montando `BillProvider` alrededor de `ProductsTable`; la corrección pertenece al estado cliente compartido.

### Dependencias y persistencia

No se requieren dependencias nuevas, migraciones Prisma, cambios de schema, Server Actions ni variables de entorno.

## 7. Diseño mínimo propuesto

Reutilizar exactamente la fórmula ya aplicada por `addItem`, `changeUnit` y las acciones de unidades dentro del caso `updateSalePrice`:

```text
updatedProducts = products con el salePrice del id actualizado
rawTotal = Σ(updatedProduct.salePrice × updatedProduct.amount)
total = round(rawTotal)
totalWithDiscount = discount > 0
  ? round(rawTotal × (1 - discount / 100))
  : total
```

La solución mínima es ampliar el objeto retornado por `updateSalePrice`; no hace falta disparar una segunda acción `total`, recalcular desde un `useEffect`, ni modificar `page.tsx`. Evitar un efecto separado reduce estados transitorios y asegura que `products`, `total` y `totalWithDiscount` cambien atómicamente en un dispatch.

## 8. Estrategia de pruebas (sin implementar en esta etapa)

1. **Reducer unit tests:** añadir casos para precio único, múltiples productos, descuento, precio cero, cantidades decimales y id inexistente. Verificar el objeto completo (`products`, `total`, `totalWithDiscount`) y la inmutabilidad.
2. **PriceEditInput/component test:** con un `BillContext` controlado, confirmar el precio por blur y Enter y verificar que se despacha `updateSalePrice` con el id y número esperados.
3. **Integración de facturación:** montar `BillProvider` + `PrintableTable`/`PriceEditInput`, editar el precio de un producto agregado con precio 0 y comprobar que subtotal, total y total con descuento cambian sin una acción de unidad.
4. **Regresión:** ejecutar la suite existente de Billing, además de `npm run lint` y `npx tsc --noEmit`.

## 9. Verificación Gate G1

- [x] El archivo `ai/features/fix-shortcut-price-total/SPEC.md` existe.
- [x] Contiene requisitos funcionales.
- [x] Contiene criterios de aceptación medibles (`CA-01` a `CA-08`).
- [x] Documenta archivos/interfaces afectados y estrategia de pruebas.
- [x] No implementa código ni tests.
