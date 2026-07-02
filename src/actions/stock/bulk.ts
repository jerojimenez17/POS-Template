"use server";

import { db } from "@/lib/db";
import { revalidateTag, revalidatePath } from "next/cache";
import { CACHE_TAGS } from "@/lib/cache-tags";
import { auth } from "@/auth";
import { pusherServer } from "@/lib/pusher-server";
import { assertWritePermission, assertLimit } from "@/lib/auth-gates";
import { Prisma } from "@prisma/client";

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
  codebar?: string;
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

  const permission = await assertWritePermission();
  if (!permission.success) return { error: permission.error, code: permission.code };

  try {
    const result = await processBulkProductBatch(
      productsData, updateExisting, updateOnly, discount, iva, gain, supplierId
    );

    if ("error" in result) return { error: result.error };

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

  const permission = await assertWritePermission();
  if (!permission.success) return { success: false, error: permission.error, code: permission.code };

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

    revalidateTag(CACHE_TAGS.STOCK, "max");
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

  const permission = await assertWritePermission();
  if (!permission.success) return { success: false, error: permission.error, code: permission.code };

  const businessId = session.user.businessId;

  try {
    // FR-026B: validate every product up-front (compute and reject any that
    // would go negative) so the per-product ADJUSTMENT writes are batched in
    // one transaction and the whole batch aborts atomically on any negative.
    await db.$transaction(async (tx) => {
      const products = await tx.product.findMany({
        where: { id: { in: productIds }, businessId },
        select: { id: true, amount: true },
      });

      // Pass 1: compute and validate — no writes yet.
      const plan = products.map((p) => {
        let next: number;
        switch (mode) {
          case 'set':
            next = amountChange;
            break;
          case 'add':
            next = p.amount + amountChange;
            break;
          case 'subtract':
            next = p.amount - amountChange;
            break;
        }
        return { p, next };
      });

      const negative = plan.find((entry) => entry.next < 0);
      if (negative) throw new Error("Stock insuficiente");

      // Pass 2: apply writes + movements inside the same transaction.
      for (const { p, next } of plan) {
        await tx.product.update({
          where: { id: p.id },
          data: { amount: next, last_update: new Date() },
        });

        const delta = next - p.amount;
        if (delta !== 0) {
          await tx.stockMovement.create({
            data: {
              type: "ADJUSTMENT",
              quantity: delta,
              productId: p.id,
              businessId,
              reason: `Ajuste masivo (${mode})`,
            },
          });
        }
      }
    });

    revalidateTag(CACHE_TAGS.STOCK, "max");
    return { success: true };
  } catch (error) {
    console.error("Error updating amounts:", error);
    return {
      success: false,
      error: "Error al actualizar stock"
    };
  }
};

/**
 * Process a bulk-import batch of products: resolves/creates brand/category/
 * subcategory references and writes products in bulk (createMany + raw UPDATE).
 *
 * Returns `{ createdCount, updatedCount }` on success, or `{ error }` on failure.
 */
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

    // FR-026B: Validate no negative amounts before processing
    for (const item of productsData) {
      const amountStr = item.amount?.toString().replace(',', '.');
      const parsedAmount = amountStr ? parseFloat(amountStr) : 0;
      if (!isNaN(parsedAmount) && parsedAmount < 0) {
        return { error: `El producto "${item.code}" tiene una cantidad negativa (${parsedAmount}).` };
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
          toUpdate.push({
            id: existingProduct.id,
            description: item.description.toString(),
            price: isPriceValid ? costPrice : 0,
            salePrice: isPriceValid ? salePrice : 0,
            gain: applyPriceFormula ? gainValue : existingProduct.gain,
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

    // 7. Write to database in bulk (inside transaction with StockMovement tracking)
    await db.$transaction(async (tx) => {
      // 7a. Create products in bulk
      if (toCreate.length > 0) {
        await tx.product.createMany({
          data: toCreate,
        });
      }

      // 7b. Create PURCHASE movements for newly created products with stock
      if (toCreate.length > 0) {
        const createdWithStock = toCreate.filter(c => (c.amount ?? 0) > 0);
        if (createdWithStock.length > 0) {
          const createdIds = createdWithStock.map(c => c.id).filter(Boolean) as string[];
          const created = await tx.product.findMany({
            where: { id: { in: createdIds } },
            select: { id: true, amount: true, description: true },
          });
          if (created.length > 0) {
            await tx.stockMovement.createMany({
              data: created.map(p => ({
                type: "PURCHASE" as const,
                quantity: p.amount,
                productId: p.id,
                businessId,
                reason: "Importación masiva",
              })),
            });
          }
        }
      }

      // 7c. Capture old amounts before update (to compute ADJUSTMENT delta)
      let oldAmounts: Map<string, number> = new Map();
      if (toUpdate.length > 0) {
        const updateIds = toUpdate.map(u => u.id);
        const existingForUpdate = await tx.product.findMany({
          where: { id: { in: updateIds } },
          select: { id: true, amount: true },
        });
        oldAmounts = new Map(existingForUpdate.map(p => [p.id, p.amount ?? 0]));
      }

      // 7d. Update products in bulk using Prisma updates (within existing transaction)
      if (toUpdate.length > 0) {
        for (const u of toUpdate) {
          const updateData: Record<string, unknown> = {
            description: u.description,
            price: u.price,
            salePrice: u.salePrice,
            gain: u.gain,
            unit: u.unit,
            brandId: u.brandId,
            categoryId: u.categoryId,
            subCategoryId: u.subCategoryId,
            supplierId: u.supplierId,
            last_update: new Date(),
          };
          // Only update amount if explicitly provided
          if (u.amount !== null && u.amount !== undefined) {
            updateData.amount = u.amount;
          }
          await tx.product.update({
            where: { id: u.id },
            data: updateData,
          });
        }
      }

      // 7e. Create ADJUSTMENT movements for products whose amount changed
      if (toUpdate.length > 0) {
        const adjustments = toUpdate
          .filter(u => u.amount !== null && u.amount !== undefined)
          .map(u => {
            const oldAmount = oldAmounts.get(u.id) ?? 0;
            const delta = u.amount! - oldAmount;
            if (delta === 0) return null;
            return {
              type: "ADJUSTMENT" as const,
              quantity: delta,
              productId: u.id,
              businessId,
              reason: "Importación masiva",
            };
          })
          .filter(Boolean) as Array<{
            type: "ADJUSTMENT";
            quantity: number;
            productId: string;
            businessId: string;
            reason: string;
          }>;

        if (adjustments.length > 0) {
          await tx.stockMovement.createMany({
            data: adjustments,
          });
        }
      }
    });

    return { createdCount, updatedCount };
  } catch (error) {
    console.error("Batch processing error:", error);
    return { error: "Error al procesar lote de productos" };
  }
};

/**
 * Post-processing hook for bulk imports: persists the supplier pricing formula
 * (discount/iva/gain) and broadcasts a stock refresh.
 */
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
