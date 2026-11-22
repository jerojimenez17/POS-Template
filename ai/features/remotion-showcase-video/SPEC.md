# SPEC: actualización del showcase de Stock.ia

## 1. Objetivo y alcance

Actualizar el showcase Remotion existente de Stock.ia para que las pantallas y funciones representadas correspondan a las vistas vigentes del POS, y para comunicar con claridad una muestra más amplia de sus capacidades. Es un artefacto audiovisual de producto/portfolio, no una modificación de la aplicación.

La entrega es la composición editable existente en `video/` y el MP4 renderizado en `video/out/stock-ia-showcase.mp4`.

### En alcance

- Sustituir la narrativa actual por exactamente siete escenas: marca, venta en mostrador, catálogo digital público, inventario, libro Cuenta Corriente, operación y cierre.
- Representar interfaces inspiradas en las vistas fuente actuales identificadas en la sección 2; evitar pantallas genéricas que contradigan su organización o capacidades.
- Comunicar en español el propósito y las funciones relevantes mediante UI y copy breve, legible y comprensible sin sonido.
- Conservar el proyecto Remotion aislado que ya existe en `video/`, la composición 1920×1080 a 30 fps y la ruta de salida acordada.
- Entregar una composición por escenas, editable y reproducible localmente, con valores sintéticos.

### Fuera de alcance e invariantes

- No cambiar rutas, componentes, lógica de negocio ni dependencias de la aplicación Next.js; tampoco el esquema o acceso a Prisma, autenticación, datos de negocio o servicios POS.
- No hacer llamadas al POS, APIs, red o internet; no consultar Prisma ni requerir variables de entorno. No introducir `fetch`, `process.env` o importaciones de Prisma en `video/src/`.
- No instalar dependencias nuevas ni añadir dependencias al manifiesto/lockfile raíz. Las dependencias Remotion existentes en `video/` están aisladas (Remotion 4.0.545).
- No usar datos, nombres, imágenes o transacciones reales de clientes. Toda persona, comercio, producto, importe, saldo, pago y movimiento será ficticio/anónimo.
- No atribuir al producto comportamientos que no estén corroborados por las pantallas fuente. La UI recreada debe entenderse como representación ilustrativa, no como captura en vivo.
- El vídeo será silencioso. No añadir música, voz ni audio externo.

## 2. Fuentes de producto y restricciones de fidelidad

Las siguientes rutas y componentes son las referencias vigentes que guían el diseño de las escenas. Son referencias para representar la interfaz; la composición no debe importarlos ni ejecutarlos ni conectarse a ellos.

| Función | Referencia inspeccionada | Elementos que deben quedar reconocibles |
|---|---|---|
| Venta en mostrador | `src/app/(protected)/newBill/page.tsx`: `BillParametersForm`, `ProductsTable`, `SessionManager` | Configuración/contexto de la venta, tabla de productos y manejo de sesión/caja según lo que muestra la vista. |
| Catálogo público | `src/app/[business]/catalogo/page.tsx`, `src/components/catalog/product-selector.tsx` y `ProductCard` | Vista pública de productos, búsqueda, filtro por categoría, tarjetas de producto y carrito. |
| Inventario | `src/app/(protected)/stock/productDashboard/page.tsx`, `src/components/stock/product-dashboard.tsx`, `StockFilterPanel`, `ProductDataTable` | Panel/filtros de stock y tabla de productos, con jerarquía visual similar a la vista actual. |
| Cuenta Corriente | `src/app/(protected)/account-ledger/page.tsx` y `src/app/(protected)/account-ledger/[id]/page.tsx`: `SearchLedger`, `AccountLedgerList` | Búsqueda/listado, pestañas o filtros/estados que correspondan a la vista y detalle con productos, saldo/importe pendiente, resumen e historial de pagos. |
| Operación | Rutas existentes `/clients`, `/cashRegister`, `/report` | Montaje visual conciso que comunique clientes, caja y reportes sin simular acciones o datos no corroborados. |

