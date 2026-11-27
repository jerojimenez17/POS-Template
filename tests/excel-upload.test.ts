import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createProductsBulk, previewProductsBulk } from '../src/actions/stock';
import { parseExcelIva } from '../src/utils/iva-parser';
import { mockDb } from './setup';

vi.mock('next/cache', () => ({
  revalidateTag: vi.fn(),
}));

vi.mock('../src/lib/auth-gates', () => ({
  assertWritePermission: vi.fn().mockResolvedValue({ success: true }),
  assertLimit: vi.fn().mockResolvedValue({ success: true }),
}));

const { db } = { db: mockDb };

describe('createProductsBulk with updateExisting', () => {
  const mockSession = {
    user: {
      businessId: 'business-123',
    },
  };

  const mockProductInput = [
    {
      code: 'PROD001',
      description: 'Producto de prueba',
      price: 100,
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Cuando updateExisting=true y el producto existe', () => {
    it('debe actualizar el precio del producto existente', async () => {
      const existingProduct = {
        id: 'product-id-1',
        code: 'PROD001',
        description: 'Producto antiguo',
        price: 50,
        salePrice: 50,
        amount: 0,
        gain: 0,
        supplierId: null,
      };

      vi.mocked(db.product.findMany).mockResolvedValue([existingProduct] as any);
      vi.mocked(db.product.update).mockResolvedValue({
        ...existingProduct,
        price: 100,
        salePrice: 100,
      } as any);
      vi.mocked(db.product.createMany).mockResolvedValue({ count: 0 });
      vi.mocked(db.brand.findMany).mockResolvedValue([]);
      vi.mocked(db.category.findMany).mockResolvedValue([]);

      const result = await createProductsBulk(mockProductInput, true);

      expect(db.product.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({
          businessId: 'business-123',
          code: expect.objectContaining({ in: ['PROD001'] }),
        }),
      }));
      // Merged bulk writes updates via tx.product.update inside the batch
      // transaction (stock/bulk.ts) — no longer raw SQL.
      expect(db.product.update).toHaveBeenCalled();
      const updateCall = vi.mocked(db.product.update).mock.calls[0];
      expect(updateCall[0].where).toEqual(expect.objectContaining({ id: 'product-id-1' }));
      expect(updateCall[0].data).toEqual(expect.objectContaining({
        price: 100,
        salePrice: 100,
      }));
      expect(db.product.createMany).not.toHaveBeenCalled();
      expect(result.success).toContain('1');
    });
  });

  describe('Cuando updateExisting=true y el producto no existe', () => {
    it('debe crear un nuevo producto', async () => {
      vi.mocked(db.product.findMany).mockResolvedValue([]);
      vi.mocked(db.product.createMany).mockResolvedValue({ count: 1 });
      vi.mocked(db.brand.findMany).mockResolvedValue([]);
      vi.mocked(db.category.findMany).mockResolvedValue([]);

      const result = await createProductsBulk(mockProductInput, true);

      expect(db.product.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({
          businessId: 'business-123',
          code: expect.objectContaining({ in: ['PROD001'] }),
        }),
      }));
      expect(db.product.createMany).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({
            code: 'PROD001',
            description: 'Producto de prueba',
            price: 100,
          }),
        ]),
      }));
      expect(db.product.update).not.toHaveBeenCalled();
      expect(result.success).toContain('1');
    });
  });

  describe('Cuando updateExisting=false y el producto no existe', () => {
    it('debe crear un nuevo producto', async () => {
      vi.mocked(db.product.findMany).mockResolvedValue([]);
      vi.mocked(db.product.createMany).mockResolvedValue({ count: 1 });
      vi.mocked(db.brand.findMany).mockResolvedValue([]);
      vi.mocked(db.category.findMany).mockResolvedValue([]);

      const result = await createProductsBulk(mockProductInput, false);

      expect(db.product.findMany).toHaveBeenCalled();
      expect(db.product.createMany).toHaveBeenCalled();
      expect(result.success).toContain('1');
    });
  });

  describe('Cuando updateExisting=false y el producto existe', () => {
    it('debe ignorar (no crear ni actualizar) el producto existente', async () => {
      const existingProduct = {
        id: 'product-id-1',
        code: 'PROD001',
        description: 'Producto existente',
        price: 50,
        salePrice: 50,
        amount: 0,
        gain: 0,
        supplierId: null,
      };

      vi.mocked(db.product.findMany).mockResolvedValue([existingProduct] as any);
      vi.mocked(db.brand.findMany).mockResolvedValue([]);
      vi.mocked(db.category.findMany).mockResolvedValue([]);

      const result = await createProductsBulk(mockProductInput, false);

      expect(db.product.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({
          businessId: 'business-123',
          code: expect.objectContaining({ in: ['PROD001'] }),
        }),
      }));
      expect(db.product.createMany).not.toHaveBeenCalled();
      expect(db.product.update).not.toHaveBeenCalled();
      expect(result.success).toContain('0');
    });
  });

  describe('Gestión de stock (amount) con colAmount del Excel', () => {
    describe('Producto nuevo', () => {
      it('cuando colAmount está definido → usar valor del Excel', async () => {
        const productWithAmount = [
          {
            code: 'PROD001',
            description: 'Producto nuevo',
            price: 100,
            amount: 50,
          },
        ];

        vi.mocked(db.product.findMany).mockResolvedValue([]);
        vi.mocked(db.product.createMany).mockResolvedValue({ count: 1 });
        vi.mocked(db.brand.findMany).mockResolvedValue([]);
        vi.mocked(db.category.findMany).mockResolvedValue([]);

        await createProductsBulk(productWithAmount, false);

        expect(db.product.createMany).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.arrayContaining([
              expect.objectContaining({
                amount: 50,
              }),
            ]),
          })
        );
      });

      it('cuando colAmount NO está definido (undefined) → stock = 0', async () => {
        const productWithoutAmount = [
          {
            code: 'PROD001',
            description: 'Producto nuevo',
            price: 100,
          },
        ];

        vi.mocked(db.product.findMany).mockResolvedValue([]);
        vi.mocked(db.product.createMany).mockResolvedValue({ count: 1 });
        vi.mocked(db.brand.findMany).mockResolvedValue([]);
        vi.mocked(db.category.findMany).mockResolvedValue([]);

        await createProductsBulk(productWithoutAmount, false);

        expect(db.product.createMany).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.arrayContaining([
              expect.objectContaining({
                amount: 0,
              }),
            ]),
          })
        );
      });
    });

    describe('Producto existente con updateExisting=true', () => {
      const existingProduct = {
        id: 'product-id-1',
        code: 'PROD001',
        description: 'Producto existente',
        price: 50,
        salePrice: 50,
        amount: 100,
        gain: 0,
        supplierId: null,
      };

      it('cuando colAmount está definido → actualizar stock con valor del Excel', async () => {
        const productWithAmount = [
          {
            code: 'PROD001',
            description: 'Producto actualizado',
            price: 100,
            amount: 75,
          },
        ];

        vi.mocked(db.product.findMany).mockResolvedValue([existingProduct] as any);
        vi.mocked(db.product.update).mockResolvedValue({
          ...existingProduct,
          amount: 75,
        } as any);
        vi.mocked(db.brand.findMany).mockResolvedValue([]);
        vi.mocked(db.category.findMany).mockResolvedValue([]);

        await createProductsBulk(productWithAmount, true);

        expect(db.product.update).toHaveBeenCalled();
        const updateCall = vi.mocked(db.product.update).mock.calls[0];
        expect(updateCall[0].data).toEqual(expect.objectContaining({ amount: 75 }));
      });

      it('cuando colAmount NO está definido (undefined) → mantener stock actual', async () => {
        const productWithoutAmount = [
          {
            code: 'PROD001',
            description: 'Producto actualizado',
            price: 100,
          },
        ];

        vi.mocked(db.product.findMany).mockResolvedValue([existingProduct] as any);
        vi.mocked(db.product.update).mockResolvedValue({
          ...existingProduct,
          amount: 100,
        } as any);
        vi.mocked(db.brand.findMany).mockResolvedValue([]);
        vi.mocked(db.category.findMany).mockResolvedValue([]);

        await createProductsBulk(productWithoutAmount, true);

        // Merged mechanism: tx.product.update; amount is only written when
        // explicitly provided in the Excel row (bulk.ts "Only update amount if
        // explicitly provided").
        expect(db.product.update).toHaveBeenCalled();
        const updateCall = vi.mocked(db.product.update).mock.calls[0];
        expect(updateCall[0].where).toEqual(expect.objectContaining({ id: 'product-id-1' }));
        expect(updateCall[0].data).not.toHaveProperty('amount');
      });
    });
  });
});

