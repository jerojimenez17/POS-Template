"use server";

import { LoginSchema } from "@/schemas";
import { redirect } from "next/navigation";
import { z } from "zod";
import { signIn } from "../../../auth";
import { DEFAULT_LOGIN_REDIRECT } from "../../../routes";
import { getUserByEmail } from "@/data/user";
import { AuthError } from "next-auth";

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

  if (existingUser.emailVerified) { // email not verified yet
    return {
      error: "Por favor, verifica tu email antes de iniciar sesión",
    };
  }

  try {
    await signIn("credentials", {
      email,
      password,
      redirect: false,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      switch (error.type) {
        case "CredentialsSignin":
          return { error: "Email o contraseña incorrectos" };
        default:
          return { error: "Ocurrió un error al iniciar sesión" };
      }
    }
    throw error; // Re-lanzar errores inesperados
  }

  redirect(callbackUrl || DEFAULT_LOGIN_REDIRECT);
};
