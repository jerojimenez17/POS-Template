# Persistencia de la respuesta de certificados PROD

## Estado y alcance

- **Estado:** especificación arquitectónica; no incluye implementación ni tests.
- **Alcance:** generación de certificados de producción iniciada desde
  `src/app/admin/settings/page.tsx`, a través de `ArcaForm`, la Server Action
  `generateCertsAction`, la respuesta HTTP de la Cloud Function y la
  persistencia de `Business.cert`/`Business.key`.
- **Fuera de alcance:** cambios en Prisma, creación de certificados en ARCA,
  cambios del flujo DEV, emisión de comprobantes, rotación de credenciales de
  ARCA o rediseño visual del formulario.

## Diagnóstico y causa raíz

### Flujo observado

1. La página valida la sesión, obtiene `getBusinessArcaData` y pasa a
   `ArcaForm` sólo indicadores de presencia (`"CONFIGURADO"`), nunca el PEM ni
   la llave privada.
2. `ArcaForm.handleGenerate` llama a `generateCertsAction` con el modo, CUIT,
   usuario, contraseña, alias y `businessId`. No llama a
   `updateBusinessArcaData` después de generar.
3. `generateCertsAction` autentica/autoriza, llama por `fetch` a una URL distinta
   para DEV/PROD y analiza únicamente estas formas:
   `result.data.cert` + `result.data.key`, o `result.cert` + `result.key`.
4. Si encuentra ambas propiedades, cifra cada valor en el servidor y actualiza
   `Business.cert` y `Business.key`; entonces devuelve sólo un mensaje de éxito.
5. Si no las encuentra, devuelve error. El cliente muestra ese error aunque la
   Cloud Function haya creado el certificado.

### Causa raíz

El contrato de respuesta no está normalizado ni validado. El parser actual
asume que `data` es directamente el objeto de certificados o que los campos
están en la raíz. Una respuesta PROD con un wrapper adicional (por ejemplo,
`{ data: { success: true, data: { cert, key } } }`, o el equivalente de un
wrapper de API que contenga `data.cert` y `data.key`) deja los campos fuera de
las dos rutas comprobadas. En ese caso `generated` es `undefined`, no se
ejecuta `db.business.update` y el cliente recibe el error genérico.

La causa debe confirmarse contra una captura segura de la respuesta PROD: el
repositorio no contiene un fixture ni un contrato formal de la Cloud Function.
La solución debe soportar sólo las formas documentadas, no buscar
recursivamente cualquier propiedad ni imprimir el payload.

Existe además un problema secundario de UX: después de guardar correctamente,
`ArcaForm` cierra el diálogo pero `initialData` es una prop del render anterior;
los indicadores pueden continuar mostrando el estado anterior hasta que se
refresque la página. Esto no debe resolverse enviando PEM/key al cliente.

## Decisión arquitectónica

Introducir un normalizador server-side, tipado sobre `unknown`, para aceptar un
conjunto pequeño y explícito de wrappers de certificados. La action debe
validar la respuesta antes de cifrarla, exigir dos strings no vacíos y persistir
ambos valores en una única actualización de `Business`. El éxito de la action
seguirá siendo `{ success: string }`, sin devolver `cert` ni `key` al Client
Component.

Tras un éxito, `ArcaForm` debe solicitar un refresh del segmento/página para
que `page.tsx` vuelva a consultar únicamente la presencia de las credenciales.
No debe copiar los secretos a los campos del formulario ni a estado, toast,
logs, URL o respuesta serializada.

## Requisitos funcionales

### RF-01. Contrato de respuesta aceptado

El normalizador debe aceptar, como mínimo, estas formas equivalentes cuando
`cert` y `key` son strings no vacíos:

```ts
{ cert, key }
{ data: { cert, key } }
{ data: { data: { cert, key } } }
{ success: true, data: { cert, key } }
{ success: true, data: { data: { cert, key } } }
```

Si el proveedor confirma mediante una captura que PROD usa otra forma fija,
ésta podrá agregarse al conjunto explícito y deberá documentarse. No se debe
aceptar un valor encontrado por recorrido recursivo, dentro de un mensaje de
error, dentro de texto libre, ni una respuesta `success: false`.

### RF-02. Validación y normalización

