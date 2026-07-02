# PRD: Migración BusinessFeatures → Business

## 1. Executive Summary

**Problema:** Actualmente existe una tabla intermedia `BusinessFeatures` que sirve como join 1:1 entre `Business` y `PlanDefinition`. Cada vez que se resuelve un feature flag (en cada server action que hace `requireFeature`), el sistema hace un JOIN extra (`business → businessFeatures → planDefinition`) que agrega latencia innecesaria y complejidad arquitectónica. Además, el modelo `BusinessFeatures` ya es un vestigio de la primera fase del refactor: hoy solo tiene `id`, `businessId`, `planDefinitionId`, y `overrides` — una thin join table sin propósito propio.

**Solución:** Migrar `planDefinitionId` y `planOverrides` directamente al modelo `Business`, eliminando la tabla `BusinessFeatures` por completo. Esto:
- Elimina 1 JOIN por cada feature check (2 queries → 1 query)
- Simplifica el schema (1 modelo menos)
- Reduce la superficie de测试 y mantenimiento
- Alinea el modelo de datos con la realidad del dominio: el plan ES del negocio, no una entidad separada

**Impacto:** Sin cambios funcionales visibles para el usuario. Performance improvement en todas las server actions que verifican features (~13+ acciones). Schema más limpio y mantenible.

---

## 2. Context

### Background
En la Fase 1 del refactor de planes (archivada como `schema-plan-refactor`, junio 2026), se migró de:
- **Antes:** 8 columnas hardcoded en `BusinessFeatures` + enum `Plan`
- **Después:** `PlanDefinition` como template con features/limits en JSON + `BusinessFeatures` como join 1:1 con `overrides` opcionales

Esa fase fue exitosa y dejó el sistema funcionando con `PlanDefinition` como source of truth. Pero la tabla `BusinessFeatures` quedó como un paso intermedio — una tabla puente que ya no es necesaria.

### Estado Actual

```
┌──────────┐      1:1      ┌──────────────────┐      N:1      ┌────────────────┐
│ Business │ ────────────→ │ BusinessFeatures │ ────────────→ │ PlanDefinition │
│          │               │ (thin join)      │               │ (template)     │
└──────────┘               │ planDefinitionId │               │ features: Json │
                           │ overrides: Json? │               │ limits: Json   │
                           └──────────────────┘               └────────────────┘
```

### Estado Deseado

```
┌─────────────────────────────────────┐      N:1      ┌────────────────┐
│ Business                            │ ────────────→ │ PlanDefinition │
│ planDefinitionId                    │               │ (template)     │
│ planOverrides: Json?                │               └────────────────┘
└─────────────────────────────────────┘
```

### Usuarios Afectados
- **Ninguno directamente** — el cambio es puramente de infraestructura
- Equipo de desarrollo (menos complejidad)
- Superadmins (misma UI, backend más simple)
- Usuarios finales (beneficio indirecto por performance)

### Datos Existentes

| Tabla | Registros Estimados | Tamaño |
|-------|-------------------|--------|
| `Business` | ~50-200 | Pequeño |
| `BusinessFeatures` | ~50-200 | 1:1 con Business |
| `PlanDefinition` | 5 (BASIC, PRO, ENTERPRISE, DEMO, CUSTOM) | Fijo |

La migración es de bajo volumen — no hay riesgo de downtime por volumen de datos.

---

## 3. Objetivos

- [ ] **O3.1** Eliminar la tabla `BusinessFeatures` del schema de Prisma
- [ ] **O3.2** Migrar `planDefinitionId` y `overrides` al modelo `Business`
- [ ] **O3.3** Actualizar `plan-resolver.ts` para leer de `Business` directamente
- [ ] **O3.4** Actualizar `superadmin.ts` para escribir en `Business` directamente
- [ ] **O3.5** Actualizar `register.ts` para crear plan en el Business directamente
- [ ] **O3.6** Actualizar `data/user.ts` + `auth.ts` para cargar plan desde Business
- [ ] **O3.7** Actualizar UI de superadmin (features page) para usar Business model
- [ ] **O3.8** Actualizar todos los tests que mockean `businessFeatures`
- [ ] **O3.9** No regresionar ninguna server action ni feature gate existente

**KPIs de Éxito:**
- `requireFeature()` debe responder en el mismo o menor tiempo
- 0 regresiones en el login/registro de nuevos usuarios
- 0 cambios visibles en la UI de superadmin
- Todos los tests existentes pasan con los nuevos mocks

