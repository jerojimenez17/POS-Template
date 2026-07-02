"use server";

import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { auth } from "../../auth";
import { pusherServer } from "@/lib/pusher-server";
import { Product, Prisma } from "@prisma/client";
import { PAGINATION } from "@/lib/pagination";
import { parseExcelIva } from "@/utils/iva-parser";
import { assertLimit } from "@/lib/auth-gates";


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

    const product = await db.product.create({
      data: {
        code: finalCode,
        codebar: data.codebar || null,
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
  codebar?: string;
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
  iva?: string | number | null;
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
    totalItems: number; // Total before truncation (for UI display)
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
        code: { in: codes },
        ...(supplierId ? { supplierId } : {})
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

        const parsed = parseExcelIva(item.iva);
        const rowIva = parsed.percent !== null ? parsed.percent : (iva ?? 0);
        const hasExcelIva = parsed.percent !== null;

        if (applyPriceFormula || hasExcelIva) {
          const d = discount ?? 0;
          const g = gain ?? 0;
          costPrice = filePrice * (1 - d / 100) * (1 + rowIva / 100);
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
        // 🔥 Solo devolver primeros 100 items para la vista previa (evita payloads de MB)
        items: items.slice(0, 100),
        totalItems: items.length,
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

    // Check limit before processing bulk
    const newProductsCount = productsData.length;
    if (newProductsCount > 0) {
      const currentCount = await db.product.count({ where: { businessId } });
      const limitCheck = await assertLimit("maxProducts", currentCount + newProductsCount);
      if (!limitCheck.success) {
        return { error: limitCheck.error || "Has alcanzado el límite de productos de tu plan." };
      }
    }

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
      where: { businessId, code: { in: codes }, ...(supplierId ? { supplierId } : {}) }
    });
    const existingProductMap = new Map<string, typeof existingProducts[number]>();
    for (const p of existingProducts) {
      if (p.code !== null && p.code !== undefined) {
        existingProductMap.set(p.code.toString(), p);
      }
    }

    // 6. Partition Products to Create/Update
    const toCreate: Prisma.ProductCreateManyInput[] = [];
    const toUpdate: Array<{
      id: string;
      description: string;
      price: number;
      salePrice: number;
      gain: number;
      unit: string;
      brandId: string | null;
      categoryId: string | null;
      subCategoryId: string | null;
      amount: number | null;
      supplierId: string | null;
    }> = [];
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

      const parsed = parseExcelIva(item.iva);
      const rowIva = parsed.percent !== null ? parsed.percent : (iva ?? 0);
      const hasExcelIva = parsed.percent !== null;

      if (applyPriceFormula || hasExcelIva) {
        const d = discount ?? 0;
        const g = gain ?? 0;
        costPrice = filePrice * (1 - d / 100) * (1 + rowIva / 100);
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
          toUpdate.push({
            id: existingProduct.id,
            description: item.description.toString(),
            price: isPriceValid ? costPrice : 0,
            salePrice: isPriceValid ? salePrice : 0,
            gain: (applyPriceFormula || hasExcelIva) ? gainValue : existingProduct.gain,
            unit: item.unit || "unidades",
            brandId: resolvedBrandId,
            categoryId: resolvedCategoryId,
            subCategoryId: resolvedSubCategoryId,
            amount: item.amount !== null && item.amount !== undefined
              ? (isNaN(parsedAmount) ? 0 : parsedAmount)
              : null,
            supplierId: supplierId || null,
          });
          updatedCount++;
        }
      } else {
        if (updateOnly) {
          continue;
        }

        toCreate.push({
          id: generateCuid(),
          code: item.code.toString(),
          codebar: item.codebar ? item.codebar.toString() : null,
          description: item.description.toString(),
          price: isPriceValid ? costPrice : 0,
          salePrice: isPriceValid ? salePrice : 0,
          gain: (applyPriceFormula || hasExcelIva) ? gainValue : 0,
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

    if (toUpdate.length > 0) {
      const params: (string | number | null)[] = [];
      const placeholders = toUpdate.map((_, i) => {
        const n = i * 11;
        return `($${n + 1}::text,$${n + 2}::text,$${n + 3}::numeric,$${n + 4}::numeric,$${n + 5}::numeric,$${n + 6}::text,$${n + 7}::text,$${n + 8}::text,$${n + 9}::text,$${n + 10}::numeric,$${n + 11}::text)`;
      }).join(",");

      for (const u of toUpdate) {
        params.push(u.id, u.description, u.price, u.salePrice, u.gain, u.unit, u.brandId, u.categoryId, u.subCategoryId, u.amount, u.supplierId);
      }

      await db.$executeRawUnsafe(
        `UPDATE "Product" AS p SET
          "description" = u.description,
          "price" = u.price,
          "salePrice" = u.sale_price,
          "gain" = u.gain,
          "unit" = u.unit,
          "brandId" = u.brand_id,
          "categoryId" = u.category_id,
          "subCategoryId" = u.sub_category_id,
          "amount" = CASE WHEN u.amount IS NOT NULL THEN u.amount ELSE p.amount END,
          "supplierId" = u.supplier_id,
          "last_update" = NOW()
        FROM (VALUES ${placeholders}) AS u(id, description, price, sale_price, gain, unit, brand_id, category_id, sub_category_id, amount, supplier_id)
        WHERE p.id = u.id`,
        ...params
      );
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
  imageUrls?: string[];
  imagesToDelete?: string[];
}

export const updateProduct = async (id: string, data: UpdateProductInput) => {
  const session = await auth();
  if (!session?.user?.businessId) return { error: "No authorized" };

  try {
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

    const product = await db.product.update({
      where: { id },
      data: {
        code: finalCode,
        codebar: data.codebar !== undefined ? (data.codebar || null) : undefined,
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

    if (data.imageUrls && data.imageUrls.length > 0) {
      await db.productImage.createMany({
        data: data.imageUrls.map((url) => ({ productId: id, url })),
      });
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
      include: { supplier: true, brand: true, category: true, subCategory: true, images: { select: { id: true, url: true } } },
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
  codeOnly?: boolean;
  exactCode?: boolean;
}) => {
  const session = await auth();
  if (!session?.user?.businessId)
    return { products: [], total: 0, page: 1, pageSize: 25, totalPages: 0 };

  const page = Math.max(1, params.page || 1);
  const pageSize = Math.min(100, Math.max(1, params.pageSize || 25));
  const skip = (page - 1) * pageSize;

  const businessId = session.user.businessId;

  // Exact code match bypasses ranked search
  if (params.search && params.exactCode) {
    return getProductsExactCode(params.search, businessId, page, pageSize, skip, params);
  }

  // pg_trgm ranked search for queries >= 3 chars
  if (params.search && params.search.length >= 3) {
    return getProductsPaginatedWithRanking(params.search, businessId, page, pageSize, skip, params);
  }

  // Fallback to ILIKE for short queries or no search
  const where: Prisma.ProductWhereInput = {
    businessId,
    ...buildSearchFilter(params.search, params.codeOnly),
    ...(params.categoryId && { categoryId: params.categoryId }),
    ...(params.brandId && { brandId: params.brandId }),
    ...(params.unit && { unit: params.unit }),
  };

  try {
    const [products, total] = await db.$transaction([
      db.product.findMany({
        where,
        include: {
          brand: { select: { id: true, name: true } },
          images: { select: { id: true, url: true } },
        },
        orderBy: { description: "asc" },
        skip,
        take: pageSize,
      }),
      db.product.count({ where }),
    ]);

    const sortedProducts = params.codeOnly && params.search
      ? sortByExactCode(products, params.search)
      : products;

    return {
      products: sortedProducts,
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

const getProductsExactCode = async (
  search: string,
  businessId: string,
  page: number,
  pageSize: number,
  skip: number,
  filters: { categoryId?: string; brandId?: string; unit?: string; codeOnly?: boolean },
) => {
  const where: Prisma.ProductWhereInput = {
    businessId,
    OR: [
      { code: { equals: search, mode: "insensitive" } },
      { codebar: { equals: search, mode: "insensitive" } },
    ],
    ...(filters.categoryId && { categoryId: filters.categoryId }),
    ...(filters.brandId && { brandId: filters.brandId }),
    ...(filters.unit && { unit: filters.unit }),
  };

  try {
    const [products, total] = await db.$transaction([
      db.product.findMany({
        where,
        include: { brand: { select: { id: true, name: true } }, images: { select: { id: true, url: true } } },
        orderBy: { code: "asc" },
        skip,
        take: pageSize,
      }),
      db.product.count({ where }),
    ]);

    return { products, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  } catch (error) {
    console.error("Error in getProductsExactCode:", error);
    return { products: [], total: 0, page: 1, pageSize: 25, totalPages: 0 };
  }
};

const getProductsPaginatedWithRanking = async (
  search: string,
  businessId: string,
  page: number,
  pageSize: number,
  skip: number,
  filters: { categoryId?: string; brandId?: string; unit?: string; codeOnly?: boolean },
) => {
  try {
    type IdResult = { id: string };

    const { codeOnly } = filters;

    const idResults = await db.$queryRaw<IdResult[]>(
      Prisma.sql`
        SELECT p.id
        FROM "Product" p
        LEFT JOIN "Brand" b ON b.id = p."brandId"
        LEFT JOIN "Supplier" s ON s.id = p."supplierId"
        WHERE p."businessId" = ${businessId}
          AND (
            ${codeOnly
              ? Prisma.sql`
                  similarity(COALESCE(p.code, ''), ${search}) > 0.15
                  OR similarity(COALESCE(p.codebar, ''), ${search}) > 0.15
                `
              : Prisma.sql`
                  similarity(COALESCE(p.description, ''), ${search}) > 0.15
                  OR similarity(COALESCE(p.code, ''), ${search}) > 0.15
                  OR similarity(COALESCE(p.codebar, ''), ${search}) > 0.15
                  OR similarity(COALESCE(b.name, ''), ${search}) > 0.15
                  OR similarity(COALESCE(s.name, ''), ${search}) > 0.15
                `
            }
          )
          ${filters.categoryId ? Prisma.sql`AND p."categoryId" = ${filters.categoryId}` : Prisma.empty}
          ${filters.brandId ? Prisma.sql`AND p."brandId" = ${filters.brandId}` : Prisma.empty}
          ${filters.unit ? Prisma.sql`AND p."unit" = ${filters.unit}` : Prisma.empty}
        ORDER BY
          (p.code = ${search} OR p.codebar = ${search}) DESC,
          GREATEST(
            ${codeOnly
              ? Prisma.sql`
                  similarity(COALESCE(p.code, ''), ${search}),
                  similarity(COALESCE(p.codebar, ''), ${search})
                `
              : Prisma.sql`
                  similarity(COALESCE(p.description, ''), ${search}),
                  similarity(COALESCE(p.code, ''), ${search}),
                  similarity(COALESCE(p.codebar, ''), ${search}),
                  similarity(COALESCE(b.name, ''), ${search}),
                  similarity(COALESCE(s.name, ''), ${search})
                `
            }
          ) DESC
        LIMIT 300
      `
    );

    const total = idResults.length;
    const pageIds = idResults.map((r) => r.id).slice(skip, skip + pageSize);

    if (pageIds.length === 0) {
      return { products: [], total: 0, page, pageSize, totalPages: 0 };
    }

    const products = await db.product.findMany({
      where: { id: { in: pageIds } },
      include: {
        brand: { select: { id: true, name: true } },
        images: { select: { id: true, url: true } },
      },
    });

    // Preserve pg_trgm ranking order
    const productMap = new Map(products.map((p) => [p.id, p]));
    const orderedProducts = pageIds.map((id) => productMap.get(id)).filter(Boolean) as typeof products;

    return {
      products: orderedProducts,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  } catch (error) {
    console.warn("pg_trgm no disponible, usando ILIKE fallback:", error);
    const where: Prisma.ProductWhereInput = {
      businessId,
      ...buildSearchFilter(search, filters.codeOnly),
      ...(filters.categoryId && { categoryId: filters.categoryId }),
      ...(filters.brandId && { brandId: filters.brandId }),
      ...(filters.unit && { unit: filters.unit }),
    };

    const [productsResult, total] = await db.$transaction([
      db.product.findMany({ where, include: { brand: { select: { id: true, name: true } }, images: { select: { id: true, url: true } } }, orderBy: { description: "asc" }, skip, take: pageSize }),
      db.product.count({ where }),
    ]);

    let sortedProducts = productsResult;
    if (filters.codeOnly) {
      sortedProducts = sortByExactCode(productsResult, search);
    }

    return { products: sortedProducts, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  }
};

export const getProductByCode = async (code: string, supplierId?: string) => {
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
        ...(supplierId ? { supplierId } : {}),
      },
      include: { supplier: true, brand: true, category: true, subCategory: true },
    });

    return product;
  } catch (error) {
    console.error(error);
    return null;
  }
};

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
      include: { supplier: true, brand: true, category: true, subCategory: true },
    });

    return products;
  } catch (error) {
    console.error(error);
    return [];
  }
};

const sortByExactCode = <T extends { code: string | null; codebar: string | null }>(
  products: T[],
  search: string,
): T[] => {
  return products.sort((a, b) => {
    const aExact = a.code === search || a.codebar === search ? 0 : 1;
    const bExact = b.code === search || b.codebar === search ? 0 : 1;
    return aExact - bExact;
  });
};

const buildSearchFilter = (search?: string, codeOnly = false): Prisma.ProductWhereInput => {
  if (!search) return {};
  const words = search.split(/\s+/).filter(Boolean);
  return {
    AND: words.map((word) => ({
      OR: codeOnly
        ? [
            { code: { contains: word, mode: "insensitive" } },
            { codebar: { contains: word, mode: "insensitive" } },
          ]
        : [
            { code: { contains: word, mode: "insensitive" } },
            { codebar: { contains: word, mode: "insensitive" } },
            { description: { contains: word, mode: "insensitive" } },
            { brand: { name: { contains: word, mode: "insensitive" } } },
            { supplier: { name: { contains: word, mode: "insensitive" } } },
          ],
    })),
  };
};

const searchILIKE = async (query: string, businessId: string, supplierId?: string) => {
  return db.product.findMany({
    where: {
      businessId,
      ...buildSearchFilter(query),
      ...(supplierId ? { supplierId } : {}),
    },
    include: { supplier: true, brand: true, category: true, subCategory: true },
    take: 300,
  });
};

export const getProductsBySearch = async (query: string, supplierId?: string) => {
  const session = await auth();
  if (!session?.user?.businessId) return [];

  try {
    const businessId = session.user.businessId;

    // Short queries (< 3 chars): pg_trgm needs at least 3 chars for trigrams, use ILIKE
    if (query.length < 3) {
      return searchILIKE(query, businessId, supplierId);
    }

    // Try pg_trgm fuzzy search, fall back to ILIKE if extension is not installed
    type SearchResult = { id: string; similarity: number };

    const results = await db.$queryRaw<SearchResult[]>(
      Prisma.sql`
        SELECT p.id,
          GREATEST(
            COALESCE(similarity(COALESCE(p.description, ''), ${query}), 0),
            COALESCE(similarity(COALESCE(p.code, ''), ${query}), 0),
            COALESCE(similarity(COALESCE(p.codebar, ''), ${query}), 0),
            COALESCE(similarity(COALESCE(b.name, ''), ${query}), 0),
            COALESCE(similarity(COALESCE(s.name, ''), ${query}), 0)
          ) AS similarity
        FROM "Product" p
        LEFT JOIN "Brand" b ON b.id = p."brandId"
        LEFT JOIN "Supplier" s ON s.id = p."supplierId"
        WHERE p."businessId" = ${businessId}
          AND (
            similarity(COALESCE(p.description, ''), ${query}) > 0.15
            OR similarity(COALESCE(p.code, ''), ${query}) > 0.15
            OR similarity(COALESCE(p.codebar, ''), ${query}) > 0.15
            OR similarity(COALESCE(b.name, ''), ${query}) > 0.15
            OR similarity(COALESCE(s.name, ''), ${query}) > 0.15
          )
          ${supplierId ? Prisma.sql`AND p."supplierId" = ${supplierId}` : Prisma.empty}
        ORDER BY similarity DESC
        LIMIT 300
      `
    );

    if (results.length === 0) return [];

    const ids = results.map((r) => r.id);

    const products = await db.product.findMany({
      where: { id: { in: ids } },
      include: { supplier: true, brand: true, category: true, subCategory: true },
    });

    // Preserve similarity ordering
    const productMap = new Map(products.map((p) => [p.id, p]));
    return ids.map((id) => productMap.get(id)).filter(Boolean) as typeof products;
  } catch (error) {
    console.warn("pg_trgm no disponible, usando ILIKE fallback:", error);
    if (query.length >= 3) {
      return searchILIKE(query, session.user.businessId!, supplierId);
    }
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
  supplierId?: string;
  page?: number;
  pageSize?: number;
}) => {
  const session = await auth();
  if (!session?.user?.businessId) {
    return { products: [], total: 0, page: 1, pageSize: 25, totalPages: 0 };
  }

  const currentPage = Math.max(1, filters.page ?? 1);
  const currentPageSize = Math.min(PAGINATION.MAX_PAGE_SIZE, Math.max(1, filters.pageSize ?? PAGINATION.DEFAULT_PAGE_SIZE));
  const skip = (currentPage - 1) * currentPageSize;

  try {
    const where: Prisma.ProductWhereInput = {
      businessId: session.user.businessId,
      ...(filters.search
        ? {
          OR: [
            { code: { contains: filters.search, mode: "insensitive" as const } },
            { codebar: { contains: filters.search, mode: "insensitive" as const } },
            { description: { contains: filters.search, mode: "insensitive" as const } },
          ],
        }
        : {}),
      ...(filters.categoryId ? { categoryId: filters.categoryId } : {}),
      ...(filters.brandId ? { brandId: filters.brandId } : {}),
      ...(filters.unit ? { unit: filters.unit } : {}),
      ...(filters.supplierId ? { supplierId: filters.supplierId } : {}),
    };

    const [products, total] = await db.$transaction([
      db.product.findMany({
        where,
        include: { supplier: true, brand: true, category: true, subCategory: true },
        orderBy: { description: "asc" },
        skip,
        take: currentPageSize,
      }),
      db.product.count({ where }),
    ]);

    return {
      products,
      total,
      page: currentPage,
      pageSize: currentPageSize,
      totalPages: Math.ceil(total / currentPageSize),
    };
  } catch (error) {
    console.error("Error fetching filtered products:", error);
    return { products: [], total: 0, page: 1, pageSize: 25, totalPages: 0 };
  }
};

export const getFilteredProductIds = async (filters: {
  search?: string;
  categoryId?: string;
  brandId?: string;
  unit?: string;
  supplierId?: string;
}): Promise<string[]> => {
  const session = await auth();
  if (!session?.user?.businessId) return [];

  const where: Prisma.ProductWhereInput = {
    businessId: session.user.businessId,
    ...(filters.search
      ? {
          OR: [
            { code: { contains: filters.search, mode: "insensitive" as const } },
            { codebar: { contains: filters.search, mode: "insensitive" as const } },
            { description: { contains: filters.search, mode: "insensitive" as const } },
          ],
        }
      : {}),
    ...(filters.categoryId ? { categoryId: filters.categoryId } : {}),
    ...(filters.brandId ? { brandId: filters.brandId } : {}),
    ...(filters.unit ? { unit: filters.unit } : {}),
    ...(filters.supplierId ? { supplierId: filters.supplierId } : {}),
  };

  try {
    const products = await db.product.findMany({
      where,
      select: { id: true },
      orderBy: { description: "asc" },
    });
    return products.map((p) => p.id);
  } catch (error) {
    console.error("Error fetching filtered product IDs:", error);
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

    const products = await db.product.findMany({
      where: { id: { in: productIds }, businessId: session.user.businessId },
      select: { id: true, price: true, salePrice: true },
    });

    const updates = products.map((product) => {
      const newSalePrice = product.salePrice * factor;
      const gain = product.price === 0 ? 0 : ((newSalePrice - product.price) / product.price) * 100;
      return db.product.update({
        where: { id: product.id },
        data: { salePrice: newSalePrice, gain },
      });
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
    let amountData: number | { increment: number } | { decrement: number };
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

    await db.product.updateMany({
      where: { id: { in: productIds }, businessId: session.user.businessId },
      data: { amount: amountData, last_update: new Date() },
    });

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
