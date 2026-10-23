# SPEC: Regresión de ventas vacías en `/searchBill`

## Estado y alcance

Especificación arquitectónica G1. No se implementan código ni tests en esta
etapa. El alcance es diagnosticar y corregir la regresión introducida al
conectar paginación y filtros server-side en `src/app/(protected)/searchBill`.
La corrección debe conservar la paginación por cursor, el aislamiento por
`businessId`, `mapOrderToBillState`, Pusher y la compatibilidad con órdenes
históricas. No incluye cambios de esquema Prisma.

## Diagnóstico reproducible del flujo actual

1. `page.tsx` no ejecuta una consulta inicial: pasa explícitamente
   `sales={[]}` y `nextCursor={null}` a `SalesTable`. Esto es intencional en la
   corrección de paginación previa; la primera consulta ocurre en el cliente
   cuando `FiltersContext` ya está disponible.
2. En el primer render, `FiltersProvider` inicializa `Remito.active = true`,
   `FacturaC.active = false`, `Efectivo.active = true` y todos los demás
   medios/tipos inactivos. Por lo tanto `serializeSalesFilters` produce,
   reproduciblemente, aproximadamente:

   ```ts
   {
     documentTypes: ["REMITO"],
     paymentMethods: ["efectivo"]
   }
   ```

   El estado no significa “mostrar todo”; significa restringir la primera
   consulta a remitos pagados en efectivo.
3. `SalesTable` sí dispara `getSalesAction({ cursor: undefined, filters })`
   cuando el vendedor ya está listo. No existe un fallo de ausencia de
   request inicial: el request es el esperado después de hidratar el contexto.
4. `get-sales.ts` construye el `where` base como
   `{ businessId, paidStatus: "pago" }`. Después aplica todos los filtros
   antes de `take`, conserva `take + 1` y usa el cursor compuesto
   `date desc, id desc`. La paginación previa, por tanto, no debe revertirse.
5. El filtro de documentos tiene un desajuste exacto: `REMITO` se transforma
   en `billType = "Remito"`, mientras que `FACTURA_C` se transforma solo en
   `billType = "Factura C"`. La etiqueta de la UI es “Facturas”, pero las
   facturas A y B persistidas por `processSaleAction` tienen `billType` igual a
   `Factura A` o `Factura B` y quedan excluidas. No hay hoy un filtro para las
   tres variantes.
6. La combinación inicial es todavía más restrictiva: una factura A/B/C no
   puede coincidir con `billType = "Remito"`, y una venta/remito con medio
   distinto de efectivo no puede coincidir con el OR de `paymentMethod` y
   `paymentMethod2` para `Efectivo`. Así, una base normal con facturas y/o
   remitos no efectivos devuelve cero aunque existan órdenes.
7. `paidStatus` no es un valor textual arbitrario: el schema Prisma define el
   enum `PaidStatus { pago inpago }`. `processSaleAction` (flujo actual de
   facturación/remito) persiste siempre `paidStatus: "pago"`; por eso el
   predicado es correcto para la historia de ventas y no debe cambiarse a
   `inpago` ni eliminarse. La ruta legacy `saveOrderAction` persiste
   `inpago` para cualquier medio que no sea Efectivo; esas órdenes son deudas
   y no deben aparecer como ventas pagas solo para ocultar la regresión.
8. Los medios están persistidos en `Order.paymentMethod` y opcionalmente
   `paymentMethod2`; el schema no usa enum. `serializeSalesFilters` envía
   valores en minúscula y `normalizePaymentMethod` los vuelve a los nombres
   canónicos (`Efectivo`, `Cuenta DNI`, `Credito 1 pago`, etc.). La consulta
   agrupa correctamente ambos campos con OR. El problema comprobable es el
   estado inicial `Efectivo`, no la normalización ni la ausencia del segundo
   medio.
9. `Order.billType` es `String?`; `CAE` y `afipVoucherType` también se
   almacenan en `Order`. `processSaleAction` persiste `billType`, CAE y códigos
   AFIP 1/6/11 para A/B/C. `mapOrderToBillState` conserva `billType`, pero el
   filtro de `get-sales.ts` nunca consulta los códigos ni las variantes A/B.
   Para históricos con `billType` nulo, el CAE/código puede ser la única
   evidencia de una factura oficial; la solución debe contemplarlo sin
   convertir automáticamente una venta sin CAE en factura.
