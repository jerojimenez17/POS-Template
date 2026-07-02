import { vi } from 'vitest';
import '@testing-library/jest-dom';

export const mockDb = {
  $executeRawUnsafe: vi.fn().mockResolvedValue(1),
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
  businessFeatures: {
    findUnique: vi.fn().mockResolvedValue({
      planDefinition: {
        name: 'PRO',
        features: {
          hasAfipBilling: true,
          hasPublicCatalog: true,
          hasClientLedger: true,
          hasMultiCashbox: true,
          hasSupplierFilter: true,
          hasBudget: true,
        },
        limits: {
          maxUsers: 5,
          maxProducts: 1000,
          maxCashboxes: 3,
          maxClients: 500,
          dailySalesLimit: 999999,
          dailyProductsLimit: 999999,
          dailyClientsLimit: 999999,
        },
      },
      overrides: null,
      business: { trialEndsAt: null },
    }),
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
  planDefinition: {
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
