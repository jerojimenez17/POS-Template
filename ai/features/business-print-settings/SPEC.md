# SPEC: Configuración de impresión del negocio y datos de comprobantes

## Estado

Especificación arquitectónica. Este documento corresponde al paso 1 del workflow TDD. No incluye implementación ni tests.

## Objetivo

Persistir en `Business` la preferencia de uso de QZ Tray y permitir editar la dirección del establecimiento desde `/admin/settings`. La preferencia debe gobernar la impresión térmica de:

- una venta nueva, incluyendo los flujos de factura y remito;
- una venta histórica desde `/searchBill`.

La dirección y los datos fiscales del negocio deben aparecer solamente en facturas oficiales. Una factura oficial existe exclusivamente cuando el comprobante tiene un CAE no vacío. Todo comprobante sin CAE —incluidos históricos, presupuestos, cuenta corriente y cualquier otro comprobante— usa formato remito: muestra el nombre del negocio y ningún otro dato del establecimiento.

## Hallazgos del código actual

1. `Business.address` ya existe como `String?` en `prisma/schema.prisma` y fue creado por la migración `20260124211155_add_multitenancy`. No debe agregarse una segunda columna ni una migración destructiva para `address`; se debe verificar que los entornos desplegados tengan esa migración aplicada.
2. `Business` no tiene actualmente `qzTray`; el valor inicial confirmado para negocios nuevos y existentes es `false`.
3. `BillProvider` usa `localStorage.qzTrayActive`, con default `true`. Esto es una preferencia por navegador/usuario y debe dejar de tener cualquier autoridad.
4. `PrintModeSelector` permite cambiar QZ Tray desde la pantalla de nueva factura. El selector/configuración local de QZ Tray se elimina como fuente de verdad; `thermal`/`pdf` continúa siendo una elección de formato.
5. `PrintableTable` ya obtiene `address` mediante `getBusinessBillingInfoAction`, pero entrega todos los datos del negocio a los templates sin distinguir factura de remito.
6. `BrowserPrint.generateThermalReceipt`, su fallback HTML y `buildPDFHTML` imprimen actualmente razón social, CUIT, condición IVA y dirección cuando están disponibles, también para comprobantes sin CAE.
7. El flujo histórico usa `PrintOptionsPopover`, que vuelve a obtener los datos fiscales pero no recibe ni consulta una preferencia de QZ Tray.
8. `SalesTable` es el punto de composición de la ruta histórica y debe transportar la configuración de impresión hacia `SaleAccordion`/`PrintOptionsPopover`, o centralizar la lectura en una acción segura.
9. La clasificación histórica actual se basa principalmente en `CAE.CAE`: con CAE se considera factura y sin CAE remito. `Order.billType` no se guarda en `processSaleAction`; por eso el histórico no puede reconstruir con fiabilidad tipos que no estén representados por CAE.
10. `src/app/admin/settings/page.tsx` solo carga `getBusinessArcaData` y `ArcaForm`. La dirección está en Prisma pero no en `ArcaData`, `ArcaUpdateInput`, `ArcaFieldsSchema` ni en el formulario.

## Decisiones arquitectónicas

### 1. Modelo y migración

Agregar al modelo `Business`:

| Campo | Tipo | Default propuesto | Motivo |
|---|---|---|---|
| `qzTray` | `Boolean` no nullable | `false` | Configuración por negocio, no por navegador; aplica a negocios nuevos y existentes |
| `address` | `String?` | existente | Dato fiscal/identificación del establecimiento |

La migración es una migración Prisma aditiva equivalente a `ALTER TABLE "Business" ADD COLUMN "qzTray" BOOLEAN NOT NULL DEFAULT false`. Debe:

- conservar el valor existente de `address`;
- permitir desplegar primero el esquema y luego la aplicación;
- ejecutar `prisma generate` y validar el estado de migraciones en staging;
- no tocar credenciales `cert`/`key` ni datos ARCA.

Si alguna instalación real no contiene `address`, se requiere una migración de reconciliación separada que agregue `address TEXT NULL`; no se debe asumir que el cambio solicitado requiere esa columna en este repositorio.

### 2. Lectura y escritura de configuración

Crear una superficie de configuración de impresión separada de las credenciales ARCA, aunque se renderice en la misma página:

- `getBusinessPrintSettingsAction()` devuelve únicamente `businessId`, `qzTray` y `address` para el negocio de la sesión.
- `updateBusinessPrintSettingsAction(input)` valida `{ qzTray: boolean, address: string | null }`, autoriza exclusivamente a un usuario con rol `ADMIN` sobre su propio negocio y actualiza ambos campos en una sola operación.
- La acción debe ejecutar autenticación/autorización en servidor, validar con Zod, normalizar dirección vacía a `null` y revalidar la etiqueta/cache de negocio e impresión.
- No debe devolver `cert` ni `key` al cliente. La lectura de datos fiscales para impresión tampoco debe exponer secretos.

