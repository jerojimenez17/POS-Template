import { PrismaClient } from "@prisma/client";
import { PLAN_SEEDS } from "../src/types/plan";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding PlanDefinition...");

  for (const plan of PLAN_SEEDS) {
    const { name, description, features, limits, isDefault, isActive, displayOrder } = plan;

    await prisma.planDefinition.upsert({
      where: { name },
      update: {
        description,
        features: features as any,
        limits: limits as any,
        isDefault: isDefault ?? false,
        isActive: isActive ?? true,
        displayOrder: displayOrder ?? 0,
      },
      create: {
        name,
        description,
        features: features as any,
        limits: limits as any,
        isDefault: isDefault ?? false,
        isActive: isActive ?? true,
        displayOrder: displayOrder ?? 0,
      },
    });

    console.log(`  ✅ ${name}`);
  }

  console.log("✅ Seeding complete.");
}

main()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
