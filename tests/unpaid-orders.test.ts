import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockDb } from './setup';
import { createUnpaidOrder, registerPayment, cancelUnpaidOrder, getUnpaidOrders } from '../src/actions/unpaid-orders';

vi.mock('../src/lib/db', () => ({
  db: mockDb,
}));

vi.mock('../auth', () => ({
  auth: vi.fn().mockResolvedValue({ 
    user: { 
      businessId: 'business-123',
      name: 'seller-1'
    } 
  }),
}));

vi.mock('next/server', () => ({
  revalidatePath: vi.fn(),
}));

const { db } = { db: mockDb };

describe('Cuenta Corriente - Unpaid Orders', () => {
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

  describe('createUnpaidOrder', () => {
    const input = {
      clientId: 'client-1',
      businessId: 'business-123',
      items: mockOrderItems,
      total: 300,
    };

    it('AC1: Creates order with paidStatus:inpago', async () => {
      vi.mocked(db.client.findUnique).mockResolvedValue(mockClient as any);
      vi.mocked(db.product.findUnique).mockResolvedValue(mockProduct as any);
      vi.mocked(db.order.create).mockResolvedValue({
        id: 'order-1',
        paidStatus: 'inpago',
        total: 300,
      } as any);
      vi.mocked(db.orderItem.create).mockResolvedValue({
        id: 'item-1',
      } as any);
      vi.mocked(db.stockMovement.create).mockResolvedValue({
        id: 'stock-1',
      } as any);
      vi.mocked(db.product.update).mockResolvedValue(mockProduct as any);
      vi.mocked(db.client.update).mockResolvedValue({
        ...mockClient,
        balance: 300,
      } as any);

      const result = await createUnpaidOrder(input);

      expect(db.order.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            paidStatus: 'inpago',
            clientId: 'client-1',
            total: 300,
          }),
        })
      );
      expect(result.success).toBe(true);
    });

    it('AC3: Deducts stock for each product', async () => {
      vi.mocked(db.client.findUnique).mockResolvedValue(mockClient as any);
      vi.mocked(db.product.findUnique).mockResolvedValue(mockProduct as any);
      vi.mocked(db.order.create).mockResolvedValue({
        id: 'order-1',
        paidStatus: 'inpago',
        total: 300,
      } as any);
      vi.mocked(db.orderItem.create).mockResolvedValue({
        id: 'item-1',
      } as any);
      vi.mocked(db.stockMovement.create).mockResolvedValue({
        id: 'stock-1',
      } as any);
      vi.mocked(db.product.update).mockResolvedValue({
        ...mockProduct,
        amount: 48,
      } as any);
      vi.mocked(db.client.update).mockResolvedValue({
        ...mockClient,
        balance: 300,
      } as any);

      await createUnpaidOrder(input);

      expect(db.stockMovement.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: 'SALE',
            quantity: -2,
            productId: 'product-1',
          }),
        })
      );
      expect(db.product.update).toHaveBeenCalledWith({
        where: { id: 'product-1' },
        data: { amount: { decrement: 2 } },
      });
    });

    it('AC1: Does NOT create CashMovement', async () => {
      vi.mocked(db.client.findUnique).mockResolvedValue(mockClient as any);
      vi.mocked(db.product.findUnique).mockResolvedValue(mockProduct as any);
      vi.mocked(db.order.create).mockResolvedValue({
        id: 'order-1',
        paidStatus: 'inpago',
        total: 300,
      } as any);
      vi.mocked(db.orderItem.create).mockResolvedValue({
        id: 'item-1',
      } as any);
      vi.mocked(db.stockMovement.create).mockResolvedValue({
        id: 'stock-1',
      } as any);
      vi.mocked(db.product.update).mockResolvedValue(mockProduct as any);
      vi.mocked(db.client.update).mockResolvedValue({
        ...mockClient,
        balance: 300,
      } as any);

      await createUnpaidOrder(input);

      expect(db.cashMovement.create).not.toHaveBeenCalled();
    });

    it('AC2: Updates Client.balance with order total', async () => {
      vi.mocked(db.client.findUnique).mockResolvedValue(mockClient as any);
      vi.mocked(db.product.findUnique).mockResolvedValue(mockProduct as any);
      vi.mocked(db.order.create).mockResolvedValue({
        id: 'order-1',
        paidStatus: 'inpago',
        total: 300,
      } as any);
      vi.mocked(db.orderItem.create).mockResolvedValue({
        id: 'item-1',
      } as any);
      vi.mocked(db.stockMovement.create).mockResolvedValue({
        id: 'stock-1',
      } as any);
      vi.mocked(db.product.update).mockResolvedValue(mockProduct as any);
      vi.mocked(db.client.update).mockResolvedValue({
        ...mockClient,
        balance: 300,
      } as any);

      await createUnpaidOrder(input);

      expect(db.client.update).toHaveBeenCalledWith({
        where: { id: 'client-1' },
        data: { balance: { increment: 300 } },
      });
    });

    it('AC3: Fails when stock is insufficient', async () => {
      const lowStockProduct = { ...mockProduct, amount: 1 };
      vi.mocked(db.client.findUnique).mockResolvedValue(mockClient as any);
      vi.mocked(db.product.findUnique).mockResolvedValue(lowStockProduct as any);

      const result = await createUnpaidOrder(input);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Stock insuficiente');
    });
  });

  describe('registerPayment', () => {
    const paymentInput = {
      orderId: 'order-1',
      amount: 150,
      paymentMethod: 'TRANSFER',
      businessId: 'business-123',
    };

    const mockOrder = {
      id: 'order-1',
      total: 300,
      paidStatus: 'inpago',
      clientId: 'client-1',
      client: { id: 'client-1', name: 'Cliente Test', balance: 300 },
      cashMovements: [],
    };

    it('AC4: Creates CashMovement with correct amount and method', async () => {
      vi.mocked(db.order.findUnique).mockResolvedValue(mockOrder as any);
      vi.mocked(db.cashMovement.create).mockResolvedValue({
        id: 'cash-1',
        total: 150,
        paidMethod: 'TRANSFER',
      } as any);
      vi.mocked(db.client.update).mockResolvedValue({
        ...mockOrder.client,
        balance: 150,
      } as any);
      vi.mocked(db.order.update).mockResolvedValue({
        ...mockOrder,
        paidStatus: 'inpago',
      } as any);

      const result = await registerPayment(paymentInput);

      expect(db.cashMovement.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            total: 150,
            paidMethod: 'TRANSFER',
            orderId: 'order-1',
          }),
        })
      );
      expect(result.success).toBe(true);
    });

    it('AC5: Decreases Client.balance by payment amount', async () => {
      vi.mocked(db.order.findUnique).mockResolvedValue(mockOrder as any);
      vi.mocked(db.cashMovement.create).mockResolvedValue({
        id: 'cash-1',
        total: 150,
      } as any);
      vi.mocked(db.client.update).mockResolvedValue({
        ...mockOrder.client,
        balance: 150,
      } as any);
      vi.mocked(db.order.update).mockResolvedValue({
        ...mockOrder,
        paidStatus: 'inpago',
      } as any);

      await registerPayment(paymentInput);

      expect(db.client.update).toHaveBeenCalledWith({
        where: { id: 'client-1' },
        data: { balance: { decrement: 150 } },
      });
    });

    it('AC6: Changes order status to pago when fully paid', async () => {
      const fullPaymentInput = { ...paymentInput, amount: 300 };
      vi.mocked(db.order.findUnique).mockResolvedValue(mockOrder as any);
      vi.mocked(db.cashMovement.create).mockResolvedValue({
        id: 'cash-1',
        total: 300,
      } as any);
      vi.mocked(db.client.update).mockResolvedValue({
        ...mockOrder.client,
        balance: 0,
      } as any);
      vi.mocked(db.order.update).mockResolvedValue({
        ...mockOrder,
        paidStatus: 'pago',
      } as any);

      await registerPayment(fullPaymentInput);

      expect(db.order.update).toHaveBeenCalledWith({
        where: { id: 'order-1' },
        data: { paidStatus: 'pago' },
      });
    });

    it('AC6: Keeps status as inpago for partial payment', async () => {
      vi.mocked(db.order.findUnique).mockResolvedValue(mockOrder as any);
      vi.mocked(db.cashMovement.create).mockResolvedValue({
        id: 'cash-1',
        total: 150,
      } as any);
      vi.mocked(db.client.update).mockResolvedValue({
        ...mockOrder.client,
        balance: 150,
      } as any);
      vi.mocked(db.order.update).mockResolvedValue({
        ...mockOrder,
        paidStatus: 'inpago',
      } as any);

      await registerPayment(paymentInput);

      expect(db.order.update).toHaveBeenCalledWith({
        where: { id: 'order-1' },
        data: { paidStatus: 'inpago' },
      });
    });

    it('AC5: Fails when payment exceeds remaining balance', async () => {
      const excessPaymentInput = { ...paymentInput, amount: 400 };
      vi.mocked(db.order.findUnique).mockResolvedValue(mockOrder as any);

      const result = await registerPayment(excessPaymentInput);

      expect(result.success).toBe(false);
      expect(result.error).toContain('no puede exceder');
    });
  });

  describe('cancelUnpaidOrder', () => {
    const cancelInput = {
      orderId: 'order-1',
      businessId: 'business-123',
    };

    const mockOrderToCancel = {
      id: 'order-1',
      total: 300,
      paidStatus: 'inpago',
      clientId: 'client-1',
      client: { id: 'client-1', name: 'Cliente Test', balance: 300 },
      items: [
        {
          id: 'item-1',
          productId: 'product-1',
          quantity: 2,
          product: { id: 'product-1', amount: 48 },
        },
      ],
    };

    it('AC7: Creates StockMovement RETURN to restore stock', async () => {
      vi.mocked(db.order.findUnique).mockResolvedValue(mockOrderToCancel as any);
      vi.mocked(db.stockMovement.create).mockResolvedValue({
        id: 'stock-1',
        type: 'RETURN',
      } as any);
      vi.mocked(db.product.update).mockResolvedValue({
        ...mockProduct,
        amount: 50,
      } as any);
      vi.mocked(db.client.update).mockResolvedValue({
        ...mockClient,
        balance: 0,
      } as any);
      vi.mocked(db.order.update).mockResolvedValue({
        ...mockOrderToCancel,
        paidStatus: 'cancelado',
      } as any);

      await cancelUnpaidOrder(cancelInput);

      expect(db.stockMovement.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: 'RETURN',
            quantity: 2,
            productId: 'product-1',
          }),
        })
      );
    });

    it('AC7: Restores product stock amount', async () => {
      vi.mocked(db.order.findUnique).mockResolvedValue(mockOrderToCancel as any);
      vi.mocked(db.stockMovement.create).mockResolvedValue({
        id: 'stock-1',
      } as any);
      vi.mocked(db.product.update).mockResolvedValue({
        ...mockProduct,
        amount: 50,
      } as any);
      vi.mocked(db.client.update).mockResolvedValue({
        ...mockClient,
        balance: 0,
      } as any);
      vi.mocked(db.order.update).mockResolvedValue({
        ...mockOrderToCancel,
        paidStatus: 'cancelado',
      } as any);

      await cancelUnpaidOrder(cancelInput);

      expect(db.product.update).toHaveBeenCalledWith({
        where: { id: 'product-1' },
        data: { amount: { increment: 2 } },
      });
    });

    it('AC8: Decreases Client.balance by order total', async () => {
      vi.mocked(db.order.findUnique).mockResolvedValue(mockOrderToCancel as any);
      vi.mocked(db.stockMovement.create).mockResolvedValue({
        id: 'stock-1',
      } as any);
      vi.mocked(db.product.update).mockResolvedValue({
        ...mockProduct,
        amount: 50,
      } as any);
      vi.mocked(db.client.update).mockResolvedValue({
        ...mockClient,
        balance: 0,
      } as any);
      vi.mocked(db.order.update).mockResolvedValue({
        ...mockOrderToCancel,
        paidStatus: 'cancelado',
      } as any);

      await cancelUnpaidOrder(cancelInput);

      expect(db.client.update).toHaveBeenCalledWith({
        where: { id: 'client-1' },
        data: { balance: { decrement: 300 } },
      });
    });

    it('AC7: Cannot cancel already paid order', async () => {
      const paidOrder = { ...mockOrderToCancel, paidStatus: 'pago' };
      vi.mocked(db.order.findUnique).mockResolvedValue(paidOrder as any);

      const result = await cancelUnpaidOrder(cancelInput);

      expect(result.success).toBe(false);
      expect(result.error).toContain('ya pagado');
    });
  });

  describe('getUnpaidOrders', () => {
    it('AC9: Returns all unpaid orders for business', async () => {
      const mockOrders = [
        {
          id: 'order-1',
          total: 300,
          paidStatus: 'inpago',
          client: { id: 'client-1', name: 'Cliente 1' },
          date: new Date(),
        },
        {
          id: 'order-2',
          total: 500,
          paidStatus: 'inpago',
          client: { id: 'client-2', name: 'Cliente 2' },
          date: new Date(),
        },
      ];

      vi.mocked(db.order.findMany).mockResolvedValue(mockOrders as any);

      const result = await getUnpaidOrders({ businessId: 'business-123' });

      expect(db.order.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            businessId: 'business-123',
            paidStatus: 'inpago',
          }),
        })
      );
      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(2);
    });

    it('AC9: Filters by status correctly', async () => {
      vi.mocked(db.order.findMany).mockResolvedValue([] as any);

      await getUnpaidOrders({ 
        businessId: 'business-123', 
        status: 'pagado' 
      });

      expect(db.order.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            paidStatus: 'pago',
          }),
        })
      );
    });

    it('AC10: Includes payment history in order detail', async () => {
      const mockOrderWithPayments = {
        id: 'order-1',
        total: 300,
        paidStatus: 'inpago',
        client: { id: 'client-1', name: 'Cliente 1' },
        cashMovements: [
          { id: 'cash-1', total: 150, paidMethod: 'CASH', date: new Date() },
        ],
      };

      vi.mocked(db.order.findUnique).mockResolvedValue(mockOrderWithPayments as any);

      const result = await getUnpaidOrders({ 
        businessId: 'business-123', 
        orderId: 'order-1' 
      }) as { success: boolean; data: Array<{ cashMovements: Array<{ id: string }> }> };

      expect(result.data?.[0].cashMovements).toHaveLength(1);
    });
  });
});
