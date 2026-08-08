---
name: nextjs-development
description: Next.js 15 App Router best practices including Server Components, Server Actions, data fetching, and performance optimization. Use when building or maintaining Next.js applications.
license: MIT
metadata:
  author: pos-template
  version: "1.0.0"
---

# Next.js Development

Best practices for building modern Next.js applications using App Router, Server Components, and Server Actions.

## When to Apply

Reference these guidelines when:
- Creating new pages, layouts, or components in Next.js
- Implementing Server Actions and API routes
- Setting up data fetching patterns
- Optimizing rendering performance
- Handling authentication and authorization

---

## 1. Server Components vs Client Components

**Default to Server Components.** Only add `"use client"` when you need:
- React hooks (useState, useEffect, useRef)
- Event handlers (onClick, onChange)
- Browser-only APIs (localStorage, window)

### Example: Choosing the Right Component Type

```tsx
// Server Component - default (faster, smaller bundle)
async function ProductPage({ params }: { params: { id: string } }) {
  const product = await getProduct(params.id)
  return <ProductDetails product={product} />
}

// Client Component - only when needed
'use client'
function AddToCartButton({ productId }: { productId: string }) {
  const [quantity, setQuantity] = useState(1)
  
  return (
    <button onClick={() => addToCart(productId, quantity)}>
      Add to Cart
    </button>
  )
}
```

### Passing Data from Server to Client

```tsx
// Server: serialize only what's needed
async function Page() {
  const product = await db.product.findUnique({ where: { id } })
  return <ClientComponent 
    name={product.name}        // string - serialized once
    price={product.price}     // number - serialized once
    // Don't pass: full product object with 50 fields
  />
}
```

---

## 2. Server Actions

Server Actions are public endpoints. Always authenticate and validate inside them.

### Authentication and Authorization

```typescript
'use server'

import { auth } from '@/lib/auth'
import { z } from 'zod'

const updateSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100)
})

export async function updateProduct(data: unknown) {
  // 1. Validate input
  const validated = updateSchema.parse(data)
  
  // 2. Authenticate
  const session = await auth()
  if (!session) {
    throw new Error('Unauthorized')
  }
  
  // 3. Authorize
  const product = await db.product.findUnique({ where: { id: validated.id } })
  if (product.userId !== session.user.id) {
    throw new Error('Forbidden')
  }
  
  // 4. Mutate
  await db.product.update({
    where: { id: validated.id },
    data: { name: validated.name }
  })
  
  revalidatePath('/products')
  return { success: true }
}
```

### Returning Errors

```typescript
'use server'

export async function createOrder(data: OrderInput) {
  try {
    const order = await db.order.create({ data })
    return { success: true, data: order }
  } catch (error) {
    console.error('Error creating order:', error)
    return { success: false, error: 'No se pudo crear la orden' }
  }
}
```

---

## 3. Data Fetching Patterns

### Parallel Fetching (Avoid Waterfalls)

```tsx
// Bad: sequential - waits for user before fetching posts
async function Page({ userId }: { userId: string }) {
  const user = await getUser(userId)         // Wait 100ms
  const posts = await getUserPosts(userId)   // Wait another 100ms
  return <UserProfile user={user} posts={posts} />
}

// Good: parallel - both fetch simultaneously
async function Page({ userId }: { userId: string }) {
  const userPromise = getUser(userId)
  const postsPromise = getUserPosts(userId)
  
  const [user, posts] = await Promise.all([
    userPromise,
    postsPromise
  ])
  
  return <UserProfile user={user} posts={posts} />
}
```

### Suspense Boundaries

```tsx
function Page() {
  return (
    <div>
      <Header />              {/* Renders immediately */}
      <Suspense fallback={<Skeleton />}>
        <UserList />          {/* Waits for data */}
      </Suspense>
      <Footer />              {/* Renders immediately */}
    </div>
  )
}
```

### Caching with React.cache()

