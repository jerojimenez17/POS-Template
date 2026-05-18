# SPEC.md: Implementación de ptoVenta y Configuración de ARCA

## 1. Visión General
El objetivo es permitir la gestión de los "Puntos de Venta" (ptoVenta) asociados a un Negocio. Se habilitará una interfaz para que los Administradores configuren sus datos de ARCA y puntos de venta. En la pantalla de facturación, se podrá seleccionar el punto de venta a utilizar y se mostrará el próximo número de comprobante a generar de forma dinámica interactuando con una nueva Cloud Function que obtendrá el dato directo desde ARCA.

## 2. Requerimientos Técnicos

### 2.1 Cambios en Cloud Function (`stock-ia-function`)
- Crear una nueva cloud function `getLastVoucherNumber` que emplee la SDK de AFIP (`afip.ElectronicBilling.getLastVoucher(puntoVenta, tipoFactura)`) y retorne el número.

### 2.2 Cambios en la Base de Datos (`prisma/schema.prisma`)
- **Modelo `Business`**: Agregar el campo `ptoVenta Int[] @default([])`.

### 2.3 Cambios en Backend / Zod Schemas
- **Zod (`src/schemas/index.ts`)**: 
  - `ArcaFieldsSchema`: Incluir `ptoVenta` como un arreglo de números naturales.
  - `BillParametersSchema`: Incluir el `ptoVenta` seleccionado.
- **Tipos (`src/models/Arca.ts`)**: Actualizar `ArcaData` y `ArcaUpdateInput` para incluir `ptoVenta: number[]`.

### 2.4 Funcionalidades Superadmin y Admin (Configuración)
- **UI (`src/components/Superadmin/arca-form.tsx`)**: 
  - Interfaz para agregar y eliminar elementos de `ptoVenta`.
  - Mostrar un indicador visual si el certificado (`cert`) y la llave privada (`key`) están cargados.
- **Menú Root (`src/components/ui/RootMenu.tsx`)**: Agregar un "MenuCard" llamado "Configuración" visible para el rol `ADMIN`.
- **Página de Configuración (`src/app/admin/settings/page.tsx` - NUEVA)**: Crear una nueva vista donde el Admin pueda actualizar sus datos de ARCA.
- **Acciones (`src/actions/arca.ts`)**: Permitir que el rol `ADMIN` actualice los datos de ARCA de su propio negocio.
- **Acciones (`src/actions/voucher.ts`)**: Crear la acción que llama a la nueva cloud function para obtener el próximo número de comprobante.

### 2.5 Funcionalidades de Facturación (`newBill`)
- **UI (`src/components/Billing/BillParametersForm.tsx`)**:
  - Mostrar el punto de venta seleccionado formateado (ej. `001`).
  - Mostrar el próximo número de comprobante a generar basado en el tipo de factura (ej. `001-0002`).
  - Permitir hacer clic en el punto de venta para desplegar y seleccionar otros puntos de venta disponibles.
  - Al cambiar de tipo de comprobante o punto de venta, deberá hacer refetch a la Server Action.

## 3. Criterios de Aceptación
1. El esquema de la BD contiene el nuevo campo de tipo array y se actualiza (`db push`).
2. La Cloud function retorna correctamente el número al invocarla.
3. El formulario de ARCA permite ver, agregar, quitar y guardar los puntos de venta validados.
4. El rol `ADMIN` puede acceder a "Configuración" en el menú y modificar sus datos de ARCA exitosamente.
5. El componente de facturación `BillParametersForm` muestra un selector de punto de venta y su respectivo número de comprobante dinámico consultado a la API.
6. El flujo debe ser implementado y probado a través del TDD workflow.

## 4. Importaci�n de Deudas Iniciales (Seed Excel)
### Requerimientos
- **Funci�n:** Leer un archivo Excel con cuentas adeudadas y cargarlas al sistema.
- **Estructura del Excel:** Columna A (Nombre del cliente), Columna B (Total adeudado), Columna C (Fecha).
- **Condici�n:** Si el total es 0, ignorar el cliente.
- **Comportamiento:** 
  1. Crear un producto gen�rico "Traspaso" (si no existe).
  2. Encontrar o crear cada cliente por su nombre.
  3. Crear una orden "inpago" y "confirmado" con un item de producto "Traspaso" con subtotal igual a la deuda.
  4. Sumar el monto de la deuda al balance del cliente.
  5. Si la fecha es inv�lida, asignar fecha actual.
- **UI:** Exponer un bot�n de forma temporal en la vista para disparar la Server Action de seed.
