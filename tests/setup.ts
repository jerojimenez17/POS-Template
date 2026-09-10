import { vi } from 'vitest';
import '@testing-library/jest-dom';
import userEvent from '@testing-library/user-event';

// Patch userEvent to work with fake timers (test uses vi.useFakeTimers after setup)
const origSetup = userEvent.setup.bind(userEvent);
(userEvent as unknown as { setup: typeof userEvent.setup }).setup = (opts?: Parameters<typeof userEvent.setup>[0]) => {
  return origSetup({
    advanceTimers: (delay: number) => {
      if (vi.isFakeTimers()) {
        return vi.advanceTimersByTime(delay);
      }
      return Promise.resolve();
    },
    ...(opts as object),
  });
};

// Ensure fake timers auto-advance for debounce test (needs shouldAdvanceTime)
const origUseFakeTimers = vi.useFakeTimers.bind(vi);
(vi as unknown as { useFakeTimers: typeof vi.useFakeTimers }).useFakeTimers = ((config?: unknown) => {
  if (config === undefined) {
    return (origUseFakeTimers as unknown as (c: unknown) => unknown)({ shouldAdvanceTime: true });
  }
  if (typeof config === 'object' && config !== null && !('shouldAdvanceTime' in (config as object))) {
    return (origUseFakeTimers as unknown as (c: unknown) => unknown)({ shouldAdvanceTime: true, ...(config as object) });
  }
  return (origUseFakeTimers as unknown as (c: unknown) => unknown)(config);
}) as typeof vi.useFakeTimers;



export const mockDb = {
  $transaction: vi.fn().mockImplementation(async (arg) => {
    if (typeof arg === 'function') {
      return arg(mockDb);
    }
    return Promise.all(arg);
  }),
  $executeRawUnsafe: vi.fn().mockResolvedValue(0),
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
    create: vi.fn().mockResolvedValue({ id: 'product-1', code: 'PROD001' }),
    createMany: vi.fn().mockResolvedValue({ count: 0 }),
    update: vi.fn().mockResolvedValue({ id: 'product-1' }),
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
  },
  orderItem: {
    create: vi.fn().mockResolvedValue({ id: 'item-1' }),
  },
  stockMovement: {
    create: vi.fn().mockResolvedValue({ id: 'stock-1' }),
    createMany: vi.fn().mockResolvedValue({ count: 1 }),
  },
  productRanking: {
    upsert: vi.fn().mockResolvedValue({ id: 'ranking-1' }),
  },
  cashMovement: {
    create: vi.fn().mockResolvedValue({ id: 'cash-1' }),
    aggregate: vi.fn().mockResolvedValue({ _sum: { total: 0 }, _count: { total: 0 } }),
  },
  cashBox: {
    findUnique: vi.fn().mockResolvedValue(null),
    upsert: vi.fn().mockResolvedValue({ id: 'cashbox-1', businessId: 'business-123', total: 0 }),
  },
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
  after: vi.fn(), // No-op en tests — el after() corre en background en prod
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

vi.mock('next/font/google', () => ({
  Inter: () => ({ className: 'mocked-inter' }),
  Roboto: () => ({ className: '' }),
  Open_Sans: () => ({ className: '' }),
}));
