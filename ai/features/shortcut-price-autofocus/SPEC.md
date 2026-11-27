# SPEC: Autofoco del precio al agregar productos mediante atajos

## Resumen

En la pantalla de nueva factura (`/newBill`), al presionar `F1`, `F2` o `F3` cuando la tecla tiene un producto configurado, el producto se agrega a la factura con precio editable y el foco debe pasar automáticamente al input de precio de ese producto.

El alcance es exclusivamente la interacción de la factura nueva. No se modifican productos, configuraciones de atajos, persistencia ni acciones de base de datos.

## Análisis del código existente

- `src/app/(protected)/newBill/page.tsx` monta `BillProvider` y `ProductsTable`.
- `ProductsTable` renderiza `PrintableTable` y `BillButtons` bajo el mismo provider.
- `BillButtons` escucha globalmente `F1`, `F2` y `F3`, consulta el producto mediante `getProductByShortcutAction`, crea el producto con `salePrice: 0` y llama a `addItem`.
- `BillProvider` ya expone `focusPriceProductId` y `setFocusPriceProductId` mediante `BillContext`.
- `PriceEditInput` consume ese identificador; cuando coincide con su `productId`, debe pasar a modo edición, enfocar el elemento nativo y limpiar la solicitud de foco.
- `PrintableTable` ordena los productos antes de renderizarlos, por lo que el foco debe depender del `productId`, no de la posición de la fila.
- La página es un Server Component; el manejo de teclado, contexto y foco permanece en los componentes Client existentes. No debe trasladarse lógica de navegador a `page.tsx`.

Existe, por tanto, un mecanismo parcial de señalización ya presente. La implementación deberá conservarlo o ajustarlo para que el foco ocurra de forma determinista después de que el producto exitosamente agregado esté montado, y deberá quedar cubierto por pruebas TDD.

## Requisitos funcionales

1. Para cada tecla `F1`, `F2` y `F3` con un atajo configurado y una sesión de caja activa:
   1. prevenir la acción predeterminada del navegador;
   2. obtener el producto configurado;
   3. agregarlo una sola vez a la factura con cantidad inicial `1` y precio inicial editable `0`;
   4. solicitar el foco usando el identificador único del producto;
   5. enfocar el input de precio cuando dicho producto esté presente en el DOM.
2. El input enfocado debe quedar en modo edición y conservar el valor inicial del producto para que el usuario pueda escribir el precio inmediatamente.
3. La solicitud de foco debe consumirse una sola vez. Una vez enfocado el input, el identificador pendiente debe limpiarse.
4. Si se agregan otros productos por búsqueda, click u otro flujo normal, no se debe enfocar automáticamente su precio.
5. Si no hay atajo configurado, la acción debe ser no-op respecto de la factura y no debe cambiar el foco de precio.
6. Si la sesión no está activa, o la consulta del producto falla, o el producto configurado ya no existe, no se debe agregar ningún producto ni dejar una solicitud de foco pendiente.
7. La funcionalidad debe continuar limitada a nueva factura; los atajos no deben activarse mientras `BillButtons` está en modo de edición de una venta existente.
8. F4, F5, F9 y F10 deben conservar su comportamiento actual.

## Diseño técnico propuesto

### Flujo de datos

```text
keydown(F1|F2|F3)
  -> BillButtons valida modo, atajo y sesión
  -> getProductByShortcutAction
  -> addItem(producto con salePrice=0, amount=1)
  -> setFocusPriceProductId(product.id)
  -> BillProvider actualiza contexto
  -> PrintableTable renderiza PriceEditInput del producto
  -> PriceEditInput enfoca input y entra en edición
  -> limpia focusPriceProductId
```

La señal de foco se mantiene en `BillContext`, porque `BillButtons` y `PriceEditInput` son ramas hermanas bajo `BillProvider`. No se recomienda usar selectores globales por posición, ids derivados de la descripción ni `document.querySelector` desde el manejador de teclado.

### Archivos candidatos

- `src/components/Billing/BillButtons.tsx`: mantener la solicitud de foco únicamente en la rama de respuesta exitosa y después de preparar el producto que se agregará.
- `src/components/Billing/PriceEditInput.tsx`: garantizar que el efecto responde cuando el input ya está montado o se monta como consecuencia del agregado, enfoca el `HTMLInputElement`, activa edición y consume la señal.
- `src/context/BillContext.tsx` y `src/context/BillProvider.tsx`: conservar la interfaz existente, salvo que las pruebas demuestren que hace falta tipar o encapsular mejor la solicitud.
- `src/components/Billing/PrintableTable.tsx`: no alterar el ordenamiento; verificar que el `PriceEditInput` recibe el id estable del producto.