El logo local de Stock.ia y los assets locales ya presentes son preferibles. No descargar ni depender de imágenes, tipografías u otros assets remotos.

## 3. Dirección creativa y storyboard

- **Audiencia:** comercios y usuarios hispanohablantes; el material debe presentar funciones concretas y no ser solo una animación de marca.
- **Tono:** claro, actual y confiable; interfaz de software comercial primero, adornos en segundo plano.
- **Formato:** horizontal 16:9, 1920×1080, 30 fps.
- **Duración aprobada:** 50–55 segundos. Objetivo recomendado: 54 segundos exactos = 1620 frames a 30 fps.
- **Idioma:** español; evitar bloques de texto densos. Ningún mensaje debe depender de sonido.
- **Movimiento:** animaciones deterministas guiadas por frame de Remotion; no depender de transiciones CSS no reproducibles.
- **Estructura:** las siete escenas deben seguir siendo separables/editables como secuencias/componentes de la composición, no aplanarse en un clip único.

### Secuenciación y asignación recomendada

| # | Tiempo objetivo | Frames (inicio incluido, fin excluido) | Escena | Contenido/función y mensaje |
|---:|---:|---:|---|---|
| 1 | 0–4 s | 0–119 | Marca | Logo Stock.ia y presentación breve del POS. Establecer el contexto de gestión para comercios. |
| 2 | 4–14 s | 120–419 | Venta en mostrador | Recreación fiel del flujo de venta: `BillParametersForm`, `ProductsTable` y una señal de `SessionManager`. Productos e importes ficticios. Mensaje enfocado en registrar una venta y revisar sus productos. |
| 3 | 14–24 s | 420–719 | Catálogo digital | Catálogo público con búsqueda, categorías, `ProductCard` y carrito visible. Mostrar inequívocamente que se trata de una vista accesible para descubrir productos y armar un carrito; usar datos ficticios. |
| 4 | 24–32 s | 720–959 | Inventario | Dashboard inspirado en `StockFilterPanel` y `ProductDataTable`; mostrar productos/stock y filtros de forma legible, sin afirmar automatismos no comprobados. |
| 5 | 32–42 s | 960–1259 | Libro Cuenta Corriente | Mostrar lista/búsqueda y estados/pestañas, luego un detalle con productos, importe pendiente/saldo y movimientos del historial de pagos. Dejar visibles claramente al menos un estado y una cifra sintética. |
| 6 | 42–50 s | 1260–1499 | Operación | Montaje visual enlazando las áreas de clientes, caja y reportes, correspondientes a `/clients`, `/cashRegister` y `/report`. No comprimir en una interfaz ilegible. |
| 7 | 50–54 s | 1500–1619 | Cierre | Regreso a Stock.ia, resumen conciso del alcance del software y cuadro final limpio con logo legible. |

Las asignaciones de la tabla son la pauta recomendada para los 1620 frames exactos. Si el ajuste visual exige variar la distribución, conservar siete escenas, el orden narrativo y una duración final entre 1500 y 1650 frames inclusive; documentar el nuevo reparto en el handoff/README de vídeo.

## 4. Especificación técnica

### Proyecto y render

- Actualizar el proyecto ya existente en `video/`; no iniciar un scaffold paralelo ni mover la salida.
- Mantener una composición de 1920×1080 y 30 fps. Configurar duración total de acuerdo con la asignación final de frames.
- Mantener el destino `video/out/stock-ia-showcase.mp4` y producir un MP4 H.264 reproducible localmente.
- Usar assets locales y comandos del proyecto aislado. El render no debe requerir servidor Next.js, base de datos, `.env`, credenciales, llamadas a servicios ni conexión de red.
- No añadir dependencias. La versión instalada indicada para Remotion es 4.0.545.

### Datos de ejemplo

