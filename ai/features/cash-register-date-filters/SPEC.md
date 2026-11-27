# SPEC: Filtros por fecha y total de movimientos de caja

## 1. Objetivo y alcance

Agregar a `/cashRegister` filtros por fecha para el historial de movimientos y mostrar la suma neta de los movimientos que coinciden. El usuario podrá elegir entre **Solo efectivo** y **Todos los medios de pago**. La suma y la lista deben usar exactamente los mismos filtros.

La página actual ya muestra todos los movimientos del negocio y ofrece un selector de efectivo (activo inicialmente) frente a todos los medios. La feature amplía esa experiencia sin alterar el balance actual de caja.

### Fuera de alcance / invariantes

- No modificar `src/app/(protected)/searchBill/page.tsx` ni su comportamiento, filtros, carga, navegación o datos.
- No cambiar la creación de órdenes, movimientos, devoluciones, pagos, retiros, vouchers, sesiones de caja ni sus signos.
- No reinterpretar el balance actual de `TotalPanel`: el nuevo total es un subtotal histórico filtrado y debe tener una etiqueta distinta.
- No incluir sumas de `Order.total`, reembolsos calculados desde `SaleReturn`, ni intentos/registros `PaymentVoucherAttempt`. La única fuente del listado y subtotal es `CashMovement`.
- No cambiar el esquema Prisma ni agregar dependencias para esta funcionalidad.
- No agregar paginación en esta iteración: el historial actual no pagina y debe seguir mostrando el conjunto completo que coincida con los filtros.

## 2. Hallazgos del código existente

- `src/app/(protected)/cashRegister/page.tsx` obtiene la sesión y renderiza `CashRegister`; no necesita cambio funcional.
- `src/components/CashRegister.tsx` solicita `getMovements()` y filtra en cliente por `paidMethod === "Efectivo"`. El filtro inicial es solo efectivo; la fecha no está filtrada. El historial se ordena por `date desc` en cliente.
- `src/actions/movements.ts#getMovements` deriva `businessId` de `auth()` y consulta `CashMovement` de ese negocio, sin parámetros de rango. Sus errores actualmente se convierten en `[]`, haciendo indistinguible un error de una lista vacía.
- `CashMovement.total` es `Float`; entradas y ventas se registran positivas, mientras que retiros y devoluciones/refunds se registran negativas. Aunque el historial actual presenta dos decimales, esta feature debe mostrar los importes de las filas y el subtotal en pesos enteros, sin centavos.
- `CashMovement.paidMethod` es nullable. Efectivo se identifica con la cadena exacta `"Efectivo"`; movimientos como `Deposito`, `Retiro` y `Devolución` son otros valores.
- `Business.timezone` existe, con `America/Argentina/Buenos_Aires` como valor por defecto. La visualización de fecha existente usa `formatLocalDate`, que formatea en la zona horaria local del navegador.
- Pusher agrega en vivo movimientos al array. Con filtros activos, una adición local directa podría dejar lista y subtotal desincronizados o incluir un movimiento fuera del rango.

## 3. Experiencia funcional

### 3.1 Controles y valores iniciales

1. Añadir dos controles de fecha etiquetados **Desde** y **Hasta** (inputs de fecha accesibles por teclado).
2. Al entrar por primera vez, ambos límites están vacíos: se muestran todos los movimientos históricos, preservando el comportamiento vigente.
3. Mantener la opción de método **Solo efectivo** / **Todos los medios de pago**, con **Solo efectivo** seleccionado inicialmente para compatibilidad con el selector actual.
4. El cambio de cualquiera de los tres filtros vuelve a cargar la lista y el subtotal desde el servidor.
5. Mostrar un subtítulo/resumen inequívoco, por ejemplo **Total de movimientos filtrados (neto)**, en un lugar asociado visualmente al historial. No reutilizar ni renombrar el panel **Balance en Efectivo Actual**.
6. Mantener el orden observable por fecha descendente. Para fechas iguales, agregar un desempate estable por `id` (descendente) para evitar que refrescos cambien arbitrariamente el orden.

### 3.2 Semántica de fechas y zona horaria

