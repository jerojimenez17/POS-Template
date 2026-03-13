"use server";

import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { auth } from "../../auth";
import { pusherServer } from "@/lib/pusher-server";
import { Product } from "@prisma/client";

// Supplier Actions

export const createSupplier = async (data: {
  name: string;
  email?: string;
  phone?: string;
  bonus?: number;
}) => {
  const session = await auth();
  if (!session?.user?.businessId) return { error: "No autorizado" };

  try {
    const supplier = await db.supplier.create({
      data: {
        name: data.name,
        email: data.email,
        phone: data.phone,
        bonus: data.bonus || 0,
        business: { connect: { id: session.user.businessId } },
      },
    });
    revalidatePath("/stock");
    return { success: "Proveedor creado", supplier };
  } catch (error) {
    console.error(error);
    return { error: "Error al crear proveedor" };
  }
};

export const getSuppliers = async () => {
  const session = await auth();
  if (!session?.user?.businessId) return [];

  try {
    const suppliers = await db.supplier.findMany({
      where: { businessId: session.user.businessId },
      orderBy: { name: "asc" },
    });
    return suppliers;
  } catch (error) {
    console.error(error);
    return [];
  }
};


// Product Actions

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

export interface BulkProductInput {
  code: string;
  description: string;
  price: number;
  amount?: number;
  brandName?: string;
  categoryName?: string;
  subCategoryName?: string;
  unit?: string;
}

export const createProductsBulk = async (productsData: BulkProductInput[], updateExisting?: boolean) => {
  const session = await auth();
  if (!session?.user?.businessId) return { error: "No autorizado" };

  try {
    let createdCount = 0;
    let updatedCount = 0;
    
    // Process sequentially to handle dependent creations safely
    for (const item of productsData) {
      // Lookup brand
      let brandId = null;
      if (item.brandName && item.brandName.trim() !== "") {
        let brand = await db.brand.findFirst({
          where: { name: { equals: item.brandName.trim(), mode: "insensitive" }, businessId: session.user.businessId }
        });
        if (!brand) {
          brand = await db.brand.create({
            data: { name: item.brandName.trim(), businessId: session.user.businessId }
          });
        }
        brandId = brand.id;
      }

      // Lookup category
      let categoryId = null;
      if (item.categoryName && item.categoryName.trim() !== "") {
        let category = await db.category.findFirst({
          where: { name: { equals: item.categoryName.trim(), mode: "insensitive" }, businessId: session.user.businessId }
        });
        if (!category) {
          category = await db.category.create({
            data: { name: item.categoryName.trim(), businessId: session.user.businessId }
          });
        }
        categoryId = category.id;
      }

      // Lookup subcategory (needs categoryId)
      let subCategoryId = null;
      if (item.subCategoryName && item.subCategoryName.trim() !== "" && categoryId) {
        let subCategory = await db.subcategory.findFirst({
          where: { 
            name: { equals: item.subCategoryName.trim(), mode: "insensitive" }, 
            categoryId: categoryId,
            businessId: session.user.businessId 
          }
        });
        if (!subCategory) {
          subCategory = await db.subcategory.create({
            data: { 
              name: item.subCategoryName.trim(), 
              categoryId: categoryId,
              businessId: session.user.businessId 
            }
          });
        }
        subCategoryId = subCategory.id;
      }

      const priceStr = item.price.toString().replace(',','.');
      const parsedPrice = parseFloat(priceStr);
      const isPriceValid = !isNaN(parsedPrice);

      const amountStr = item.amount?.toString().replace(',','.');
      const parsedAmount = amountStr ? parseFloat(amountStr) : 0;
      
      // Check if product exists by code
      const existingProduct = await db.product.findFirst({
        where: {
          code: item.code.toString(),
          businessId: session.user.businessId,
        },
      });

      if (existingProduct) {
        if (updateExisting) {
          // Update existing product
          await db.product.update({
            where: { id: existingProduct.id },
            data: {
              description: item.description.toString(),
              price: isPriceValid ? parsedPrice : 0,
              salePrice: isPriceValid ? parsedPrice : 0,
              amount: isNaN(parsedAmount) ? 0 : parsedAmount,
              unit: item.unit || "unidades",
              brand: brandId ? { connect: { id: brandId } } : { disconnect: true },
              category: categoryId ? { connect: { id: categoryId } } : { disconnect: true },
              subCategory: subCategoryId ? { connect: { id: subCategoryId } } : { disconnect: true },
              last_update: new Date(),
            },
          });
          updatedCount++;
        }
        // If updateExisting is false and product exists, do nothing (ignore)
      } else {
        // Create new product
        await db.product.create({
          data: {
            code: item.code.toString(),
            description: item.description.toString(),
            price: isPriceValid ? parsedPrice : 0,
            salePrice: isPriceValid ? parsedPrice : 0,
            gain: 0,
            amount: isNaN(parsedAmount) ? 0 : parsedAmount,
            unit: item.unit || "unidades",
            brand: brandId ? { connect: { id: brandId } } : undefined,
            category: categoryId ? { connect: { id: categoryId } } : undefined,
            subCategory: subCategoryId ? { connect: { id: subCategoryId } } : undefined,
            business: { connect: { id: session.user.businessId } },
          }
        });
        createdCount++;
      }
    }

    const totalCount = updatedCount > 0 ? updatedCount : createdCount;
    if (totalCount > 0) {
      try {
        await pusherServer.trigger(
          `movements-${session.user.businessId}`, 
          "refresh", 
          { type: "product-created" }
        );
      } catch {}
    }

    try {
      revalidatePath("/stock");
    } catch {}
    
    if (updatedCount > 0) {
      return { success: `Se actualizaron ${updatedCount} productos y se crearon ${createdCount} productos exitosamente` };
    }
    return { success: `Se cargaron ${createdCount} productos exitosamente` };
  } catch (error) {
    console.error("Bulk create error:", error);
    return { error: "Error al cargar productos masivamente" };
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
}

export const updateProduct = async (id: string, data: UpdateProductInput) => {
  const session = await auth();
  if (!session?.user?.businessId) return { error: "No autorizado" };

  try {
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
        last_update: new Date(),
      },
    });

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
        if (!product) throw new Error("Producto no encontrado");
        
        const newAmount = product.amount - discountValue;
        if (newAmount < 0) throw new Error("Stock insuficiente");

        await db.product.update({
            where: { id: productId },
            data: { amount: newAmount, last_update: new Date() }
        });
        

        
        // Cannot trigger pusher here easily without session, maybe pass businessId?
        // Assuming updateStockAmount is called from client where we might not have session easily available if it was a pure background task, 
        // but here it is a server action called from client.
        // For now, let's skip pusher here unless we fetch session or pass businessId.
        // Actually this seems to be used after sale.
        
        revalidatePath("/stock");
        return { success: true };
    } catch (error) {
        throw error;
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
      take: 20, // Limit results for performance
    });

    return products;
  } catch (error) {
    console.error(error);
    return [];
  }
};
