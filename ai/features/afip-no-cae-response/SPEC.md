# AFIP: respuesta sin CAE al crear comprobantes

## Objetivo

Corregir el flujo de facturación electrónica para que una respuesta exitosa de
la Cloud Function no sea descartada por la ubicación del CAE, sin relajar la
regla de seguridad: una factura sólo puede persistirse e imprimirse cuando se
recibe un CAE válido.

El cambio debe cubrir `createAfipVoucherAction`, `BillButtons` y el contrato de
preflight. No se debe resolver cambiando arbitrariamente A/B/C: el tipo elegido
debe seguir llegando al preflight y a la Cloud Function.

## Hallazgos y causa raíz probable

### Flujo observado

1. `BillButtons` construye un snapshot con `billTypeRef.current` y llama a
   `createAfipVoucherAction`.
2. La action convierte A/B/C a 1/6/11, valida el punto de venta y ejecuta
   `getVoucherNumberAction(ptoVenta, tipoFactura)` antes del POST de creación.
3. Sólo si el preflight devuelve `{ success: number }` se invoca la Cloud
   Function.
4. La action actualmente lee únicamente `response.data.afip.CAE`.
5. `BillButtons` vuelve a interpretar la respuesta con
   `resp.data.afip || resp.data`; otros consumidores (`BillingModal`) asumen
   todavía `resp.data.afip`.
6. La venta sólo se guarda después de que `handleCreateVoucher` devuelve un CAE
   no vacío. Esto debe conservarse.

### Diagnóstico

La causa raíz más probable es un parser demasiado estricto, no que todas las
facturas hayan sido rechazadas por cambiar de tipo. Una respuesta de la Cloud
Function con CAE directo, con `data.afip.CAE`, o con un wrapper de éxito puede
ser válida para la emisión pero hoy se convierte en “AFIP respondió sin CAE”.

No obstante, también debe contemplarse una respuesta real sin CAE. Un HTTP 2xx
no es autorización por sí mismo: si no se encuentra un CAE válido, no se debe
guardar. Si la respuesta contiene un error/rechazo de AFIP, se debe mostrar ese
error y no reemplazarlo por el mensaje genérico.

El cambio de Factura B manual no modifica el resultado cuando el fallo ocurre
después del preflight, en la extracción de `response.data`; A/B/C sólo cambian
el código 1/6/11 y el preflight correspondiente. Si el preflight falla, el
diagnóstico debe identificar explícitamente el tipo y punto enviados.

## Requisitos funcionales

### RF-01: parser único y tipado

Crear un parser/normalizador reutilizable en la capa AFIP. Debe recibir
`unknown`, no usar `any`, y devolver una unión discriminada equivalente a:

```ts
interface AfipVoucherSuccessData {
  cae: string;
  vencimiento: string;
  nroComprobante: number | string;
  qrData: string;
  ptoVenta?: number | string;
  sourcePath: AfipResponsePath;
}

interface AfipVoucherParsedSuccess {
  kind: "success";
  data: AfipVoucherSuccessData;
}

interface AfipVoucherParsedError {
  kind: "afip-error" | "missing-cae";
  message: string;
  code?: string;
  responseShape: AfipResponseShape;
}
```

El nombre exacto puede adaptarse a las convenciones del proyecto, pero la
distinción entre éxito, error AFIP y CAE ausente es obligatoria.

### RF-02: wrappers soportados

El parser debe buscar CAE sólo en rutas explícitamente soportadas, con una
prioridad determinista y sin recorrer campos arbitrarios. Como mínimo debe
aceptar:

- `response.data.afip.CAE` (formato histórico/documentado).
- `response.data.CAE` (CAE directo).
- `response.data.data.afip.CAE`.
- `response.data.data.CAE`.
- Los mismos dos formatos dentro de un wrapper de éxito
  `{ success: true, data: ... }`.

La implementación puede soportar wrappers anidados adicionales si quedan
documentados y testeados, pero no debe aceptar un CAE encontrado dentro de un
mensaje de error, texto libre o campo no definido por el contrato.

Los metadatos asociados (`CAEFchVto`, `nroCbte`/`nroComprobante`, `qrData`)
deben resolverse desde el mismo nivel del comprobante o desde el nivel raíz
del wrapper, manteniendo compatibilidad con las respuestas actuales.

