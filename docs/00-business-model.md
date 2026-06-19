# Modelo de Negocio

> Documento integral que describe el modelo de negocio del sistema POS, el diagrama de la base de datos y los diagramas de actividad de las funcionalidades principales.

---

## 1. Descripción General del Negocio

### 1.1 ¿Qué es este sistema?

Este es un **Sistema de Punto de Venta (POS)** moderno, diseñado como **SaaS multi-tenant** para comercios argentinos. Permite gestionar ventas, stock, caja, clientes, facturación electrónica (ARCA/AFIP) y catálogo público desde una única plataforma web.

### 1.2 Modelo de Negocio

| Aspecto | Descripción |
|---------|-------------|
| **Tipo** | SaaS multi-tenant |
| **Tenant** | Cada `Business` es un tenant independiente con sus propios datos |
| **Monetización** | Planes por suscripción (BASIC, PRO, ENTERPRISE) con features progresivos |
| **Mercado** | Comercios argentinos (soporte ARCA, IVA, CUIT, condiciones fiscales) |
| **Usuarios** | Multi-rol por comercio (SUPER_ADMIN, ADMIN, USER) |

### 1.3 Planes y Feature Gates

El sistema controla el acceso a funcionalidades mediante **feature gates** basados en el plan contratado:

```mermaid
flowchart LR
    subgraph Planes
        BASIC[BASIC<br/>1 usuario, 100 productos]
        PRO[PRO<br/>Multi-caja, Cuenta Corriente]
        ENTERPRISE[ENTERPRISE<br/>ARCA, Catálogo Público]
    end

    subgraph Features
        MC[Multi CashBox]
        CL[Cuenta Corriente]
        AF[Factura Electrónica ARCA]
        CP[Catálogo Público]
    end

    BASIC -->|Límites base| MC
    PRO -->|Habilitado| MC
    PRO -->|Habilitado| CL
    ENTERPRISE -->|Habilitado| AF
    ENTERPRISE -->|Habilitado| CP
```

| Plan | Usuarios | Productos | Features |
|------|----------|-----------|----------|
| **BASIC** | 1 | 100 | Funcionalidades base |
| **PRO** | Ilimitado | Ilimitado | Multi-caja, Cuenta Corriente |
| **ENTERPRISE** | Ilimitado | Ilimitado | + ARCA, + Catálogo Público |

### 1.4 Multi-tenancy

Cada `Business` opera como un tenant completamente aislado. **TODAS** las consultas a la base de datos filtran por `businessId`:

```
Business A (slug: "tienda-juan")
├── Productos, Clientes, Proveedores
├── Cajas, Sesiones, Órdenes
└── Configuración ARCA propia

Business B (slug: "comercio-maria")
├── Productos, Clientes, Proveedores
├── Cajas, Sesiones, Órdenes
└── Configuración ARCA propia
```

### 1.5 Stack Tecnológico

| Capa | Tecnología |
|------|-----------|
| **Framework** | Next.js 15 (App Router) |
| **Frontend** | React 19, Tailwind CSS v4, Radix UI |
| **ORM** | Prisma 6 + PostgreSQL |
| **Auth** | NextAuth.js v5 (Auth.js) |
| **Validación** | Zod + React Hook Form |
| **Tiempo Real** | Pusher (WebSockets) |
| **Facturación ARCA** | Google Cloud Functions |
| **Imágenes** | Firebase Storage |

---

## 2. Diagrama de la Base de Datos

### 2.1 Modelo Entidad-Relación (ERD)

