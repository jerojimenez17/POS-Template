import { LoginSchema } from "@/schemas";
import bcrypt from "bcryptjs";
import { getUserByEmail } from "@/data/user";
import CredentialsProvider from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import Facebook from "next-auth/providers/facebook";
import Github from "next-auth/providers/github";
import AuthError from "next-auth";
import type { NextAuthConfig } from "next-auth";

export default {
  providers: [
    Facebook,
    Github({
      clientId: process.env.NEXT_PUBLIC_GITHUB_CLIENT_ID || "",
      clientSecret: process.env.NEXT_PUBLIC_GITHUB_CLIENT_SECRET || "",
    }),
    Google({
      clientId: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || "",
      clientSecret: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_SECRET || "",
    }),
    CredentialsProvider({
      async authorize(credentials) {
        try {
          const validateFields = LoginSchema.safeParse(credentials);
          if (validateFields.success) {
            const { email, password } = validateFields.data;
            const user = await getUserByEmail(email);
            if (!user || !user.password) return null;

            const passwordsMatch = await bcrypt.compare(
              password,
              user.password
            );
            if (passwordsMatch) {
              return user;
            }
          }
          throw new Error("User not found");
        } catch (error) {
          if (error instanceof AuthError) {
          }
          throw error;
        }
      },
    }),
  ],
} satisfies NextAuthConfig;
