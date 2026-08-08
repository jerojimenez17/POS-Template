"use server";

import { db } from "@/lib/db";
import { revalidateTag } from "next/cache";
import { CACHE_TAGS } from "@/lib/cache-tags";
import { auth } from "@/auth";
import { pusherServer } from "@/lib/pusher-server";
import { fail } from "@/lib/action-result";
import { assertWritePermission } from "@/lib/auth-gates";
import { checkLimit } from "@/lib/plan-resolver";
import { Product, Prisma } from "@prisma/client";
import { PAGINATION } from "@/lib/pagination";

export const createProduct = async (data: Product) => {
  const session = await auth();
  if (!session?.user?.businessId) return { error: "No autorizado" };

  const permission = await assertWritePermission();
  if (!permission.success) return { error: permission.error, code: permission.code };

  const currentCount = await db.product.count({ where: { businessId: session.user.businessId } });
  try {
    await checkLimit(session.user.businessId, "products", currentCount);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Has alcanzado el límite de productos de tu plan." };
  }

  // FR-026B: block negative initial stock.
  const initialAmount = data.amount ? parseFloat(data.amount.toString()) : 0;
  if (isNaN(initialAmount) || initialAmount < 0) {
    return { error: "La cantidad inicial no puede ser negativa." };
  }

  const businessId = session.user.businessId;

  try {
    // Preserve behavior parity with the previous flat-file implementation:
    // when a supplier is assigned, prefix the product code with the first 3
    // characters of the supplier name unless the code already has that prefix.
    let finalCode = data.code;
    if (data.supplierId && data.code) {
      const supplier = await db.supplier.findUnique({ where: { id: data.supplierId } });
      if (supplier) {
        const prefix = supplier.name.toLowerCase().replace(/\s+/g, '').slice(0, 3);
        if (!data.code.startsWith(`${prefix}-`)) {
          finalCode = `${prefix}-${data.code}`;
        }
      }
    }

    const product = await db.$transaction(async (tx) => {
      const created = await tx.product.create({
        data: {
          code: finalCode,
          codebar: data.codebar || null,
          description: data.description,
          brand: data.brandId ? { connect: { id: data.brandId } } : undefined,
          category: data.categoryId ? { connect: { id: data.categoryId } } : undefined,
          subCategory: data.subCategoryId ? { connect: { id: data.subCategoryId } } : undefined,
          price: data.price ? parseFloat(data.price.toString()) : 0,
          salePrice: data.salePrice ? parseFloat(data.price.toString())*(1+data.gain*0.01) : 0,
          gain: data.gain ? parseFloat(data.gain.toString()) : 0,
          amount: initialAmount,
          unit: data.unit,
          image: typeof data.image === "string" ? data.image : null,
          imageName: typeof data.imageName === "string" ? data.imageName : null,
          client_bonus: data.client_bonus ? parseFloat(data.client_bonus.toString()) : 0,
          supplier: data.supplierId ? { connect: { id: data.supplierId } } : undefined,
          business: { connect: { id: businessId } },
          catalog: data.catalog !== undefined ? data.catalog : true,
          details: data.details || null,
        },
      });

      // FR-026B: positive initial stock is recorded as a PURCHASE movement in
      // the same transaction; zero stock → no movement.
      if (created.amount > 0) {
        await tx.stockMovement.create({
          data: {
            type: "PURCHASE",
            quantity: created.amount,
            productId: created.id,
            businessId,
            reason: "Alta de producto",
          },
        });
      }

      return created;
    });

    await pusherServer.trigger(
      `movements-${businessId}`,
      "refresh",
      { type: "product-created" }
    );

    revalidateTag(CACHE_TAGS.STOCK, "max");
    return { success: "Producto cargado", product };
  } catch (error) {
    console.error(error);
    return { error: "Error al cargar producto" };
  }
};

interface UpdateProductInput {
  code?: string;
  codebar?: string;
  description?: string;
  brandId?: string | null;
  categoryId?: string | null;
  subCategoryId?: string | null;
  price?: number | string;
  gain?: number | string;
  amount?: number | string;
  unit?: string;
  image?: string | null;
  imageName?: string | null;
  client_bonus?: number | string;
  supplierId?: string | null;
  catalog?: boolean;
  details?: string | null;
  /** URLs of images already uploaded by the caller (e.g. via Firebase). */
  imageUrls?: string[];
  imagesToDelete?: string[];
}

