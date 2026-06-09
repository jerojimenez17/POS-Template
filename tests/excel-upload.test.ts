import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createProductsBulk, previewProductsBulk } from '../src/actions/stock';
import { mockDb } from './setup';

vi.mock('next/server', () => ({
  revalidatePath: vi.fn(),
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
      };

      vi.mocked(db.product.findFirst).mockResolvedValue(existingProduct as any);
      vi.mocked(db.product.update).mockResolvedValue({
        ...existingProduct,
        price: 100,
        salePrice: 100,
      } as any);
      vi.mocked(db.product.create).mockResolvedValue(existingProduct as any);
      vi.mocked(db.brand.findFirst).mockResolvedValue(null);
      vi.mocked(db.category.findFirst).mockResolvedValue(null);

      const result = await createProductsBulk(mockProductInput, true);

      expect(db.product.findFirst).toHaveBeenCalledWith({
        where: {
          code: 'PROD001',
          businessId: 'business-123',
        },
      });
      expect(db.product.update).toHaveBeenCalledWith({
        where: { id: 'product-id-1' },
        data: expect.objectContaining({
          price: 100,
          salePrice: 100,
        }),
      });
      expect(db.product.create).not.toHaveBeenCalled();
      expect(result.success).toContain('1');
    });
  });

  describe('Cuando updateExisting=true y el producto no existe', () => {
    it('debe crear un nuevo producto', async () => {
      vi.mocked(db.product.findFirst).mockResolvedValue(null);
      vi.mocked(db.product.create).mockResolvedValue({
        id: 'new-product-id',
        code: 'PROD001',
        description: 'Producto de prueba',
        price: 100,
        salePrice: 100,
        image: null,
        businessId: 'business-123',
        brandId: null,
        categoryId: null,
        subCategoryId: null,
        amount: 0,
        gain: 0,
        unit: 'unidades',
        supplierId: null,
        client_bonus: null,
        creation_date: new Date(),
      } as any);
      vi.mocked(db.brand.findFirst).mockResolvedValue(null);
      vi.mocked(db.category.findFirst).mockResolvedValue(null);

      const result = await createProductsBulk(mockProductInput, true);

      expect(db.product.findFirst).toHaveBeenCalledWith({
        where: {
          code: 'PROD001',
          businessId: 'business-123',
        },
      });
      expect(db.product.create).toHaveBeenCalled();
      expect(db.product.update).not.toHaveBeenCalled();
      expect(result.success).toContain('1');
    });
  });

  describe('Cuando updateExisting=false y el producto no existe', () => {
    it('debe crear un nuevo producto', async () => {
      vi.mocked(db.product.findFirst).mockResolvedValue(null);
      vi.mocked(db.product.create).mockResolvedValue({
        id: 'new-product-id',
        code: 'PROD001',
        description: 'Producto de prueba',
        price: 100,
        salePrice: 100,
        image: null,
        businessId: 'business-123',
        brandId: null,
        categoryId: null,
        subCategoryId: null,
        amount: 0,
        gain: 0,
        unit: 'unidades',
        supplierId: null,
        client_bonus: null,
        creation_date: new Date(),
      } as any);
      vi.mocked(db.brand.findFirst).mockResolvedValue(null);
      vi.mocked(db.category.findFirst).mockResolvedValue(null);

      const result = await createProductsBulk(mockProductInput, false);

      expect(db.product.findFirst).toHaveBeenCalled();
      expect(db.product.create).toHaveBeenCalled();
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
      };

      vi.mocked(db.product.findFirst).mockResolvedValue(existingProduct as any);
      vi.mocked(db.brand.findFirst).mockResolvedValue(null);
      vi.mocked(db.category.findFirst).mockResolvedValue(null);

      const result = await createProductsBulk(mockProductInput, false);

      expect(db.product.findFirst).toHaveBeenCalledWith({
        where: {
          code: 'PROD001',
          businessId: 'business-123',
        },
      });
      expect(db.product.create).not.toHaveBeenCalled();
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

        vi.mocked(db.product.findFirst).mockResolvedValue(null);
        vi.mocked(db.product.create).mockResolvedValue({
          id: 'new-product-id',
          code: 'PROD001',
          description: 'Producto nuevo',
          price: 100,
          salePrice: 100,
          amount: 50,
        } as any);
        vi.mocked(db.brand.findFirst).mockResolvedValue(null);
        vi.mocked(db.category.findFirst).mockResolvedValue(null);

        const result = await createProductsBulk(productWithAmount, false);

        expect(db.product.create).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              amount: 50,
            }),
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

        vi.mocked(db.product.findFirst).mockResolvedValue(null);
        vi.mocked(db.product.create).mockResolvedValue({
          id: 'new-product-id',
          code: 'PROD001',
          description: 'Producto nuevo',
          price: 100,
          salePrice: 100,
          amount: 0,
        } as any);
        vi.mocked(db.brand.findFirst).mockResolvedValue(null);
        vi.mocked(db.category.findFirst).mockResolvedValue(null);

        const result = await createProductsBulk(productWithoutAmount, false);

        expect(db.product.create).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              amount: 0,
            }),
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

        vi.mocked(db.product.findFirst).mockResolvedValue(existingProduct as any);
        vi.mocked(db.product.update).mockResolvedValue({
          ...existingProduct,
          amount: 75,
        } as any);
        vi.mocked(db.brand.findFirst).mockResolvedValue(null);
        vi.mocked(db.category.findFirst).mockResolvedValue(null);

        await createProductsBulk(productWithAmount, true);

        expect(db.product.update).toHaveBeenCalledWith({
          where: { id: 'product-id-1' },
          data: expect.objectContaining({
            amount: 75,
          }),
        });
      });

      it('cuando colAmount NO está definido (undefined) → mantener stock actual', async () => {
        const productWithoutAmount = [
          {
            code: 'PROD001',
            description: 'Producto actualizado',
            price: 100,
          },
        ];

        vi.mocked(db.product.findFirst).mockResolvedValue(existingProduct as any);
        vi.mocked(db.product.update).mockResolvedValue({
          ...existingProduct,
          amount: 100,
        } as any);
        vi.mocked(db.brand.findFirst).mockResolvedValue(null);
        vi.mocked(db.category.findFirst).mockResolvedValue(null);

        await createProductsBulk(productWithoutAmount, true);

        expect(db.product.update).toHaveBeenCalledWith({
          where: { id: 'product-id-1' },
          data: expect.objectContaining({
            amount: 100,
          }),
        });
        expect(db.product.update).toHaveBeenCalledWith(
          expect.not.objectContaining({
            data: expect.objectContaining({
              amount: 0,
            }),
          })
        );
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

    vi.mocked(db.product.findFirst).mockResolvedValue(null);
    vi.mocked(db.product.create).mockResolvedValue({
      id: 'new-product-id',
      code: 'PROD001',
      price: 114.95,
      salePrice: 172.425,
      gain: 50,
    } as any);
    vi.mocked(db.brand.findFirst).mockResolvedValue(null);
    vi.mocked(db.category.findFirst).mockResolvedValue(null);

    await createProductsBulk(productInput, true, false, 5, 21, 50);

    expect(db.product.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          price: 114.95,
          salePrice: 172.425,
          gain: 50,
        }),
      })
    );
  });

  it('should apply IVA 0% correctly', async () => {
    const productInput = [
      { code: 'PROD001', description: 'Test', price: 200 },
    ];

    vi.mocked(db.product.findFirst).mockResolvedValue(null);
    vi.mocked(db.product.create).mockResolvedValue({
      id: 'new-product-id',
      code: 'PROD001',
      price: 180,
      salePrice: 234,
      gain: 30,
    } as any);
    vi.mocked(db.brand.findFirst).mockResolvedValue(null);
    vi.mocked(db.category.findFirst).mockResolvedValue(null);

    await createProductsBulk(productInput, true, false, 10, 0, 30);

    expect(db.product.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          price: 180,
          salePrice: 234,
          gain: 30,
        }),
      })
    );
  });

  it('should apply IVA 10.5% correctly', async () => {
    const productInput = [
      { code: 'PROD001', description: 'Test', price: 100 },
    ];

    vi.mocked(db.product.findFirst).mockResolvedValue(null);
    vi.mocked(db.product.create).mockResolvedValue({
      id: 'new-product-id',
      code: 'PROD001',
      price: 110.5,
      salePrice: 132.6,
      gain: 20,
    } as any);
    vi.mocked(db.brand.findFirst).mockResolvedValue(null);
    vi.mocked(db.category.findFirst).mockResolvedValue(null);

    await createProductsBulk(productInput, true, false, 0, 10.5, 20);

    expect(db.product.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          price: 110.5,
          salePrice: 132.6,
          gain: 20,
        }),
      })
    );
  });

  it('should NOT create new products when updateOnly=true and product does not exist', async () => {
    const productInput = [
      { code: 'PROD001', description: 'Producto de prueba', price: 100 },
    ];

    vi.mocked(db.product.findFirst).mockResolvedValue(null);
    vi.mocked(db.brand.findFirst).mockResolvedValue(null);
    vi.mocked(db.category.findFirst).mockResolvedValue(null);

    const result = await createProductsBulk(productInput, true, true);

    expect(db.product.create).not.toHaveBeenCalled();
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
    };

    vi.mocked(db.product.findFirst).mockResolvedValue(existingProduct as any);
    vi.mocked(db.product.update).mockResolvedValue(existingProduct as any);
    vi.mocked(db.brand.findFirst).mockResolvedValue(null);
    vi.mocked(db.category.findFirst).mockResolvedValue(null);

    await createProductsBulk(productInput, true, true);

    expect(db.product.update).toHaveBeenCalled();
    expect(db.product.create).not.toHaveBeenCalled();
  });

  it('should create new product when updateOnly=false and updateExisting=true and product does not exist', async () => {
    const productInput = [
      { code: 'PROD001', description: 'Producto de prueba', price: 100 },
    ];

    vi.mocked(db.product.findFirst).mockResolvedValue(null);
    vi.mocked(db.product.create).mockResolvedValue({
      id: 'new-product-id',
      code: 'PROD001',
    } as any);
    vi.mocked(db.brand.findFirst).mockResolvedValue(null);
    vi.mocked(db.category.findFirst).mockResolvedValue(null);

    await createProductsBulk(productInput, true, false);

    expect(db.product.create).toHaveBeenCalled();
  });

  it('should connect new product to supplierId', async () => {
    const productInput = [
      { code: 'PROD001', description: 'Producto de prueba', price: 100 },
    ];

    vi.mocked(db.product.findFirst).mockResolvedValue(null);
    vi.mocked(db.product.create).mockResolvedValue({
      id: 'new-product-id',
      code: 'PROD001',
    } as any);
    vi.mocked(db.brand.findFirst).mockResolvedValue(null);
    vi.mocked(db.category.findFirst).mockResolvedValue(null);

    await createProductsBulk(productInput, true, false, 0, 0, 0, 'supplier-1');

    expect(db.product.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          supplier: { connect: { id: 'supplier-1' } },
        }),
      })
    );
  });

  it('should update supplier discount/iva/gain on confirm', async () => {
    const productInput = [
      { code: 'PROD001', description: 'Producto de prueba', price: 100 },
    ];

    vi.mocked(db.product.findFirst).mockResolvedValue(null);
    vi.mocked(db.product.create).mockResolvedValue({
      id: 'new-product-id',
      code: 'PROD001',
    } as any);
    vi.mocked(db.brand.findFirst).mockResolvedValue(null);
    vi.mocked(db.category.findFirst).mockResolvedValue(null);

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
      { code: 'EXISTING' },
    ] as any);

    const result = await previewProductsBulk(productsData, true, true);

    expect(result.preview?.items[0].status).toBe('update');
  });
});
