# Checklist TDD — Nota de Crédito, CAE histórico e impresión

Los tests de esta carpeta son deliberadamente RED: describen contratos que la implementación debe hacer pasar.

| AC | Verificaciones positivas | Verificaciones negativas / edge cases |
|---|---|---|
| AC-01 | CAE histórico textual, con ceros y longitud distinta de 14 se conserva y llega a validar tipo/número/punto. | Espacios externos se normalizan sólo para presencia, nunca a número. |
| AC-02 | Asociación completa permite continuar. | CAE vacío/null/undefined/placeholder, conflicto, tipo no soportado, número/punto inválidos o contenido incompleto no reserva ni llama ARCA. |
| AC-03 | Respuesta nueva válida tiene CAE ASCII de 14 dígitos y enteros positivos. | CAE corto/largo/alfa/con espacios, número o punto cero/no entero no autoriza ni imprime. |
| AC-04 | Modal solicita exactamente uno, dos o tres campos faltantes permitidos. | No solicita CAE ni acepta campos inventados o fuera de allowlist. |
| AC-05 | Action lee `Order` con `id + businessId`, combina sólo faltantes y revalida antes de reservar/ARCA; revalida la ruta. | Override, tenant ajeno y cambio entre render/submit devuelven conflicto sin efectos. |
| AC-06 | Snapshot, `CbtesAsoc`, estados y UI comparten A/B/C y códigos 1/6/11 + 3/8/13. | No se duplica ni modifica `Order`; CAE nuevo no reemplaza el original. |
| AC-07 | Solicitudes concurrentes producen como máximo un `SaleReturn` autorizado y una serie de efectos locales. | Carrera perdedora no crea otra venta ni repite stock/caja. |
| AC-08 | Eventos contienen fase, estado, asociación resumida, totales y conteos allowlisted. | Ausentes CAE completo/parcial, credenciales, tokens, claves, QR, payloads, headers, Prisma y error/stack crudo; `NON_FISCAL` no genera ruido. |
| AC-09 | `AUTHORIZED` muestra estado, Nota, número, punto, CAE y comprobante original asociado. | `PENDING` y `REJECTED` muestran estado pero no habilitan impresión. |
| AC-10 | Documento impreso dice Nota de Crédito, usa metadata nueva e incluye bloque de asociación. | Nunca presenta CAE nuevo como CAE de factura original. |
| AC-11 | Imprimir/recargar es lectura/presentación. | No crea/actualiza Order/SaleReturn, stock/caja ni llama ARCA. |
| AC-12 | Facturas, remitos, presupuestos, no fiscales, impresión original y devoluciones manuales conservan comportamiento. | La nueva política no altera consumidores existentes. |
| AC-13 | Sin migraciones/dependencias nuevas; suite, lint, typecheck y build deben compilar. | Reportar cualquier bloqueo de infraestructura o contrato faltante. |
