/**
 * Migration Script: Remove Supplier Prefixes from Product Codes
 *
 * This script:
 * 1. Finds all products whose code starts with a 3-letter supplier prefix (e.g., "tal-2992")
 * 2. Verifies the prefix matches an actual supplier
 * 3. Strips the prefix (e.g., "tal-2992" → "2992")
 * 4. If multiple products end up with the same code, keeps only the one with the highest salePrice
 * 5. Deletes duplicate products
 *
 * Usage:
 *   npx tsx scripts/cleanup-prefixes.ts
 *
 * Or via npm:
 *   npm run cleanup:prefixes
 */

import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

function extractPrefix(code: string): string | null {
  const match = code.match(/^([a-z]{3})-(.+)$/);
  return match ? match[1] : null;
}

function stripPrefix(code: string): string {
  return code.replace(/^[a-z]{3}-/, "");
}

interface ConflictGroup {
  businessId: string;
  strippedCode: string;
  products: Array<{
    id: string;
    code: string;
    strippedCode: string;
    salePrice: number;
    amount: number;
    description: string | null;
    supplierId: string | null;
  }>;
}

async function main() {
  console.log("========================================");
  console.log("  Cleanup Supplier Prefixes - Migration");
  console.log("========================================\n");

  // 1. Get all suppliers and build prefix map
  console.log("Loading suppliers...");
  const suppliers = await db.supplier.findMany();
  const prefixToSupplier = new Map<string, string>();
  for (const s of suppliers) {
    const prefix = s.name.toLowerCase().replace(/\s+/g, "").slice(0, 3);
    prefixToSupplier.set(prefix, s.id);
  }
  console.log(`  Found ${suppliers.length} suppliers\n`);

  // 2. Find all products with potential prefix codes
  console.log("Scanning products for prefixed codes...");
  const allProducts = await db.product.findMany({
    where: {
      code: { not: null },
    },
    orderBy: { creation_date: "asc" },
  });
  console.log(`  Total products: ${allProducts.length}`);

  const prefixedProducts = allProducts.filter((p) => {
    if (!p.code) return false;
    const prefix = extractPrefix(p.code);
    if (!prefix) return false;
    return prefixToSupplier.has(prefix);
  });

  console.log(`  Products with supplier prefix: ${prefixedProducts.length}\n`);

  if (prefixedProducts.length === 0) {
    console.log("No prefixed products found. Nothing to do.");
    await db.$disconnect();
    return;
  }

  // 3. Group by (businessId, strippedCode) to find conflicts
  const groupMap = new Map<string, ConflictGroup>();

  for (const p of prefixedProducts) {
    const strippedCode = stripPrefix(p.code!);
    const key = `${p.businessId}:${strippedCode}`;

    if (!groupMap.has(key)) {
      groupMap.set(key, {
        businessId: p.businessId,
        strippedCode,
        products: [],
      });
    }

    groupMap.get(key)!.products.push({
      id: p.id,
      code: p.code!,
      strippedCode,
      salePrice: p.salePrice,
      amount: p.amount,
      description: p.description,
      supplierId: p.supplierId,
    });
  }

  // 4. Also check: do any of these stripped codes collide with existing non-prefixed products?
  const strippedCodes = [...new Set(prefixedProducts.map((p) => stripPrefix(p.code!)))];
  const existingProducts = await db.product.findMany({
    where: {
      code: { in: strippedCodes },
      id: { notIn: prefixedProducts.map((p) => p.id) },
    },
  });

  // Add existing non-prefixed products to the conflict groups
  for (const existing of existingProducts) {
    const key = `${existing.businessId}:${existing.code}`;
    if (groupMap.has(key)) {
      const group = groupMap.get(key)!;
      // Only add if not already in the group
      if (!group.products.some((p) => p.id === existing.id)) {
        group.products.push({
          id: existing.id,
          code: existing.code!,
          strippedCode: existing.code!,
          salePrice: existing.salePrice,
          amount: existing.amount,
          description: existing.description,
          supplierId: existing.supplierId,
        });
      }
    }
  }

  // 5. Separate groups into "safe" (no conflict) and "conflict" (need dedup)
  const safeGroups: ConflictGroup[] = [];
  const conflictGroups: ConflictGroup[] = [];

  for (const [, group] of groupMap) {
    if (group.products.length === 1) {
      safeGroups.push(group);
    } else {
      conflictGroups.push(group);
    }
  }

  console.log(`  Products to update (prefix removal only): ${safeGroups.length}`);
  console.log(`  Conflict groups requiring deduplication: ${conflictGroups.length}\n`);

  // 6. Print conflict details
  if (conflictGroups.length > 0) {
    console.log("--- Conflict Details ---");
    for (const group of conflictGroups) {
      console.log(`\n  Code "${group.strippedCode}" (business: ${group.businessId}):`);
      for (const p of group.products) {
        const source = p.code !== p.strippedCode ? `(was: ${p.code})` : "(no prefix)";
        console.log(`    - [${p.id}] ${p.description ?? "N/A"} | Price: $${p.salePrice} | Stock: ${p.amount} ${source}`);
      }
      // Select winner: highest salePrice, tie-break by highest amount, then by most recently created
      const sorted = [...group.products].sort((a, b) => {
        if (b.salePrice !== a.salePrice) return b.salePrice - a.salePrice;
        if (b.amount !== a.amount) return b.amount - a.amount;
        return 0;
      });
      const winner = sorted[0];
      console.log(`  => Keeping: [${winner.id}] ${winner.description ?? "N/A"} ($${winner.salePrice})`);
      console.log(`  => Deleting: ${sorted.slice(1).map((p) => `[${p.id}] ${p.description ?? "N/A"}`).join(", ")}`);
    }
    console.log("");
  }

  // 7. Execute migration within a transaction
  console.log("Executing migration...");

  const result = await db.$transaction(async (tx) => {
    let updated = 0;
    let deleted = 0;

    // 7a. Update safe products (strip prefix)
    for (const group of safeGroups) {
      const p = group.products[0];
      await tx.product.update({
        where: { id: p.id },
        data: { code: p.strippedCode },
      });
      updated++;
    }

    // 7b. Handle conflicts: keep winner, delete rest
    for (const group of conflictGroups) {
      const sorted = [...group.products].sort((a, b) => {
        if (b.salePrice !== a.salePrice) return b.salePrice - a.salePrice;
        if (b.amount !== a.amount) return b.amount - a.amount;
        return 0;
      });
      const winner = sorted[0];
      const toDelete = sorted.slice(1);

      // Update winner's code to stripped version
      await tx.product.update({
        where: { id: winner.id },
        data: { code: winner.strippedCode },
      });
      updated++;

      // Delete duplicates
      for (const d of toDelete) {
        await tx.product.delete({ where: { id: d.id } });
        deleted++;
      }
    }

    return { updated, deleted };
  });

  console.log(`\n=== Migration Complete ===`);
  console.log(`  Products updated (prefix stripped): ${result.updated}`);
  console.log(`  Duplicate products deleted: ${result.deleted}`);
  console.log(`  Total products affected: ${result.updated + result.deleted}\n`);

  await db.$disconnect();
}

main().catch((e) => {
  console.error("Migration failed:", e);
  process.exit(1);
});
