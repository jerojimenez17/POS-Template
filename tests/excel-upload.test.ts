import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createProductsBulk } from '../src/actions/stock';
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
