# SPEC: Etiqueta A4 sin SVG de código de barras

## Estado y alcance

Esta especificación describe únicamente el ajuste de las etiquetas de producto
cuando el formato seleccionado es `a4`. No se debe cambiar el comportamiento ni
los estilos de `thermal` ni de `label-45x55`.

La solicitud se refiere a la funcionalidad que se alcanza desde
`set-codebar-modal.tsx`, pero ese componente solamente asigna el código. El
renderizador de etiquetas es `product-print-modal.tsx` (ver la sección de
arquitectura).

No se requieren cambios de base de datos, Prisma, acciones del servidor ni
nuevas dependencias.

## Comportamiento actual relevante

`src/components/stock/product-print-modal.tsx`:

- Declara los formatos `a4`, `thermal` y `label-45x55`.
- Genera el SVG con `JsBarcode` y lo monta solamente cuando `hasBarcode` es
  verdadero.
- Calcula `hasBarcode` como `showBarcode && Boolean(product.codebar || product.code)`.
- Renderiza siempre el código interno (`product.code`) en `.label-code`, aun
  cuando no exista el SVG.
- Contiene el CSS de impresión A4 en `A4_PAGE_STYLE` y las clases específicas
  de A4 en `PRODUCT_PRINT_FORMAT_CONFIG.a4.layout`.
- Para A4 usa etiquetas de `6.3cm` de ancho y hasta `4.5cm` de alto para la
  variante sin código de barras.

## Requisitos funcionales

### RF-1 — Ocultar el string cuando falta el SVG en A4

Para una etiqueta cuyo formato efectivo sea `a4`, el texto de `.label-code` no
debe renderizarse si la etiqueta no contiene el SVG del código de barras.

Esto incluye, como mínimo:

1. `showBarcode === false`.
2. Un producto sin `codebar` ni `code`, por lo que no puede generarse el SVG.

Cuando el SVG sí está presente, el código interno debe conservarse y continuar
apareciendo antes del bloque `.label-barcode`, como ocurre actualmente.

La condición debe estar limitada al layout A4. Thermal y `label-45x55` deben
conservar su visibilidad actual del código interno.

### RF-2 — Aumentar la descripción en A4

La descripción de A4 debe ser considerablemente más grande que la regla actual
de A4 con precio (`14px` en impresión), sin salir de los límites físicos de la
etiqueta.

Valor objetivo recomendado para la implementación: `20px`, con peso visual
equivalente al actual y wrapping habilitado. La regla debe seguir aplicando
`text-align: center`, `line-height` controlado, `width: 100%` y
`word-wrap`/`overflow-wrap` para descripciones largas.

La variante sin precio no debe reducirse respecto de su tamaño actual de `20px`.

### RF-3 — Aumentar ligeramente el precio en A4

El precio de A4 debe crecer ligeramente respecto de su tamaño actual en la
variante sin código de barras (actualmente `48px` en el preview y `68px` en la
regla de impresión).

Valor objetivo recomendado: `72px` para la regla de impresión A4 sin código,
con un valor de preview equivalente. El precio debe continuar dentro de la
etiqueta de `4.5cm` de alto, sin clipping ni overflow horizontal para precios
habituales.

### RF-4 — Símbolo `$` visualmente menor

En el precio A4 afectado, el símbolo `$` debe ser un elemento visual separado
del importe numérico y tener un tamaño menor que el importe. El importe debe
seguir siendo legible y dominar visualmente al símbolo.

Valor objetivo recomendado: el símbolo a aproximadamente `0.55em` del tamaño
del importe, alineado de forma que no aumente innecesariamente la altura de la
línea. El formato textual debe seguir siendo `$NNN` y no debe cambiar el
redondeo actual del precio.

Este ajuste tipográfico es exclusivo de A4. Los precios de los demás formatos
no deben incorporar spans, tamaños ni reglas A4.

## Requisitos no funcionales y restricciones

- No modificar `set-codebar-modal.tsx` salvo que durante la implementación se
  descubra una necesidad estrictamente contractual; no es el renderizador de la
  etiqueta.
- No modificar acciones, modelos, esquemas, Prisma ni datos persistidos.
- No añadir dependencias.
- Mantener la configuración de impresión A4: página A4 con margen de `5mm`,
  grilla de tres columnas, paginación existente y dimensiones físicas de la
  etiqueta.
- La decisión de mostrar el código debe derivarse de la misma condición que
  determina la existencia del SVG; no se debe duplicar una condición que pueda
  divergir.
- Los cambios de estilo deben quedar en la configuración/clases de A4 o en
  reglas claramente acotadas por selectores A4. No cambiar reglas compartidas
  que afecten thermal o `label-45x55`.

## Arquitectura propuesta

1. En `ProductPrintModal`, conservar `hasBarcode` como fuente de verdad para
   el SVG y usar una condición de renderizado específica del formato para
   `.label-code` (por ejemplo, mostrarlo siempre fuera de A4 y solamente cuando
   `hasBarcode` sea verdadero en A4).
2. Mantener el `<svg>` dentro de `.label-barcode` y la generación `JsBarcode`
   sin cambios funcionales.
3. Para el precio, extraer el carácter `$` y el importe a elementos separados
   solamente en el render A4, o usar una representación específica del layout
   A4. La representación de los otros formatos debe permanecer igual.
4. Ajustar las clases de preview de `PRODUCT_PRINT_FORMAT_CONFIG.a4.layout` y
   las reglas de `A4_PAGE_STYLE` de forma coordinada, para que preview e
   impresión respeten la misma jerarquía visual.
