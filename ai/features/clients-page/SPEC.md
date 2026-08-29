# Especificación: terminar la página de clientes

## 1. Objetivo y alcance

Completar `/clients` para que permita consultar, buscar, crear, editar y eliminar
clientes del negocio autenticado, con una interfaz responsive y carga escalable.
La implementación no debe cambiar el modelo de órdenes históricas ni romper el
selector de clientes usado por facturación.

**Fuera de alcance:** edición de saldo desde esta página, exportación, soft delete,
filtros avanzados, cambios de esquema para desacoplar `Client` de `Order` y
reemplazo del contrato legado de `GET /api/clients`.

## 2. Inspección y hallazgos concretos

### Código actual

- `src/app/(protected)/clients/page.tsx` obtiene toda la colección antes de
  renderizar `ClientsPageClient`; no hay loading boundary ni paginación.
- `src/actions/clients.ts` lista todos los clientes con `findMany`, aunque ya
  selecciona los campos correctos y filtra por `businessId`.
- `src/app/api/clients/route.ts` también devuelve todos los clientes. El contrato
  `{ clients: [...] }` es consumido por `ClientSelectionModal` y debe mantenerse.
- `ClientsPageClient` filtra exclusivamente en memoria. Con una colección grande,
  el navegador recibe datos innecesarios y la búsqueda sólo opera sobre el lote
  inicial completo.
- La UI actual es funcional pero densa: la tabla tiene ocho columnas, la tarjeta
  móvil repite mucha información, el botón de alta sólo muestra el icono en
  pantallas pequeñas y no hay resumen, skeleton ni paginación.

### Bugs que deben corregirse

1. **`Client.update` con filtro no único:** `updateClient` usa
   `where: { id, businessId }`. En Prisma `update.where` sólo acepta una clave
   única válida; `id + businessId` no es una clave compuesta del esquema actual.
   Debe autorizar con `findFirst({ where: { id, businessId } })` y actualizar por
   `id`, o usar una operación equivalente segura y tipada.
2. **`updateClientBalance` tiene el mismo problema potencial** al usar
   `findUnique({ where: { id, businessId } })` y luego `update` con ese filtro.
   Debe conservar el aislamiento y usar filtros Prisma válidos.
3. **Carga sin límite:** `getClients` y `GET /api/clients` pueden traer una
   cantidad ilimitada de filas, con coste creciente de DB, serialización y
   memoria del cliente.
4. **Confusión entre “sin resultados” y error/búsqueda:** `ClientsPageClient`
   muestra `initialError` dentro del estado vacío incluso cuando el usuario sólo
   está buscando y no hay coincidencias. Deben existir estados separados para
   error de carga, colección vacía y búsqueda sin coincidencias.
5. **Errores posteriores a mutaciones no sincronizan necesariamente el lote:**
   la lista se actualiza de forma optimista/local, pero una creación o edición
   puede pertenecer a otro cursor/lote o quedar fuera del filtro actual. Después
   de una mutación exitosa se debe reconciliar el primer lote o invalidar/refrescar
   el dataset de forma controlada.
6. **Formulario potencialmente obsoleto:** `ClientForm` inicializa su estado sólo
   al montar. Si recibe otro cliente sin desmontarse, puede mostrar los datos del
   cliente anterior. Debe resetearse al cambiar el cliente o usar un formulario
   controlado con valores derivados.
7. **Confirmación no consistente con UI accesible:** `window.confirm` no permite
   una presentación consistente ni un mensaje de conflicto rico. Debe usarse el
   `AlertDialog` existente, con foco, cancelación y nombre del cliente.
8. **Accesibilidad y responsive incompletos:** la tabla no declara `scope` en
   encabezados y su wrapper permite overflow horizontal; las acciones y estados
   deben tener nombres, foco visible y alternativa de tarjeta compacta móvil.

Los hallazgos de seguridad ya parcialmente corregidos (sesión, validación,
filtro por negocio, protección de borrado con órdenes) deben conservarse y
verificarse, no relajarse.

## 3. Decisión de carga

Implementar **paginación por cursor con carga incremental explícita (“Cargar
más”)**, con lotes de 25 clientes y máximo configurable de 50.

- El orden estable será `name ASC, id ASC`; `id` rompe empates de nombres.
- El servidor recibirá `search` y `cursor`; el filtro se aplicará en DB sobre
  `name`, `cellPhone`, `email` y `cuit` (case-insensitive según capacidades de
  PostgreSQL/Prisma).
