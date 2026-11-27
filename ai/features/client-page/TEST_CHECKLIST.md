# Test checklist — client page

Contrato: `SPEC.md`. Los tests son deliberadamente RED hasta que exista la implementación.

## Acciones, seguridad y datos

- [ ] Sesión ausente o sin `businessId` devuelve `UNAUTHORIZED` y no consulta DB.
- [ ] `getClients` filtra exactamente por el negocio de sesión, ordena por nombre y selecciona los campos requeridos, incluidos fechas y saldo.
- [ ] Alta válida crea una fila con `businessId` de sesión y `balance: 0`; no acepta saldo, órdenes, fechas ni `businessId` del payload.
- [ ] Nombre vacío, email inválido, IVA no soportado y límites excedidos devuelven `VALIDATION` en español sin escribir.
- [ ] Edición autoriza por `(id, businessId)`, actualiza sólo campos editables y cambia `last_update`.
- [ ] Edición/eliminación de ID ajeno, inexistente o ya eliminado es controlada (`NOT_FOUND`/`FORBIDDEN`).
- [ ] Borrado sin órdenes elimina una única fila; borrado con órdenes devuelve `CONFLICT` y conserva cliente, órdenes y saldo.
- [ ] `updateClientBalance` rechaza sesión ausente y cliente de otro negocio; sólo modifica el saldo propio.
- [ ] Errores DB no exponen SQL, stack trace, email, CUIT, teléfono ni payload sensible.

## API y regresión

- [ ] `GET /api/clients` devuelve 401 sin sesión.
- [ ] `GET /api/clients` devuelve `{ clients: [] }` para negocio vacío y nunca mezcla negocios.
- [ ] `ClientSelectionModal` conserva selección, alta y consumo de la forma de respuesta existente.

## Componentes y UX

- [ ] `/clients` exige sesión y negocio y muestra nombre, teléfono, dirección, CUIT, IVA, email y saldo.
- [ ] Estado vacío tiene CTA de alta; también existen loading, error, éxito y eliminación.
- [ ] Búsqueda local filtra nombre, teléfono, email y CUIT sin consultar otro negocio.
- [ ] Alta y edición muestran formularios prellenados, validan y preservan datos ante error.
- [ ] Editar/eliminar son accesibles; mutaciones deshabilitan controles; cancelar confirmación no llama la acción.
- [ ] Confirmación de borrado nombra al cliente y el conflicto conserva la fila.
- [ ] La lista es usable en móvil sin desbordamiento horizontal.
- [ ] RootMenu muestra `Clientes` con enlace absoluto `/clients`, sin businessId/slug controlado por navegador.

## Gate G2

- [ ] Los archivos de prueba existen dentro de `ai/features/client-page/`.
- [ ] `npx tsc --noEmit` compila tests (los fallos esperados son de comportamiento/módulos ausentes, no de sintaxis).
- [ ] `npx vitest run ai/features/client-page` ejecuta la especificación y deja evidencia RED antes del desarrollo.
- [ ] Suite existente de `ClientSelectionModal` permanece como regresión.
