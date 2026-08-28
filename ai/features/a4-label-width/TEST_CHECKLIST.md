# TEST_CHECKLIST — `a4-label-width`

Paso 2 (QA/TDD). Estas pruebas deben permanecer en rojo hasta que la implementación
del renderizador A4 cumpla la especificación.

- [ ] La configuración A4 expone exactamente `width: "6.5cm"`.
- [ ] Cada grilla A4 usa exactamente `repeat(3, 6.5cm)` y `gap: 2mm`.
- [ ] Una etiqueta A4 sin código conserva `width: 6.5cm` y `minHeight: 4.5cm`.
- [ ] Las etiquetas A4 con código conservan `2.8cm` con precio y `3.2cm` sin precio.
- [ ] Una etiqueta normal ocupa un track; una doble ocupa `grid-column: span 2` y `13.2cm`.
- [ ] La etiqueta doble conserva el alto de su variante normal y no usa escalado vertical.
- [ ] El precio A4 formateado con 5 caracteres es normal; con 6 o más es doble.
- [ ] `a4Width: "double"` tiene prioridad sobre el umbral del precio.
- [ ] La decisión de ancho se toma antes de paginar y es estable para los mismos datos.
- [ ] El empaquetado es secuencial, reserva tracks, no usa posicionamiento absoluto y no superpone etiquetas.
- [ ] Las páginas respetan como máximo 13 etiquetas lógicas y 6 filas físicas; con 13 dobles se distribuyen `6 + 6 + 1` sin partir etiquetas.
- [ ] Tres cajas de 65mm y dos gaps de 2mm ocupan 199mm; una doble ocupa 132mm.
- [ ] La impresión conserva `format: "a4"` y `@page { size: A4; margin: 5mm; }`.
- [ ] `thermal` mantiene `6.3cm`, su página `55mm 65mm` y sus alturas.
- [ ] `label-45x55` mantiene `55mm × 45mm`, landscape, y su paginación individual.
- [ ] El número/precio permanece dentro de la caja, con wrapping seguro y sin overflow horizontal.

## Resultado inicial TDD

Ejecutar `npm run test -- ai/features/a4-label-width/a4-label-width.test.tsx`.
El resultado esperado en esta etapa es compilación correcta y fallos por las
expectativas de la nueva funcionalidad, sin modificar implementación, SPEC ni
tests existentes.
