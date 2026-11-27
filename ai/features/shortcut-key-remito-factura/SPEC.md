# SPEC: Atajos F7/F9 para Remito y Factura

## 1. Objetivo

Cambiar los atajos de teclado de la pantalla de nueva factura para que:

- **F7** abra el flujo de creación de **Remito**.
- **F9** abra el flujo de creación de **Factura**.

El cambio debe conservar los handlers de confirmación, validaciones, sesión de caja, impresión y guardado que ya utilizan los botones visibles.

## 2. Hallazgos del código existente

- `src/components/Billing/ProductsTable.tsx` renderiza el componente default de `BillButtons` en la pantalla de facturación.
- `src/components/Billing/BillButtons.tsx` contiene dos componentes:
  - `BillButtonsDefault` (export default), usado por la pantalla de nueva factura.
  - `BillButtons` (export nombrado), que tiene otro conjunto de atajos F1/F2/F3 para checkout y no es el objetivo de este cambio.
- En `BillButtonsDefault`, el listener global `keydown` actualmente implementa:
  - F4 → `setOpenFacturaModal(true)`.
  - F9 → `setOpenRemitoModal(true)`.
  - F10 → modal de A cuenta.
  - F5 → modal de Presupuesto, condicionado por la funcionalidad disponible.
- Los botones visibles de Facturar y Remito ya abren sus respectivos estados (`openFacturaModal` y `openRemitoModal`); el flujo de confirmación no necesita cambiar.
- `tests/components/BillButtons.shortcuts.test.tsx` documenta y verifica el mapeo anterior F4 → Factura y F9 → Remito, por lo que sus expectativas deberán ser actualizadas por QA en la fase TDD.
- Los atajos configurables de productos siguen limitados a F1/F2/F3 en `src/models/ShortcutConfig.ts`, `src/actions/shortcuts.ts` y `ShortcutConfigSection`; no deben confundirse con F7/F9.

## 3. Alcance

### Incluido

1. Actualizar el dispatch de teclado de `BillButtonsDefault` para el nuevo mapeo F7/F9.
2. Mantener `checkSession()` y la asignación del vendedor antes de abrir cualquiera de los dos modales.
3. Actualizar las pruebas de componente de atajos para validar el nuevo contrato y las regresiones indicadas abajo.
4. Actualizar comentarios o documentación inline que describan el mapeo antiguo.

### Fuera de alcance

- No modificar botones visibles, títulos de diálogos ni handlers de confirmación.
- No modificar `createSale`, `createAfipVoucherAction`, `processSaleAction`, impresión, persistencia o modelos Prisma.
- No ampliar los atajos configurables de productos más allá de F1/F2/F3.
- No modificar el componente exportado `BillButtons` ni sus atajos F1/F2/F3.
- No agregar dependencias.

### Decisión sobre F4

F4 deja de ser el atajo de Factura. Para evitar conservar accidentalmente el comportamiento anterior, **F4 no debe abrir Factura ni Remito** en la pantalla de nueva factura. El alcance no asigna un nuevo significado a F4; cualquier futuro uso deberá especificarse por separado.

## 4. Comportamiento funcional requerido

### F7 — Remito

En una factura nueva (`isEditing` falso), al presionar F7:

1. Se previene el comportamiento por defecto del navegador.
2. Se verifica que exista una sesión de caja activa.
3. Si hay email de sesión, se conserva el dispatch de `sellerName` existente.
4. Se abre el diálogo `Confirmar creación de Remito`.
5. No se crea ni imprime el remito hasta que el usuario confirme.

### F9 — Factura

En una factura nueva (`isEditing` falso), al presionar F9:

1. Se previene el comportamiento por defecto del navegador.
2. Se verifica que exista una sesión de caja activa.
3. Si hay email de sesión, se conserva el dispatch de `sellerName` existente.
4. Se abre el diálogo `Confirmar creación de Factura`.
5. No se crea ni imprime la factura hasta que el usuario confirme.

### Condiciones comunes

- Con `isEditing` verdadero, F7 y F9 no deben procesarse mediante este listener.
- Sin sesión de caja activa, ninguno de los dos atajos debe abrir un modal ni ejecutar el flujo de creación; debe conservarse el toast y la apertura del modal de sesión actuales.
- La confirmación de Remito debe continuar invocando la ruta no AFIP (`createSale(false, false)`).
- La confirmación de Factura debe continuar invocando la ruta AFIP (`createSale(true, false)`).
- Cancelar cualquiera de los diálogos no debe guardar, imprimir ni limpiar la venta.

## 5. Criterios de aceptación verificables

