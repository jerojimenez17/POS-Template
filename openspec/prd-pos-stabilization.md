# PRD: POS Stabilization — Plan por Fases

> **Source:** `Untitled2.md`  
> **Propósito:** Roadmap ejecutable para AI agents en flujo SDD  
> **Entry point:** `/sdd-new <nombre-del-cambio>` sobre cada fase

---

## 1. Resumen Ejecutivo

El sistema POS tiene bugs activos que afectan integridad de datos, UX y el sistema de planes. Este PRD organiza todo en **5 fases secuenciales** priorizadas por impacto:

| Fase | Nombre | Impacto | Dependencias |
|------|--------|---------|-------------|
| 1 | 🔴 Integridad de datos | Data corruption | Ninguna |
| 2 | 🔴 Bugs críticos | UX rota, crashes | Ninguna |
| 3 | 🟡 Mejoras UI | Consistencia visual | Ninguna |
| 4 | 🔴 Enforcement de planes + Schema refactor | Fuga de ingresos, duplicación | Migración DB |
| 5 | 🟡 Plan DEMO | Nuevo feature | Fase 4 |

---

## 2. Línea Base: Arquitectura Actual

### Stack
- Next.js 15, React 19, TypeScript strict, Prisma/PostgreSQL, NextAuth v5
- Feature gates: `src/lib/feature-gates.ts` con `requireFeature(businessId, feature)`
- Planes: `Plan` enum (`BASIC`, `PRO`, `ENTERPRISE`) en `BusinessFeatures` model
- Account status: `BusinessStatus` enum (`ACTIVO`, `MOROSO`, `DESACTIVADO`)

### Feature Gates Existentes
| Feature | Campo DB | ¿Enforced? |
|---------|----------|-----------|
| `afip-billing` | `hasAfipBilling` | ✅ Sí (parcial — bug FR-010) |
| `public-catalog` | `hasPublicCatalog` | ❓ No verificado |
| `client-ledger` | `hasClientLedger` | ❓ No verificado |
| `multi-cashbox` | `hasMultiCashbox` | ❓ No verificado |
| `supplier-filter` | `hasSupplierFilter` | ❓ No verificado |

### Problema de Duplicación: BusinessFeatures vs PlanDefinition

Actualmente hay **8 campos duplicados** entre dos modelos:

**`BusinessFeatures`** (per-business)
```prisma
model BusinessFeatures {
  plan              Plan     @default(BASIC)
  hasAfipBilling    Boolean  @default(false)   // ← DUPLICADO
  hasPublicCatalog  Boolean  @default(false)   // ← DUPLICADO
  hasClientLedger   Boolean  @default(false)   // ← DUPLICADO
  hasMultiCashbox   Boolean  @default(false)   // ← DUPLICADO
  hasSupplierFilter Boolean  @default(false)   // ← DUPLICADO
  hasBudget         Boolean  @default(false)   // ← DUPLICADO
  maxUsers          Int      @default(1)       // ← DUPLICADO
  maxProducts       Int      @default(100)     // ← DUPLICADO
}
```

**`PlanDefinition`** (plantilla/template)
```prisma
model PlanDefinition {
  name              String   @unique           // "BASIC" | "PRO" | "ENTERPRISE"
  hasAfipBilling    Boolean  @default(false)   // ← DUPLICADO
  hasPublicCatalog  Boolean  @default(false)   // ← DUPLICADO
  hasClientLedger   Boolean  @default(false)   // ← DUPLICADO
  hasMultiCashbox   Boolean  @default(false)   // ← DUPLICADO
  hasSupplierFilter Boolean  @default(false)   // ← DUPLICADO
  hasBudget         Boolean  @default(false)   // ← DUPLICADO
  maxUsers          Int      @default(1)       // ← DUPLICADO
  maxProducts       Int      @default(100)     // ← DUPLICADO
}
```

**Problemas que genera:**
1. `PlanDefinition` no se usa en runtime — es un template muerto
2. Pueden desincronizarse: cambiar `PlanDefinition` no actualiza `BusinessFeatures` existentes
3. `BusinessFeatures` puede tener combinaciones inválidas (ej: `plan: BASIC` con `hasMultiCashbox: true`)
4. No hay defaulting desde plantilla — los `@default()` están hardcodeados

