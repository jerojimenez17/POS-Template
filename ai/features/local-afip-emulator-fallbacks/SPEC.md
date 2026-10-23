# Fallbacks locales para el emulador AFIP/ARCA

## Estado y alcance

- **Estado:** especificación arquitectónica; esta entrega no incluye implementación ni tests.
- **Alcance:** cambiar exclusivamente los dos literales fallback de URL usados por el POS, para que cuando sus variables de entorno no estén definidas apunten al emulador local del proyecto `D:\Documents\Jero\stock-ia-function`.
- **Compatibilidad:** cualquier valor explícito no vacío de las variables de entorno debe conservar precedencia sobre el fallback, sin cambiar la semántica existente.
- **Fuera de alcance:** cambios en el proyecto Cloud Function, autenticación o `x-internal-key`, CORS, credenciales, datos/payload de factura, validaciones, lógica de numeración o emisión, respuestas y errores, y cualquier otra URL o variable de entorno.

## Análisis del comportamiento actual

### `src/lib/server/afip-voucher.ts`

`prepareAfipVoucherForActor` lee `NEXT_PUBLIC_AFIP_FUNCTION_URL` y, si su valor es falsy, guarda un fallback en el payload preparado. `issuePreparedAfipVoucher` usa después esa URL en `axios.post` para la solicitud `createVoucher`. El valor queda resuelto al preparar la operación; por tanto, las pruebas de transporte deben configurar o retirar la variable antes de llamar a `prepareAfipVoucherForActor`.

Fallback actual:

```text
http://localhost:5001/stockia-e90c6/us-central1/createAFIPVoucher
```

Fallback requerido:

```text
http://127.0.0.1:5001/stockia-e90c6/us-central1/createAFIPVoucher
```

### `src/lib/server/arca-billing.ts`

`getVoucherNumberForActor` obtiene la URL de `NEXT_PUBLIC_GET_LAST_VOUCHER_URL` y la utiliza como destino del `fetch` POST que consulta `getLastVoucher`. Si la variable es falsy, usa actualmente una URL de Cloud Run.

Fallback actual:

```text
https://getlastvoucherhandler-ixjqmm6mlq-uc.a.run.app
```

Fallback requerido:

```text
http://127.0.0.1:5001/stockia-e90c6/us-central1/getLastVoucherHandler
```

La validación de URL de `preflightCreditNoteBillingConfiguration` considera válido que estas variables no estén configuradas; este contrato debe mantenerse. No es necesario ni está permitido modificar esa validación para cambiar los defaults.

## Decisión arquitectónica

Modificar únicamente el literal fallback de cada expresión existente:

| Variable | Literal fallback requerido |
|---|---|
| `NEXT_PUBLIC_AFIP_FUNCTION_URL` | `http://127.0.0.1:5001/stockia-e90c6/us-central1/createAFIPVoucher` |
| `NEXT_PUBLIC_GET_LAST_VOUCHER_URL` | `http://127.0.0.1:5001/stockia-e90c6/us-central1/getLastVoucherHandler` |

Conservar las expresiones de precedencia por variable de entorno y los sitios donde las URLs se resuelven y consumen. Un override configurado debe seguir utilizándose exactamente como está configurado. El fallback sólo entra en juego cuando el valor de entorno es falsy, como ocurre actualmente con una variable ausente o vacía; no cambiar esa semántica en esta feature.

## Requisitos funcionales

### R1. Destino de creación de comprobantes

- Cuando `NEXT_PUBLIC_AFIP_FUNCTION_URL` no está definida, `issuePreparedAfipVoucher` debe enviar la solicitud existente a `http://127.0.0.1:5001/stockia-e90c6/us-central1/createAFIPVoucher`.
- Cuando la variable contiene un override no vacío, debe enviarla a ese override exacto.
- La resolución de la URL debe seguir ocurriendo durante la preparación de la operación, como hoy.

### R2. Destino de consulta del último comprobante

- Cuando `NEXT_PUBLIC_GET_LAST_VOUCHER_URL` no está definida, `getVoucherNumberForActor` debe enviar la solicitud existente a `http://127.0.0.1:5001/stockia-e90c6/us-central1/getLastVoucherHandler`.
- Cuando la variable contiene un override no vacío, debe enviarla a ese override exacto.
- El método HTTP, headers, cuerpo, autenticación y manejo de la respuesta deben permanecer sin cambios.

### R3. Sin cambios colaterales

