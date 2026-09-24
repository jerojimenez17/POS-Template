# SPEC: Saldo de cuenta en Cuenta Corriente y selección de cliente

## 1. Resumen

### Objetivo

Mostrar el saldo actual del cliente en dos lugares ya existentes:

1. Como columna **Saldo de cuenta** inmediatamente a la derecha de **Total** en el listado de `src/app/(protected)/account-ledger/`.
2. Junto a cada cliente disponible en el modal compartido que se abre desde **A cuenta** y **Presupuesto** en `src/components/Billing/BillButtons.tsx`.

### Decisión de producto para “saldo de cuenta”

El dato será el campo persistido `Client.balance`, es decir, el saldo actual del cliente al momento de cargar los datos. No será un saldo histórico calculado a la fecha de cada orden, ni la suma de los totales visibles en el tab actual. El mismo cliente puede aparecer en varias filas del ledger y, en tal caso, se muestra el mismo saldo actual en cada fila.

La decisión coincide con el modelo y operaciones existentes: crear cargos incrementa `Client.balance`, mientras que pagos y cancelaciones lo decrementan. Por ello, un saldo positivo representa deuda del cliente, cero representa cuenta saldada y un saldo negativo representa crédito a favor del cliente. La presentación debe conservar el signo; no convertir saldos negativos a deuda positiva ni ocultarlos.

El modal ya usa `GET /api/clients`, cuya consulta autenticada incluye `balance`. El cambio necesario en ese camino es tipar y presentar el dato; no se requiere un nuevo endpoint ni una nueva consulta de saldo por cliente.

## 2. Hallazgos y flujo actual

### 2.1 Listado de Cuenta Corriente

- `src/app/(protected)/account-ledger/page.tsx` obtiene la página inicial a través de `getUnpaidOrders` y la pasa a `AccountLedgerList`.
- `src/app/(protected)/account-ledger/AccountLedgerList.tsx` presenta las órdenes y en la implementación previa de esta rama ya incluye `Saldo de cuenta` después de `Total`.
- `src/actions/unpaid-orders.ts` define `AccountLedgerOrder` y consulta las órdenes del ledger con una proyección explícita; la implementación previa de esta rama ya incluye `client.balance` junto a `id` y `name`.
- La acción deriva el `businessId` autorizado de la sesión. Esta frontera de autorización debe mantenerse sin cambios.

### 2.2 Selección de cliente en facturación

- Los botones **A cuenta** y **Presupuesto** en `src/components/Billing/BillButtons.tsx` renderizan el mismo `ClientSelectionModal`, diferenciando el modo por la prop `mode="budget"`.
- `src/components/ledger/ClientSelectionModal.tsx` carga clientes mediante `GET /api/clients` al abrirse, los filtra localmente por nombre y muestra cada cliente como una opción de selección. La implementación previa de esta rama ya declara/normaliza `Client.balance` y muestra el saldo en las opciones.
- `src/app/api/clients/route.ts` autentica, limita el resultado al `businessId` de sesión y ya proyecta `balance` junto con los campos existentes. Mantener response shape `{ clients: [...] }` y su aislamiento multi-tenant.
- Para esta ampliación, el dato y la presentación en la lista ya existen en la implementación previa; el cambio nuevo especificado es reutilizar ese dato en el diálogo de orden existente.

### 2.3 Persistencia

- `prisma/schema.prisma` ya tiene `Client.balance Float @default(0)`.
- No se necesita cambio de esquema, migración, campo duplicado ni dependencia nueva.
- No se deben recomputar balances agregando órdenes en el navegador: el campo `Client.balance` es la fuente de verdad existente.

### 2.4 Saldo en el modal de orden existente (seguimiento)