### Límites en Schema (NO enforced actualmente)
| Límite | Existe en DB | ¿Enforced? |
|--------|-------------|-----------|
| `maxUsers` | ✅ `BusinessFeatures.maxUsers` | ❌ No |
| `maxProducts` | ✅ `BusinessFeatures.maxProducts` | ❌ No |
| `maxClients` | ❌ No existe | ❌ No |
| accountStatus | ✅ `Business.accountStatus` | ❌ No |

---

## 3. Fase 1: Integridad de Datos 🔴

> **Objetivo:** Eliminar bugs que corrompen datos.  
> **Entry point:** `/sdd-new fix-invoice-flow`

### FR-001: Facturar con feature deshabilitado — NO debe guardar la venta

**Líneas:** 28-34

**Problema (crítico):** Cuando el usuario hace clic en "Facturar" y la facturación electrónica no está habilitada en su plan, el sistema:
1. Muestra toast "No está habilitado en el plan"
2. **Además** muestra otro toast "Factura generada"  
3. **Guarda la venta igual**
4. **Limpia el carrito**
5. **La venta aparece en Cuenta Corriente** (nunca debería)

**Comportamiento esperado:**
- Verificar feature gate `afip-billing` **antes** de iniciar la transacción
- Si no está habilitado: mostrar modal "Feature no disponible en tu plan" + botón de contacto WhatsApp (`+54 9 2265 41-8113`). El modal debe tener una UI moderna, minimalista y que se luzca.
- NO guardar la venta
- NO limpiar el carrito
- NO insertar en cuenta corriente

**Criterios de aceptación:**
- [ ] Feature gate se ejecuta antes de cualquier operación de DB
- [ ] Si falla el gate, la venta permanece intacta en el carrito
- [ ] Modal reemplaza al toast
- [ ] No hay inserción en account ledger
- [ ] Test: feature disabled → sale NOT saved, cart NOT cleared

### FR-002: Auditar plan enforcement — UI / Actions / DB

**Líneas:** 41

**Problema:** No hay auditoría de que los límites de cada plan se cumplan en las tres capas.

**Comportamiento esperado:**
- Inventory sistemático por módulo: UI → server action → DB query
- Para cada feature gate y cada límite, verificar que las 3 capas estén alineadas
- Documentar gaps

**Criterios de aceptación:**
- [ ] Inventario de todos los feature gates con estado en UI / Actions / DB
- [ ] Gaps documentados para resolver en Fase 4

---

## 4. Fase 2: Bugs Críticos 🔴

> **Objetivo:** Eliminar crashes, datos incorrectos y acciones sin protección.  
> **Entry point:** `/sdd-new fix-critical-bugs`

### FR-003: Mensajes de feature no habilitado — Modal consistente

**Líneas:** 5-9

**Problema:** Los mensajes de "feature no habilitado" usan toast, fácil de ignorar y sin contexto.

**Comportamiento esperado:**
Modal unificado:
- Título: "Funcionalidad no disponible"
- Cuerpo: "Esta funcionalidad no está incluida en tu plan actual."
- Botón: "Contactar por WhatsApp" → `https://wa.me/5492265418113`
- Botón: "Entendido"
- Variantes: **feature no disponible**, **pago vencido** (bloquea TODO), **acción bloqueada por plan** (con sugerencia upgrade)

**Criterios de aceptación:**
- [ ] Modal reemplaza todos los `FeatureNotEnabledError` toast
- [ ] Caso "pago vencido" con wording + bloqueo total
- [ ] Componente `<FeatureBlockedModal reason="plan" | "overdue" feature="..." />`

### FR-004: Catálogo — Crash cuando no está disponible

**Líneas:** 24-25

**Problema:** Catálogo crashea cuando el feature no está disponible.

**Comportamiento esperado:**
- Modal FR-003
- Error boundary
- Empty state si habilitado pero sin productos

**Criterios de aceptación:**
- [ ] No crashea
- [ ] Error boundary presente