---

## 4. Alcance

### In Scope
1. Migración del schema Prisma (agregar campos a Business, eliminar BusinessFeatures)
2. Migración de datos (pasar planDefinitionId + overrides de BusinessFeatures a Business)
3. Actualización de `plan-resolver.ts` (cambiar query de `businessFeatures` → `business`)
4. Actualización de `superadmin.ts` (cambiar `upsert` de BusinessFeatures a `update` de Business)
5. Actualización de `register.ts` (crear plan en Business directamente)
6. Actualización de `data/user.ts` (incluir planDefinition en el include)
7. Actualización de `auth.ts` / plan-resolver (ruta de acceso a planDefinition)
8. Actualización de `src/app/superadmin/businesses/[id]/features/`
9. Actualización de tests (10+ archivos)
10. Script de migración para datos existentes

### Out of Scope
- ❌ Cambios en la UI de usuario final
- ❌ Cambios en el flujo de registro/login (solo cambia dónde se guarda)
- ❌ Nuevos features o limits
- ❌ Cambios en `PlanDefinition` model
- ❌ Refactor de `Plan` enum (zombie, queda para otra iteración)
- ❌ Changes en `useFeatures.ts` hook (sigue leyendo de session, no cambia)

---

## 5. Functional Requirements

### FR-001: Schema Migration
**Como** desarrollador
**Quiero** que `planDefinitionId` y `planOverrides` estén en el modelo `Business`
**Para** eliminar la tabla intermedia BusinessFeatures

**Criterios de Aceptación:**
- `Business` model tiene nuevos campos: `planDefinitionId String?` (FK → PlanDefinition) y `planOverrides Json?`
- `BusinessFeatures` model es eliminado
- `PlanDefinition.businessFeatures` relation es eliminada
- `Business.features` relation (1:1 a BusinessFeatures) es eliminada
- Relación `Business → PlanDefinition` es N:1
- Índice en `Business.planDefinitionId` para queries de superadmin
- Migración de datos existentes: todo `BusinessFeatures.planDefinitionId` → `Business.planDefinitionId`, todo `BusinessFeatures.overrides` → `Business.planOverrides`

### FR-002: Feature Resolution
**Como** el sistema
**Quiero** que `getEffectivePlan()` lea directamente de `Business.planDefinition`
**Para** eliminar el JOIN innecesario

**Criterios de Aceptación:**
- `plan-resolver.ts:getEffectivePlan()` usa `db.business.findUnique({ where: { id } })` con `include: { planDefinition: true }`
- No hay más calls a `db.businessFeatures` en todo el código de producción
- Feature flags se resuelven exactamente igual que antes
- Plan default (BASIC) se aplica si `planDefinitionId` es null

### FR-003: Plan Management (Superadmin)
**Como** superadmin
**Quiero** poder cambiar el plan de un negocio desde la UI de superadmin
**Para** gestionar suscripciones

**Criterios de Aceptación:**
- `updateBusinessFeaturesAction` se renombra a `updateBusinessPlanAction`
- En lugar de `tx.businessFeatures.upsert()`, hace `tx.business.update()`
- La UI de superadmin (`FeaturesForm`) funciona igual que antes
- Los overrides se guardan en `business.planOverrides`
- El plan seleccionado se guarda en `business.planDefinitionId`

### FR-004: Registration Flow
**Como** nuevo usuario registrándose
**Quiero** obtener el plan DEMO automáticamente
**Para** empezar a usar el sistema

**Criterios de Aceptación:**
- `register.ts` crea el Business con `planDefinitionId: demoPlan.id` directamente
- No hay más calls a `tx.businessFeatures.create()`
- El flujo de registro es idéntico desde la perspectiva del usuario

### FR-005: JWT Session
**Como** el sistema de autenticación
**Quiero** que el JWT contenga los features resueltos del plan
**Para** que el cliente y server actions tengan acceso rápido

**Criterios de Aceptación:**
- `data/user.ts:getUserById()` incluye `planDefinition` en el include
- `auth.ts:jwt()` callback sigue funcionando con la nueva estructura
- `resolvePlanFromBusiness()` lee `planDefinition` directamente del business
- La forma del `token.business.features` no cambia (ResolvedFeatures)

---

## 6. Non-Functional Requirements

