# SPEC: Página de clientes por negocio

## 1. Alcance y objetivo

**Rama objetivo:** `feat/client-page`  
**Ruta protegida propuesta:** `/clients` (archivo `src/app/(protected)/clients/page.tsx`).

La aplicación debe ofrecer una página para que un usuario autenticado consulte y
administre los clientes de su negocio. La página debe listar, crear, editar y
eliminar clientes sin permitir que el usuario elija o suplante otro
`businessId`. Esta especificación es el entregable del Architect; no incluye
implementación fuera de este archivo.

## 2. Hallazgos del código existente

- `prisma/schema.prisma` ya contiene `Client` con `id`, `name`, `address`,
  `cellPhone`, `cuit`, `ivaCondition`, `email`, `balance`, `date`,
  `last_update` y `businessId`, además de la relación `orders`.
- `src/actions/clients.ts` contiene `createClient`, `getClients` y
  `updateClientBalance`. `createClient` toma el negocio de la sesión, pero no
  valida con Zod; `getClients` no autentica ni filtra por negocio; y
  `updateClientBalance` no verifica ni sesión ni pertenencia al negocio.
- `src/app/api/clients/route.ts` tiene un `GET` autenticado que filtra por
  `session.user.businessId` y es consumido por
  `ClientSelectionModal.tsx`. Este contrato existente debe seguir funcionando.
- `ClientSelectionModal.tsx` crea clientes y necesita conservar su flujo; la
  página no debe romper el alta desde facturación.
- `RootMenu.tsx` es el menú principal y actualmente no tiene entrada de
  clientes. Las páginas del grupo `(protected)` realizan la comprobación de
  sesión/negocio en cada página o acción; no hay `layout.tsx` protegido que
  pueda considerarse suficiente por sí solo.
- El modelo no define `onDelete` para `Client -> Order`. Borrar un cliente con
  órdenes relacionadas puede violar la FK; además, borrar histórico de ventas
  no es deseable.

## 3. Requisitos funcionales

### RF-01 — Acceso y listado

1. `/clients` debe requerir sesión válida y `session.user.businessId` no vacío.
   Un usuario no autenticado debe ser redirigido al flujo de login existente o
   rechazado con el patrón de páginas protegidas del repositorio.
2. El servidor debe obtener el `businessId` exclusivamente de la sesión. No se
   debe aceptar un `businessId` del formulario, query string o payload como
   fuente de autorización.
3. El listado debe consultar `Client` con
   `where: { businessId: session.user.businessId }`, ordenar por nombre
   ascendente y devolver sólo los campos necesarios para la UI. Debe incluir
   `email`, `cuit`, `ivaCondition`, `address`, `cellPhone`, `balance`, `date` y
   `last_update` además de `id` y `name`.
4. Un negocio sin clientes debe mostrar un estado vacío accionable (por
   ejemplo, “Crear cliente”), no un error ni una tabla rota.

### RF-02 — Alta

1. La página debe permitir crear un cliente con `name` obligatorio y los
   restantes campos opcionales: `address`, `cellPhone`, `cuit`,
   `ivaCondition` y `email`.
2. El alta debe guardar siempre el `businessId` de la sesión y establecer
   `balance` en `0`; el formulario no debe editar el saldo durante el alta.
3. Tras éxito, la lista debe reflejar el cliente sin recarga completa o, como
   mínimo, mediante revalidación/refetch verificable, y mostrar confirmación al
   usuario. Los errores deben mostrarse sin perder los datos ingresados.

### RF-03 — Edición

1. Cada fila debe ofrecer editar y abrir un formulario prellenado con los
   campos editables del cliente.
2. La edición debe aceptar el `id` sólo como identificador del registro y
   autorizar con una consulta que combine `id` y `businessId` (o una
   comprobación equivalente dentro de una transacción).
3. La edición no debe aceptar ni modificar `businessId`, `balance`, `date` ni
   las órdenes. `last_update` debe actualizarse al guardar.
4. Tras éxito, la fila debe mostrar los valores nuevos y comunicar el éxito.

### RF-04 — Eliminación segura

1. Cada fila debe ofrecer eliminar con confirmación explícita, indicando el
   nombre del cliente.
2. La acción debe autorizar por `(id, businessId)` y nunca borrar registros de
   otro negocio aunque se manipule el `id`.
3. Si el cliente tiene órdenes relacionadas, la operación debe rechazarse con
   un resultado controlado (HTTP/resultado equivalente a conflicto) y mensaje
   claro: no se deben borrar órdenes ni saldos históricos. No se requiere
   cambio de esquema en esta feature.