5. Verificar que los selectores `.no-barcode` y `.has-price` sigan siendo
   compatibles con las alturas existentes y que las descripciones largas
   envuelvan dentro de `6.3cm`.

## Archivos afectados

### Cambio esperado

- `src/components/stock/product-print-modal.tsx` — único archivo de
  implementación previsto: condición A4 para `.label-code`, composición
  tipográfica del precio A4 y reglas de tamaño/overflow de descripción, precio y
  símbolo.

### Archivos de integración revisados, normalmente sin cambios

- `src/components/stock/set-codebar-modal.tsx` — modal para guardar/scannear el
  código; no dibuja etiquetas.
- `src/components/stock/code-bar-modal.tsx` — renderiza una etiqueta individual
  fija de `55mm × 45mm`; usa `LABEL_45X55_PAGE_STYLE`, no el formato A4.
- `src/components/ProductDataTable.tsx` — abre `ProductPrintModal` en formato
  `thermal` y también monta `SetCodebarModal`.
- `src/components/stock/stock-table.tsx` — monta `CodeBarModal` y
  `SetCodebarModal`.

No hay una etiqueta A4 separada en otro archivo. `product-print-modal.tsx` es el
renderizador de A4 y también contiene los renderizadores configurables de los
otros dos formatos.

## Criterios de aceptación medibles

1. **Código sin SVG en A4:** con A4 seleccionado y `showBarcode` desactivado,
   cada `.label-container.no-barcode` contiene cero elementos `.label-code` y
   cero SVG de `.label-barcode`; el `product.code` no aparece como texto de esa
   etiqueta.
2. **Código con SVG en A4:** con A4 seleccionado, `showBarcode` activado y un
   producto con código válido, la etiqueta contiene exactamente un SVG de
   `.label-barcode`, conserva exactamente un `.label-code` con el código interno
   y el `.label-code` precede al SVG en el DOM.
3. **Otros formatos sin regresión:** en `thermal` y `label-45x55`, un producto
   sin SVG continúa mostrando el código interno como antes; sus estilos y
   dimensiones de página permanecen sin cambios.
4. **Descripción A4:** en la regla de impresión para la variante A4 sin código y
   con precio, `.label-description` declara `font-size: 20px` (o un valor mayor
   explícitamente aprobado), `width: 100%` y wrapping; la variante sin precio no
   queda por debajo de `20px`.
5. **Precio A4:** la regla A4 afectada declara un tamaño de al menos `72px` para
   el importe, superior a los `68px` actuales de impresión, y el preview usa el
   mismo objetivo visual sin volver a `text-2xl`/`48px`.
6. **Símbolo menor:** el DOM del precio A4 separa `$` del importe numérico y la
   regla del símbolo declara un tamaño menor que el del importe (objetivo
   `0.55em`); no se aplica esa regla a thermal ni a `label-45x55`.
7. **Límites físicos:** la etiqueta A4 sin código conserva `width: 6.3cm` y
   `minHeight: 4.5cm`; con descripciones de al menos 100 caracteres no aparece
   overflow horizontal ni se recorta el precio en el contenedor de la etiqueta.
8. **Impresión A4:** `printElement` continúa recibiendo `format: "a4"` y un
   `pageStyle` que contiene `@page { size: A4; margin: 5mm; }`; la grilla sigue
   usando tres columnas y la paginación existente.
9. **Alcance del diff:** `A4_PAGE_STYLE` puede cambiar exclusivamente para las
   reglas A4 descritas; no se modifican `THERMAL_PAGE_STYLE`,
   `LABEL_45X55_PAGE_STYLE`, la lógica de guardado del código ni archivos de
   base de datos.

## Ambigüedades y decisiones pendientes

1. **Componente mencionado vs. componente real:** la solicitud menciona
   `set-codebar-modal.tsx`, pero ese archivo no renderiza ninguna etiqueta. Se
   asume que el alcance correcto es `ProductPrintModal` abierto desde la tabla.
2. **Qué significa “no está presente el SVG”:** se interpreta literalmente
   como ausencia del SVG renderizado (`hasBarcode === false`), incluyendo el
   preview antes de pulsar “Generar”. Si se pretendía ocultar el código solamente
   cuando falta el campo `codebar`, aun cuando se genere un SVG usando el código
   interno como fallback, debe confirmarse antes de implementar.
3. **Alcance tipográfico:** se propone aplicar el aumento de descripción/precio
   a la variante A4 sin código, que es el caso de la solicitud. Si también debe
   aumentar la tipografía de etiquetas A4 que sí tienen SVG, hay que indicarlo
   explícitamente.
4. **Valores visuales:** “considerablemente”, “ligeramente” y “reducir” no
   incluyen números en la solicitud. Esta SPEC propone `20px`, `72px` y `0.55em`
   para hacerlos verificables; diseño/producto puede sustituirlos por valores
   aprobados manteniendo las relaciones y los criterios de no overflow.
5. **Código vacío:** los criterios tratan `null`, `undefined` y cadena vacía o
   de espacios como ausencia de valor, siguiendo los patrones actuales del
   renderizador.

## Fuera de alcance

- Cambiar el tamaño físico, orientación o cantidad de etiquetas A4 por página.
- Cambiar la selección de fuente del barcode, `CODE128`, el redondeo del precio
  o la persistencia del código.
- Rediseñar `CodeBarModal`/`set-codebar-modal.tsx` para otros formatos.
- Añadir o modificar tests en esta etapa; la implementación y QA deberán crear
  sus pruebas a partir de estos criterios en las etapas posteriores.