No se esperan cambios en Prisma, acciones de servidor, esquema Zod, rutas, variables de entorno ni dependencias.

### Consideraciones de sincronización

- El foco no debe ejecutarse antes de que el input exista. El mecanismo debe funcionar tanto si el estado de foco se actualiza antes del render del nuevo producto como si el producto ya está montado.
- Si se presionan varias teclas mientras hay consultas pendientes, cada respuesta exitosa debe agregar su producto una vez; el foco final debe corresponder al último producto exitosamente señalado que siga presente en la factura. No se debe enfocar un producto de una respuesta fallida.
- La limpieza de la señal no debe borrar una solicitud más nueva. Si se conserva un único `focusPriceProductId`, la implementación debe evitar que una respuesta tardía consuma incorrectamente el foco de otra solicitud.
- La interacción de teclado debe seguir usando APIs de navegador únicamente dentro de Client Components y efectos/event handlers, conforme al patrón App Router del proyecto.

## Criterios de aceptación verificables

### CA-01 — F1 enfoca el precio

Con una configuración válida para F1 y sesión activa, al disparar `keydown` con `key === "F1"`, esperar la respuesta exitosa y el render: debe existir exactamente un input de precio para el producto agregado, debe tener foco (`document.activeElement`), estar en modo edición y su valor inicial debe ser `"0"`.

### CA-02 — F2 y F3 tienen el mismo comportamiento

Repetir CA-01 con F2 y F3. Cada tecla debe agregar el producto correspondiente una sola vez y enfocar el input cuyo `aria-label` contiene el id de ese producto.

### CA-03 — El foco usa identidad, no posición

Con al menos dos productos y ordenamiento alfabético que cambie la posición del producto agregado, el input enfocado debe corresponder al `productId` del atajo y no a la primera, última o fila previamente enfocada.

### CA-04 — Solicitud consumida una sola vez

Después del primer foco, una nueva renderización sin una nueva solicitud no debe volver a entrar en modo edición ni cambiar el foco. El estado/contexto no debe conservar un `focusPriceProductId` pendiente.

### CA-05 — Flujos no aplicables no enfocan

Verificar que no cambia el foco de precio y no se agrega producto cuando: (a) F1/F2/F3 no está configurada, (b) no hay sesión activa, (c) la acción devuelve error, o (d) devuelve configuración sin producto.

### CA-06 — Agregado normal sin regresión

Agregar un producto mediante `ProductSearchBar`/flujo normal. El producto aparece en la tabla, pero su precio permanece en modo no editable hasta interacción explícita del usuario.

### CA-07 — Edición existente y otras teclas sin regresión

Con `isEditing` verdadero, F1/F2/F3 no debe agregar productos ni solicitar foco. F4, F5, F9 y F10 deben conservar sus handlers y condiciones actuales.

### CA-08 — Prevención del navegador

Para F1, F2 y F3, el evento debe quedar prevenido incluso cuando no exista configuración, evitando el comportamiento predeterminado del navegador.

### CA-09 — Accesibilidad del control enfocado

El elemento enfocado debe ser un `<input>` nativo con el `aria-label` de precio existente, `inputMode="decimal"`, y debe aceptar escritura inmediata sin que el usuario tenga que hacer un click adicional.

### CA-10 — Calidad y compatibilidad

La solución no agrega dependencias ni cambios de esquema. Debe pasar los tests nuevos y existentes, `npm run lint` y `npx tsc --noEmit`; la página `/newBill` debe continuar compilando como Server Component con sus componentes interactivos debajo de `BillProvider`.

## Plan TDD para QA (sin implementar en esta etapa)

1. Añadir pruebas de componente para `PriceEditInput` que cubran señal coincidente, montaje posterior, limpieza y señal no coincidente.
2. Añadir pruebas del manejador de atajos en `BillButtons` con mocks de `getShortcutConfigsAction`, `getProductByShortcutAction`, sesión/caja y contexto; cubrir F1/F2/F3, errores, atajos ausentes y modo edición.
3. Añadir una prueba de integración de `BillProvider` + `PrintableTable`/`PriceEditInput` que verifique `document.activeElement` después del agregado asíncrono.
4. Ejecutar la suite existente y crear el checklist de QA en `ai/features/shortcut-price-autofocus/TEST_CHECKLIST.md` en el paso 2 del workflow. Esta especificación no crea tests ni checklist.

## Fuera de alcance

- Cambiar teclas o configuración de F1/F2/F3.
- Enfocar cantidad, búsqueda, botones de cobro o cualquier control distinto del precio.
- Persistir el precio automáticamente sin confirmación del usuario.
- Cambiar el precio configurado en el catálogo o introducir una nueva acción/API.