- El flujo no vive en `src/app/(protected)/account-ledger/[id]/`: esa ruta es el detalle de una orden y no contiene el flujo de agregar artículos a una orden existente.
- El modal de selección compartido `src/components/ledger/ClientSelectionModal.tsx` contiene también el diálogo **Existing Order Dialog (R3: Smart Client Selection)**, controlado por `showExistingOrderDialog`. Éste es el modal específico al que se refiere “Agregar a orden existente”.
- `src/components/Billing/BillButtons.tsx` monta este componente para **A cuenta** y para **Presupuesto** (esta última instancia usa `mode="budget"`). El diálogo de orden existente está dentro del componente compartido, no en un segundo componente o ruta.
- El cliente se elige en la lista de ese mismo componente. `fetchClients()` obtiene `/api/clients` al abrir el modal principal y guarda los registros en `clients`; cada registro incluye el balance validado por `normalizeClientsResponse`. `selectedClientId` identifica al cliente elegido y `clients.find(client => client.id === selectedClientId)` permite leer el balance asociado a esa identidad.
- Al elegir un cliente, `checkClientOrders(client.id)` consulta sus órdenes pendientes por `getClientUnpaidOrders` y, como compatibilidad, `GET /api/unpaid-orders?clientId=...`. Esos resultados sólo alimentan `existingOrders` (datos de orden); no son la fuente del balance.
- El balance debe mostrarse en el propio Existing Order Dialog, asociado al cliente seleccionado y separado visualmente del total de cada orden y de **Total a agregar**. Fuente: el snapshot de `Client.balance` ya obtenido de `/api/clients` para la sesión del modal; no hacer una llamada por orden ni recalcularlo con `order.total`.
- La acción `addItemsToOrder` recibe hoy `{ orderId, businessId, items }`. Su transacción obtiene la orden y su `clientId`, y al persistir incrementa el `Client.balance` en el servidor. El balance mostrado es sólo informativo: no se debe incluir balance o clientId adicional en el payload ni confiar en un valor enviado por el browser para persistencia.

## 3. Alcance y no objetivos

### Incluido

- Incluir el balance actual dentro de la proyección de cliente que devuelve el listado del ledger.
- Añadir la columna visible `Saldo de cuenta` inmediatamente después de `Total`.
- Mostrar el balance en cada opción de cliente de `ClientSelectionModal`, tanto en modo `unpaid` (A cuenta) como en modo `budget` (Presupuesto).
- Mostrar el balance del cliente seleccionado en el diálogo para agregar artículos a una orden pendiente existente del mismo `ClientSelectionModal`.
- Mantener formatos monetarios y convenciones de presentación existentes en español de Argentina.
- Mantener intactas las operaciones de cargos, pagos, cancelación, confirmación, presupuestos y la autorización por negocio.

### No incluido

- Cambiar cómo se calcula o persiste el saldo del cliente.
- Mostrar un saldo histórico “luego de esta orden” o un saldo acumulativo por fila.
- Cambiar estados, filtros, paginación, búsqueda, enlaces o acciones del ledger.
- Añadir una llamada por fila, endpoint dedicado, caché nueva, dependencia, migración o ajuste de tipo de base de datos.
- Añadir reglas de bloqueo/advertencia por saldo o modificar el flujo de selección/creación de clientes.
- Añadir una consulta, endpoint o parámetro de mutación específico para llevar el saldo al diálogo o a `addItemsToOrder`.

## 4. Requisitos funcionales y de presentación

### RF-01 — Saldo en el ledger

1. El encabezado `Saldo de cuenta` aparecerá inmediatamente a la derecha de `Total`.
2. Cada orden vinculada a un cliente mostrará el `Client.balance` devuelto por la consulta del ledger, formateado como moneda con la misma convención `es-AR` usada por `Total`.
3. El valor puede repetirse en distintas órdenes del mismo cliente: cada aparición representa el saldo actual del cliente, no el saldo específico de la orden.
4. Una orden sin cliente mostrará `—` (o equivalente explícito de dato no disponible), no `$0`, para no confundir cliente ausente con una cuenta saldada.
5. Se conservarán todas las columnas y acciones actuales, sin cambiar el orden relativo de ninguna columna existente excepto la inserción de la nueva columna después de `Total`.
6. El componente seguirá mostrando el saldo para todas las pestañas/estados y páginas donde aparece el listado, según el cliente vinculado a cada orden.

