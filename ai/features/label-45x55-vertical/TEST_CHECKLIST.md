# TEST_CHECKLIST — label-45x55-vertical

## Gate G2

- [ ] `CodeBarModal.label-45x55.test.tsx` compila y ejecuta con Vitest.
- [ ] Las pruebas fallan contra la implementación anterior (RED), sin modificar `src/`.

## Criterios de aceptación

- [ ] **AC1 Dimensión:** cada `.label-container` mide exactamente `45mm × 55mm`, con y sin `codebar`; no hay dimensiones alternativas.
- [ ] **AC2 Página:** `pageStyle` contiene una regla `@page` de `45mm 55mm portrait` y margen `0`.
- [ ] **AC3 Orientación:** `printElement` recibe `format: "thermal"` y `orientation: "portrait"`; no aparecen `landscape`, `55mm 45mm`, `auto-fill` ni grid para esta ruta.
- [ ] **AC4 Contenido:** descripción, código interno y SVG Code128 aparecen; el precio redondeado (`$100` para `99.99`) solo aparece con “Mostrar precio”.
- [ ] **AC5 Fuente:** la generación inicial usa el código interno; alternar a código de barras usa el valor alternativo y conserva `displayValue` legible. `codebar=""` vuelve al código interno.
- [ ] **AC6 Copias:** se renderizan de 1 a 50 copias; valores mayores se limitan a 50, valores menores a 1; el CSS separa copias con salto de página.
- [ ] **AC7 Ajuste:** una descripción de 80+ caracteres y un EAN/Code128 de 13 dígitos quedan dentro de una caja física de 45mm; hay wrapping/truncado, ancho acotado y `overflow: hidden`.
- [ ] **AC8 Navegador:** `.no-print` oculta controles; `html/body` no agregan márgenes; cada copia ocupa una página física. El usuario/driver aún puede sobrescribir escala u orientación.
- [ ] **AC9 Compatibilidad:** `SetCodebarModal` mantiene validación, `updateProduct`, toasts y callback; asignar no dispara impresión.
- [ ] **AC10 Regresión:** ProductDataTable y stock-table continúan pasando la misma API y abriendo el modal individual; la impresión masiva conserva su flujo A4/thermal separado.

## Negativos y límites

- [ ] No se usa `6.3cm`, `5cm`, `3.5cm`, `60mm auto`, píxeles como dimensión principal, `55mm 45mm`, `landscape`, `auto-fill` o una hoja A4 en el modal individual.
- [ ] Descripción larga no desborda horizontalmente ni cambia las dimensiones externas.
- [ ] Precio oculto no deja texto de precio en ninguna copia.
- [ ] Código de barras ausente no produce un barcode vacío ni persiste una imagen.
- [ ] Cancelar/cerrar no llama `updateProduct` ni `printElement`.
- [ ] El flujo conserva `printElement` y no desactiva el fallback PDF (`fallbackToPDF` no debe ser `false`).
- [ ] No se agregan cambios a Prisma, Server Actions, persistencia, QZ Tray ni impresión masiva.
