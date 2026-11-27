# Checklist de pruebas — business print settings

## Modelo y seguridad

- [ ] `Business.qzTray` es `Boolean` no nullable, default `false`, para negocios nuevos y existentes.
- [ ] La migración es aditiva, conserva `address` y no toca `cert`, `key` ni datos ARCA.
- [ ] La lectura devuelve únicamente `businessId`, `qzTray` y `address`.
- [ ] La actualización valida tipos, normaliza dirección vacía/espacios a `null` y persiste ambos campos en una operación.
- [ ] Solo `ADMIN` autenticado del propio negocio puede leer/actualizar; anónimo, otro negocio, `USER` y `SUPER_ADMIN` reciben el error de autorización.
- [ ] Se revalidan las etiquetas/cache de negocio e impresión.

## Nueva venta e histórico

- [ ] Thermal con `qzTray=true` llama QZ con `true`.
- [ ] Thermal con `qzTray=false` no intenta QZ y usa fallback browser/HTML.
- [ ] PDF nunca intenta QZ.
- [ ] `/searchBill` usa la configuración persistida para factura y remito históricos.
- [ ] `SalesTable`/`SaleAccordion`/`PrintOptionsPopover` propagan la configuración sin aceptar un `businessId` arbitrario.
- [ ] `localStorage.qzTrayActive` y el selector local no pueden cambiar la fuente de verdad; thermal/pdf solo selecciona formato.
- [ ] Un error de conexión o impresión QZ conserva el fallback HTML y permite imprimir/descargar.

## Política fiscal y dirección

- [ ] La única factura oficial es la que tiene `CAE.CAE` no vacío.
- [ ] Factura oficial: nombre, razón social, CUIT, condición IVA, inicio de actividades, dirección vigente y datos CAE disponibles en ESC/POS, fallback HTML, PDF y header imprimible.
- [ ] Dirección actual se refleja en impresiones nuevas e históricas; dirección vacía no agrega texto ni DOM.
- [ ] Todo comprobante sin CAE —remito, presupuesto, cuenta corriente, histórico y otros— solo muestra `businessName`.
- [ ] En remitos no se interpolan razón social, CUIT, condición IVA, inicio, dirección, logo ni otros metadatos en ESC/POS, HTML, PDF o vista imprimible.
- [ ] La misma política se aplica a `account-ledger/[id]/PrintOrderButton` y demás puntos de impresión.

## Regresión

- [ ] Filtros/paginación históricos, creación de comprobantes y facturación posterior no cambian.
- [ ] Contratos ARCA y secretos `cert`/`key` siguen funcionando y nunca llegan a cliente.

## Nota de decisión

El fixture histórico que esperaba `qzTray=true` fue actualizado a `false`. El default aprobado para negocios existentes y nuevos es `false`; QZ Tray solo se habilita mediante la configuración persistida del negocio.