### RF-03: definición de CAE válido

Un candidato sólo es válido si, después de quitar espacios externos, es un
string no vacío con el formato oficial esperado de CAE: 14 dígitos decimales
(`^\\d{14}$`). No se debe aceptar `null`, `undefined`, `""`, whitespace,
objetos, booleanos, mensajes, placeholders ni un identificador no numérico.
El CAE normalizado debe conservarse como string para no perder ceros iniciales.

### RF-04: errores AFIP reales

Antes de devolver `missing-cae`, el parser debe detectar un rechazo/error
estructurado o textual en las formas habituales (`error`, `errors`, `message`,
`afip` con observaciones/rechazo, y wrappers `success: false`). Debe reutilizar
`parseAfipPointSaleError`/`formatAfipPointSaleErrorForUser` cuando corresponda,
conservar códigos como `11002`, y devolver el contexto de operación,
`ptoVenta`, `tipoFactura` y ambiente.

Si una respuesta contiene simultáneamente un CAE válido y un campo informativo
de error no fatal, prevalece el CAE válido; si no contiene CAE, prevalece el
error AFIP sobre “sin CAE”.

### RF-05: contrato de preflight

`getVoucherNumberAction(ptoVenta, tipoFactura)` conserva su contrato:

```ts
interface VoucherNumberResult {
  success?: number;       // último comprobante; habilita creación
  error?: string;         // impide creación
  errorDetails?: AfipPointSaleError;
}
```

La action de creación debe:

- llamar al preflight con el mismo `ptoVenta` y código 1/6/11 que enviará a la
  Cloud Function;
- no llamar a `createVoucher` si hay `error` o falta `success`;
- no tratar cambiar B por A/C (ni volver a B) como reparación de un rechazo del
  mismo punto de venta;
- mostrar un rechazo de preflight (en especial 11002) con su código y contexto,
  sin convertirlo en “respuesta sin CAE”.

### RF-06: contrato de la action

La action debe devolver una respuesta canónica para que el cliente no vuelva a
interpretar wrappers distintos:

```ts
type CreateAfipVoucherResult =
  | { success: true; data: AfipVoucherSuccessData }
  | { error: string | AfipPointSaleError; diagnostic?: AfipResponseDiagnostic };
```

No debe devolver éxito si falta un CAE válido. Tampoco debe persistir la orden:
la persistencia sigue siendo responsabilidad posterior de `BillButtons` (o del
flujo de edición) y sólo se ejecuta después de obtener `data.cae`.

Para compatibilidad, los consumidores que aún necesiten el formato histórico
pueden recibir un adaptador canónico, pero no deben volver a hacer lecturas
directas opcionales como `resp.data.afip || resp.data`.

### RF-07: `BillButtons` y demás consumidores

`handleCreateVoucher` debe consumir únicamente el dato canónico, construir el
modelo `CAE` y mantener las siguientes garantías:

- CAE vacío o inválido: toast diagnóstico, retorno `null`, no llama a
  `processSaleAction`, no imprime y no resetea el carrito.
- CAE válido: actualiza el contexto, guarda la venta y permite imprimir.
- Error AFIP/preflight: muestra el mensaje/código devuelto por la action, sin
  mostrar un JSON crudo ni un “sin CAE” engañoso.

El flujo de `BillingModal` debe migrarse al mismo contrato para no conservar un
segundo parser estricto.

### RF-08: diagnóstico seguro

En servidor se debe registrar una forma de respuesta, nunca el payload
completo. El diagnóstico debe incluir solamente información no sensible, por
ejemplo:

- HTTP status (si está disponible);
- rutas de wrapper presentes (`direct`, `afip`, `data`, `data.afip`);
- nombres de campos y tipos (`string`, `number`, `object`, `array`);
- ruta candidata encontrada y si pasó/falló la validación;
- código de error AFIP sanitizado y contexto de punto/tipo/ambiente.

Nunca registrar ni devolver certificados, claves, access tokens, API keys,
CUIT completo, QR, CAE completo u otros valores de la respuesta. El log debe
usar una función de redacción existente o equivalente y limitar tamaños para
evitar volcar mensajes sensibles.

