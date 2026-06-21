# 8. Catálogo Público

## Descripción General

El catálogo público permite a los clientes **ver productos y hacer pedidos online** sin necesidad de autenticarse. Es una feature Enterprise que debe estar habilitada en el plan del negocio.

## Arquitectura

```mermaid
flowchart LR
    subgraph "Público (sin auth)"
        PC[Catálogo Público] --> Products[Lista de productos]
        PC --> ProductDetail[Detalle de producto]
        PC --> Cart[Carrito público]
        PC --> Checkout[Formulario de checkout]
    end
    
    subgraph "Server Actions"
        GPP[getPublicProductsByBusinessId]
        GPP2[getPublicProductById]
        CPO[createPublicOrder]
    end
    
    subgraph "Backoffice"
        Orders[Órdenes pendientes]
        Confirm[Confirmar pedido]
    end
    
    Products --> GPP
    ProductDetail --> GPP2
    Checkout --> CPO
    CPO --> Orders
```

## Productos Públicos

```typescript
interface PublicProduct {
  id: string;
  code: string | null;
  description: string | null;
  brand: string | null;
  category: string | null;
  salePrice: number;
  unit: string | null;
  image: string | null;      // Imagen principal
  images: string[];           // Imágenes adicionales
  amount: number;             // Stock disponible
  details: string | null;     // Descripción extendida
  catalog: boolean;           // Debe ser true para aparecer
}
```

### Filtros de Visibilidad

Los productos públicos se filtran con:

```typescript
const products = await db.product.findMany({
  where: {
    businessId,
    salePrice: { gt: 0 },  // Debe tener precio
    catalog: true,          // Marcado como público
  },
});
```

### Feature Gate

```typescript
const features = await db.businessFeatures.findUnique({
  where: { businessId }
});
if (!features?.hasPublicCatalog) {
  throw new Error("El catálogo público no está habilitado.");
}
```

## Flujo de Pedido Público

```mermaid
sequenceDiagram
    actor C as Cliente
    participant UI as Catálogo
    participant SA as createPublicOrder
    participant DB as Prisma
    participant PS as Pusher
    participant BO as Backoffice
    
    C->>UI: Navega productos
    C->>UI: Agrega al carrito
    C->>UI: Completa checkout
    UI->>SA: createPublicOrder({ items, client, total })
    
    SA->>SA: Validar con Zod
    
    SA->>DB: $transaction
    DB->>DB: Buscar/Crear cliente por DNI
    DB->>DB: Crear Order (status: pendiente)
    Note over DB: Stock NO se descuenta aún
    DB-->>SA: { orderId }
    
    SA->>PS: trigger("orders-update")
    SA-->>UI: { success, orderId }
    UI-->>C: "Pedido registrado"
    
    PS-->>BO: Notificación en tiempo real
    BO->>BO: Confirmar pedido → descuenta stock
```

### Validación Zod del Checkout

```typescript
const createPublicOrderSchema = z.object({
  businessId: z.string(),
  client: z.object({
    dni: z.string().min(1, "El DNI es obligatorio"),
    name: z.string().min(1, "El nombre es obligatorio"),
    phone: z.string().optional(),
    email: z.string().email().optional().or(z.literal('')),
    address: z.string().optional(),
  }).refine((data) => data.phone || data.email, {
    message: "Debe proveer un teléfono o correo electrónico",
  }),
  items: z.array(
    z.object({
      productId: z.string(),
      price: z.number(),
      quantity: z.number().min(0.01),
      subTotal: z.number(),
    })
  ).min(1, "Debe seleccionar al menos un producto"),
  total: z.number().min(0),
});
```

### Creación de Orden Pública

```typescript
export const createPublicOrder = async (input) => {
  const result = await db.$transaction(async (tx) => {
    // 1. Buscar o crear cliente por DNI (como ID)
    const existingClient = await tx.client.findUnique({ where: { id: client.dni } });
    
    if (existingClient) {
      // Actualizar datos del cliente
      dbClient = await tx.client.update({ where: { id: client.dni }, data: { ... } });
    } else {
      // Crear nuevo cliente con balance = 0
      dbClient = await tx.client.create({ id: client.dni, balance: 0, ... });
    }
    
    // 2. Crear Order en estado "pendiente"
    // Stock NO se descuenta — el comercio confirma después
    const newOrder = await tx.order.create({
      data: {
        clientId: dbClient.id,
        status: "pendiente",
        paidStatus: "inpago",
        items: { create: items.map(...) },
      },
    });
    
    return newOrder;
  });
  
  // Notificar al comercio
  await pusherServer.trigger(`orders-${businessId}`, "orders-update", {});
};
```

## Flujo de Confirmación (Backoffice)

```mermaid
flowchart TD
    PO[Pedido Pendiente] --> Review[Revisar en backoffice]
    Review -->|Aceptar| Confirm[updateOrderStatus: confirmado]
    Review -->|Rechazar| Cancel[Cancelar pedido]
    
    Confirm --> Stock[Descontar stock]
    Confirm --> Balance[Actualizar balance del cliente]
    Confirm --> Ranking[Actualizar ranking]
    Confirm --> Status[Order.status = confirmado]
    
    Cancel --> ReturnStock[No se descuenta stock - ya estaba en 0]
    Cancel --> Delete[Eliminar order]
```

## Componentes del Catálogo

| Componente | Descripción |
|------------|-------------|
| `ProductCard` | Tarjeta de producto con imagen, precio y stock |
| `ProductDetail` | Vista detallada del producto con imágenes múltiples |
| `ProductSelector` | Selector de cantidad para agregar al carrito |
| `PublicCart` | Carrito de compras público |
| `CheckoutForm` | Formulario de datos del cliente |
| `OrderButtonModal` | Modal de confirmación de pedido |

## Estados del Pedido Público

```mermaid
stateDiagram-v2
    [*] --> pendiente: Cliente hace pedido
    
    pendiente --> confirmado: Comercio confirma
    pendiente --> [*]: Comercio cancela
    
    confirmado --> entregado: Cliente retira
    confirmado --> consignacion: En consignación
    
    entregado --> [*]
    consignacion --> [*]
```