```typescript
import { cache } from 'react'

export const getUser = cache(async (id: string) => {
  return db.user.findUnique({ where: { id } })
})

// Multiple calls in same request = single DB query
const user1 = getUser('1')
const user2 = getUser('1')  // Cache hit!
```

---

## 4. Route Handlers (API Routes)

### Authentication in Route Handlers

```typescript
import { auth } from '@/lib/auth'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const session = await auth()
  
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  
  const data = await fetchUserData(session.user.id)
  return NextResponse.json({ data })
}
```

### Parallel Operations

```typescript
export async function GET(request: Request) {
  const sessionPromise = auth()
  const configPromise = getConfig()
  
  const session = await sessionPromise
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  
  const [config, data] = await Promise.all([
    configPromise,
    getData(session.user.id)
  ])
  
  return NextResponse.json({ config, data })
}
```

---

## 5. Middleware and Routing

### Middleware for Protection

```typescript
// middleware.ts
import { auth } from '@/auth'
import { NextResponse } from 'next/server'

export default auth((req) => {
  const isLoggedIn = !!req.auth
  const isOnProtected = req.nextUrl.pathname.startsWith('/dashboard')
  
  if (isOnProtected && !isLoggedIn) {
    return Response.redirect(new URL('/login', req.url))
  }
  
  return NextResponse.next()
})

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)']
}
```

---

## 6. Performance Optimization

### Dynamic Imports for Heavy Components

```typescript
import dynamic from 'next/dynamic'

const PDFViewer = dynamic(
  () => import('@/components/PDFViewer'),
  { 
    ssr: false,
    loading: () => <Skeleton />
  }
)
```

### Image Optimization

```tsx
import Image from 'next/image'

function ProductImage({ src, alt }: { src: string; alt: string }) {
  return (
    <Image
      src={src}
      alt={alt}
      width={400}
      height={400}
      sizes="(max-width: 768px) 100vw, 400px"
      priority={false}  // true for above-fold images
    />
  )
}
```

### Static Generation

```typescript
// Force static generation
export const dynamic = 'force-static'

// ISR: revalidate every 60 seconds
export const revalidate = 60

// On-demand revalidation
export async function POST(request: Request) {
  const body = await request.json()
  revalidatePath('/products')
  return NextResponse.json({ revalidated: true })
}
```

---

## 7. Project Structure

```
src/
├── app/                    # Next.js App Router
│   ├── (auth)/            # Route groups
│   ├── api/               # API routes
│   ├── layout.tsx         # Root layout
│   └── page.tsx           # Home page
├── actions/               # Server Actions
├── components/           # Reusable components
│   ├── ui/               # Base UI components
│   └── features/         # Feature-specific components
├── lib/                  # Utilities
├── models/               # Type definitions
└── schemas/              # Zod validation schemas
```

---

## 8. Error Handling

### Error Boundaries

```tsx
// app/error.tsx
'use client'

export default function Error({ reset }: { reset: () => void }) {
  return (
    <div>
      <h2>Something went wrong</h2>
      <button onClick={() => reset()}>Try again</button>
    </div>
  )
}

// app/not-found.tsx
export default function NotFound() {
  return (
    <div>
      <h2>Not Found</h2>
      <p>Could not find requested resource</p>
    </div>
  )
}
```

---

## 9. TypeScript Best Practices

### Strict Typing

```typescript
// Always use explicit types
interface Product {
  id: string
  name: string
  price: number
}

// Avoid 'any', use 'unknown' if type is uncertain
function processData(data: unknown): Product {
  if (isProduct(data)) {
    return data
  }
  throw new Error('Invalid data')
}
```

### Type-Safe Server Actions

```typescript
'use server'

import { z } from 'zod'

const createProductSchema = z.object({
  name: z.string().min(1),
  price: z.number().positive()
})

export async function createProduct(data: z.infer<typeof createProductSchema>) {
  const validated = createProductSchema.parse(data)
  // validated is now typed as { name: string; price: number }
}
```

---

## References

1. https://nextjs.org/docs
2. https://react.dev
3. https://nextjs.org/docs/app/guides/authentication