### FR-005: Vender — Eliminar producto sin confirmación

**Línea:** 27

**Problema:** Se borra el producto inmediatamente sin confirmación.

**Comportamiento esperado:**
- Modal: "¿Eliminar [producto] de la venta?"
- Botones: "Cancelar" / "Eliminar"
- Usar `alert-dialog.tsx`

**Criterios de aceptación:**
- [ ] Modal de confirmación
- [ ] Cancelar no elimina

### FR-006: Cajas — Navegar hacia atrás

**Línea:** 20-21

**Problema:** Back navigation no va a home.

**Comportamiento esperado:**
- Back → home del negocio
- Sin perder sesión de caja

### FR-007: Cuentas Corrientes — Muestra ventas

**Líneas:** 22-23

**Problema:** La vista de CC muestra ventas en lugar de solo cuentas corrientes.

**Comportamiento esperado:**
- Solo clientes con balance ≠ 0 o deuda
- Diferenciar visualmente de Ventas

### FR-008: Ventas — Filtro del día

**Línea:** 35-36

**Problema:** Filtro "Ventas del día" no funciona correctamente.

**Comportamiento esperado:**
- Rango: 00:00:00.000 a 23:59:59.999 (timezone Argentina)

### FR-009: Stock — Foto del producto

**Línea:** 37-38

**Problema:** Foto no se renderiza en tabla de stock.

**Comportamiento esperado:**
- Mostrar `ProductImage[0].url`
- Placeholder si no hay foto

### FR-010: Crear Vendedor — No limpia campos

**Líneas:** 39-40

**Problema:** Formulario conserva datos anteriores post-creación.

**Comportamiento esperado:**
- Reset post-creación exitosa
- Toast + actualizar lista

### FR-011: Editar Ventas — Botón Actualizar

**Líneas:** 12-17

**Problema múltiple:**
1. Botón "Actualizar Venta" perdido (mismo color que "Facturar")
2. 3 botones que deberían ser 1
3. Cambio de condición no se refleja en legacy
4. Sin política definida para ventas facturadas (ARCA)

**Comportamiento esperado:**
- Botón "Actualizar Venta" visible, color distinto a "Facturar"
- Un solo botón de actualizar
- Legacy: refrescar condición al actualizar
- Pendiente: definir política ARCA para ventas facturadas

**Criterios de aceptación:**
- [ ] Botón visible y funcional
- [ ] Color distintivo
- [ ] Condición se refleja correctamente
- [ ] Decisión documentada sobre ventas facturadas

---

## 5. Fase 3: Mejoras UI 🟡

> **Objetivo:** Consistencia visual y UX pulida.  
> **Entry point:** `/sdd-new improve-ux`

### FR-012: Cajas — Botón de borrar

**Líneas:** 3-4

**Problema:** No sigue el diseño de stock.

**Comportamiento esperado:**
- Usar `<DeleteButton />` compartido
- Misma posición, color, icono
- Modal confirmación (reutilizar FR-005)

### FR-013: Modal Producto — Asteriscos correctos

**Líneas:** 10-11

**Problema:** Asteriscos en campos no obligatorios.

**Comportamiento esperado:**
- Solo obligatorios: `code`, `description`, `price`, `amount`
- Opcionales sin asterisco o con "(opcional)"
- Coherente con `ProductSchema`

### FR-014: Editar Ventas — Layout

**Líneas:** 12-13

**Problema:** Layout pobre comparado con facturar.

**Comportamiento esperado:**
- Layout similar a pantalla "Facturar"
- Revisar `upstream/main`

---

## 6. Fase 4: Schema Refactor + Enforcement de Planes 🔴

> ⚠️ **IMPORTANTE:** Esta fase incluye un refactor de schema que impacta TODO el sistema de planes.  
> No es solo agregar validaciones — es cambiar la arquitectura de datos primero, y luego construir el enforcement sobre la nueva base.  
>
> **Requiere:** Migración de DB + refactor de `feature-gates.ts` + actualización de todas las server actions que leen features/límites  
> **Entry point:** `/sdd-new schema-plan-refactor`

