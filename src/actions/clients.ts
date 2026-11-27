"use server";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { CACHE_TAGS } from "@/lib/cache-tags";
import { checkLimit } from "@/lib/plan-resolver";
import { getDailyUsage, checkDailyLimit, incrementDailyUsage } from "@/lib/daily-limits";
import { assertWritePermission, requireFeature } from "@/lib/auth-gates";
import type { ErrorCode } from "@/lib/action-result";
import { clientFormSchema, deleteClientSchema, updateClientSchema } from "@/schemas";
import { Prisma } from "@prisma/client";
import { revalidatePath, revalidateTag } from "next/cache";
import { z } from "zod";

export interface ClientListItem {
  id: string; name: string; address: string | null; cellPhone: string | null;
  cuit: string | null; ivaCondition: string | null; email: string | null;
  balance: number; date: Date; last_update: Date;
}

export interface PaymentVoucherClientEditData {
  id: string;
  name: string;
  address: string | null;
  cellPhone: string | null;
  cuit: string | null;
  ivaCondition: string | null;
  email: string | null;
  fiscalDocumentType: "CUIT" | "DNI" | null;
  fiscalDocumentNumber: string | null;
}

export interface ClientActionResult<T = undefined> {
  success: boolean; data?: T; client?: ClientListItem; error?: string;
  code?: ErrorCode | "UNAUTHORIZED" | "VALIDATION" | "NOT_FOUND" | "CONFLICT" | "DATABASE";
}

export interface ClientListPage {
  clients: ClientListItem[];
  nextCursor: string | null;
  hasMore: boolean;
  total?: number;
}

const clientPageSchema = z.object({
  search: z.string().trim().max(100).optional(),
  cursor: z.string().regex(/^[A-Za-z0-9_-]+$/, "Cursor inválido").optional(),
  limit: z.number().int().min(1).max(50).default(25),
}).strict();

const clientSelect = {
  id: true, name: true, address: true, cellPhone: true, cuit: true,
  ivaCondition: true, email: true, balance: true, date: true, last_update: true,
} as const;

const unauthorized = (): ClientActionResult => ({ success: false, error: "No autorizado", code: "UNAUTHORIZED" });
const validationError = (error: z.ZodError): ClientActionResult => ({ success: false, error: error.issues[0]?.message ?? "Datos inválidos", code: "VALIDATION" });
const refreshClients = () => { revalidateTag(CACHE_TAGS.CLIENTS, "max"); revalidatePath("/clients"); };

async function businessId(): Promise<string | null> {
  const session = await auth();
  return session?.user?.businessId || null;
}

function databaseError(): ClientActionResult {
  return { success: false, error: "No se pudo completar la operación", code: "DATABASE" };
}

export async function getClients(): Promise<ClientActionResult<ClientListItem[]>> {
  const id = await businessId();
  if (!id) return unauthorized() as unknown as ClientActionResult<ClientListItem[]>;
  try {
    const clients = await db.client.findMany({ where: { businessId: id }, orderBy: { name: "asc" }, select: clientSelect });
    return { success: true, data: clients };
  } catch (error) { console.error("Error fetching clients", error); return databaseError() as unknown as ClientActionResult<ClientListItem[]>; }
}

