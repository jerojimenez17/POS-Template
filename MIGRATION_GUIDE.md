# Guía de Migración Post-Merge

## PlanDefinition + BusinessFeatures + pg_trgm

### Resumen del cambio

Este merge introduce dos migraciones de base de datos que:

1. **`20260626000001_add_pg_trgm_search`** — Habilita la extensión `pg_trgm` y crea 5 índices GIN para búsqueda difusa en Product (description, code, codebar), Brand (name) y Supplier (name).
2. **`20260627000001_add_plan_definition`** — Reestructura el modelo de planes:
   - Crea `PlanDefinition` (5 planes: BASIC, PRO, ENTERPRISE, DEMO, CUSTOM)
   - Crea `DailyUsage` (tracking de consumo diario por negocio)
   - Migra `BusinessFeatures` de columnas planas (`hasAfipBilling`, `maxUsers`, etc.) a `planDefinitionId` + `overrides` JSON
   - Agrega `Business.trialEndsAt`, `Client.cuit`, `Client.ivaCondition`
   - Agrega valor `DEMO` al enum `Plan`

---

## Paso a paso

### Paso 1: Backup de la base de datos

**Antes de aplicar cualquier migración**, hacé un backup completo de producción:

```bash
# Backup schema + datos
pg_dump --no-owner --no-privileges --dbname="$DATABASE_URL" > pre-migration-$(date +%Y%m%d).sql

# Backup solo schema (más rápido para debug)
pg_dump --schema-only --no-owner --no-privileges --dbname="$DATABASE_URL" > pre-migration-schema-$(date +%Y%m%d).sql
```

> ⚠️ **IMPORTANTE**: Esta migración es **destructiva** (DROP COLUMN × 8 en `BusinessFeatures`). No hay reverse migration. El rollback requiere restaurar desde este backup.
>
> Guardá el backup en un lugar seguro fuera del servidor (S3, GCS, etc.).

---

### Paso 2: Probar en una DB local con Docker

Antes de tocar producción, replicá el proceso en una DB local:

```bash
# 1. Iniciar PostgreSQL
docker run -d --name pg-migration-test \
  -e POSTGRES_PASSWORD=postgres \
  -p 5433:5432 \
  postgres:16-alpine

# 2. Restaurar backup de producción
createdb -h localhost -p 5433 -U postgres migration_test
pg_restore -h localhost -p 5433 -U postgres -d migration_test --no-owner \
  ruta/al/backup-de-produccion.dump

# 3. Configurar .env.local
echo 'DATABASE_URL="postgresql://postgres:postgres@localhost:5433/migration_test"' > .env.local
echo 'DATABASE_URL_UNPOOLED="postgresql://postgres:postgres@localhost:5433/migration_test"' >> .env.local

# 4. Aplicar migraciones
npx prisma migrate deploy
```

Verificá que:
- `npx prisma migrate status` → "Database schema is up to date!"
- `SELECT count(*) FROM "PlanDefinition"` → 5
- Los 5 `BusinessFeatures` tengan `planDefinitionId` no nulo
- La app arranque con `npm run dev`

---

### Paso 3: Testear en entorno local primero

Con la DB local migrada y la app corriendo:

**Test funcional:**
1. Iniciar sesión con un usuario que tenga plan BASIC → verificar que `hasAfipBilling` = false
2. Iniciar sesión con un usuario PRO/ENTERPRISE → verificar que las features correspondan
3. Crear un producto nuevo → verificar que no se exceda el límite del plan
4. Probar búsqueda con typos → debería encontrar productos por similitud trigram

**Test de registro:**
1. Crear una cuenta nueva → debería crear Business con `trialEndsAt` y `BusinessFeatures` con plan DEMO
2. Verificar que `PlanDefinition` ya existe (no debería crear duplicados)

**Test de superadmin:**
1. Ir a `/superadmin/businesses/[id]/features`
2. Cambiar el plan de un negocio → debería persistir correctamente

---

### Paso 4: Fixear si corresponde

Si encontrás errores durante los pasos 2 o 3:

**Error común: `ALTER TYPE "Plan" ADD VALUE 'DEMO'` falla**
- Posible si la DB no tiene el tipo enum `Plan` (DBs muy viejas o creadas sin Prisma)
- Solución: ejecutar manualmente `ALTER TYPE "Plan" ADD VALUE IF NOT EXISTS 'DEMO';`

**Error común: FK violation en `BusinessFeatures.planDefinitionId`**
- Posible si hay `BusinessFeatures` sin plan asignado (filas huérfanas)
- Solución: `DELETE FROM "BusinessFeatures" WHERE "planDefinitionId" IS NULL;`
  O asignarles el plan BASIC.

**Error común: `prisma migrate deploy` falla con rollback pendiente**
- Si una corrida anterior falló, Prisma bloquea hasta que se resuelva
- Solución: `npx prisma migrate resolve --rolled-back 20260627000001_add_plan_definition`

**Si todo falla:**
```bash
# Rollback total: restaurar desde backup
dropdb migration_test
createdb migration_test
pg_restore ... pre-migration-*.sql
```

---

### Paso 5: Validar compatibilidad

Checklist final antes de declarar éxito:

| # | Check | Comando/Verificación |
|---|-------|---------------------|
| 1 | Schema alineado | `npx prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel prisma/schema.prisma --script` → solo DROP INDEX de índices trgm (esperado) |
| 2 | Migraciones aplicadas | `npx prisma migrate status` → "Database schema is up to date!" |
| 3 | PlanDefinition poblado | `SELECT count(*), string_agg(name, ',') FROM "PlanDefinition"` → 5: BASIC,PRO,ENTERPRISE,DEMO,CUSTOM |
| 4 | BusinessFeatures migrados | `SELECT count(*), count(*) FILTER (WHERE "planDefinitionId" IS NOT NULL) FROM "BusinessFeatures"` → ambas cuentas iguales |
| 5 | Overrides preservados | `SELECT businessId, planDefinitionId, overrides FROM "BusinessFeatures" WHERE overrides IS NOT NULL` → verificar que los datos se mantienen |
| 6 | Columnas viejas eliminadas | `SELECT column_name FROM information_schema.columns WHERE table_name='BusinessFeatures'` → NO debe incluir plan, hasAfipBilling, etc. |
| 7 | Enum DEMO existe | `SELECT enumlabel FROM pg_enum WHERE enumtypid = 'Plan'::regtype` → debe incluir DEMO |
| 8 | Índices trgm existen | `SELECT count(*) FROM pg_indexes WHERE indexname LIKE '%trgm%'` → 5 |
| 9 | FK existe | `SELECT conname FROM pg_constraint WHERE conname = 'BusinessFeatures_planDefinitionId_fkey'` → debe existir |
| 10 | App arranca | `npm run dev` → Next.js ready sin errores de Prisma |
| 11 | Tests pasan | `npx vitest run --reporter=verbose` → misma cantidad que antes del merge (pueden fallar tests pre-existentes) |
| 12 | Login funciona | Abrir `http://localhost:3000/auth/login` e iniciar sesión |

---

### Post-Merge

En producción, después de aplicar las migraciones:

1. **Verificar sesiones activas**: Los usuarios con sesión iniciada antes del merge van a tener en su JWT los features del fallback BASIC hasta que refresquen sesión. Al cerrar sesión y volver a iniciar, obtienen su plan real.
2. **No requiere downtime**: `prisma migrate deploy` es non-blocking para lecturas (Postgres 16). Las tablas nuevas no afectan queries existentes.
3. **Monitorear errores de Prisma**: Verificar logs de la app después del deploy por errores de esquema.

### Referencias

- Propuesta SDD: `openspec/changes/archive/2026-07-02-add-plan-definition-and-pg-trgm/proposal.md`
- Spec de planes: `openspec/specs/plan-definition/spec.md`
- Spec de búsqueda trigram: `openspec/specs/pg-trgm-search/spec.md`
- Script de verificación: `.agents/local/verify-plan-backfill.mjs` (no commiteado, regenerar con `node .agents/local/verify-plan-backfill.mjs`)