- La primera renderización obtiene sólo el primer lote. El cliente conserva los
  lotes ya cargados y solicita el siguiente con el cursor opaco.
- “Cargar más” es preferible a scroll automático: evita disparos accidentales,
  es usable con teclado/lectores de pantalla y no complica el formulario o las
  acciones de filas. No usar `skip` ni cargar toda la tabla.
- Cambiar la búsqueda cancela/ignora respuestas obsoletas, limpia los lotes,
  restablece el cursor y solicita desde el inicio. Debe aplicarse debounce de
  aproximadamente 250 ms o una acción equivalente que no consulte por cada
  pulsación.
- La paginación de la página `/clients` es independiente del endpoint legado del
  modal. `GET /api/clients` conserva `{ clients: [...] }`; sólo se puede paginar
  ese endpoint en una futura migración coordinada del modal.

## 4. Requisitos funcionales

### RF-01 — Acceso y aislamiento

1. `/clients` exige sesión y `session.user.businessId`; sin negocio redirige al
   patrón existente.
2. Toda acción de servidor y el nuevo loader autenticado obtienen el negocio de
   `auth()`, nunca de un parámetro confiable del navegador.
3. Lectura, modificación, borrado y saldo sólo operan sobre el `businessId` de la
   sesión. Un `id` de otro negocio produce `NOT_FOUND` o `FORBIDDEN` controlado.
4. No se registran payloads, CUIT, teléfono, email ni detalles SQL.

### RF-02 — Listado, búsqueda y carga

1. Mostrar nombre, teléfono, dirección, CUIT, condición IVA, email, saldo y
   acciones; en móvil priorizar nombre, contacto, saldo y menú de acciones, con
   detalles secundarios accesibles.
2. Mostrar contador del total filtrado cuando esté disponible, o al menos el
   número actualmente cargado y si hay más resultados.
3. La búsqueda cubre nombre, teléfono, email y CUIT, ignora espacios iniciales y
   no distingue mayúsculas/minúsculas.
4. El botón “Cargar más” muestra spinner, se deshabilita durante la petición y
   desaparece cuando `hasMore` es falso. No debe duplicar clientes aunque se pulse
   varias veces.
5. Estados requeridos: skeleton inicial, error con “Reintentar”, colección vacía
   con CTA, búsqueda sin coincidencias con “Limpiar búsqueda”, carga incremental
   y error de carga incremental con reintento.

### RF-03 — Alta y edición

1. `name` es obligatorio; `address`, `cellPhone`, `cuit`, `ivaCondition` y
   `email` son opcionales.
2. Alta fija `businessId` desde sesión y `balance = 0`; nunca acepta saldo,
   órdenes, fechas ni campos administrativos del navegador.
3. Edición prellena el formulario, sólo cambia campos editables y actualiza
   `last_update`; conserva `businessId`, `balance`, `date` y órdenes.
4. Errores conservan los valores ingresados y se anuncian con `role="alert"`.
5. Éxito muestra toast/status en español y reconcilia la lista: refrescar el
   primer lote para altas/ediciones que puedan cambiar orden o filtro, o actualizar
   localmente sólo cuando la pertenencia al resultado actual sea demostrable.

### RF-04 — Eliminación

1. Eliminar abre `AlertDialog` con el nombre completo, acciones Cancelar/Eliminar
   y foco inicial seguro. Cancelar no llama al servidor.
2. Borrar valida pertenencia dentro de una transacción. Si hay órdenes, devuelve
   `CONFLICT`, no borra nada y explica que el histórico impide eliminarlo.
3. Cliente inexistente, ajeno o ya eliminado devuelve error controlado. Un borrado
   exitoso quita la fila y actualiza contador/cursor sin dejar duplicados.
4. Los botones de la fila se deshabilitan durante la mutación correspondiente;
   una mutación no debe bloquear innecesariamente el buscador o el resto de la
   navegación.

### RF-05 — Diseño y accesibilidad

1. Encabezado con título, descripción/resumen, CTA primario “Nuevo cliente” y
   búsqueda con label visible o correctamente asociada.
2. Usar `Card`, `Badge`, `AlertDialog`, `Skeleton` y botones UI existentes cuando
   correspondan; mantener tokens de Tailwind y soporte de tema claro/oscuro.
