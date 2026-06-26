---
name: prisma-postgresql
description: Database access best practices with Prisma ORM and PostgreSQL. Covers schema design, queries, transactions, migrations, and TypeScript integration.
license: MIT
metadata:
  author: pos-template
  version: "1.0.0"
---

# Database Access with Prisma and PostgreSQL

Best practices for building robust, type-safe database operations using Prisma ORM.

## When to Apply

Reference these guidelines when:
- Designing database schemas
- Writing database queries
- Implementing transactions
- Setting up Prisma client
- Handling migrations

---

## 1. Schema Design

### Naming Conventions

```prisma
// Use PascalCase for model names
model User {
  id        String   @id @default(cuid())
  email     String   @unique
  createdAt DateTime @default(now())
  
  // Relations use singular names
  orders    Order[]
}

// Use snake_case for field names (Prisma default)
model Order {
  id           String   @id @default(cuid())
  created_at   DateTime @default(now())
  total_amount Decimal  @db.Decimal(10, 2)
}
```

### Relationships

```prisma
model User {
  id        String  @id @default(cuid())
  email     String  @unique
  
  // One-to-many
  orders    Order[]
  
  // One-to-one (with explicit FK)
  profile   Profile?
}

model Profile {
  id     String @id @default(cuid())
  userId String @unique
  user   User   @relation(fields: [userId], references: [id], onDelete: Cascade)
  bio    String?
}

model Order {
  id      String @id @default(cuid())
  userId  String
  user    User   @relation(fields: [userId], references: [id])
  
  items   OrderItem[]
}

// Many-to-many (implicit)
model Category {
  id       String    @id @default(cuid())
  products Product[]
}

model Product {
  id        String     @id @default(cuid())
  categories Category[]
}
```

### Field Types

```prisma
model Product {
  // IDs
  id        String  @id @default(cuid())     // Use CUID for public IDs
  internalId Int    @id @default(autoincrement()) // Use auto-increment for internal
  
  // Strings
  name      String  @db.VarChar(255)
  slug      String  @unique @db.VarChar(100)
  
  // Numbers
  price     Decimal @db.Decimal(10, 2)      // Use Decimal for money
  quantity  Int     @default(0)
  
  // Dates
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  
  // Enums
  status    OrderStatus @default(PENDING)
  
  // Boolean
  isActive  Boolean @default(true)
  
  // JSON
  metadata  Json?                               // Nullable JSON
  settings  Unsupported("jsonb")?               // For PostgreSQL-specific types
}

enum OrderStatus {
  PENDING
  PAID
  SHIPPED
  DELIVERED
  CANCELLED
}
```

---

## 2. Prisma Client Usage

### Singleton Pattern

```typescript
// lib/db.ts
import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const db = globalForPrisma.prisma ?? new PrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
```

### Basic Queries

```typescript
// Find one
const user = await db.user.findUnique({
  where: { id: 'user_123' }
})

// Find first
const activeUser = await db.user.findFirst({
  where: { 
    email: 'test@example.com',
    isActive: true
  }
})

// Find many
const orders = await db.order.findMany({
  where: { userId: 'user_123' },
  orderBy: { createdAt: 'desc' },
  take: 10
})

// Include relations
const userWithOrders = await db.user.findUnique({
  where: { id: 'user_123' },
  include: {
    orders: {
      include: { items: true }
    }
  }
})

// Select specific fields
const userNames = await db.user.findMany({
  select: { id: true, name: true }
})
```

---

## 3. Type Safety

### Generated Types

```typescript
import { Prisma, User, Order } from '@prisma/client'

// Use generated types
type UserWithOrders = Prisma.UserGetInclude<{
  orders: true
}>

// In functions
async function getUserWithOrders(userId: string): Promise<UserWithOrders | null> {
  return db.user.findUnique({
    where: { id: userId },
    include: { orders: true }
  })
}
```

### Typed Where Clauses

```typescript
// Type-safe filters
const users = await db.user.findMany({
  where: {
    email: {
      endsWith: '@example.com',
      not: 'admin@example.com'
    },
    createdAt: {
      gte: new Date('2024-01-01')
    },
    orders: {
      some: {
        status: 'PAID'
      }
    }
  }
})
```

---

## 4. Transactions

### Basic Transaction

```typescript
async function createOrderWithItems(userId: string, items: OrderItemInput[]) {
  return await db.$transaction(async (tx) => {
    // Calculate total
    const total = items.reduce((sum, item) => {
      return sum + item.price * item.quantity
    }, 0)
    
    // Create order
    const order = await tx.order.create({
      data: {
        userId,
        total,
        items: {
          create: items
        }
      }
    })
    
    // Update inventory
    for (const item of items) {
      await tx.product.update({
        where: { id: item.productId },
        data: {
          quantity: { decrement: item.quantity }
        }
      })
    }
    
    return order
  })
}
```

### Interactive Transactions

```typescript
async function transferFunds(fromId: string, toId: string, amount: number) {
  const MAX_RET
  
  forRIES = 3 (let i = 0; i < MAX_RETRIES; i++) {
    try {
      return await db.$transaction(async (tx) => {
        const from = await tx.account.findUnique({ where: { id: fromId } })
        if (!from || from.balance < amount) {
          throw new Error('Insufficient funds')
        }
        
        await tx.account.update({
          where: { id: fromId },
          data: { balance: { decrement: amount } }
        })
        
        await tx.account.update({
          where: { id: toId },
          data: { balance: { increment: amount } }
        })
      })
    } catch (error) {
      if (i === MAX_RETRIES - 1) throw error
      // Retry on serialization failure
    }
  }
}
```

---

## 5. Error Handling

