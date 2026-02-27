"use server";

import { db } from "@/lib/db";
import { UserRole } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { auth } from "../../auth";

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

    revalidatePath("/superadmin/dashboard");
    return { success: "User promoted and business created." };
  } catch (error) {
    console.error("Promote Error:", error);
    return { error: "Failed to promote user." };
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
        return { error: "Error al obtener negocios" };
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
        
        revalidatePath("/superadmin/dashboard");
        return { success: "Negocio eliminado" };
    } catch (error) {
        console.error("Error deleting business:", error);
        return { error: "Error al eliminar negocio" };
    }
}
