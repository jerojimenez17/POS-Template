"use server";

import { db } from "@/lib/db";
import { auth } from "../../auth";
import { revalidateTag } from "next/cache";
import { CACHE_TAGS } from "@/lib/cache-tags";
import path from "path";
import fs from "fs";


export async function seedDebtsFromExcel(filePath?: string, customBusinessId?: string) {
  try {
    const session = await auth();
    const businessId = customBusinessId || session?.user?.businessId;

    if (!businessId) {
      return { success: false, error: "No autorizado. Business ID requerido." };
    }

    const defaultPath = path.join(process.cwd(), "public", "ficheroTiendaLibre (1).xlsx");
    const targetPath = filePath || defaultPath;

    if (!fs.existsSync(targetPath)) {
      return { success: false, error: `Archivo no encontrado en la ruta: ${targetPath}` };
    }

    const fileBuffer = fs.readFileSync(targetPath);
    const xlsx = await import("xlsx");
    const workbook = xlsx.read(fileBuffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];

    // Read without header to access by column index (A, B, C)
    const data: unknown[][] = xlsx.utils.sheet_to_json(sheet, { header: 1 });

    let processed = 0;

    await db.$transaction(async (tx) => {
      // Ensure "Traspaso" product exists
      let traspasoProduct = await tx.product.findFirst({
        where: { businessId, description: { equals: "Traspaso", mode: "insensitive" } },
      });

      if (!traspasoProduct) {
        traspasoProduct = await tx.product.create({
          data: {
            description: "Traspaso",
            code: "TRASPASO",
            price: 0,
            salePrice: 0,
            amount: 1000000, // virtually infinite stock for this logic
            businessId,
          },
        });
      }

      for (let i = 1; i < data.length; i++) {
        const row = data[i];
        if (!row || row.length === 0) continue;

        const clientName = row[0]; // Columna A
        const debtRaw = row[1]; // Columna B
        const dateRaw = row[2]; // Columna C

        if (!clientName || !debtRaw) continue;

        const debtAmount = typeof debtRaw === "number" ? debtRaw : parseFloat(String(debtRaw).replace(/,/g, ""));
        
        // SEED1: ignore rows with total debt equal to 0 (or negative/NaN depending on the logic)
        if (isNaN(debtAmount) || debtAmount <= 0) continue;

        // Parse date (Excel date could be a serial number or a string)
        let orderDate = new Date();
        if (dateRaw) {
          if (typeof dateRaw === "number") {
             // Excel date serial number
             const excelEpoch = new Date(Date.UTC(1899, 11, 30));
             orderDate = new Date(excelEpoch.getTime() + dateRaw * 86400000);
          } else if (typeof dateRaw === "string") {
             const parsedDate = new Date(dateRaw);
             if (!isNaN(parsedDate.getTime())) {
                orderDate = parsedDate;
             }
          }
        }

        // Encontrar o crear cliente
        let client = await tx.client.findFirst({
          where: { name: { equals: String(clientName).trim(), mode: "insensitive" }, businessId },
        });

        if (!client) {
          client = await tx.client.create({
            data: {
              name: String(clientName).trim(),
              balance: 0,
              businessId,
            },
          });
        }

        // Crear la orden
        const order = await tx.order.create({
          data: {
            clientId: client.id,
            businessId,
            total: debtAmount,
            status: "confirmado",
            paidStatus: "inpago",
            date: orderDate,
            items: {
              create: [
                {
                  productId: traspasoProduct.id,
                  code: traspasoProduct.code,
                  description: traspasoProduct.description,
                  price: debtAmount,
                  costPrice: 0,
                  quantity: 1,
                  subTotal: debtAmount,
                  addedAt: new Date(),
                },
              ],
            },
          },
        });

        // Sumar balance del cliente
        await tx.client.update({
          where: { id: client.id },
          data: { balance: { increment: debtAmount } },
        });

        // Crear movimiento de stock para restar la unidad vendida
        await tx.stockMovement.create({
          data: {
            type: "SALE",
            quantity: -1,
            productId: traspasoProduct.id,
            orderId: order.id,
            businessId,
            reason: `Traspaso deuda #${order.id}`,
          },
        });

        const month = orderDate.getMonth() + 1;
        const year = orderDate.getFullYear();

        await tx.productRanking.upsert({
          where: {
            productId_month_year_businessId: {
              productId: traspasoProduct.id,
              month,
              year,
              businessId,
            },
          },
          update: {
            totalSold: { increment: 1 },
            totalIncome: { increment: debtAmount },
          },
          create: {
            productId: traspasoProduct.id,
            month,
            year,
            businessId,
            totalSold: 1,
            totalIncome: debtAmount,
          },
        });

        processed++;
      }
    }, { maxWait: 10000, timeout: 600000 });

    revalidateTag(CACHE_TAGS.ORDERS, "max");
    revalidateTag(CACHE_TAGS.CLIENTS, "max");
    revalidateTag(CACHE_TAGS.ORDERS, "max");

    return { success: true, processed, message: `Se procesaron ${processed} cuentas exitosamente.` };
  } catch (error) {
    console.error("Error seeding debts:", error);
    return { success: false, error: error instanceof Error ? error.message : "Error desconocido." };
  }
}
