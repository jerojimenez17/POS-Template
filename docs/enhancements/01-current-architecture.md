# 1. Arquitectura Actual — Análisis Detallado

> Basado en exploración del código base: Server Actions, Prisma schema, componentes, contextos, y flujos de datos.

---

## 1.1 Stack Tecnológico

```mermaid
flowchart LR
    subgraph Frontend
        Next15["Next.js 15 (App Router)"]
        React19["React 19"]
        TS["TypeScript Strict"]
        TW["Tailwind CSS v4"]
        Radix["Radix UI Primitives"]
        RHF["React Hook Form + Zod"]
    end

    subgraph State
        Context["React Context + useReducer"]
        NextAuth["NextAuth.js v5 Session"]
    end

    subgraph Backend
        SA["Server Actions"]
        Prisma["Prisma 6 ORM"]
        AuthJS["Auth.js / NextAuth"]
    end

    subgraph "Data Layer"
        PG[("PostgreSQL")]
        FB["Firebase Storage<br/>(Imágenes)"]
        PS["Pusher WebSockets"]
    end

    subgraph External
        ARCA["ARCA / AFIP API"]
        CF["Cloud Functions"]
    end

    Frontend --> SA
    Frontend --> Context
    SA --> Prisma
    SA --> AuthJS
    SA --> PS
    SA --> CF
    Prisma --> PG
    AuthJS --> PG
    CF --> ARCA
    FB --> SA
```

### Observaciones Clave

- **Server Actions** como única fuente de mutaciones — no hay API Routes tradicionales
- **React Server Components** por defecto, `"use client"` solo para interactividad
- **Prisma transaccional** con `$transaction()` para operaciones multi-paso
- **Firebase** solo para Storage (imágenes) — el ORM principal es Prisma/PostgreSQL

---

## 1.2 Arquitectura por Capas

```mermaid
flowchart TD
    subgraph "Capa de Presentación"
        Pages["src/app/"]
        Layouts["Layouts + RSC"]
    end

    subgraph "Capa de Componentes"
        UI["src/components/ui/<br/>Radix Primitives"]
        Feature["src/components/Billing/<br/>src/components/stock/<br/>src/components/cashbox/"]
    end

    subgraph "Capa de Estado Cliente"
        BillContext["BillContext + BillReducer<br/>(Carrito de facturación)"]
        CashboxContext["CashboxContext<br/>(Sesión de caja)"]
        FiltersContext["FiltersContext<br/>(Filtros de búsqueda)"]
    end

    subgraph "Capa de Negocio"
        Actions["src/actions/<br/>Server Actions"]
        Gates["src/lib/auth-gates.ts<br/>(assertWritePermission, requireFeature, assertLimit)"]
    end

    subgraph "Capa de Datos"
        Prisma["Prisma ORM"]
        Models["src/models/<br/>(Tipos e interfaces)"]
        Schemas["src/schemas/<br/>(Validación Zod)"]
    end

    subgraph "Capa de Infraestructura"
        DB[("PostgreSQL")]
        Firebase[("Firebase Storage")]
        Pusher["Pusher WS"]
        External["ARCA API / Cloud Functions"]
    end

    Pages --> Feature
    Pages --> UI
    Feature --> Actions
    Feature --> BillContext
    Actions --> Gates
    Actions --> Prisma
    Actions --> Models
    Actions --> Schemas
    Actions --> Pusher
    Prisma --> DB
```

### Flujo de Datos por Capa

| Capa | Responsabilidad | Archivos Clave |
|------|-----------------|----------------|
| **Presentación** | Páginas, layouts, metadata | `src/app/` |
| **Componentes** | UI interactiva, formularios, tablas | `src/components/` |
| **Estado Cliente** | Carrito, sesión de caja, filtros | `src/context/` |
| **Negocio** | Toda la lógica de datos | `src/actions/` (19 archivos) |
| **Datos** | ORM, tipos, validación | `src/lib/db.ts`, `prisma/schema.prisma` |

---

## 1.3 Flujo de una Venta

El flujo más complejo del sistema es `processSaleAction` en `sales.ts`:

```mermaid
sequenceDiagram
    actor U as Usuario (Vendedor)
    participant P as ProductsTable (Client)
    participant B as BillProvider (Context)
    participant SA as processSaleAction
    participant TX as Prisma Transaction
    participant PG as PostgreSQL
    participant PS as Pusher

    U->>P: Agrega productos al carrito
    P->>B: dispatch(addItem / addUnit)
    B->>B: BillReducer actualiza estado

    U->>P: Configura descuento, método de pago
    P->>B: dispatch(discount / paidMethod)

    U->>P: Click "Procesar Venta"
    P->>SA: processSaleAction(billState)
    
    SA->>SA: auth() → session
    SA->>SA: Verifica businessId

    SA->>TX: db.$transaction()

    TX->>PG: Find active CashboxSession
    TX->>PG: Create Order + OrderItems
    TX->>PG: Update Product.amount (decrement)
    TX->>PG: Create StockMovement (SALE)
    TX->>PG: Upsert ProductRanking
    TX->>PG: Update CashBox.total
    TX->>PG: Create CashMovement
    TX-->>SA: { order, movements }

    SA->>PS: trigger("orders-update")
    SA->>PS: trigger("new-movement")

    SA->>SA: revalidatePath (5 rutas)
    SA-->>P: { success: true, orderId }

    P->>U: toast.success() + reset cart
```

