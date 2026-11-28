"use server";

import { db } from "@/lib/db";
import { auth } from "@/auth";
import { pusherServer } from "@/lib/pusher-server";
import { revalidateTag } from "next/cache";
import { CACHE_TAGS } from "@/lib/cache-tags";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { consumeAuthorizedFiscalSnapshotGrant } from "@/lib/server/fiscal-snapshot-grant";
import { consumeAuthorizedArcaQrGrant, getTenantIssuerCuit } from "@/lib/server/authorized-arca-qr-grant";
import { logQrTelemetry } from "@/lib/server/qr-telemetry";
interface UpdateCaeInput {
  CAE: {
    CAE: string;
    vencimiento: string;
    nroComprobante: number | string;
    qrData?: unknown;
    requestDate?: unknown;
    qrUrl?: unknown;
    ptoVenta?: number | string;
    qrAttestationToken?: unknown;
    fiscalSnapshotToken?: string;
  };
  IVACondition: string;
  documentType?: "" | "CUIT" | "DNI";
  documentNumber?: string | number;
  paidMethod: string;
  billType?: string;
}

export const updateOrderCaeAction = async (
  orderId: string,
  data: UpdateCaeInput
) => {
  const parsed = z.object({
    CAE: z.object({
      CAE: z.string(),
      vencimiento: z.string(),
      nroComprobante: z.union([z.string(), z.number()]),
      ptoVenta: z.union([z.string(), z.number()]).optional(),
      qrAttestationToken: z.unknown().optional(),
      fiscalSnapshotToken: z.string().length(64).optional(),
    }).passthrough(),
    IVACondition: z.string(),
    documentType: z.enum(["", "CUIT", "DNI"]).optional(),
    documentNumber: z.union([z.string(), z.number()]).optional(),
    paidMethod: z.string(),
    billType: z.string().optional(),
  }).safeParse(data);
  if (!parsed.success) return { error: "Datos de facturación inválidos" };
  const normalizedDocumentNumber = parsed.data.documentNumber === undefined || String(parsed.data.documentNumber).trim() === ""
    ? null : String(parsed.data.documentNumber);
  const documentRequired = parsed.data.IVACondition.trim().toLowerCase() !== "consumidor final" &&
    parsed.data.IVACondition.trim().toLowerCase() !== "consumidor_final";
  if (documentRequired && normalizedDocumentNumber === null) {
    return { error: "El número de documento es obligatorio para esta condición de IVA" };
  }
  const session = await auth();
  const businessId = session?.user?.businessId;
  if (!businessId) return { error: "No autorizado" };

  try {
    const referencePersisted = await db.$transaction(async (tx) => {
      let fiscalSnapshot: Prisma.InputJsonValue | undefined;
      const existingOrder = await tx.order.findFirst({
        where: { id: orderId, businessId },
        select: { total: true, fiscalSnapshot: true },
      });
      if (!existingOrder) throw new Error("Orden no encontrada");
      if (existingOrder.fiscalSnapshot !== null) throw new Error("El comprobante fiscal autorizado no puede reemplazarse");
      if (parsed.data.CAE.fiscalSnapshotToken) {
        const billType = parsed.data.billType;
        const invoiceNumber = Number(parsed.data.CAE.nroComprobante);
        const pointOfSale = Number(parsed.data.CAE.ptoVenta);
        if ((billType !== "Factura A" && billType !== "Factura B" && billType !== "Factura C")
          || !Number.isSafeInteger(invoiceNumber) || invoiceNumber <= 0
          || !Number.isSafeInteger(pointOfSale) || pointOfSale <= 0) {
          throw new Error("Los datos de autorización fiscal no coinciden con la venta");
        }
        const trustedSnapshot = await consumeAuthorizedFiscalSnapshotGrant(tx, {
          token: parsed.data.CAE.fiscalSnapshotToken,
          businessId,
          cae: parsed.data.CAE.CAE,
          billType,
          invoiceNumber,
          pointOfSale,
          total: existingOrder.total,
        });
        if (!trustedSnapshot) throw new Error("La autorización fiscal no coincide con la venta");
        fiscalSnapshot = JSON.parse(JSON.stringify(trustedSnapshot)) as Prisma.InputJsonValue;
      }
      let qrGrantId: string | undefined;
      const qrToken = parsed.data.CAE.qrAttestationToken;
      if (typeof qrToken === "string" && qrToken) {
        const issuerCuit = await getTenantIssuerCuit(tx, businessId);
        const billType = parsed.data.billType;
        const invoiceNumber = Number(parsed.data.CAE.nroComprobante);
        const pointOfSale = Number(parsed.data.CAE.ptoVenta);
        const afipVoucherType = billType === "Factura A" ? 1 : billType === "Factura B" ? 6 : billType === "Factura C" ? 11 : undefined;
        if (issuerCuit !== null && afipVoucherType && Number.isSafeInteger(invoiceNumber) && invoiceNumber > 0
          && Number.isSafeInteger(pointOfSale) && pointOfSale > 0) {
          const grant = await consumeAuthorizedArcaQrGrant(tx, qrToken, {
            businessId,
            cae: parsed.data.CAE.CAE,
            billType,
            afipVoucherType,
            invoiceNumber,
            pointOfSale,
            fiscalAmount: existingOrder.total.toFixed(2),
            ...(issuerCuit === undefined ? {} : { issuerCuit }),
            recipientIvaCondition: parsed.data.IVACondition,
            recipientDocumentType: parsed.data.documentType === "CUIT" || parsed.data.documentType === "DNI"
              ? parsed.data.documentType : null,
            recipientDocumentNumber: normalizedDocumentNumber,
          });
          qrGrantId = grant?.id;
        } else {
          logQrTelemetry({ stage: "save-consume-ref", outcome: "rejected", reason: "binding-mismatch" });
        }
      } else {
        logQrTelemetry({
          stage: "save-consume-ref",
          outcome: "rejected",
          reason: qrToken === undefined || qrToken === "" ? "token-absent" : "binding-mismatch",
        });
      }
      await tx.order.update({
        where: { id: orderId, businessId },
        data: {
          CAE: {
            CAE: parsed.data.CAE.CAE,
            vencimiento: parsed.data.CAE.vencimiento,
            nroComprobante: parsed.data.CAE.nroComprobante,
            ...(parsed.data.CAE.ptoVenta === undefined ? {} : { ptoVenta: parsed.data.CAE.ptoVenta }),
            ...(qrGrantId ? { qrAttestationId: qrGrantId } : {}),
          },
          qrDataPolicyVersion: 1,
          billType: parsed.data.billType,
          afipVoucherType: parsed.data.billType === "Factura A" ? 1 : parsed.data.billType === "Factura B" ? 6 : parsed.data.billType === "Factura C" ? 11 : undefined,
          invoiceNumber: Number(parsed.data.CAE.nroComprobante),
          invoicePointOfSale: parsed.data.CAE.ptoVenta === undefined ? undefined : Number(parsed.data.CAE.ptoVenta),
          clientIvaCondition: parsed.data.IVACondition,
          clientDocumentType: parsed.data.documentType || null,
          clientDocumentNumber: normalizedDocumentNumber,
          paymentMethod: parsed.data.paidMethod,
          ...(fiscalSnapshot ? { fiscalSnapshot } : {}),
        },
      });
      if (qrGrantId) {
        const grantLink = tx.authorizedArcaQrGrant?.updateMany;
        if (typeof grantLink === "function") {
          const linked = await grantLink.call(tx.authorizedArcaQrGrant, {
            where: { id: qrGrantId, orderId: null },
            data: { orderId },
          });
          if (linked.count !== 1) throw new Error("QR grant association failed");
        }
      }
      return Boolean(qrGrantId);
    });

    if (referencePersisted) {
      logQrTelemetry({ stage: "save-consume-ref", outcome: "reference-persisted" });
    }

    await pusherServer.trigger(
      `orders-${businessId}`,
      "orders-update",
      {}
    );

    revalidateTag(CACHE_TAGS.SALES, "max");
    revalidateTag(CACHE_TAGS.ORDERS, "max");
    return { success: true };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return { error: "Orden no encontrada" };
    }
    console.error("Error updating sale CAE:", error);
    return { error: "Error al actualizar CAE de la venta" };
  }
};

export const deleteOrderAction = async (orderId: string) => {
  const session = await auth();
  const businessId = session?.user?.businessId;
  if (!businessId) return { error: "No autorizado" };

  try {
    const order = await db.order.findFirst({
      where: { id: orderId, businessId },
      include: { items: true },
    });

    if (!order) return { error: "Orden no encontrada" };

    await db.$transaction(async (tx) => {
      // Restore stock for each item
      for (const item of order.items) {
        if (item.productId) {
          await tx.product.update({
            where: { id: item.productId },
            data: { amount: { increment: item.quantity }, last_update: new Date() },
          });
        }
      }

      // Delete the order (cascades to items, movements, etc.)
      await tx.order.delete({
        where: { id: orderId },
      });
    });

    await pusherServer.trigger(
      `orders-${businessId}`,
      "orders-update",
      {}
    );

    revalidateTag(CACHE_TAGS.SALES, "max");
    revalidateTag(CACHE_TAGS.ORDERS, "max");
    revalidateTag(CACHE_TAGS.STOCK, "max");
    revalidateTag(CACHE_TAGS.CASHBOX, "max");
    return { success: true };
  } catch (error) {
    console.error("Error deleting sale:", error);
    return { error: "Error al eliminar la venta" };
  }
};