| Aspecto | Requisito |
|---------|-----------|
| **Performance** | Las queries de feature resolution deben ser IGUALES o MÁS RÁPIDAS (se elimina 1 JOIN) |
| **Consistencia** | 100% de los negocios deben tener `planDefinitionId` no nulo post-migración |
| **Disponibilidad** | Migración ejecutable con ~0 downtime (tabla pequeña, transacción rápida) |
| **Seguridad** | Solo SUPER_ADMIN puede modificar el plan de un negocio |
| **Backward Compatibility** | Código que referencia `business.features` debe seguir funcionando hasta que se actualice |

---

## 7. UX/UI Requirements

No hay cambios de UX para el usuario final. La UI de superadmin (`/superadmin/businesses/[id]/features`) se mantiene visualmente idéntica — solo cambia el backend que persiste los datos.

---

## 8. Technical Design

### Schema Changes

```prisma
// ANTES
model Business {
  id       String  @id @default(cuid())
  // ...
  features BusinessFeatures?   // ← se elimina
}

model BusinessFeatures {
  id               String         @id @default(cuid())
  businessId       String         @unique
  business         Business       @relation(fields: [businessId], references: [id], onDelete: Cascade)
  planDefinitionId String
  planDefinition   PlanDefinition @relation(fields: [planDefinitionId], references: [id])
  overrides        Json?
  // ...
}

// DESPUÉS
model Business {
  id               String  @id @default(cuid())
  // ...
  planDefinitionId String?
  planDefinition   PlanDefinition? @relation(fields: [planDefinitionId], references: [id])
  planOverrides    Json?

  @@index([planDefinitionId])
}

// BusinessFeatures model se elimina COMPLETAMENTE
// PlanDefinition.businessFeatures relation se elimina
```

### Plan Resolver Changes

```typescript
// ANTES
export async function getEffectivePlan(businessId: string) {
  const record = await db.businessFeatures.findUnique({
    where: { businessId },
    include: { planDefinition: true, business: { select: { trialEndsAt: true } } },
  });
  if (!record) return DEFAULT_BASIC_PLAN;
  return resolveFeatures(record.planDefinition, record.overrides);
}

// DESPUÉS
export async function getEffectivePlan(businessId: string) {
  const business = await db.business.findUnique({
    where: { id: businessId },
    include: { planDefinition: true },
  });
  if (!business?.planDefinitionId || !business.planDefinition) return DEFAULT_BASIC_PLAN;
  return resolveFeatures(business.planDefinition, business.planOverrides);
}
```

### Data User Changes

```typescript
// ANTES
include: { business: { include: { features: true } } }

// DESPUÉS
include: { business: { include: { planDefinition: true } } }
```

### Superadmin Action Changes

```typescript
// ANTES
tx.businessFeatures.upsert({
  where: { businessId },
  create: { businessId, planDefinitionId, overrides },
  update: { planDefinitionId, overrides },
});

// DESPUÉS
tx.business.update({
  where: { id: businessId },
  data: { planDefinitionId, planOverrides: overrides ?? Prisma.JsonNull },
});
```

### Registration Changes

```typescript
// ANTES: después de crear Business
await tx.businessFeatures.create({
  data: { businessId: business.id, planDefinitionId: demoPlan.id },
});

// DESPUÉS: en la creación del Business
const business = await tx.business.create({
  data: {
    // ... otros campos
    planDefinitionId: demoPlan.id,
  },
});
```

### Archivos a Modificar (11 archivos)

| Archivo | Cambio |
|---------|--------|
| `prisma/schema.prisma` | +planDefinitionId, +planOverrides en Business; -BusinessFeatures model |
| `src/lib/plan-resolver.ts` | getEffectivePlan lee de Business en vez de BusinessFeatures |
| `src/data/user.ts` | include: planDefinition en vez de features |
| `src/types/plan.ts` | Sin cambios (PlanSeed/ResolvedFeatures no tocan schema) |
| `src/types/next-auth.d.ts` | Sin cambios (tipos de sesión no cambian) |
| `src/actions/superadmin.ts` | business.update en vez de businessFeatures.upsert |
| `src/components/actions/register.ts` | planDefinitionId en business.create |
| `src/app/superadmin/businesses/[id]/features/page.tsx` | Ajustar eager-loading |
| `tests/setup.ts` | Actualizar mock de DB |
| `tests/plan/limits.test.ts` | Mock business.findUnique en vez de businessFeatures |
| `tests/plan/daily-limits.test.ts` | Mock business.findUnique en vez de businessFeatures |
| `tests/actions/superadmin.test.ts` | Update action test |
| `tests/actions/security.test.ts` | Update mocks |
| `tests/actions/arca.test.ts` | Update mocks |
| `src/__tests__/actions/budget.test.ts` | Update mocks |
| Otros test files con mocks | Update según corresponda |