El formulario de settings puede ser un `BusinessPrintSettingsSection` independiente debajo de `ArcaForm`. No se recomienda ampliar `ArcaFieldsSchema` con campos no ARCA: mantiene contratos y validaciones separadas y permite guardar dirección/QZ sin reenviar credenciales.

Contrato lógico de lectura:

```ts
interface BusinessPrintSettings {
  businessId: string;
  qzTray: boolean;
  address: string | null;
}
```

Contrato lógico de actualización:

```ts
interface UpdateBusinessPrintSettingsInput {
  qzTray: boolean;
  address: string | null;
}
```

### 3. Flujo de nueva factura/remito

`newBill/page.tsx` debe leer `qzTray` en servidor y pasarlo a `BillProvider` como valor inicial. El contexto debe exponer una propiedad de solo lectura, por ejemplo `qzTrayEnabled`, usada por `PrintableTable` al invocar `printThermalReceipt`.

- `printMode = "pdf"` siempre conserva el flujo PDF y no invoca QZ Tray.
- `printMode = "thermal"` invoca QZ Tray cuando `qzTrayEnabled === true`; cuando es `false`, usa el fallback HTML/browser existente.
- El selector/configuración local y `localStorage.qzTrayActive` dejan de gobernar el resultado. Puede eliminarse y/o limpiarse; no debe permitir que un usuario contradiga `Business.qzTray`.
- Debe evitarse que el valor se capture antes de terminar la carga de configuración. La impresión no puede elegir QZ por un default temporal mientras la configuración aún está pendiente.

`BillParametersForm.tsx` participa en el flujo al construir el estado de la venta, pero no debe decidir el transporte de impresión. La responsabilidad permanece en el contexto/`PrintableTable`, evitando duplicar la política en el formulario.

### 4. Flujo histórico

`searchBill/page.tsx` debe obtener la configuración segura de impresión para el negocio autenticado y pasarla a `SalesTable`; `SalesTable` la pasa a `SaleAccordion` y `PrintOptionsPopover`. Alternativamente, el popover puede leer una acción de configuración al hacer click, pero no debe consultar un `businessId` arbitrario recibido del navegador.

Contrato sugerido:

```ts
interface HistoricalPrintSettings {
  qzTrayEnabled: boolean;
}
```

`PrintOptionsPopover` debe llamar `printThermalReceipt(data, qzTrayEnabled)` para impresión térmica histórica. La opción PDF no cambia. La configuración debe ser la misma para factura histórica y remito histórico.

### 5. Clasificación de factura oficial/remito

La política confirmada es:

- **Factura oficial**: exclusivamente comprobante autorizado por ARCA, identificable por `CAE.CAE` no vacío. Incluye nombre, razón social, CUIT, condición IVA, inicio de actividades y dirección vigente cuando existan, además de los datos exigidos por el template actual.
- **Remito**: todo comprobante cuyo CAE sea vacío o inexistente. Incluye únicamente `businessName`; no incluye `razonSocial`, `cuit`, `condicionIva`, `inicioActividades`, `address`, logo ni otros datos del negocio. Esto incluye comprobantes nuevos e históricos, presupuestos, comprobantes de cuenta corriente y cualquier otro tipo.

La clasificación debe convertirse en un dato explícito del modelo de impresión (`"official-invoice" | "remito"`) y ser aplicada de forma centralizada por los cuatro destinos de salida:

1. ESC/POS generado por `generateThermalReceipt`;
2. fallback HTML térmico de `BrowserPrint`;
3. template de PDF de `buildPDFHTML`;
4. header visible de `PrintableTable` para impresión del navegador.

No se debe confiar solamente en ocultar campos con CSS: los datos de remito no deben interpolarse en el HTML ni en el payload ESC/POS.

La construcción del DTO debe enviar `businessInfo` completo solo para factura oficial y un DTO de remito que contenga únicamente `businessName`. Para evitar regresiones, la decisión debe residir en una función pura compartida por nueva/histórica y por los demás comprobantes, no en condiciones duplicadas en cada componente.

## Archivos y responsabilidades previstas

### Prisma

- `prisma/schema.prisma`: agregar `Business.qzTray`; documentar que `address` ya existe.
- `prisma/migrations/<timestamp>_add_business_qz_tray/migration.sql`: migración aditiva con default `false`.

### Configuración

