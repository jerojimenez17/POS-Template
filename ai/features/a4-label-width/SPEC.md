# SPEC: Etiquetas A4 con mayor ancho

## Estado y alcance

Esta especificación define únicamente el cambio de ancho de las etiquetas del
formato `a4`. El alto físico existente debe mantenerse, pero una etiqueta que
no pueda contener legiblemente su número/precio puede ocupar dos columnas
horizontalmente. La grilla y la paginación deben mantenerse coherentes. No se
modifican `thermal` ni
`label-45x55`.

La solicitud se implementa en el renderizador real de etiquetas:
`src/components/stock/product-print-modal.tsx`. `set-codebar-modal.tsx` solo
gestiona/asigna códigos y no es el renderizador A4.

No se requieren cambios de base de datos, Prisma, acciones, esquemas ni nuevas
dependencias.

## Implementación actual relevante

`ProductPrintModal` actualmente:

- selecciona entre `a4`, `thermal` y `label-45x55` mediante
  `PRODUCT_PRINT_FORMAT_CONFIG`;
- para A4 renderiza una grilla CSS de tres columnas, con `gap: 2mm`, y agrupa
  13 etiquetas por página;
- usa `TAG_WIDTH = "6.3cm"` tanto para A4 como para thermal;
- usa `4.5cm` como `minHeight` de la etiqueta A4 sin código de barras;
- conserva alturas menores para los casos A4 con código (`2.8cm` con precio y
  `3.2cm` sin precio);
- imprime mediante `printElement(..., { format: "a4", pageStyle: A4_PAGE_STYLE })`.

La constante de ancho compartida no debe cambiarse porque también participa en
thermal. El nuevo ancho debe ser específico de la configuración A4.

## Decisiones de medidas

### Ancho A4 elegido: `6.5cm` (65mm)

El ancho A4 CSS pasa de `6.3cm` a `6.5cm` exclusivamente para el renderer A4.
La elección es el mayor valor redondeado a décimas de centímetro que conserva
un margen físico razonable bajo las restricciones actuales:

| Concepto | Medida |
|---|---:|
| Hoja A4 en portrait | 210mm × 297mm |
| Margen CSS de impresión por lado | 5mm |
| Área útil horizontal | 200mm |
| Tres etiquetas | 3 × 65mm = 195mm |
| Dos separaciones de grilla | 2 × 2mm = 4mm |
| Ocupación total | 199mm |
| Reserva horizontal restante | 1mm |

El límite matemático, sin reserva, sería `(200mm - 4mm) / 3 = 65.33mm`.
Por eso no se debe elegir `6.6cm`: tres columnas ocuparían 202mm con las
separaciones y excederían el área útil de 200mm. `6.5cm` permite que el número
 y el precio tengan 2mm adicionales de ancho frente a `6.3cm`, sin alterar la
grilla para etiquetas normales.

### Ancho A4 doble: `13.2cm` (132mm)

Una etiqueta marcada como ancha ocupa dos tracks de la grilla, incluyendo la
separación entre ellos: `2 × 65mm + 2mm = 132mm` (`13.2cm`). No debe usarse
`13cm` como aproximación si eso deja ambiguo el tratamiento del gap. El ancho
doble equivale a `grid-column: span 2`, no a una cuarta columna ni a una segunda
fila. Un bloque doble más una etiqueta normal ocupa `132mm + 2mm + 65mm =
199mm`.

La medida debe interpretarse con el modelo de caja vigente del proyecto
(Tailwind Preflight usa `box-sizing: border-box`). Si se ajusta el estilo, no
debe permitirse que padding o borde conviertan una caja normal en más ancha que
65mm ni una caja doble en más ancha que 132mm.

### Alto: sin cambios

El cambio no puede modificar ninguna constante ni rama de altura existente:

- A4 sin código de barras: `minHeight: 4.5cm` exactos.
- A4 con código y precio: `minHeight: 2.8cm`.
- A4 con código y sin precio: `minHeight: 3.2cm`.

El `height` de configuración A4 existente tampoco debe reinterpretarse para
compensar el aumento de ancho. El objetivo es preservar el alto físico de cada
variante y, en particular, el alto de `4.5cm` del caso que necesita más espacio
para el precio.

Una etiqueta doble conserva exactamente el mismo alto que tendría en ancho
normal. En particular, una A4 sin código doble sigue usando `minHeight:
"4.5cm"`; nunca se debe obtener el ancho doble mediante `transform: scale`,
porque eso también escalaría el alto.

