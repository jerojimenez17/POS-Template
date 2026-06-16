"use server";

import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { auth } from "../../auth";
import { pusherServer } from "@/lib/pusher-server";
import { Product, Prisma } from "@prisma/client";
import { ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";
import { storage } from "@/firebase/config";
import { v4 } from "uuid";

// Supplier Actions

export const createSupplier = async (data: {
  name: string;
  email?: string;
  phone?: string;
  discount?: number;
  iva?: number;
  gain?: number;
}) => {
  const session = await auth();
  if (!session?.user?.businessId) return { error: "No autorizado" };

  try {
    const supplier = await db.supplier.create({
      data: {
        name: data.name,
        email: data.email,
        phone: data.phone,
        discount: data.discount || 0,
        iva: data.iva || 0,
        gain: data.gain || 0,
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
        salePrice: data.salePrice ? parseFloat(data.price.toString()) * (1 + data.gain * 0.01) : 0,
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

export interface BulkProductInput {
  code: string;
  description: string;
  price: number;
  amount?: number | null;
  brandName?: string;
  categoryName?: string;
  subCategoryName?: string;
  unit?: string;
  catalog?: boolean;
  details?: string;
  supplierId?: string;
}

export interface PreviewProductItem extends BulkProductInput {
  status: "create" | "update" | "ignore";
}

export interface PreviewProductsBulkResult {
  success?: boolean;
  error?: string;
  preview?: {
    createdCount: number;
    updatedCount: number;
    ignoredCount: number;
    items: PreviewProductItem[];
  };
}

export const previewProductsBulk = async (
  productsData: BulkProductInput[],
  updateExisting?: boolean,
  updateOnly?: boolean,
  discount?: number,
  iva?: number,
  gain?: number,
  supplierId?: string
): Promise<PreviewProductsBulkResult> => {
  const session = await auth();
  if (!session?.user?.businessId) return { error: "No autorizado" };

  try {
    const codes = productsData.map(p => p.code.toString());

    const existingProducts = await db.product.findMany({
      where: {
        businessId: session.user.businessId,
        code: { in: codes }
      },
      select: { code: true, price: true, salePrice: true, supplierId: true }
    });

    const existingMap = new Map(existingProducts.map(p => [p.code, p]));

    let createdCount = 0;
    let updatedCount = 0;
    let ignoredCount = 0;

    const applyPriceFormula = discount !== undefined || iva !== undefined || gain !== undefined;

    const items: PreviewProductItem[] = productsData.map(item => {
      const existing = existingMap.get(item.code.toString());
      const exists = !!existing;
      let status: "create" | "update" | "ignore" = "create";

      if (exists) {
        const priceStr = item.price.toString().replace(',', '.');
        const filePrice = parseFloat(priceStr);
        const isPriceValid = !isNaN(filePrice);

        let costPrice = filePrice;
        let salePrice = filePrice;

        if (applyPriceFormula) {
          const d = discount ?? 0;
          const i = iva ?? 0;
          const g = gain ?? 0;
          costPrice = filePrice * (1 - d / 100) * (1 + i / 100);
          salePrice = costPrice * (1 + g / 100);
        }

        const priceSame = isPriceValid &&
          Math.abs(costPrice - existing.price) < 0.001 &&
          Math.abs(salePrice - existing.salePrice) < 0.001;

        const supplierSame =
          (supplierId === undefined && existing.supplierId === null) ||
          supplierId === existing.supplierId;

        const unchanged = priceSame && supplierSame;

        if (updateExisting && !unchanged) {
          status = "update";
          updatedCount++;
        } else {
          status = "ignore";
          ignoredCount++;
        }
      } else {
        if (updateOnly) {
          status = "ignore";
          ignoredCount++;
        } else {
          status = "create";
          createdCount++;
        }
      }

      return {
        ...item,
        status
      };
    });

    return {
      success: true,
      preview: {
        createdCount,
        updatedCount,
        ignoredCount,
        items
      }
    };
  } catch (error) {
    console.error("Preview bulk error:", error);
    return { error: "Error al generar vista previa" };
  }
};

export const processBulkProductBatch = async (
  productsData: BulkProductInput[],
  updateExisting?: boolean,
  updateOnly?: boolean,
  discount?: number,
  iva?: number,
  gain?: number,
  supplierId?: string
): Promise<{ createdCount: number; updatedCount: number } | { error: string }> => {
  const session = await auth();
  if (!session?.user?.businessId) return { error: "No autorizado" };

  const generateCuid = () => {
    return "c" + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  };

  try {
    const businessId = session.user.businessId;
    let createdCount = 0;
    let updatedCount = 0;

    // 1. Gather all unique names for Brands, Categories, and Subcategories
    const brandNames = Array.from(new Set(productsData.map(p => p.brandName?.trim()).filter(Boolean))) as string[];
    const categoryNames = Array.from(new Set(productsData.map(p => p.categoryName?.trim()).filter(Boolean))) as string[];
    const subCategoryNames = Array.from(new Set(productsData.map(p => p.subCategoryName?.trim()).filter(Boolean))) as string[];

    // 2. Resolve Brands
    const existingBrands = await db.brand.findMany({
      where: { businessId, name: { in: brandNames, mode: "insensitive" } }
    });
    const existingBrandNamesLower = new Set(existingBrands.map(b => b.name.trim().toLowerCase()));
    const missingBrandNames = brandNames.filter(name => !existingBrandNamesLower.has(name.toLowerCase()));

    if (missingBrandNames.length > 0) {
      await db.brand.createMany({
        data: missingBrandNames.map(name => ({ name: name.trim(), businessId })),
        skipDuplicates: true
      });
    }

    const allBrands = await db.brand.findMany({
      where: { businessId, name: { in: brandNames, mode: "insensitive" } }
    });
    const brandMap = new Map(allBrands.map(b => [b.name.trim().toLowerCase(), b.id]));

    // 3. Resolve Categories
    const existingCategories = await db.category.findMany({
      where: { businessId, name: { in: categoryNames, mode: "insensitive" } }
    });
    const existingCategoryNamesLower = new Set(existingCategories.map(c => c.name.trim().toLowerCase()));
    const missingCategoryNames = categoryNames.filter(name => !existingCategoryNamesLower.has(name.toLowerCase()));

    if (missingCategoryNames.length > 0) {
      await db.category.createMany({
        data: missingCategoryNames.map(name => ({ name: name.trim(), businessId })),
        skipDuplicates: true
      });
    }

    const allCategories = await db.category.findMany({
      where: { businessId, name: { in: categoryNames, mode: "insensitive" } }
    });
    const categoryMap = new Map(allCategories.map(c => [c.name.trim().toLowerCase(), c.id]));

    // 4. Resolve Subcategories
    const existingSubcategories = await db.subcategory.findMany({
      where: { businessId, name: { in: subCategoryNames, mode: "insensitive" } }
    });
    const subcategoryMap = new Map(existingSubcategories.map(sc => [`${sc.categoryId}:${sc.name.trim().toLowerCase()}`, sc.id]));

    const missingSubcategoriesData: { name: string; categoryId: string; businessId: string }[] = [];
    const seenSubcategoryKeys = new Set<string>();

    for (const item of productsData) {
      if (item.categoryName && item.categoryName.trim() !== "" && item.subCategoryName && item.subCategoryName.trim() !== "") {
        const catNameLower = item.categoryName.trim().toLowerCase();
        const subNameTrimmed = item.subCategoryName.trim();
        const subNameLower = subNameTrimmed.toLowerCase();
        const categoryId = categoryMap.get(catNameLower);
        if (categoryId) {
          const key = `${categoryId}:${subNameLower}`;
          if (!subcategoryMap.has(key) && !seenSubcategoryKeys.has(key)) {
            seenSubcategoryKeys.add(key);
            missingSubcategoriesData.push({
              name: subNameTrimmed,
              categoryId,
              businessId
            });
          }
        }
      }
    }

    if (missingSubcategoriesData.length > 0) {
      await db.subcategory.createMany({
        data: missingSubcategoriesData,
        skipDuplicates: true
      });
    }

    const allSubcategories = await db.subcategory.findMany({
      where: { businessId, name: { in: subCategoryNames, mode: "insensitive" } }
    });
    const subcategoryMapUpdated = new Map(allSubcategories.map(sc => [`${sc.categoryId}:${sc.name.trim().toLowerCase()}`, sc.id]));

    // 5. Fetch Existing Products
    const codes = productsData.map(p => p.code.toString());
    const existingProducts = await db.product.findMany({
      where: { businessId, code: { in: codes } }
    });
    const existingProductMap = new Map<string, typeof existingProducts[number]>();
    for (const p of existingProducts) {
      if (p.code !== null && p.code !== undefined) {
        existingProductMap.set(p.code.toString(), p);
      }
    }

    // 6. Partition Products to Create/Update
    const toCreate: Prisma.ProductCreateManyInput[] = [];
    const updatePromises: any[] = [];
    const applyPriceFormula = discount !== undefined || iva !== undefined || gain !== undefined;

    for (const item of productsData) {
      let resolvedBrandId: string | null = null;
      if (item.brandName && item.brandName.trim() !== "") {
        resolvedBrandId = brandMap.get(item.brandName.trim().toLowerCase()) || null;
      }

      let resolvedCategoryId: string | null = null;
      let resolvedSubCategoryId: string | null = null;
      if (item.categoryName && item.categoryName.trim() !== "") {
        resolvedCategoryId = categoryMap.get(item.categoryName.trim().toLowerCase()) || null;
        if (resolvedCategoryId && item.subCategoryName && item.subCategoryName.trim() !== "") {
          const subKey = `${resolvedCategoryId}:${item.subCategoryName.trim().toLowerCase()}`;
          resolvedSubCategoryId = subcategoryMapUpdated.get(subKey) || null;
        }
      }

      const priceStr = item.price.toString().replace(',', '.');
      const filePrice = parseFloat(priceStr);
      const isPriceValid = !isNaN(filePrice);

      let costPrice = filePrice;
      let salePrice = filePrice;
      let gainValue = 0;

      if (applyPriceFormula) {
        const d = discount ?? 0;
        const i = iva ?? 0;
        const g = gain ?? 0;
        costPrice = filePrice * (1 - d / 100) * (1 + i / 100);
        salePrice = costPrice * (1 + g / 100);
        gainValue = g;
      }

      const amountStr = item.amount?.toString().replace(',', '.');
      const parsedAmount = amountStr ? parseFloat(amountStr) : 0;

      const existingProduct = existingProductMap.get(item.code.toString());

      if (existingProduct) {
        const priceSame = isPriceValid &&
          Math.abs(costPrice - existingProduct.price) < 0.001 &&
          Math.abs(salePrice - existingProduct.salePrice) < 0.001;

        const supplierSame =
          (supplierId === undefined && existingProduct.supplierId === null) ||
          supplierId === existingProduct.supplierId;

        if (supplierSame && priceSame) {
          continue;
        }

        if (updateExisting || updateOnly) {
          const updateData: Prisma.ProductUpdateInput = {
            description: item.description.toString(),
            price: isPriceValid ? costPrice : 0,
            salePrice: isPriceValid ? salePrice : 0,
            gain: applyPriceFormula ? gainValue : existingProduct.gain,
            unit: item.unit || "unidades",
            brand: resolvedBrandId ? { connect: { id: resolvedBrandId } } : { disconnect: true },
            category: resolvedCategoryId ? { connect: { id: resolvedCategoryId } } : { disconnect: true },
            subCategory: resolvedSubCategoryId ? { connect: { id: resolvedSubCategoryId } } : { disconnect: true },
            last_update: new Date(),
            catalog: item.catalog !== undefined ? item.catalog : undefined,
            details: item.details !== undefined ? item.details : undefined,
            supplier: supplierId ? { connect: { id: supplierId } } : { disconnect: true },
          };

          if (item.amount !== null && item.amount !== undefined) {
            updateData.amount = isNaN(parsedAmount) ? 0 : parsedAmount;
          } else if (item.amount === undefined) {
            updateData.amount = existingProduct.amount;
          }

          updatePromises.push(db.product.update({
            where: { id: existingProduct.id },
            data: updateData,
          }));
          updatedCount++;
        }
      } else {
        if (updateOnly) {
          continue;
        }

        toCreate.push({
          id: generateCuid(),
          code: item.code.toString(),
          description: item.description.toString(),
          price: isPriceValid ? costPrice : 0,
          salePrice: isPriceValid ? salePrice : 0,
          gain: applyPriceFormula ? gainValue : 0,
          amount: isNaN(parsedAmount) ? 0 : parsedAmount,
          unit: item.unit || "unidades",
          brandId: resolvedBrandId,
          categoryId: resolvedCategoryId,
          subCategoryId: resolvedSubCategoryId,
          businessId: businessId,
          catalog: item.catalog !== undefined ? item.catalog : true,
          details: item.details || null,
          supplierId: supplierId || null,
          creation_date: new Date(),
          last_update: new Date(),
        });
        createdCount++;
      }
    }

    // 7. Write to database in bulk
    if (toCreate.length > 0) {
      await db.product.createMany({
        data: toCreate,
      });
    }

    if (updatePromises.length > 0) {
      await db.$transaction(updatePromises);
    }

    return { createdCount, updatedCount };
  } catch (error) {
    console.error("Batch processing error:", error);
    return { error: "Error al procesar lote de productos" };
  }
};

export const finalizeBulkImport = async (
  supplierId?: string,
  discount?: number,
  iva?: number,
  gain?: number,
): Promise<{ success?: string; error?: string }> => {
  const session = await auth();
  if (!session?.user?.businessId) return { error: "No autorizado" };

  try {
    const applyPriceFormula = discount !== undefined || iva !== undefined || gain !== undefined;

    if (supplierId && applyPriceFormula) {
      await db.supplier.update({
        where: { id: supplierId },
        data: { discount, iva, gain }
      });
    }

    try {
      await pusherServer.trigger(
        `movements-${session.user.businessId}`,
        "refresh",
        { type: "product-created" }
      );
    } catch { }

    try {
      revalidatePath("/stock");
    } catch { }

    return { success: "Importación finalizada" };
  } catch (error) {
    console.error("Finalization error:", error);
    return { error: "Error al finalizar importación" };
  }
};

export const createProductsBulk = async (
  productsData: BulkProductInput[],
  updateExisting?: boolean,
  updateOnly?: boolean,
  discount?: number,
  iva?: number,
  gain?: number,
  supplierId?: string
) => {
  const session = await auth();
  if (!session?.user?.businessId) return { error: "No autorizado" };

  try {
    const result = await processBulkProductBatch(
      productsData, updateExisting, updateOnly, discount, iva, gain, supplierId
    );

    if ('error' in result) return { error: result.error };

    await finalizeBulkImport(supplierId, discount, iva, gain);

    const { createdCount, updatedCount } = result;

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
        deleteObject(imageRef).catch(() => { });
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
        salePrice: data.price !== undefined && data.gain !== undefined ? parseFloat(data.price.toString()) * (1 + parseFloat(data.gain.toString()) * 0.01) : undefined,
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
  const pageSize = Math.min(100, Math.max(1, params.pageSize || 25));
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

export const getProductsBySearch = async (query: string, supplierId?: string) => {
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
        ...(supplierId ? { supplierId } : {}),
      },
      include: { supplier: true, brand: true, category: true, subCategory: true },
      take: 300, // Limit results for performance
    });

    return products;
  } catch (error) {
    console.error(error);
    return [];
  }
};

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

export const bulkUpdatePrices = async (
  productIds: string[],
  percentage: number
) => {
  if (!productIds || productIds.length === 0) {
    return { success: false, error: "No se seleccionaron productos" };
  }

  if (percentage < 0 || percentage > 100) {
    return { success: false, error: "Porcentaje inválido" };
  }

  const session = await auth();
  if (!session?.user?.businessId) return { success: false, error: "No autorizado" };

  try {
    const factor = (100 + percentage) / 100;

    const products = await Promise.all(
      productIds.map((id) => db.product.findUnique({ where: { id } }))
    );

    const updates: ReturnType<typeof db.product.update>[] = [];

    products.forEach((product, index) => {
      if (!product) return;

      const newSalePrice = product.salePrice * factor;
      const gain = product.price === 0 ? 0 : ((newSalePrice - product.price) / product.price) * 100;

      updates.push(
        db.product.update({
          where: { id: productIds[index] },
          data: {
            salePrice: { multiply: factor },
            gain: gain,
          },
        })
      );
    });

    await db.$transaction(updates);

    revalidatePath("/stock");
    return { success: true };
  } catch (error) {
    console.error("Error updating prices:", error);
    return { success: false, error: "Error al actualizar precios" };
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

export const bulkUpdateAmounts = async (
  productIds: string[],
  amountChange: number,
  mode: 'set' | 'add' | 'subtract'
) => {
  if (!productIds || productIds.length === 0) {
    return { success: false, error: "No se seleccionaron productos" };
  }

  if (isNaN(amountChange) || amountChange < 0) {
    return { success: false, error: "Cantidad inválida" };
  }

  const session = await auth();
  if (!session?.user?.businessId) return { success: false, error: "No autorizado" };

  try {
    const products = await Promise.all(
      productIds.map((id) => db.product.findUnique({ where: { id } }))
    );

    const updates: ReturnType<typeof db.product.update>[] = [];

    products.forEach((product, index) => {
      if (!product) return;

      let amountData: number | { decrement: number } | { increment: number };

      switch (mode) {
        case 'set':
          amountData = amountChange;
          break;
        case 'add':
          amountData = { increment: amountChange };
          break;
        case 'subtract':
          amountData = { decrement: amountChange };
          break;
      }

      updates.push(
        db.product.update({
          where: { id: productIds[index] },
          data: {
            amount: amountData,
            last_update: new Date(),
          },
        })
      );
    });

    await db.$transaction(updates);

    revalidatePath("/stock");
    return { success: true };
  } catch (error) {
    console.error("Error updating amounts:", error);
    return {
      success: false,
      error: "Error al actualizar stock"
    };
  }
};
