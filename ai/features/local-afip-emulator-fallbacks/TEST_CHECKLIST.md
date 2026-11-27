# QA checklist — fallbacks locales del emulador AFIP/ARCA

Fuente de requisitos: [`SPEC.md`](./SPEC.md). Esta etapa agrega únicamente pruebas y checklist; no modifica código productivo.

## Resultados QA

- [x] Los cuatro tests dirigidos pasan (4/4): fallback y override para cada transporte.
- [x] Los tests usan mocks y no realizan solicitudes HTTP reales.
- [x] Las variables de entorno y los mocks/globales se limpian después de cada caso.
- [x] La URL de emisión se resuelve durante `prepareAfipVoucherForActor`, antes de llamar a `issuePreparedAfipVoucher`.
- [x] El repositorio de Cloud Function permanece sin cambios.
- [ ] `npm run test` (suite completa): pendiente/incompleto; expiró al alcanzar 180 s, por lo que no hay resultado fiable de la suite completa.
- [ ] Lint: no validado; expiró por timeout.
- [ ] Typecheck: no validado; expiró por timeout.

## Transporte de emisión `createAFIPVoucher`

- [x] Sin `NEXT_PUBLIC_AFIP_FUNCTION_URL`, retirar la variable antes de preparar la operación y comprobar que `issuePreparedAfipVoucher` llama a `axios.post` exactamente con `http://127.0.0.1:5001/stockia-e90c6/us-central1/createAFIPVoucher`.
- [x] Con un override no vacío, comprobar que `axios.post` recibe ese valor exacto.
- [x] Mantener los mocks de autorización, credenciales, numeración y Axios para impedir tráfico HTTP real; usar respuesta sintética exitosa.
- [x] La URL se fija durante `prepareAfipVoucherForActor`, antes de ejecutar `issuePreparedAfipVoucher`.

## Transporte de consulta `getLastVoucher`

- [x] Sin `NEXT_PUBLIC_GET_LAST_VOUCHER_URL`, retirar la variable antes de consultar y comprobar que `getVoucherNumberForActor` llama a `fetch` exactamente con `http://127.0.0.1:5001/stockia-e90c6/us-central1/getLastVoucherHandler`.
- [x] Con un override no vacío, comprobar que `fetch` recibe ese valor exacto.
- [x] Mockear Prisma y `fetch`, completar el flujo con una respuesta JSON exitosa sintética y no realizar HTTP real.

## Aislamiento y alcance

- [x] Restaurar variables de entorno y mocks/globales después de cada caso.
- [x] Verificar cuatro escenarios: fallback y override para cada transporte.
- [ ] Conservar sin cambios métodos, headers, payloads, autenticación, credenciales, validaciones y lógica de negocio.

## Archivos de pruebas

- `afip-voucher-transport.test.ts`: fallback y override de emisión en el límite `axios.post`.
- `arca-billing-transport.test.ts`: fallback y override de consulta en el límite `fetch`.