- Los valores seleccionados son fechas de calendario (`YYYY-MM-DD`), sin hora.
- Interpretar los días en la zona horaria configurada para el negocio, leída en el servidor. Si no hay zona configurada o no es válida, usar `America/Argentina/Buenos_Aires` como fallback.
- `Desde` y `Hasta` son inclusivos para quien usa el filtro. Traducirlos a intervalo semiabierto de instantes: `date >= inicio local de Desde` y `date < inicio local del día siguiente a Hasta`. Calcular el día siguiente como día de calendario en la zona de negocio, no sumando una duración fija de 24 horas, para no fallar en cambios de horario.
- Si solo se especifica `Desde`, no hay límite superior; si solo se especifica `Hasta`, no hay límite inferior.
- Ambas fechas vacías equivalen a no aplicar filtro temporal.
- Una fecha inválida o `Desde > Hasta` no dispara una consulta con rango parcial: mostrar validación junto a los campos, conservar los filtros/resultado anterior y deshabilitar/aplazar la carga hasta corregirlos.
- Mostrar los importes de las filas en pesos enteros, sin centavos, mediante formato monetario `es-AR`. Esta regla de presentación de importes reemplaza para esta feature el formato actual de dos decimales; el resto del formato existente de cada fila se conserva.

### 3.3 Semántica de método y subtotal

- **Solo efectivo** filtra por `CashMovement.paidMethod === "Efectivo"`, exactamente como ahora.
- **Todos los medios de pago** no aplica predicado por `paidMethod`; incluye valores nulos/vacíos y movimientos de todos los medios/tipos actualmente persistidos.
- Los importes mostrados de cada fila y el subtotal filtrado se expresan en pesos enteros, sin centavos. Redondear cada importe de movimiento al peso más cercano, con los empates alejándose de cero: redondear la magnitud y restaurar el signo original (por ejemplo, `12,5` → `13` y `-12,5` → `-13`). No convertir retiros/devoluciones negativos a positivos; si el redondeo de una magnitud menor que medio peso da cero, mostrar `$ 0`.
- El subtotal es la suma algebraica de los importes de movimiento ya redondeados individualmente para todas las filas que satisfacen el mismo predicado de negocio, rango y método que el historial:
  - ingresos/ventas positivos aumentan la suma;
  - retiros y devoluciones/refunds negativos la reducen;
  - no convertir valores negativos a positivos ni sumar valor absoluto.
- El subtotal debe equivaler exactamente a la suma de los importes enteros mostrados en las filas. No redondear por separado la suma de los valores originales, porque eso podría hacer que el total visible no coincida con las filas. La suma de importes enteros debe evitar pérdida de precisión.
- Para cero coincidencias, mostrar la lista vacía y subtotal `$ 0`; nunca ocultar el cero como si fuera ausencia de filtro.

## 4. Diseño de datos y API recomendado

### 4.1 Acción server-side

Agregar una lectura específica, por ejemplo `getFilteredMovements(input)`, en `src/actions/movements.ts`; no reutilizar `getBusinessBalanceAction`, que representa otro dato. Contrato orientativo:

```typescript
interface MovementFilters {
  fromDate?: string; // YYYY-MM-DD
  toDate?: string;   // YYYY-MM-DD
  paymentMethod: "CASH" | "ALL";
}

interface FilteredMovementsResult {
  success: true;
  movements: Movement[];
  total: number;
}
```

La forma final debe seguir el patrón de resultados/error tipados vigente. Validar estrictamente fechas y discriminador antes de construir Prisma `where`. La zona horaria debe obtenerse de `Business` en servidor a partir de la sesión; no aceptar `businessId`, zona horaria ni límites de instante confiables desde el cliente.

Cada llamada a Server Action es una frontera pública: volver a autenticar con `auth()` y exigir `session.user.businessId`. Una sesión ausente/sin negocio no devuelve datos. Todas las consultas aplican `businessId = session.user.businessId` además de los filtros validados.

La consulta Prisma aplica en servidor:

```text
where = {
  businessId: session.user.businessId,
  date: límites opcionales calculados en zona de negocio,
  paidMethod: "Efectivo" solo cuando paymentMethod = "CASH"
}
```

Consultar únicamente los campos usados por la tabla y subtotal (`id`, `total`, `seller`, `paidMethod`, `date`) y ordenar por `date desc`, `id desc`. Dado que se conserva el historial completo sin paginación, calcular el subtotal a partir de **ese mismo conjunto completo de filas** evita que la suma y filas provengan de consultas/snapshots distintos. No ejecutar un `aggregate` con filtros distintos ni derivar la suma de órdenes o vouchers.

Conservar el comportamiento de la lectura preexistente para cualquier consumidor legado; si la implementación cambia su contrato, verificar callers y añadir una lectura nueva en vez de cambiar silenciosamente un contrato compartido.

### 4.2 Componente cliente y actualizaciones