### Lo que Funciona Bien en Este Flujo

- ✅ **Atomicidad**: Todo en una sola transacción Prisma
- ✅ **Multi-tenancy**: businessId en cada query
- ✅ **Sesión de caja obligatoria**: No se puede vender sin sesión abierta
- ✅ **Stock tracking**: StockMovement por cada ítem, causa y efecto
- ✅ **Ranking mensual**: Upsert por producto/mes/año
- ✅ **Push en tiempo real**: Pusher notifica a otros clientes

### Lo que Podría Mejorar

- ⚠️ **5 revalidatePath() calls** — agresivo, invalida cachés innecesariamente
- ⚠️ **Sin caché de sesión**: Cada action llama a `auth()` → query a DB
- ⚠️ **Sin optimistic updates**: Usuario espera roundtrip completo

---

## 1.4 Modelo de Datos — Relaciones Principales

```mermaid
erDiagram
    Business ||--o{ User : "tiene"
    Business ||--o{ Product : "tiene"
    Business ||--o{ Client : "tiene"
    Business ||--o{ CashBox : "tiene"
    Business ||--o{ Order : "tiene"
    Business ||--o{ Supplier : "tiene"
    Business ||--|| BusinessFeatures : "tiene"

    User ||--o{ CashboxSession : "abre"
    User }o--|| CashBox : "asignado a"

    CashBox ||--o{ CashboxSession : "tiene"
    CashboxSession ||--o{ Order : "registra"
    CashboxSession ||--o{ CashMovement : "registra"

    Product ||--o{ OrderItem : "incluido en"
    Product ||--o{ ProductRanking : "ranked"
    Product ||--o{ StockMovement : "movements"
    Product ||--o{ ProductImage : "imagenes"
    Product }o--|| Category : "categorizado"
    Product }o--|| Brand : "marca"

    Order ||--o{ OrderItem : "contiene"
    Order ||--o{ OrderUpdate : "audit trail"
    Order ||--o{ SaleReturn : "devoluciones"
    Order }o--|| Client : "opcional"

    Supplier ||--o{ Product : "provee"

    Client ||--o{ Order : "compra"
```

---

## 1.5 Feature Gates (Auth Gates)

El sistema implementa un control de acceso por plan mediante tres funciones en `src/lib/auth-gates.ts`:

```mermaid
flowchart LR
    subgraph Plan_Hierarchy["Jerarquía de Planes"]
        BASIC["BASIC<br/>1 usuario, 100 productos"] --> PRO["PRO<br/>Multi-caja, Cta. Cte."]
        PRO --> ENTERPRISE["ENTERPRISE<br/>ARCA, Catálogo público"]
    end

    subgraph Gates["Funciones de Control"]
        AWP["assertWritePermission()<br/>Autenticación + No Moroso"]
        RF["requireFeature()<br/>Feature toggle"]
        AL["assertLimit()<br/>Límites operacionales"]
    end

    BASIC --> |hasMultiCashbox: false| RF
    PRO --> |hasMultiCashbox: true| RF
    BASIC --> |hasClientLedger: false| RF
    PRO --> |hasClientLedger: true| RF
    BASIC --> |hasAfipBilling: false| RF
    ENTERPRISE --> |hasAfipBilling: true| RF
    BASIC --> |maxUsers: 1| AL
    PRO --> |maxUsers: 5| AL
    ENTERPRISE --> |maxUsers: ∞| AL
```

### Mapeo Plan → Features

| Feature | BASIC | PRO | ENTERPRISE |
|---------|-------|-----|------------|
| Facturación simple | ✅ | ✅ | ✅ |
| Multi-caja | ❌ | ✅ | ✅ |
| Cuenta Corriente | ❌ | ✅ | ✅ |
| ARCA/AFIP | ❌ | ❌ | ✅ |
| Catálogo público | ❌ | ❌ | ✅ |
| Máx. usuarios | 1 | 5 | ∞ |
| Máx. productos | 100 | 1000 | ∞ |

---

## 1.6 Manejo de Estado (Client-side)