describe('createProductsBulk with price adjustments', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should apply discount, IVA, and gain formula correctly', async () => {
    const productInput = [
      { code: 'PROD001', description: 'Producto de prueba', price: 100 },
    ];

    vi.mocked(db.product.findMany).mockResolvedValue([]);
    vi.mocked(db.product.createMany).mockResolvedValue({ count: 1 });
    vi.mocked(db.brand.findMany).mockResolvedValue([]);
    vi.mocked(db.category.findMany).mockResolvedValue([]);

    await createProductsBulk(productInput, true, false, 5, 21, 50);

    expect(db.product.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({
            // Merged batch rounds to the nearest 10 (roundToNearest10):
            // price = round10(100 * 0.95 * 1.21 = 114.95) = 110
            // salePrice = round10(110 * 1.5 = 165) = 170
            price: 110,
            salePrice: 170,
            gain: 50,
          }),
        ]),
      })
    );
  });

  it('should apply IVA 0% correctly', async () => {
    const productInput = [
      { code: 'PROD001', description: 'Test', price: 200 },
    ];

    vi.mocked(db.product.findMany).mockResolvedValue([]);
    vi.mocked(db.product.createMany).mockResolvedValue({ count: 1 });
    vi.mocked(db.brand.findMany).mockResolvedValue([]);
    vi.mocked(db.category.findMany).mockResolvedValue([]);

    await createProductsBulk(productInput, true, false, 10, 0, 30);

    expect(db.product.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({
            // round10(200 * 0.9) = 180; round10(180 * 1.3 = 234) = 230
            price: 180,
            salePrice: 230,
            gain: 30,
          }),
        ]),
      })
    );
  });

  it('should apply IVA 10.5% correctly', async () => {
    const productInput = [
      { code: 'PROD001', description: 'Test', price: 100 },
    ];

    vi.mocked(db.product.findMany).mockResolvedValue([]);
    vi.mocked(db.product.createMany).mockResolvedValue({ count: 1 });
    vi.mocked(db.brand.findMany).mockResolvedValue([]);
    vi.mocked(db.category.findMany).mockResolvedValue([]);

    await createProductsBulk(productInput, true, false, 0, 10.5, 20);

    expect(db.product.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({
            // round10(100 * 1.105 = 110.5) = 110; round10(110 * 1.2 = 132) = 130
            price: 110,
            salePrice: 130,
            gain: 20,
          }),
        ]),
      })
    );
  });

  it('should NOT create new products when updateOnly=true and product does not exist', async () => {
    const productInput = [
      { code: 'PROD001', description: 'Producto de prueba', price: 100 },
    ];

    vi.mocked(db.product.findMany).mockResolvedValue([]);
    vi.mocked(db.brand.findMany).mockResolvedValue([]);
    vi.mocked(db.category.findMany).mockResolvedValue([]);

    const result = await createProductsBulk(productInput, true, true);

    expect(db.product.createMany).not.toHaveBeenCalled();
    expect(db.product.update).not.toHaveBeenCalled();
    expect(result.success).toContain('0');
  });

  it('should update product when updateOnly=true and product exists', async () => {
    const productInput = [
      { code: 'PROD001', description: 'Producto de prueba', price: 100 },
    ];

    const existingProduct = {
      id: 'product-id-1',
      code: 'PROD001',
      description: 'Producto existente',
      price: 50,
      salePrice: 50,
      amount: 10,
      gain: 0,
      supplierId: null,
    };

    vi.mocked(db.product.findMany).mockResolvedValue([existingProduct] as any);
    vi.mocked(db.product.update).mockResolvedValue(existingProduct as any);
    vi.mocked(db.brand.findMany).mockResolvedValue([]);
    vi.mocked(db.category.findMany).mockResolvedValue([]);

    await createProductsBulk(productInput, true, true);

    expect(db.product.update).toHaveBeenCalled();
    expect(db.product.createMany).not.toHaveBeenCalled();
  });

  it('should create new product when updateOnly=false and updateExisting=true and product does not exist', async () => {
    const productInput = [
      { code: 'PROD001', description: 'Producto de prueba', price: 100 },
    ];

    vi.mocked(db.product.findMany).mockResolvedValue([]);
    vi.mocked(db.product.createMany).mockResolvedValue({ count: 1 });
    vi.mocked(db.brand.findMany).mockResolvedValue([]);
    vi.mocked(db.category.findMany).mockResolvedValue([]);

    await createProductsBulk(productInput, true, false);

    expect(db.product.createMany).toHaveBeenCalled();
  });

  it('should connect new product to supplierId', async () => {
    const productInput = [
      { code: 'PROD001', description: 'Producto de prueba', price: 100 },
    ];

    vi.mocked(db.product.findMany).mockResolvedValue([]);
    vi.mocked(db.product.createMany).mockResolvedValue({ count: 1 });
    vi.mocked(db.brand.findMany).mockResolvedValue([]);
    vi.mocked(db.category.findMany).mockResolvedValue([]);

    await createProductsBulk(productInput, true, false, 0, 0, 0, 'supplier-1');

    expect(db.product.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({
            supplierId: 'supplier-1',
          }),
        ]),
      })
    );
  });

  it('should update supplier discount/iva/gain on confirm', async () => {
    const productInput = [
      { code: 'PROD001', description: 'Producto de prueba', price: 100 },
    ];

    vi.mocked(db.product.findMany).mockResolvedValue([]);
    vi.mocked(db.product.createMany).mockResolvedValue({ count: 1 });
    vi.mocked(db.brand.findMany).mockResolvedValue([]);
    vi.mocked(db.category.findMany).mockResolvedValue([]);

    await createProductsBulk(productInput, true, false, 5, 21, 50, 'supplier-1');

    expect(db.supplier.update).toHaveBeenCalledWith({
      where: { id: 'supplier-1' },
      data: { discount: 5, iva: 21, gain: 50 },
    });
  });
});

