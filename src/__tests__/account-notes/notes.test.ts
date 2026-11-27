// @vitest-environment jsdom
/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockDb } from '../../../tests/setup';
import { createUnpaidOrder, getUnpaidOrders } from '../../../src/actions/unpaid-orders';

vi.mock('../../../src/lib/db', () => ({
  db: mockDb,
}));

vi.mock('../../../auth', () => ({
  auth: vi.fn().mockResolvedValue({
    user: {
      businessId: 'business-123',
      name: 'seller-1',
    },
  }),
}));

vi.mock('next/server', () => ({
  revalidatePath: vi.fn(),
  after: vi.fn(),
}));

vi.mock('next/cache', () => ({
  revalidateTag: vi.fn(),
}));

vi.mock('@/lib/pusher-server', () => ({
  pusherServer: {
    trigger: vi.fn().mockResolvedValue({}),
  },
}));

vi.mock('@/lib/auth-gates', () => ({
  requireFeature: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock('@/lib/batch-utils', () => ({
  processInBatches: vi.fn().mockImplementation(async (_tx: any, items: any[], fn: any) => {
    for (const item of items) {
      await fn(item);
    }
  }),
  bulkUpdateStock: vi.fn().mockResolvedValue(undefined),
}));

const { db } = { db: mockDb };

describe('Account Notes Field — Backend (Server Action)', () => {
  const mockClient = {
    id: 'client-1',
    name: 'Cliente Test',
    balance: 0,
    businessId: 'business-123',
  };

  const mockProduct = {
    id: 'product-1',
    code: 'PROD001',
    description: 'Producto Test',
    price: 100,
    salePrice: 150,
    amount: 50,
    businessId: 'business-123',
  };

  const mockOrderItems = [
    {
      productId: 'product-1',
      code: 'PROD001',
      description: 'Producto Test',
      costPrice: 100,
      price: 150,
      quantity: 2,
      subTotal: 300,
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createUnpaidOrder — notes field', () => {
    const baseInput = {
      clientId: 'client-1',
      businessId: 'business-123',
      items: mockOrderItems,
      total: 300,
    };

    function setupDefaultMocks() {
      vi.mocked(db.client.findUnique).mockResolvedValue(mockClient as any);
      vi.mocked(db.product.findMany).mockResolvedValue([mockProduct] as any);
      vi.mocked(db.order.create).mockResolvedValue({
        id: 'order-1',
        paidStatus: 'inpago',
        total: 300,
      } as any);
      vi.mocked(db.stockMovement.createMany).mockResolvedValue({ count: 1 } as any);
      vi.mocked(db.product.update).mockResolvedValue(mockProduct as any);
      vi.mocked(db.client.update).mockResolvedValue({
        ...mockClient,
        balance: 300,
      } as any);
    }

    // ──────────────────────────────────────────────
    // AC-02: Can save notes when creating an order
    // ──────────────────────────────────────────────
    it('AC-02: passes notes to db.order.create when notes are provided', async () => {
      setupDefaultMocks();

      const inputWithNotes = {
        ...baseInput,
        notes: 'Retiró Juan Pérez, DNI 12345678',
      };

      await createUnpaidOrder(inputWithNotes);

      expect(db.order.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            notes: 'Retiró Juan Pérez, DNI 12345678',
          }),
        })
      );
    });

    // ──────────────────────────────────────────────
    // AC-07: Backend accepts empty/null/missing notes
    // ──────────────────────────────────────────────
    it('AC-07: creates order successfully when notes field is omitted', async () => {
      setupDefaultMocks();

      const result = await createUnpaidOrder(baseInput);

      expect(result.success).toBe(true);
    });

    it('AC-07: creates order successfully when notes is null', async () => {
      setupDefaultMocks();

      const inputWithNullNotes = {
        ...baseInput,
        notes: null,
      };

      const result = await createUnpaidOrder(inputWithNullNotes as any);

      expect(result.success).toBe(true);
    });

    it('AC-07: creates order successfully when notes is empty string', async () => {
      setupDefaultMocks();

      const inputWithEmptyNotes = {
        ...baseInput,
        notes: '',
      };

      const result = await createUnpaidOrder(inputWithEmptyNotes);

      expect(result.success).toBe(true);
    });

    // ──────────────────────────────────────────────
    // AC-06: Existing orders without notes do NOT break
    // ──────────────────────────────────────────────
    it('AC-06: existing createUnpaidOrder functionality still works when notes is omitted', async () => {
      setupDefaultMocks();

      const result = await createUnpaidOrder(baseInput);

      expect(result.success).toBe(true);
      expect(db.order.create).toHaveBeenCalled();
    });

    it('AC-06: order is created with correct paidStatus when notes is omitted', async () => {
      setupDefaultMocks();

      await createUnpaidOrder(baseInput);

      expect(db.order.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            paidStatus: 'inpago',
            clientId: 'client-1',
            total: 300,
          }),
        })
      );
    });
  });

  describe('getUnpaidOrders — notes field', () => {
    it('AC-02: returns orders that include notes field in the data', async () => {
      const mockOrdersWithNotes = [
        {
          id: 'order-1',
          total: 300,
          paidStatus: 'inpago',
          client: { id: 'client-1', name: 'Cliente 1' },
          date: new Date(),
          notes: 'Retiró Juan Pérez, DNI 12345678',
        },
        {
          id: 'order-2',
          total: 500,
          paidStatus: 'inpago',
          client: { id: 'client-2', name: 'Cliente 2' },
          date: new Date(),
          notes: null,
        },
      ];

      vi.mocked(db.order.findMany).mockResolvedValue(mockOrdersWithNotes as any);

      const result = await getUnpaidOrders({ businessId: 'business-123' }) as {
        success: boolean;
        data?: Array<{ id: string; notes: string | null }>;
      };

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(2);
      expect(result.data![0]).toHaveProperty('notes');
      expect(result.data![0].notes).toBe('Retiró Juan Pérez, DNI 12345678');
    });

    it('AC-06: returns orders with notes: null for orders without notes', async () => {
      const mockOrdersWithoutNotes = [
        {
          id: 'order-1',
          total: 300,
          paidStatus: 'inpago',
          client: { id: 'client-1', name: 'Cliente 1' },
          date: new Date(),
          notes: null,
        },
      ];

      vi.mocked(db.order.findMany).mockResolvedValue(mockOrdersWithoutNotes as any);

      const result = await getUnpaidOrders({ businessId: 'business-123' }) as {
        success: boolean;
        data?: Array<{ id: string; notes: string | null }>;
      };

      expect(result.success).toBe(true);
      expect(result.data![0].notes).toBeNull();
    });

    it('AC-06: getUnpaidOrders does not crash when notes field is missing from DB result', async () => {
      const mockOrdersWithoutNotesField = [
        {
          id: 'order-1',
          total: 300,
          paidStatus: 'inpago',
          client: { id: 'client-1', name: 'Cliente 1' },
          date: new Date(),
          // notes field intentionally absent — simulates old DB records
        },
      ];

      vi.mocked(db.order.findMany).mockResolvedValue(mockOrdersWithoutNotesField as any);

      const result = await getUnpaidOrders({ businessId: 'business-123' }) as {
        success: boolean;
        data?: Array<{ id: string }>;
      };

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      // Should not crash — notes is simply undefined
    });
  });
});
