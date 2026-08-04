/**
 * Script: Merge Duplicate Products (Supplier Prefix Cleanup)
 *
 * Detects products that are duplicated due to the old supplier-prefix naming convention.
 * Example: supplier "Taladro" → product codes "tal-70150" and "70150" with same
 *   businessId, supplierId, and description → merges into the one WITHOUT the prefix.
 *
 * Rules:
 *   1. Match: same businessId, same supplierId, same description, and codes
 *      where one equals `<prefix>-<baseCode>` and the other equals `<baseCode>`.
 *   2. The prefix is the first 3 lowercase letters of the supplier name + "-".
 *   3. Keep the product WITHOUT the prefix.
 *   4. If either product has a codebar set, the surviving product gets it.
 *   5. Reassign all relations from the duplicate to the survivor:
 *      - OrderItem, StockMovement, ProductRanking, SaleReturnItem,
 *        ShortcutConfig, ProductImage
 *   6. Delete the duplicate (with-prefix) product.
 *
 * Usage:
 *   npx tsx scripts/merge-duplicate-products.ts           # dry-run (default)
 *   npx tsx scripts/merge-duplicate-products.ts --execute  # actually apply changes
 */

import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

const DRY_RUN = !process.argv.includes("--execute");

interface MergePair {
  keepId: string;
  keepCode: string;
  removeId: string;
  removeCode: string;
  description: string | null;
  supplierName: string;
  businessId: string;
  codebar: string | null;
}

async function findDuplicates(): Promise<MergePair[]> {
  const pairs: MergePair[] = [];

  // --- Phase 1: Both products have the SAME supplier ---
  const productsWithSupplier = await db.product.findMany({
    where: {
      supplierId: { not: null },
    },
    select: {
      id: true,
      code: true,
      codebar: true,
      description: true,
      businessId: true,
      supplierId: true,
      supplier: {
        select: { name: true },
      },
    },
    orderBy: { code: "asc" },
  });

  // Group products by (businessId, supplierId, description)
  const groupKey = (p: (typeof productsWithSupplier)[0]) =>
    `${p.businessId}||${p.supplierId}||${(p.description ?? "").toLowerCase().trim()}`;

  const groups = new Map<string, typeof productsWithSupplier>();
  for (const p of productsWithSupplier) {
    const key = groupKey(p);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(p);
  }

  for (const [, group] of groups) {
    if (group.length < 2) continue;

    const supplierName = group[0].supplier?.name ?? "";
    if (supplierName.length < 3) continue;

    const prefix = supplierName.substring(0, 3).toLowerCase() + "-";

    const baseCodeMap = new Map<string, (typeof productsWithSupplier)[0]>();
    const prefixCodeMap = new Map<string, (typeof productsWithSupplier)[0]>();

    for (const p of group) {
      const code = (p.code ?? "").trim();
      if (!code) continue;

      const codeLower = code.toLowerCase();
      if (codeLower.startsWith(prefix)) {
        prefixCodeMap.set(code.substring(prefix.length).toLowerCase(), p);
      } else {
        baseCodeMap.set(codeLower, p);
      }
    }

    for (const [baseCodeLower, keepProduct] of baseCodeMap) {
      const removeProduct = prefixCodeMap.get(baseCodeLower);
      if (!removeProduct) continue;

      const codebar = keepProduct.codebar || removeProduct.codebar || null;

      pairs.push({
        keepId: keepProduct.id,
        keepCode: keepProduct.code ?? "",
        removeId: removeProduct.id,
        removeCode: removeProduct.code ?? "",
        description: keepProduct.description,
        supplierName,
        businessId: keepProduct.businessId,
        codebar,
      });
    }
  }

  // --- Phase 2: Prefixed product has NO supplier assigned ---
  // Find all products without a supplier whose code starts with a known prefix
  const allSuppliers = await db.supplier.findMany({
    where: { name: { not: "" } },
    select: { id: true, name: true, businessId: true },
  });

  // Build prefix lookup: (businessId, prefix) → supplier
  const prefixToSupplier = new Map<string, { id: string; name: string }>();
  for (const s of allSuppliers) {
    if (s.name.length < 3) continue;
    const pfx = s.name.substring(0, 3).toLowerCase() + "-";
    prefixToSupplier.set(`${s.businessId}||${pfx}`, { id: s.id, name: s.name });
  }

  const productsNoSupplier = await db.product.findMany({
    where: {
      supplierId: null,
      code: { not: null },
    },
    select: {
      id: true,
      code: true,
      codebar: true,
      description: true,
      businessId: true,
    },
    orderBy: { code: "asc" },
  });

  // Track already-matched IDs from Phase 1
  const alreadyMatched = new Set<string>();
  for (const pair of pairs) {
    alreadyMatched.add(pair.removeId);
    alreadyMatched.add(pair.keepId);
  }

  // For each no-supplier product, check if its code has a known supplier prefix
  for (const orphan of productsNoSupplier) {
    if (alreadyMatched.has(orphan.id)) continue;
    const code = (orphan.code ?? "").trim();
    if (!code) continue;

    const codeLower = code.toLowerCase();

    // Try each prefix for this business
    for (const [key, supplier] of prefixToSupplier) {
      const [bizId, pfx] = key.split("||");
      if (bizId !== orphan.businessId) continue;
      if (!codeLower.startsWith(pfx)) continue;

      const baseCode = code.substring(pfx.length);
      if (!baseCode) continue;

      // Look for a product WITH this supplier, same business, same description, matching base code
      const descLower = (orphan.description ?? "").toLowerCase().trim();
      const match = productsWithSupplier.find(
        (p) =>
          p.businessId === orphan.businessId &&
          p.supplierId === supplier.id &&
          (p.description ?? "").toLowerCase().trim() === descLower &&
          (p.code ?? "").toLowerCase().trim() === baseCode.toLowerCase() &&
          !alreadyMatched.has(p.id)
      );

      if (match) {
        const codebar = match.codebar || orphan.codebar || null;

        pairs.push({
          keepId: match.id,
          keepCode: match.code ?? "",
          removeId: orphan.id,
          removeCode: orphan.code ?? "",
          description: orphan.description,
          supplierName: supplier.name,
          businessId: orphan.businessId,
          codebar,
        });

        alreadyMatched.add(orphan.id);
        alreadyMatched.add(match.id);
        break; // Found match, move to next orphan
      }
    }
  }

  return pairs;
}

