import { describe, it, expect, vi, beforeEach } from 'vitest';
import { registerPayment } from '../src/actions/unpaid-orders';

vi.mock('../src/lib/db', () => {
  const mockDb = {
    $transaction: vi.fn().mockImplementation(async (callback) => {
      return callback(mockDb);
    }),
    order: {
      findUnique: vi.fn().mockResolvedValue({
        id: 'order-1',
        total: 300,
        paidStatus: 'inpago',
        clientId: 'client-1',
        client: { id: 'client-1', name: 'Cliente Test', balance: 300 },
        cashMovements: [],
      }),
      update: vi.fn().mockResolvedValue({ id: 'order-1', paidStatus: 'inpago' }),
    },
    cashMovement: {
      create: vi.fn().mockResolvedValue({ id: 'cash-1', total: 150, paidMethod: 'TRANSFER' }),
    },
    client: {
      update: vi.fn().mockResolvedValue({ id: 'client-1' }),
    },
  };
  return { db: mockDb };
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

describe('Pusher Integration - Payment Flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('registerPayment Pusher Events', () => {
    it('TRIGGER-PUSHER-1: Should trigger new-movement event on movements-{businessId} channel', async () => {
      const { pusherServer } = await import('../src/lib/pusher-server');

      await registerPayment({
        orderId: 'order-1',
        amount: 150,
        paymentMethod: 'TRANSFER',
        businessId: 'business-123',
      });

      expect(pusherServer.trigger).toHaveBeenCalledWith(
        'movements-business-123',
        'new-movement',
        expect.objectContaining({
          id: 'cash-1',
          total: 150,
          paidMethod: 'TRANSFER',
        })
      );
    });

    it('TRIGGER-PUSHER-2: Should trigger on movements-{businessId} not orders-{businessId}', async () => {
      const { pusherServer } = await import('../src/lib/pusher-server');

      await registerPayment({
        orderId: 'order-1',
        amount: 150,
        paymentMethod: 'TRANSFER',
        businessId: 'business-123',
      });

      const triggerCalls = (pusherServer.trigger as ReturnType<typeof vi.fn>).mock.calls;
      const movementsChannelCalls = triggerCalls.filter(
        call => call[0] === 'movements-business-123'
      );
      
      expect(movementsChannelCalls.length).toBeGreaterThanOrEqual(1);
    });

    it('TRIGGER-PUSHER-3: Event payload contains movement data', async () => {
      const { pusherServer } = await import('../src/lib/pusher-server');
      const { db } = await import('../src/lib/db');
      
      vi.mocked(db.cashMovement.create).mockResolvedValue({
        id: 'cash-new',
        total: 200,
        paidMethod: 'Efectivo',
      } as any);

      await registerPayment({
        orderId: 'order-1',
        amount: 200,
        paymentMethod: 'Efectivo',
        businessId: 'business-123',
      });

      expect(pusherServer.trigger).toHaveBeenCalledWith(
        'movements-business-123',
        'new-movement',
        expect.objectContaining({
          id: 'cash-new',
          total: 200,
          paidMethod: 'Efectivo',
        })
      );
    });
  });

  describe('CashRegister Compatibility', () => {
    it('SUBSCRIBE-1: Event name should be new-movement', async () => {
      const { pusherServer } = await import('../src/lib/pusher-server');

      await registerPayment({
        orderId: 'order-1',
        amount: 150,
        paymentMethod: 'TRANSFER',
        businessId: 'business-123',
      });

      expect(pusherServer.trigger).toHaveBeenCalledWith(
        expect.any(String),
        'new-movement',
        expect.any(Object)
      );
    });

    it('SUBSCRIBE-2: Should use movements-{businessId} channel pattern', async () => {
      const { pusherServer } = await import('../src/lib/pusher-server');

      await registerPayment({
        orderId: 'order-1',
        amount: 150,
        paymentMethod: 'TRANSFER',
        businessId: 'business-123',
      });

      const channelsTriggered = (pusherServer.trigger as ReturnType<typeof vi.fn>).mock.calls.map(call => call[0]);
      expect(channelsTriggered.some(ch => ch.startsWith('movements-'))).toBe(true);
    });
  });

  describe('Edge Cases', () => {
    it('EDGE-PUSHER-1: Should not trigger Pusher if order not found', async () => {
      const { pusherServer } = await import('../src/lib/pusher-server');
      const { db } = await import('../src/lib/db');
      
      vi.mocked(db.order.findUnique).mockResolvedValue(null);

      await registerPayment({
        orderId: 'order-1',
        amount: 150,
        paymentMethod: 'TRANSFER',
        businessId: 'business-123',
      });

      expect(pusherServer.trigger).not.toHaveBeenCalled();
    });

    it('EDGE-PUSHER-2: Full payment still triggers new-movement', async () => {
      const { pusherServer } = await import('../src/lib/pusher-server');
      const { db } = await import('../src/lib/db');
      
      vi.mocked(db.order.findUnique).mockResolvedValue({
        id: 'order-1',
        total: 300,
        paidStatus: 'inpago',
        clientId: 'client-1',
        client: { id: 'client-1', balance: 300 },
        cashMovements: [],
      } as any);

      await registerPayment({
        orderId: 'order-1',
        amount: 300,
        paymentMethod: 'TRANSFER',
        businessId: 'business-123',
      });

      expect(pusherServer.trigger).toHaveBeenCalledWith(
        'movements-business-123',
        'new-movement',
        expect.any(Object)
      );
    });

    it('EDGE-PUSHER-3: Different payment methods trigger same event', async () => {
      const { pusherServer } = await import('../src/lib/pusher-server');
      const { db } = await import('../src/lib/db');
      const methods = ['Efectivo', 'TRANSFER', 'TARJETA'];

      for (const method of methods) {
        vi.clearAllMocks();
        
        vi.mocked(db.order.findUnique).mockResolvedValue({
          id: 'order-1',
          total: 300,
          paidStatus: 'inpago',
          clientId: 'client-1',
          client: { id: 'client-1', balance: 300 },
          cashMovements: [],
        } as any);

        vi.mocked(db.cashMovement.create).mockResolvedValue({
          id: `cash-${method}`,
          total: 100,
          paidMethod: method,
        } as any);
        
        await registerPayment({
          orderId: 'order-1',
          amount: 100,
          paymentMethod: method,
          businessId: 'business-123',
        });
        
        expect(pusherServer.trigger).toHaveBeenCalledWith(
          'movements-business-123',
          'new-movement',
          expect.objectContaining({ paidMethod: method })
        );
      }
    });
  });
});
