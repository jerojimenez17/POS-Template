"use server";

import { LoginSchema } from "@/schemas";
import { redirect } from "next/navigation";
import { z } from "zod";
import { signIn } from "../../../auth";
import { DEFAULT_LOGIN_REDIRECT } from "../../../routes";
import { getUserByEmail } from "@/data/user";
// import { getVerificationTokenByEmail } from "../../../data/verification-token";

export const login = async (values: z.infer<typeof LoginSchema>) => {
  const validateFields = LoginSchema.safeParse(values);
  if (!validateFields.success) {
    return { error: "Campos invalidos" };
  }
  const { email, password } = validateFields.data;
  const existingUser = await getUserByEmail(email);
  if (!existingUser || !existingUser.password || !existingUser.email) {
    return { error: "Email no existe" };
  }
  if (!existingUser.emailVerified) {
    // const verificationToken = await getVerificationTokenByEmail(email);
  }
  let resp = false;
  try {
    await signIn("credentials", {
      email,
      password,
      redirect: false,
    }).then(() => {
      resp = true;
    });
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
  } catch (err) {
    return { error: "Contraseña incorrecta" };
  }
  if (resp) {
    redirect(DEFAULT_LOGIN_REDIRECT);
  }
};
