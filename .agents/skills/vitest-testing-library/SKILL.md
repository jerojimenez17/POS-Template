---
name: vitest-testing-library
description: Testing best practices using Vitest and React Testing Library. Covers unit tests, component tests, integration tests, mocking, and TDD workflows.
license: MIT
metadata:
  author: pos-template
  version: "1.0.0"
---

# Testing with Vitest and React Testing Library

Comprehensive guide for writing tests that are maintainable, reliable, and provide confidence in code correctness.

## When to Apply

Reference these guidelines when:
- Writing new tests for components or utilities
- Fixing failing tests
- Reviewing test code
- Setting up testing infrastructure
- Following TDD workflow

---

## 1. Test Structure and Organization

### File Naming

```
component-name.test.tsx    # Component tests
function-name.test.ts      # Utility/function tests
api-handler.test.ts        # API route tests
```

### AAA Pattern (Arrange-Act-Assert)

```typescript
describe('calculateTotal', () => {
  it('should return sum of prices multiplied by quantity', () => {
    // Arrange
    const items = [
      { price: 10, quantity: 2 },
      { price: 5, quantity: 3 }
    ]
    
    // Act
    const total = calculateTotal(items)
    
    // Assert
    expect(total).toBe(35)  // (10*2) + (5*3) = 35
  })
})
```

---

## 2. React Testing Library

### Query Priority

Use queries in this priority order:
1. **getByRole** - Most accessible (preferred)
2. **getByLabelText** - For form fields
3. **getByPlaceholderText** - If no label
4. **getByText** - For non-interactive elements
5. **getByTestId** - Last resort

```tsx
// Good: query by role
const submitButton = screen.getByRole('button', { name: /submit/i })

// Good: query by label
const emailInput = screen.getByLabelText(/email/i)

// Acceptable: placeholder
const searchInput = screen.getByPlaceholderText(/search/i)

// Last resort: testid
const hiddenElement = screen.getByTestId('complex-widget')
```

### Testing User Interactions

```tsx
import userEvent from '@testing-library/user-event'

it('should submit form with user input', async () => {
  const user = userEvent.setup()
  
  render(<LoginForm />)
  
  await user.type(screen.getByLabelText(/email/i), 'test@example.com')
  await user.click(screen.getByRole('button', { name: /submit/i }))
  
  expect(screen.getByText(/welcome/i)).toBeInTheDocument()
})
```

### Testing Async Behavior

```tsx
it('should display user data after loading', async () => {
  render(<UserProfile userId="1" />)
  
  // Initially shows loading
  expect(screen.getByText(/loading/i)).toBeInTheDocument()
  
  // Wait for data
  const userName = await screen.findByText(/john doe/i)
  expect(userName).toBeInTheDocument()
})
```

---

## 3. Component Testing

### Testing Props and State

```tsx
interface ButtonProps {
  label: string
  onClick: () => void
  variant?: 'primary' | 'secondary'
}

function Button({ label, onClick, variant = 'primary' }: ButtonProps) {
  return (
    <button 
      className={`btn btn-${variant}`}
      onClick={onClick}
    >
      {label}
    </button>
  )
}

describe('Button', () => {
  it('renders with label', () => {
    render(<Button label="Click me" onClick={() => {}} />)
    expect(screen.getByText('Click me')).toBeInTheDocument()
  })
  
  it('calls onClick when clicked', async () => {
    const handleClick = vi.fn()
    const user = userEvent.setup()
    
    render(<Button label="Click me" onClick={handleClick} />)
    await user.click(screen.getByText('Click me'))
    
    expect(handleClick).toHaveBeenCalledTimes(1)
  })
  
  it('applies variant class', () => {
    render(<Button label="Submit" onClick={() => {}} variant="secondary" />)
    const button = screen.getByRole('button')
    expect(button).toHaveClass('btn-secondary')
  })
})
```

### Testing Context Providers

```tsx
import { render, screen } from '@testing-library/react'
import { ThemeProvider } from '@/context/ThemeContext'
import { ThemeToggle } from './ThemeToggle'

function renderWithTheme(ui: React.ReactElement) {
  return render(
    <ThemeProvider>
      {ui}
    </ThemeProvider>
  )
}

describe('ThemeToggle', () => {
  it('shows current theme', () => {
    renderWithTheme(<ThemeToggle />)
    expect(screen.getByText(/light/i)).toBeInTheDocument()
  })
})
```

---

## 4. Mocking

### Mocking Functions

```typescript
const mockFetch = vi.fn()

beforeEach(() => {
  mockFetch.mockReset()
})

it('fetches user data', async () => {
  mockFetch.mockResolvedValue({ name: 'John' })
  
  const result = await fetchUser('1')
  
  expect(mockFetch).toHaveBeenCalledWith('/api/users/1')
  expect(result).toEqual({ name: 'John' })
})
```

### Mocking Modules

```typescript
import { vi } from 'vitest'
import * as db from '@/lib/db'

vi.mock('@/lib/db', () => ({
  user: {
    findUnique: vi.fn()
  }
}))

it('gets user from database', async () => {
  vi.mocked(db.user.findUnique).mockResolvedValue({
    id: '1',
    name: 'John'
  })
  
  const user = await getUser('1')
  expect(user?.name).toBe('John')
})
```

### Mocking Next.js Modules