### RF-02 — Saldo en el selector de clientes

1. En ambos modos del modal (A cuenta y Presupuesto), cada cliente disponible debe mostrar su saldo actual junto con su información de selección.
2. El saldo debe ser legible visualmente como etiqueta/dato `Saldo: $…`, usando formato `es-AR` y preservando valores negativos.
3. Los clientes con `balance = 0` deben mostrar `$0` (o el cero equivalente del formateador); no ocultar el campo por ser cero.
4. El saldo se presenta también para todos los resultados filtrados por búsqueda; buscar clientes no puede quitar ni mezclar sus balances.
5. Seleccionar cliente, crear cliente, agregar artículos, confirmar/cancelar y el diálogo de orden existente conservan el comportamiento actual.
6. No se requiere mostrar `balance` dentro del formulario de alta de cliente; nuevos clientes siguen teniendo el saldo inicial actual definido por el sistema.

### RF-03 — Fuente, autorización y actualización

1. La fuente de saldo del ledger será la relación `client.balance` consultada junto a las órdenes. No se realizarán consultas adicionales por fila.
2. La fuente de saldo del modal seguirá siendo `GET /api/clients`, que ya devuelve `balance` dentro de `{ clients }` y filtra por el `businessId` de la sesión.
3. No añadir una fuente alternativa de datos ni aceptar saldos enviados desde el browser como autoridad para mutaciones.
4. Mantener los mecanismos actuales de refresh de la página/modales. En particular, abrir el modal sigue lanzando el fetch actual, por lo que el balance mostrado proviene de la respuesta más reciente de ese fetch.
5. No endurecer ni relajar la autorización existente en `getUnpaidOrders` o `/api/clients`.

### RF-04 — Saldo en el diálogo de orden existente

1. En el Existing Order Dialog controlado por `showExistingOrderDialog` en `src/components/ledger/ClientSelectionModal.tsx`, mostrar el saldo actual del cliente seleccionado, no el total de una orden pendiente ni el importe de los artículos que se agregarán.
2. Obtenerlo por identidad desde el registro de `clients` correspondiente a `selectedClientId`, cuyo balance procede de la respuesta autenticada `GET /api/clients` ya cargada al abrir el modal principal. Si el registro o balance no está disponible/válido, mostrar `—` (nunca inventar `$0`) y permitir que continúe la selección/agregado existente.
3. Ubicar una etiqueta explícita, por ejemplo **Saldo actual del cliente**, debajo del encabezado/descripción del diálogo y antes de la lista de órdenes; mantenerlo visualmente distinto de los importes por orden y del panel **Total a agregar**.
4. Conservar signo y formato `es-AR`, incluido el saldo cero y saldos negativos. El dato corresponde al snapshot obtenido al abrir el modal principal; no implica actualización en tiempo real ante cambios concurrentes.
5. La búsqueda/selección de otro cliente y la lista de órdenes deben mantener la asociación de balance por `client.id`; no reutilizar el saldo de una selección anterior.
6. No modificar el contrato de `addItemsToOrder`: el payload seguirá siendo `{ orderId, businessId, items }`, sin `balance` ni `clientId` proveniente del browser. El servidor conserva autorización y actualización transaccional del saldo a partir de la orden persistida.

### RF-05 — Ancho responsive del diálogo de orden existente (seguimiento)

