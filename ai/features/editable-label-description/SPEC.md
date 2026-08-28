# SPEC: Descripción editable en todos los formatos de etiquetas

## Resumen

Hacer editable temporalmente la descripción de cada producto dentro de `ProductPrintModal` para los tres formatos disponibles: A4, thermal y `label-45x55`. La edición debe afectar únicamente el contenido visible en el modal y el contenido enviado a impresión durante esa interacción; no debe actualizar el producto ni persistir cambios en la base de datos.

La capacidad debe estar gobernada por la configuración compartida de layout (`editableDescription`) y por la propiedad HTML `contentEditable`, sin crear una variante de comportamiento específica para thermal o `label-45x55`.

## Análisis de la implementación actual

- `src/components/stock/product-print-modal.tsx` es un Client Component porque controla el diálogo, los controles de impresión, los códigos de barras y la llamada a `printElement`.
- `ProductPrintLayout` ya define `editableDescription` y el render común de la descripción ya asigna `contentEditable={config.layout.editableDescription}`, además de `suppressContentEditableWarning`, `spellCheck={false}` y un `title` contextual.
- El layout A4 tiene `editableDescription: true` y clases visuales de foco/edición.
- Los layouts `thermal` y `label-45x55` tienen actualmente `editableDescription: false`; sus descripciones se renderizan mediante el mismo `renderTag`, pero quedan no editables.
- Las descripciones se imprimen desde el mismo árbol DOM referenciado por `printRef`, por lo que un cambio realizado directamente en el elemento editable debe estar presente al invocar `printElement`, sin requerir una escritura en servidor.
- `ProductPrintModal` permite cambiar `paperSize` entre los tres valores y usa `PRODUCT_PRINT_FORMAT_CONFIG[paperSize]` para seleccionar layout, estilos, tamaños, dimensiones y comportamiento de impresión.
- `src/components/ProductDataTable.tsx` abre el modal con `format="thermal"`; `src/app/(protected)/stock/bulk-update/page.tsx` lo abre con el formato por defecto A4. No se requiere modificar estos consumidores.
- La suite existente contiene `src/__tests__/components/ProductPrintModal.test.tsx` y ya verifica la editabilidad de la descripción en el caso A4. Esta especificación requiere ampliar la cobertura posteriormente, pero no modifica tests en esta etapa.

## Requisitos funcionales

1. `editableDescription` debe ser `true` en la configuración de los layouts `a4`, `thermal` y `label-45x55`.
2. El render común de la descripción debe continuar usando `config.layout.editableDescription` como única fuente de verdad para `contentEditable`.
3. En cada formato, cada elemento `.label-description` debe permitir edición directa mediante interacción normal del navegador, por ejemplo, foco y escritura o `fireEvent.input`.
4. La edición debe ser temporal:
   - No debe llamar acciones, APIs, Prisma, Firebase ni ningún mecanismo de persistencia.
   - No debe mutar el objeto `ProductExtended` recibido ni actualizar el catálogo.
   - Al cerrar el modal, la edición no debe quedar almacenada para futuras aperturas.
5. Cuando se presiona `Imprimir` después de editar una descripción, `printElement` debe recibir el contenedor `printRef` que contiene el texto editado.
6. Debe conservarse el comportamiento compartido existente para la edición: `suppressContentEditableWarning`, `spellCheck={false}` y el título que indica que la descripción puede editarse antes de imprimir.
7. Las clases de descripción podrán conservar o incorporar la señal visual de foco existente, pero no deben alterar la tipografía, el ajuste de texto ni las dimensiones específicas de cada formato salvo lo estrictamente necesario para habilitar la edición.
8. El cambio debe funcionar tanto cuando el modal se abre inicialmente en un formato como cuando el usuario cambia entre A4, thermal y `label-45x55` dentro del mismo modal. El formato actualmente seleccionado debe determinar el layout mediante `PRODUCT_PRINT_FORMAT_CONFIG`.
9. Deben conservarse sin cambios funcionales:
   - precios, su formato y su editabilidad actual;
   - nombres/códigos de producto y códigos de barras;
   - cantidad de copias y paginación;
   - tamaños de papel, orientación, estilos `@page` y llamada a `printElement`;
   - anchuras, alturas, `a4Span`, grid A4 y dimensiones físicas de thermal/`label-45x55`;
   - orden DOM del código y código de barras;
   - visibilidad de precio y generación de códigos de barras.

## Diseño técnico propuesto

### Flujo de datos

```text
PRODUCT_PRINT_FORMAT_CONFIG[paperSize]
  -> config.layout.editableDescription === true
  -> renderTag()
  -> .label-description contentEditable=true
  -> usuario edita el DOM dentro del modal
  -> handlePrint()
  -> printElement(printRef.current, configuración existente)
```

La descripción no debe copiarse a estado global ni enviarse a una acción de servidor: el DOM del modal es el estado transitorio de la edición. Si el render vuelve a crear las etiquetas por un cambio de formato o controles existentes, el comportamiento esperado es que el nuevo render se base en la descripción original del producto; no se requiere persistir ni transportar ediciones entre renders o aperturas.

### Configuración por formato

La matriz final esperada es:

| Formato | `layout.kind` | `editableDescription` | `contentEditable` efectivo |
|---|---|---:|---:|
| `a4` | `a4` | `true` | `true` |
| `thermal` | `thermal` | `true` | `true` |
| `label-45x55` | `label` | `true` | `true` |

