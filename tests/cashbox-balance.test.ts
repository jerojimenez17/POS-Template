import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getBusinessBalanceAction, updateBusinessBalance } from '../src/actions/billing';

vi.mock('../src/lib/db', () => ({
  db: {
    cashMovement: {
      aggregate: vi.fn().mockResolvedValue({ _sum: { total: 0 }, _count: { total: 0 } }),
    },
    cashBox: {
      findUnique: vi.fn().mockResolvedValue(null),
      upsert: vi.fn().mockResolvedValue({ id: 'cashbox-1', businessId: 'business-123', total: 0 }),
    },
  },
}));

vi.mock('../auth', () => ({
  auth: vi.fn().mockResolvedValue({
    user: { businessId: 'business-123', name: 'seller-1' }
  }),
}));

vi.mock('next/server', () => ({
  revalidatePath: vi.fn(),
}));

describe('CashBox Balance Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getBusinessBalanceAction - Balance Calculation', () => {
    it('BALANCE-1: Should calculate balance from cashMovements aggregate', async () => {
      const { db } = await import('../src/lib/db');
      
      vi.mocked(db.cashMovement.aggregate).mockResolvedValue({
        _sum: { total: 250 },
        _count: { total: 3 },
      } as any);

      const balance = await getBusinessBalanceAction();

      expect(db.cashMovement.aggregate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { businessId: 'business-123' },
          _sum: { total: true },
        })
      );
      expect(balance).toBe(250);
    });

    it('BALANCE-2: Should return 0 when no movements exist', async () => {
      const { db } = await import('../src/lib/db');
      
      vi.mocked(db.cashMovement.aggregate).mockResolvedValue({
        _sum: { total: null },
        _count: { total: 0 },
      } as any);

      const balance = await getBusinessBalanceAction();

      expect(balance).toBe(0);
    });

    it('BALANCE-3: Should include negative movements (retiros)', async () => {
      const { db } = await import('../src/lib/db');
      
      vi.mocked(db.cashMovement.aggregate).mockResolvedValue({
        _sum: { total: 100 },
        _count: { total: 2 },
      } as any);

      const balance = await getBusinessBalanceAction();

      expect(balance).toBe(100);
    });

    it('BALANCE-4: Balance should reflect all registered payments', async () => {
      const { db } = await import('../src/lib/db');
      
      vi.mocked(db.cashMovement.aggregate).mockResolvedValue({
        _sum: { total: 450 },
        _count: { total: 3 },
      } as any);

      const balance = await getBusinessBalanceAction();

      expect(balance).toBe(450);
    });
  });

  describe('TotalPanel Integration', () => {
    it('PANEL-1: getBusinessBalanceAction fetches from cashMovements', async () => {
      const { db } = await import('../src/lib/db');
      
      vi.mocked(db.cashMovement.aggregate).mockResolvedValue({
        _sum: { total: 100 },
        _count: { total: 1 },
      } as any);

      await getBusinessBalanceAction();

      expect(db.cashMovement.aggregate).toHaveBeenCalled();
    });

    it('PANEL-2: Balance updates on subsequent calls', async () => {
      const { db } = await import('../src/lib/db');
      
      vi.mocked(db.cashMovement.aggregate)
        .mockResolvedValueOnce({ _sum: { total: 100 }, _count: { total: 1 } } as any)
        .mockResolvedValueOnce({ _sum: { total: 200 }, _count: { total: 2 } } as any);

      const balance1 = await getBusinessBalanceAction();
      expect(balance1).toBe(100);

      const balance2 = await getBusinessBalanceAction();
      expect(balance2).toBe(200);
    });
  });

  describe('Edge Cases - Balance Calculation', () => {
    it('EDGE-BAL-1: Handle null _sum.total', async () => {
      const { db } = await import('../src/lib/db');
      
      vi.mocked(db.cashMovement.aggregate).mockResolvedValue({
        _sum: { total: null },
        _count: { total: 0 },
      } as any);

      const balance = await getBusinessBalanceAction();

      expect(balance).toBe(0);
    });

    it('EDGE-BAL-2: Handle undefined _sum', async () => {
      const { db } = await import('../src/lib/db');
      
      vi.mocked(db.cashMovement.aggregate).mockResolvedValue({
        _sum: undefined,
        _count: { total: 0 },
      } as any);

      const balance = await getBusinessBalanceAction();

      expect(balance).toBe(0);
    });

    it('EDGE-BAL-3: Handle database errors gracefully', async () => {
      const { db } = await import('../src/lib/db');
      
      vi.mocked(db.cashMovement.aggregate).mockRejectedValue(new Error('DB error'));

      const balance = await getBusinessBalanceAction();

      expect(balance).toBe(0);
    });

    it('EDGE-BAL-4: Should filter by businessId', async () => {
      const { db } = await import('../src/lib/db');
      
      vi.mocked(db.cashMovement.aggregate).mockResolvedValue({
        _sum: { total: 300 },
        _count: { total: 2 },
      } as any);

      await getBusinessBalanceAction();

      expect(db.cashMovement.aggregate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            businessId: 'business-123',
          }),
        })
      );
    });

    it('EDGE-BAL-5: Unauthorized access returns 0', async () => {
      const { auth } = await import('../auth');
      vi.mocked(auth).mockResolvedValueOnce({ user: { businessId: null } } as any);

      const balance = await getBusinessBalanceAction();

      expect(balance).toBe(0);
    });
  });

  describe('updateBusinessBalance Function', () => {
    it('UPDATE-1: Should upsert CashBox with increment', async () => {
      const { db } = await import('../src/lib/db');

      await updateBusinessBalance(150);

      expect(db.cashBox.upsert).toHaveBeenCalledWith({
        where: { businessId: 'business-123' },
        update: { total: { increment: 150 } },
        create: { businessId: 'business-123', total: 150 },
      });
    });

    it('UPDATE-2: Should return error on unauthorized access', async () => {
      const { auth } = await import('../auth');
      vi.mocked(auth).mockResolvedValueOnce({ user: { businessId: null } } as any);

      const result = await updateBusinessBalance(100);

      expect(result).toEqual({ error: 'No autorizado' });
    });
  });
});