1. El Existing Order Dialog de `src/components/ledger/ClientSelectionModal.tsx` conservará un ancho seguro para móviles: a anchos menores que `md` debe dejar al menos 8 CSS px de margen visible a cada lado, no exceder el viewport y no generar overflow horizontal del diálogo/contenido.
2. Desde `md` (768 CSS px en la configuración estándar de Tailwind) el diálogo será más ancho que su límite actual `sm:max-w-md` (28rem / 448px). Comportamiento objetivo de clases: mantener el ancho fluido y seguro existente y aplicar un límite ancho `md:max-w-2xl` (42rem / 672px); se puede conservar el límite `sm:max-w-md` para tamaños menores que `md`.
3. El ancho ampliado debe seguir centrado y acotado al viewport en tamaños md y mayores. Como criterio observable, a viewport de 1024px el diálogo tendrá un ancho superior a 448px y de hasta 672px; a viewports md donde no quepa el máximo, se reducirá para mantener los márgenes seguros, sin overflow horizontal.
4. El ajuste se limita a la presentación de este diálogo; no cambiar el tamaño de los otros diálogos del `ClientSelectionModal`, el contenido/flujo, las áreas desplazables ni las acciones.

## 5. Interfaces y datos

### 5.1 Tipo usado por el ledger

Ampliar el contrato actual de `AccountLedgerOrder` en `src/actions/unpaid-orders.ts` para incluir el saldo en el objeto del cliente:

```ts
interface AccountLedgerOrder {
  // Campos de orden existentes sin cambios.
  client: {
    id: string;
    name: string | null;
    balance: number;
  } | null;
}
```

La selección Prisma de la lista debe pedir `client.balance: true` junto a `id` y `name`. Mantener la posibilidad de `client: null`; el balance es obligatorio cuando hay cliente debido al valor por defecto del modelo Prisma. No convertir `Float` a string en la frontera de acción.

### 5.2 Tipo usado por `ClientSelectionModal`

Ampliar el tipo local `Client` de `src/components/ledger/ClientSelectionModal.tsx` con:

```ts
interface Client {
  // Campos actuales.
  balance: number;
}
```

El route handler ya selecciona y serializa `balance: number`; no cambiar el contrato de respuesta. Si se agrega validación/mapeo defensivo de la respuesta en una implementación posterior, el valor ausente o no numérico no debe renderizarse como una deuda fabricada; se deberá mostrar un placeholder y reportar el dato inválido sin impedir seleccionar al cliente.

### 5.3 Representación

- Fuente: `Client.balance`.
- Unidad: monto monetario existente de la aplicación.
- Formato: `toLocaleString("es-AR")` o helper monetario existente equivalente.
- Conservación de signo: sí.
- Sin cliente/valor desconocido: `—`.
- Sin conversión ni redondeo distinto al formato ya utilizado para los totales.

### 5.4 Diálogo de agregar a orden existente

- Componente/modal: `ClientSelectionModal` → `<Dialog open={showExistingOrderDialog}>` (Existing Order Dialog), no la ruta de detalle `account-ledger/[id]`.
- Cliente asociado: `clients.find(client => client.id === selectedClientId)`.
- Camino de lectura: apertura de modal principal → `fetchClients()` → `GET /api/clients` → route autenticado/filtrado por `session.user.businessId` → `Client.balance` → estado `clients` → registro seleccionado.
- `getClientUnpaidOrders` y `/api/unpaid-orders` siguen siendo fuentes solamente de la lista `existingOrders`.
- Presentar el dato bajo el encabezado/descripción y antes de las opciones de orden con rótulo **Saldo actual del cliente**; fallback `—` si no existe balance finito.
- La acción `addItemsToOrder({ orderId, businessId, items })` no recibe el dato visual. La persistencia autoritativa continúa en su transacción del servidor, que incrementa el balance asociado a la orden.

## 6. Compatibilidad, rendimiento y riesgos