describe('previewProductsBulk with updateOnly', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should mark non-existing products as "ignore" when updateOnly=true', async () => {
    const productsData = [
      { code: 'NONEXISTENT', description: 'No existe', price: 100 },
    ];

    vi.mocked(db.product.findMany).mockResolvedValue([]);

    const result = await previewProductsBulk(productsData, true, true);

    expect(result.preview?.items[0].status).toBe('ignore');
  });

  it('should mark existing products as "update" when updateOnly=true', async () => {
    const productsData = [
      { code: 'EXISTING', description: 'Existe', price: 100 },
    ];

    vi.mocked(db.product.findMany).mockResolvedValue([
      { code: 'EXISTING', price: 50, salePrice: 50, supplierId: null }
    ] as any);

    const result = await previewProductsBulk(productsData, true, true);

    expect(result.preview?.items[0].status).toBe('update');
  });
});

describe('parseExcelIva', () => {
  it('debería parsear letra A como 21% IVA', () => {
    expect(parseExcelIva('A')).toEqual({ percent: 21, hasLetter: true });
    expect(parseExcelIva('a')).toEqual({ percent: 21, hasLetter: true });
  });

  it('debería parsear porcentaje explícito', () => {
    expect(parseExcelIva('21%')).toEqual({ percent: 21, hasLetter: false });
    expect(parseExcelIva('10.5%')).toEqual({ percent: 10.5, hasLetter: false });
    expect(parseExcelIva('0%')).toEqual({ percent: 0, hasLetter: false });
  });

  it('debería parsear números o cadenas numéricas', () => {
    expect(parseExcelIva(21)).toEqual({ percent: 21, hasLetter: false });
    expect(parseExcelIva('10,5')).toEqual({ percent: 10.5, hasLetter: false });
    expect(parseExcelIva('0')).toEqual({ percent: 0, hasLetter: false });
  });

  it('debería devolver null para valores vacíos o no válidos', () => {
    expect(parseExcelIva('')).toEqual({ percent: null, hasLetter: false });
    expect(parseExcelIva(null)).toEqual({ percent: null, hasLetter: false });
    expect(parseExcelIva(undefined)).toEqual({ percent: null, hasLetter: false });
    expect(parseExcelIva('invalido')).toEqual({ percent: null, hasLetter: false });
  });
});

