import { describe, it, expect, vi, beforeEach } from 'vitest';
import { processSaleAction } from '../src/actions/sales';

vi.mock('../src/lib/db', () => {
  const mockCashMovementCreate = vi.fn().mockImplementation((data) => Promise.resolve({
    id: 'movement-1',
    total: data?.data?.total || 0,
    paidMethod: data?.data?.paidMethod || null,
    businessId: data?.data?.businessId || '',
    seller: data?.data?.seller || null,
    date: data?.data?.date || new Date(),
    orderId: null,
  }));
  return {
    db: {
      $transaction: vi.fn().mockImplementation(async (callback) => {
        return callback({
          order: {
            create: vi.fn().mockResolvedValue({
              id: 'order-1',
              total: 100,
              seller: 'Test Seller',
              status: 'confirmado',
              paidStatus: 'pago',
              paymentMethod: 'Efectivo',
              businessId: 'business-123',
              items: [],
            }),
          },
          product: {
            update: vi.fn().mockResolvedValue({ id: 'product-1' }),
          },
          stockMovement: {
            create: vi.fn().mockResolvedValue({ id: 'stock-1' }),
          },
          productRanking: {
            upsert: vi.fn().mockResolvedValue({ id: 'ranking-1' }),
          },
          cashBox: {
            upsert: vi.fn().mockResolvedValue({ id: 'cashbox-1' }),
          },
          cashMovement: {
            create: mockCashMovementCreate,
          },
        });
      }),
    },
  };
});