- La extensión de la proyección es compatible con callers de `getUnpaidOrders`: se agrega un dato, sin cambiar input, envelope paginado, ordenación, filtros, cursor o salida de detalle.
- Al modificar la proyección debe conservarse la estructura de cliente que ya usa el ledger y que consumen componentes actuales.
- La lectura debe continuar siendo set-based: un `findMany` existente para la página; nunca una consulta de saldo por orden.
- `GET /api/clients` no debe traer clientes de otros negocios y debe seguir devolviendo su shape actual.
- El balance es un campo `Float` ya utilizado por la aplicación. No ajustar precisión/esquema como parte de este alcance, aunque una futura mejora financiera pueda considerar `Decimal` por separado.
- Saldo actual en todas las filas históricas puede ser visualmente igual incluso cuando cambie entre el momento de una orden y el presente. El rótulo `Saldo de cuenta` (actual), no `Saldo después de la orden`, hace explícita la semántica.

## 7. Archivos recomendados

### Conservar/modificar

La implementación previa de saldo del ledger y del selector ya está presente en la rama activa sin commit; conservarla. Para el seguimiento, el cambio funcional nuevo está limitado a la presentación en `ClientSelectionModal`.

| Archivo | Cambio previsto / estado |
|---|---|
| `src/actions/unpaid-orders.ts` | La implementación previa ya amplía `AccountLedgerOrder.client` y la proyección Prisma con `client.balance`; conservarla. El seguimiento no requiere cambio en esta acción. |
| `src/app/(protected)/account-ledger/AccountLedgerList.tsx` | La implementación previa ya muestra `Saldo de cuenta` tras `Total`, formatea el balance y representa sin cliente como `—`; conservarla. |
| `src/components/ledger/ClientSelectionModal.tsx` | La implementación previa ya tipa/normaliza `balance` y lo muestra en las opciones de ambos modos; añadir su presentación en el Existing Order Dialog, derivada de `clients` por `selectedClientId`, sin cambiar el payload de `addItemsToOrder`. |
| `src/components/ledger/ClientSelectionModal.tsx` | Para el seguimiento de ancho: ampliar sólo las clases del `DialogContent` del Existing Order Dialog, por ejemplo conservar `w-[calc(100%-1rem)]` y `sm:max-w-md` y agregar `md:max-w-2xl`; mantener límites/márgenes seguros, max-height y overflow existentes. No aplicar el ancho a los otros diálogos del componente. |

### Verificar, sin cambio esperado

| Archivo | Motivo |
|---|---|
| `src/components/Billing/BillButtons.tsx` | Ya monta el mismo modal tanto para A cuenta como Presupuesto; verificar ambos caminos, sin cambiar datos o callbacks salvo necesidad demostrada. |
| `src/app/api/clients/route.ts` | Ya devuelve `balance` bajo autenticación y filtro por negocio. Confirmar contrato; cambiar sólo si el estado real de la rama no coincide con el hallazgo. |
| `src/actions/unpaid-orders.ts` | Verificar que `getClientUnpaidOrders` sólo alimenta la selección de órdenes y que `addItemsToOrder` mantiene el payload actual y la actualización del balance desde datos persistidos; no ampliar contratos para mostrar el saldo. |
| `src/app/api/unpaid-orders/route.ts` | Verificar únicamente el camino de compatibilidad de lectura de órdenes pendientes; no usarlo como fuente del balance ni cambiar el contrato por este requisito. |
| `prisma/schema.prisma` | Ya define `Client.balance`; no se espera cambio. |
| `src/app/(protected)/account-ledger/page.tsx` | Ya transporta el tipo de página hacia el listado; no se espera cambio si la nueva propiedad queda incluida en el resultado de la acción. |

## 8. Criterios de aceptación medibles

