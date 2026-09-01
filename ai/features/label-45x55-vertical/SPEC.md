# SPEC — Etiqueta 45 × 55 mm en orientación vertical

**Gate:** G1 — especificación arquitectónica aprobada para implementación posterior.

## 1. Decisión de alcance

La solicitud menciona `src/components/stock/set-codebar-modal.tsx`, pero ese componente **solo asigna/actualiza** el código de barras mediante `updateProduct`; no recibe descripción, precio ni código interno y no contiene ningún flujo de impresión.

El flujo de impresión individual existente está en `src/components/stock/code-bar-modal.tsx`, y se abre desde la misma fila de stock junto a `SetCodebarModal`. El flujo de impresión masiva está en `product-print-modal.tsx`.

Por tanto, esta feature define el nuevo formato para la etiqueta individual que el usuario alcanza desde la fila de stock, sin mezclar persistencia de datos con presentación de impresión. `set-codebar-modal.tsx` no debe imprimir ni duplicar el modal de etiquetas. Si se requiere que el botón de asignación también imprima directamente, debe abrir/reutilizar el flujo de `CodeBarModal` en una feature separada con datos de producto explícitos.

## 2. Objetivo y comportamiento visible

- Sustituir el formato de etiqueta individual actual por una etiqueta física de **45 mm de ancho × 55 mm de alto**.
- La etiqueta debe ser siempre vertical: ancho menor que alto y CSS de página explícitamente `portrait`.
- Mantener el acceso actual desde el botón de código de barras de la fila de stock.
- Mantener el diálogo actual de `CodeBarModal`: cantidad de copias de 1 a 50, opción “Mostrar precio”, selección entre código interno y código de barras, vista previa y botón “Imprimir!”.
- No cambiar el guardado, validación ni normalización del código de barras del `SetCodebarModal`.
- Cada copia se imprime como una página/etiqueta individual, no como una cuadrícula horizontal ni como una hoja A4.

La vista previa debe representar la proporción 45:55 y mostrar el contenido centrado y en negro sobre fondo blanco. La etiqueta se ordena de arriba hacia abajo así:

1. Descripción del producto.
2. Precio, únicamente si “Mostrar precio” está activo.
3. Código interno del producto.
4. Código de barras CODE128 generado por JsBarcode, usando el valor elegido por “Generar desde”.

La descripción puede truncarse visualmente o envolver dentro del ancho útil; nunca puede provocar desbordamiento horizontal. El SVG del código de barras debe conservar texto legible debajo de las barras y caber dentro de los márgenes físicos.

## 3. Datos e interfaces

No hay cambios de base de datos, Prisma, Server Actions ni esquemas Zod.

Se conserva la interfaz pública actual de `CodeBarModal`:

```ts
interface Props {
  code: string;
  codebar?: string;
  description: string;
  salePrice: number;
  unit?: string;
}
```

Reglas de datos:

- `code` es el código interno mostrado y el valor por defecto para generar el barcode.
- `codebar`, cuando existe, se ofrece como segunda fuente; un valor vacío se trata como ausente.
- `salePrice` mantiene el redondeo/formato vigente (`$` y redondeo a decenas).
- `unit` conserva compatibilidad de interfaz, pero no se agrega a la etiqueta salvo que el comportamiento existente lo use posteriormente.
- El número de copias sigue limitado a 1–50 y se normaliza como actualmente.

## 4. Diseño de impresión

### 4.1 CSS físico obligatorio

El `pageStyle` pasado a `printElement` debe incluir, como mínimo:

```css
@page { size: 45mm 55mm portrait; margin: 0; }
@media print {
  html, body { width: 45mm; margin: 0; padding: 0; }
  .label-container {
    width: 45mm !important;
    height: 55mm !important;
    box-sizing: border-box;
    overflow: hidden;
  }
}
```

La implementación debe usar unidades físicas (`mm`, no píxeles) para la caja, márgenes y separación principal. El área útil debe dejar un margen interno razonable (objetivo: 2 mm por lado) sin cambiar las dimensiones externas. No se debe usar `auto-fill`, `grid`, `landscape`, `55mm 45mm` ni `@page size: auto` en este flujo.

El estilo de impresión debe ocultar controles y contenedores de interfaz, desactivar márgenes del navegador dentro del documento (`margin: 0`, `padding: 0`) y conservar alto contraste (`color: #000`, `background: #fff`, `-webkit-print-color-adjust: exact`). Debe evitar `page-break-inside` dentro de la etiqueta y establecer un salto de página entre copias para que cada etiqueta ocupe una página física.

### 4.2 Orientación y limitación del navegador

- La llamada debe declarar `format: "thermal"` y `orientation: "portrait"`.
- El `@page` anterior es la garantía que puede proporcionar CSS: define una página 45 × 55 mm vertical.
- `window.print()` no permite imponer por código la configuración del driver ni impedir que el usuario seleccione otra impresora, escala, márgenes u orientación. La UI de impresión puede sobrescribir `@page`.
- El diálogo debe mostrar una ayuda breve y visible (por ejemplo, “En la impresión seleccioná escala 100%, márgenes ninguno y orientación vertical”) sin afirmar que el navegador puede bloquear esos cambios.
- No se deben usar QZ Tray ni ESC/POS para esta etiqueta: el flujo solicitado es impresión HTML del navegador y esos caminos no admiten de forma equivalente una página física vertical de 45 × 55 mm.