`CashRegister` seguirá siendo el límite cliente para inputs, estado interactivo, tabla y Pusher. Mantener solo los filtros/estado visual en cliente; las fechas, método, filas y subtotal autorizados se calculan/filtran en servidor. Pasar únicamente valores serializables entre Server y Client Components.

En cada cambio válido solicitar la acción con el estado completo actual de filtros. Descartar respuestas antiguas si el usuario cambió filtros mientras una solicitud estaba pendiente; no permitir que una respuesta de consulta anterior sobrescriba la nueva. Deshabilitar o bloquear solicitudes duplicadas equivalentes.

Al recibir `new-movement` por Pusher, refrescar/reconsultar la combinación de filtros activa en vez de anteponer el movimiento sin validarlo. Así la lista y subtotal se mantienen coherentes incluso para fecha/método excluidos. Asegurar que el listener no se duplique al cambiar filtros; la suscripción sigue acotada al `businessId` de la sesión.

`TotalPanel` permanece con su balance de caja actual y su fuente/refresh existentes. El nuevo subtotal de historial no altera ni reemplaza ese balance.

## 5. Estados de UI, accesibilidad y errores

- **Carga inicial/cambio de filtro:** mostrar indicador o skeleton asociado a la lista/subtotal; anunciar el estado con `aria-live="polite"` o semántica equivalente. No presentar un estado vacío transitorio durante la carga.
- **Sin resultados:** mensaje vacío claro que indique que no hay movimientos para los filtros seleccionados, junto al total `$ 0`.
- **Error de lectura:** conservar los datos previamente cargados y mostrar un mensaje visible con acción de reintento. No transformar fallo de red/DB en lista vacía ni total cero. No exponer SQL, stack traces ni datos del servidor.
- **Validación:** labels visibles y asociados (`htmlFor`/`id`) para Desde/Hasta; el selector debe exponer su nombre y estado seleccionado a tecnologías asistivas (radio group nativo o `role="radiogroup"` con opciones `role="radio"`/`aria-checked`). El foco visible y teclado deben funcionar.
- Para no duplicar anuncios, actualizar lista/subtotal como una unidad lógica al resolver una respuesta válida.

## 6. Límites, seguridad y compatibilidad

- El filtro y total se obtienen exclusivamente de `CashMovement`; `PaymentVoucher`/`PaymentVoucherAttempt` no se consultan ni cuentan.
- No confiar en el `businessId` que se utiliza para la suscripción del cliente como autorización de lectura: la acción deriva el negocio de la sesión en el servidor.
- El filtro aplica por `CashMovement.date`, no `Order.date`, fecha de creación del voucher ni fecha de intentos.
- Las entradas sin `paidMethod` aparecen solo en **Todos los medios de pago**.
- No cambiar la semántica de retiros/devoluciones, el balance actual ni acciones de crear movimiento.
- Mantener llamada/fallback compatible del historial actual si hubiera otros consumidores; `getMovements` tiene al menos el caller `CashRegister` en el checkout analizado.
- No cambiar `src/app/(protected)/searchBill/page.tsx` (ni sus imports/props indirectamente) para construir esta feature.
- No añadir índice o migración sin evidencia. Si las métricas de producción justifican optimización, proponerla separadamente.

## 7. Archivos previstos

| Archivo | Cambio recomendado |
|---|---|
| `src/components/CashRegister.tsx` | Controles, solicitud de filtros, subtotal, estados accesibles y refresco coherente con Pusher. |
| `src/actions/movements.ts` | Nueva acción de lectura filtrada validada y acotada al negocio de sesión; compatibilidad del lector existente. |
| `src/app/(protected)/cashRegister/page.tsx` | Mantener sin cambio funcional, salvo necesidad estricta de pasar props serializables; preferir cero cambios. |
| `src/app/(protected)/searchBill/page.tsx` | **No modificar.** |
| `prisma/schema.prisma` | Sin cambios previstos. |

No implementar código ni pruebas durante la fase de especificación.

## 8. Criterios de aceptación medibles