export const updateProduct = async (id: string, data: UpdateProductInput) => {
  const session = await auth();
  if (!session?.user?.businessId) return { error: "No autorizado" };

  const permission = await assertWritePermission();
  if (!permission.success) return { error: permission.error, code: permission.code };

  const businessId = session.user.businessId;

  try {
    // Preserve behavior parity with the previous flat-file implementation:
    // when a supplier is assigned, prefix the product code with the first 3
    // characters of the supplier name unless the code already has that prefix.
    let finalCode = data.code;
    if (data.supplierId && data.code) {
      const supplier = await db.supplier.findUnique({ where: { id: data.supplierId } });
      if (supplier) {
        const prefix = supplier.name.toLowerCase().replace(/\s+/g, '').slice(0, 3);
        if (!data.code.startsWith(`${prefix}-`)) {
          finalCode = `${prefix}-${data.code}`;
        }
      }
    }

    if (data.imagesToDelete && data.imagesToDelete.length > 0) {
      await db.productImage.deleteMany({
        where: { id: { in: data.imagesToDelete }, productId: id },
      });
    }

    // FR-026B: validate the proposed stock and compute the delta up-front so
    // the product write and the ADJUSTMENT movement land in the same tx.
    const willChangeAmount = data.amount !== undefined;
    const proposedAmount = willChangeAmount ? parseFloat(data.amount!.toString()) : NaN;
    if (willChangeAmount && (isNaN(proposedAmount) || proposedAmount < 0)) {
      return { error: "La cantidad no puede ser negativa." };
    }

    const product = await db.$transaction(async (tx) => {
      const prev = willChangeAmount
        ? await tx.product.findUnique({ where: { id }, select: { amount: true } })
        : null;

      if (willChangeAmount && prev) {
        const delta = proposedAmount - prev.amount;
        if (delta < 0 && prev.amount + delta < 0) {
          // Guard double-check: never persist negative stock.
          throw new Error("Stock insuficiente");
        }
      }

      const updated = await tx.product.update({
        where: { id },
        data: {
          code: finalCode,
          codebar: data.codebar !== undefined ? (data.codebar || null) : undefined,
          description: data.description,
          brand: data.brandId ? { connect: { id: data.brandId } } : { disconnect: true },
          category: data.categoryId ? { connect: { id: data.categoryId } } : { disconnect: true },
          subCategory: data.subCategoryId ? { connect: { id: data.subCategoryId } } : { disconnect: true },
          price: data.price !== undefined ? parseFloat(data.price.toString()) : undefined,
          salePrice: data.price !== undefined && data.gain !== undefined ? parseFloat(data.price.toString())*(1+parseFloat(data.gain.toString())*0.01) : undefined,
          gain: data.gain !== undefined ? parseFloat(data.gain.toString()) : undefined,
          amount: willChangeAmount ? proposedAmount : undefined,
          unit: data.unit,
          image: typeof data.image === "string" ? data.image : data.image === null ? null : undefined,
          imageName: typeof data.imageName === "string" ? data.imageName : data.imageName === null ? null : undefined,
          client_bonus: data.client_bonus !== undefined ? parseFloat(data.client_bonus.toString()) : undefined,
          supplier: data.supplierId ? { connect: { id: data.supplierId } } : { disconnect: true },
          catalog: data.catalog !== undefined ? data.catalog : undefined,
          details: data.details !== undefined ? data.details : undefined,
          last_update: new Date(),
        },
      });

      if (willChangeAmount && prev && updated.amount !== prev.amount) {
        const delta = updated.amount - prev.amount;
        if (delta !== 0) {
          await tx.stockMovement.create({
            data: {
              type: "ADJUSTMENT",
              quantity: delta,
              productId: id,
              businessId,
              reason: "Ajuste manual",
            },
          });
        }
      }

      return updated;
    });

    if (data.imageUrls && data.imageUrls.length > 0) {
      await db.productImage.createMany({
        data: data.imageUrls.map((url) => ({ productId: id, url })),
      });

      // Sync legacy image field with first URL if no explicit image was provided
      if (!data.image && data.imageUrls[0]) {
        await db.product.update({
          where: { id },
          data: { image: data.imageUrls[0] },
        });
      }
    }

    await pusherServer.trigger(
      `movements-${businessId}`,
      "refresh",
      { type: "product-updated" }
    );

    revalidateTag(CACHE_TAGS.STOCK, "max");
    return { success: "Producto actualizado", product };
  } catch (error) {
    console.error(error);
    const msg = error instanceof Error ? error.message : "Unknown error";
    if (msg === "Stock insuficiente") return { error: "Stock insuficiente" };
    return { error: "Error al actualizar producto: " + msg };
  }
};