- **AC1 — Columna:** En cada estado del listado, el encabezado visible `Saldo de cuenta` aparece exactamente una vez inmediatamente a la derecha de `Total`.
- **AC2 — Valor de fila:** Para un fixture con cliente `balance = 1250.5`, la fila correspondiente muestra el valor equivalente formateado como moneda `es-AR`; el saldo procede del cliente y no del `order.total`.
- **AC3 — Semántica vigente:** Para dos órdenes del mismo cliente, ambas filas muestran exactamente el mismo saldo actual del cliente en el snapshot de consulta, aunque los totales de las órdenes sean distintos.
- **AC4 — Nulo y signos:** Una orden con `client = null` muestra `—` y no `$0`; balances positivo, cero y negativo se renderizan como importes distintos y mantienen el signo correspondiente.
- **AC5 — Consulta sin N+1:** El resultado de una página del ledger incluye `client.balance` en la consulta de órdenes existente; mostrar el valor no añade consultas Prisma por fila ni requests de navegador.
- **AC6 — Contrato de acción:** `AccountLedgerOrder.client` permite `null` y, si no es `null`, entrega `id`, `name` y `balance` numérico; el envelope/paginación, estados, orden, cursor y detalle existentes no cambian.
- **AC7 — Modos de modal:** Con el modal abierto desde **A cuenta**, todas las opciones de clientes muestran el balance devuelto por `/api/clients`; el mismo resultado se verifica al abrirlo desde **Presupuesto**.
- **AC8 — Búsqueda y selección:** Después de filtrar por nombre, cada resultado conserva el saldo asociado al mismo `client.id`; seleccionar cliente no reemplaza ni altera el valor mostrado.
- **AC9 — Respuesta API y seguridad:** `GET /api/clients` mantiene `{ clients: [...] }`, incluye el saldo numérico actual y sólo devuelve clientes del `businessId` autenticado; no se acepta el saldo desde el navegador como fuente de persistencia.
- **AC10 — Integridad de flujo:** Crear cliente, confirmar/cancelar selección, crear orden a cuenta, crear presupuesto y manejar órdenes existentes mantienen su flujo y payload actuales; ningún dato de balance se persiste como parte del pedido de checkout.
- **AC11 — Compatibilidad responsive:** En el viewport móvil y escritorio, la nueva columna/dato se puede identificar sin ocultar `Total`, estado o acciones, y el modal mantiene opciones legibles dentro de su área desplazable.
- **AC12 — Esquema/dependencias:** No se añade campo de base de datos, migración ni dependencia npm para esta feature.
- **AC13 — Validación de implementación:** Las pruebas unitarias/de componente existentes y nuevas para proyección/render/modal pasan; `npm run lint` y `npm run build` completan sin errores cuando se implemente. Estos comandos pertenecen a las fases Developer/QA, no a este entregable de arquitectura.
- **AC14 — Identificación y ubicación del diálogo:** El balance aparece en el Existing Order Dialog de `src/components/ledger/ClientSelectionModal.tsx` (controlado por `showExistingOrderDialog`), bajo su encabezado/descripción y antes de la lista de órdenes; no se implementa en `src/app/(protected)/account-ledger/[id]/page.tsx`.
- **AC15 — Balance del cliente elegido:** Con cliente seleccionado de `id = C` y balance finito `1250.5`, el Existing Order Dialog muestra **Saldo actual del cliente** con el importe correspondiente en formato `es-AR`; el dato coincide con `clients.find(c => c.id === selectedClientId)` y no con ningún `ExistingOrder.total` ni `Total a agregar`.
- **AC16 — Identidad, fallback y signo:** Para clientes con balance positivo, cero y negativo se muestran los importes correctos, preservando el signo. Si no hay registro coincidente o su balance no es finito, se muestra `—`, nunca `$0`; cambiar la selección no deja visible el saldo del cliente anterior.
- **AC17 — Camino de datos sin consulta nueva:** El balance presentado procede de `GET /api/clients` ya solicitado al abrir el modal principal y de su respuesta filtrada por el negocio autenticado. Consultar órdenes con `getClientUnpaidOrders` o `/api/unpaid-orders` no agrega consultas de saldo por orden ni se usa como fuente alternativa.
- **AC18 — Mutación intacta y autoridad servidor:** Al pulsar **Agregar a orden existente**, `addItemsToOrder` recibe exactamente los campos actuales `{ orderId, businessId, items }`; ni balance ni clientId de browser se agregan al payload. La visualización del saldo no cambia la autorización ni la actualización persistida que deriva la orden/clientId en el servidor.
- **AC19 — Flujo de orden existente y presentación:** La lista/selección de órdenes, **Total a agregar**, agregar artículos, crear nueva orden y cancelar mantienen comportamiento actual; el nuevo saldo está etiquetado y visualmente distinguido de los totales de órdenes y se mantiene legible dentro del diálogo responsive/desplazable.
- **AC20 — Ancho responsive del Existing Order Dialog:** Sólo el `DialogContent` del diálogo controlado por `showExistingOrderDialog` conserva un ancho viewport-safe por debajo de `md` (margen visible de al menos 8 CSS px por lado, sin overflow horizontal en un viewport móvil de 375px) y aplica desde `md` un límite más ancho que el actual de 448px, objetivo `md:max-w-2xl` (672px). A 1024px de viewport se verifica centrado con ancho superior a 448px y máximo 672px; entre 768px y el espacio requerido para el máximo se contrae dentro del viewport dejando márgenes seguros. El tamaño de los demás diálogos no cambia.