- La única modificación de producción permitida en cada archivo objetivo es sustituir su literal fallback correspondiente.
- No cambiar comportamiento, contratos ni configuración ajenos a la selección del fallback de esas dos URLs.
- No editar ni requerir cambios en `D:\Documents\Jero\stock-ia-function`.
- No agregar dependencias, variables de entorno ni configuración adicional.

## Pruebas especificadas

Agregar pruebas de transporte totalmente aisladas que capturen el destino solicitado:

1. **Creación, sin variable:** retirar `NEXT_PUBLIC_AFIP_FUNCTION_URL`, preparar e emitir una factura con los colaboradores de autorización, credenciales, numeración y transporte mockeados; afirmar que el primer argumento de `axios.post` es el fallback requerido de `createAFIPVoucher`.
2. **Creación, con override:** establecer un override no vacío, ejecutar el mismo flujo mockeado y afirmar que `axios.post` recibe ese valor exacto.
3. **Consulta, sin variable:** retirar `NEXT_PUBLIC_GET_LAST_VOUCHER_URL`, mockear Prisma y reemplazar/mockear `fetch`; afirmar que el destino de `fetch` es el fallback requerido de `getLastVoucherHandler`.
4. **Consulta, con override:** establecer un override no vacío, ejecutar la consulta mockeada y afirmar que `fetch` recibe ese valor exacto.

Los mocks deben impedir cualquier conexión HTTP real. Las pruebas deben restaurar las variables de entorno y mocks después de cada caso para evitar contaminación entre escenarios. Se permiten respuestas HTTP exitosas sintéticas para completar los flujos; no se requiere contactar al emulador.

## Archivos previstos

### Cambios de implementación futuros

- `src/lib/server/afip-voucher.ts`: reemplazar sólo el literal fallback de `NEXT_PUBLIC_AFIP_FUNCTION_URL`.
- `src/lib/server/arca-billing.ts`: reemplazar sólo el literal fallback de `NEXT_PUBLIC_GET_LAST_VOUCHER_URL`.

### Pruebas futuras

- Agregar o ampliar pruebas de transporte de AFIP/ARCA para cubrir los cuatro casos especificados (fallback y override para ambos endpoints), siguiendo los mocks y patrones de pruebas existentes.

### Sin cambios

- `D:\Documents\Jero\stock-ia-function` y cualquier Cloud Function.
- `prisma/schema.prisma`, migraciones, autenticación, secretos y credenciales.
- `src/lib/server/arca-billing.ts` fuera del fallback de la URL de consulta.
- `src/lib/server/afip-voucher.ts` fuera del fallback de la URL de emisión.
- Otras URLs, payloads, headers, métodos, algoritmos y lógica de negocio.

## Criterios de aceptación medibles

- **AC-01:** sin `NEXT_PUBLIC_AFIP_FUNCTION_URL`, la llamada mockeada a `axios.post` recibe exactamente `http://127.0.0.1:5001/stockia-e90c6/us-central1/createAFIPVoucher`.
- **AC-02:** con un override no vacío de `NEXT_PUBLIC_AFIP_FUNCTION_URL`, la llamada mockeada a `axios.post` recibe exactamente el override, no el fallback.
- **AC-03:** sin `NEXT_PUBLIC_GET_LAST_VOUCHER_URL`, la llamada mockeada a `fetch` recibe exactamente `http://127.0.0.1:5001/stockia-e90c6/us-central1/getLastVoucherHandler`.
- **AC-04:** con un override no vacío de `NEXT_PUBLIC_GET_LAST_VOUCHER_URL`, la llamada mockeada a `fetch` recibe exactamente el override, no el fallback.
- **AC-05:** los cuatro escenarios de URL se verifican sin realizar solicitudes HTTP reales.
- **AC-06:** las variables configuradas mantienen precedencia y se conserva el comportamiento existente para valores falsy.
- **AC-07:** en producción sólo cambian los dos literales fallback indicados; los flujos mantienen los mismos métodos, headers, cuerpos, credenciales, errores y resultados.
- **AC-08:** no hay cambios en la Cloud Function, auth/internal-key, CORS, datos de factura, lógica de emisión ni otras URLs.

## Verificación para Developer/QA

1. Confirmar en diff que cada archivo productivo sólo cambia el literal de fallback correspondiente.
2. Ejecutar los cuatro casos de test especificados con transporte y dependencias mockeados; asegurar que las variables se limpian entre casos.
3. Ejecutar lint y typecheck disponibles en el proyecto. No usar una prueba manual que dependa de HTTP real para satisfacer los criterios de URL.
