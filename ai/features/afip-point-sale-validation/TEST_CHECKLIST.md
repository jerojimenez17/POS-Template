# Checklist QA — validación de punto de venta AFIP/ARCA

Pruebas TDD de la corrección descrita en `SPEC.md`. Esta entrega sólo agrega
especificaciones de prueba; no modifica producción ni la especificación.

## Criterios de aceptación

- [ ] **AC-01:** toda emisión usa el punto visible, entero, positivo y configurado; nunca `undefined`.
- [ ] **AC-02:** A/B/C usan los códigos WSFE 1/6/11 en preflight y creación.
- [ ] **AC-03:** un 11002 en preflight no llama `createVoucher`, no persiste CAE vacío y conserva ticket/pagos/punto/tipo.
- [ ] **AC-04:** la UI muestra literalmente `11002`, punto, tipo, ambiente/CUIT y la instrucción WSFE/WSFEv1.
- [ ] **AC-05:** cambiar B→A/C→B no disimula ni repara un punto rechazado.
- [ ] **AC-06:** un punto habilitado obtiene numeración y permite persistir un CAE asociado al punto elegido.
- [ ] **AC-07:** una respuesta tardía no altera el número, estado o error del par activo.
- [ ] **AC-08:** reset vuelve al primer punto y tipo inicial; A/B/C continúan seleccionables.

## Cobertura adicional solicitada

- [ ] Parsear 11002 en respuesta directa, envuelta, `details` y texto Axios/HTTP; conservar operación, punto, tipo y mensaje sanitizado.
- [ ] Sincronizar `ptoVenta` al snapshot/contexto inmediatamente, sin guardar el formulario.
- [ ] Ejecutar preflight autoritativo justo antes de emitir y bloquear CAE vacío.
- [ ] Mantener mensajes diferenciados para red, credenciales, HTTP 5xx y otros códigos AFIP.
- [ ] Regresión A/B/C, tipo inicial por condición IVA, reset, remito, presupuesto, A cuenta, edición y venta existente.
- [ ] No filtrar certificados, keys, tokens ni claves internas en errores de usuario, logs verificados o snapshots.

## G2 — definición de salida

G2 queda aprobado sólo cuando `npm run test -- ai/features/afip-point-sale-validation`
ejecuta todas estas pruebas y no existen fallos. En esta fase TDD se espera estado
**RED** contra la implementación actual; cualquier fallo debe desaparecer en G3
sin relajar las aserciones.
