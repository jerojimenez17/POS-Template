# QA checklist — editable-label-description

- [ ] Configuración `editableDescription: true` para A4, thermal y label-45x55.
- [ ] Cada `.label-description` expone `contentEditable=true`, `spellcheck=false` y el título contextual.
- [ ] Una edición directa del DOM permanece visible y el mismo contenedor enviado a `printElement` contiene el texto editado.
- [ ] Cerrar y reabrir con el mismo producto restaura la descripción original; no se modifica el objeto de entrada ni se persiste.
- [ ] Precios, códigos, barcode/orden DOM, copias y dimensiones relevantes permanecen sin cambios.
- [ ] `printElement` conserva `format`, `pageStyle` y `orientation` por formato.
- [ ] El cambio A4 → thermal → label-45x55 dentro del modal mantiene la editabilidad y dimensiones del formato seleccionado.
- [ ] Ejecutar suite completa, lint y typecheck después de la implementación.

## Resultado TDD previo a implementación

Las pruebas deben ejecutarse antes del cambio de producción y fallar únicamente en los comportamientos aún no implementados (configuración/editabilidad de thermal y label-45x55). Los fallos son evidencia RED esperada; no se modifica implementación, SPEC ni la suite existente en este paso.
