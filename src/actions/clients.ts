"use server";

import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";

export const createClient = async (data: {
  name: string;
  address?: string;
  cellPhone?: string;
  balance?: number;
}) => {
  try {
    const client = await db.client.create({
      data: {
        name: data.name,
        address: data.address,
        cellPhone: data.cellPhone,
        balance: data.balance || 0,
      },
    });
    revalidatePath("/clients"); // Assuming /clients is the path
    revalidatePath("/billing"); 
    return { success: "Cliente agregado", client };
  } catch (error) {
    console.error(error);
    return { error: "Error al guardar cliente" };
  }
};

export const getClients = async () => {
    try {
        return await db.client.findMany({
            orderBy: { name: 'asc' }
        });
    } catch (error) {
        console.error(error);
        return [];
    }
}

export const updateClientBalance = async (clientId: string, amountToAdd: number) => {
    try {
        const client = await db.client.findUnique({ where: { id: clientId } });
        if (!client) throw new Error("Cliente no encontrado");
        
        await db.client.update({
            where: { id: clientId },
            data: { 
                balance: { increment: amountToAdd },
                last_update: new Date()
            }
        });
        return { success: true };
    } catch (error) {
        throw error;
    }
}
