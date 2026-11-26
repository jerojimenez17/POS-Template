# Probar el branch `feature/ui-changes` en local (antes de mergear a `main`)

Esta guía es para levantar una copia **local** del proyecto con una base PostgreSQL restaurada desde un dump de producción, probar el branch y comparar el comportamiento contra la versión legacy.

> **Importante:** todo lo de abajo apunta a una base **local**. No uses el `DATABASE_URL` de Neon/producción ni corras `prisma db push` contra producción.

---

## 0. Requisitos

- Node.js 20+ (ideal 22) y npm
- Docker Desktop
- Git
- El dump de producción `neon-prod-20261125-160103.clean.sql` (te lo pasa el equipo; no está commiteado por privacidad/tamaño) y `custom-plans.sql`
- Puertos libres: `3000` (app) y `5432` (Postgres) — si el 5432 está ocupado, usá `5433` y ajustá el `DATABASE_URL`

---

## 1. Traer el branch

```bash
git clone https://github.com/scorpion712/POS-Template.git
cd POS-Template
git fetch origin
git checkout feature/ui-changes
git pull origin feature/ui-changes
```

Si ya tenés el repo clonado:

```bash
git fetch origin
git checkout feature/ui-changes
git pull origin feature/ui-changes
```

Instalá dependencias (esto también corre `prisma generate`):

```bash
npm install
```

---

## 2. Crear el contenedor de PostgreSQL

```bash
docker run --name pos-test-db \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=posdemo_bkp \
  -p 5432:5432 \
  -d postgres:16-alpine
```

Esperá a que esté listo:

```bash
docker exec pos-test-db pg_isready -U postgres
```

> Si el puerto `5432` ya está en uso por otro Postgres local, cambiá el mapeo a `-p 5433:5432` y usá `localhost:5433` en el `DATABASE_URL`.

---

## 3. Restaurar el dump de producción en la base local

1. Copiá `neon-prod-20261125-160103.clean.sql` y `custom-plans.sql` dentro de `prod-bkp/` (creá la carpeta si no existe).
2. Restaurá el dump con `docker cp` + `psql -f` (más confiable que redirigir 32 MB por PowerShell):

```bash
docker cp prod-bkp/neon-prod-20261125-160103.clean.sql pos-test-db:/tmp/prod.sql
docker exec -i pos-test-db psql -U postgres -d posdemo_bkp -f /tmp/prod.sql
```

3. Verificá que cargó datos:

```bash
docker exec -i pos-test-db psql -U postgres -d posdemo_bkp -c "SELECT count(*) FROM \"Business\";"
docker exec -i pos-test-db psql -U postgres -d posdemo_bkp -c "SELECT count(*) FROM \"User\";"
```

4. Restaurá los planes personalizados (preserva exactamente las features/límites de los 8 negocios que tenían configuración a medida):

```bash
docker cp prod-bkp/custom-plans.sql pos-test-db:/tmp/custom-plans.sql
docker exec -i pos-test-db psql -U postgres -d posdemo_bkp -f /tmp/custom-plans.sql
```

---

## 4. Configurar el `.env` local y correr migraciones

1. Copiá el ejemplo:

```bash
copy .env.example .env
```

2. Editá `.env` y apuntá a la base local:

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/posdemo_bkp"
AUTH_SECRET="cualquier-secreto-largo"   # o generá uno con: npx auth secret
AUTH_URL="http://localhost:3000"
```

> **No** dejes el `DATABASE_URL` de Neon/producción.

3. Generá el cliente Prisma:

```bash
npx prisma generate
```

4. La base restaurada viene con un schema "avanzado" (creado con `db push` en producción), por eso `prisma migrate deploy` puede fallar con las migraciones históricas no idempotentes. Para dejarla alineada y con el historial de migraciones marcado, usá este camino (solo local):

```powershell
# 4.1 Columnas que db push no puede agregar NOT NULL sin default en una tabla con datos
docker exec -i pos-test-db psql -U postgres -d posdemo_bkp -c "ALTER TABLE \"ShortcutConfig\" ADD COLUMN IF NOT EXISTS \"createdAt\" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;"
docker exec -i pos-test-db psql -U postgres -d posdemo_bkp -c "ALTER TABLE \"ShortcutConfig\" ADD COLUMN IF NOT EXISTS \"updatedAt\" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;"

# 4.2 Alinear el schema con Prisma
npx prisma db push --accept-data-loss

# 4.3 Marcar las migraciones históricas como aplicadas (ignorá los "already recorded as applied")
Get-ChildItem .\prisma\migrations -Directory | ForEach-Object { npx prisma migrate resolve --applied $_.Name }