## Requisitos funcionales

### RF-1 — Aumentar el ancho solo en A4

La configuración efectiva de `a4` debe exponer `width: "6.5cm"` y cada
`.label-container` A4 debe recibir ese ancho. El ancho debe aplicarse tanto a
etiquetas con código como sin código para que la grilla tenga columnas
uniformes.

`thermal` debe conservar `6.3cm` y `label-45x55` debe conservar `55mm`. No se
debe modificar la constante o regla compartida que produzca un cambio
indirecto en thermal.

### RF-2 — Conservar el alto físico

El aumento de ancho no debe producir una reducción, aumento ni escalado CSS del
alto de ninguna variante A4. Una etiqueta A4 sin código debe continuar
declarando `minHeight: "4.5cm"` y el contenido debe permanecer dentro de esa
caja, sin clipping vertical del precio por el cambio.

### RF-3 — Determinar y renderizar el ancho doble

La decisión debe calcularse antes de construir las páginas y ser estable para
el mismo producto y configuración. Una etiqueta A4 usa ancho doble si está
marcada explícitamente por la variante de impresión como `a4Width: "double"`;
si no existe esa marca, usa ancho doble cuando el precio A4 formateado actual
(`$` más el importe redondeado) tiene 6 o más caracteres. En caso contrario
usa el ancho base. La marca explícita tiene prioridad.

La descripción puede envolver normalmente y no activa por sí sola el ancho
doble: esta regla evita que una heurística dependiente de fuente/driver cambie
la paginación. La marca explícita es una decisión del render/configuración de
la variante, no requiere agregar una columna ni persistir un campo en Prisma.
Una medición futura de overflow puede marcar la variante como `double`, pero
debe producir la misma decisión antes de paginar.

Una etiqueta normal ocupa un track (`6.5cm`) y una doble ocupa dos tracks
(`13.2cm`) incluyendo el gap. La etiqueta doble debe expresar `grid-column:
span 2`, conservar padding/borde y usar el mismo alto que la variante normal.
La decisión y el estilo quedan acotados al layout A4.

El algoritmo debe colocar etiquetas en orden y reservar sus tracks antes de
insertar la siguiente. Si una doble no entra en los tracks restantes de la
fila, comienza en la siguiente fila; nunca se permite posicionamiento absoluto
ni superposición.

### RF-4 — Mantener la grilla y paginación

La grilla A4 debe continuar usando exactamente tres columnas base y `gap:
"2mm"`; una doble ocupa dos de esas tres columnas. Las etiquetas normales
continúan agrupándose en páginas de 13.

En lotes con dobles, la paginación usa un empaquetado secuencial con dos
límites: como máximo 13 etiquetas lógicas por página y como máximo 6 filas
físicas. Antes de añadir cada etiqueta se calcula si su span (1 o 2) cabe y si
la fila resultante sigue dentro de esos límites. Si no cabe, se crea una nueva
página antes de ella. Así pueden quedar menos de 13 etiquetas en una página
mixta, sin desborde ni etiquetas partidas.

Con la variante más alta (`5 filas × 4.5cm` para 13 etiquetas en tres columnas)
la ocupación vertical es `225mm + 4 × 2mm = 233mm`, menor que los `287mm` útiles
de A4. Por tanto, el cambio de ancho no justifica alterar `tagsPerPage`.

### RF-5 — Mejorar el encaje del número/precio

El nuevo ancho debe quedar disponible para el importe y su contenido existente,
sin cambiar el redondeo, el formato `$NNN`, la fuente de datos ni la lógica de
código de barras. Las reglas de wrapping/overflow existentes deben continuar
evitando overflow horizontal en la etiqueta A4.

## Archivos afectados

### Cambio de implementación previsto

- `src/components/stock/product-print-modal.tsx`: introducir/usar una medida de
  ancho específica de A4 (`6.5cm`), la decisión de span doble (`13.2cm`) y el
  empaquetado span-aware de páginas, sin tocar el ancho usado por thermal ni
  las ramas de altura.

### Revisados, normalmente sin cambios

- `src/components/stock/set-codebar-modal.tsx`: no dibuja la etiqueta A4.
- `src/components/stock/code-bar-modal.tsx`: renderiza la etiqueta individual
  `55mm × 45mm` y queda fuera de alcance.
