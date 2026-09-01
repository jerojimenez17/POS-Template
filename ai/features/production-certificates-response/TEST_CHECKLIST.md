# Checklist QA — `production-certificates-response`

## Criterios de aceptación

- [ ] AC-01: Las cinco formas explícitas (`directa`, `data`, `data.data`, `success.data`, `success.data.data`) normalizan y realizan exactamente un `Business.update` sobre el negocio autorizado.
- [ ] AC-02: Respuestas incompletas, inválidas, `success: false`, HTTP no-2xx y JSON inválido realizan cero escrituras.
- [ ] AC-03: `cert` y `key` se validan como strings no vacíos y se persisten cifrados.
- [ ] AC-04: La respuesta pública sólo contiene `{ success: string }` o `{ error: string }`; nunca PEM, key, payload ni registro Prisma.
- [ ] AC-05: Sesión/rol inválidos y ADMIN con `businessId` ajeno no llaman a la Cloud Function ni modifican negocios.
- [ ] AC-06: Tras éxito, el formulario solicita refresh y mantiene el material generado fuera de textareas/estado cliente.
- [ ] AC-07: Logs y errores no contienen secretos ni body crudo del proveedor.
- [ ] AC-08: La frontera de página expone sólo indicadores de presencia y el pegado manual continúa disponible.
- [ ] AC-09: TypeScript y lint permanecen limpios.

## Escenarios positivos

- Respuesta PROD directa con ambos PEM válidos.
- Wrappers `data`, `data.data`, `success.data` y `success.data.data`.
- Persistencia en una única operación, usando el `businessId` autorizado.
- Éxito seguido de `router.refresh()` y mensaje de éxito visible.
- Actualización manual de CERT/KEY sigue siendo posible.

## Escenarios negativos

- `success: false`, sólo `cert`, sólo `key`, `null`, arrays, objetos o campos de tipos incorrectos.
- Strings vacíos o compuestos sólo por espacios/saltos de línea.
- HTTP no-2xx, JSON inválido y timeout.
- Sesión ausente, rol no permitido, negocio inexistente y ADMIN apuntando a otro negocio.
- Fallo de Prisma después de recibir una respuesta válida.

## Edge cases y seguridad

- No recorrer recursivamente payloads ni extraer secretos desde mensajes/texto libre.
- No convertir objetos/arrays a strings.
- Conservar PEM válido sin alterar su contenido salvo normalización contractual.
- No sobrescribir credenciales previas ante cualquier respuesta inválida.
- No registrar contraseña, token, API key, CUIT completo, certificado, llave ni body crudo.
- Verificar invalidación del tag ARCA tras persistencia.

## Errores esperados

- Autorización: `No autorizado`, `No autorizado para modificar otro negocio`.
- Configuración: error genérico de configuración de API/acceso.
- Proveedor HTTP: mensaje con status, sin body sensible.
- Payload inválido/rechazado: error genérico accionable, sin secretos.
- Comunicación/timeout/JSON: `Error al comunicarse con el servidor de certificados`.
- Persistencia: no anunciar éxito; devolver error seguro.

## Evidencia del contrato PROD

- No se encontró en el repositorio una captura, fixture o contrato real seguro de
  la respuesta de `createcertprodhandler`.
- Por esa limitación no se inventa una respuesta PROD: los tests cubren únicamente
  las cinco formas explícitas definidas por SPEC y la evidencia de endpoint se
  realiza con URLs sintéticas no sensibles.