3. Desktop: tabla con encabezados `scope="col"`, filas con hover/foco y columnas
   legibles. Móvil: tarjetas sin overflow horizontal, truncado seguro y acciones
   con `aria-label` descriptivo.
4. Todos los controles son operables por teclado, tienen foco visible, y cambios
   de carga/éxito/error se anuncian mediante `role="status"` o `role="alert"`.
5. Los estados vacíos distinguen: no hay clientes, búsqueda sin coincidencias y
   error de servidor.

## 5. Contratos e interfaces

```ts
interface ClientListItem {
  id: string;
  name: string;
  address: string | null;
  cellPhone: string | null;
  cuit: string | null;
  ivaCondition: string | null;
  email: string | null;
  balance: number;
  date: Date;
  last_update: Date;
}

interface ClientListQuery {
  search?: string;
  cursor?: string;
  limit?: number; // 1..50; servidor aplica 25 por defecto
}

interface ClientListPage {
  clients: ClientListItem[];
  nextCursor: string | null;
  hasMore: boolean;
  total?: number;
}

interface ClientActionResult<T = undefined> {
  success: boolean;
  data?: T;
  client?: ClientListItem;
  error?: string;
  code?: "UNAUTHORIZED" | "FORBIDDEN" | "VALIDATION" | "NOT_FOUND" | "CONFLICT" | "DATABASE";
}
```

El loader paginado puede llamarse `getClientsPage(query)` y debe validar query
con Zod (incluidos cursor opaco y límite). `createClient`, `updateClient`,
`deleteClient` y `updateClientBalance` mantienen sus formas compatibles. La
acción existente `getClients()` podrá conservarse para consumidores internos,
pero la página no debe usarla si obliga a traer la colección completa.

## 6. Validación y persistencia

- Reutilizar/adaptar `clientFormSchema`; no reutilizar `ClientSchema` tal cual,
  porque exige `orders`, `id` y teléfono numérico, incompatibles con el formulario.
- `name`: trim, 1–100 caracteres.
- `address`: trim, máximo 200; `cellPhone`: string trim, máximo 50; `cuit`: string
  trim, máximo 20; email trim/lowercase, máximo 254 y formato válido.
- `ivaCondition`: sólo `Consumidor Final`, `Responsable Inscripto`,
  `Monotributista` o `Exento`.
- Payloads de mutación son `.strict()` y rechazan `businessId`, `balance`,
  `orders`, `date` y `last_update` enviados por el cliente.
- Usar `select` explícito. Para keyset pagination, crear/confirmar índices
  adecuados para `businessId` y orden de nombre/id; si PostgreSQL no puede usar
  el filtro textual con eficiencia, documentar el índice o estrategia de búsqueda
  antes de implementar.
- No agregar cascada `Client -> Order`; el histórico debe permanecer intacto.

## 7. Estructura de archivos recomendada

### Modificar

- `src/app/(protected)/clients/page.tsx`: validar sesión, leer parámetros de
  búsqueda si se decide reflejarlos en URL y cargar el primer lote.
- `src/actions/clients.ts`: loader cursor, validación, autorización Prisma válida,
  corrección de balance, mutaciones y tipos.
- `src/components/clients/ClientsPageClient.tsx`: estado de lotes, búsqueda,
  estados, reconciliación y coordinación de formularios.
- `src/components/clients/ClientForm.tsx`: reset al cambiar cliente y accesibilidad.
- `src/app/api/clients/route.ts`: conservar estrictamente respuesta `{ clients }`
  y aislamiento para `ClientSelectionModal`.

### Crear si mejora la separación

- `src/components/clients/ClientsTable.tsx`: tabla/tarjetas responsivas.
- `src/components/clients/ClientsToolbar.tsx`: búsqueda, contador y CTA.
- `src/components/clients/ClientsLoading.tsx`: skeleton inicial/incremental.
- `src/components/clients/ClientDeleteDialog.tsx`: confirmación accesible.
- `src/models/clients.ts` o `src/types/clients.ts`: interfaces compartidas sin
  importar tipos pesados de Prisma al Client Component.
- `src/app/(protected)/clients/loading.tsx`: fallback de navegación si encaja con
  el layout existente.

### No modificar salvo necesidad demostrada

- `prisma/schema.prisma`: sólo índices documentados y justificados; no cascadas.
- `src/components/ledger/ClientSelectionModal.tsx`: debe seguir funcionando con
  el GET legado y creación de clientes.
