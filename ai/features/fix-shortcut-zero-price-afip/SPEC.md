# SPEC: Fix AFIP voucher rejection for shortcut products (price not synced, zero-total not validated)

## 1. Contexto y diagnóstico

### 1.1 Reporte del usuario

> "cuando genero una factura con un producto de shortcut (precio variable) el servicio que realiza las facturas me dice que alicuota de iva debe ser distinto de cero"

El servicio externo (Cloud Function `createVoucher`) devuelve el error de AFIP **"alicuota de iva debe ser distinto de cero"** cuando la factura contiene al menos un producto agregado por atajo (F1/F2/F3) con precio variable.

### 1.2 Causa raíz confirmada

Tras trazar el flujo completo de datos, se identifica **dos causas raíz combinadas**:

#### Causa raíz #1 — `price` nunca se sincroniza con `salePrice` para productos de atajo

El campo `Product.price` representa el **precio de costo** (`Product.price` en `prisma/schema.prisma` línea 211, comentado como "Cost price"), mientras que `Product.salePrice` es el **precio de venta al público** que el cajero efectivamente cobra.

Para un producto de atajo (precio variable):

1. `BillButtons.tsx` (líneas 134-141) agrega el producto con `salePrice: 0` y `price` tomado del catálogo (que para variables puede ser `0` o el costo base).
2. `PriceEditInput.tsx` (líneas 49-58) al confirmar el precio tipeado despacha `updateSalePrice`.
3. `BillReducer.ts` (líneas 242-270) en el caso `updateSalePrice` **únicamente actualiza `salePrice`** — no toca `price`.
4. `src/actions/afip.ts` (líneas 48-55) envía al Cloud Function el campo `price` original del producto, **no el `salePrice` confirmado**.
5. El Cloud Function externo lee `product.price` para calcular `importeTotal = Σ price × amount`.

Resultado: para Factura A (tipo 1) o Factura B (tipo 6), el cálculo externo

```typescript
const base = importeTotal / 1.21;
impNeto = 0;    // porque importeTotal = 0
impIVA = 0;     // AFIP rechaza
```

#### Causa raíz #2 — `createAfipVoucherAction` no valida `total > 0` antes de invocar al Cloud Function

`src/actions/afip.ts` no realiza ninguna validación previa del total. Confía ciegamente en que el `BillState` llegue con un total coherente. Si por cualquier motivo el `importeTotal` es 0, se envía igual a AFIP y la AFIP rechaza con un mensaje técnico críptico para el usuario.

Esta segunda causa es **defensa en profundidad**: aunque arreglemos la primera, podría haber otros caminos (futuros cambios, otros tipos de productos, fallos en la carga) que devuelvan un total 0.

### 1.3 Por qué no rompe la venta normal (no shortcuts)

Para productos agregados por búsqueda/escaneo, `price` y `salePrice` vienen ambos del catálogo (`getProductByIdAction` etc.) y típicamente son iguales (o `salePrice` se calcula desde `price + gain`). El Cloud Function lee `price` que es correcto. Por eso solo afecta a productos de atajo.

### 1.4 Archivos relevantes

| Archivo | Líneas | Rol |
|---------|--------|-----|
| `src/components/Billing/BillButtons.tsx` | 134-141 | Agrega producto por shortcut con `salePrice: 0` |
| `src/components/Billing/PriceEditInput.tsx` | 49-58 | Despacha `updateSalePrice` |
| `src/context/BillReducer.ts` | 242-270 | Caso `updateSalePrice` (solo setea `salePrice`) |
| `src/actions/afip.ts` | 45-65 | Serializa `billState` y llama al Cloud Function externo |
| `prisma/schema.prisma` | 211-212 | `price` (cost price) vs `salePrice` (sale price) |
| `src/models/Product.ts` | 10-11 | `price = 0.0`, `salePrice = 0.0` |
| Cloud Function externo (no en repo) | — | Lee `product.price` para calcular `impIVA` |

---

## 2. Objetivo y alcance

### 2.1 Objetivo

Garantizar que cuando un cajero facture un producto agregado por atajo (F1/F2/F3), el comprobante AFIP se genere con el monto correcto (`salePrice` confirmado por el cajero) y que el sistema nunca envíe a AFIP un comprobante con `importeTotal = 0`.

### 2.2 Alcance

- Corregir la serialización del `billState` en `src/actions/afip.ts` para que el Cloud Function reciba el precio correcto (preferentemente `salePrice`, con `price` como fallback solo si `salePrice > 0`).
- Agregar validación temprana en `createAfipVoucherAction` que rechace una factura con `total <= 0` antes de invocar al Cloud Function, retornando un mensaje legible en español.
- **No** modificar el reducer, `PriceEditInput`, ni la UI: ya funcionan correctamente para la lógica de negocio (`salePrice`); el problema es exclusivamente que `afip.ts` envía el campo equivocado.
- **No** modificar el Cloud Function externo (está fuera del repo; será arreglado en un PR aparte si se requiere defensa adicional).
- No romper la facturación AFIP para productos normales (no shortcut).
- No romper Remito, Presupuesto, A cuenta u otros flujos.