- La respuesta de `fetch().json()` se tratará como `unknown`.
- Validar con Zod o type guards equivalentes, sin `any`.
- `cert` y `key` deben ser strings y, tras `trim`, no estar vacíos.
- No convertir objetos, arrays, booleanos o mensajes a strings para intentar
  persistirlos.
- Los valores PEM se pueden conservar sin alterar su contenido salvo la
  normalización mínima definida para el contrato; deben cifrarse inmediatamente
  antes de la escritura.

### RF-03. Persistencia atómica y destino correcto

- Verificar la sesión y el rol en la action como actualmente; un ADMIN sólo
  puede modificar `session.user.businessId`.
- Usar el `targetBusinessId` autorizado, nunca un id tomado de la respuesta
  externa.
- Persistir `cert: encrypt(cert)` y `key: encrypt(key)` en la misma operación
  `db.business.update`.
- No borrar ni sobrescribir una credencial existente si la respuesta es
  incompleta o inválida.
- Una actualización exitosa debe invalidar/refrescar el tag ARCA existente si
  ese tag se usa para la lectura correspondiente.

### RF-04. Contrato hacia el cliente

La action debe conservar una respuesta mínima compatible:

```ts
interface GenerateCertificatesResult {
  success?: string;
  error?: string;
}
```

En éxito debe devolver el mensaje sólo después de completar la escritura. No
debe devolver el material de certificado, la llave, el payload de ARCA,
credenciales de acceso, URL secreta ni el registro Prisma.

### RF-05. Formulario y página

- `ArcaForm` debe conservar el manejo de error, estado de carga y prevención de
  doble envío.
- Después de `result.success`, debe refrescar los datos de servidor sin incluir
  PEM/key en el cliente; el diálogo puede cerrarse y debe mostrarse el éxito.
- `page.tsx` debe seguir construyendo `initialData` sólo con presencia:
  `business.cert ? "CONFIGURADO" : ""` y equivalente para `key`.
- No se deben precargar certificados cifrados en `Textarea`, ni usar el formulario
  manual como segunda persistencia de la generación.

### RF-06. Errores seguros y observabilidad

Distinguir al menos:

- HTTP no exitoso de la Cloud Function;
- JSON inválido o respuesta sin la forma esperada;
- respuesta con error/rechazo del proveedor;
- respuesta con sólo `cert`, sólo `key`, o valores vacíos;
- negocio inexistente, no autorizado o fallo de base de datos.

Los logs pueden registrar status HTTP, modo, rutas/keys y tipos de la forma de
respuesta, pero nunca valores. Se deben aplicar redacciones existentes y un
límite de tamaño. Nunca registrar cert, key, contraseña, access token, API key,
CUIT completo ni el body crudo. El mensaje al usuario debe ser accionable pero
genérico respecto de secretos.

## Interfaces y datos implicados

- `GenerateCertificatesResult`: contrato mínimo de la action hacia `ArcaForm`.
- `GeneratedCertificates`: tipo server-only interno `{ cert: string; key: string }`.
- Entrada actual de `generateCertsAction`:
  `(type: "dev" | "prod", cuit: string, username: string, password: string,
  alias: string, businessId?: string)`.
- Respuesta externa: `unknown`, normalizada sólo por rutas explícitas.
- `Business.cert` y `Business.key`: columnas `String? @db.Text`, almacenadas
  cifradas; no requieren migración.
- `ArcaData`: DTO de lectura que expone sólo `"CONFIGURADO" | null`.
- `ArcaFieldsSchema`: mantiene `cert`/`key` opcionales para pegado manual; la
  generación automática no debe pasar por esos campos.

## Archivos a modificar

### Obligatorios

- `src/actions/generate-certs.ts`: validar entrada/respuesta, normalizar los
  wrappers PROD/compatibles, cifrar y persistir sólo en servidor, invalidar
  caché y devolver resultado seguro.
- `src/components/Superadmin/arca-form.tsx`: refrescar la página/segmento tras
  éxito y conservar los secretos fuera del estado/render del cliente.

### A revisar, sin cambio salvo necesidad

- `src/app/admin/settings/page.tsx`: confirmar que la frontera Server
  Component→Client Component sólo transporte indicadores de presencia.
