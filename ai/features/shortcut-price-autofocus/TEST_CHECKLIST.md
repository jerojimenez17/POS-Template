# Checklist QA — Autofoco de precio por atajo

## Criterios de aceptación

- [ ] **CA-01 / F1:** con sesión activa y F1 configurado, agrega exactamente un producto con `amount: 1`, `salePrice: 0`, solicita su `productId` y enfoca su input de precio en modo edición con valor `"0"`.
- [ ] **CA-02 / F2-F3:** cada tecla agrega únicamente el producto configurado y enfoca el input identificado por su `productId`.
- [ ] **CA-03:** con varios productos y orden distinto al de agregado, el foco sigue la identidad (`productId`), nunca la posición de la fila.
- [ ] **CA-04:** una solicitud se consume una sola vez; una actualización posterior sin nueva solicitud no vuelve a editar ni enfocar.
- [ ] **CA-05:** atajo ausente, sesión inactiva, error de consulta y producto inexistente no agregan ni dejan foco pendiente.
- [ ] **CA-06:** el agregado normal por búsqueda muestra el precio no editable hasta una interacción explícita.
- [ ] **CA-07:** en `isEditing`, F1/F2/F3 no procesan productos ni foco; F4/F5/F9/F10 conservan sus flujos existentes.
- [ ] **CA-08:** F1, F2 y F3 siempre llaman `preventDefault`, incluso sin configuración.
- [ ] **CA-09:** el control enfocado es un `<input>` nativo, conserva el `aria-label`, usa `inputMode="decimal"` y permite escritura inmediata.
- [ ] **CA-10:** los tests compilan sin cambios de producción, dependencias ni esquema; luego deben acompañarse de lint y typecheck limpios.

## Casos cubiertos por los tests TDD

- `price-edit-input.test.tsx`: señal coincidente, montaje posterior, identidad entre hermanos, consumo único, señal no coincidente, edición normal y atributos accesibles.
- `bill-buttons.test.tsx`: F1/F2/F3, cantidad/precio iniciales, error y producto eliminado, configuración ausente, sesión inactiva, modo edición y prevención de default.

## Resultado esperado en fase RED

Los tests deben compilar y fallar contra la implementación incompleta. No se debe modificar código de producción para hacerlos pasar durante esta etapa.