- `src/schemas/`: schema de actualización de settings de impresión.
- `src/actions/business-config.ts` o nueva acción de impresión: lectura/actualización autenticada y revalidación.
- `src/app/admin/settings/page.tsx`: cargar settings junto con ARCA y renderizar sección editable.
- `src/components/AdminSettings/BusinessPrintSettingsSection.tsx`: formulario de dirección y switch QZ Tray.
- `src/models/`: DTOs de settings, si el proyecto mantiene modelos para contratos de acciones.

### Impresión

- `src/context/BillContext.tsx` / `BillProvider.tsx`: recibir y exponer la configuración por negocio; quitar la autoridad de localStorage.
- `src/components/Billing/PrintableTable.tsx`: construir DTO oficial/remito y usar el valor persistido.
- `src/components/Billing/PrintOptionsPopover.tsx`: aplicar QZ Tray al histórico y usar la misma clasificación.
- `src/components/Billing/SalesTable.tsx` y `SaleAccordion.tsx`: propagar settings históricas.
- `src/lib/print/BrowserPrint.ts`: aplicar política de campos al ESC/POS y fallback HTML; conservar fallback cuando QZ falle.
- `src/lib/print/pdf-templates.ts`: ocultar todos los datos de negocio salvo el nombre en remitos.
- `src/lib/print/`: posible helper puro `buildReceiptPrintData`/`getDocumentPrintKind` para no duplicar reglas.

### ARCA y datos históricos

- `src/actions/arca.ts`, `src/models/Arca.ts`, `src/schemas/index.ts`: no mezclar QZ con credenciales; ampliar contratos solo si se decide que dirección se edita dentro de `ArcaForm`.
- `src/actions/business.ts`: mantener `getBusinessBillingInfoAction` como DTO fiscal seguro o reemplazarlo por un DTO explícito que incluya dirección y no secretos.
- `src/actions/sales/history.ts`: mantener el mapeo histórico compatible y clasificar exclusivamente por CAE no vacío; no agregar una clasificación alternativa para decidir factura/remito.
- `account-ledger/[id]/PrintOrderButton.tsx` y cualquier otro punto de impresión deben aplicar la misma política de CAE, datos y dirección vigente.

## Contratos de impresión

La capa de templates debe consumir un DTO con una política explícita, conceptualmente:

```ts
type DocumentPrintKind = "official-invoice" | "remito";

interface ReceiptPrintData {
  businessName: string;
  documentKind: DocumentPrintKind;
  businessInfo?: {
    razonSocial?: string | null;
    cuit?: string | null;
    condicionIva?: string | null;
    inicioActividades?: Date | string | null;
    address?: string | null;
  };
  // resto de datos de venta, items, totales y CAE existentes
}
```

Invariante: si `documentKind === "remito"`, `businessInfo` debe ser `undefined` o contener cero campos fiscales; el nombre se entrega exclusivamente en `businessName`.

La función de impresión térmica debe conservar su contrato de fallback y resultado booleano. El nuevo parámetro de QZ debe recibir el valor de Business desde el flujo llamador, no un valor calculado por `localStorage`.

## Criterios de aceptación verificables

1. Prisma contiene `Business.qzTray` como booleano no nullable y una migración aditiva aplicable a una base existente sin pérdida de datos.
2. Una instalación existente conserva exactamente los valores de `Business.address` después de la migración.
3. Un administrador autenticado puede ver y guardar dirección y QZ Tray desde `/admin/settings`; la dirección vacía se persiste como `null` y un valor no vacío se conserva sin truncamiento inesperado.
4. Un usuario no autenticado, un usuario de otro negocio o un usuario sin permiso no puede leer ni modificar settings de otro negocio; la acción devuelve el error de autorización definido por las convenciones del proyecto.
5. Al guardar QZ Tray, el valor leído en una nueva visita a `/newBill` coincide con la base de datos, independientemente de `localStorage.qzTrayActive`.
6. En nueva venta térmica con `qzTray = true`, `printThermalReceipt` recibe `true`; con `qzTray = false`, recibe `false` y se intenta el fallback browser. En PDF no se intenta QZ en ningún caso.
7. En `/searchBill`, la impresión térmica de una factura histórica y de un remito histórico usa el mismo `qzTray` persistido del negocio, no un default local ni un valor enviado como `businessId` libre.
8. Una factura oficial con CAE muestra nombre, razón social, CUIT, condición IVA, inicio de actividades y dirección cuando cada dato está disponible, en thermal ESC/POS, fallback HTML, PDF y vista de impresión.
9. Un remito sin CAE muestra el nombre del negocio y no contiene en el texto generado ni en el DOM de impresión dirección, razón social, CUIT, condición IVA, inicio de actividades, logo ni otros metadatos del negocio.
10. Cambiar la dirección en settings se refleja en una nueva impresión posterior, tanto nueva como histórica y desde otros comprobantes; se usa la dirección actual del negocio y, si está vacía, no se imprime ninguna dirección.
11. El fallo de conexión QZ mantiene el fallback HTML existente y no impide descargar/imprimir el comprobante.
12. Los contratos ARCA existentes, incluyendo cifrado y lectura de `cert`/`key`, continúan funcionando y ningún secreto llega a componentes cliente.
13. Los filtros y paginación de `SalesTable`, creación de factura/remito y facturación posterior de una venta histórica no cambian de comportamiento.
14. Todo comprobante sin CAE, incluyendo presupuesto, cuenta corriente, otros comprobantes e históricos, se imprime como remito en thermal ESC/POS, fallback HTML, PDF y vista de impresión; solo muestra el nombre del negocio.
15. La política de datos y dirección vigente también se aplica a `account-ledger/[id]/PrintOrderButton.tsx` y a cualquier otro flujo de impresión existente.
16. La página y las acciones de settings conservan los permisos actuales: solo `ADMIN` puede acceder y modificar esta configuración; no se amplía el alcance a `SUPER_ADMIN`.