- Los datos de UI serán estáticos, sintéticos y documentados en el source/README local de vídeo: identificar expresamente los nombres, productos, importes, saldos, estados, pagos y otros registros como datos ficticios.
- No copiar datos de seed, capturas, usuarios, clientes, negocios o transacciones reales del sistema.
- La ficción debe ser consistente dentro de cada flujo (por ejemplo, el importe pendiente y el historial de pagos del mismo detalle deben ser coherentes), sin presentar montos como tarifas o claims oficiales del producto.

### Edición, animación y legibilidad

- Mantener las siete secuencias y sus límites de escena inspeccionables/editables en Remotion Studio.
- Todo movimiento temporal debe derivarse del frame/composición y ser determinista al renderizar.
- Mantener textos clave dentro de márgenes seguros, con contraste suficiente y legibles a 1080p. La búsqueda, categorías, carrito, estados, saldo e historial requeridos deben poder distinguirse visualmente, no aparecer como texto microscópico.
- Evitar solapamiento o recortes durante entradas, transiciones y cuadros de permanencia. El cierre debe dejar el logo y el mensaje visibles el tiempo suficiente para leerse.

## 5. Validación propuesta para QA/desarrollo

- Revisar preview de Remotion y cuadros representativos de las siete escenas, incluyendo los límites de transición.
- Renderizar de forma local y verificar contenedor/códec MP4 H.264, dimensiones 1920×1080, 30 fps y duración en el intervalo aceptado.
- Comprobar el contenido visual exigido por cada escena, los textos en español, la fidelidad de sus elementos a la sección 2 y la privacidad de todos los datos.
- Inspeccionar `video/src/` para confirmar ausencia de llamadas `fetch`, uso de `process.env`, Prisma y dependencias/runtime del POS.
- Verificar que el render puede ejecutarse con assets locales, sin base de datos, credenciales, `.env`, aplicación Next.js ni acceso a internet.
- No modificar ni ejecutar acciones de implementación como parte de este paso de arquitectura. QA/desarrollo deberá actualizar el test existente `ai/features/remotion-showcase-video/remotion-showcase-video.test.ts`: sus reglas actuales de 35–45 segundos y cinco beats narrativos contradicen este brief.

## 6. Criterios de aceptación medibles

