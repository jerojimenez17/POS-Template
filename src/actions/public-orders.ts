"use server";

import { db } from "@/lib/db";
import { z } from "zod";
import { pusherServer } from "@/lib/pusher-server";

const createPublicOrderSchema = z.object({
  businessId: z.string(),
  client: z.object({
    dni: z.string().min(1, "El DNI es obligatorio"),
    name: z.string().min(1, "El nombre es obligatorio"),
    phone: z.string().optional(),
    email: z.string().email("Correo inválido").optional().or(z.literal('')),
    address: z.string().optional(),
  }).refine((data) => data.phone || data.email, {
    message: "Debe proveer un teléfono o correo electrónico",
    path: ["phone"],
  }),
  items: z.array(
    z.object({
      productId: z.string(),
      code: z.string().optional(),
      description: z.string().optional(),
      price: z.number(),
      quantity: z.number().min(0.01),
      subTotal: z.number(),
    })
  ).min(1, "Debe seleccionar al menos un producto"),
  total: z.number().min(0),
});

export const createPublicOrder = async (input: z.infer<typeof createPublicOrderSchema>) => {
  try {
    const validatedInput = createPublicOrderSchema.parse(input);
    const { businessId, client, items, total } = validatedInput;

    const result = await db.$transaction(async (tx) => {
      // 1. Usar DNI como ID para validar o crear cliente local a este ámbito
      const existingClient = await tx.client.findUnique({
        where: { id: client.dni },
      });

      let dbClient;
      if (existingClient) {
        dbClient = await tx.client.update({
          where: { id: client.dni },
          data: {
            name: client.name,
            cellPhone: client.phone || existingClient.cellPhone,
            email: client.email || existingClient.email,
            address: client.address || existingClient.address,
            last_update: new Date(),
          },
        });
      } else {
        dbClient = await tx.client.create({
          data: {
            id: client.dni,
            businessId,
            name: client.name,
            cellPhone: client.phone || null,
            email: client.email || null,
            address: client.address || null,
            // Balance NO se incrementa hasta que sea confirmado
            balance: 0,
            date: new Date(),
            last_update: new Date(),
          },
        });
      }

      // 2. Create Order (Stock is NOT decreased yet because it's 'pendiente')
      const newOrder = await tx.order.create({
        data: {
          clientId: dbClient.id,
          businessId,
          total,
          status: "pendiente",
          paidStatus: "inpago",
          date: new Date(),
          items: {
            create: items.map((item) => ({
              productId: item.productId,
              code: item.code,
              description: item.description,
              costPrice: item.price,
              price: item.price,
              quantity: item.quantity,
              subTotal: item.subTotal,
              addedAt: new Date(),
            })),
          },
        },
        include: { items: true },
      });

      return newOrder;
    });

    await pusherServer.trigger(`orders-${businessId}`, "orders-update", {});

    return { success: true, orderId: result.id };
  } catch (error) {
    console.error("Error creating public order:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Error al crear el pedido",
    };
  }
};