export const updateStockAmount = async (productId: string, discountValue: number) => {
    const session = await auth();
    if (!session?.user?.businessId) return { error: "No autorizado" };

    const permission = await assertWritePermission();
    if (!permission.success) return { error: permission.error, code: permission.code };

    const businessId = session.user.businessId;

    try {
        await db.$transaction(async (tx) => {
            const product = await tx.product.findUnique({ where: { id: productId } });
            if (!product) throw new Error("Producto no encontrado");

            const newAmount = product.amount - discountValue;
            // FR-026B: never persist negative stock — throw so the tx rolls back.
            if (newAmount < 0) throw new Error("Stock insuficiente");

            await tx.product.update({
                where: { id: productId },
                data: { amount: newAmount, last_update: new Date() }
            });

            // FR-026B: an ADJUSTMENT movement records every non-zero delta in
            // the same transaction as the stock write.
            if (discountValue !== 0) {
                await tx.stockMovement.create({
                    data: {
                        type: "ADJUSTMENT",
                        quantity: -discountValue,
                        productId,
                        businessId,
                        reason: "Ajuste manual",
                    },
                });
            }
        });

        revalidateTag(CACHE_TAGS.STOCK, "max");
        return { success: true };
    } catch (error) {
        const msg = error instanceof Error ? error.message : "Error al actualizar stock";
        if (msg === "Stock insuficiente") return fail("Stock insuficiente", "VALIDATION_ERROR");
        if (msg === "Producto no encontrado") return fail("Producto no encontrado", "NOT_FOUND");
        console.error("Error updating stock amount:", error);
        return fail("Error al actualizar stock");
    }
}

export const deleteProduct = async (id: string) => {
  const session = await auth();
  if (!session?.user?.businessId) return { error: "No autorizado" };

  const permission = await assertWritePermission();
  if (!permission.success) return { error: permission.error, code: permission.code };

  const businessId = session.user.businessId;

  try {
    await db.$transaction(async (tx) => {
      const product = await tx.product.findUnique({ where: { id } });
      if (!product) throw new Error("Producto no encontrado");

      // FR-026B: snapshot a final negative ADJUSTMENT in the same transaction
      // as the delete so the removal is reportable within the report window
      // where the movement was written. The cascade will also drop this row
      // once the product is gone, but the textual snapshot in `reason`
      // preserves audit history. See design Open Questions.
      if (product.amount > 0) {
        await tx.stockMovement.create({
          data: {
            type: "ADJUSTMENT",
            quantity: -product.amount,
            productId: id,
            businessId,
            reason: `Eliminación: ${product.code ?? ""} - ${product.description ?? ""}`,
          },
        });
      }

      await tx.product.delete({ where: { id } });
    });

    await pusherServer.trigger(
      `movements-${businessId}`,
      "refresh",
      { type: "product-deleted" }
    );

    revalidateTag(CACHE_TAGS.STOCK, "max");
    return { success: "Producto eliminado" };
  } catch (error) {
    console.error(error);
    return { error: "Error al eliminar producto" };
  }
};

export const getProducts = async () => {
    const session = await auth();
    if (!session?.user?.businessId) return [];

    try {
        return await db.product.findMany({
            where: { businessId: session.user.businessId },
            include: { supplier: true, brand: true, category: true, subCategory: true, images: { orderBy: { createdAt: 'asc' } } },
            orderBy: { description: 'asc' }
        });
    } catch (error) {
        console.error(error);
        return [];
    }
}