```mermaid
flowchart TD
    subgraph BillProvider
        State["BillState<br/>{ products, total, discount,<br/>paidMethod, client, CAE, ... }"]
        Reducer["BillReducer<br/>(20 action types)"]
        Context["React Context"]
    end

    subgraph "Componentes Consumidores"
        ProductsTable["ProductsTable<br/>Lee productos del carrito"]
        BillButtons["BillButtons<br/>Procesa venta"]
        BillParametersForm["BillParametersForm<br/>Método pago, descuento"]
        PrintModeSelector["PrintModeSelector<br/>Modo de impresión"]
    end

    ProductsTable -->|dispatch| Reducer
    BillButtons -->|dispatch + processSaleAction| Reducer
    BillParametersForm -->|dispatch| Reducer

    Context -->|useContext| ProductsTable
    Context -->|useContext| BillButtons
    Context -->|useContext| BillParametersForm

    Reducer --> State
    State --> Context
```

### Observaciones sobre el Estado

- **20 funciones dispatch individuales** en BillProvider — cada una es un wrapper de `dispatch`
- El patrón **useReducer** es correcto para estado complejo como un carrito
- No hay persistencia del carrito (se pierde al refrescar) — puede ser intencional
- **PrintMode** y **qzTrayActive** se persisten en localStorage
- **onOrderResetRef** permite que componentes hijos registren callbacks de reset

---

## 1.7 Módulos del Sistema

```mermaid
flowchart TD
    Auth["Autenticación<br/>NextAuth.js + Credentials/Google"]
    Billing["Facturación<br/>Carrito, descuentos,<br/>múltiples métodos de pago"]
    Stock["Stock<br/>CRUD productos,<br/>carga Excel masiva"]
    Cash["Caja<br/>Sesiones, apertura/cierre,<br/>reporte Z"]
    Sales["Ventas<br/>Historial, edición,<br/>devoluciones, audit trail"]
    Ledger["Cuenta Corriente<br/>Saldo clientes,<br/>pagos imputados"]
    Reports["Reportes<br/>Diarios, ranking,<br/>actividad de stock"]
    Catalog["Catálogo Público<br/>Online, pedidos,<br/>checkout público"]
    Arca["ARCA/AFIP<br/>Factura electrónica,<br/>CAE, comprobantes"]

    Auth --> Billing
    Auth --> Stock
    Auth --> Cash
    Auth --> Sales
    Auth --> Ledger
    Auth --> Reports
    
    Billing --> Cash
    Billing --> Sales
    Billing --> Stock
    Sales --> Ledger
    Billing --> Arca
    Stock --> Catalog
    
    Sales --> Reports
    Cash --> Reports
```

### Tamaño Relativo de Módulos

| Módulo | Archivos | SLOC Aprox | Server Actions |
|--------|----------|------------|----------------|
| Stock | 15+ | ~2500 | `stock.ts` (854 lines) |
| Ventas | 5 | ~1500 | `sales.ts` (749 lines) |
| Facturación | 10 | ~1200 | Context + Reducer |
| Caja | 4 | ~500 | `cashbox.ts` (290 lines) |
| Cuenta Corriente | 3 | ~400 | `clients.ts` |
| Reportes | 3 | ~350 | `sales.ts` (compartido) |
| ARCA/AFIP | 2 | ~400 | `arca.ts`, `afip.ts` |
| Catálogo Público | 4 | ~300 | `catalog.ts` |

---

## 1.8 Dependencias Externas — Mapa de Riesgo

```mermaid
flowchart LR
    subgraph Core["Core Stack"]
        NextJS["Next.js 16 ⭐"]
        React["React 19 ⭐"]
        Prisma["Prisma 6 ⭐"]
        TS["TypeScript 5 ⭐"]
    end

    subgraph Database["Persistencia"]
        PG["PostgreSQL ⭐"]
        FB["Firebase Storage ⚠️"]
    end

    subgraph Auth["Autenticación"]
        NA["NextAuth.js 5 ⚠️<br/>(beta)"]
    end

    subgraph RealTime["Tiempo Real"]
        PS["Pusher ⭐"]
    end

    subgraph UI["UI Layer"]
        TW["Tailwind 4 ⭐"]
        Radix["Radix UI ⭐"]
        Framer["Framer Motion ⚠️<br/>(pesado)"]
    end

    subgraph External["Externos"]
        ARCA["ARCA API ⚠️<br/>(cambia frecuentemente)"]
        QZT["QZ Tray ⚠️<br/>(impresión fiscal)"]
    end

    style NA fill:#f90,color:#000
    style FB fill:#f90,color:#000
    style Framer fill:#f90,color:#000
    style ARCA fill:#f90,color:#000
    style QZT fill:#f90,color:#000
```

**Leyenda:** ⭐ = Estable / ⚠️ = Riesgo

### Dependencias con Riesgo

| Dependencia | Riesgo | Motivo |
|-------------|--------|--------|
| **NextAuth.js v5** | Alto | Aún en beta, breaking changes frecuentes |
| **Firebase Storage** | Medio | Vendor lock-in, configuración de reglas crítica |
| **Framer Motion** | Bajo | Bundle size pesado, considerar alternativas ligeras |
| **ARCA/AFIP API** | Alto | Cambia con cada gestión gubernamental |
| **QZ Tray** | Medio | Software de escritorio, actualizaciones manuales |