`contentEditable` no debe quedar hardcodeado a `true` independientemente de la configuración: debe seguir expresando la decisión de `editableDescription` para preservar la extensibilidad del contrato `ProductPrintLayout`.

## Archivos afectados

### Cambio esperado

- `src/components/stock/product-print-modal.tsx`
  - Actualizar la configuración de `editableDescription` para thermal y `label-45x55`.
  - Mantener el render común de descripción basado en `config.layout.editableDescription` y sus atributos auxiliares.
  - No modificar la configuración de precios, códigos, códigos de barras, tamaños, dimensiones, paginación, estilos de impresión ni `handlePrint`.

### Verificación, sin cambios en esta etapa

- `src/__tests__/components/ProductPrintModal.test.tsx`: debe ampliarse durante la etapa QA para verificar A4, thermal y `label-45x55`, edición del DOM y que la impresión usa el contenedor editado. Este archivo no debe ser modificado por la etapa de arquitectura.
- `src/components/ProductDataTable.tsx`: verificar que su apertura thermal hereda la capacidad sin cambios.
- `src/app/(protected)/stock/bulk-update/page.tsx`: verificar que su apertura A4 no cambia.
- `src/lib/print/`: verificar que no es necesario modificar el adaptador de impresión; el contrato y los parámetros deben permanecer intactos.

### Archivos explícitamente fuera de alcance

- `prisma/schema.prisma`, migraciones, seed y cliente Prisma.
- Acciones de servidor, endpoints, esquemas Zod, modelos de producto y consultas de catálogo.
- Persistencia local, contexto global, almacenamiento del navegador y variables de entorno.
- Dependencias del proyecto.

## Criterios de aceptación verificables

### CA-01 — Configuración compartida habilitada

Importar `PRODUCT_PRINT_FORMAT_CONFIG` y comprobar que `layout.editableDescription` es `true` para `a4`, `thermal` y `label-45x55`.

### CA-02 — A4 continúa editable

Renderizar el modal con `format="a4"`. Debe existir al menos un `.label-description` con `contentEditable="true"`; al cambiar su `textContent`, el texto visible debe reflejar el valor editado.

### CA-03 — Thermal editable

Renderizar el modal con `format="thermal"`. El `.label-description` debe tener `contentEditable="true"`, permitir cambiar temporalmente su contenido y conservar el precio, código y dimensiones térmicas existentes.

### CA-04 — Label 45x55 editable

Renderizar el modal con `format="label-45x55"`. El `.label-description` debe tener `contentEditable="true"`, permitir cambiar temporalmente su contenido y conservar orientación landscape, dimensiones `55mm × 45mm`, precio, código y barcode existentes.

### CA-05 — Render controlado por configuración

Para los tres formatos, el atributo efectivo de cada descripción debe coincidir con `config.layout.editableDescription`. La implementación no debe depender de comprobaciones separadas por nombre de formato en el punto común de renderizado.

### CA-06 — Texto editado llega a impresión

Editar la descripción de una etiqueta, pulsar `Imprimir` y comprobar que la llamada a `printElement` recibe el mismo contenedor de impresión cuyo `.label-description` contiene el texto editado. No debe requerirse una llamada a persistencia.

### CA-07 — Edición no persistente

Después de editar una etiqueta y cerrar/reabrir el modal con el mismo producto, la descripción debe volver al valor original del producto. No debe invocarse ninguna acción de actualización ni cambiarse el objeto de entrada.

### CA-08 — Copias y formatos sin regresión

Con múltiples productos y copias, debe conservarse el número de etiquetas y su paginación actual. Cada instancia visible de `.label-description` debe ser editable, sin compartir accidentalmente el contenido editado de una copia con otra.

### CA-09 — Propiedades de edición conservadas

Cada descripción editable debe mantener `spellcheck="false"`, `suppressContentEditableWarning` en React y el texto de ayuda/título existente para la edición antes de imprimir.

### CA-10 — Sin alteración del contrato de impresión

Para cada formato, `printElement` debe seguir recibiendo los mismos valores de `format`, `pageStyle` y `orientation` que antes del cambio. Las dimensiones, precios, códigos, códigos de barras, estilos y orden de elementos deben permanecer sin cambios.

### CA-11 — Calidad y alcance

La solución no agrega dependencias ni cambios de esquema o persistencia. Debe pasar los tests existentes y los que se agreguen para estos criterios, `npm run lint` y `npx tsc --noEmit`.

## Plan de verificación para QA (sin implementar en esta etapa)

1. Ampliar la prueba de `ProductPrintModal` parametrizando los tres formatos y verificando `contentEditable`.
2. Verificar edición temporal del DOM para un producto y para múltiples copias.
3. Mockear `printElement`, editar una descripción y comprobar que el nodo enviado contiene el texto modificado y que las opciones de impresión no cambiaron.
4. Cerrar y reabrir el modal para verificar que no existe persistencia.
5. Ejecutar la suite completa, lint y typecheck, y documentar los resultados en el checklist de QA de la feature.

## Fuera de alcance

- Guardar descripciones editadas en productos, base de datos, Firebase, localStorage o cualquier otro almacenamiento.
- Editar desde otra pantalla distinta de `ProductPrintModal`.
- Hacer editables precios, códigos, códigos de barras, dimensiones o estilos que actualmente no lo son.
- Crear un botón de guardar/restaurar descripción o transportar cambios entre aperturas/formats.
- Cambiar el motor de impresión, la orientación, tamaños físicos, paginación o plantilla visual de cualquiera de los formatos.