## 9. Escenarios de verificación recomendados

1. Ledger con cliente con deuda positiva, cero, crédito negativo y orden sin cliente, recorriendo al menos `inpago`, `pago`, `pendiente` y `all`.
2. Dos órdenes de un único cliente con distintos `total` para confirmar que la columna representa el saldo del cliente y no un cálculo por orden.
3. Modal abierto desde ambos botones con clientes con saldo positivo, cero y negativo; buscar un cliente y comprobar que su saldo permanece unido a su identidad.
4. Endpoint sin sesión y dos negocios con clientes distintos para verificar que el cambio no altera status/shape/autorización.
5. Confirmación de ausencia de consultas por fila y ausencia de cambios de esquema/migración.
6. Elegir un cliente con saldo positivo, cero y negativo, abrir su diálogo de orden existente y verificar asociación, formato/fallback y ubicación del saldo; comprobar que cambiar el cliente actualiza el dato asociado y que el payload de `addItemsToOrder` no incluye balance/clientId adicional.
7. Inspeccionar el Existing Order Dialog a 375px, 768px y 1024px de ancho: comprobar márgenes laterales de al menos 8px y ausencia de overflow horizontal en móvil, aumento de ancho al cruzar md y un máximo de 672px centrado en escritorio; confirmar que los otros diálogos del selector mantienen su tamaño.

## 10. Gate G1

- [x] Existe `ai/features/account-ledger-balance/SPEC.md` en el directorio solicitado.
- [x] Incluye decisiones explícitas para la ambigüedad del saldo actual frente a saldo histórico.
- [x] Incluye requisitos de datos/interfaces, límites, compatibilidad y archivos recomendados.
- [x] Incluye criterios de aceptación medibles AC1–AC13.
- [x] Incorpora el seguimiento para mostrar el saldo del cliente en el diálogo de agregar a orden existente, identifica el componente y camino seguro del dato y define AC14–AC19.
- [x] Incorpora el seguimiento de ancho responsive del Existing Order Dialog, inspecciona las clases actuales `w-[calc(100%-1rem)] ... sm:max-w-md` y define el objetivo md+ y viewport-safe medible en AC20.
- [x] Reconcilia archivos recomendados y requisitos de verificación sin ampliar las mutaciones ni reemplazar las obligaciones anteriores.
- [x] No se implementó código de producto ni se añadieron pruebas en esta fase.

**Resultado G1:** cumplido para la especificación original y sus seguimientos, incluido el ancho responsive (AC20). La inspección de `ClientSelectionModal.tsx` confirmó el `DialogContent` específico con `w-[calc(100%-1rem)] ... sm:max-w-md`; la expansión propuesta se limita a ese diálogo y deja los demás sin cambio. Queda lista para revisión de QA y posterior implementación; este cambio sólo actualiza arquitectura/criterios, no producto ni pruebas.
