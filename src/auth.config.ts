import type { NextAuthConfig } from "next-auth";

export const authConfig = {
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60,
  },
  callbacks: {
    authorized({ auth }) {
      return Boolean(auth?.user?.id);
    },
  },
} satisfies Omit<NextAuthConfig, "providers">;