```mermaid
erDiagram
    Business ||--o{ User : "tiene usuarios"
    Business ||--o{ Product : "tiene productos"
    Business ||--o{ Client : "tiene clientes"
    Business ||--o{ Supplier : "tiene proveedores"
    Business ||--o{ Category : "tiene categorías"
    Business ||--o{ Subcategory : "tiene subcategorías"
    Business ||--o{ Brand : "tiene marcas"
    Business ||--o{ CashBox : "tiene cajas"
    Business ||--o{ CashboxSession : "tiene sesiones de caja"
    Business ||--o{ Order : "tiene órdenes/ventas"
    Business ||--o{ ProductRanking : "tiene rankings"
    Business ||--o{ CashMovement : "tiene movimientos de caja"
    Business ||--o{ StockMovement : "tiene movimientos de stock"
    Business ||--o{ SaleReturn : "tiene devoluciones"
    Business ||--o{ OrderUpdate : "tiene historial de órdenes"
    Business ||--|| BusinessFeatures : "tiene configuración de plan"

    User ||--o{ CashboxSession : "abre sesiones"
    User ||--o{ OrderUpdate : "edita órdenes"
    User }o--|| CashBox : "asignado a caja"

    CashBox ||--o{ CashboxSession : "tiene sesiones"

    CashboxSession ||--o{ Order : "registra ventas en sesión"
    CashboxSession ||--o{ CashMovement : "registra movimientos"

    Category ||--o{ Subcategory : "tiene subcategorías"
    Category ||--o{ Product : "clasifica productos"
    Subcategory ||--o{ Product : "subclasifica productos"
    Brand ||--o{ Product : "marca productos"
    Supplier ||--o{ Product : "provee productos"

    Product ||--o{ OrderItem : "se vende en órdenes"
    Product ||--o{ StockMovement : "tiene movimientos de stock"
    Product ||--o{ ProductRanking : "tiene ranking mensual"
    Product ||--o{ ProductImage : "tiene imágenes"
    Product ||--o{ SaleReturnItem : "se devuelve"

    Client ||--o{ Order : "realiza compras"

    Order ||--o{ OrderItem : "contiene items"
    Order ||--o{ SaleReturn : "tiene devoluciones"
    Order ||--o{ OrderUpdate : "tiene historial de cambios"
    Order ||--o{ CashMovement : "genera movimientos de caja"
    Order ||--o{ StockMovement : "genera movimientos de stock"

    SaleReturn ||--o{ SaleReturnItem : "contiene items devueltos"
    OrderItem ||--o{ SaleReturnItem : "se devuelve parcialmente"
```

### 2.2 Diagrama de Estados

```mermaid
stateDiagram-v2
    [*] --> Business: Registro del comercio

    state Business {
        [*] --> ACTIVO
        ACTIVO --> MOROSO: Facturas impagas
        MOROSO --> ACTIVO: Pago recibido
        ACTIVO --> DESACTIVADO: Desactivación manual
    }

    state Order {
        [*] --> pendiente: Pedido desde catálogo público
        pendiente --> confirmado: Comercio confirma
        confirmado --> entregado: Cliente retira
        confirmado --> consignacion: En consignación
        pendiente --> [*]: Comercio cancela
    }

    state Payment {
        [*] --> inpago: Venta a crédito
        inpago --> pago: Pago registrado (total o parcial)
    }

    state CashboxSession {
        [*] --> OPEN: Apertura con saldo inicial
        OPEN --> CLOSED: Cierre con reporte Z
    }

    state StockMovement {
        SALE --> Negativo: Venta
        RETURN --> Positivo: Devolución
        ADJUSTMENT --> Positivo_Negativo: Ajuste manual
        PURCHASE --> Positivo: Compra a proveedor
    }
```

### 2.3 Modelos Principales

#### Business (Tenant)

```prisma
model Business {
  id   String  @id @default(cuid())
  name String
  slug String  @unique

  // Owner
  userId String? @unique

  // Multi-tenancy: todas las entidades hijas
  products        Product[]
  clients         Client[]
  suppliers       Supplier[]
  orders          Order[]
  cashBoxes       CashBox[]
  cashboxSessions CashboxSession[]

  // Configuración ARCA (factura electrónica argentina)
  cuit              String?
  condicionIva      IvaCondition  @default(MONOTRIBUTO)
  cert              String?       @db.Text  // Certificado encriptado
  key               String?       @db.Text  // Clave privada encriptada
  ptoVenta          Int[]         @default([])

  // Estado de cuenta
  accountStatus     BusinessStatus @default(ACTIVO)
  lastPaymentDate   DateTime?

  // Branding
  brandLogo           String?
  brandPrimaryColor   String?     @default("#2563eb")
  brandSecondaryColor String?     @default("#f59e0b")

  // Plan y features
  features            BusinessFeatures?
}
```