- **AC1 — Regresión por defecto:** al abrir Caja sin modificar filtros, ambos campos de fecha están vacíos, `Solo efectivo` está seleccionado y las filas coinciden con el conjunto previo de efectivo para el negocio, ordenado por fecha descendente.
- **AC2 — Fechas inclusivas:** con fixtures en el inicio, mitad y último instante de los días elegidos, se incluyen todas las horas de `Desde` y `Hasta` en zona del negocio, pero no el instante del inicio del día posterior a `Hasta` ni el anterior al día de `Desde`.
- **AC3 — Límites parciales y vacíos:** `Desde` solo, `Hasta` solo y ambos vacíos producen exactamente los límites esperados; fecha inválida o `Desde > Hasta` muestra validación sin solicitar un rango incompleto.
- **AC4 — Zona horaria:** un timestamp cercano a medianoche se incluye/excluye según fecha de calendario en la zona `Business.timezone`, no según UTC ni zona del navegador. La zona fallback se usa si el valor guardado falta/es inválido.
- **AC5 — Método:** `CASH` solo devuelve movimientos cuyo `paidMethod` sea exactamente `Efectivo`; `ALL` devuelve todos los valores, incluyendo `null`/vacío.
- **AC6 — Importes enteros, firma y consistencia:** en un dataset con ingresos/ventas positivos, un retiro negativo, una devolución negativa y valores con fracción de peso, cada fila y el subtotal se muestran en pesos enteros sin centavos. Cada fila redondea al peso más cercano con empates alejándose de cero (magnitud redondeada y signo restaurado); los negativos siguen restando y ningún movimiento se convierte a valor absoluto. El subtotal es exactamente la suma de los importes enteros visibles en las filas, incluyendo casos en que redondear las filas individualmente difiera de redondear el total original.
- **AC7 — Mismo predicado:** para cada combinación probada de fechas/método, el conjunto completo de filas y subtotal usan un único criterio de negocio/rango/método; el subtotal no se calcula solo sobre una página ni sobre `Order.total`.
- **AC8 — Aislamiento de negocio:** una sesión sin `businessId` obtiene error/no datos; el negocio de la consulta es siempre el de sesión aunque el payload incluya un negocio ajeno o altere parámetros.
- **AC9 — Actualización concurrente:** una respuesta lenta de filtros anteriores no reemplaza filas o subtotal de los filtros más recientes; solicitudes equivalentes simultáneas no producen resultados duplicados.
- **AC10 — Pusher:** al registrar un movimiento, lista y subtotal activos se actualizan con una reconsulta, sin incluir movimientos fuera del rango/método y sin crear suscripciones duplicadas.
- **AC11 — Errores y vacío:** cero resultados presenta mensaje vacío y `$ 0`; un error del servidor/red presenta estado de error y reintento, conservando datos existentes si los hay.
- **AC12 — Balance actual:** `TotalPanel` conserva su valor, etiqueta y fuente; modificar fechas/método afecta únicamente historial y subtotal filtrado.
- **AC13 — Accesibilidad:** los dos inputs tienen label asociado y navegación por teclado; las opciones de método exponen selección accesible; carga/error/validación tienen anuncio o asociación accesible verificable.
- **AC14 — Páginas intactas:** no se modifica `src/app/(protected)/searchBill/page.tsx` y sus pruebas/comportamiento existente permanece sin regresión.
- **AC15 — Alcance de fuente de datos:** consultas/total no leen órdenes, devoluciones separadas ni vouchers/attempts y no se agrega esquema/dependencia sin aprobación separada.
- **AC16 — Calidad:** durante implementación, lint, build y pruebas existentes/nuevas relevantes pasan.

## 9. Secuencia de implementación sugerida

1. Añadir y probar validación de fechas, zona horaria y construcción del `where` Prisma con la sesión como autoridad.
2. Implementar lectura tipada que devuelva la colección completa filtrada más su suma firmada, con errores distinguibles de resultado vacío.
3. Agregar el estado de filtros/total a `CashRegister`, iniciar con filtros vacíos y solo efectivo, y proteger contra respuestas obsoletas.
4. Reconciliar Pusher mediante reconsulta con el filtro activo.
5. Verificar límites de calendario, signos y redondeo de fracciones de peso en pruebas, junto con lectores/usuarios del balance actual.
6. Confirmar que `searchBill/page.tsx` está intacto y ejecutar lint/build.

## 10. Dependencias y decisiones arquitectónicas

- No hay dependencia nueva ni migración Prisma requerida.
- Se mantiene la separación App Router: interacción en Client Component; lectura autenticada, validación, zona horaria, filtrado y subtotal en Server Action.
- La fuente de verdad de tiempo calendario es la zona horaria configurada del negocio. Se conserva el formato actual de las filas excepto por sus importes, que esta feature presenta redondeados a pesos enteros sin centavos junto con el subtotal.
- No se introduce paginación: el subtotal corresponde a todas las filas filtradas actualmente mostradas. Si se pagina el historial en una iniciativa futura, deberá calcularse el subtotal antes/de forma independiente de la página y mostrar explícitamente que es global a todos los resultados filtrados.