### 2.3 Fuera de alcance

- Cambiar el modelo `Product` o `BillState`.
- Cambiar la definición de `price` vs `salePrice` en Prisma.
- Modificar el Cloud Function externo.
- Cambiar la UI de `PriceEditInput` o su flujo de autofocus.
- Agregar dependencias.

---

## 3. Requisitos funcionales

### 3.1 Mapeo de precio correcto en la serialización

1. En `src/actions/afip.ts`, al construir `minimalBillState.products`, el campo `price` enviado al Cloud Function debe ser el **precio efectivo de venta** que el cajero confirmó, es decir `product.salePrice` (cuando `salePrice > 0`).
2. Si por alguna razón `salePrice === 0` pero `price > 0` (caso normal, no shortcut), enviar `price` como antes (compatibilidad con productos del catálogo).
3. El campo `salePrice` se sigue enviando tal cual (no se elimina del payload) para no romper consumidores que ya lo lean.
4. El campo `amount` se preserva sin cambios.

### 3.2 Validación previa del total

5. `createAfipVoucherAction` debe computar el `effectiveTotal` real (sumando `price × amount` sobre los productos serializados, con el precio efectivo calculado en 3.1) **antes** de invocar al Cloud Function.
6. Si `effectiveTotal <= 0`, retornar `{ error: "No se puede generar la factura: el monto total debe ser mayor a 0" }` **sin** llamar al Cloud Function.
7. Esta validación debe ocurrir después de la autenticación y la carga de credenciales, pero antes de la llamada HTTP a Firebase.

### 3.3 Mensaje al usuario

8. El error retornado debe ser un mensaje en español, claro y sin tecnicismos (no debe filtrar el mensaje crudo de AFIP cuando el origen es validación local).
9. El toast actual en `BillButtons.tsx` (línea 217) ya muestra `resp.error` con `toast.error(resp.error)`, por lo que el usuario verá el mensaje automáticamente.

### 3.4 Compatibilidad

10. Productos agregados por búsqueda/escaneo (no shortcut) deben seguir facturando con el mismo `price` que ya enviaban.
11. Productos de atajo con `salePrice` confirmado (caso del bug) deben enviar `price = salePrice` y la factura debe generarse correctamente.
12. Productos de atajo donde el cajero **no** confirmó el precio (salePrice sigue en 0) deben ser rechazados por la validación de 3.2 con un mensaje claro, **antes** de llegar a AFIP.

---

## 4. Criterios de aceptación medibles

### 4.1 Serialización correcta (frontend → Cloud Function)

- **CA-01 — Producto de atajo con precio confirmado:** dado un `billState` con un producto `{ id: "p1", price: 0, salePrice: 150.50, amount: 1 }`, el payload HTTP enviado al Cloud Function debe contener `products[0].price === 150.50` (no `0`).
- **CA-02 — Producto normal de catálogo:** dado un `billState` con un producto `{ id: "p2", price: 100, salePrice: 100, amount: 2 }`, el payload debe contener `products[0].price === 100` (sin cambios respecto al comportamiento actual).
- **CA-03 — Mezcla de productos:** con un producto de atajo y uno normal, ambos precios efectivos deben calcularse independientemente según su propia lógica.
- **CA-04 — Múltiples unidades:** con `salePrice: 50, amount: 3`, el `effectiveTotal` debe ser `150` (no `0`).

### 4.2 Validación de total > 0

- **CA-05 — Total cero:** si `effectiveTotal === 0`, `createAfipVoucherAction` debe retornar `{ error: "No se puede generar la factura: el monto total debe ser mayor a 0" }` **sin** haber realizado ninguna llamada HTTP saliente al Cloud Function.
- **CA-06 — Total negativo:** si `effectiveTotal < 0` (caso teórico), debe retornar el mismo error.
- **CA-07 — Total positivo:** si `effectiveTotal > 0`, la acción debe proceder con la llamada al Cloud Function normalmente.
- **CA-08 — Mensaje en español:** el mensaje retornado debe estar en español y no incluir el stack trace ni el código de error técnico de AFIP.

### 4.3 Integración con la UI