- **AC1 — Duración y formato:** el archivo `video/out/stock-ia-showcase.mp4` existe, es un MP4 H.264 de 1920×1080 a 30 fps y dura entre **1500 y 1650 frames inclusive** (50–55 s). El objetivo de edición recomendado es 1620 frames/54 s.
- **AC2 — Siete escenas exactas:** la composición contiene **exactamente siete escenas/funciones editables**, en este orden: marca, venta en mostrador, catálogo digital, inventario, Cuenta Corriente, operación (clientes/caja/reportes) y cierre. La escena de operación puede ser un montaje de las tres áreas, pero cuenta como una sola escena narrativa.
- **AC3 — Venta fiel:** la escena 2 muestra una composición reconocible de configuración/contexto de venta, productos en tabla y manejo de sesión/caja inspirada en `BillParametersForm`, `ProductsTable` y `SessionManager`; todo registro representado es ficticio.
- **AC4 — Catálogo público completo:** la escena 3 presenta explícitamente el catálogo público y contiene elementos visibles que representan **búsqueda, categorías/filtros, tarjetas de producto y carrito**. No basta con mostrar productos sin controles/carrito.
- **AC5 — Inventario fiel:** la escena 4 representa dashboard/listado de inventario con productos/stock y controles/filtros coherentes con `StockFilterPanel` y `ProductDataTable`; no atribuye acciones automáticas no verificadas.
- **AC6 — Cuenta Corriente completa:** la escena 5 muestra tanto (a) la lista o búsqueda con pestañas/estados identificables como (b) el detalle de una cuenta con productos, saldo o importe pendiente numérico e historial de pagos. Los importes de ejemplo son coherentes y sintéticos.
- **AC7 — Operación completa:** la escena 6 comunica visualmente las tres áreas: clientes, caja y reportes, respaldadas respectivamente por `/clients`, `/cashRegister` y `/report`.
- **AC8 — Datos de ejemplo documentados:** el README o fuente del proyecto de vídeo documenta que los registros son ficticios y enumera o identifica los nombres/datos de muestra mostrados; no aparecen datos reales de cliente, comercio o transacción en source ni exportación.
- **AC9 — Fidelidad y mensajes:** las siete escenas representan el producto en español y siguen las referencias de la sección 2. No muestran afirmaciones funcionales no respaldadas, faltas de ortografía/encoding ni mensajes cuya comprensión dependa de audio.
- **AC10 — Reproducibilidad y aislamiento:** el proyecto local renderiza al destino acordado usando dependencias/assets locales, sin instalar paquetes nuevos, `.env`, llamadas al POS, servidor Next.js, base de datos, credenciales ni internet.
- **AC11 — Sin conexiones prohibidas:** en `video/src/` no hay `fetch`, `process.env`, imports/consultas de Prisma ni conexiones a API/red/POS.
- **AC12 — Remotion determinista y editable:** la composición puede abrirse y previsualizarse en Remotion Studio; hay siete secuencias editables y las animaciones dependen de frames para producir un render repetible.
- **AC13 — Revisión visual:** en cuadros de inicio/medio/final de cada escena no hay texto clave recortado, ilegible, fuera de márgenes seguros o solapado; los elementos exigidos en AC3–AC7 se distinguen a 1080p.
- **AC14 — Audio:** el MP4 es silencioso (sin pista de audio necesaria o añadida); todo el contenido se entiende visualmente.

## 7. Handoff

1. QA actualiza los criterios del test existente para el nuevo rango temporal y los siete beats; no seguir afirmando que aplican 35–45 s o cinco beats.
2. Desarrollo modifica únicamente el proyecto aislado `video/` conforme a este documento, aprovechando sus componentes/composición existentes y manteniendo el destino de salida.
3. Usar Remotion Studio para revisar el encuadre, la fidelidad de las vistas y el ritmo de las siete escenas; renderizar el MP4 y verificar sus propiedades y contenido.
4. Reportar ruta de salida, duración real en frames/segundos y cualquier limitación. No declarar el render terminado sin que el archivo exista y haya sido inspeccionado.

## 8. Decisiones, supuestos y discrepancias conocidas

- **Timing elegido:** 54 s = 1620 frames a 30 fps. El reparto recomendado es 4 + 10 + 10 + 8 + 10 + 8 + 4 segundos; da más tiempo a las vistas con mayor densidad (catálogo y libro Cuenta Corriente) y reserva tiempos breves para apertura/cierre. Se admite cualquier duración de 50–55 s inclusiva si la inspección visual requiere ajustar el reparto.
- **Escenas vs. funciones:** el requisito es exactamente siete escenas; clientes, caja e informes se agrupan como montaje de una sola escena de operación, no como tres escenas independientes.
- **Mock UI:** como el render debe ser local, seguro y sin conectarse al POS, las pantallas serán recreaciones estáticas/animadas basadas en las referencias inspeccionadas, no capturas en vivo.
- **Salida existente:** la composición y el MP4 actuales corresponden al brief anterior de 1200 frames/40 s; deberán reemplazarse/actualizarse al implementar este SPEC.
- **Test desactualizado:** `ai/features/remotion-showcase-video/remotion-showcase-video.test.ts` impone actualmente 35–45 s y cinco beats. QA deberá ajustar esos supuestos para 1500–1650 frames y las siete escenas/funciones definidas aquí.
- **Sin cambio de arquitectura de aplicación:** no se requieren modelos de datos, APIs, contratos, cambios Next.js ni modificaciones Prisma para producir el vídeo.