#### Order (Venta)

```prisma
model Order {
  id         String      @id @default(cuid())
  date       DateTime    @default(now())
  total      Float       @default(0)
  status     OrderStatus @default(confirmado)
  paidStatus PaidStatus  @default(inpago)
  seller     String?

  // Métodos de pago (soporta pago dividido en 2 métodos)
  paymentMethod  String? @default("Efectivo")
  paymentMethod2 String?
  totalMethod2   Float?  @default(0)

  // Descuentos
  discountPercentage Float @default(0)
  discountAmount     Float @default(0)

  // Cliente
  clientId String?
  client   Client?

  // Factura electrónica ARCA
  CAE Json?  // { CAE, nroComprobante, vencimiento, qrData }

  // Sesión de caja
  cashboxSessionId String?
  cashboxSession   CashboxSession?

  // Relaciones
  items          OrderItem[]
  returns        SaleReturn[]
  stockMovements StockMovement[]
  updates        OrderUpdate[]
  cashMovements  CashMovement[]
}
```

#### Product (Producto)

```prisma
model Product {
  id          String  @id @default(cuid())
  code        String?    // Código de barras / SKU
  description String?    // Nombre del producto

  // Clasificación jerárquica
  brandId     String?
  brand       Brand?
  categoryId  String?
  category    Category?
  subCategoryId String?
  subCategory   Subcategory?

  // Precios
  price     Float @default(0)  // Precio de costo
  salePrice Float @default(0)  // Precio de venta
  gain      Float @default(0)  // Margen de ganancia (%)

  // Stock
  amount Float @default(0)
  unit   String?  // "unidades", "kg", "litros", etc.

  // Proveedor
  supplierId String?
  supplier   Supplier?

  // Catálogo público
  catalog Boolean @default(true)
  details String?

  // Historial de ventas
  rankings ProductRanking[]
}
```

---

## 3. Diagramas de Actividad — Features Principales

### 3.1 Flujo Completo de Venta (Core del Negocio)

El flujo de venta es el **corazón del sistema**. Conecta los módulos de facturación, caja, stock y ranking en una sola transacción atómica.

```mermaid
flowchart TD
    INICIO([Usuario abre NewBill]) --> CAJA{Sesión de caja abierta?}
    CAJA -->|No| ABRIR[Abrir sesión con saldo inicial]
    CAJA -->|Sí| PARAMS[Configurar parámetros de factura]
    ABRIR --> PARAMS

    PARAMS --> CLIENTE[Seleccionar o crear cliente]
    CLIENTE --> PRODUCTOS[Agregar productos al carrito]

    PRODUCTOS --> DESCUENTO[Aplicar descuento % si corresponde]
    DESCUENTO --> PAGO[Seleccionar método de pago]
    PAGO --> DIVIDIDO{Pago dividido?}
    DIVIDIDO -->|Sí| METODO2[Seleccionar segundo método + montos]
    DIVIDIDO -->|No| CONTINUE

    METODO2 --> CONTINUE
    CONTINUE --> ARCA{Factura electrónica?}

    ARCA -->|Sí - Plan Enterprise| CAE[Obtener CAE de ARCA vía Cloud Function]
    ARCA -->|No| PROCESAR

    CAE --> PROCESAR

    subgraph TX[Transacción Prisma - Atómica]
        PROCESAR --> ORDER[Crear Order + OrderItems]
        ORDER --> STOCK[Descontar stock: product.amount -= quantity]
        STOCK --> STOCKMOV[Crear StockMovement type: SALE]
        STOCKMOV --> RANKING[Upsert ProductRanking mensual]
        RANKING --> CAJA_EF[Solo si Efectivo: CashBox.total += monto]
        CAJA_EF --> CAJAMOV[Crear CashMovement(s)]
    end

    TX --> PUSHER[Notificar vía Pusher]
    PUSHER --> REVALIDATE[Revalidar rutas afectadas]
    REVALIDATE --> IMPRIMIR[Imprimir comprobante]
    IMPRIMIR --> FIN([Venta procesada ✓])

    style TX fill:#e6f3ff,stroke:#4a90d9,stroke-width:2px
    style FIN fill:#d4edda,stroke:#28a745,stroke-width:2px
```