- **CA-09 — Toast visible:** cuando la validación local retorna error, `BillButtons.tsx.handleCreateVoucher` debe mostrar el mensaje mediante `toast.error(resp.error)`.
- **CA-10 — No imprimir comprobante en error:** el flujo existente en `BillButtons.tsx` (líneas 608-622) ya aborta la impresión si `caeResult` es null; no debe haber cambios de comportamiento para ese flujo.
- **CA-11 — El producto de atajo sin precio no debe llegar a AFIP:** si el cajero presiona F1 (atajo) y luego "Facturar" sin tipear el precio, el sistema debe rechazar la factura localmente con el mensaje de CA-05, sin gastar una llamada a AFIP.

### 4.4 No regresión

- **CA-12 — Factura con productos normales:** una factura normal con productos del catálogo (no shortcut) debe seguir funcionando exactamente igual que antes; no hay cambios en el payload para esos casos.
- **CA-13 — Remito / Presupuesto / A cuenta:** no se modifican; siguen usando `salePrice` como hasta ahora.
- **CA-14 — Validación existente previa a la action:** la validación previa a `createAfipVoucherAction` en `BillButtons.tsx` (líneas 308-313) ya cubre `totalAmount <= 0` para `createSale`. Esto es defensa en **doble capa** (UI + server action). No se elimina la validación de UI.
- **CA-15 — Tipos:** la firma de `createAfipVoucherAction(billState: BillState)` no cambia. Solo cambia el contenido del payload interno.
- **CA-16 — Build y lint:** `npm run lint` y `npx tsc --noEmit` deben pasar sin errores.

---

## 5. Escenarios edge

- **E1 — Producto con `price = 0, salePrice = 0, amount = 1`:** la validación debe rechazar la factura localmente. El Cloud Function NO debe ser invocado.
- **E2 — Producto con `price = 100, salePrice = 0, amount = 1`** (caso normal donde el cajero no aplicó ajuste): se envía `price = 100` (no se invierte la regla). Funciona como antes.
- **E3 — Producto con `price = 0, salePrice = 50.5, amount = 2`:** se envía `price = 50.5` (el `salePrice` confirmado). El Cloud Function calcula `importeTotal = 101` y `impIVA ≠ 0`. ✅ Caso del bug.
- **E4 — Descuento aplicado:** si al producto anterior se le aplica un descuento global del 10%, `effectiveTotal = 90.9` (o según la regla de redondeo del frontend). Debe pasar la validación.
- **E5 — Lista de productos vacía:** `products.length === 0` → `effectiveTotal = 0` → rechazado por validación local.
- **E6 — `NaN` o `undefined` en `salePrice`:** si llegara un valor no numérico, `Number.isFinite()` debe proteger y considerar el precio como `0`. Defensa en profundidad.
- **E7 — `amount` decimal o negativo:** la validación actual del reducer ya maneja `amount > 0`. El cálculo en `afip.ts` debe usar `Math.max(0, amount)` para no transmitir valores negativos.
- **E8 — Fallo de validación previo (`requireFeature`):** el nuevo chequeo de total debe ejecutarse **después** de `requireFeature` y `getArcaCredentialsForBilling`, pero **antes** de la llamada HTTP. No debe ejecutarse si la autenticación falla.

---

## 6. Diseño propuesto

### 6.1 Helper para precio efectivo

Crear un helper interno en `src/actions/afip.ts` (no hace falta archivo separado porque la lógica es trivial):

```typescript
/** Returns the effective unit price for AFIP billing.
 *  - For shortcut products (variable price), salePrice is the source of truth.
 *  - For catalog products, price is the source of truth.
 *  - Falls back to the other field if the primary is 0/invalid.
 */
const getEffectiveUnitPrice = (p: { price: number; salePrice: number }): number => {
  if (Number.isFinite(p.salePrice) && p.salePrice > 0) return p.salePrice;
  if (Number.isFinite(p.price) && p.price > 0) return p.price;
  return 0;
};
```

### 6.2 Serialización corregida

En `src/actions/afip.ts`, reemplazar la sección `products: billStateWithoutPtoVenta.products.map(...)` (líneas 48-55) por:

```typescript
products: billStateWithoutPtoVenta.products.map((p) => {
  const effectivePrice = getEffectiveUnitPrice(p);
  return {
    id: p.id,
    code: p.code,
    description: p.description,
    price: effectivePrice,        // <-- antes era p.price (siempre 0 para shortcuts)
    salePrice: p.salePrice,
    amount: Math.max(0, Number(p.amount) || 0),
  };
}),
```

### 6.3 Validación previa al Cloud Function

Inmediatamente después de construir `minimalBillState` y **antes** del `axios.post`, agregar:

```typescript
// Validate total before calling the cloud function to avoid AFIP rejection.
const effectiveTotal = minimalBillState.products.reduce(
  (sum, p) => sum + p.price * p.amount,
  0
);

if (effectiveTotal <= 0) {
  return {
    error: "No se puede generar la factura: el monto total debe ser mayor a 0",
  };
}
```

