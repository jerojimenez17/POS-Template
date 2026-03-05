"use server";

import * as z from "zod";
import { db } from "@/lib/db";
import { auth } from "../../../auth";
import { BusinessUserSchema } from "@/schemas";
import bcrypt from "bcryptjs";

export const getBusinessUsers = async () => {
  const session = await auth();

  if (!session || !session.user || !session.user.businessId) {
    return { error: "No autorizado" };
  }

  try {
    const users = await db.user.findMany({
      where: {
        businessId: session.user.businessId,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
      },
      orderBy: {
        name: "asc", 
      }
    });

    return { success: "Usuarios obtenidos", data: users };
  } catch (error) {
    console.error("Error fetching users:", error);
    return { error: "Error interno del servidor" };
  }
};

export const createBusinessUser = async (values: z.infer<typeof BusinessUserSchema>) => {
  const session = await auth();

  // Only SUPER_ADMIN or ADMIN can create users
  if (!session || !session.user || !session.user.businessId || session.user.role === "USER") {
    return { error: "No autorizado" };
  }

  const validateFields = BusinessUserSchema.safeParse(values);

  if (!validateFields.success) {
    return { error: "Datos inválidos" };
  }

  const { name, email, password, role } = validateFields.data;

  // Verify email is not in use
  const existingUser = await db.user.findUnique({ where: { email } });
  if (existingUser) {
    return { error: "Este email ya está en uso" };
  }

  // Hash password
  const hashedPassword = password ? await bcrypt.hash(password, 10) : undefined;

  try {
    const user = await db.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        role,
        businessId: session.user.businessId,
      },
    });

    return { success: "Vendedor creado con éxito!", data: user };
  } catch (error) {
    console.error("Error creating user:", error);
    return { error: "No se pudo crear el vendedor" };
  }
};

export const updateBusinessUser = async (id: string, values: z.infer<typeof BusinessUserSchema>) => {
  const session = await auth();

  if (!session || !session.user || !session.user.businessId || session.user.role === "USER") {
    return { error: "No autorizado" };
  }

  const validateFields = BusinessUserSchema.safeParse(values);

  if (!validateFields.success) {
    return { error: "Datos inválidos" };
  }

  const { name, email, password, role } = validateFields.data;

  // Verify user belongs to same business
  const existingUser = await db.user.findUnique({ where: { id } });
  if (!existingUser || existingUser.businessId !== session.user.businessId) {
    return { error: "Usuario no encontrado" };
  }

  if (email !== existingUser.email) {
      const emailExists = await db.user.findUnique({ where: { email } });
      if (emailExists) {
          return { error: "Este email ya está en uso" };
      }
  }

  // Hash password if provided
  const hashedPassword = password ? await bcrypt.hash(password, 10) : existingUser.password;

  try {
    const user = await db.user.update({
      where: { id },
      data: {
        name,
        email,
        password: hashedPassword,
        role,
      },
    });

    return { success: "Usuario actualizado", data: user };
  } catch (error) {
    console.error("Error updating user:", error);
    return { error: "No se pudo actualizar el usuario" };
  }
};

export const deleteBusinessUser = async (id: string) => {
  const session = await auth();

  if (!session || !session.user || !session.user.businessId || session.user.role === "USER") {
    return { error: "No autorizado" };
  }

  // Don't allow self-deletion via this action
  if (id === session.user.id) {
    return { error: "No puedes eliminarte a ti mismo" };
  }

  const existingUser = await db.user.findUnique({ where: { id } });
  if (!existingUser || existingUser.businessId !== session.user.businessId) {
    return { error: "Usuario no encontrado" };
  }

  try {
    await db.user.delete({
      where: { id },
    });

    return { success: "Usuario eliminado" };
  } catch (error) {
    console.error("Error deleting user:", error);
    return { error: "No se pudo eliminar el usuario" };
  }
};