## Compatibilidad y despliegue

- El default de base para `qzTray` es `false` para negocios nuevos y existentes. QZ Tray solo se habilita mediante `Business.qzTray` desde settings.
- Durante una transición puede aceptarse que el cliente antiguo ignore la columna, pero el cliente nuevo debe ser compatible con bases donde `qzTray` todavía no exista solo durante el rollout previo de migración; no se debe hacer una consulta obligatoria antes de aplicar el esquema.
- No se requiere modificar órdenes existentes: la clasificación oficial/remito se define por CAE en cada impresión. No se conserva un tipo histórico elegido si contradice esta política.

## Riesgos

| Riesgo | Impacto | Mitigación |
|---|---|---|
| Default incorrecto de `qzTray` | Impresión silenciosa en navegador o conexión QZ inesperada | Default confirmado `false`; cubrir ambos caminos |
| `localStorage` contradice Business | Configuración inconsistente entre caja e histórico | Eliminarlo como fuente de verdad; opcionalmente migrar solo para telemetría |
| Templates reciben datos fiscales para remitos | Incumplimiento funcional/fiscal y filtración de datos | DTO explícito + tests de contenido, no solo CSS |
| Históricos no guardan `billType` | Tipos nominales que no coinciden con el estado fiscal | Clasificar exclusivamente por CAE; no usar `billType` como excepción |
| Configuración cacheada | Impresión con dirección/QZ anterior | Revalidar tags y leer al entrar; considerar lectura al click en histórico |
| Fallback QZ | Usuarios creen que QZ está activo aunque se imprimió por navegador | Mantener error/feedback visible sin romper impresión |
| Dirección ya existente pero schema desplegado divergente | Fallo de migración o pérdida accidental | Auditar `_prisma_migrations` y aplicar migración de reconciliación solo si corresponde |

## Ambigüedades resueltas por producto

1. **Default de `qzTray` — RESUELTA:** `false` para negocios nuevos y existentes. El fallback browser no se deshabilita: se usa cuando el formato es thermal y `Business.qzTray` es `false`, o cuando QZ falla.
2. **Fuente de verdad — RESUELTA:** se elimina el selector/configuración local de QZ Tray como autoridad. La única fuente es `Business.qzTray`; `thermal`/`pdf` solo selecciona el formato.
3. **Factura oficial — RESUELTA:** exclusivamente comprobante con `CAE.CAE` no vacío.
4. **Remito — RESUELTA:** todo comprobante sin CAE, incluidos históricos, presupuestos, cuenta corriente y otros comprobantes, se imprime con formato remito.
5. **Dirección en reimpresiones — RESUELTA:** se usa la dirección actual del negocio, también para históricos; puede estar vacía y entonces no se imprime.
6. **Alcance — RESUELTA:** la política se aplica a todos los flujos de impresión, no solo a nueva venta y `/searchBill`.
7. **Permisos — RESUELTA:** no cambian; la página continúa siendo solo para `ADMIN`. No se agrega acceso para `SUPER_ADMIN`.

Las reglas complementarias permanecen: una factura oficial muestra los datos fiscales disponibles; un remito muestra únicamente el nombre del negocio; y el nombre usado en remitos es el `businessName` ya definido por el DTO, nunca `razonSocial`.

## Fuera de alcance

- Configurar nombre de impresora QZ, certificados QZ Tray o firma criptográfica.
- Rediseñar el contenido legal de una factura ARCA.
- Cambiar la lógica de autorización de CAE.
- Crear un sistema de snapshots fiscales históricos; las reimpresiones usan intencionalmente la dirección vigente.
- Implementar código o tests en esta etapa.