### Known Errors

```typescript
import { Prisma, PrismaClientKnownRequestError } from '@prisma/client'
import { z } from 'zod'

async function createUser(data: unknown) {
  try {
    return await db.user.create({ data: data as Prisma.UserCreateInput })
  } catch (error) {
    if (error instanceof PrismaClientKnownRequestError) {
      // P2002: Unique constraint violation
      if (error.code === 'P2002') {
        throw new Error('Email already exists')
      }
      // P2025: Record not found
      if (error.code === 'P2025') {
        throw new Error('Record not found')
      }
    }
    throw error
  }
}
```

### Custom Error Types

```typescript
class DatabaseError extends Error {
  constructor(message: string, public code: string) {
    super(message)
    this.name = 'DatabaseError'
  }
}

async function safeCreate(data: unknown) {
  try {
    return await db.user.create({ data: data as Prisma.UserCreateInput })
  } catch (error) {
    if (error instanceof PrismaClientKnownRequestError) {
      throw new DatabaseError(
        getUserFriendlyMessage(error.code),
        error.code
      )
    }
    throw error
  }
}

function getUserFriendlyMessage(code: string): string {
  switch (code) {
    case 'P2002': return 'Ya existe un registro con estos datos'
    case 'P2025': return 'El registro no fue encontrado'
    default: return 'Error de base de datos'
  }
}
```

---

## 6. Migrations

### Creating Migrations

```bash
# Create migration with name
npx prisma migrate dev --name add_user_role

# Apply migrations in production
npx prisma migrate deploy

# Reset database (development only!)
npx prisma migrate reset
```

### Migration Best Practices

```prisma
// ✅ Good: nullable fields with defaults
model User {
  id        String  @id @default(cuid())
  role      String  @default("user")  // Add default when adding column
  bio       String? // Nullable - no migration needed to add
}

// ✅ Good: explicit IDs
model Session {
  id        String  @id @default(cuid())
  token     String  @unique
}

// ❌ Bad: changing column types requires table rewrite
model BadExample {
  // Avoid changing type from String to Int
  oldId Int // Don't do this in production
}
```

### Seeding

```typescript
// prisma/seed.ts
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  // Create admin user
  await prisma.user.upsert({
    where: { email: 'admin@example.com' },
    update: {},
    create: {
      email: 'admin@example.com',
      name: 'Admin',
      role: 'ADMIN'
    }
  })
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
```

---

## 7. Performance Optimization

### Indexes

```prisma
model Order {
  id        String   @id @default(cuid())
  userId    String
  status    String
  createdAt DateTime @default(now())
  
  // Index for common queries
  @@index([userId])
  @@index([status, createdAt])  // Composite index
}

// For full-text search
model Product {
  id          String   @id @default(cuid())
  name        String
  description String
  
  @@index([name])  // B-tree for exact match
}
```

### Query Optimization

```typescript
// ✅ Good: select only needed fields
const users = await db.user.findMany({
  select: { id: true, name: true }
})

// ✅ Good: use batch queries for multiple independent queries
const [users, products, orders] = await Promise.all([
  db.user.findMany(),
  db.product.findMany(),
  db.order.findMany()
])

// ✅ Good: pagination
const page = await db.user.findMany({
  skip: (page - 1) * limit,
  take: limit
})

// ❌ Bad: N+1 problem
// Instead of:
for (const order of orders) {
  const items = await db.orderItem.findMany({ where: { orderId: order.id } })
}

// ✅ Good: use include
const ordersWithItems = await db.order.findMany({
  include: { items: true }
})
```

---

## 8. Soft Deletes

```prisma
model User {
  id        String   @id @default(cuid())
  email     String   @unique
  deletedAt DateTime?  // Soft delete timestamp
  
  @@index([deletedAt])  // Filter out deleted records
}
```

### Query with Soft Delete

```typescript
// Use a helper to always filter deleted records
async function findUser(id: string) {
  return db.user.findFirst({
    where: {
      id,
      deletedAt: null
    }
  })
}

// Or use middleware (advanced)
```

---

## 9. Working with JSON

```prisma
model Settings {
  id       String @id @default(cuid())
  userId   String @unique
  data     Json   // Stores any JSON
}
```

```typescript
// Type-safe JSON access
const settings = await db.settings.findUnique({
  where: { userId: '123' }
})

// Type guard for safety
function isNotificationSettings(data: unknown): data is NotificationSettings {
  return (
    typeof data === 'object' &&
    data !== null &&
    'email' in data &&
    'push' in data
  )
}
```

---

## 10. Common Patterns

### Upsert

```typescript
// Create or update
const user = await db.user.upsert({
  where: { email: 'test@example.com' },
  update: { lastLogin: new Date() },
  create: {
    email: 'test@example.com',
    name: 'Test User'
  }
})
```

### Count and Aggregations

```typescript
// Count
const orderCount = await db.order.count({
  where: { userId: '123' }
})

// Aggregation
const stats = await db.order.aggregate({
  where: { userId: '123' },
  _sum: { total: true },
  _avg: { total: true },
  _min: { total: true },
  _max: { total: true }
})
```

### Batch Operations

```typescript
// Create many
const users = await db.user.createMany({
  data: [
    { email: 'a@test.com', name: 'A' },
    { email: 'b@test.com', name: 'B' },
    { email: 'c@test.com', name: 'C' }
  ],
  skipDuplicates: true
})

// Update many
await db.product.updateMany({
  where: { category: 'electronics' },
  data: { isActive: true }
})
```

---

## References

1. https://www.prisma.io/docs
2. https://www.prisma.io/docs/guides/performance-and-optimization
3. https://www.postgresql.org/docs/