---

### FR-100: Refactor Schema — PlanDefinition como fuente de verdad

**Problema de raíz:** `BusinessFeatures` y `PlanDefinition` tienen los mismos 8 campos duplicados. `PlanDefinition` existe pero nadie lo lee en runtime. Esto genera inconsistencias, ausencia de defaults desde plantilla, y combinaciones inválidas.

#### Schema Post-Refactor

**`PlanDefinition`** — pasa a ser la fuente de verdad:

```prisma
model PlanDefinition {
  id          String   @id @default(cuid())
  name        String   @unique    // "BASIC" | "PRO" | "ENTERPRISE" | "DEMO"
  description String?

  // Pricing
  price       Float    @default(0)

  // Feature flags
  hasAfipBilling    Boolean @default(false)
  hasPublicCatalog  Boolean @default(false)
  hasClientLedger   Boolean @default(false)
  hasMultiCashbox   Boolean @default(false)
  hasSupplierFilter Boolean @default(false)
  hasBudget         Boolean @default(false)

  // Operational Limits
  maxUsers    Int @default(1)
  maxProducts Int @default(100)
  maxClients  Int @default(50)       // ← NUEVO

  // Metadata
  isActive    Boolean @default(true)
  displayOrder Int    @default(0)
  isDefault   Boolean @default(false)

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@map("plan_definitions")
}
```

**`BusinessFeatures`** — se simplifica a solo identidad + overrides:

```prisma
model BusinessFeatures {
  id         String   @id @default(cuid())
  businessId String   @unique
  business   Business @relation(fields: [businessId], references: [id], onDelete: Cascade)

  plan Plan @default(BASIC)

  // Overrides opcionales — null = usar default del PlanDefinition
  // Formato: { "hasAfipBilling": true, "maxUsers": 10 }
  overrides  Json?

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([businessId])
}
```

**`Plan` enum** — se le agrega `DEMO`:

```prisma
enum Plan {
  BASIC
  PRO
  ENTERPRISE
  DEMO        // ← NUEVO
}
```

#### Resolver Function

Nueva función central que reemplaza la lectura directa de `BusinessFeatures`:

```typescript
// src/lib/plan-resolver.ts

export interface ResolvedPlan {
  plan: Plan
  features: {
    hasAfipBilling: boolean
    hasPublicCatalog: boolean
    hasClientLedger: boolean
    hasMultiCashbox: boolean
    hasSupplierFilter: boolean
    hasBudget: boolean
  }
  limits: {
    maxUsers: number
    maxProducts: number
    maxClients: number          // ← NUEVO
  }
  // Para plan DEMO
  isTrial: boolean
  trialEndsAt: Date | null
  dailyLimits: DailyLimits | null
}

export async function getEffectivePlan(businessId: string): Promise<ResolvedPlan> {
  const bf = await db.businessFeatures.findUnique({
    where: { businessId },
  });
  if (!bf) throw new Error("BusinessFeatures not found");

  // 1. Obtener defaults del plan
  const planDef = await db.planDefinition.findUnique({
    where: { name: bf.plan },
  });
  if (!planDef) throw new Error(`PlanDefinition not found for ${bf.plan}`);

  // 2. Aplicar overrides (si existen)
  const overrides = (bf.overrides as Record<string, any>) || {};

  const features = {
    hasAfipBilling: overrides.hasAfipBilling ?? planDef.hasAfipBilling,
    hasPublicCatalog: overrides.hasPublicCatalog ?? planDef.hasPublicCatalog,
    hasClientLedger: overrides.hasClientLedger ?? planDef.hasClientLedger,
    hasMultiCashbox: overrides.hasMultiCashbox ?? planDef.hasMultiCashbox,
    hasSupplierFilter: overrides.hasSupplierFilter ?? planDef.hasSupplierFilter,
    hasBudget: overrides.hasBudget ?? planDef.hasBudget,
  };

  const limits = {
    maxUsers: overrides.maxUsers ?? planDef.maxUsers,
    maxProducts: overrides.maxProducts ?? planDef.maxProducts,
    maxClients: overrides.maxClients ?? planDef.maxClients,
  };

  // 3. Trial info (solo para DEMO)
  const isTrial = bf.plan === "DEMO";
  const trialEndsAt = isTrial ? await getTrialEndDate(businessId) : null;
  const dailyLimits = isTrial ? DEMO_DAILY_LIMITS : null;

  return { plan: bf.plan, features, limits, isTrial, trialEndsAt, dailyLimits };
}

// Helper para feature gates
export async function requireFeature(businessId: string, feature: Feature): Promise<void> {
  const effective = await getEffectivePlan(businessId);
  const field = FEATURE_MAP[feature]; // mapea "afip-billing" → "hasAfipBilling"
  
  if (!effective.features[field]) {
    throw new FeatureNotEnabledError(feature);
  }
}

// Helper para límites
export async function checkLimit(
  businessId: string,
  resource: "products" | "users" | "clients",
  currentCount: number
): Promise<void> {
  const effective = await getEffectivePlan(businessId);
  const limitKey = `max${resource.charAt(0).toUpperCase() + resource.slice(1)}` as keyof typeof effective.limits;
  const limit = effective.limits[limitKey];
  
  if (limit !== null && currentCount >= limit) {
    throw new PlanLimitError(resource, limit);
  }
}
```

