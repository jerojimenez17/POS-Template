"use server";

import { RegisterSchema } from "@/schemas";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { getUserByEmail } from "@/data/user";
import { generateVerificationToken } from "@/lib/tokens";
import { sendVerificationEmail } from "@/lib/mail";
export const register = async (values: z.infer<typeof RegisterSchema>) => {
  const validateFields = RegisterSchema.safeParse(values);
  if (!validateFields.success) {
    return { error: "Campos Invalidos" };
  }
  const { email, password, registerName, businessName } = validateFields.data;
  const hashedPassword = await bcrypt.hash(password, 10);

  const existingUser = await getUserByEmail(email);
  if (existingUser) {
    return { error: "Este usuario ya existe" };
  }

  // Create generated slug from business name
  const slug = businessName
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "") + "-" + Date.now().toString().slice(-4);

  try {
     // Transaction to ensure both Business and User are created or neither
    await db.$transaction(async (tx) => {
      // 1. Create Business
      const business = await tx.business.create({
        data: {
          name: businessName,
          slug: slug,
        },
      });

      // 2. Create User linked to Business as ADMIN
      await tx.user.create({
        data: {
          name: registerName,
          email,
          password: hashedPassword,
          role: "ADMIN",
          businessId: business.id,
        },
      });
    });

    const verificationToken = await generateVerificationToken(email);
    await sendVerificationEmail(verificationToken.email, verificationToken.token);

    return { success: "Email enviado a " + verificationToken.email };
  } catch (error) {
    console.error("Registration error:", error);
    return { error: "Error al crear la cuenta" };
  }
};
