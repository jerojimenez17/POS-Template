"use server";

import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { auth } from "../../auth";

import { pusherServer } from "@/lib/pusher-server";

export const createMovement = async (data: {
  total: number;
  seller?: string;
  paidMethod?: string;
  date?: Date;
}) => {
  const session = await auth();
  if (!session?.user?.businessId) return { error: "No autorizado" };

  try {
    const movement = await db.cashMovement.create({
      data: {
        total: data.total,
        seller: data.seller,
        paidMethod: data.paidMethod,
        date: data.date || new Date(),
        business: { connect: { id: session.user.businessId } },
      },
    });
    
    await pusherServer.trigger(
      `movements-${session.user.businessId}`,
      "new-movement",
      movement
    );

    revalidatePath("/movements"); 
    return { success: "Movimiento registrado", movement };
  } catch (error) {
    console.error(error);
    return { error: "Error al guardar movimiento" };
  }
};

export const getMovements = async () => {
    const session = await auth();
    if (!session?.user?.businessId) return [];

    try {
        const movements = await db.cashMovement.findMany({
            where: {
                businessId: session.user.businessId,
                paidMethod: { in: ["Deposito", "Retiro", "Efectivo"] }
            },
            orderBy: { date: 'desc' }
        });
        return movements;
    } catch (error) {
        console.error(error);
        return [];
    }
}
