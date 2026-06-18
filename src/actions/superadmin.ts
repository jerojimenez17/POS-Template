"use server";

import { db } from "@/lib/db";
import { UserRole, Plan } from "@prisma/client";
import { revalidateTag } from "next/cache";
import { CACHE_TAGS } from "@/lib/cache-tags";
import { auth } from "@/lib/auth";
import { fail } from "@/lib/action-result";

export const promoteToAdmin = async (userId: string, businessName: string, slug: string) => {
  try {
    // Check if slug exists
    const existingBusiness = await db.business.findUnique({
      where: { slug },
    });

    if (existingBusiness) {
      return { error: "Business slug already exists." };
    }

    // Transaction to create business and update user
    await db.$transaction(async (tx) => {
      // Create Business
      const business = await tx.business.create({
        data: {
          name: businessName,
          slug: slug,
          userId: userId, // Set owner
        },
      });

      // Update User
      await tx.user.update({
        where: { id: userId },
        data: {
          role: UserRole.ADMIN,
          businessId: business.id,
        },
      });
    });

    revalidateTag(CACHE_TAGS.SUPERADMIN, "max");
    return { success: "User promoted and business created." };
  } catch (error) {
    console.error("Promote Error:", error);
    return fail("Failed to promote user.");
  }
};

export const getAllBusinesses = async () => {
    const session = await auth();

    if (session?.user.role !== UserRole.SUPER_ADMIN) {
        return { error: "No autorizado" };
    }

    try {
        const businesses = await db.business.findMany({
            include: {
                users: true,
                _count: {
                    select: {
                        users: true,
                        products: true,
                        orders: true,
                    }
                }
            },
            orderBy: {
                createdAt: 'desc'
            }
        });
        return { success: businesses };
    } catch (error) {
        console.error("Error fetching businesses:", error);
        return fail("Error al obtener negocios");
    }
};

export const deleteBusiness = async (businessId: string) => {
    const session = await auth();

    if (session?.user.role !== UserRole.SUPER_ADMIN) {
        return { error: "No autorizado" };
    }

    try {
        await db.business.delete({
            where: {
                id: businessId
            }
        });
        
        revalidateTag(CACHE_TAGS.SUPERADMIN, "max");
        return { success: "Negocio eliminado" };
    } catch (error) {
        console.error("Error deleting business:", error);
        return fail("Error al eliminar negocio");
    }
};

export const updateBusinessFeaturesAction = async (payload: {
  businessId: string;
  plan: Plan;
  hasAfipBilling: boolean;
  hasPublicCatalog: boolean;
  hasClientLedger: boolean;
  hasMultiCashbox: boolean;
  hasSupplierFilter: boolean;
  maxUsers: number;
  maxProducts: number;
}) => {
  const session = await auth();

  if (session?.user?.role !== UserRole.SUPER_ADMIN) {
    return { success: false, error: "No autorizado" };
  }

  try {
    await db.$transaction(async (tx) => {
      const business = await tx.business.findUnique({
        where: { id: payload.businessId },
      });

      if (!business) {
        throw new Error("Negocio no encontrado");
      }

      await tx.businessFeatures.upsert({
        where: { businessId: payload.businessId },
        update: {
          plan: payload.plan,
          hasAfipBilling: payload.hasAfipBilling,
          hasPublicCatalog: payload.hasPublicCatalog,
          hasClientLedger: payload.hasClientLedger,
          hasMultiCashbox: payload.hasMultiCashbox,
          hasSupplierFilter: payload.hasSupplierFilter,
          maxUsers: payload.maxUsers,
          maxProducts: payload.maxProducts,
        },
        create: {
          businessId: payload.businessId,
          plan: payload.plan,
          hasAfipBilling: payload.hasAfipBilling,
          hasPublicCatalog: payload.hasPublicCatalog,
          hasClientLedger: payload.hasClientLedger,
          hasMultiCashbox: payload.hasMultiCashbox,
          hasSupplierFilter: payload.hasSupplierFilter,
          maxUsers: payload.maxUsers,
          maxProducts: payload.maxProducts,
        },
      });
    });

    try {
      revalidatePath("/superadmin/dashboard");
      revalidatePath("/superadmin/businesses/[id]/features");
    } catch {
      // Ignore static generation store missing in test environments
    }
    return { success: true };
  } catch (error) {
    const err = error as Error;
    console.error("Error updating business features:", error);
    return fail(err.message || "Error al actualizar características del negocio");
  }
};