#### Feature Gate Refactor

`src/lib/feature-gates.ts` se simplifica:

```typescript
// ANTES: leía directo de BusinessFeatures
const features = await db.businessFeatures.findUnique({ where: { businessId } });
if (!features?.hasAfipBilling) throw new FeatureNotEnabledError("afip-billing");

// DESPUÉS: resuelve desde PlanDefinition + overrides
const effective = await getEffectivePlan(businessId);
if (!effective.features.hasAfipBilling) throw new FeatureNotEnabledError("afip-billing");
```

#### Migración de Datos

La migración debe:
1. **Seed `PlanDefinition`** con los 3 planes (BASIC, PRO, ENTERPRISE) si no existen
2. **Migrar cada `BusinessFeatures`**: los valores actuales de cada negocio se convierten en `overrides` si difieren de su plan. Si coinciden con el plan, se ponen en null (dejan de ser overrides)
3. **Agregar columna `overrides`** y dropear las 8 columnas redundantes

```
Algoritmo de migración por negocio:
  planDef = PlanDefinition.find(name = bf.plan)
  overrides = {}
  
  for each field in [hasAfipBilling, hasPublicCatalog, ..., maxUsers, maxProducts]:
    if bf[field] != planDef[field]:
      overrides[field] = bf[field]   // preservar el override existente
    // si es igual, no va a overrides (se resuelve del plan)
  
  BusinessFeatures.update({
    where: { id: bf.id },
    data: { overrides }
  })
  
  // luego del migration: dropear columnas viejas
```

**Riesgo controlado:** Cualquier negocio con valores customizados preserva sus overrides. Los que están en default no pierden nada.

#### Criterios de Aceptación

- [ ] `PlanDefinition` creada con rows BASIC, PRO, ENTERPRISE
- [ ] `BusinessFeatures` migrada: columnas redundantes eliminadas, `overrides` poblado
- [ ] `getEffectivePlan()` funciona: devuelve plan defaults + overrides mergeados
- [ ] `requireFeature()` refactorizada: usa el resolver, no lee directo de BusinessFeatures
- [ ] `checkLimit()` nueva: usa el resolver
- [ ] `Plan` enum incluye `DEMO`
- [ ] `PlanDefinition` incluye `maxClients`
- [ ] Tests: plan sin overrides devuelve defaults; plan con overrides los aplica; feature gate funciona con overrides
- [ ] Rollback plan definido

---

### FR-015: Límite de productos — Enforcement real

**Líneas:** 41

**Problema:** `maxProducts` nunca se verifica. Un negocio BASIC puede tener productos infinitos.

**Comportamiento esperado:**
```typescript
// Server Action: createProduct
const count = await db.product.count({ where: { businessId } });
await checkLimit(businessId, "products", count);
```
- UI muestra contador: "47 / 100 productos usados"
- Al llegar al límite: botón deshabilitado + tooltip + modal

