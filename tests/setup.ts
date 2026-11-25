import { vi } from 'vitest';

// jsdom does not implement ResizeObserver; Radix UI primitives (@radix-ui/react-use-size,
// used by Select/Popover/etc.) throw "ResizeObserver is not defined" without a polyfill.
class ResizeObserverPolyfill {
  observe() {}
  unobserve() {}
  disconnect() {}
}
if (typeof globalThis.ResizeObserver === 'undefined') {
  Object.defineProperty(globalThis, 'ResizeObserver', {
    value: ResizeObserverPolyfill,
    writable: true,
    configurable: true,
  });
}

export const mockDb = {
  // Raw methods are neutral defaults only. Locking and query-result assertions
  // must provide their own transaction fixture in the relevant suite.
  $queryRaw: vi.fn().mockResolvedValue([]),
  $executeRaw: vi.fn().mockResolvedValue(0),
  $executeRawUnsafe: vi.fn().mockResolvedValue(0),
  $transaction: vi.fn().mockImplementation(async (arg) => {
    if (typeof arg === 'function') {
      return arg(mockDb);
    }
    return Promise.all(arg);
  }),
  brand: {
    findFirst: vi.fn().mockResolvedValue(null),
    findMany: vi.fn().mockResolvedValue([]),
    create: vi.fn().mockResolvedValue({ id: 'brand-1' }),
    createMany: vi.fn().mockResolvedValue({ count: 0 }),
  },
  category: {
    findFirst: vi.fn().mockResolvedValue(null),
    findMany: vi.fn().mockResolvedValue([]),
    create: vi.fn().mockResolvedValue({ id: 'category-1' }),
    createMany: vi.fn().mockResolvedValue({ count: 0 }),
  },
  subcategory: {
    findFirst: vi.fn().mockResolvedValue(null),
    findMany: vi.fn().mockResolvedValue([]),
    create: vi.fn().mockResolvedValue({ id: 'subcategory-1' }),
    createMany: vi.fn().mockResolvedValue({ count: 0 }),
  },
  product: {
    findFirst: vi.fn().mockResolvedValue(null),
    findMany: vi.fn().mockResolvedValue([]),
    findUnique: vi.fn().mockResolvedValue(null),
    count: vi.fn().mockResolvedValue(0),
    create: vi.fn().mockResolvedValue({ id: 'product-1', code: 'PROD001' }),
    createMany: vi.fn().mockResolvedValue({ count: 0 }),
    update: vi.fn().mockResolvedValue({ id: 'product-1' }),
    updateMany: vi.fn().mockResolvedValue({ count: 0 }),
  },
  supplier: {
    findFirst: vi.fn().mockResolvedValue(null),
    findMany: vi.fn().mockResolvedValue([]),
    create: vi.fn().mockResolvedValue({ id: 'supplier-1', name: 'Test Supplier', discount: 0, iva: 0, gain: 0 }),
    update: vi.fn().mockResolvedValue({ id: 'supplier-1' }),
  },
  client: {
    findUnique: vi.fn().mockResolvedValue(null),
    update: vi.fn().mockResolvedValue({ id: 'client-1' }),
  },
  order: {
    create: vi.fn().mockResolvedValue({ id: 'order-1' }),
    findUnique: vi.fn().mockResolvedValue(null),
    findMany: vi.fn().mockResolvedValue([]),
    update: vi.fn().mockResolvedValue({ id: 'order-1' }),
    delete: vi.fn().mockResolvedValue({ id: 'order-1' }),
  },
  orderItem: {
    create: vi.fn().mockResolvedValue({ id: 'item-1' }),
  },
  stockMovement: {
    create: vi.fn().mockResolvedValue({ id: 'stock-1' }),
    createMany: vi.fn().mockResolvedValue({ count: 0 }),
    deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
  },
  cashMovement: {
    create: vi.fn().mockResolvedValue({ id: 'cash-1' }),
    deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    aggregate: vi.fn().mockResolvedValue({ _sum: { total: 0 }, _count: { total: 0 } }),
  },
  cashBox: {
    findUnique: vi.fn().mockResolvedValue(null),
    upsert: vi.fn().mockResolvedValue({ id: 'cashbox-1', businessId: 'business-123', total: 0 }),
  },
  // --- Our side (plan limits / daily usage / ranking / unpaid orders) ---
  planDefinition: {
    // Keep the shared fixture neutral; suites that exercise plan-gated paths
    // must declare the plan they intend to test.
    findUnique: vi.fn().mockResolvedValue(null),
  },
  dailyUsage: {
    findUnique: vi.fn().mockResolvedValue(null),
    upsert: vi.fn().mockResolvedValue({}),
  },
  productRanking: {
    upsert: vi.fn().mockResolvedValue({ id: 'ranking-1' }),
  },
  orderUpdate: {
    findFirst: vi.fn().mockResolvedValue(null),
  },
  // --- Upstream side (arca/voucher tests need business lookups) ---
  business: {
    findUnique: vi.fn().mockResolvedValue(null),
  },
};

vi.mock('../src/lib/db', () => ({
  db: mockDb,
}));

vi.mock('../auth', () => ({
  auth: vi.fn().mockResolvedValue({ user: { businessId: 'business-123' } }),
}));

vi.mock('next/server', () => ({
  revalidatePath: vi.fn(),
  after: vi.fn(), // No-op en tests — el after() corre en background en prod (upstream: orders.ts / sales/process.ts lo importan)
}));

vi.mock('pusher', () => ({
  default: vi.fn().mockImplementation(() => ({
    trigger: vi.fn().mockResolvedValue({}),
  })),
}));

vi.mock('../src/lib/pusher-server', () => ({
  pusherServer: {
    trigger: vi.fn().mockResolvedValue({}),
  },
}));
