"use server";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { CACHE_TAGS } from "@/lib/cache-tags";
import { clientFormSchema, deleteClientSchema, updateClientSchema } from "@/schemas";
import { Prisma } from "@prisma/client";
import { revalidatePath, revalidateTag } from "next/cache";
import { z } from "zod";

export interface ClientListItem {
  id: string; name: string; address: string | null; cellPhone: string | null;
  cuit: string | null; ivaCondition: string | null; email: string | null;
  balance: number; date: Date; last_update: Date;
}

export interface ClientActionResult<T = undefined> {
  success: boolean; data?: T; client?: ClientListItem; error?: string;
  code?: "UNAUTHORIZED" | "FORBIDDEN" | "VALIDATION" | "NOT_FOUND" | "CONFLICT" | "DATABASE";
}

const clientSelect = {
  id: true, name: true, address: true, cellPhone: true, cuit: true,
  ivaCondition: true, email: true, balance: true, date: true, last_update: true,
} as const;

const unauthorized = (): ClientActionResult => ({ success: false, error: "No autorizado", code: "UNAUTHORIZED" });
const validationError = (error: z.ZodError): ClientActionResult => ({ success: false, error: error.issues[0]?.message ?? "Datos inválidos", code: "VALIDATION" });
const refreshClients = () => { revalidateTag(CACHE_TAGS.CLIENTS, "max"); revalidatePath("/clients"); };
const editableFields = ["name", "address", "cellPhone", "cuit", "ivaCondition", "email"] as const;
function editableInput(input: unknown): unknown {
  if (typeof input !== "object" || input === null) return input;
  const source = input as Record<string, unknown>;
  return Object.fromEntries(editableFields.filter((field) => field in source).map((field) => [field, source[field]]));
}

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

export async function createClient(input: unknown): Promise<ClientActionResult<ClientListItem>> {
  const id = await businessId();
  if (!id) return unauthorized() as unknown as ClientActionResult<ClientListItem>;
  const parsed = clientFormSchema.safeParse(editableInput(input));
  if (!parsed.success) return validationError(parsed.error) as unknown as ClientActionResult<ClientListItem>;
  try {
    const client = await db.client.create({ data: { ...parsed.data, businessId: id, balance: 0 }, select: clientSelect });
    refreshClients();
    return { success: true, data: client, client, };
  } catch (error) { console.error("Error creating client", error); return databaseError() as unknown as ClientActionResult<ClientListItem>; }
}

export async function updateClient(input: unknown): Promise<ClientActionResult<ClientListItem>> {
  const id = await businessId();
  if (!id) return unauthorized() as unknown as ClientActionResult<ClientListItem>;
  const sanitized = editableInput(input);
  const parsed = updateClientSchema.safeParse({ ...(typeof sanitized === "object" && sanitized !== null ? sanitized : {}), id: typeof input === "object" && input !== null ? (input as Record<string, unknown>).id : undefined });
  if (!parsed.success) return validationError(parsed.error) as unknown as ClientActionResult<ClientListItem>;
  const { id: clientId, ...data } = parsed.data;
  try {
    const client = await db.client.update({
      where: { id: clientId, businessId: id },
      data: { ...data, last_update: new Date() }, select: clientSelect,
    });
    refreshClients();
    return { success: true, data: client, client };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") return { success: false, error: "Cliente no encontrado", code: "NOT_FOUND" };
    console.error("Error updating client", error); return databaseError() as unknown as ClientActionResult<ClientListItem>;
  }
}

export async function deleteClient(input: unknown): Promise<ClientActionResult> {
  const id = await businessId();
  if (!id) return unauthorized();
  const parsed = deleteClientSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);
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
  if (!clientId || !Number.isFinite(amountToAdd)) return { success: false, error: "Datos de saldo inválidos", code: "VALIDATION" };
  try {
    const client = await db.client.findUnique({ where: { id: clientId, businessId: id } });
    if (!client || client.businessId !== id) return { success: false, error: "Cliente no encontrado", code: "NOT_FOUND" };
    await db.client.update({ where: { id: clientId, businessId: id }, data: { balance: { increment: amountToAdd }, last_update: new Date() } });
    refreshClients();
    return { success: true };
  } catch (error) { console.error("Error updating client balance", error); return databaseError(); }
}