4. Si no tiene órdenes, se debe eliminar y actualizar la lista. Un `id`
   inexistente o ya eliminado debe producir un error controlado, no un 500 no
   manejado.

### RF-05 — Búsqueda y UX

1. La página debe permitir filtrar localmente por nombre y, si se muestran,
   teléfono, email o CUIT; la búsqueda no debe consultar datos de otro negocio.
2. Deben existir estados de carga, vacío, error, guardado y eliminación; los
   controles deben deshabilitarse mientras una mutación está en curso.
3. La tabla/lista debe ser usable en móvil, tener etiquetas accesibles,
   botones distinguibles y confirmación antes de eliminar.
4. La entrada “Clientes” debe agregarse a `RootMenu.tsx` con una ruta absoluta
   `/clients` y un icono coherente (por ejemplo `Users`). No debe aparecer como
   enlace a un `businessId` o slug controlado por el cliente.

### RF-06 — Compatibilidad

1. Se debe conservar el `GET /api/clients` para `ClientSelectionModal` y su
   respuesta `{ clients: [...] }`, manteniendo el filtro por negocio y
   autenticación actuales.
2. Se puede reutilizar/refactorizar la lógica de lectura, pero ningún cambio
   debe hacer que el modal reciba clientes de todos los negocios.
3. `createClient` debe conservar su forma de resultado compatible con el modal
   (`{ success, client }` o `{ error }`), aunque internamente use un esquema y
   un resultado tipado.
4. `updateClientBalance` debe quedar protegido por autenticación y aislamiento
   de negocio como parte de esta feature, aunque la página no exponga un
   editor de saldo.

## 4. Contratos e interfaces propuestas

Los nombres son orientativos; deben seguir las convenciones actuales y evitar
duplicar tipos Prisma en componentes cliente.

```ts
interface ClientFormInput {
  name: string;
  address?: string;
  cellPhone?: string;
  cuit?: string;
  ivaCondition?: string;
  email?: string;
}

interface UpdateClientInput extends ClientFormInput {
  id: string;
}

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

interface ClientActionResult<T = undefined> {
  success: boolean;
  data?: T;
  client?: ClientListItem;
  error?: string;
  code?: "UNAUTHORIZED" | "FORBIDDEN" | "VALIDATION" | "NOT_FOUND" | "CONFLICT" | "DATABASE";
}
```

Acciones de servidor recomendadas en `src/actions/clients.ts`:

- `getClients(): Promise<ClientActionResult<ClientListItem[]>>`
- `createClient(input: unknown): Promise<ClientActionResult<ClientListItem>>`
- `updateClient(input: unknown): Promise<ClientActionResult<ClientListItem>>`
- `deleteClient(input: unknown): Promise<ClientActionResult>`
- `updateClientBalance(...)` protegido y compatible con consumidores existentes.

Todas las acciones son endpoints públicos de facto: deben autenticar,
validar y autorizar dentro de la acción, no sólo en la página.

## 5. Validaciones

Crear un esquema Zod específico (en `src/schemas/index.ts` o un módulo
co-localizado siguiendo el patrón existente):

- `name`: `trim()`, obligatorio, longitud mínima 1 y máxima razonable (100).
- `address`: opcional, `trim()`, máximo 200.
- `cellPhone`: opcional, `trim()`, máximo 50.
- `cuit`: opcional, `trim()`, máximo 20; aceptar el formato que ya utiliza el
  modal, sin convertirlo a número ni perder guiones.
- `ivaCondition`: opcional, sólo valores soportados por la UI actual
  (`Consumidor Final`, `Responsable Inscripto`, `Monotributista`, `Exento`), o
  una constante compartida si el repositorio ya la normaliza.
- `email`: opcional, `trim().toLowerCase()` y email válido.
- `id`: obligatorio y no vacío para editar/eliminar.
- Rechazar campos desconocidos en payloads de mutación o ignorarlos de forma
  explícita; nunca mapear `businessId`, `balance`, `orders` o fechas recibidas
  desde el cliente.

Los errores de validación deben devolver mensajes accionables en español y no
exponer detalles SQL, stack traces ni datos de otras filas.

## 6. Seguridad y aislamiento

1. La sesión debe leerse con `auth()` desde `@/auth`; ausencia de sesión o de
   `businessId` devuelve `UNAUTHORIZED` y no ejecuta una consulta de datos.
2. Para leer, actualizar, borrar y cambiar saldo, toda consulta debe incluir el
   `businessId` de sesión. No basta con buscar por `id` y comprobar después.