**Criterios de aceptación:**
- [ ] Backend bloquea con `PlanLimitError`
- [ ] UI muestra contador
- [ ] UI bloquea creación en el límite

### FR-016: Límite de usuarios — Enforcement real

**Línea:** 41

**Problema:** `maxUsers` no está verificado en backend.

**Comportamiento esperado:**
- Mismo patrón FR-015 con `checkLimit(businessId, "users", count)`

**Criterios de aceptación:**
- [ ] Backend bloquea
- [ ] UI oculta el botón en el límite

### FR-017: Límite de clientes — Enforcement real

**Línea:** 42

**Problema:** No existe `maxClients`. BASIC y PRO permiten clientes infinitos.

**Nota:** Ya no se agrega a `BusinessFeatures` — se agrega a `PlanDefinition` como parte del FR-100.

**Defaults:**
| Plan | maxClients |
|------|-----------|
| BASIC | 50 |
| PRO | 500 |
| ENTERPRISE | null (sin límite) |

**Comportamiento esperado:**
- Mismo patrón FR-015 con `checkLimit(businessId, "clients", count)`

**Criterios de aceptación:**
- [ ] `PlanDefinition` tiene `maxClients` (FR-100)
- [ ] Backend bloquea
- [ ] UI muestra contador

### FR-018: Multi-cashbox — Verificar enforcement

**Línea:** 41

**Problema:** `hasMultiCashbox` existe pero no se sabe si está enforced en 3 capas.

**Comportamiento esperado:**
- Refactorizado para usar `getEffectivePlan()` → `effective.features.hasMultiCashbox`
- Verificar en UI + action + DB

**Criterios de aceptación:**
- [ ] Backend gate funcional
- [ ] UI oculta segunda caja

### FR-019: Catalog access — Verificar enforcement

**Línea:** 41

**Comportamiento esperado:**
- Refactorizado para usar `getEffectivePlan()`
- BASIC: sin catálogo público

### FR-020: Account Ledger — Gate para plan sin CC

**Línea:** 42

**Problema:** Planes sin `hasClientLedger` permiten crear clientes desde "A Cuenta".

**Comportamiento esperado:**
- Refactorizado para usar `getEffectivePlan()`
- Sin ledger: no mostrar "A Cuenta" como método de pago + backend gate

### FR-021: Ruta protegida — Account Ledger

**Líneas:** 22-23, 41

**Problema:** Además del bug de visibilidad, la ruta `/account-ledger` no está protegida por plan.

**Comportamiento esperado:**
- Ruta protegida por `getEffectivePlan().features.hasClientLedger`
- Si no: modal FR-003

---

## 7. Fase 5: Plan DEMO 🟡

> **Objetivo:** Plan de prueba gratuito de 30 días.  
> **Depende de:** Fase 4 (necesita el schema refactor + resolver)  
> **Entry point:** `/sdd-new demo-plan`

### FR-022: Plan DEMO — 30 días full con límites diarios

**Líneas:** 44-46

**Problema:** No existe plan de prueba. Nuevos usuarios no pueden evaluar el sistema.

**Comportamiento esperado:**

**Schema:**
- `DEMO` agregado al enum `Plan` (FR-100)
- `PlanDefinition` con row `DEMO`: todos los features en `true`, `maxUsers=2`, `maxClients=100`, `maxProducts=500`
- Límites diarios se manejan por separado (no en PlanDefinition)

**Comportamiento:**
- 30 días desde el registro
- Features: todos habilitados
- Límites diarios (resetean 00:00 Argentina):
  | Recurso | Límite diario |
  |---------|--------------|
  | Ventas | 3 |
  | Productos creados | 5 |
  | Clientes creados | 2 |
  | Usuarios creados | 2 (total, no diario) |
  | Cajas | 1 |
- Countdown UI: "Quedan 24 días de prueba"
- Contadores UI: "Hoy: 2/3 ventas"
- Al expirar: auto-downgrade a BASIC (USAR el resolver: cambiar `plan` a BASIC, sin overrides)
- Al actualizar a plan pago: cambiar `plan` y limpiar `overrides`

