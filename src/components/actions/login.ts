"use server";

import { LoginSchema } from "@/schemas";
import { z } from "zod";
import { signIn } from "../../../auth";
import { DEFAULT_LOGIN_REDIRECT } from "../../../routes";
import { getUserByEmail } from "@/data/user";
import { AuthError } from "next-auth";
import bcrypt from "bcryptjs";

export const login = async (
  values: z.infer<typeof LoginSchema>,
  callbackUrl?: string | null
) => {
  const validateFields = LoginSchema.safeParse(values);

  if (!validateFields.success) {
    return { error: "Campos inválidos" };
  }

  const { email, password } = validateFields.data;

  const existingUser = await getUserByEmail(email);

  if (!existingUser || !existingUser.password || !existingUser.email) {
    return { error: "Email o contraseña incorrectos" };
  }

  const passwordsMatch = await bcrypt.compare(password, existingUser.password);
  if (!passwordsMatch) {
    return { error: "Email o contraseña incorrectos" };
  }

  try {
    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });

    // signIn returns the redirect URL on both success and failure.
    // If it includes "error", the authentication failed (e.g. user not found,
    // JWT callback rejected, or adapter error).
    if (typeof result === "string" && (
      result.includes("error") || result.includes("/auth/error")
    )) {
      console.error("signIn failed, redirect URL:", result);
      return { error: "Error al iniciar sesión. Verificá tus credenciales." };
    }
  } catch (error) {
    if (error instanceof AuthError) {
      console.error("AuthError:", error.type, error.message);
      return { error: "Error al iniciar sesión. Verificá tus credenciales." };
    }
    throw error;
  }

  return { success: true, redirectTo: callbackUrl || DEFAULT_LOGIN_REDIRECT };
};