**Reglas de Negocio Clave:**
- El stock se descuenta **en la misma transacción** que se crea la orden
- Los movimientos de caja solo se registran para pagos en **Efectivo**
- El ranking mensual se actualiza con `upsert` (acumula ventas del mes)
- La sesión de caja debe estar **OPEN** para poder procesar ventas

---

### 3.2 Gestión de Caja (Cash Register)

Cada usuario debe abrir una sesión de caja al iniciar su jornada. Al cerrarla, se genera un **Reporte Z** con el resumen del día.

```mermaid
flowchart TD
    INICIO([Usuario inicia jornada]) --> ASIGNA{Tiene caja asignada?}
    ASIGNA -->|No| ERROR[Error: Sin caja asignada]
    ASIGNA -->|Sí| EXISTE{Ya hay sesión OPEN?}
    EXISTE -->|Sí| ERROR2[Error: Sesión duplicada]
    EXISTE -->|No| SALDO[Ingresar saldo inicial en efectivo]
    SALDO --> OPEN[openSession: Crear CashboxSession]

    subgraph JORNADA[Jornada de Trabajo]
        OPEN --> VENTAS[Procesar ventas → CashMovements]
        VENTAS --> MOV_EGRESO[ Registrar egresos si aplica]
        MOV_EGRESO --> VENTAS
    end

    VENTAS --> CIERRE[Usuario inicia cierre]
    CIERRE --> CALC[Calcular totales de la sesión]
    CALC --> Z_GEN[Generar Reporte Z]

    subgraph REPORTE_Z[Reporte Z]
        Z_GEN --> Z_DATA[Totals: ventas, descuentos, devoluciones]
        Z_DATA --> Z_PAY[Desglose por método de pago]
        Z_PAY --> Z_DIFF[Diferencia: esperado vs declarado]
    end

    Z_DIFF --> DECLARAR[Usuario declara saldo final]
    DECLARAR --> CLOSE[closeSession: Cerrar sesión]
    CLOSE --> CB_UPDATE[Actualizar CashBox.total]
    CB_UPDATE --> FIN([Sesión cerrada ✓])

    style TX fill:#e6f3ff,stroke:#4a90d9,stroke-width:2px
    style FIN fill:#d4edda,stroke:#28a745,stroke-width:2px
    style ERROR fill:#f8d7da,stroke:#dc3545,stroke-width:2px
    style ERROR2 fill:#f8d7da,stroke:#dc3545,stroke-width:2px
```

**Reporte Z - Estructura:**

| Campo | Descripción | Ejemplo |
|-------|-------------|---------|
| `totalSales` | Suma de ventas | $125,000 |
| `totalDiscounts` | Descuentos aplicados | -$5,200 |
| `totalReturns` | Devoluciones | -$3,400 |
| `netTotal` | Ventas - Devoluciones | $121,600 |
| `orderCount` | Cantidad de transacciones | 45 |
| `paymentMethods` | Desglose por método | Efectivo: $85K, Tarjeta: $28K |
| `expectedFinalBalance` | Saldo calculado | $150,000 |
| `declaredFinalBalance` | Saldo declarado por usuario | $149,800 |
| `difference` | Diferencia (ideal: 0) | -$200 |

---

### 3.3 Gestión de Stock y Productos

El sistema soporta tanto operaciones unitarias como carga masiva por Excel con cálculo automático de precios.

