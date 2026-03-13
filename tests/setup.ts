import { vi } from 'vitest';

export const mockDb = {
  brand: {
    findFirst: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockResolvedValue({ id: 'brand-1' }),
  },
  category: {
    findFirst: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockResolvedValue({ id: 'category-1' }),
  },
  subcategory: {
    findFirst: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockResolvedValue({ id: 'subcategory-1' }),
  },
  product: {
    findFirst: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockResolvedValue({ id: 'product-1', code: 'PROD001' }),
    update: vi.fn().mockResolvedValue({ id: 'product-1' }),
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