# 4.4 Verificar
npx prisma migrate status
```

Al final `prisma migrate status` debe decir que el schema está al día.

> Si preferís el camino "correcto" de migraciones, primero hay que hacer idempotentes las migraciones viejas y agregar la migración de `ShortcutConfig.createdAt/updatedAt`. Hoy ese trabajo está pendiente; por eso el paso 4 usa `db push` + `resolve`.

---

## 5. Crear/resetear un usuario para entrar

El dump trae los usuarios de producción, pero no sabemos sus contraseñas. Reseteá una conocida (por ejemplo el superadmin) apuntando a la base local:

```powershell
node --env-file=.env -e "const bcrypt=require('bcryptjs'); const {PrismaClient}=require('@prisma/client'); const db=new PrismaClient(); (async()=>{ await db.user.update({ where:{ email:'superadmin@superadmin.com' }, data:{ password: await bcrypt.hash('Prueba1234!',10) } }); console.log('password actualizada'); await db.$disconnect(); })()"
```

Si ese email no existe, listá los usuarios disponibles:

```powershell
node --env-file=.env -e "const {PrismaClient}=require('@prisma/client'); const db=new PrismaClient(); db.user.findMany({ select:{ email:true, role:true, businessId:true } }).then(u=>{ console.log(u); return db.$disconnect(); })"
```

Login: `superadmin@superadmin.com` / `Prueba1234!` (o el usuario que hayas reseteado).

---

## 6. Levantar el proyecto

```bash
npm run dev
```

Abrí `http://localhost:3000`.

---

## 7. Qué probar y comparar contra legacy

Para comparar, podés levantar el branch `main` (o la versión legacy actualmente en producción) en **otra carpeta** y **otro puerto**, idealmente contra una **segunda copia** de la base para no pisar datos entre pruebas.

Flujos a validar en este branch:

### Stock
- Buscador: probar “Solo código” y “Código exacto” y confirmar que la búsqueda se actualiza al tocar el check.
- Carga masiva: alineación de “Fila de inicio”/“Fila de fin”, botón `+` de proveedor, tamaño del select de IVA.
- Imprimir etiquetas: botón para mostrar/ocultar el código de barras en la impresión.

### Caja
- Al abrir, debe mostrar **los movimientos del día** por defecto.
- Scroll infinito de movimientos.
- “Ingreso” y “Retiro”: abrir uno cierra el otro, y click afuera cierra el popup.
- Header con el mismo formato que el resto de la app.

### Ventas / Facturación
- Fila clickeable para abrir el detalle (no solo la celda de fecha).
- Venta facturada: icono de Nota de Crédito en la tabla (modal + confirmación + toast + devolución).
- Venta no facturada: icono de eliminar.
- Detalle: facturar, y si está facturada, emitir NC desde Acciones.

### Ficheros / Cuenta Corriente
- Listado agrupado por cliente, **colapsado por defecto**; al expandir se ven sus órdenes.
- Indicador de **saldo de cuenta** por cliente.
- Acciones **Pagar**, **Cancelar**, **Imprimir** y **Confirmar** consistentes con el resto de la app.
- Registrar pago: validaciones en español, toast de éxito/error, usuario logueado reflejado en caja (no “Sistema”).
- Detalle:
  - Agregar producto no lo duplica y se puede eliminar.
  - Cantidad mínima 1.
  - Tooltip del botón de resetear precio.
  - “Restablecer precios al catálogo” (antes “Actualizar precios”) avisa que reinicia los precios al valor del catálogo.
  - Facturar pago parcial: modal igual al de facturar ventas, botón “Confirmar”, sin duplicar si falla.
  - Cancelar orden: no debe romper por FK de `PaymentVoucher`.

### Configuración ARCA
- Wizard de certificados de 4 pasos (Entorno → Credenciales → Certificado/Clave → Confirmar).
- TEST/PROD, aviso de reemplazo si ya hay certificados.
- Botón Guardar centrado.
- Salir con cambios pendientes pide confirmación.

### Usuarios / Clientes / Navegación
- Roles con colores distinguibles en light/dark.
- Clientes: pantalla con el header estándar, buscador a la izquierda, tabla igual a Stock/Usuarios, alta/edición en modal.
- Side nav agrupado: Operación / Administración / Configuración.
- Reportes: debe cargar el reporte diario/mensual/anual.

### Gates automáticos
```bash
npx tsc --noEmit
npm run lint
npm test
npm run build
```

---

## 8. Problemas comunes

- **`prisma db push` falla con `ShortcutConfig.updatedAt`**: faltó el paso 4.1 (agregar las columnas con default antes).
- **`prisma migrate deploy` falla con “column already exists”**: es esperable con el dump actual; usá el camino `db push` + `migrate resolve` del paso 4.
- **No puedo loguearme**: reseteá la contraseña con el script del paso 5.
- **El puerto 5432 está ocupado**: usá `-p 5433:5432` y `localhost:5433` en `DATABASE_URL`.
- **Pusher no conecta**: para probar UI/DB no es obligatorio; las pantallas siguen funcionando sin tiempo real.