10. Las fechas y el vendedor no explican el vacío inicial: ambos están
    inactivos/ausentes al comenzar para un administrador. Para usuarios no
    administradores, `SalesTable` agrega su email como vendedor y espera a que
    el snapshot lo contenga; esa restricción es intencional y debe mantenerse.

### Prueba de reproducción

Con sesión válida de un negocio que tenga una orden `paidStatus = pago` y
`billType = "Factura A"` (o B/C), el primer request observado en el navegador
es `documentTypes=["REMITO"]`, `paymentMethods=["efectivo"]`. Prisma recibe,
además de `businessId` y `paidStatus="pago"`, `billType IN ("Remito")` y el OR
de medios de pago efectivo. El resultado es `sales=[]`. Desactivar Remitos,
activar Facturas y elegir el medio correspondiente demuestra el segundo
defecto: A y B siguen sin aparecer porque el backend solo acepta “Factura C”.

## Causa exacta

La regresión no es un fallo de renderizado, serialización de fechas, cursor ni
`mapOrderToBillState`. Es la aplicación server-side de un snapshot inicial que
activa `Remito + Efectivo`, combinada con un contrato de tipo de comprobante
que interpreta la opción visible “Facturas” como únicamente `Factura C`.

En términos de predicados, la primera consulta requiere simultáneamente:

```text
businessId = sesión.businessId
paidStatus = pago
billType = Remito
(paymentMethod = Efectivo OR paymentMethod2 = Efectivo)
```

Una factura no puede satisfacer `billType = Remito`; un remito no efectivo no
puede satisfacer el predicado de medio. Luego, aun con el switch de facturas,
el contrato actual requiere `billType = Factura C`, excluyendo A y B. Esta
intersección explica el listado completamente vacío y la pérdida selectiva de
variantes, con valores reales del código y del schema.

## Solución mínima especificada

1. Mantener la obtención inicial en `SalesTable`, el request con filtros antes
   de `take`, el cursor compuesto, el `take + 1`, la deduplicación y el
   control de respuestas obsoletas de la corrección `ventas-pagination`.
2. Cambiar la semántica del filtro existente `FACTURA_C` (se conserva el
   literal para compatibilidad interna con el contrato previo) para que la
   opción UI “Facturas” incluya `Factura A`, `Factura B` y `Factura C`.
   Preferentemente, el contrato puede introducir un token canónico
   `FACTURA`; el backend debe aceptar también `FACTURA_C` como alias legacy.
   Nunca se debe interpretar la opción visible “Facturas” como solo C.
3. Resolver facturas por metadatos fiscales persistidos: `billType` A/B/C y,
   para filas históricas incompletas, `afipVoucherType` 1/6/11 o CAE válido.
   Resolver remitos como `billType = "Remito"` y preservar la compatibilidad
   con remitos legacy sin CAE cuando el modelo histórico no guardó el tipo.
   Una fila con CAE no debe entrar al conjunto de remitos por tener un
   `billType` nulo.
4. Mantener `paidStatus = pago` como condición fija de historial. No incluir
   `inpago`; las cuentas corrientes se consultan en ledger y no son ventas
   pagadas. Documentar explícitamente que órdenes creadas por el camino legacy
   con `inpago` no son parte de este listado.
5. Mantener la normalización de medios y el OR entre `paymentMethod` y
   `paymentMethod2`. Los medios sin selección siguen significando “sin
   restricción”; la selección inicial actual puede conservarse, pero debe
   enviarse de forma coherente con lo que muestran los switches. Si producto
   decide que la pantalla debe abrir mostrando todos, ese cambio debe hacerse
   explícitamente en `INITIAL_STATE`, no implícitamente en la consulta.
6. No modificar `SalesTable` para filtrar localmente ni restaurar una consulta
   inicial sin filtros: hacerlo rompería la corrección previa y volvería a
   ocultar coincidencias después de la primera página.

## Contrato funcional compatible

```ts
interface SalesFilters {
  // FACTURA es canónico; FACTURA_C se acepta como alias histórico.
  documentTypes: ("FACTURA" | "FACTURA_C" | "REMITO")[];
  paymentMethods: string[];
  startDate?: string;
  endDate?: string;
  seller?: string;
}
```