export const getProductsPaginated = async (params: {
  page?: number;
  pageSize?: number;
  search?: string;
  categoryId?: string;
  brandId?: string;
  unit?: string;
}) => {
  const session = await auth();
  if (!session?.user?.businessId)
    return { products: [], total: 0, page: 1, pageSize: 25, totalPages: 0 };

  const page = Math.max(1, params.page || 1);
  const pageSize = Math.min(PAGINATION.MAX_PAGE_SIZE, Math.max(1, params.pageSize || PAGINATION.DEFAULT_PAGE_SIZE));
  const skip = (page - 1) * pageSize;

  const where: Prisma.ProductWhereInput = {
    businessId: session.user.businessId,
    ...(params.search && {
      OR: [
        { code: { contains: params.search, mode: "insensitive" } },
        { codebar: { contains: params.search, mode: "insensitive" } },
        { description: { contains: params.search, mode: "insensitive" } },
      ],
    }),
    ...(params.categoryId && { categoryId: params.categoryId }),
    ...(params.brandId && { brandId: params.brandId }),
    ...(params.unit && { unit: params.unit }),
  };

  try {
    const [products, total] = await db.$transaction([
      db.product.findMany({
        where,
        include: { supplier: true, brand: true, category: true, subCategory: true, images: { orderBy: { createdAt: 'asc' } } },
        orderBy: { description: "asc" },
        skip,
        take: pageSize,
      }),
      db.product.count({ where }),
    ]);

    return {
      products,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  } catch (error) {
    console.error("Error fetching paginated products:", error);
    return { products: [], total: 0, page, pageSize, totalPages: 0 };
  }
};

export const getProductByCode = async (code: string) => {
  const session = await auth();
  if (!session?.user?.businessId) return null;

  try {
    const product = await db.product.findFirst({
      where: {
        businessId: session.user.businessId,
        OR: [
          { code: code },
          { codebar: code },
        ],
      },
      include: { supplier: true, brand: true, category: true, subCategory: true, images: { orderBy: { createdAt: 'asc' } } },
    });

    return product;
  } catch (error) {
    console.error(error);
    return null;
  }
};

export const getProductsBySearch = async (query: string) => {
  const session = await auth();
  if (!session?.user?.businessId) return [];

  try {
    const products = await db.product.findMany({
      where: {
        businessId: session.user.businessId,
        OR: [
          { code: { contains: query, mode: "insensitive" } },
          { codebar: { contains: query, mode: "insensitive" } },
          { description: { contains: query, mode: "insensitive" } },
        ],
      },
      include: { supplier: true, brand: true, category: true, subCategory: true, images: { orderBy: { createdAt: 'asc' } } },
      take: PAGINATION.PRODUCTS_SEARCH_MAX,
    });

    return products;
  } catch (error) {
    console.error(error);
    return [];
  }
};

export const getProductsFiltered = async (filters: {
  search?: string;
  categoryId?: string;
  brandId?: string;
  unit?: string;
  supplierId?: string;
}) => {
  const session = await auth();
  if (!session?.user?.businessId) return [];

  try {
    const products = await db.product.findMany({
      where: {
        businessId: session.user.businessId,
        ...(filters.search
          ? {
              OR: [
                { code: { contains: filters.search, mode: "insensitive" } },
                { codebar: { contains: filters.search, mode: "insensitive" } },
                { description: { contains: filters.search, mode: "insensitive" } },
              ],
            }
          : {}),
        ...(filters.categoryId ? { categoryId: filters.categoryId } : {}),
        ...(filters.brandId ? { brandId: filters.brandId } : {}),
        ...(filters.unit ? { unit: filters.unit } : {}),
        ...(filters.supplierId ? { supplierId: filters.supplierId } : {}),
      },
      include: { supplier: true, brand: true, category: true, subCategory: true, images: { orderBy: { createdAt: 'asc' } } },
      orderBy: { description: "asc" },
    });

    return products;
  } catch (error) {
    console.error("Error fetching filtered products:", error);
    return [];
  }
};

export const toggleProductCatalogAction = async (productId: string, catalog: boolean) => {
  const session = await auth();
  if (!session?.user?.businessId) return { error: "No autorizado" };

  const permission = await assertWritePermission();
  if (!permission.success) return { error: permission.error, code: permission.code };

  try {
    await db.product.update({
      where: { id: productId },
      data: { catalog },
    });
    revalidateTag(CACHE_TAGS.STOCK, "max");
    return { success: true };
  } catch (error) {
    console.error("Error toggling catalog:", error);
    return { error: "No se pudo actualizar la visibilidad en el catálogo" };
  }
};

/**
 * Returns every product matching a given code OR codebar for the current
 * business (unlike `getProductByCode`, which only returns the first match).
 */
export const getProductsByCode = async (code: string) => {
  const session = await auth();
  if (!session?.user?.businessId) return [];

  try {
    const products = await db.product.findMany({
      where: {
        businessId: session.user.businessId,
        OR: [
          { code: code },
          { codebar: code },
        ],
      },
      include: { supplier: true, brand: true, category: true, subCategory: true, images: { orderBy: { createdAt: 'asc' } } },
    });

    return products;
  } catch (error) {
    console.error(error);
    return [];
  }
};

/**
 * Lightweight supplier list used only for filter dropdowns in the stock UI.
 */
export const getSuppliersForFilter = async () => {
  const session = await auth();
  if (!session?.user?.businessId) return [];

  try {
    const suppliers = await db.supplier.findMany({
      where: { businessId: session.user.businessId },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });
    return suppliers;
  } catch (error) {
    console.error(error);
    return [];
  }
};
