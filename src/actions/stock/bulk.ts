"use server";

import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { pusherServer } from "@/lib/pusher-server";

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
        const priceStr = item.price.toString().replace(',','.');
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

  const businessId = session.user.businessId;

  try {
    let createdCount = 0;
    let updatedCount = 0;

    const applyPriceFormula = discount !== undefined || iva !== undefined || gain !== undefined;

    // ── Step 1: Pre-load ALL reference data in 3 parallel queries ──
    const [allBrands, allCategories, allSubCategories] = await Promise.all([
      db.brand.findMany({ where: { businessId } }),
      db.category.findMany({ where: { businessId } }),
      db.subcategory.findMany({ where: { businessId } }),
    ]);

    // Build O(1) lookup maps
    const brandMap = new Map(allBrands.map(b => [b.name.toLowerCase(), b]));
    const categoryMap = new Map(allCategories.map(c => [c.name.toLowerCase(), c]));
    const subCategoryMap = new Map(
      allSubCategories.map(s => [`${s.name.toLowerCase()}|${s.categoryId}`, s])
    );

    // Pre-load ALL existing products by code in 1 query
    const allCodes = productsData.map(p => p.code.toString());
    const existingProducts = await db.product.findMany({
      where: { businessId, code: { in: allCodes } },
      select: { id: true, code: true, price: true, salePrice: true, gain: true, amount: true, supplierId: true },
    });
    const existingByCode = new Map(existingProducts.map(p => [p.code, p]));

    // ── Step 2: Batch create missing reference data ──

    // Brands (no dependencies)
    const missingBrandNames = [...new Set(
      productsData
        .map(p => p.brandName?.trim())
        .filter((name): name is string => !!name && !brandMap.has(name.toLowerCase()))
    )];
    if (missingBrandNames.length > 0) {
      const createdBrands = await db.$transaction(
        missingBrandNames.map(name => db.brand.create({ data: { name, businessId } }))
      );
      createdBrands.forEach(b => brandMap.set(b.name.toLowerCase(), b));
    }

    // Categories (no dependencies)
    const missingCategoryNames = [...new Set(
      productsData
        .map(p => p.categoryName?.trim())
        .filter((name): name is string => !!name && !categoryMap.has(name.toLowerCase()))
    )];
    if (missingCategoryNames.length > 0) {
      const createdCategories = await db.$transaction(
        missingCategoryNames.map(name => db.category.create({ data: { name, businessId } }))
      );
      createdCategories.forEach(c => categoryMap.set(c.name.toLowerCase(), c));
    }

    // SubCategories (depends on categories being fully populated)
    const subCategoryEntries = [
      ...new Map(
        productsData
          .filter(p => p.subCategoryName?.trim() && p.categoryName?.trim())
          .map(p => {
            const cat = categoryMap.get(p.categoryName!.trim().toLowerCase());
            if (!cat) return null;
            const key = `${p.subCategoryName!.trim().toLowerCase()}|${cat.id}`;
            return [key, { name: p.subCategoryName!.trim(), categoryId: cat.id }] as const;
          })
          .filter((e): e is readonly [string, { name: string; categoryId: string }] => e !== null)
      ).values()
    ]
      .filter(e => !subCategoryMap.has(`${e.name.toLowerCase()}|${e.categoryId}`));

    if (subCategoryEntries.length > 0) {
      const createdSubCategories = await db.$transaction(
        subCategoryEntries.map(e =>
          db.subcategory.create({ data: { name: e.name, categoryId: e.categoryId, businessId } })
        )
      );
      createdSubCategories.forEach(s =>
        subCategoryMap.set(`${s.name.toLowerCase()}|${s.categoryId}`, s)
      );
    }

    // ── Step 3: Process products in chunks of 100 ──
    const CHUNK_SIZE = 100;
    const bulkOps: any[] = [];
    const processedCodes = new Set<string>();

    for (const item of productsData) {
      const code = item.code.toString();

      // Skip duplicate codes within the same chunk to avoid unique constraint violations
      if (processedCodes.has(code)) continue;
      processedCodes.add(code);

      // Resolve reference IDs from pre-loaded maps (O(1))
      const brandId = item.brandName?.trim()
        ? brandMap.get(item.brandName.trim().toLowerCase())?.id
        : undefined;

      const categoryId = item.categoryName?.trim()
        ? categoryMap.get(item.categoryName.trim().toLowerCase())?.id
        : undefined;

      const subCategoryId = item.subCategoryName?.trim() && categoryId
        ? subCategoryMap.get(`${item.subCategoryName.trim().toLowerCase()}|${categoryId}`)?.id
        : undefined;

      // Price calculations (unchanged)
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

      const supplierConnect = supplierId ? { connect: { id: supplierId } } : undefined;

      const existingProduct = existingByCode.get(code);

      if (existingProduct) {
        const priceSame = isPriceValid &&
          Math.abs(costPrice - existingProduct.price) < 0.001 &&
          Math.abs(salePrice - existingProduct.salePrice) < 0.001;

        const supplierSame =
          (supplierId === undefined && existingProduct.supplierId === null) ||
          supplierId === existingProduct.supplierId;

        if (supplierSame && priceSame) continue;

        if (updateExisting || updateOnly) {
          const updateData: Parameters<typeof db.product.update>[0]["data"] = {
            description: item.description.toString(),
            price: isPriceValid ? costPrice : 0,
            salePrice: isPriceValid ? salePrice : 0,
            gain: applyPriceFormula ? gainValue : existingProduct.gain,
            unit: item.unit || "unidades",
            brand: brandId ? { connect: { id: brandId } } : { disconnect: true },
            category: categoryId ? { connect: { id: categoryId } } : { disconnect: true },
            subCategory: subCategoryId ? { connect: { id: subCategoryId } } : { disconnect: true },
            last_update: new Date(),
            catalog: item.catalog !== undefined ? item.catalog : undefined,
            details: item.details !== undefined ? item.details : undefined,
            supplier: supplierConnect,
          };

          if (item.amount !== null && item.amount !== undefined) {
            updateData.amount = isNaN(parsedAmount) ? 0 : parsedAmount;
          } else if (item.amount === undefined) {
            updateData.amount = existingProduct.amount;
          }

          bulkOps.push(db.product.update({
            where: { id: existingProduct.id },
            data: updateData,
          }));
          updatedCount++;
        }
      } else {
        if (updateOnly) continue;

        bulkOps.push(db.product.create({
          data: {
            code: item.code.toString(),
            description: item.description.toString(),
            price: isPriceValid ? costPrice : 0,
            salePrice: isPriceValid ? salePrice : 0,
            gain: applyPriceFormula ? gainValue : 0,
            amount: isNaN(parsedAmount) ? 0 : parsedAmount,
            unit: item.unit || "unidades",
            brand: brandId ? { connect: { id: brandId } } : undefined,
            category: categoryId ? { connect: { id: categoryId } } : undefined,
            subCategory: subCategoryId ? { connect: { id: subCategoryId } } : undefined,
            business: { connect: { id: businessId } },
            catalog: item.catalog !== undefined ? item.catalog : true,
            details: item.details || null,
            supplier: supplierConnect,
          }
        }));
        createdCount++;
      }

      // Flush operations in chunks
      if (bulkOps.length >= CHUNK_SIZE) {
        const results = await db.$transaction(bulkOps);
        // Update existingByCode so subsequent chunks see newly created products
        for (const result of results) {
          if (result.code) existingByCode.set(result.code, result);
        }
        bulkOps.length = 0;
        processedCodes.clear();
      }
    }

    // Flush remaining operations
    if (bulkOps.length > 0) {
      const results = await db.$transaction(bulkOps);
      for (const result of results) {
        if (result.code) existingByCode.set(result.code, result);
      }
    }

    if (supplierId && applyPriceFormula) {
      await db.supplier.update({
        where: { id: supplierId },
        data: { discount, iva, gain }
      });
    }

    const totalCount = updatedCount > 0 || createdCount > 0;
    if (totalCount) {
      try {
        await pusherServer.trigger(
          `movements-${businessId}`,
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
      where: { id: { in: productIds } },
      select: { id: true, salePrice: true, price: true },
    });

    const productMap = new Map(products.map((p) => [p.id, p]));

    const updates: ReturnType<typeof db.product.update>[] = [];

    productIds.forEach((id) => {
      const product = productMap.get(id);
      if (!product) return;

      const newSalePrice = product.salePrice * factor;
      const gain = product.price === 0 ? 0 : ((newSalePrice - product.price) / product.price) * 100;

      updates.push(
        db.product.update({
          where: { id },
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
    const products = await db.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true },
    });

    const existingIds = new Set(products.map((p) => p.id));

    const updates: ReturnType<typeof db.product.update>[] = [];

    productIds.forEach((id) => {
      if (!existingIds.has(id)) return;

      let amountData: number | { decrement: number } | {increment: number};

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
          where: { id },
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