3. `businessId` no debe enviarse desde la página como dato confiable. Si se
   conserva el parámetro por compatibilidad en otra acción, se debe ignorar o
   comparar estrictamente contra la sesión.
4. El `GET /api/clients` debe mantener status `401` para no autenticados y
   consultar sólo el negocio autenticado.
5. El control de rol ADMIN no es necesario para el CRUD solicitado: cualquier
   usuario autenticado perteneciente al negocio puede operar clientes, salvo
   que una política existente de autorización indique lo contrario. SUPER_ADMIN
   no debe poder seleccionar arbitrariamente otro negocio a través de esta
   ruta; su negocio de sesión sigue siendo la frontera.
6. No registrar emails, CUIT, teléfonos completos ni payloads sensibles en
   logs de error; no introducir secretos.
7. Si se agrega `hasClientLedger` como feature gate, debe reutilizarse
   `requireFeature("hasClientLedger")` en la acción/página de forma consistente
   con `orders.ts` y `unpaid-orders.ts`; no se debe inventar una segunda política.
   La implementación debe decidirlo antes de codificar y documentar el
   comportamiento de negocio sin convertirlo en bypass de seguridad.

## 7. Archivos recomendados

### Crear

- `src/app/(protected)/clients/page.tsx`: Server Component, autentica,
  obtiene la lista y renderiza la página.
- `src/components/clients/ClientsPageClient.tsx` (o equivalente): Client
  Component sólo para estado, búsqueda, formularios y confirmaciones.
- `src/components/clients/ClientForm.tsx`: formulario compartido alta/edición
  con React Hook Form + Zod, si el patrón del repositorio lo permite.
- `src/components/clients/ClientsTable.tsx`: presentación responsiva y
  acciones accesibles, si se separa la UI.

### Modificar

- `src/actions/clients.ts`: validación, listado aislado, update/delete y
  protección de `updateClientBalance`.
- `src/app/api/clients/route.ts`: conservar/ajustar el contrato GET y sus
  tipos; no aceptar filtros de negocio sin autorización.
- `src/components/ui/RootMenu.tsx`: agregar tarjeta/enlace “Clientes”.
- `src/schemas/index.ts` o nuevo esquema de clientes: validación única
  reutilizable por acciones y formularios.

### No modificar salvo necesidad demostrada

- `prisma/schema.prisma`: el modelo actual alcanza el CRUD. No agregar
  cascadas de borrado que puedan borrar órdenes históricas.
- `src/components/ledger/ClientSelectionModal.tsx`: sólo adaptar tipos o
  refresco si fuera imprescindible para compatibilidad.

## 8. Estrategia de datos y caché

- Usar `db` singleton de `@/lib/db` y `select` explícito.
- Para update/delete, realizar la comprobación de pertenencia y mutación de
  forma atómica o usar una condición compuesta. Para delete, contar/buscar
  órdenes del mismo cliente antes de borrar dentro de una transacción si hay
  riesgo de carrera.
- Mantener `revalidateTag(CACHE_TAGS.CLIENTS, "max")` una sola vez por
  mutación, y/o `revalidatePath("/clients")` según el patrón adoptado. El tag
  no debe utilizarse para mezclar negocios: cualquier caché debe tener una
  clave/consulta que respete la sesión y el aislamiento.
- La página debe ser dinámica respecto de la sesión; no hacer cache público
  de la lista autenticada.

## 9. Criterios de aceptación medibles

- **CA-01 (G1):** existe `ai/features/client-page/SPEC.md` y contiene requisitos,
  criterios medibles, interfaces, validaciones, seguridad, archivos y pruebas.
- **CA-02:** una sesión sin `businessId` no obtiene clientes y recibe
  redirección o resultado `UNAUTHORIZED`; una sesión válida ve sólo clientes
  cuyo `businessId` coincide exactamente con el de la sesión.
- **CA-03:** dos negocios con al menos un cliente cada uno nunca muestran,
  actualizan ni eliminan el cliente del otro en pruebas de lectura y mutación,
  incluso enviando el `id` ajeno.
- **CA-04:** `/clients` renderiza nombre, teléfono, dirección, CUIT, condición
  IVA, email y saldo para los registros disponibles; lista vacía muestra CTA de
  alta.
- **CA-05:** alta válida crea exactamente un registro con `businessId` de la
  sesión y `balance = 0`; nombre vacío, email inválido y strings que exceden
  límites no escriben en DB y muestran error de validación.
- **CA-06:** edición válida actualiza sólo campos editables del cliente propio,
  modifica `last_update` y conserva `businessId`, `balance`, `date` y órdenes.