```mermaid
flowchart TD
    INICIO_GESTION([Gestión de Productos]) --> MODO{Modo de operación}

    MODO -->|Individual| CRUD[CRUD de producto]
    MODO -->|Masivo| EXCEL[Carga por Excel/CSV]

    subgraph CRUD[Operaciones Individuales]
        CRUD_CREAR[Crear producto<br/>código, descripción, precio]
        CRUD_ACT[Actualizar producto<br/>precio, stock, imágenes]
        CRUD_ELIM[Eliminar producto]
    end

    subgraph BULK[Carga Masiva]
        EXCEL --> UPLOAD[Subir archivo Excel]
        UPLOAD --> SUPPLIER[Seleccionar proveedor]
        SUPPLIER --> FORMULA[Configurar fórmula de precios]

        subgraph FORMULA_SEC[Fórmula de Precios]
            FORMULA_DESC[Descuento % del proveedor]
            FORMULA_IVA[IVA: 0%, 10.5% o 21%]
            FORMULA_GAIN[Ganancia % deseada]
            FORMULA_CALC[ costPrice = filePrice × (1 - discount/100) × (1 + iva/100)<br/>salePrice = costPrice × (1 + gain/100) ]
        end

        FORMULA_CALC --> PREVIEW[Vista previa de cambios]
        PREVIEW --> CLASIF{Clasificar productos}

        CLASIF -->|Nuevo| CREATE[Marcar como CREATE]
        CLASIF -->|Existe + cambio| UPDATE[Marcar como UPDATE]
        CLASIF -->|Sin cambios| IGNORE[Marcar como IGNORE]

        CREATE --> CONFIRMAR[Confirmar carga]
        UPDATE --> CONFIRMAR
        IGNORE --> CONFIRMAR

        CONFIRMAR --> BULK_EXEC[createProductsBulk]
        BULK_EXEC --> BULK_TX[Transacción: crear/actualizar productos]
        BULK_TX --> SAVE_SUPPLIER[Guardar fórmula en proveedor]
    end

    CRUD --> FIN_CRUD([Producto actualizado ✓])
    BULK --> FIN_BULK([Carga masiva completada ✓])

    style BULK fill:#e6f3ff,stroke:#4a90d9,stroke-width:2px
    style FORMULA_SEC fill:#fff3cd,stroke:#ffc107,stroke-width:1px
    style FIN_CRUD fill:#d4edda,stroke:#28a745,stroke-width:2px
    style FIN_BULK fill:#d4edda,stroke:#28a745,stroke-width:2px
```

**Clasificación Jerárquica de Productos:**

```mermaid
flowchart LR
    B[Brand<br/>Marca] --> P1[Product A]
    C[Category<br/>Categoría] --> SC1[Subcategory 1]
    C --> SC2[Subcategory 2]
    SC1 --> P2[Product B]
    SC2 --> P3[Product C]
    B --> P2
    S[Supplier<br/>Proveedor] --> P1
    S --> P2
```

---

### 3.4 Cuenta Corriente (Client Ledger)

Permite a los comercios vender a crédito y registrar pagos parciales. Feature disponible en plan **PRO+**.

```mermaid
flowchart TD
    INICIO_CC([Venta a crédito]) --> GATE{Plan PRO o superior?}
    GATE -->|No| ERROR[Error: Feature no disponible]
    GATE -->|Sí| CREAR[createUnpaidOrder]

    subgraph CREAR_TX[Transacción de Orden Impaga]
        CREAR --> VALIDAR[Validar stock de productos]
        VALIDAR --> ORDER_CC[Crear Order - paidStatus: inpago]
        ORDER_CC --> STOCK_CC[Descontar stock]
        STOCK_CC --> STOCKMOV_CC[Crear StockMovement type: SALE]
        STOCKMOV_CC --> RANKING_CC[Actualizar ProductRanking]
        RANKING_CC --> BALANCE_INC[Cliente.balance += total]
    end

    BALANCE_INC --> PENDIENTE([Orden impaga registrada - Cliente debe saldo])

    PENDIENTE --> PAGO[Usuario registra pago]
    PAGO --> registerPayment{Validar monto}

    registerPayment -->|Monto > saldo restante| ERROR2[Error: Excede el saldo]
    registerPayment -->|Monto ≤ saldo restante| TX_PAGO

    subgraph TX_PAGO[Transacción de Pago]
        TX_PAGO_START[Crear CashMovement]
        TX_PAGO_START --> BALANCE_DEC[Cliente.balance -= monto]
        BALANCE_DEC --> CHECK_SALDO{Saldo restante ≤ 0?}
        CHECK_SALDO -->|Sí| MARCAR_PAGO[Order.paidStatus = pago]
        CHECK_SALDO -->|No| MANTENER_INPAGO[Order.paidStatus = inpago]
    end

    MARCAR_PAGO --> PAGO_TOTAL([Pago total registrado ✓])
    MANTENER_INPAGO --> PAGO_PARCIAL([Pago parcial registrado - Saldo pendiente])

    PENDIENTE --> CANCELAR[Usuario cancela orden impaga]
    CANCELAR --> CANCEL_TX[Transacción: revertir stock, balance, ranking]
    CANCEL_TX --> ORDEN_CANCELADA([Orden cancelada ✓])

    style CREAR_TX fill:#e6f3ff,stroke:#4a90d9,stroke-width:2px
    style TX_PAGO fill:#e6f3ff,stroke:#4a90d9,stroke-width:2px
    style ERROR fill:#f8d7da,stroke:#dc3545,stroke-width:2px
    style ERROR2 fill:#f8d7da,stroke:#dc3545,stroke-width:2px
```