Semántica obligatoria:

- tipos vacíos: no restringir por tipo;
- `FACTURA` o `FACTURA_C`: A, B y C;
- `REMITO`: remitos, no facturas con CAE;
- medios vacíos: no restringir por medio;
- medio seleccionado: coincide en cualquiera de los dos campos persistidos;
- fechas y vendedor: solo restringen cuando están activos;
- cada request conserva el mismo snapshot y cursor de la paginación previa.

## Archivos y responsabilidades

- `src/actions/sales/get-sales.ts`: resolver el conjunto A/B/C/remito en el
  `where` de Prisma sin alterar paid status, cursor u orden.
- `src/components/Billing/serialize-sales-filters.ts`: emitir el token de
  facturas compatible con el switch “Facturas”.
- `src/context/FiltersContext/FiltersProivder.tsx`: solo si se decide cambiar
  defaults visibles; verificar que el snapshot inicial sea intencional.
- `src/components/Billing/SalesTable.tsx`: no cambiar la arquitectura de
  carga; verificar únicamente que los nuevos resultados reemplacen el snapshot
  anterior y sigan usando el cursor correcto.
- `src/actions/sales/history.ts`: no cambiar el mapper salvo que la
  verificación de históricos demuestre que falta un campo necesario para
  identificar una factura; no duplicar allí el filtro de Prisma.
- `prisma/schema.prisma`: sin cambios; los campos y enums actuales contienen
  la información necesaria y el índice `[businessId, paidStatus, status, date]`
  sigue cubriendo la consulta base.

## Criterios de aceptación

1. Con una orden paga `Factura A`, una `Factura B` y una `Factura C`, el filtro
   activo “Facturas” devuelve las tres, no solo C.
2. Con una orden paga `billType="Remito"`, el filtro Remitos devuelve esa
   orden; una factura con CAE nunca aparece como remito.
3. Con los defaults actuales (`Remito` y `Efectivo`), el request inicial es
   reproducible y muestra remitos pagados en efectivo si existen; no muestra
   facturas por accidente. Si se cambia el default para “todos”, el request
   debe mostrar A/B/C y remitos según esa elección explícita.
4. Una factura o remito paga cuyo medio coincida solo con `paymentMethod2`
   aparece al activar ese medio; una orden `inpago` no aparece.
5. Una orden `inpago` creada por `createOrder`, `saveOrderAction` o ledger no
   se vuelve visible por esta corrección; `paidStatus=pago` se mantiene como
   requisito.
6. Con tipos y medios vacíos, la primera página consulta todas las órdenes
   pagas coincidentes del negocio, no una ventana local truncada; los filtros
   se aplican antes de `take`.
7. Al cambiar tipo, medio, fecha o vendedor, la solicitud comienza sin cursor,
   reemplaza la lista y no mezcla resultados del snapshot anterior.
8. “Cargar más” conserva el snapshot de filtros, el orden `date desc, id desc`
   y el cursor compuesto de la corrección previa; no hay duplicados ni
   omisiones.
9. El aislamiento por `businessId`, la transformación `mapOrderToBillState`,
   CAE, cliente, devoluciones, impresión y metadatos de notas de crédito no
   cambian.
10. Un histórico con `afipVoucherType` 1, 6 u 11 y `billType` incompleto se
    clasifica como factura solo si tiene evidencia fiscal válida; una fila sin
    CAE no se promociona a factura por un valor legado aislado.
11. Los errores de autenticación o consulta conservan el resultado seguro
    `{ sales: [], nextCursor: null }` y no exponen datos de otro negocio.
12. No se agregan dependencias, secretos, migraciones, código ni tests como
    parte de esta etapa arquitectónica.

## Gate G1 — verificación

G1 queda satisfecho: la especificación existe en
`ai/features/ventas-empty-regression/SPEC.md`, identifica con valores reales la
intersección que vacía la consulta (`paidStatus`, tipo, medio y defaults),
separa la causa exacta de riesgos no causales, define una solución mínima
compatible con `ventas-pagination`, conserva el contrato de órdenes y contiene
criterios medibles para remitos y Factura A/B/C. No se escribieron código ni
tests.