- **CA-07:** editar/eliminar con `id` inexistente o ajeno devuelve `NOT_FOUND` o
  `FORBIDDEN` controlado y no modifica ningún registro.
- **CA-08:** eliminar un cliente sin órdenes, tras confirmación, elimina una
  sola fila y refresca la lista; cancelar la confirmación no llama la acción.
- **CA-09:** eliminar un cliente con una o más órdenes no elimina nada,
  mantiene la fila y muestra el mensaje de conflicto definido.
- **CA-10:** `updateClientBalance` rechaza usuario no autenticado y `clientId`
  de otro negocio; una actualización autorizada sólo cambia el saldo del
  cliente propio.
- **CA-11:** `GET /api/clients` devuelve `401` sin sesión, `{ clients: [] }`
  para negocio sin clientes y nunca devuelve registros de otro negocio.
- **CA-12:** el modal existente conserva alta y selección de clientes después
  de los cambios; sus pruebas actuales pasan.
- **CA-13:** el menú principal muestra “Clientes” y navegar desde él llega a
  `/clients` sin incluir un `businessId` controlado por el navegador.
- **CA-14:** la UI presenta carga, error, estado vacío, éxito, confirmación de
  borrado y controles accesibles en viewport móvil y escritorio; no hay
  desbordamiento horizontal en la tabla/lista.
- **CA-15:** `npm run lint`, `npx tsc --noEmit` y la suite de pruebas existente y
  nueva pasan sin secretos ni errores de compilación.

## 10. Estrategia de pruebas

### Unitarias

- Probar el esquema con campos válidos, nombre vacío, límites, email inválido,
  condición IVA no permitida y campos administrativos rechazados.
- Probar el mapeo de `Client` a `ClientListItem`, incluyendo valores `null` y
  fechas/saldo.

### Integración de acciones/API

- Mockear `auth` y `db` para sesiones ausentes, negocio A/B, payloads válidos e
  inválidos.
- Verificar que cada `findMany`, `findUnique`, `update`, `delete` y saldo
  contiene el filtro `businessId` de la sesión.
- Verificar alta, edición, eliminación sin órdenes, conflicto con órdenes,
  `P2025`/registro inexistente y errores de base de datos sin filtrar detalles.
- Verificar status y shape de `GET /api/clients`, incluyendo la compatibilidad
  `{ clients }` requerida por el modal.

### Componentes

- Renderizar lista con clientes, estado vacío y error.
- Probar filtrado por nombre y campos visibles.
- Probar abrir alta/edición, prellenado, validación, estados disabled, éxito y
  cancelación de confirmación.
- Probar que el click de eliminar confirma antes de llamar a la acción y que
  el resultado de conflicto conserva la fila.
- Probar que `RootMenu` incluye la tarjeta `/clients` para una sesión válida.
- Ejecutar regresión de `src/__tests__/components/ClientSelectionModal.test.tsx`.

### Verificación manual

- Navegar sin sesión, con sesión válida y con dos negocios aislados.
- Probar viewport móvil, teclado/foco, lectores de etiquetas y confirmación de
  borrado.
- Ejecutar `npm run lint`, `npx tsc --noEmit` y `npm run build` antes de cerrar
  la rama.

## 11. Riesgos y decisiones pendientes para Developer

1. Confirmar si la página está condicionada por `hasClientLedger`; si sí, usar
   el helper existente y definir el estado cuando la feature está desactivada.
2. Confirmar si el producto prefiere impedir borrado con órdenes (decisión
   propuesta aquí) o implementar soft delete/cambio de FK en una feature
   separada. No resolverlo con cascada silenciosa.
3. Evitar reutilizar `ClientSchema` actual sin adaptarlo: exige `id`, `orders` y
   `cellPhone` numérico, lo que no coincide con el modelo Prisma ni con el
   formulario actual. Crear un esquema de formulario/CRUD específico reduce
   riesgo de romper facturación.

## 12. Verificación de Gate G1

- [x] `ai/features/client-page/SPEC.md` está definido en la carpeta de la
  feature solicitada.
- [x] Incluye criterios de aceptación medibles (`CA-01` a `CA-15`).
- [x] Define interfaces, validaciones, seguridad, archivos recomendados y
  estrategia de pruebas.
- [x] El análisis referencia el modelo Prisma `Client`, acciones/API actuales,
  modal existente, autenticación por `businessId` y menú principal.
- [x] No se implementó código de producto fuera de este SPEC.

**Resultado G1:** cumplido; el entregable está listo para el paso de QA del
workflow TDD.