- [ ] **AC1:** En `BillButtonsDefault` con `isEditing={false}` y sesión activa, un `keydown` F7 deja `defaultPrevented` en `true` y muestra `Confirmar creación de Remito`.
- [ ] **AC2:** En las mismas condiciones, F9 deja `defaultPrevented` en `true` y muestra `Confirmar creación de Factura`.
- [ ] **AC3:** F7 no muestra el diálogo de Factura y F9 no muestra el diálogo de Remito.
- [ ] **AC4:** F4 ya no abre ninguno de los diálogos de Factura o Remito.
- [ ] **AC5:** Cuando no hay sesión de caja activa, F7 y F9 no abren sus diálogos y se conserva el mensaje `Debe abrir una sesión de caja antes de realizar esta operación`; también se solicita abrir la sesión.
- [ ] **AC6:** Con `isEditing={true}`, F7 y F9 no abren diálogos ni ejecutan handlers de creación.
- [ ] **AC7:** Al confirmar desde el diálogo abierto por F7, se mantiene el flujo de Remito existente: creación no AFIP, impresión posterior solo si corresponde y limpieza/reset posterior sin cambios de contrato.
- [ ] **AC8:** Al confirmar desde el diálogo abierto por F9, se mantiene el flujo de Factura existente: creación AFIP, impresión posterior solo si corresponde y limpieza/reset posterior sin cambios de contrato.
- [ ] **AC9:** F1/F2/F3 continúan reservadas para productos configurables; F5 conserva Presupuesto y F10 conserva A cuenta, incluyendo sus condiciones actuales.
- [ ] **AC10:** Las pruebas existentes no relacionadas con el nuevo mapeo (productos F1/F2/F3, errores de acciones, edición, presupuesto, A cuenta y componentes de botones) continúan pasando.
- [ ] **AC11:** No se realizan cambios en Prisma, Server Actions ni en las interfaces de `ShortcutConfig`.

## 6. Plan TDD y escenarios para QA

QA debe modificar o ampliar `tests/components/BillButtons.shortcuts.test.tsx` antes de la implementación, manteniendo pruebas deterministas con los mocks existentes.

Escenarios mínimos:

1. F7 abre Remito.
2. F9 abre Factura.
3. F4 no abre ningún modal.
4. F7/F9 bloquean la acción cuando no hay sesión de caja.
5. F7/F9 se ignoran durante edición.
6. Confirmación de F7 y F9 conserva sus rutas de creación actuales (verificación mediante mocks si el arnés lo permite).
7. Regresión de F1/F2/F3, F5 y F10.

Orden TDD: QA escribe primero las expectativas nuevas/fallidas; Developer modifica únicamente la lógica necesaria; QA ejecuta la suite focalizada y luego la suite completa; Reviewer valida lint y tipos.

## 7. Arquitectura y archivos afectados

### Implementación prevista

- `src/components/Billing/BillButtons.tsx`: modificar únicamente el bloque de manejo de teclas de `BillButtonsDefault` y comentarios asociados.

### Pruebas previstas

- `tests/components/BillButtons.shortcuts.test.tsx`: reemplazar las expectativas del mapeo antiguo y agregar las regresiones de F4, sesión, edición y confirmación.

### Sin cambios previstos

- `src/actions/afip.ts`, `src/actions/sales.ts` y acciones de impresión.
- `src/context/BillContext.tsx`, reducer y modelos de factura.
- `src/models/ShortcutConfig.ts`, `src/actions/shortcuts.ts`, `src/components/AdminSettings/ShortcutConfigSection.tsx`.
- `prisma/schema.prisma` y migraciones.

## 8. Regresiones esperadas y controles

| Área | Regresión a evitar | Control verificable |
|---|---|---|
| Facturación | F9 abre Remito en vez de Factura | AC2–AC3 y test de títulos de diálogo |
| Remitos | F7 no abre Remito o abre Factura | AC1 y test de título de diálogo |
| Atajo antiguo | F4 continúa creando Factura | AC4 |
| Sesión de caja | Un atajo evita el bloqueo existente | AC5 |
| Edición | Un atajo de nueva factura modifica una venta existente | AC6 |
| Creación | Cambia la ruta AFIP/no AFIP al confirmar | AC7–AC8 |
| Atajos de productos | F7/F9 se interpretan como productos configurables | AC9 y revisión de tipos |
| Otros modales | F5/F10 cambian de comportamiento | AC9–AC10 |

## 9. Dependencias y decisiones

- No se requieren dependencias nuevas ni cambios de base de datos.
- Se conserva el patrón existente de componente cliente y listener global de `keydown`.
- Se conserva `preventDefault()` para evitar acciones del navegador asociadas a teclas de función.
- Si producto desea asignar un nuevo uso a F4, debe abrirse una solicitud separada; esta especificación lo deja como no-op para eliminar el mapeo anterior sin introducir alcance adicional.