---

### 3.5 Edición de Ventas con Historial

Operación restringida a **ADMINs** que mantiene un registro completo de cada cambio (event sourcing).

```mermaid
flowchart TD
    INICIO_EDIT([ADMIN edita venta]) --> AUTH{Solo rol ADMIN?}
    AUTH -->|No| ERROR[Error: Sin permiso]
    AUTH -->|Sí| FIND[Buscar orden + items actuales]

    FIND --> SNAPSHOT{¿Cada 10 versiones?}
    SNAPSHOT -->|Sí| SAVE_SNAP[Guardar snapshot completo]
    SNAPSHOT -->|No| SKIP

    SAVE_SNAP --> HISTORY[Crear OrderUpdate con diff]
    SKIP --> HISTORY

    HISTORY --> REVERT_STOCK[Revertir stock ANTERIOR]
    REVERT_STOCK --> DELETE_ITEMS[Eliminar OrderItems viejos]
    DELETE_ITEMS --> CREATE_ITEMS[Crear OrderItems NUEVOS]
    CREATE_ITEMS --> APPLY_STOCK[Descontar stock NUEVO]
    APPLY_STOCK --> REVALIDATE[Revalidar rutas]
    REVALIDATE --> PUSHER[Notificar vía Pusher]
    PUSHER --> FIN([Venta editada ✓ - Versión +1])

    style ERROR fill:#f8d7da,stroke:#dc3545,stroke-width:2px
    style FIN fill:#d4edda,stroke:#28a745,stroke-width:2px
```

**Estructura de OrderUpdate (Historial):**

```typescript
{
  version: 1,           // Secuencial por orden
  type: "ITEMS_UPDATED", // Tipo de cambio
  updatedBy: "Admin",    // Quién lo hizo
  changes: {             // Diff detallado
    items: [
      { productId: "p1", oldQuantity: 2, newQuantity: 3 },
      { productId: "p2", action: "added", quantity: 1 }
    ]
  },
  snapshot: { ... }      // Snapshot completo (cada 10 versiones)
}
```

---

### 3.6 Catálogo Público y Pedidos Online

Feature **Enterprise** que permite a los clientes ver productos y hacer pedidos sin autenticarse.

```mermaid
sequenceDiagram
    actor C as Cliente
    participant CAT as Catálogo Público
    participant SA as createPublicOrder
    participant DB as PostgreSQL
    participant PS as Pusher
    participant BO as Backoffice

    C->>CAT: Navega productos (solo catalog: true)
    C->>CAT: Agrega al carrito público
    C->>CAT: Completa formulario de checkout

    CAT->>SA: createPublicOrder({ items, client, total })

    SA->>SA: Validar con Zod

    SA->>DB: $transaction
    DB->>DB: Buscar o crear cliente por DNI
    DB->>DB: Crear Order (status: pendiente)
    Note over DB: Stock NO se descuenta aún

    DB-->>SA: { orderId }
    SA->>PS: trigger("orders-update")
    SA-->>CAT: { success }
    CAT-->>C: "Pedido registrado"

    PS-->>BO: Notificación en tiempo real
    BO->>BO: Revisar pedido
    BO->>BO: updateOrderStatus → confirmado
    BO->>DB: DESCONTAR stock recién aquí
    BO-->>C: Pedido confirmado
```

