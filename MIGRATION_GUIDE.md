# Guía de Migración — Simplify Plan System

## ⚠️ PRIMERO: Asegurate que PostgreSQL esté corriendo

```powershell
net start postgresql-17   # o la versión que tengas instalada
```

Si usás Docker:
```powershell
docker start <nombre-contenedor>
```

---

## Resumen del cambio

Dos migraciones en secuencia:

| # | Migración | Qué hace |
|---|-----------|----------|
| 1 | `20260627000001_add_plan_definition` | Crea `PlanDefinition`, `DailyUsage`, migra `BusinessFeatures` de columnas planas a `planDefinitionId` + `overrides` |
| 2 | `20260704000001_simplify_plan_system` | **NUEVA** — Mueve `planDefinitionId` de `BusinessFeatures` a `Business` directo y dropea `BusinessFeatures` |

**En producción, ya tenés la #1 aplicada.** Solo necesitás aplicar la #2.

---

## Paso 1: Backup de la base de datos

```powershell
pg_dump --no-owner --dbname="postgresql://..." > pre-simplify-plan-$(Get-Date -Format yyyyMMdd).sql
```

> ⚠️ **La migración #2 dropea la tabla `BusinessFeatures`**. No hay vuelta atrás. El rollback requiere restaurar el backup.

---

## Paso 2: Aplicar las migraciones en prod

Conectate a la DB **`posdemo_bkp`** (que recreaste desde prod):

```powershell
# 1. Poner DATABASE_URL en .env apuntando a posdemo_bkp

# 2. Verificar estado actual de migraciones
npx prisma migrate status

# 3. Aplicar la migración pendiente
npx prisma migrate deploy
```

Si `migrate status` muestra que la #1 ya está aplicada y la #2 está pendiente, todo bien.

---

## Paso 3: Lo que hace la migración #2 en detalle

1. **Agrega `planDefinitionId`** a la tabla `Business` (columna nullable)
2. **Backfillea** los datos: `Business.planDefinitionId ← BusinessFeatures.planDefinitionId`
3. **Agrega FK** `Business.planDefinitionId → PlanDefinition.id` con `ON DELETE SET NULL`
4. **Dropea** la tabla `BusinessFeatures`
5. **Descarta `overrides`**: los overrides personalizados por negocio se PIERDEN.
   - Esto fue una decisión de diseño: `PlanDefinition.features` + `limits` son ahora la única fuente de verdad
   - Si algún negocio tenía overrides, se quedará con las features base de su plan

---

## Paso 4: Simular localmente con posdemo_bkp (el flujo completo)

Asumiendo que **`posdemo_bkp`** es un clon exacto de producción:

### 4.1 Configurar .env para apuntar a posdemo_bkp

Editá `.env`:
```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/posdemo_bkp"
DATABASE_URL_UNPOOLED="postgresql://postgres:postgres@localhost:5432/posdemo_bkp"
```

### 4.2 Verificar que existe la tabla BusinessFeatures

```powershell
psql -d posdemo_bkp -c "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'BusinessFeatures');"
```

Debe devolver `true`. Si devuelve `false`, la DB no es la correcta o la migración #1 no fue aplicada.

### 4.3 Aplicar migraciones

```powershell
npx prisma migrate status
# → Debería mostrar: 2 migrations found, 1 pending

npx prisma migrate deploy
```

### 4.4 Verificar que funcionó

```powershell
# Business ahora tiene planDefinitionId
psql -d posdemo_bkp -c "SELECT id, name, "planDefinitionId" FROM "Business" WHERE "planDefinitionId" IS NOT NULL LIMIT 5;"

# BusinessFeatures ya no existe
psql -d posdemo_bkp -c "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'BusinessFeatures');"
# → false

# FK existe
psql -d posdemo_bkp -c "SELECT conname FROM pg_constraint WHERE conname = 'Business_planDefinitionId_fkey';"
# → Business_planDefinitionId_fkey

# App arranca sin errores
npm run dev
```

---

## Paso 5: Si algo sale mal

### Error: `prisma migrate status` muestra conflicto

Si Prisma detecta que la DB no coincide con el historial:

```powershell
# Forzar alineación del historial sin modificar datos
npx prisma migrate resolve --applied 20260704000001_simplify_plan_system
```

### Error: La columna Business.planDefinitionId ya existe

Si ya corriste `prisma db push` en esta DB, la columna ya existe:
```powershell
# Marcar la migración como aplicada sin ejecutarla
npx prisma migrate resolve --applied 20260704000001_simplify_plan_system
```

### Error: FK violation en el backfill

Si algún `BusinessFeatures` tiene `planDefinitionId` nulo:
```powershell
# Revisar cuáles son
psql -d posdemo_bkp -c "SELECT businessId FROM "BusinessFeatures" WHERE "planDefinitionId" IS NULL;"

# Asignarles BASIC manualmente
UPDATE "BusinessFeatures" bf
SET "planDefinitionId" = (SELECT id FROM "PlanDefinition" WHERE name = 'BASIC')
WHERE bf."planDefinitionId" IS NULL;
```

### Rollback total

```powershell
# Restaurar desde backup
psql -d posdemo_bkp < pre-simplify-plan-*.sql
```

---

## Paso 6: Post-migración

1. **Sesiones activas**: los usuarios con JWT previo van a tener `features` cacheados del plan anterior.
   Al cerrar sesión y volver a iniciar, obtienen las features correctas del `PlanDefinition`.
2. **Business sin plan**: si algún Business queda sin `planDefinitionId` (porque no tenía `BusinessFeatures`),
   `resolveFeatures()` devuelve defaults de BASIC automáticamente.
3. **Sin downtime**: `ALTER TABLE ADD COLUMN` es non-blocking en Postgres 16.

---

## Checklist de verificación

| # | Check | Cómo |
|---|-------|------|
| 1 | `BusinessFeatures` ya no existe | `\dt "BusinessFeatures"` en psql → no existe |
| 2 | `Business.planDefinitionId` poblado | `SELECT count(*) FROM "Business" WHERE "planDefinitionId" IS NOT NULL` = total de businesses |
| 3 | FK existe | `\d "Business"` → `Foreign-key constraints: "Business_planDefinitionId_fkey"` |
| 4 | Migraciones alineadas | `npx prisma migrate status` → "Database schema is up to date!" |
| 5 | App arranca | `npm run dev` → sin errores de Prisma |
| 6 | Tests de plan pasan | `npx vitest run tests/plan` → 122 tests pasando |
| 7 | Login funciona | Abrir `http://localhost:3000/auth/login`, iniciar sesión |
