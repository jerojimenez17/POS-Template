/* eslint-disable @typescript-eslint/no-unused-vars */
import NextAuth from "next-auth";
import authConfig from "./auth.config";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { db } from "@/lib/db";
import { getUserById, getUserByEmail } from "./data/user";
import { UserRole } from "@prisma/client";
import CredentialsProvider from "next-auth/providers/credentials";
import { LoginSchema } from "@/schemas";
import bcrypt from "bcryptjs";

export const { handlers, auth, signIn, signOut } = NextAuth({
  pages: {
    signIn: "/auth/login",
    error: "/auth/error",
  },
  events: {
    async linkAccount({ user }) {
      await db.user.update({
        where: { id: user.id },
        data: { emailVerified: new Date() },
      });
    },
  },
  callbacks: {
    // async signIn({ user }) {
    //   if (user.id) {
    //     const existingUser = await getUserById(user.id);
    //     if (!existingUser || !existingUser.emailVerified) {
    //       return false;
    //     }
    //   }
    //   return true;
    // },
    async signIn({ user, account }) {
      if (account?.provider !== "credentials") return true;
      if (account.provider === "credentials" && user.id) {
        const existingUser = await getUserById(user.id);
        if (!existingUser?.emailVerified) return true;
      }
      return true;
    },
    async session({ token, session }) {
      if (token.sub && session.user) {
        session.user.id = token.sub;
      }
      if (token.role && session.user) {
        session.user.role = token.role as UserRole;
      }
      if (session.user) {
        session.user.businessId = token.businessId as string | null;
        session.user.businessName = token.businessName as string | null;
      }
      return session;
    },
    async jwt({ token }) {
      if (!token.sub) return token;
      const existingUser = await getUserById(token.sub);
      if (!existingUser) return token;
      token.role = existingUser.role;
      token.businessId = existingUser.businessId;
      token.businessName = existingUser.business?.name || null;
      console.log({ token });
      return token;
    },
  },
  adapter: PrismaAdapter(db),
  session: { strategy: "jwt" },
  ...authConfig,
  providers: [
    ...authConfig.providers,
    CredentialsProvider({
      async authorize(credentials) {
        const validateFields = LoginSchema.safeParse(credentials);
        if (validateFields.success) {
          const { email, password } = validateFields.data;
          const user = await getUserByEmail(email);
          if (!user || !user.password) return null;

          const passwordsMatch = await bcrypt.compare(password, user.password);
          if (passwordsMatch) {
            return user;
          }
        }
        return null;
      },
    }),
  ],
});