**Consideración post-FR-100:** Como `BusinessFeatures` ahora solo tiene `plan` + `overrides`, migrar de DEMO a BASIC es simplemente cambiar el enum. Los overrides del DEMO se limpian y el negocio hereda los defaults de BASIC.

**Criterios de aceptación:**
- [ ] Usuario registrado obtiene DEMO automáticamente
- [ ] `getEffectivePlan()` resuelve DEMO correctamente
- [ ] Límites diarios enforced en backend
- [ ] Countdown + contadores visibles
- [ ] Auto-downgrade a los 30 días
- [ ] Upgrade a pago: limpia DEMO y overrides

---

## 8. Plan de Ejecución SDD

### Dependencias entre fases

```
Fase 1 (Integridad datos)
  │
  ├──→ Fase 2 (Bugs críticos) — paralelo
  │       │
  │       └──→ Fase 3 (Mejoras UI) — después de F2
  │
  └──→ Fase 4 (Schema refactor + Enforcement) — paralelo con F2, PERO:
          │
          ├──→ FR-100 (Schema refactor) va PRIMERO
          ├──→ luego FR-015 a FR-021 (Enforcement sobre nuevo schema)
          │
          └──→ Fase 5 (Plan DEMO) — requiere Fase 4 COMPLETA
```

### Batches SDD sugeridos

| Batch | Nombre | FRs | Tipo | Depende de |
|-------|--------|-----|------|-----------|
| 1 | `fix-invoice-flow` | FR-001 | `/sdd-new` | — |
| 2 | `audit-plan-enforcement` | FR-002 | `/sdd-explore` | — |
| 3 | `fix-critical-bugs` | FR-003 al FR-010 | `/sdd-new` | — |
| 4 | `fix-edit-sales` | FR-011 | `/sdd-new` | — |
| 5 | `improve-ux` | FR-012 al FR-014 | `/sdd-new` | Batch 3 |
| 6 | **`schema-plan-refactor`** | **FR-100** | `/sdd-new` | — |
| 7 | `enforce-plan-limits` | FR-015 al FR-021 | `/sdd-new` | **Batch 6** |
| 8 | `demo-plan` | FR-022 | `/sdd-new` | **Batch 7** |

### Secuencia recomendada

```
Semana 1:
  ├── Batch 1 (fix-invoice-flow)
  └── Batch 2 (audit-plan-enforcement) → paralelo

Semana 2:
  ├── Batch 3 (fix-critical-bugs)
  ├── Batch 4 (fix-edit-sales)
  └── Batch 6 (schema-plan-refactor) → en paralelo con Batch 3

Semana 3:
  ├── Batch 5 (improve-ux)
  └── Batch 7 (enforce-plan-limits) → requiere Batch 6

Semana 4:
  └── Batch 8 (demo-plan) → requiere Batch 7
```

### Archivos impactados por el refactor (FR-100)

| Archivo | Cambio |
|---------|--------|
| `prisma/schema.prisma` | `BusinessFeatures`: dropear 8 campos, agregar `overrides: Json?`. `PlanDefinition`: agregar `maxClients`. `Plan` enum: agregar `DEMO` |
| `src/lib/feature-gates.ts` | Reescribir `requireFeature()` para usar `getEffectivePlan()`. Agregar `checkLimit()` |
| **`src/lib/plan-resolver.ts`** | **NUEVO** — `getEffectivePlan()` |
| `src/lib/db.ts` | Sin cambios (Prisma genera solo) |
| Todas las server actions que crean productos | Agregar `checkLimit(businessId, "products", count)` |
| Todas las server actions que crean usuarios | Agregar `checkLimit(businessId, "users", count)` |
| Todas las server actions que crean clientes | Agregar `checkLimit(businessId, "clients", count)` |
| Server actions de caja | Refactor `requireFeature("multi-cashbox")` |
| Server actions de catálogo | Refactor `requireFeature("public-catalog")` |
| Server actions de facturación | Refactor `requireFeature("afip-billing")` |
| UI components de productos | Leer límite del resolver para contador |
| UI components de usuarios | Leer límite del resolver para contador |
| UI components de clientes | Leer límite del resolver para contador |
| UI components de cajas | Leer feature gate del resolver |
| UI account ledger | Leer feature gate del resolver |
| Migración SQL | Seed PlanDefinition + migrar BusinessFeatures |