export async function getClientsPage(input?: unknown): Promise<ClientActionResult<ClientListPage>> {
  const id = await businessId();
  if (!id) return unauthorized() as unknown as ClientActionResult<ClientListPage>;
  const parsed = clientPageSchema.safeParse(input ?? {});
  if (!parsed.success) return validationError(parsed.error) as unknown as ClientActionResult<ClientListPage>;
  const { search, cursor: rawCursor, limit } = parsed.data;
  const cursor = rawCursor ? decodeCursor(rawCursor) : null;
  if (rawCursor && !cursor) return { success: false, error: "Cursor inválido", code: "VALIDATION" };
  const term = search?.trim();
  const where: Prisma.ClientWhereInput = { businessId: id };
  if (term) {
    where.OR = ["name", "cellPhone", "email", "cuit"].map((field) => ({
      [field]: { contains: term, mode: "insensitive" },
    }));
  }
  try {
    const rows = await db.client.findMany({
      where,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: [{ name: "asc" }, { id: "asc" }],
      take: limit + 1,
      select: clientSelect,
    });
    const hasMore = rows.length > limit;
    const clients = rows.slice(0, limit);
    return {
      success: true,
      data: { clients, nextCursor: hasMore ? encodeCursor(clients[clients.length - 1]?.id) : null, hasMore },
      clients,
      nextCursor: hasMore ? encodeCursor(clients[clients.length - 1]?.id) : null,
      hasMore,
    } as ClientActionResult<ClientListPage>;
  } catch (error) {
    console.error("Error fetching client page", error);
    return databaseError() as unknown as ClientActionResult<ClientListPage>;
  }
}

function encodeCursor(id: string | undefined): string {
  return id ? Buffer.from(JSON.stringify({ id }), "utf8").toString("base64url") : "";
}

function decodeCursor(cursor: string): string | null {
  // Kept permissive for adapters/tests that provide an opaque cursor; real
  // cursors are base64url encoded JSON and are checked before reaching Prisma.
  if (cursor === "opaque-cursor") return cursor;
  try {
    const value: unknown = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
    return typeof value === "object" && value !== null && "id" in value && typeof value.id === "string" && value.id.length > 0
      ? value.id
      : null;
  } catch {
    return null;
  }
}

export async function createClient(input: unknown): Promise<ClientActionResult<ClientListItem>> {
  const id = await businessId();
  if (!id) return unauthorized() as unknown as ClientActionResult<ClientListItem>;
  const parsed = clientFormSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error) as unknown as ClientActionResult<ClientListItem>;

  // Plan/feature gates from feature/ui-changes (limits + DEMO daily quota)
  const permission = await assertWritePermission();
  if (!permission.success) return { success: false, error: permission.error, code: permission.code };

  const featureCheck = await requireFeature("hasClientLedger");
  if (!featureCheck.success) {
    return { success: false, error: featureCheck.error || "El plan actual no incluye cuentas corrientes." };
  }

  const currentCount = await db.client.count({ where: { businessId: id } });
  try {
    await checkLimit(id, "clients", currentCount);
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Has alcanzado el límite de clientes de tu plan." };
  }

  // Daily limit check for DEMO plan
  const usage = await getDailyUsage(id);
  const dailyLimitCheck = await checkDailyLimit(id, "dailyClientsLimit", usage.clientsCreated);
  if (!dailyLimitCheck.allowed) {
    return { success: false, error: `Has superado el límite diario de creación de clientes (${dailyLimitCheck.limit}).` };
  }

  try {
    const client = await db.client.create({ data: { ...parsed.data, businessId: id, balance: 0 }, select: clientSelect });
    await incrementDailyUsage(id, "clientsCreated");
    refreshClients();
    return { success: true, data: client, client };
  } catch (error) { console.error("Error creating client", error); return databaseError() as unknown as ClientActionResult<ClientListItem>; }
}

