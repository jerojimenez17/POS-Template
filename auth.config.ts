import Google from "next-auth/providers/google";
import Facebook from "next-auth/providers/facebook";
import Github from "next-auth/providers/github";
import { type NextAuthConfig } from "next-auth";

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
  ],
} satisfies NextAuthConfig;