vi.mock('../auth', () => ({
  auth: vi.fn().mockResolvedValue({
    user: { businessId: 'business-123', name: 'seller-1' }
  }),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

vi.mock('../src/lib/pusher-server', () => ({
  pusherServer: {
    trigger: vi.fn().mockResolvedValue({}),
  },
}));

const baseInput = {
  total: 100,
  totalWithDiscount: 100,
  seller: 'Test Seller',
  paidMethod: 'Efectivo',
  products: [
    {
      id: 'product-1',
      code: 'P001',
      description: 'Test Product',
      salePrice: 100,
      amount: 1,
    },
  ],
};

describe('Mixed Payment Pusher Flow - Bug 2', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('BUG-2: Mixed payment with cash should trigger new-movement event', () => {
    it('BUG2-MIX-1: Single cash payment should trigger new-movement on movements-{businessId} channel', async () => {
      const { pusherServer } = await import('../src/lib/pusher-server');

      const input = {
        ...baseInput,
        paidMethod: 'Efectivo',
      };

      await processSaleAction(input);

      expect(pusherServer.trigger).toHaveBeenCalledWith(
        'movements-business-123',
        'new-movement',
        expect.objectContaining({
          paidMethod: 'Efectivo',
        })
      );
    });

    it('BUG2-MIX-2: Mixed payment (Efectivo + Tarjeta) should trigger new-movement for cash portion', async () => {
      const { pusherServer } = await import('../src/lib/pusher-server');

      const input = {
        ...baseInput,
        paidMethod: 'Efectivo',
        secondPaidMethod: 'Tarjeta',
        totalSecondMethod: 50,
        twoMethods: true,
      };

      await processSaleAction(input);

      const triggerCalls = (pusherServer.trigger as ReturnType<typeof vi.fn>).mock.calls;
      const movementsCalls = triggerCalls.filter(
        call => call[0] === 'movements-business-123' && call[1] === 'new-movement'
      );

      expect(movementsCalls.length).toBeGreaterThanOrEqual(1);
      expect(movementsCalls.some(call => 
        call[2] && typeof call[2] === 'object' && call[2].paidMethod === 'Efectivo'
      )).toBe(true);
    });

    it('BUG2-MIX-3: Mixed payment (Tarjeta + Efectivo) should trigger new-movement for cash portion', async () => {
      const { pusherServer } = await import('../src/lib/pusher-server');

      const input = {
        ...baseInput,
        total: 100,
        paidMethod: 'Tarjeta',
        secondPaidMethod: 'Efectivo',
        totalSecondMethod: 30,
        twoMethods: true,
      };

      await processSaleAction(input);

      const triggerCalls = (pusherServer.trigger as ReturnType<typeof vi.fn>).mock.calls;
      const movementsCalls = triggerCalls.filter(
        call => call[0] === 'movements-business-123' && call[1] === 'new-movement'
      );

      expect(movementsCalls.length).toBeGreaterThanOrEqual(1);
      expect(movementsCalls.some(call => 
        call[2] && typeof call[2] === 'object' && call[2].paidMethod === 'Efectivo'
      )).toBe(true);
    });

    it('BUG2-MIX-4: Both cash movements in mixed payment should trigger separate new-movement events', async () => {
      const { pusherServer } = await import('../src/lib/pusher-server');

      const input = {
        ...baseInput,
        total: 100,
        paidMethod: 'Efectivo',
        secondPaidMethod: 'Efectivo',
        totalSecondMethod: 50,
        twoMethods: true,
      };

      await processSaleAction(input);

      const triggerCalls = (pusherServer.trigger as ReturnType<typeof vi.fn>).mock.calls;
      const movementsCalls = triggerCalls.filter(
        call => call[0] === 'movements-business-123' && call[1] === 'new-movement'
      );

      expect(movementsCalls.length).toBe(2);
    });
  });

  describe('BUG-2: CashRegister real-time update compatibility', () => {
    it('BUG2-REG-1: CashRegister subscription expects new-movement event name', async () => {
      const { pusherServer } = await import('../src/lib/pusher-server');

      await processSaleAction(baseInput);

      expect(pusherServer.trigger).toHaveBeenCalledWith(
        expect.any(String),
        'new-movement',
        expect.any(Object)
      );
    });

    it('BUG2-REG-2: CashRegister subscription expects movements-{businessId} channel', async () => {
      const { pusherServer } = await import('../src/lib/pusher-server');

      await processSaleAction(baseInput);

      const channelsTriggered = (pusherServer.trigger as ReturnType<typeof vi.fn>).mock.calls.map(call => call[0]);
      expect(channelsTriggered.some(ch => ch.startsWith('movements-'))).toBe(true);
    });

    it('BUG2-REG-3: Event payload should contain movement data for CashRegister state update', async () => {
      const { pusherServer } = await import('../src/lib/pusher-server');

      const input = {
        ...baseInput,
        paidMethod: 'Efectivo',
      };

      await processSaleAction(input);

      expect(pusherServer.trigger).toHaveBeenCalledWith(
        'movements-business-123',
        'new-movement',
        expect.objectContaining({
          total: expect.any(Number),
          paidMethod: 'Efectivo',
          seller: 'Test Seller',
          businessId: 'business-123',
        })
      );
    });

    it('BUG2-REG-4: Non-cash payments should NOT trigger new-movement event', async () => {
      const { pusherServer } = await import('../src/lib/pusher-server');

      const input = {
        ...baseInput,
        paidMethod: 'Tarjeta',
      };

      await processSaleAction(input);

      const triggerCalls = (pusherServer.trigger as ReturnType<typeof vi.fn>).mock.calls;
      const movementsCalls = triggerCalls.filter(
        call => call[0] === 'movements-business-123' && call[1] === 'new-movement'
      );

      expect(movementsCalls.length).toBe(0);
    });
  });

  describe('BUG-2: Comparison with working flows', () => {
    it('BUG2-COMP-1: processSaleAction should match createMovement trigger pattern', async () => {
      const { pusherServer } = await import('../src/lib/pusher-server');

      await processSaleAction(baseInput);

      expect(pusherServer.trigger).toHaveBeenCalledWith(
        'movements-business-123',
        'new-movement',
        expect.any(Object)
      );
    });

    it('BUG2-COMP-2: TotalPanel expects refreshCount update via refreshTotal state', async () => {
      const { pusherServer } = await import('../src/lib/pusher-server');

      await processSaleAction({
        ...baseInput,
        paidMethod: 'Efectivo',
      });

      const triggerCalls = (pusherServer.trigger as ReturnType<typeof vi.fn>).mock.calls;
      const hasNewMovementEvent = triggerCalls.some(
        call => call[1] === 'new-movement'
      );

      expect(hasNewMovementEvent).toBe(true);
    });
  });

  describe('BUG-2: Edge cases', () => {
    it('BUG2-EDGE-1: Partial payment with cash portion should trigger new-movement', async () => {
      const { pusherServer } = await import('../src/lib/pusher-server');

      const input = {
        ...baseInput,
        total: 100,
        paidMethod: 'Efectivo',
        secondPaidMethod: 'Tarjeta',
        totalSecondMethod: 75,
        twoMethods: true,
      };

      await processSaleAction(input);

      expect(pusherServer.trigger).toHaveBeenCalledWith(
        'movements-business-123',
        'new-movement',
        expect.objectContaining({
          total: 25,
          paidMethod: 'Efectivo',
        })
      );
    });

    it('BUG2-EDGE-2: Zero cash portion in mixed payment should not trigger new-movement', async () => {
      const { pusherServer } = await import('../src/lib/pusher-server');

      const input = {
        ...baseInput,
        total: 100,
        paidMethod: 'Tarjeta',
        secondPaidMethod: 'MercadoPago',
        totalSecondMethod: 100,
        twoMethods: true,
      };

      await processSaleAction(input);

      const triggerCalls = (pusherServer.trigger as ReturnType<typeof vi.fn>).mock.calls;
      const movementsCalls = triggerCalls.filter(
        call => call[0] === 'movements-business-123' && call[1] === 'new-movement'
      );

      expect(movementsCalls.length).toBe(0);
    });
  });
});
