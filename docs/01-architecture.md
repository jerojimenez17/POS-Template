# 1. Arquitectura General

## Stack Tecnológico

```mermaid
flowchart LR
    subgraph Frontend
        Next15[Next.js 15]
        React19[React 19]
        Tailwind[Tailwind CSS v4]
        Radix[Radix UI]
    end
    
    subgraph Backend
        SA[Server Actions]
        Prisma[Prisma ORM]
        NextAuth[NextAuth.js v5]
    end
    
    subgraph "Data Layer"
        PG[(PostgreSQL)]
        PS[Pusher WebSockets]
        FB[Firebase Storage]
    end
    
    subgraph External
        ARCA[ARCA / AFIP API]
        CloudFn[Cloud Functions]
    end
    
    Frontend --> SA
    SA --> Prisma
    SA --> NextAuth
    SA --> PS
    SA --> CloudFn
    Prisma --> PG
    NextAuth --> PG
    CloudFn --> ARCA
    React19 --> Tailwind
    React19 --> Radix
```

## Patrón de Arquitectura

El sistema sigue una arquitectura orientada a **Server Actions** con separación clara de responsabilidades:

### Capas

| Capa | Directorio | Responsabilidad |
|------|-----------|-----------------|
| **Presentación** | `src/app/` | Páginas y layouts (RSC) |
| **Componentes** | `src/components/` | UI components (client + server) |
| **Estado** | `src/context/` | Context + Reducer para estado del carrito |
| **Acciones** | `src/actions/` | Server Actions (toda la lógica de negocio) |
| **Datos** | `src/models/` | Tipos e interfaces TypeScript |
| **Validación** | `src/schemas/` | Esquemas Zod |
| **Utilidades** | `src/lib/` | Helpers (DB, auth, pusher, print) |

### Flujo de Datos

```mermaid
sequenceDiagram
    actor U as Usuario
    participant C as Client Component
    participant SA as Server Action
    participant DB as Prisma + PostgreSQL
    participant PS as Pusher
    participant CF as Cloud Function
    
    U->>C: Interactúa con UI
    C->>SA: Llama Server Action
    SA->>SA: Autentica vía auth()
    SA->>DB: $transaction()
    
    par Database Operations
        DB->>DB: Actualiza stock
        DB->>DB: Crea orden/venta
        DB->>DB: Crea movimientos
    end
    
    SA->>PS: trigger(event, data)
    PS-->>C: WebSocket callback
    SA->>CF: createAfipVoucher (opcional)
    CF->>ARCA: ARCA API
    ARCA-->>CF: CAE
    CF-->>SA: CAE response
    SA-->>C: { success, orderId }
    C->>C: revalidatePath
    C-->>U: Actualiza UI + notificación
```

## Multi-tenancy

Cada `Business` es un tenant independiente. **TODAS** las consultas filtran por `businessId`:

```typescript
// Ejemplo de patrón multi-tenant
const session = await auth();
const businessId = session?.user?.businessId;
if (!businessId) return { error: "No autorizado" };

// Toda consulta incluye businessId en el WHERE
const products = await db.product.findMany({
  where: { businessId },  // ← SIEMPRE
});
```

## Feature Gates (Auth Gates)

El sistema tiene un sistema de **gates basados en plan** que controla qué funcionalidades están disponibles:

```mermaid
flowchart LR
    subgraph BusinessFeatures
        BASIC -->|Default| Limits
        PRO -->|Upgrade| MultiCashbox[hasMultiCashbox]
        PRO --> ClientLedger[hasClientLedger]
        ENTERPRISE --> Afip[hasAfipBilling]
        ENTERPRISE --> Catalog[hasPublicCatalog]
    end
    
    subgraph Limits
        UL[Usuarios: 1-∞]
        PL[Productos: 100-∞]
    end
```

- `assertWritePermission()` — verifica auth + cuenta no morosa
- `requireFeature("hasClientLedger")` — feature gate por plan
- `assertLimit("maxUsers", count)` — verifica límites operacionales

## Rutas Protegidas

```
/(protected)/
  ├── newBill/       → Facturación
  ├── sales/[id]/    → Detalle de venta
  ├── stock/         → Stock y productos
  ├── cashRegister/  → Caja
  ├── account-ledger/→ Cuenta corriente
  ├── report/        → Reportes
  └── searchBill/    → Búsqueda
```

## Errores y Manejo de Errores

Todas las Server Actions retornan un objeto consistente:

```typescript
// Éxito
return { success: true, orderId: "abc123" };
return { success: "Producto creado", product };

// Error
return { error: "No autorizado" };
return { error: "Stock insuficiente" };
```

Los errores se muestran al usuario mediante `react-hot-toast`.

## Persistencia de Estado (Carrito)

El estado del carrito de facturación se maneja con `useReducer` + `React.Context`:

```mermaid
flowchart LR
    BillProvider[BillProvider] --> BillReducer[BillReducer]
    BillProvider --> BillContext[BillContext]
    BillContext --> ProductsTable[ProductsTable]
    BillContext --> BillButtons[BillButtons]
    BillContext --> PrintModeSelector[PrintModeSelector]
```

## Tiempo Real (Pusher)

WebSockets para actualizaciones en vivo:

| Evento | Channel | Descripción |
|--------|---------|-------------|
| `orders-update` | `orders-{businessId}` | Nueva orden o cambio de estado |
| `new-movement` | `movements-{businessId}` | Nuevo movimiento de caja |
| `refresh` | `movements-{businessId}` | Refrescar datos (CRUD productos) |