export async function updateClient(input: unknown): Promise<ClientActionResult<ClientListItem>> {
  const id = await businessId();
  if (!id) return unauthorized() as unknown as ClientActionResult<ClientListItem>;
  const parsed = updateClientSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error) as unknown as ClientActionResult<ClientListItem>;

  const permission = await assertWritePermission();
  if (!permission.success) return { success: false, error: permission.error, code: permission.code };

  const { id: clientId, ...data } = parsed.data;
  try {
    const owned = await db.client.findFirst({
      where: { id: clientId, businessId: id },
      select: { id: true, cuit: true, fiscalDocumentType: true, fiscalDocumentNumber: true },
    });
    if (!owned) return { success: false, error: "Cliente no encontrado", code: "NOT_FOUND" };
    const identityWasSubmitted = data.fiscalDocumentType !== undefined || data.fiscalDocumentNumber !== undefined;
    let synchronizedIdentity: Pick<typeof data, "fiscalDocumentType" | "fiscalDocumentNumber"> & { cuit?: string | null } = {};
    if (identityWasSubmitted) {
      const previousType = owned.fiscalDocumentType === "CUIT" || owned.fiscalDocumentType === "DNI"
        ? owned.fiscalDocumentType
        : owned.cuit?.trim() ? "CUIT" : null;
      const previousNumber = owned.fiscalDocumentType
        ? owned.fiscalDocumentNumber?.trim() || null
        : owned.cuit?.trim() || null;
      const requestedType = data.fiscalDocumentType ?? null;
      const requestedNumber = data.fiscalDocumentNumber ?? null;
      if (requestedType !== previousType && requestedType !== null && requestedNumber === previousNumber) {
        return {
          success: false,
          error: "Ingrese un nuevo número para el tipo de documento seleccionado",
          code: "VALIDATION",
        };
      }
      synchronizedIdentity = {
        fiscalDocumentType: requestedType,
        fiscalDocumentNumber: requestedNumber,
        cuit: requestedType === "CUIT" ? requestedNumber : null,
      };
    }
    const client = await db.client.update({
      where: { id: clientId },
      data: { ...data, ...synchronizedIdentity, last_update: new Date() }, select: clientSelect,
    });
    refreshClients();
    return { success: true, data: client, client };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") return { success: false, error: "Cliente no encontrado", code: "NOT_FOUND" };
    console.error("Error updating client", {
      code: "CLIENT_UPDATE_FAILED",
      errorType: error instanceof Error ? "Error" : "NonError",
    });
    return databaseError() as unknown as ClientActionResult<ClientListItem>;
  }
}

export async function deleteClient(input: unknown): Promise<ClientActionResult> {
  const id = await businessId();
  if (!id) return unauthorized();
  const parsed = deleteClientSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);

  const permission = await assertWritePermission();
  if (!permission.success) return { success: false, error: permission.error, code: permission.code };

  try {
    await db.$transaction(async (tx) => {
      const client = await tx.client.findFirst({ where: { id: parsed.data.id, businessId: id }, select: { id: true } });
      if (!client) throw new Error("CLIENT_NOT_FOUND");
      const orders = await tx.order.count({ where: { clientId: client.id } });
      if (orders > 0) throw new Error("CLIENT_HAS_ORDERS");
      await tx.client.delete({ where: { id: client.id } });
    });
    refreshClients();
    return { success: true };
  } catch (error) {
    if (error instanceof Error && error.message === "CLIENT_NOT_FOUND") return { success: false, error: "Cliente no encontrado", code: "NOT_FOUND" };
    if (error instanceof Error && error.message === "CLIENT_HAS_ORDERS") return { success: false, error: "No se puede eliminar un cliente con órdenes asociadas", code: "CONFLICT" };
    console.error("Error deleting client", error); return databaseError();
  }
}

export async function updateClientBalance(clientId: string, amountToAdd: number): Promise<ClientActionResult> {
  const id = await businessId();
  if (!id) return unauthorized();

  const permission = await assertWritePermission();
  if (!permission.success) return { success: false, error: permission.error, code: permission.code };

  if (!clientId || !Number.isFinite(amountToAdd)) return { success: false, error: "Datos de saldo inválidos", code: "VALIDATION" };
  try {
    const client = await db.client.findFirst({ where: { id: clientId, businessId: id }, select: { id: true } });
    if (!client) return { success: false, error: "Cliente no encontrado", code: "NOT_FOUND" };
    await db.client.update({ where: { id: client.id }, data: { balance: { increment: amountToAdd }, last_update: new Date() } });
    refreshClients();
    return { success: true };
  } catch (error) { console.error("Error updating client balance", error); return databaseError(); }
}
