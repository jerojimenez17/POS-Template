# SPEC — Mejoras visuales

## 1. Objetivo

Corregir dos problemas de presentación sin modificar el flujo de negocio:

1. La pantalla de búsqueda de comprobantes debe mantener contraste y legibilidad cuando el tema oscuro está activo.
2. El selector de clientes usado desde **A cuenta** y **Presupuesto** debe adaptarse a la altura disponible en mobile después de seleccionar un cliente, sin cambiar el comportamiento visual de desktop.

La solución debe conservar las props, acciones, estados y endpoints existentes.

## 2. Diagnóstico del código actual

### 2.1 `searchBill`

`src/app/(protected)/searchBill/page.tsx` delega la tabla a `SalesTable`, por lo que el alcance visual no debe limitarse al `page.tsx`.

- `SalesTable` fija `text-black` en el contenedor raíz.
- El total y la paginación usan colores claros sin variante `dark:` (`text-gray-800`, `text-gray-700`, `bg-white` y `bg-opacity-50`).
- `SaleAccordion` fija cada fila en `bg-white` y no define un fondo oscuro equivalente. En el documento oscuro esto puede producir combinaciones de texto claro sobre fondo blanco.
- Algunos estados ya tienen variantes dark, pero no existe una paleta consistente para contenedor, fila, separadores, controles y textos secundarios.

### 2.2 Selector de clientes en `newBill`

`src/components/Billing/BillButtons.tsx` monta `ClientSelectionModal` para ambos flujos. Al seleccionar un cliente, `ClientSelectionModal` muestra un bloque adicional con CUIT/CUIL, condición IVA y notas.

El `DialogContent` compartido usa posicionamiento centrado y padding fijo, pero el modal no define una altura máxima ni una estrategia de scroll. El contenido puede superar la altura de un viewport mobile (lista de hasta 300 px + formulario adicional + encabezado, total y footer), provocando clipping, desplazamiento incómodo o una superficie útil vertical demasiado pequeña.

## 3. Alcance funcional y visual

### 3.1 Tabla de comprobantes en tema oscuro

Aplicar una paleta semánticamente consistente a:

- contenedor de la tabla;
- encabezado;
- filas normales y hover;
- separadores y bordes;
- fecha, comprobante, medio de pago, vendedor y total;
- bloque de paginación y selector de filas;
- mensaje de lista vacía;
- botón `Facturar` y controles interactivos de la fila, incluidos sus estados hover/focus.

Usar las utilidades existentes de Tailwind y sus pares `dark:`. No cambiar el contenido, orden, paginación, filtrado, impresión ni suscripciones Pusher.

Recomendación de tokens visuales:

- superficie principal: `bg-white dark:bg-gray-800`;
- superficie de fila: `bg-white dark:bg-gray-800` o un nivel diferenciado equivalente;
- hover claro/oscuro explícito;
- texto primario claro y oscuro explícito (`text-gray-900 dark:text-gray-100`);
- texto secundario con variante oscura (`text-gray-600 dark:text-gray-400`);
- bordes claros/oscuros explícitos.

No usar `text-black` ni `text-white` como color global de la tabla si el fondo puede cambiar por tema. La solución puede requerir cambios en `SalesTable.tsx` y `SaleAccordion.tsx`; `searchBill/page.tsx` solo debe cambiar si resulta necesario para el contenedor exterior.

### 3.2 Modal responsive de cliente

Modificar el uso de `DialogContent` en `ClientSelectionModal.tsx` de forma localizada, sin alterar el componente base `src/components/ui/dialog.tsx` salvo que el implementador demuestre que es imprescindible.

Comportamiento requerido:

- En mobile, el modal debe caber dentro de la altura visible usando unidades de viewport dinámicas (`dvh`) y considerar un margen pequeño respecto de los bordes.
- Al aparecer el bloque dependiente de `selectedClientId`, el modal no debe salir del viewport ni reducir el contenido a una franja inutilizable.
- El contenido central (búsqueda, lista y datos opcionales del cliente) debe poder desplazarse verticalmente de forma independiente.
- El encabezado y las acciones principales deben seguir siendo alcanzables; preferentemente el footer debe permanecer visible mientras se desplaza el cuerpo.
- La lista de clientes debe conservar su scroll interno y no generar dos scrolls innecesarios para la misma región.
- Inputs, select, textarea y botones deben conservar un tamaño táctil usable y no provocar overflow horizontal.
- En desktop se debe conservar el ancho máximo actual (`max-w-md`), centrado, spacing y altura natural cuando el contenido cabe.
- Las mismas restricciones de altura deben contemplarse para los tres diálogos renderizados por el componente: selección principal, creación de cliente y selección de orden existente. El flujo, textos, callbacks y estados de carga no cambian.

Estrategia recomendada:

1. En cada `DialogContent` de este componente, añadir clases responsive locales: ancho con margen lateral, `max-h-[calc(100dvh-...)]` en mobile, `overflow-hidden` y layout vertical.
2. Separar visualmente el cuerpo del footer; hacer que el cuerpo tenga `min-h-0` y `overflow-y-auto`.
3. Mantener en desktop el `sm:max-w-lg` proveniente del componente base y el comportamiento natural mediante overrides desde `sm:`.
4. Evitar fijar una altura absoluta que recorte el contenido o cambie la experiencia de desktop.