---

## 9. Migration Plan

### Fase 1: Schema + Data (1 PR)

1. Agregar `planDefinitionId String?` y `planOverrides Json?` a `Business` en schema.prisma
2. Ejecutar migración de datos: `UPDATE "Business" SET "planDefinitionId" = bf."planDefinitionId", "planOverrides" = bf."overrides" FROM "BusinessFeatures" bf WHERE bf."businessId" = "Business"."id"`
3. Verificar que todos los negocios tengan `planDefinitionId` no nulo
4. Eliminar model `BusinessFeatures` y sus relaciones
5. `prisma db push` o generar migración

### Fase 2: Código (1 PR)

1. Actualizar `plan-resolver.ts` (getEffectivePlan)
2. Actualizar `data/user.ts` (include)
3. Actualizar `superadmin.ts` (upsert → update)
4. Actualizar `register.ts` (create features inline)
5. Actualizar features page de superadmin
6. Actualizar tests

### Rollback Plan
Si algo sale mal:
1. Revertir el commit de schema
2. `prisma db push` para restaurar BusinessFeatures
3. Migrar datos de vuelta desde Business a BusinessFeatures
4. Revertir commits de código

---

## 10. Análisis de Regresión

### Riesgos

| Riesgo | Impacto | Probabilidad | Mitigación |
|--------|---------|-------------|------------|
| Negocio sin `planDefinitionId` post-migración | Alto (no puede operar) | Baja | Query de verificación pre-delete, default a BASIC si es null |
| Superadmin no puede cambiar planes | Alto (soporte) | Baja | Test end-to-end del flujo de superadmin post-migración |
| JWT contiene features incorrectos | Alto (gates incorrectos) | Baja | Validación manual: login como user BASIC/PRO/DEMO y verificar gates |
| Tests con mocks rotos | Medio (CI falla) | Alta | Actualizar todos los mocks ANTES de mergear |
| `promoteToAdmin` crea Business sin plan | Medio | Alta | Bug existente — fix: asignar BASIC plan al promover |
| Registration falla para nuevos usuarios | Crítico | Muy Baja | Test de registro completo post-migración |

### Estrategia de Mitigación
1. **Pre-migración**: Script de verificación que asegura que todo Business tiene BusinessFeatures
2. **Post-migración**: Query que verifica que todo Business tiene planDefinitionId no nulo
3. **Tests**: CI debe pasar con los nuevos mocks antes de mergear
4. **Staging**: Probar migración en copia de DB de producción

---

## 11. Dependencias

| Dependencia | Tipo | Propósito |
|-------------|------|-----------|
| Prisma Migrate / db push | Herramienta | Ejecutar cambios de schema |
| Script SQL de migración | Ad-hoc | Migrar datos de BusinessFeatures a Business |
| Test suite existente | Validación | Verificar que no hay regresiones |

---

## 12. Timeline

| Paso | Duración | Dependencia |
|------|----------|-------------|
| Schema changes + data migration | 1 día | — |
| plan-resolver.ts update | 1 día | Schema changes |
| superadmin.ts + register.ts update | 0.5 día | Schema changes |
| UI features page update | 0.5 día | plan-resolver update |
| Test updates | 1 día | Todos los cambios anteriores |
| QA + validación | 0.5 día | Todos los cambios |

**Total estimado: 3-4 días hábiles**

---

## 13. Preguntas Abiertas

1. ¿Mantenemos el campo `plan` (enum zombie) en el schema? Actualmente no se usa pero está en el archivo de schema. Sugerencia: eliminarlo en este mismo PR ya que no tiene referencias.
2. `promoteToAdmin` no asigna plan — ¿lo arreglamos en esta migración? Sugerencia: sí, asignar BASIC plan.
3. La UI de superadmin `FeaturesForm.tsx` tiene ~649 líneas. ¿Aprovechamos para simplificarla o solo cambiamos la persistencia?

---

*Documento generado: 2026-07-01*
*Autor: AI Orchestrator*
*Estado: Borrador para revisión*