- `src/actions/arca.ts`: confirmar autorización, DTO de presencia y lectura de
  credenciales cifradas para billing; no devolver material secreto.
- `src/schemas/index.ts`: agregar schemas reutilizables sólo si se decide
  centralizar la validación de la respuesta; no relajar `ArcaFieldsSchema`.
- `src/models/Arca.ts`: actualizar únicamente si el tipo del resultado público
  cambia; preferentemente no cambiarlo.
- `src/lib/encryption.ts`: no modificar como parte de este fix; revisar por
  separado la configuración obligatoria de `ARCA_ENCRYPTION_KEY`.

### Sin cambios

- `prisma/schema.prisma` y migraciones.
- `src/actions/afip.ts`, `voucher.ts` y el flujo de emisión.
- URLs o secretos en configuración. Las credenciales presentes en archivos de
  entorno deben gestionarse/rotarse fuera de este cambio si fueron expuestas.

## Escenarios de error requeridos

1. Respuesta PROD directa con ambos campos: cifra, persiste ambos y devuelve
   éxito.
2. Respuesta PROD con wrapper `data` o `data.data`: produce el mismo resultado.
3. HTTP 2xx con `success: false`: no escribe y muestra error seguro.
4. HTTP 2xx con sólo `cert`, sólo `key`, vacío, `null`, objeto o array: no
   escribe y conserva credenciales anteriores.
5. HTTP no-2xx: no escribe; log acotado y mensaje sin body crudo.
6. JSON inválido o timeout: no escribe y devuelve error de comunicación.
7. `businessId` ajeno, sesión ausente o rol inválido: no llama al proveedor ni
   escribe.
8. Error de Prisma después de recibir respuesta válida: devuelve error, no
   anuncia éxito; no se envían secretos al cliente.
9. Éxito seguido de refresh: la página muestra ambos indicadores como
   configurados sin revelar contenido.

## Criterios de aceptación medibles

- **AC-01:** 100% de las formas de respuesta explícitas documentadas con `cert`
  y `key` válidos provocan exactamente una actualización del negocio objetivo.
- **AC-02:** Una respuesta incompleta, inválida, `success: false`, no-2xx o JSON
  inválido provoca cero escrituras en `Business`.
- **AC-03:** Tras una respuesta válida, `Business.cert` y `Business.key` quedan
  presentes y cifrados; ningún valor almacenado coincide con el PEM/key plano.
- **AC-04:** El cliente recibe sólo `{ success: string }` o `{ error: string }`;
  una búsqueda de `cert`/`key` material en el retorno de la action no existe.
- **AC-05:** En 100% de los casos de autorización inválida no se invoca la
  Cloud Function ni se modifica ningún negocio.
- **AC-06:** Tras éxito, el formulario muestra éxito y, después del refresh,
  ambos indicadores muestran `Configurado`; ningún textarea contiene material
  generado automáticamente.
- **AC-07:** Ningún log, error de UI o diagnóstico contiene certificado, llave,
  contraseña, token, API key, CUIT completo o body crudo.
- **AC-08:** No se modifica el esquema Prisma, no se expone material a
  `page.tsx`/`ArcaData`, y el flujo manual de pegado sigue funcionando.
- **AC-09:** Lint y TypeScript permanecen limpios y la respuesta PROD real queda
  cubierta por una evidencia segura de su forma (fixture redactado o contrato
  documentado), sin secretos reales.

## Ambigüedades y decisiones pendientes

1. No hay en el repositorio una muestra de la respuesta real de
   `createcertprodhandler`; se debe confirmar si el wrapper real es
   `data.data`, otro nivel de `data`, o una forma distinta antes de cerrar el
   parser.
2. No está definido si `success: true` es obligatorio en PROD o si basta la
   presencia de ambos campos; el parser debe aceptar las formas explícitas
   anteriores, pero el contrato con el proveedor debe fijar una forma
   canónica.
3. Debe confirmarse si `revalidateTag(CACHE_TAGS.ARCA, "max")` cubre la lectura
   actual; el refresh del formulario es la garantía mínima visible y no debe
   sustituirse por exponer secretos.
4. El archivo de entorno contiene configuración sensible; su rotación y la
   eliminación de secretos del control de versiones son tareas operativas
   separadas, aunque obligatorias si esos valores fueron compartidos.