- `src/components/ui/RootMenu.tsx`: verificar que `Clientes` continúe apuntando a
  `/clients`, sin businessId/slug del navegador.

## 8. Criterios de aceptación medibles

- **CA-01:** una sesión sin negocio no ejecuta query de clientes; una sesión A no
  recibe, edita, elimina ni modifica saldo de clientes de B, aun enviando IDs de B.
- **CA-02:** la carga inicial ejecuta una consulta limitada a 25 (o el límite
  configurado), nunca `findMany` sin `take`; el primer render no serializa toda
  la colección.
- **CA-03:** con 76 clientes, se cargan 25, luego 25 y luego 26; no aparecen
  duplicados, el orden es estable y “Cargar más” desaparece al terminar.
- **CA-04:** dos búsquedas consecutivas no permiten que una respuesta antigua
  sobrescriba los resultados de la búsqueda más reciente; buscar por cada uno de
  nombre/teléfono/email/CUIT produce sólo coincidencias del negocio actual.
- **CA-05:** se distinguen visual y semánticamente skeleton, error, colección
  vacía, sin coincidencias, carga incremental y reintento.
- **CA-06:** alta válida crea exactamente un cliente propio con saldo cero;
  payload inválido o con campos protegidos no escribe en DB.
- **CA-07:** edición válida actualiza sólo campos editables y `last_update`;
  conserva negocio, saldo, fecha y órdenes.
- **CA-08:** confirmar borrado sin órdenes elimina una fila; cancelar no invoca
  la acción; cliente con órdenes devuelve `CONFLICT` y conserva todo.
- **CA-09:** el formulario restablece valores al cambiar entre dos clientes y
  conserva datos ante error de validación/servidor.
- **CA-10:** desktop tiene tabla con encabezados accesibles y móvil no requiere
  scroll horizontal; todos los botones tienen nombre accesible y foco visible.
- **CA-11:** `GET /api/clients` sigue devolviendo `{ clients: [...] }`, status 401
  sin sesión y sólo datos del negocio autenticado; el modal conserva alta y selección.
- **CA-12:** el menú navega a `/clients` sin incorporar businessId/slug.
- **CA-13:** `npm run lint`, `npx tsc --noEmit`, `npm run build` y la suite
  existente/nueva pasan; no se agregan secretos ni se filtran datos sensibles.

## 9. Plan de pruebas para QA/Developer

1. Unitarias: esquemas, límites, normalización, cursor inválido, orden estable y
   estados de búsqueda.
2. Acciones/DB: auth ausente, aislamiento A/B, paginación, race de cursores,
   P2025, conflicto con órdenes, errores DB y corrección de `updateClientBalance`.
3. Componentes: skeleton, estados vacíos, búsqueda con debounce, carga incremental,
   reintento, alta/edición/reset, AlertDialog y responsive/accessibilidad.
4. Regresión: `clients-api.test.ts`, `clients-actions.test.ts`, tests del schema,
   `ClientSelectionModal` y RootMenu existentes en `ai/features/client-page/`.
5. Manual: teclado, lector de pantalla básico, tema oscuro, 320px de ancho,
   dataset de al menos 1.000 clientes, dos negocios y conexión lenta.

## 10. Supuestos y decisiones pendientes

- Se asume que `/clients` no requiere el feature flag `hasClientLedger`; si el
  producto lo exige, debe usarse el helper de feature existente y definirse el
  estado desactivado antes de implementar.
- Se asume que todos los usuarios autenticados del negocio pueden operar CRUD,
  salvo una política existente que indique lo contrario.
- Se elige “Cargar más” con cursor en lugar de scroll automático por accesibilidad
  y control operativo. El API legado permanece sin paginar para no romper el modal.
- La eliminación de clientes con órdenes se mantiene bloqueada; soft delete es
  una decisión de producto separada.
- El repositorio contiene una especificación previa en
  `ai/features/client-page/`; esta especificación, solicitada en
  `ai/features/clients-page/`, supersede sólo los puntos de listado, bugs y UX,
  y conserva sus requisitos de seguridad/compatibilidad.

## 11. Gate G1

Esta especificación define el alcance, bugs reproducibles por inspección,
estrategia de carga, contratos, archivos, seguridad, UX, pruebas y criterios
medibles. No implementa código ni pruebas.
