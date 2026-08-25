# QA checklist — Atajos F7/F9 para Remito y Factura

## Alcance de pruebas

- [ ] **AC1:** Con factura nueva y sesión activa, F7 ejecuta `preventDefault()` y abre `Confirmar creación de Remito`.
- [ ] **AC2:** Con factura nueva y sesión activa, F9 ejecuta `preventDefault()` y abre `Confirmar creación de Factura`.
- [ ] **AC3:** F7 nunca abre el diálogo de Factura y F9 nunca abre el de Remito.
- [ ] **AC4:** F4 es no-op: no abre Factura ni Remito.
- [ ] **AC5:** Sin sesión activa, F7/F9 no abren diálogos, muestran `Debe abrir una sesión de caja antes de realizar esta operación` y solicitan abrir la sesión.
- [ ] **AC6:** En modo edición, F7/F9 se ignoran y no ejecutan creación.
- [ ] **AC7:** Confirmar el diálogo de F7 conserva la ruta no AFIP (`createSale(false, false)`), incluyendo la continuación de impresión/reset existente.
- [ ] **AC8:** Confirmar el diálogo de F9 conserva la ruta AFIP (`createSale(true, false)`), incluyendo la continuación de impresión/reset existente.
- [ ] **AC9:** F1/F2/F3 mantienen la resolución de productos configurables; F5 mantiene Presupuesto y F10 mantiene A cuenta y sus condiciones.
- [ ] **AC10:** La suite de regresión no relacionada continúa pasando: errores de acciones, edición, presupuesto, A cuenta y botones visibles.
- [ ] **AC11:** La revisión de cambios confirma que no se modificaron Prisma, Server Actions ni `ShortcutConfig`; la implementación queda limitada a la lógica del listener/documentación.

## Resultado TDD inicial

- Archivo focalizado: `tests/components/BillButtons.shortcuts.test.tsx`.
- Estado esperado antes de la implementación: RED en las expectativas F7 → Remito, F9 → Factura y F4 no-op; los tests de regresión existentes deben conservar su comportamiento.
- Confirmar cancelación: ambos diálogos deben poder cancelarse sin invocar guardado, impresión ni reset.