Estas son recomendaciones de implementación, no una nueva interfaz pública. `ClientSelectionModalProps` debe permanecer compatible y no se requieren cambios en `BillButtons.tsx` salvo ajustes de clases si el desarrollo identifica un overflow del contenedor padre.

## 4. Interfaces y contratos

No se agregan APIs, modelos Prisma, server actions, variables de entorno ni dependencias.

La interfaz pública existente debe permanecer sin cambios:

```ts
interface ClientSelectionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: Array<{
    id: string;
    code?: string;
    description: string;
    salePrice: number;
    amount: number;
  }>;
  total: number;
  businessId: string;
  onSuccess?: () => void;
  mode?: "unpaid" | "budget";
  seller?: string;
  discount?: number;
  totalWithDiscount?: number;
}
```

No se debe modificar el significado de `mode`, la selección de cliente, la detección de órdenes pendientes, la creación de presupuesto/orden ni los callbacks de éxito.

## 5. Archivos recomendados

### Modificar

- `src/components/Billing/SalesTable.tsx`: eliminar colores globales incompatibles con tema oscuro y completar variantes de tema para resumen, tabla y paginación.
- `src/components/Billing/SaleAccordion.tsx`: definir superficie, texto, hover y controles de cada fila para ambos temas.
- `src/components/ledger/ClientSelectionModal.tsx`: aplicar layout de altura máxima y scroll responsive a los tres `DialogContent`; mantener la lógica intacta.

### Revisar, solo si fuera necesario

- `src/app/(protected)/searchBill/page.tsx`: verificar que el wrapper no fuerce un fondo o overflow que contradiga la tabla.
- `src/components/Billing/BillButtons.tsx`: verificar que el modal se abra igual en los modos A cuenta y Presupuesto; no cambiar lógica.
- `src/components/ui/dialog.tsx`: no modificar como primera opción, porque es compartido por toda la aplicación y un cambio global podría introducir regresiones.

## 6. Criterios de aceptación

### Tema oscuro

1. Con el tema oscuro activo, en `/searchBill` ninguna fila visible presenta texto blanco o claro sobre un fondo blanco claro, ni texto oscuro sobre un fondo oscuro sin contraste.
2. El encabezado, al menos una fila con datos, una fila en hover, el mensaje sin resultados y la paginación son legibles en tema oscuro sin depender de estilos heredados del tema claro.
3. El texto primario y secundario de fecha, comprobante, medio de pago, vendedor y total conserva contraste mínimo WCAG AA: **4.5:1** para texto normal y **3:1** para texto grande o componentes gráficos/bordes relevantes.
4. Los estados hover, focus-visible, disabled y el botón `Facturar` siguen siendo distinguibles en ambos temas.
5. Con el tema claro activo, la tabla conserva una apariencia equivalente a la actual: fondo claro, bordes visibles y texto legible.
6. Los filtros, ordenamiento visual, paginación, carga adicional, navegación al detalle, impresión y eliminación mantienen su comportamiento actual.

### Mobile del modal

7. En viewport mobile de referencia de **360 × 640 CSS px**, al abrir A cuenta o Presupuesto y seleccionar un cliente, el `DialogContent` permanece completamente dentro del viewport visible (respetando un margen mínimo de 8 px), sin clipping superior/inferior ni overflow horizontal.
8. En ese mismo escenario, el usuario puede alcanzar y activar `Cancelar` y `Confirmar` sin hacer zoom ni cerrar/reabrir el modal; si el cuerpo excede la altura, el desplazamiento vertical es funcional y visible.
9. La lista, CUIT/CUIL, condición IVA, notas, total y footer siguen siendo accesibles después de seleccionar un cliente; el bloque adicional no hace desaparecer el total ni las acciones.
10. La creación de un nuevo cliente y el diálogo de órdenes pendientes también son utilizables en viewport mobile de 360 × 640, incluyendo sus botones y contenido desplazable.
11. En viewport desktop de referencia de **1280 × 800 CSS px**, el modal conserva su centrado, ancho máximo, espaciado y altura natural; no aparece un scroll innecesario cuando todo el contenido cabe.
12. Abrir/cerrar el modal, buscar clientes, seleccionar cliente, crear cliente, crear nueva orden, agregar a una orden existente y mostrar estados de carga continúan funcionando sin cambios de contrato.

## 7. Verificación para el implementador

- Ejecutar lint y typecheck/build según los comandos del repositorio.
- Hacer comprobación manual en tema claro y oscuro en `/searchBill` con filas reales y sin resultados.
- Comprobar los viewports 360×640 y 390×844 en ambos modos del modal, y al menos un desktop de 1280×800.
- Probar el caso que activa el bloque de CUIT/IVA/notas, que es el disparador del defecto reportado.
- Confirmar que no hubo cambios en Prisma, acciones, endpoints ni contratos de componentes.

## 8. Decisiones arquitectónicas

- La corrección de contraste se mantiene en los componentes que renderizan la tabla, no en reglas globales, para evitar efectos laterales sobre el resto de la aplicación.
- La corrección de altura se mantiene en `ClientSelectionModal`, no en el `DialogContent` compartido, para no cambiar el comportamiento de los demás diálogos.
- No se requiere persistencia, migración, nueva dependencia ni cambio de interfaz pública.