## 5. Compatibilidad con `printElement`

`src/lib/print/BrowserPrint.ts` ya abre una ventana nueva, copia `element.innerHTML`, inyecta `pageStyle` y ejecuta `window.print()`; se reutiliza ese mecanismo.

Impacto requerido:

- Verificar que el soporte existente para `orientation` no se contradiga con el `pageStyle` personalizado. Si `orientation` hoy no se usa al generar CSS, la implementación debe incluir `portrait` en el `@page` de la feature; no es necesario cambiar el contrato global.
- Mantener la ruta de fallback a PDF, pero documentar que PDF no puede garantizar el tamaño físico final si el usuario cambia la escala al imprimirlo.
- No cargar fuentes externas ni depender de Tailwind CDN para el layout crítico de la etiqueta.
- Cerrar la ventana de impresión solo después de que el documento esté listo, siguiendo el comportamiento actual de `tryBrowserPrint`.

## 6. Estructura de archivos e impacto

### Archivo a modificar

| Archivo | Cambio |
|---|---|
| `src/components/stock/code-bar-modal.tsx` | Cambiar constantes, preview, dimensiones, CSS de impresión, saltos entre copias y llamada de impresión al formato 45 × 55 mm portrait. Conservar controles y fuentes de datos. |

### Archivo a revisar, sin cambio esperado

| Archivo | Motivo |
|---|---|
| `src/components/stock/set-codebar-modal.tsx` | Es únicamente asignación del código; no debe recibir responsabilidades de impresión. Confirmar que sigue funcionando sin cambios. |
| `src/components/stock/product-print-modal.tsx` | Impresión masiva A4/thermal distinta; no debe adoptar este formato individual salvo requerimiento explícito posterior. |
| `src/lib/print/BrowserPrint.ts` | Reutilizar `printElement`; cambiar solo si la auditoría confirma que `orientation` debe incorporarse globalmente al estilo generado. |
| `src/components/ProductDataTable.tsx` y `src/components/stock/stock-table.tsx` | Verificar que continúan pasando los datos completos a `CodeBarModal` y que el botón de asignación no cambia de comportamiento. |

### Dependencias

No se agregan dependencias. Se mantienen `jsbarcode` y `@/lib/print`.

## 7. Restricciones y casos límite

- El tamaño CSS externo debe ser exactamente 45 × 55 mm; el borde debe estar dentro del `box-sizing` para no aumentar la página.
- Una descripción larga debe envolver/truncar, sin desbordar ni alterar la página.
- Si el precio está oculto, el barcode puede ocupar el espacio vertical liberado, pero la caja sigue midiendo exactamente 55 mm.
- Si no hay `codebar`, la fuente seleccionada “Código interno” continúa siendo válida; no debe aparecer un barcode vacío.
- Copias mayores que una deben producir el mismo número de páginas que copias solicitadas.
- Cancelar/cerrar el diálogo no debe guardar ni modificar datos.
- El código de barras nunca debe generarse en el servidor ni persistirse como imagen.
- No se deben introducir secretos, cambios de esquema ni cambios en la acción `updateProduct`.

## 8. Criterios de aceptación medibles

1. **AC1 — Dimensión:** inspeccionando el DOM de impresión, cada `.label-container` tiene `width: 45mm` y `height: 55mm`, y no existe una dimensión alternativa para esta ruta.
2. **AC2 — Página:** el `pageStyle` contiene exactamente una regla equivalente a `@page { size: 45mm 55mm portrait; margin: 0; }`.
3. **AC3 — Orientación:** la llamada a `printElement` usa `format: "thermal"`, declara `orientation: "portrait"` y el CSS no contiene `landscape` ni dimensiones invertidas.
4. **AC4 — Contenido:** una etiqueta muestra descripción, código interno y barcode; el precio aparece solo cuando la casilla está activa.
5. **AC5 — Fuente barcode:** al alternar entre código interno y código de barras, el SVG y su texto legible representan la fuente seleccionada.
6. **AC6 — Copias:** para N copias, el preview contiene N etiquetas y el documento de impresión inserta un salto entre etiquetas, con N entre 1 y 50.
7. **AC7 — Ajuste:** descripción, precio y SVG no desbordan horizontalmente la caja de 45 mm en un caso de descripción de al menos 80 caracteres y un barcode Code128 típico de 13 dígitos.
8. **AC8 — Navegador:** al imprimir mediante `window.print()`, los controles del diálogo no aparecen y el contenido de cada copia queda en una página separada de 45 × 55 mm, sujeto a las preferencias que el usuario/driver pueda sobrescribir.
9. **AC9 — Compatibilidad:** `SetCodebarModal` sigue guardando un código válido y mostrando sus toasts; asignar un código no abre ni dispara impresión automáticamente.
10. **AC10 — Regresión:** las entradas desde `ProductDataTable` y `stock-table` siguen abriendo el diálogo individual con los mismos datos, sin cambios de API ni de persistencia.

## 9. Gate G1

**G1 aprobado:** el alcance, la separación entre asignación e impresión, el contrato de datos, las reglas físicas de 45 × 55 mm portrait, las limitaciones inevitables de `window.print()`, los impactos y los criterios verificables están definidos. No se implementan código ni pruebas en esta etapa.