### 3.7 Factura Electrónica ARCA/AFIP

Integración con ARCA (ex AFIP) para emitir comprobantes electrónicos con CAE. Feature **Enterprise** que requiere configuración fiscal del negocio.

```mermaid
sequenceDiagram
    actor V as Vendedor
    participant UI as NewBill
    participant SA as processSaleAction
    participant AFIP as createAfipVoucherAction
    participant CF as Cloud Function
    participant ARCA as ARCA WS

    V->>UI: Configurar tipo comprobante (Factura A/B/C)
    V->>UI: Ingresar datos fiscales del cliente (CUIT/DNI, condición IVA)
    V->>UI: Agregar productos
    V->>UI: Click "Facturar con ARCA"

    UI->>AFIP: createAfipVoucherAction(billState)

    AFIP->>AFIP: Verificar feature: hasAfipBilling
    AFIP->>AFIP: Obtener credenciales: cert + key encriptados
    AFIP->>CF: POST /createAFIPVoucher (con cert, key, cuit, billState)

    CF->>ARCA: Llamada a WS de ARCA
    ARCA-->>CF: { CAE, vencimiento, nroComprobante, qrData }
    CF-->>AFIP: response

    AFIP-->>UI: { success, data: { CAE, qrData } }
    UI->>UI: Almacenar CAE en BillContext

    V->>UI: Click "Procesar Venta"

    UI->>SA: processSaleAction(billState + CAE)
    SA->>DB: Transacción: venta + CAE en Order
    DB-->>SA: OK

    SA-->>UI: { success, orderId }
    UI-->>V: ["Factura electrónica emitida - CAE: 123456789..."]

    Note over V,ARCA: El CAE se almacena como JSON en Order.CAE<br/>y se incluye en el comprobante impreso/PDF
```

---

### 3.8 Devoluciones (Sale Returns)

```mermaid
sequenceDiagram
    actor V as Vendedor
    participant SA as processReturnAction
    participant DB as Prisma TX
    participant PS as Pusher

    V->>SA: processReturnAction({ orderId, items, reason })

    SA->>DB: $transaction

    par Transacción Atómica
        DB->>DB: Crear SaleReturn + SaleReturnItems
        DB->>DB: Incrementar stock: product.amount += quantity
        DB->>DB: Crear StockMovement (type: RETURN, quantity: positivo)
        DB->>DB: Decrementar CashBox.total (solo si fue efectivo)
        DB->>DB: Crear CashMovement (total: negativo)
    end

    DB-->>SA: { returnId }
    SA->>PS: trigger("orders-update")
    SA->>PS: trigger("new-movement")
    SA->>SA: revalidatePath()
    SA-->>V: { success, returnId }
    V->>V: toast.success("Devolución procesada")
```

### 3.9 Reportes

```mermaid
flowchart TD
    R[Reportes] --> PERIOD{Período}

    PERIOD -->|Diario| DAILY[Hoy 00:00 - 23:59]
    PERIOD -->|Mensual| MONTHLY[1 del mes - Último día del mes]
    PERIOD -->|Anual| YEARLY[1 de enero - 31 de diciembre]

    DAILY --> QUERY[getDailyReportAction]
    MONTHLY --> QUERY
    YEARLY --> QUERY

    QUERY --> PARALLEL[Tres consultas en paralelo]

    subgraph PARALLEL_QUERIES[Consultas Paralelas]
        Q1[Órdenes pagas del período]
        Q2[Devoluciones del período]
        Q3[Movimientos de stock del período]
    end

    PARALLEL --> AGG[Agregar datos]

    subgraph REPORT[Reporte Generado]
        R1[Total de ventas]
        R2[Total de descuentos]
        R3[Total de devoluciones]
        R4[Neto: Ventas - Devoluciones]
        R5[Cantidad de transacciones]
        R6[Desglose por método de pago]
        R7[Actividad de stock: más vendidos]
    end

    AGG --> REPORT
    REPORT --> DISPLAY[Mostrar en PeriodicReport component]
```

---

## 4. Flujo de Datos Transversal