- `src/lib/print/BrowserPrint.ts`: `printElement` ya recibe el elemento y el
  `pageStyle`; no requiere un renderer nuevo.
- `src/lib/print/PDFExport.ts`: no se cambia el tamaño lógico A4 ni su fallback.

Los tests/documentos previos que asertan `6.3cm` para A4 deberán actualizarse en
la etapa de QA/implementación, pero no forman parte de este cambio de
especificación y aquí no se escriben ni modifican tests.

## Criterios de aceptación verificables

1. Con A4 seleccionado, `PRODUCT_PRINT_FORMAT_CONFIG.a4.width` es exactamente
   `"6.5cm"` y es mayor que `6.3cm`.
2. La grilla A4 declara exactamente
   `grid-template-columns: repeat(3, 6.5cm)` y `gap: 2mm`.
3. Una etiqueta A4 normal ocupa 1 columna; una marcada/determinada como doble
   ocupa exactamente 2 columnas y tiene ancho físico `13.2cm`.
4. Para una etiqueta A4 sin código, el estilo inline conserva exactamente
   `width: "6.5cm"` y `minHeight: "4.5cm"`; una doble conserva `minHeight:
   "4.5cm"` y no aumenta su alto.
5. Las etiquetas A4 con código conservan sus alturas existentes de `2.8cm` o
   `3.2cm`, según la combinación actual de precio/código.
6. La regla de selección es determinista: la marca `a4Width: "double"` tiene
   prioridad; sin marca, precios formateados de 6 o más caracteres son dobles y
   precios de 5 o menos son normales.
7. Las páginas normales mantienen 13 etiquetas; una página mixta nunca supera
   13 etiquetas lógicas ni 6 filas físicas, reserva los tracks de cada span y
   no produce superposición ni etiquetas partidas.
8. Tres cajas de 65mm más dos gaps de 2mm ocupan 199mm y no superan el área
   útil horizontal de 200mm definida por A4 con márgenes de 5mm. Ninguna caja
   A4 normal supera 65mm ni una doble supera 132mm calculados por padding/borde.
9. Incluso en el caso de 6 filas máximas, la ocupación vertical es `6 × 45mm +
   5 × 2mm = 280mm`, menor que los `287mm` útiles; una doble no aumenta el alto
   de su fila.
10. `printElement` continúa recibiendo `format: "a4"` y `A4_PAGE_STYLE` continúa
   declarando `@page { size: A4; margin: 5mm; }`.
11. El precio/número habitual se muestra dentro de la caja A4 sin overflow
   horizontal y el alto físico permanece sin cambios.
12. Las configuraciones y estilos de `thermal` y `label-45x55`, incluyendo sus
   anchos, alturas, orientación y tamaños de página, no contienen cambios
   derivados de esta feature.

## Limitaciones físicas y operación de impresión

- Los 5mm son el margen CSS de la hoja, no una garantía de que toda impresora
  pueda imprimir hasta ese borde. Drivers con área no imprimible mayor pueden
  reducir o desplazar el resultado.
- La reserva de solo 1mm horizontal hace necesario imprimir a escala 100% y
  respetar la orientación portrait; no usar “ajustar a página” ni escalado del
  driver.
- El ancho mayor no habilita una cuarta columna: cuatro columnas no caben en
  los 200mm útiles, aun con etiquetas de 6.3cm.
- Una doble reduce la capacidad horizontal de su fila: como máximo cabe una
  doble y una normal. Por eso una página con spans puede contener menos de 13
  etiquetas, aunque una página de etiquetas normales siga conteniendo 13.
- El alto se preserva manteniendo las medidas físicas de las cajas, no
  compensando con `transform: scale`, reducción tipográfica o cambio de
  `tagsPerPage`. Cualquier descripción que envuelva debe hacerlo dentro de la
  caja de `4.5cm`; el cambio de ancho no puede introducir una expansión
  vertical adicional de la etiqueta.

## Fuera de alcance

- Cambiar alto, orientación, margen o número de columnas A4; la paginación
  span-aware descrita aquí sí forma parte del alcance.
- Modificar `thermal`, `label-45x55`, `CodeBarModal` o la persistencia de
  códigos.
- Cambiar la tipografía, redondeo o contenido del precio salvo lo estrictamente
  necesario para que use el ancho A4 ya disponible.
- Cambiar `printElement`, el fallback PDF o añadir dependencias.
- Escribir código o tests durante esta etapa.
