"use server";

import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { pusherServer } from "@/lib/pusher-server";
import { fail } from "@/lib/action-result";
import { Product, Prisma } from "@prisma/client";
import { ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";
import { storage } from "@/firebase/config";
import { v4 } from "uuid";
import { PAGINATION } from "@/lib/pagination";

export const createProduct = async (data: Product) => {
  const session = await auth();
  if (!session?.user?.businessId) return { error: "No autorizado" };

  try {
    const product = await db.product.create({
      data: {
        code: data.code,
        description: data.description,
        brand: data.brandId ? { connect: { id: data.brandId } } : undefined,
        category: data.categoryId ? { connect: { id: data.categoryId } } : undefined,
        subCategory: data.subCategoryId ? { connect: { id: data.subCategoryId } } : undefined,
        price: data.price ? parseFloat(data.price.toString()) : 0,
        salePrice: data.salePrice ? parseFloat(data.price.toString())*(1+data.gain*0.01) : 0,
        gain: data.gain ? parseFloat(data.gain.toString()) : 0,
        amount: data.amount ? parseFloat(data.amount.toString()) : 0,
        unit: data.unit,
        image: typeof data.image === "string" ? data.image : null,
        imageName: typeof data.imageName === "string" ? data.imageName : null,
        client_bonus: data.client_bonus ? parseFloat(data.client_bonus.toString()) : 0,
        supplier: data.supplierId ? { connect: { id: data.supplierId } } : undefined,
        business: { connect: { id: session.user.businessId } },
        catalog: data.catalog !== undefined ? data.catalog : true,
        details: data.details || null,
      },
    });
    
    await pusherServer.trigger(
      `movements-${session.user.businessId}`, 
      "refresh", 
      { type: "product-created" }
    );

    revalidatePath("/stock");
    return { success: "Producto cargado", product };
  } catch (error) {
    console.error(error);
    return { error: "Error al cargar producto" };
  }
};

interface UpdateProductInput {
  code?: string;
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
  newImages?: File[];
  imagesToDelete?: string[];
}

export const updateProduct = async (id: string, data: UpdateProductInput) => {
  const session = await auth();
  if (!session?.user?.businessId) return { error: "No autorizado" };

  try {
    if (data.imagesToDelete && data.imagesToDelete.length > 0) {
      const imagesToDelete = await db.productImage.findMany({
        where: { id: { in: data.imagesToDelete }, productId: id },
      });
      await db.productImage.deleteMany({
        where: { id: { in: data.imagesToDelete }, productId: id },
      });
      for (const img of imagesToDelete) {
        const imageRef = ref(storage, img.url);
        deleteObject(imageRef).catch(() => {});
      }
    }

    const product = await db.product.update({
      where: { id },
      data: {
        code: data.code,
        description: data.description,
        brand: data.brandId ? { connect: { id: data.brandId } } : { disconnect: true },
        category: data.categoryId ? { connect: { id: data.categoryId } } : { disconnect: true },
        subCategory: data.subCategoryId ? { connect: { id: data.subCategoryId } } : { disconnect: true },
        price: data.price !== undefined ? parseFloat(data.price.toString()) : undefined,
        salePrice: data.price !== undefined && data.gain !== undefined ? parseFloat(data.price.toString())*(1+parseFloat(data.gain.toString())*0.01) : undefined,
        gain: data.gain !== undefined ? parseFloat(data.gain.toString()) : undefined,
        amount: data.amount !== undefined ? parseFloat(data.amount.toString()) : undefined,
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

    if (data.newImages && data.newImages.length > 0) {
      const imageRows: { productId: string; url: string }[] = [];
      for (const file of data.newImages) {
        const imageName = `${file.name}_${v4()}`;
        const storageRef = ref(storage, `/productImage/${imageName}`);
        await uploadBytes(storageRef, file);
        const url = await getDownloadURL(storageRef);
        imageRows.push({ productId: id, url });
      }
      await db.productImage.createMany({ data: imageRows });
    }

    await pusherServer.trigger(
      `movements-${session.user.businessId}`, 
      "refresh", 
      { type: "product-updated" }
    );

    revalidatePath("/stock");
    return { success: "Producto actualizado", product };
  } catch (error) {
    console.error(error);
    return { error: "Error al actualizar producto: " + (error instanceof Error ? error.message : "Unknown error") };
  }
};

export const updateStockAmount = async (productId: string, discountValue: number) => {
    try {
        const product = await db.product.findUnique({ where: { id: productId } });
        if (!product) return fail("Producto no encontrado", "NOT_FOUND");
        
        const newAmount = product.amount - discountValue;
        if (newAmount < 0) return fail("Stock insuficiente", "VALIDATION_ERROR");

        await db.product.update({
            where: { id: productId },
            data: { amount: newAmount, last_update: new Date() }
        });
        
        revalidatePath("/stock");
        return { success: true };
    } catch (error) {
        console.error("Error updating stock amount:", error);
        return fail("Error al actualizar stock");
    }
}

export const deleteProduct = async (id: string) => {
  const session = await auth();
  if (!session?.user?.businessId) return { error: "No autorizado" };

  try {
    await db.product.delete({
      where: { id },
    });

    await pusherServer.trigger(
      `movements-${session.user.businessId}`, 
      "refresh", 
      { type: "product-deleted" }
    );

    revalidatePath("/stock");
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
            include: { supplier: true, brand: true, category: true, subCategory: true },
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
        include: { supplier: true, brand: true, category: true, subCategory: true },
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
        code: code
      },
      include: { supplier: true, brand: true, category: true, subCategory: true },
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
          { description: { contains: query, mode: "insensitive" } },
        ],
      },
      include: { supplier: true, brand: true, category: true, subCategory: true },
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
                { description: { contains: filters.search, mode: "insensitive" } },
              ],
            }
          : {}),
        ...(filters.categoryId ? { categoryId: filters.categoryId } : {}),
        ...(filters.brandId ? { brandId: filters.brandId } : {}),
        ...(filters.unit ? { unit: filters.unit } : {}),
      },
      include: { supplier: true, brand: true, category: true, subCategory: true },
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

  try {
    await db.product.update({
      where: { id: productId },
      data: { catalog },
    });
    revalidatePath("/stock");
    return { success: true };
  } catch (error) {
    console.error("Error toggling catalog:", error);
    return { error: "No se pudo actualizar la visibilidad en el catálogo" };
  }
};
