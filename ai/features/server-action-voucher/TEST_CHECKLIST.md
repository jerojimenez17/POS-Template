# Checklist QA — Server Action de numeración de comprobantes

Pruebas TDD estáticas para la frontera Next.js y la migración del parser AFIP.
Esta entrega agrega únicamente pruebas y checklist; no modifica producción ni `SPEC.md`.

## Criterios de aceptación

- [ ] **AC-01:** `src/actions/voucher.ts` comienza con una única directiva de módulo `"use server"`.
- [ ] **AC-02:** `getVoucherNumberAction` conserva exportación nombrada, parámetros `(number, number)` y resultado `Promise<VoucherNumberResult>`.
- [ ] **AC-03:** el Client Component conserva el import de la acción desde `@/actions/voucher`.
- [ ] **AC-04:** `parseAfipPointSaleError` se importa desde `@/services/afip/point-sale-validation` y no se reexporta desde la acción.
- [ ] **AC-05:** no existe ningún import productivo o de test del parser desde `@/actions/voucher`.
- [ ] **AC-06:** el parser continúa exportado por el servicio puro.

## G2 — salida TDD

G2 queda **RED esperado** cuando la prueba estática detecta el estado actual: falta la directiva de módulo, sobra la directiva inline y existe un test que importa el parser desde `@/actions/voucher`.

Comando de verificación:

```text
npm run test -- ai/features/server-action-voucher/server-action-voucher.test.ts
```

G2 se aprueba en G3 cuando las aserciones pasan sin relajar la cobertura.
