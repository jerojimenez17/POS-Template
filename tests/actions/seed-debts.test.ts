import { describe, it, expect, vi, beforeEach } from 'vitest';
import { seedDebtsFromExcel } from '@/actions/seed-debts';
import { db } from '@/lib/db';
import * as xlsx from 'xlsx';

// Remove duplicate db mock, rely on setup.ts

vi.mock('xlsx', () => ({
  read: vi.fn().mockReturnValue({
    SheetNames: ['Sheet1'],
    Sheets: { 'Sheet1': {} }
  }),
  utils: {
    sheet_to_json: vi.fn()
  }
}));

vi.mock('fs', () => ({
  default: {
    existsSync: vi.fn().mockReturnValue(true),
    readFileSync: vi.fn().mockReturnValue(Buffer.from(''))
  },
  existsSync: vi.fn().mockReturnValue(true),
  readFileSync: vi.fn().mockReturnValue(Buffer.from(''))
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

vi.mock('@/auth', () => ({
  auth: vi.fn().mockResolvedValue({ user: { businessId: 'business-123' } }),
}));

describe('seedDebtsFromExcel', () => {
  const businessId = 'business-123';
  const mockFilePath = 'dummy/path.xlsx';

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Add missing mocks not in setup.ts
    (db.product as any).findFirst = vi.fn();
    (db.client as any).findFirst = vi.fn();
    (db.client as any).create = vi.fn();
    (db.productRanking as any) = { upsert: vi.fn() };
  });

  it('SEED1: should ignore rows with total debt equal to 0', async () => {
    vi.mocked(xlsx.utils.sheet_to_json).mockReturnValue([
      ['Header1', 'Header2', 'Header3'],
      ['Client 1', 100, 44000],
      ['Client 2', 0, 44000],
      ['Client 3', -50, 44000]
    ]);

    // Setup db mocks
    vi.mocked(db.product.findFirst).mockResolvedValue({ id: 'prod-traspaso' });
    vi.mocked(db.client.findFirst).mockResolvedValue({ id: 'client-1' });

    const result = await seedDebtsFromExcel(mockFilePath, businessId);

    expect(result.success).toBe(true);
    expect(result.processed).toBe(1); // Only Client 1 should be processed
    expect(db.order.create).toHaveBeenCalledTimes(1);
  });

  it('SEED2: should fallback to current date if date is invalid', async () => {
    vi.mocked(xlsx.utils.sheet_to_json).mockReturnValue([
      ['Header1', 'Header2', 'Header3'],
      ['Client No Date', 100, null],
      ['Client Invalid Date', 100, 'not a date']
    ]);

    vi.mocked(db.product.findFirst).mockResolvedValue({ id: 'prod-traspaso' });
    vi.mocked(db.client.findFirst).mockResolvedValue({ id: 'client-1' });
    
    // We mock order.create to capture arguments
    const createOrderSpy = vi.mocked(db.order.create);

    await seedDebtsFromExcel(mockFilePath, businessId);

    expect(createOrderSpy).toHaveBeenCalledTimes(2);
    
    // Check that both dates are valid Date objects and approximately "now"
    const firstCallDate = createOrderSpy.mock.calls[0][0].data.date;
    const secondCallDate = createOrderSpy.mock.calls[1][0].data.date;
    
    expect(firstCallDate).toBeInstanceOf(Date);
    expect(secondCallDate).toBeInstanceOf(Date);
    expect((firstCallDate as Date).getTime()).toBeGreaterThan(Date.now() - 5000);
  });

  it('SEED3: should create Traspaso product if it does not exist', async () => {
    vi.mocked(xlsx.utils.sheet_to_json).mockReturnValue([
      ['Header1', 'Header2', 'Header3'],
      ['Client 1', 100, 44000]
    ]);

    // Traspaso not found initially
    vi.mocked(db.product.findFirst).mockResolvedValue(null);
    vi.mocked(db.product.create).mockResolvedValue({ id: 'new-traspaso', description: 'Traspaso' });
    vi.mocked(db.client.findFirst).mockResolvedValue({ id: 'client-1' });

    await seedDebtsFromExcel(mockFilePath, businessId);

    expect(db.product.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        description: 'Traspaso',
        businessId: businessId
      })
    }));
  });

  it('SEED4: should create client if not exists', async () => {
    vi.mocked(xlsx.utils.sheet_to_json).mockReturnValue([
      ['Header1', 'Header2', 'Header3'],
      ['New Client', 100, 44000]
    ]);

    vi.mocked(db.product.findFirst).mockResolvedValue({ id: 'prod-traspaso' });
    // Client not found
    vi.mocked(db.client.findFirst).mockResolvedValue(null);
    vi.mocked(db.client.create).mockResolvedValue({ id: 'new-client', name: 'New Client' });

    await seedDebtsFromExcel(mockFilePath, businessId);

    expect(db.client.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        name: 'New Client',
        businessId: businessId
      })
    }));
  });

  it('SEED5 & SEED6: should create unpaid order and update client balance', async () => {
    vi.mocked(xlsx.utils.sheet_to_json).mockReturnValue([
      ['Header1', 'Header2', 'Header3'],
      ['Client 1', 500.50, 44000]
    ]);

    vi.mocked(db.product.findFirst).mockResolvedValue({ id: 'prod-traspaso' });
    vi.mocked(db.client.findFirst).mockResolvedValue({ id: 'client-1' });
    vi.mocked(db.order.create).mockResolvedValue({ id: 'order-1' });

    await seedDebtsFromExcel(mockFilePath, businessId);

    // Verify order creation
    expect(db.order.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        clientId: 'client-1',
        total: 500.50,
        paidStatus: 'inpago',
        status: 'confirmado',
        items: expect.objectContaining({
          create: expect.arrayContaining([
            expect.objectContaining({
              productId: 'prod-traspaso',
              subTotal: 500.50,
              price: 500.50,
              quantity: 1
            })
          ])
        })
      })
    }));

    // Verify client balance update
    expect(db.client.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'client-1' },
      data: expect.objectContaining({
        balance: { increment: 500.50 }
      })
    }));
  });
});
