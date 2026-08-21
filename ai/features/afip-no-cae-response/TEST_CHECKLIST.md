# Checklist QA — AFIP sin CAE

## G2 (TDD / RED)

- [ ] El parser acepta exactamente las seis formas soportadas y devuelve un resultado canónico `success` con `data.cae` y `sourcePath`.
- [ ] El parser rechaza CAE no string, vacío, whitespace, `null`, objetos, booleanos y longitudes/formato distintos de 14 dígitos.
- [ ] Un rechazo AFIP estructurado, `success: false`, HTTP no-2xx o mensaje `11002` prevalece sobre `missing-cae` y conserva código/contexto sanitizado.
- [ ] Un 2xx sin CAE devuelve diagnóstico de respuesta sin CAE; nunca habilita persistencia ni impresión.
- [ ] El preflight se ejecuta antes de `createVoucher` con el mismo punto y tipo; `error` o ausencia de `success` bloquean el POST.
- [ ] Factura A/B/C conserva los códigos AFIP 1/6/11 tanto en preflight como en payload.
- [ ] La action devuelve únicamente el contrato canónico y la acción remota es `createVoucher`.
- [ ] `BillButtons` y `BillingModal` consumen el mismo dato canónico; sin CAE no guardan, imprimen ni resetean.
- [ ] El éxito canónico actualiza CAE y persiste una sola vez.
- [ ] El diagnóstico de shape sólo expone rutas, nombres/tipos, status, código sanitizado y contexto: nunca secretos, QR, CAE/CUIT completos.

## Evidencia

- Archivo TDD: `afip-no-cae-response.test.ts`.
- Comando enfocado: `npm run test -- ai/features/afip-no-cae-response/afip-no-cae-response.test.ts`.
- Resultado esperado en esta fase: RED hasta que producción implemente el contrato.