### 4.1 Ciclo de Vida de una Transacción

```mermaid
flowchart LR
    subgraph UI[Frontend - Client Component]
        A[Usuario interactúa]
        B[useReducer dispatch]
        C[Llama Server Action]
    end

    subgraph SA[Server Action]
        D[auth + businessId]
        E[$transaction Prisma]
        F[Pusher trigger]
        G[revalidatePath]
    end

    subgraph DB[PostgreSQL]
        H[(Datos del negocio)]
    end

    A --> B --> C --> SA
    D --> E --> H
    H --> E
    E --> F --> UI
    E --> G --> UI
```

### 4.2 WebSockets (Pusher) - Tiempo Real

```mermaid
flowchart LR
    SA[Server Action] -->|1. DB Write| DB[(PostgreSQL)]
    SA -->|2. Pusher trigger| WS[Pusher Channels]
    SA -->|3. revalidatePath| CACHE[Next.js Cache]

    WS -->|Cliente A| REFRESH_A[Recarga UI]
    CACHE -->|Cliente B nuevo request| FETCH[Fetch nuevos datos]

    REFRESH_A --> FETCH

    subgraph CANALES[Canales Pusher]
        O[orders-{businessId}]
        M[movements-{businessId}]
    end

    WS --> O
    WS --> M

    O --> ORDERS[orders-update<br/>Nuevas órdenes, cambios]
    M --> MOVEMENTS[new-movement<br/>Movimientos de caja]
    M --> REFRESH[refresh<br/>CRUD productos]
```

---

## 5. Índice de Módulos

| # | Módulo | Descripción | Documentación |
|---|--------|-------------|---------------|
| 1 | **Arquitectura General** | Stack, estructura, patrones, flujo de datos | [01-architecture.md](./01-architecture.md) |
| 2 | **Autenticación** | NextAuth.js, roles, gates, plan-based features | [02-auth.md](./02-auth.md) |
| 3 | **Facturación** | Creación de facturas, carrito, medios de pago, descuentos | [03-billing.md](./03-billing.md) |
| 4 | **Caja** | Sesiones de caja, apertura/cierre, reporte Z | [04-cash-register.md](./04-cash-register.md) |
| 5 | **Stock y Productos** | CRUD, proveedores, marcas, categorías, carga masiva | [05-stock.md](./05-stock.md) |
| 6 | **Ventas y Cuenta Corriente** | Historial, edición, devoluciones, cuenta corriente | [06-sales-ledger.md](./06-sales-ledger.md) |
| 7 | **Reportes** | Reportes diarios, mensuales, anuales, ranking | [07-reports.md](./07-reports.md) |
| 8 | **Catálogo Público** | Catálogo online, pedidos públicos, checkout | [08-public-catalog.md](./08-public-catalog.md) |
| 9 | **ARCA/AFIP** | Factura electrónica, CAE, Cloud Functions | [09-arca-afip.md](./09-arca-afip.md) |
| 10 | **Tiempo Real** | Pusher, WebSockets, eventos | [10-realtime.md](./10-realtime.md) |
| 11 | **Búsqueda de Facturas** | Filtros avanzados, búsqueda histórica | [11-search-bills.md](./11-search-bills.md) |
| 12 | **Modelos de Datos** | Esquema Prisma completo con relaciones | [12-data-models.md](./12-data-models.md) |

---

## 6. Convenciones de Datos

| Concepto | Convención |
|----------|------------|
| **IDs** | `cuid()` generados por Prisma |
| **Fechas** | `date` / `createdAt`: creación; `updatedAt`: última modificación; `startTime`/`endTime`: sesiones |
| **Montos** | `Float` (PostgreSQL real), siempre positivos excepto `CashMovement.total` (negativo = egreso) |
| **Stock** | `StockMovement.quantity`: negativo = salida, positivo = entrada |
| **Multi-tenancy** | Toda consulta incluye `businessId` en el WHERE |
| **Pago dividido** | Dos métodos de pago: `paymentMethod` + `paymentMethod2` con `totalMethod2` |
| **Errores** | Server Actions retornan `{ success, ... }` o `{ error: string }` |