El diagnóstico al usuario debe diferenciar al menos:

- `AFIP rechazó la operación: ...` (error real, con código si existe);
- `La Cloud Function respondió sin un CAE válido ...` (respuesta sin CAE),
  incluyendo rutas observadas y sugiriendo revisar logs/configuración, pero sin
  exponer secretos.

## Archivos afectados / previstos

- `src/actions/afip.ts`: integrar el parser, errores diferenciados, log seguro y
  respuesta canónica; conservar preflight y bloqueo de persistencia.
- `src/components/Billing/BillButtons.tsx`: consumir el contrato canónico,
  impedir guardado/impresión sin CAE y mostrar diagnóstico útil.
- `src/components/Billing/BillingModal.tsx`: eliminar lectura directa de
  `resp.data.afip` y usar el mismo resultado normalizado.
- `src/services/afip/` (nuevo módulo de parser/contratos, si es necesario):
  centralizar rutas soportadas, validación y shape logging.
- `src/models/CAE.ts`: sólo si el contrato canónico requiere ajustar nombres o
  tipos; no cambiar la semántica de persistencia.
- `tests/actions/afip-voucher.test.ts`: ampliar respuestas de Cloud Function y
  no-persistencia.
- `tests/components/BillButtons.test.tsx` y/o una prueba co-localizada del
  parser: cubrir la integración de UI.
- `ai/features/afip-point-sale-validation/afip-preflight.test.ts`: conservar y
  ampliar las garantías de tipo/punto y errores 11002.

No se requieren cambios de Prisma ni migraciones: el campo `Order.CAE` ya es
JSON y sólo debe recibir el CAE canónico validado.

## Matriz de pruebas requerida (para la fase QA; no implementar en esta fase)

1. CAE válido directo: `{ CAE: "12345678901234" }` => éxito.
2. CAE válido en `afip` => éxito.
3. CAE válido en `data` y en `data.afip` => éxito.
4. Cada caso anterior dentro de `{ success: true, data: ... }` => éxito.
5. CAE whitespace, vacío, `null`, objeto, booleano, 13/15 dígitos o texto =>
   `missing-cae`, sin persistencia.
6. Error `success: false`, error AFIP anidado, mensaje con código 11002 y
   respuesta HTTP no-2xx => error AFIP conservado, no `missing-cae` genérico.
7. Respuesta 2xx `{ success: true }` sin CAE => diagnóstico de respuesta sin
   CAE, sin persistencia ni impresión.
8. Preflight `{ success: 10 }` => POST de creación; preflight con `error` o sin
   `success` => ningún POST.
9. A/B/C => preflight y payload usan respectivamente 1/6/11; cambiar el tipo
   no oculta un fallo de parser ni repara 11002.
10. Los logs no contienen cert, key, token, API key, QR, CAE completo ni CUIT
    completo, y sí contienen forma/rutas y contexto diagnóstico.
11. En `BillButtons`, éxito canónico actualiza CAE y guarda una sola vez; todo
    resultado no autorizado evita `processSaleAction`, `handlePrint` y reset.
12. `BillingModal` y `BillButtons` producen el mismo resultado para cada forma
    de respuesta soportada.

## Criterios de aceptación medibles

- 100% de las seis rutas de éxito documentadas con CAE válido son aceptadas.
- 0 respuestas sin CAE válido llegan a `processSaleAction`, persistencia o
  impresión.
- 100% de los errores AFIP con código/mensaje reconocible conservan ese código
  o mensaje en el resultado mostrado al usuario.
- 100% de las llamadas de creación verifican antes el resultado de preflight y
  reutilizan exactamente el mismo punto y código de tipo.
- Los tests cubren como mínimo los 12 escenarios de la matriz y pasan sin
  secretos reales.
- Una revisión de logs confirma que ningún valor sensible enumerado en RF-08
  aparece completo.

## Fuera de alcance

- Cambiar credenciales, certificados, puntos de venta o configuración de ARCA.
- Reintentar automáticamente una emisión que pudo haber sido aceptada.
- Cambiar reglas fiscales o la selección de A/B/C.
- Modificar el esquema Prisma o guardar comprobantes sin autorización verificable.
