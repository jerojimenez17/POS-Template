# QA checklist — actualización del showcase de Stock.ia

Fuente de aceptación: `SPEC.md` (AC1–AC14). Alcance de QA: actualizar el test estático existente y validar únicamente el entregable independiente `video/`; no modificar la aplicación POS, sus dependencias, Prisma ni el SPEC. Las comprobaciones estáticas complementan, pero no sustituyen, la reproducción del vídeo y la inspección del MP4.

## Prueba automatizada focalizada

Desde la raíz del repositorio:

```bash
npm test -- --maxWorkers=1 ai/features/remotion-showcase-video/remotion-showcase-video.test.ts
```

La prueba revisa el aislamiento del proyecto, metadatos de composición, siete etiquetas de escena en orden, textos de producto necesarios, guardas estáticas de seguridad, documentación y existencia/firma de contenedor MP4 en la ruta acordada. No verifica visualmente el codec, legibilidad ni fidelidad del contenido renderizado.

## Criterios positivos (debe cumplir)

| Criterio | Condición de aprobación | Verificación |
|---|---|---|
| Composición y duración (AC1) | Composición 1920×1080 a 30 fps; duración total entre 1500 y 1650 frames inclusive (50–55 s). Objetivo: 1620 frames/54 s. Si el reparto o duración se ajusta, documentar tiempos finales en README/handoff. | Test estático; Remotion Studio; `ffprobe` o inspector multimedia para duración, resolución y fps. |
| Siete escenas separables (AC2, AC12) | Exactamente siete escenas editables, en orden: marca → venta en mostrador → catálogo digital → inventario → Cuenta Corriente → operación (clientes/caja/reportes) → cierre. La escena de operación agrupa esas tres áreas y cuenta como una sola. | Test estático de cantidad/orden; abrir Studio y revisar secuencias y límites. |
| Venta en mostrador (AC3) | Contexto/configuración de venta, tabla de productos y una señal de sesión/caja reconocibles; productos e importes ficticios. | Revisar escena 2 en Studio y en el render. |
| Catálogo público (AC4) | Se identifica como catálogo público; se distinguen búsqueda, categorías/filtros, tarjetas de producto y carrito. Mostrar productos sin búsqueda/categorías/carrito no es suficiente. | Test de términos de contenido; revisar visualmente escena 3 a 1080p. |
| Inventario (AC5) | Panel/listado con productos, stock y filtros coherentes; sin atribuir automatismos no verificados. | Revisar escena 4, textos y afirmaciones. |
| Cuenta Corriente (AC6) | Se muestran lista o búsqueda y estados/filtros identificables, además de detalle de cuenta con productos, saldo/importe pendiente numérico e historial de pagos. Importes consistentes y ficticios. | Test de contenido; comprobar visualmente secuencia lista → detalle en escena 5 y coherencia aritmética de datos. |
| Operación (AC7) | La escena 6 comunica clientes, caja y reportes/informes en un montaje legible, sin fingir acciones o datos no corroborados. | Test de contenido y revisión de escena 6. |
| Copy y datos (AC8–AC9) | Copy breve y correcto en español, comprensible sin sonido; el source incluye exactamente la grafía acentuada `Selección múltiple` (no `Seleccion Multiple`). Source/README identifica los datos de ejemplo como ficticios/sintéticos; no se exponen registros personales, comercios o transacciones reales. | Test estático de la etiqueta y revisión manual de todos los cuadros; comprobar encoding y cifras. |
| MP4 reproducible (AC1, AC10, AC14) | Existe `video/out/stock-ia-showcase.mp4`, es H.264 en contenedor MP4, 1920×1080, 30 fps y dentro del intervalo aprobado; silencioso y reproducible localmente. | Test verifica ruta/firma `ftyp`; inspeccionar codec, propiedades, duración y pistas con `ffprobe`/reproductor; escuchar/comprobar ausencia de audio. |
| Aislamiento/offline (AC10–AC11) | Proyecto Remotion aislado con dependencias/lockfile y comandos locales; sin cambios ni dependencia nueva en manifiesto/lock raíz. Render/preview no requieren Next.js, Prisma/DB, `.env`, credenciales, red, APIs ni assets remotos. `video/src/` no usa `fetch`, `process.env`, Prisma ni conexiones POS/API. | Test estático; revisar manifest/lockfiles y source; seguir README localmente sin servicios de app ni acceso a red. |
| Revisión visual (AC13) | En cuadros de inicio, medio, final y transiciones de cada escena, textos clave caben en márgenes seguros, tienen contraste y son legibles a 1080p; no hay solapamientos, recortes ni flashes. | Renderizar y revisar Studio/cuadros representativos a tamaño nativo; ver el vídeo completo. |

## Casos negativos que deben rechazarse

- Menos o más de siete escenas, orden distinto, escenas omitidas, etiquetas/narrativa que no identifican los siete beats o clientes/caja/reportes contados como escenas independientes.
- Composición fuera de 1500–1650 frames, tamaño/fps incorrectos, MP4 ausente/dañado, destino distinto, codec distinto de H.264 o pista de audio añadida.
- Venta sin tabla/contexto de sesión; catálogo sin búsqueda, categorías, tarjetas o carrito; inventario sin stock/filtros; Cuenta Corriente sin búsqueda/estado y detalle/saldo/historial; operación que omite una de sus tres áreas.
- `video/src` incluye copy/controles no corroborados por las pantallas fuente revisadas: `Ordenar: destacados`, `Nueva cuenta`, `Filtrar por categoría` o `Últimos 7 días` (la prueba los rechaza sin distinguir mayúsculas y tolera las variantes acentuadas de categoría/últimos/días).
- La etiqueta de inventario aparece sin la tilde correcta como `Seleccion Multiple`; debe escribirse `Selección múltiple` (AC9).
- Datos reales o identificables, cifras incongruentes, afirmaciones no respaldadas (garantías, automatismos o superlativos), texto ilegible, recortado, solapado o con errores de encoding.
- Dependencia raíz nueva, llamadas de red/POS, importaciones Prisma, `.env`/credenciales requeridos, assets remotos, necesidad de servidor Next.js o base de datos.
- Preview/render con errores, assets locales faltantes o instrucciones que no reproducen el artefacto acordado.

## Casos límite y validación manual

- Verificar inclusión exacta de límites: 1500 y 1650 frames pasan; 1499 y 1651 fallan. A 30 fps corresponden a 50 y 55 segundos; el objetivo sugerido es 1620/54 s.
- Examinar primer y último frame, frames de transición y los cuadros de inicio/medio/final de cada escena para detectar blanco/negro, flashes, salto de layout o contenido fugaz/ilegible.
- Revisar caracteres acentuados, puntuación, copy y comprensión con el vídeo silenciado.
- Comprobar visualmente que búsqueda, categorías, carrito, estados, saldo e historial no son microscópicos y permanecen el tiempo suficiente para leerse.
- Confirmar con inspección del archivo exportado sus propiedades reales (contenedor/codec, resolución, fps, duración y audio); la firma `ftyp` por sí sola no prueba que el MP4 sea reproducible ni H.264.
- Repetir el render y comparar duración/escenas para descartar aleatoriedad o dependencia de tiempo/red; verificar que se puede ejecutar con recursos locales solamente.

## Límites de automatización

Los tests estáticos no garantizan que el texto esté visible en cada frame, que las cifras coincidan con los píxeles exportados, que el codec/metadata del MP4 sea correcto, ni que Studio y el render funcionen visualmente. Esas condiciones requieren preview, reproducción e inspección multimedia manual; el checklist no declara el render aprobado hasta completar esas comprobaciones.