### 6.4 Diagrama de flujo actualizado

```
BillButtons.handleCreateVoucher
  │
  ├─► createAfipVoucherAction(BillState)
  │     │
  │     ├─► requireFeature("hasAfipBilling")   // auth gate
  │     │
  │     ├─► getArcaCredentialsForBilling()     // carga cert/key
  │     │
  │     ├─► [NUEVO] getEffectiveUnitPrice()    // mapeo de precio
  │     │
  │     ├─► construir minimalBillState
  │     │
  │     ├─► [NUEVO] calcular effectiveTotal
  │     │
  │     ├─► [NUEVO] si effectiveTotal <= 0  → return { error }
  │     │
  │     └─► axios.post(Cloud Function URL)      // solo si pasa la validación
  │           │
  │           └─► Cloud Function.createVoucher
  │                 │
  │                 └─► AFIP SDK
  │
  ├─► si resp.error → toast.error(resp.error)
  │
  └─► si resp.success → dispatch({ type: "CAE", payload: newCAE })
```

---

## 7. Interfaces y archivos afectados

### 7.1 Archivos modificados

| Archivo | Cambio |
|---------|--------|
| `src/actions/afip.ts` | Añadir helper `getEffectiveUnitPrice`; usar precio efectivo en serialización; añadir validación de `effectiveTotal > 0` antes de la llamada HTTP |

### 7.2 Archivos NO modificados (intencionalmente)

| Archivo | Razón |
|---------|-------|
| `src/context/BillReducer.ts` | El reducer ya calcula `total` correctamente con `salePrice * amount` (cf. SPEC `fix-shortcut-price-total`). El bug es exclusivamente en la serialización. |
| `src/components/Billing/PriceEditInput.tsx` | Ya despacha `updateSalePrice` correctamente. |
| `src/components/Billing/BillButtons.tsx` | La validación de UI en líneas 308-313 (`totalAmount <= 0`) sigue como primera línea de defensa. El nuevo chequeo es defensa en profundidad. |
| `src/models/Product.ts` | `price` y `salePrice` tienen semántica clara: cost vs sale. No se cambia. |
| `prisma/schema.prisma` | No se modifica. |
| `src/context/BillContext.tsx` / `BillProvider.tsx` | No requieren cambios. |
| Cloud Function externo | Se documenta la corrección pero no es parte de este PR (out of repo). |

### 7.3 Dependencias y persistencia

No se requieren dependencias nuevas, migraciones Prisma, cambios de schema, ni variables de entorno.

---

## 8. Estrategia de pruebas (sin implementar en esta etapa)

### 8.1 Tests unitarios del helper (Vitest)

1. **`getEffectiveUnitPrice` con salePrice > 0, price = 0:** retorna `salePrice`.
2. **`getEffectiveUnitPrice` con salePrice = 0, price > 0:** retorna `price`.
3. **`getEffectiveUnitPrice` con ambos = 0:** retorna `0`.
4. **`getEffectiveUnitPrice` con salePrice = NaN:** retorna `0` (no rompe).
5. **`getEffectiveUnitPrice` con salePrice = -5:** retorna `0` (no se transmiten precios negativos).

### 8.2 Tests de la validación de total

6. **`createAfipVoucherAction` con `effectiveTotal = 0`:** retorna `{ error: "No se puede generar la factura: el monto total debe ser mayor a 0" }` y **no** llama al Cloud Function (verificable con `axios.post` mockeado y `expect(axios.post).not.toHaveBeenCalled()`).
7. **`createAfipVoucherAction` con `effectiveTotal > 0`:** llama al Cloud Function normalmente.
8. **Validación ocurre después de `requireFeature`:** si `requireFeature` falla, la validación de total no se ejecuta.

### 8.3 Tests de integración / componente

9. **BillButtons con producto de atajo sin precio:** confirmar que el toast muestra el mensaje de error y que no se imprime comprobante.
10. **BillButtons con producto de atajo con precio:** confirmar que la llamada al Cloud Function se hace y que el CAE se almacena.

### 8.4 Regresión

11. Ejecutar la suite existente de `vitest` (cuando exista) + `npm run lint` + `npx tsc --noEmit`.

---

## 9. Verificación Gate G1

- [x] El archivo `ai/features/fix-shortcut-zero-price-afip/SPEC.md` existe.
- [x] Contiene diagnóstico de causa raíz con referencias a archivos y líneas.
- [x] Contiene requisitos funcionales.
- [x] Contiene criterios de aceptación medibles (`CA-01` a `CA-16`).
- [x] Documenta archivos/interfaces afectados y estrategia de pruebas.
- [x] No implementa código ni tests.
- [x] Describe el cambio mínimo (una única server action) sin sobrediseñar.