describe('createProductsBulk con IVA de Excel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(db.brand.findMany).mockResolvedValue([]);
    vi.mocked(db.category.findMany).mockResolvedValue([]);
    vi.mocked(db.product.findMany).mockResolvedValue([]);
    vi.mocked(db.product.createMany).mockResolvedValue({ count: 1 });
  });

  // Post-split contract: the Excel "IVA" column is parsed CLIENT-SIDE by
  // excel-upload-modal via parseExcelIva (src/utils/iva-parser), which forwards
  // the resolved percent as the action's `iva` argument. The server batch never
  // reads item.iva itself. These tests pin that end-to-end percent handling.

  it('debería aplicar el 21% resuelto de la letra A (parseExcelIva + acción)', async () => {
    const productInput = [
      { code: 'PROD001', description: 'Test A', price: 100, iva: 'A' },
    ];
    const resolved = parseExcelIva('A'); // modal-layer step

    await createProductsBulk(productInput, true, false, 0, resolved.percent ?? 0, 0, 'supplier-1');

    expect(resolved).toEqual({ percent: 21, hasLetter: true });
    expect(db.product.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({
            price: 120,
            supplierId: 'supplier-1',
          }),
        ]),
      })
    );
  });

  it('debería aplicar el porcentaje explícito del excel, ignorando el IVA del proveedor', async () => {
    const productInput = [
      { code: 'PROD001', description: 'Test P', price: 100, iva: '10.5%' },
    ];
    const resolved = parseExcelIva('10.5%');

    await createProductsBulk(productInput, true, false, 0, resolved.percent ?? 0, 0, 'supplier-1');

    expect(db.product.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({
            price: 110,
            supplierId: 'supplier-1',
          }),
        ]),
      })
    );
  });

  it('debería aplicar 0% de IVA si se especifica 0% en el excel, ignorando el IVA del proveedor', async () => {
    const productInput = [
      { code: 'PROD001', description: 'Test 0', price: 100, iva: '0%' },
    ];
    const resolved = parseExcelIva('0%');

    await createProductsBulk(productInput, true, false, 0, resolved.percent ?? 0, 0, 'supplier-1');

    expect(resolved.percent).toBe(0);
    expect(db.product.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({
            price: 100,
            supplierId: 'supplier-1',
          }),
        ]),
      })
    );
  });

  it('debería aplicar el IVA del proveedor si el campo IVA en el excel está vacío o es null', async () => {
    const productInput = [
      { code: 'PROD001', description: 'Test vacío', price: 100, iva: '' },
    ];

    await createProductsBulk(productInput, true, false, 0, 21, 0, 'supplier-1');

    expect(db.product.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({
            price: 120,
            supplierId: 'supplier-1',
          }),
        ]),
      })
    );
  });
});