async function mergePair(pair: MergePair): Promise<void> {
  await db.$transaction(async (tx) => {
    // 1. Reassign OrderItems
    await tx.orderItem.updateMany({
      where: { productId: pair.removeId },
      data: { productId: pair.keepId },
    });

    // 2. Reassign StockMovements
    await tx.stockMovement.updateMany({
      where: { productId: pair.removeId },
      data: { productId: pair.keepId },
    });

    // 3. Reassign ProductRankings - handle unique constraint (productId, month, year, businessId)
    const removeRankings = await tx.productRanking.findMany({
      where: { productId: pair.removeId },
    });

    for (const ranking of removeRankings) {
      const existingKeep = await tx.productRanking.findUnique({
        where: {
          productId_month_year_businessId: {
            productId: pair.keepId,
            month: ranking.month,
            year: ranking.year,
            businessId: ranking.businessId,
          },
        },
      });

      if (existingKeep) {
        // Merge: sum the values into the keeper and delete the duplicate
        await tx.productRanking.update({
          where: { id: existingKeep.id },
          data: {
            totalSold: existingKeep.totalSold + ranking.totalSold,
            totalIncome: existingKeep.totalIncome + ranking.totalIncome,
          },
        });
        await tx.productRanking.delete({ where: { id: ranking.id } });
      } else {
        // No conflict — just reassign
        await tx.productRanking.update({
          where: { id: ranking.id },
          data: { productId: pair.keepId },
        });
      }
    }

    // 4. Reassign SaleReturnItems
    await tx.saleReturnItem.updateMany({
      where: { productId: pair.removeId },
      data: { productId: pair.keepId },
    });

    // 5. Reassign ShortcutConfigs - handle unique constraint (businessId, key)
    const removeShortcuts = await tx.shortcutConfig.findMany({
      where: { productId: pair.removeId },
    });

    for (const shortcut of removeShortcuts) {
      const existingKeep = await tx.shortcutConfig.findFirst({
        where: {
          businessId: shortcut.businessId,
          key: shortcut.key,
          productId: pair.keepId,
        },
      });

      if (existingKeep) {
        // Conflict — delete the duplicate shortcut
        await tx.shortcutConfig.delete({ where: { id: shortcut.id } });
      } else {
        await tx.shortcutConfig.update({
          where: { id: shortcut.id },
          data: { productId: pair.keepId },
        });
      }
    }

    // 6. Reassign ProductImages
    await tx.productImage.updateMany({
      where: { productId: pair.removeId },
      data: { productId: pair.keepId },
    });

    // 7. Update codebar on keeper if needed
    if (pair.codebar) {
      await tx.product.update({
        where: { id: pair.keepId },
        data: { codebar: pair.codebar },
      });
    }

    // 8. Sum stock amounts
    const removeProduct = await tx.product.findUnique({
      where: { id: pair.removeId },
      select: { amount: true },
    });

    if (removeProduct && removeProduct.amount > 0) {
      await tx.product.update({
        where: { id: pair.keepId },
        data: { amount: { increment: removeProduct.amount } },
      });
    }

    // 9. Delete the duplicate product
    await tx.product.delete({ where: { id: pair.removeId } });
  });
}

async function main() {
  console.log("=== Merge Duplicate Products (Supplier Prefix Cleanup) ===\n");
  console.log(`Mode: ${DRY_RUN ? "🔍 DRY RUN (no changes)" : "⚡ EXECUTE (applying changes)"}\n`);

  const pairs = await findDuplicates();

  if (pairs.length === 0) {
    console.log("✅ No duplicate products found. Nothing to do.");
    return;
  }

  console.log(`Found ${pairs.length} duplicate pair(s) to merge:\n`);

  for (const [i, pair] of pairs.entries()) {
    console.log(
      `  ${i + 1}. [${pair.supplierName}] "${pair.description}"\n` +
      `     KEEP:   code="${pair.keepCode}" (id: ${pair.keepId})\n` +
      `     REMOVE: code="${pair.removeCode}" (id: ${pair.removeId})\n` +
      `     Codebar: ${pair.codebar || "(none)"}`
    );
  }

  if (DRY_RUN) {
    console.log("\n🔍 Dry run complete. Run with --execute to apply changes.");
    return;
  }

  console.log("\n⚡ Applying merges...\n");

  let success = 0;
  let errors = 0;

  for (const [i, pair] of pairs.entries()) {
    try {
      await mergePair(pair);
      console.log(`  ✅ ${i + 1}/${pairs.length} Merged "${pair.removeCode}" → "${pair.keepCode}"`);
      success++;
    } catch (error) {
      console.error(`  ❌ ${i + 1}/${pairs.length} Error merging "${pair.removeCode}":`, error);
      errors++;
    }
  }

  console.log(`\n=== Done: ${success} merged, ${errors} errors ===`);
}

main()
  .catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
