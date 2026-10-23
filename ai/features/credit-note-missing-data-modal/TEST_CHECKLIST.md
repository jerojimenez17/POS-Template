# Gate G2 — checklist TDD: `credit-note-missing-data-modal`

## Normalización y diagnóstico

- [ ] CAE válido + `billType` ausente diagnostica sólo `billType` y `canCompleteFromUser: true`.
- [ ] CAE válido nunca genera `missingFields: ["CAE"]`.
- [ ] Se diagnostican punto, número y combinaciones permitidas sin defaults.
- [ ] Código 1/6/11 deriva A/B/C; incompatibilidades, inválidos y conflictos bloquean.
- [ ] CAE faltante, placeholder, URL, QR, alfanumérico o longitud distinta de 14 no es recuperable.
- [ ] Venta manual sin señal fiscal permanece `NON_FISCAL` y silenciosa.

## DTO y presentación

- [ ] Mapper genera DTO serializable con `orderId`, `missingFields`, `known`, total, productos y estado.
- [ ] DTO no expone CAE crudo, QR, secretos, JSON Prisma ni datos innecesarios.
- [ ] Aviso recuperable lista sólo faltantes, explica que CAE no se completa y ofrece CTA.
- [ ] Avisos no recuperables no abren modal ni permiten override.
- [ ] Modal Radix es accesible, tiene foco/escape, labels/descripción y campos exactamente dinámicos.
- [ ] Tipo cerrado A/B/C; punto/número son enteros positivos; errores inline sin eco peligroso.
- [ ] Cancelar, cerrar o recargar no llama action ni produce efectos.
- [ ] Caso principal pide tipo y no CAE.

## Server Action y persistencia

- [ ] Schema envelope y `missingFiscalData` son estrictos; valida antes de auth/DB/AFIP.
- [ ] Cliente no puede enviar autoridad en CAE, total, items, cliente, negocio o elegibilidad.
- [ ] Relectura Prisma usa `id + businessId` de sesión.
- [ ] Merge da precedencia a persistido y rechaza override/conflicto.
- [ ] Revalida CAE, tipo/código, número/punto, total e items antes de reservar o llamar AFIP.
- [ ] Snapshot `SaleReturn`, `CbtesAsoc` y `billState` usan el mismo resultado resuelto.
- [ ] PENDING/AUTHORIZED/idempotencia/carreras no duplican AFIP ni efectos locales.
- [ ] CAE inválido, contenido manipulado, cliente/negocio ajeno y punto no permitido no llaman AFIP.

## Resultado esperado

La suite nueva debe ser RED contra la base previa y pasar a GREEN sólo con la implementación de producción. Gate **G2: pendiente**, condicionado a que todos estos checks pasen y no se agreguen dependencias ni migraciones.
