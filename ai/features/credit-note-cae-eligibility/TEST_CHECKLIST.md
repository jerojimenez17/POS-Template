# QA checklist — credit-note-cae-eligibility (Gate G2)

- [ ] Histórico `Order.CAE` como objeto y JSON serializado; claves `CAE`/`cae`.
- [ ] `qrData` auxiliar permitido, pero QR payload, URL, placeholder, alfanumérico y CAE de longitud incorrecta rechazados.
- [ ] Aliases `invoiceNumber`/`nroComprobante`/`number` y `invoicePointOfSale`/`ptoVenta`/`pointOfSale`, en columnas, JSON y distribuidos.
- [ ] Facturas A/B/C aceptan únicamente códigos AFIP compatibles 1/6/11; Nota A/B/C conserva 3/8/13.
- [ ] Tipo ausente reproduce el diagnóstico: CAE señalado, CAE inválido para elegibilidad, número/punto presentes y tipo/código ausentes; no hay botón ni AFIP.
- [ ] Conflictos de CAE, tipo, código, número o punto no se resuelven silenciosamente.
- [ ] Mapper produce `fiscalContext` sólo en `VALID`, diagnóstico serializable correcto para inválido/incompleto y nunca expone JSON/`qrData`.
- [ ] `CreditNoteButton` aparece sólo con `eligibleForFullCreditNote === true`; autorizado no permite segunda emisión y pendiente conserva estado.
- [ ] Boundary server-side vuelve a leer Prisma y devuelve `NOT_ELIGIBLE` antes de reservar devolución o invocar AFIP, incluso con payload cliente manipulado.
- [ ] Venta manual/sin CAE permanece silenciosa; devoluciones pendiente, autorizada y rechazada conservan su política.
- [ ] Ejecutar `npm run test -- ai/features/credit-note-cae-eligibility` y confirmar suite RED antes del arreglo de producción.

**Gate G2:** pendiente. Esta entrega sólo agrega especificación ejecutable y checklist; no modifica producción. Se considera satisfecho cuando estos tests pasan tras el arreglo, sin dependencias nuevas ni cambios de Prisma.