```typescript
import { vi } from 'vitest'

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn()
  }),
  useParams: () => ({ id: '1' }),
  useSearchParams: new URLSearchParams('?q=test')
}))
```

### Mocking Timers

```typescript
import { vi } from 'vitest'

it('debounces input', async () => {
  vi.useFakeTimers()
  
  const callback = vi.fn()
  const debounced = debounce(callback, 500)
  
  debounced()
  debounced()
  debounced()
  
  // Callback not called yet
  expect(callback).not.toHaveBeenCalled()
  
  // Advance timers
  vi.advanceTimersByTime(500)
  
  // Now called once
  expect(callback).toHaveBeenCalledTimes(1)
  
  vi.useRealTimers()
})
```

---

## 5. TDD Workflow

### Red-Green-Refactor

```typescript
// 1. RED: Write failing test first
describe('formatCurrency', () => {
  it('should format number as USD currency', () => {
    expect(formatCurrency(1234.56)).toBe('$1,234.56')
  })
})

// 2. GREEN: Write minimal code to pass
function formatCurrency(amount: number): string {
  return `$${amount.toLocaleString()}`
}

// 3. REFACTOR: Improve while keeping tests passing
function formatCurrency(amount: number, locale = 'en-US', currency = 'USD'): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency
  }).format(amount)
}
```

### Test-Driven Server Actions

```typescript
// tests/actions/create-order.test.ts
describe('createOrder', () => {
  beforeEach(() => {
    vi.mocked(auth).mockResolvedValue({ user: { id: '1' } })
  })
  
  it('creates order with valid data', async () => {
    const result = await createOrder({
      items: [{ productId: '1', quantity: 2 }],
      total: 100
    })
    
    expect(result.success).toBe(true)
    expect(result.data).toHaveProperty('id')
  })
  
  it('fails without authentication', async () => {
    vi.mocked(auth).mockResolvedValue(null)
    
    const result = await createOrder({
      items: [{ productId: '1', quantity: 2 }],
      total: 100
    })
    
    expect(result.success).toBe(false)
    expect(result.error).toBe('Unauthorized')
  })
})
```

---

## 6. Test Coverage Guidelines

### What to Test

| Type | What to Test |
|------|--------------|
| Components | Render, interactions, states, props |
| Utils | All branches, edge cases |
| Server Actions | Success, errors, validation |
| Hooks | All states, dependencies |

### What NOT to Test

- Implementation details
- Third-party libraries
- Internal state (if not observable)
- Code without behavioral guarantees

```typescript
// Bad: testing implementation
const { result } = renderHook(() => useCounter())
act(() => result.current.increment())
expect(result.current.count).toBe(1)

// Good: testing observable behavior
render(<Counter />)
user.click(screen.getByText('Increment'))
expect(screen.getByText('1')).toBeInTheDocument()
```

---

## 7. Vitest Configuration

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    include: ['**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,tsx,jsx}'],
    exclude: ['node_modules', 'dist', '.next'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules/', '**/*.d.ts']
    }
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  }
})
```

---

## 8. Testing Library Utilities

### Custom Render

```typescript
// test-utils.tsx
import { render, RenderOptions } from '@testing-library/react'
import { ReactElement } from 'react'
import { AuthProvider } from '@/context/AuthContext'

function AllTheProviders({ children }: { children: React.ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>
}

function customRender(
  ui: ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>
) {
  return render(ui, { wrapper: AllTheProviders, ...options })
}

export * from '@testing-library/react'
export { customRender as render }
```

---

## 9. Common Patterns

### Testing Forms

```typescript
it('validates required fields', async () => {
  const user = userEvent.setup()
  
  render(<LoginForm />)
  
  await user.click(screen.getByRole('button', { name: /submit/i }))
  
  expect(screen.getByText(/email is required/i)).toBeInTheDocument()
  expect(screen.getByText(/password is required/i)).toBeInTheDocument()
})

it('submits valid form', async () => {
  const user = userEvent.setup()
  const onSubmit = vi.fn()
  
  render(<LoginForm onSubmit={onSubmit} />)
  
  await user.type(screen.getByLabelText(/email/i), 'test@example.com')
  await user.type(screen.getByLabelText(/password/i), 'password123')
  await user.click(screen.getByRole('button', { name: /submit/i }))
  
  expect(onSubmit).toHaveBeenCalledWith({
    email: 'test@example.com',
    password: 'password123'
  })
})
```

### Testing Error States

```typescript
it('displays error message on failure', async () => {
  const fetchMock = vi.fn().mockRejectedValue(new Error('Network error'))
  vi.mocked(fetch).mockImplementation(fetchMock)
  
  render(<DataFetcher />)
  
  const error = await screen.findByText(/network error/i)
  expect(error).toBeInTheDocument()
})
```

---

## 10. Best Practices Summary

1. **Test behavior, not implementation** - User-facing behavior matters
2. **Use meaningful test names** - Describe what should happen
3. **Keep tests independent** - Each test should work alone
4. **One expectation per test** - Or a few related ones
5. **Avoid testing constants** - Unless they have meaning
6. **Clean up after tests** - Reset mocks, clear timers
7. **Use semantic queries** - Accessibility first

---

## References

1. https://vitest.dev
2. https://testing-library.com/docs/react-testing-library/intro/
3. https://kentcdodds.com/blog/common-mistakes-with-react-testing-library