---

## 9. Risks and Mitigations

| Risk | Impact | Prob. | Mitigation |
|------|--------|-------|------------|
| FR-001 (invoice bug) datos corruptos en prod | 🔴 CRITICAL | Alta | Fix en Fase 1 antes de cualquier otro cambio |
| FR-100: migración de 8 campos a overrides Json pierde datos | 🔴 CRITICAL | Baja | Algoritmo de migración preserva overrides existentes; rollback planificado |
| FR-100: `getEffectivePlan()` es más lento que `findUnique` directo | 🟡 MEDIUM | Media | Cachear con `React.cache()` o memo simple; son 2 queries (BusinessFeatures + PlanDefinition) |
| FR-100: server actions que olvidan usar el resolver y leen directo de DB | 🟡 MEDIUM | Alta | Code review + ESLint rule provisional |
| Migración maxClients conflictúa con datos existentes | 🟡 MEDIUM | Media | Default alto para negocios existentes |
| DEMO counters no se resetean por timezone | 🟡 MEDIUM | Baja | UTC en DB, Argentina TZ en display |
| Back navigation fix rompe otras rutas | 🟡 MEDIUM | Media | Testear todas las rutas protegidas |
| Bloqueo por pago vencido afecta usuarios que pagaron | 🔴 CRITICAL | Baja | Mensaje claro + superadmin puede override |

---

## 10. Appendix: Mapeo Completo

| FR | Línea(s) en Untitled2.md | Original |
|----|--------------------------|----------|
| FR-001 | 28-34 | Facturar: mensaje no habilitado pero guarda, limpia, muestra en CC |
| FR-002 | 41 | Verificar funcionalidad contra lo que dice el plan |
| FR-003 | 5-9 | Mensaje feature no habilitado → modal + WhatsApp |
| FR-004 | 24-25 | Catálogo: crash when not available |
| FR-005 | 27 | Eliminar producto sin confirmación |
| FR-006 | 20-21 | Cajas: navegar atrás no va a home |
| FR-007 | 22-23 | CC: se visualizan ventas |
| FR-008 | 35-36 | Ventas: filtro del día mal scoped |
| FR-009 | 37-38 | Stock: foto no se ve en tabla |
| FR-010 | 39-40 | Crear vendedor: no limpia campos |
| FR-011 | 12-17 | Editar ventas: botón, layout, condición, facturación |
| FR-012 | 3-4 | Cajas: botón de borrar (diseño stock) |
| FR-013 | 10-11 | Producto: asteriscos en campos correctos |
| FR-014 | 12-13 | Editar ventas: mejorar UI layout |
| FR-100 | schema | BusinessFeatures + PlanDefinition duplicados → refactor |
| FR-015 | 41 | Límite de productos no enforced |
| FR-016 | 41 | Límite de usuarios no enforced |
| FR-017 | 42 | Clientes infinitos (maxClients en PlanDefinition) |
| FR-018 | 41 | Multi-cashbox: verificar enforcement |
| FR-019 | 41 | Catálogo público: verificar enforcement |
| FR-020 | 42 | Plan sin CC: no crear clientes desde A Cuenta |
| FR-021 | 22-23, 41 | CC: vista + gate de plan |
| FR-022 | 44-46 | Plan DEMO 30 días |

---

> **Instrucciones para AI agents:**  
> - Este PRD está diseñado para flujo SDD. Cada FR tiene acceptance criteria verificables.  
> - **ATENCIÓN:** El Batch 6 (`schema-plan-refactor`) es el cambio más grande. NO empezar FR-015 a FR-021 sin haber terminado FR-100.  
> - Para arrancar: `/sdd-new <batch-name>` usando el contenido del FR como base para explore/propose.  
> - El `getEffectivePlan()` resolver es el corazón del nuevo sistema — todo enforcement pasa por ahí.
