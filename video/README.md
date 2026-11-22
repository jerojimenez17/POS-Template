# Stock.ia — showcase de producto

Composición editable de **54 segundos (1620 frames)**, 1920×1080 a 30 fps, formada por siete secuencias fuente. Es una recreación ilustrativa de pantallas de punto de venta; no es una captura de la aplicación. El vídeo es **silencioso, sin voz ni música** y toda la información se entiende en pantalla.

## Escenas y funciones

| Secuencia | Frames | Contenido |
|---|---:|---|
| 01 · Marca | 0–119 | Presenta Stock.ia como punto de venta para comercios. |
| 02 · Venta en mostrador | 120–419 | Contexto de nueva venta, parámetros de comprobante/punto de venta/IVA/pago, tabla de productos, total y estado de sesión de caja. |
| 03 · Catálogo digital público | 420–719 | Identidad del negocio, búsqueda por nombre/código/marca/categoría, filtro de categoría, tarjetas de producto y botón flotante que presenta el carrito como panel lateral. |
| 04 · Inventario | 720–959 | Búsqueda, checks «Solo código» y «Código exacto», acciones Nuevo/Carga/Escanear/Selección múltiple y tabla con foto, código, descripción, marca, cantidad, precio y acciones. |
| 05 · Cuenta Corriente | 960–1259 | Lista con búsqueda y estados; luego detalle con productos, saldo pendiente, resumen e historial de pagos. |
| 06 · Operación | 1260–1499 | Montaje de clientes, Caja Registradora (fechas, medios de pago, total neto e historial) y reporte con ventas, descuentos, devoluciones, neto en caja, canales de pago y actividad de stock. |
| 07 · Cierre | 1500–1619 | Regresa a la marca y resume las áreas del producto. |

El timing y los siete `<Sequence>` con nombres descriptivos se editan en `src/Showcase.tsx`; dimensiones, fps y duración se declaran en `src/Root.tsx`. Cada escena es un componente separado en `src/scenes/`. Las animaciones son deterministas y se basan en `useCurrentFrame()` e `interpolate()`.

## Datos de ejemplo

**Todos los nombres, negocios, personas, productos, códigos, importes, cantidades, fechas, saldos, estados, pagos, movimientos, recuentos y gráficos mostrados son ficticios/sintéticos.** No se usan datos de clientes ni transacciones reales. Ningún precio es una tarifa oficial; se incluyen solo para dar coherencia visual a la muestra.

Registros de muestra identificables en las escenas:

- Negocio público ficticio **Almacén Bruma**. Productos: Café molido (250 g; Tostadero Norte; código CF-024), Taza cerámica (Línea Nube; TZ-108), Yerba suave (Monte Claro; YS-010) y Miel de flores (Colmena Sur; MI-250). En las tarjetas aparecen código, categoría, marca, precio, control de cantidad y «Agregar al pedido»; los importes ficticios son $4.800, $6.200, $3.500 y $5.100. El carrito lateral muestra una unidad de Café molido ($4.800) y una de Yerba suave ($3.500), total estimado $8.300.
- Venta de mostrador de ejemplo: Factura C, punto de venta 001, Consumidor final y Efectivo; responsable ficticia Martina P. y sesión de caja de ejemplo. Dos Café molido a $4.800, una Taza cerámica a $6.200 y una Yerba suave a $3.500 suman $19.300.
- Inventario ilustrativo: 128 resultados. Café molido, 42 unidades a $4.800,00; Taza cerámica, 8 unidades a $6.200,00; Yerba suave, 31 unidades a $3.500,00; Miel de flores, 5 unidades a $5.100,00. Las marcas y códigos son los ficticios de la lista anterior.
- Libro Cuenta Corriente: Lucía Moreno (venta ficticia #V-2048), Tomás Rivas y Elena Paz. La lista ilustra los estados «Pendiente Pago», «Pagado» y «Por Confirmar», bajo las pestañas «Por Confirmar», «Pendientes de Pago», «Pagados» y «Todos», con búsqueda por cliente. Los saldos sintéticos son $15.000, $0 y $9.200. El detalle de Lucía totaliza $24.000 (dos Café molido a $6.000 cada uno y dos Tazas cerámicas a $6.000 cada una); dos pagos ficticios de $5.000 y $4.000 suman $9.000 abonados y dejan $15.000 pendientes.
- Operación / Clientes: fichas ficticias de Lucía Moreno, Tomás Rivas y Elena Paz; saldos de ejemplo $15.000, $0 y $9.200.
- Operación / Caja Registradora: movimientos ficticios del 21 nov 2026 a las 14:32 (+$19.300), 13:10 (−$4.500) y 12:18 (+$12.000), asociados a Martina P. El total neto mostrado, $26.800, coincide con esos tres movimientos. Los filtros ilustrados son «Solo efectivo»/«Todos los medios» y fechas Desde/Hasta.
- Operación / Reportes: ejemplo diario del 21 nov 2026 con Ventas Totales $126.400, Descuentos $4.200, Devoluciones $2.000 y Neto en Caja $124.400 (ventas menos devoluciones, como indica la vista). Canales de Pago: Efectivo $84.500, Transferencia $29.900 y Débito $12.000; suman $126.400. Actividad de Stock: 18 egresos y 8 ingresos ficticios. La página también muestra los reportes Mensual y Anual.

Las cifras se mantienen coherentes en cada flujo; la composición no realiza cálculos con datos externos ni representa actualizaciones en vivo. Los filtros, controles y resultados solo son parte del mock visual.

## Requisitos, preview y render local

- Usar Node.js compatible con Remotion 4.0.545 y npm. El proyecto mantiene sus dependencias aisladas en `video/`; no agrega paquetes al POS.
- Para instalar las dependencias del proyecto en una máquina nueva, desde `video/` ejecutar `npm ci` (la instalación inicial puede necesitar acceso al registro de paquetes). Con dependencias y navegador de Remotion disponibles localmente, **preview y render no requieren internet**, ni servidor Next.js, `.env`, credenciales, API, red, Prisma o base de datos.
- El único asset gráfico es el logo local `public/LOGO.png`; no hay imágenes, fuentes ni audio remotos.

Desde el directorio `video/`:

```bash
npm run studio
npm run render
```

En Remotion Studio, abrir `StockIaShowcase` y revisar/desplazarse por las siete secuencias. Los componentes visuales y tiempos se pueden editar en `src/`. `npm run render` genera un **MP4 H.264 silencioso** de 1920×1080, 30 fps y 1620 frames en:

`video/out/stock-ia-showcase.mp4`

También se puede comprobar el tipado y lint local con `npm run lint`. No se incluye una clave de licencia ni una pista de audio.
