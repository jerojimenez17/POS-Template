
UI Changes: 
    - Cajas:
        - Boton de borrar: ajustar al diseño como en vista de stok
    - Mensaje feature no habilitados (reemplazar toast por modal)
      - Pago Vencido:
          - Bloquear todas las acciones del plan 
        - Accion bloqueada (feature no disponible)
          - Mensaje friendly y sugerencia de cambiar de plan + contacto WhatsApp (+54 9 2265 41-8113)
    - Modal Nuevo/Editar Producto:
        - Solo dejar con asterisco los campos realmente obligatorios
    - Editar Ventas: 
        - Mejorar UI layout similar a facturar: reemplazar los 3 botones por boton de actualizar en este caso (de ser necesario revisar upstream/main)
        - Se perdio el boton actualizar venta (mismo color que facturar)
        - Analizar casos donde se cambia facturacion u otro
        - Legacy: no se refleja cambio de condicion
        - Definir si se puede cambiar de facturada (como anulo en ARCA?) o remito

Bugs:
    - Cajas:
        - Navegar hacia atras no va hacia home page
    - Cuentas Corrientes:
        - Bug: se visualizan ventas (lo correcto es solo visualizar cuentas corrientes) 
    - Catalogo:
        - Crash when not available. Expected: show same modal as feature not available.
    - Vender:
        - Eliminar producto no pide confirmacion. Esperado: modal con confirmacion (idem otros casos)
        - Facturar (critico):
          - Mensaje no esta habilitado en el plan pero
            - Otro toast factura generada
            - Se guarda la venta
            - Se limpia carrito
            - Se visualiza en cuenta corriente (no deberia nunca)
            - Esperado: mostrar modal con feature no disponible en plan + contactar  
    - Ventas:
        - Ajustar filtro para ventas del dia. Filtrar siempre desde 00 a 23:59 del dia.
    - Stock:
        - Foto del producto no se ve en tabla. Esperado: ver la primer foto subida
    - Crear Vendedor:
        - No limpia los campos, al crear un nuevo vendedor tengo los datos anteriores
    - Verificar que la funcionalidad se cumpla con lo que dice el plan, ej: plan BASIC 1 usuario, 100 productos, etc. En caso de no cumplirse, idear un plan para ajustar esto en todos los lugares necesarios (modulos UI, actions, DB)
    - Para los planes que no se incluya cuentas corrientes, no debe poder crear clientes al momento de ir A Cuenta
  
- Features: 
  - PLAN DEMO:
    - Idear un plan free para demo de 30 dias full todo (limite x dia, ej 3 ventas, 5 productos, 2 clientes, 2 usuarios, 2 cajas)
