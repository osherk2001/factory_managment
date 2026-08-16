import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";

import { env } from "@/lib/env";
import { logger as applicationLogger } from "@/lib/logging/logger";

import { authenticateCredentials } from "./modules/auth/authenticate";
import { authConfig } from "./auth.config";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  secret: env.AUTH_SECRET,
  logger: {
    error(error) {
      if (error.name === "CredentialsSignin") {
        return;
      }

      applicationLogger.error(
        { event: "authjs_error", errorName: error.name },
        "Auth.js error",
      );
    },
    warn(code) {
      applicationLogger.warn(
        { event: "authjs_warning", code },
        "Auth.js warning",
      );
    },
    debug(message, metadata) {
      applicationLogger.debug({ event: "authjs_debug", metadata }, message);
    },
  },
  providers: [
    Credentials({
      credentials: {
        username: {
          label: "Username",
          type: "text",
        },
        password: {
          label: "Password",
          type: "password",
        },
      },
      async authorize(credentials) {
        return authenticateCredentials(credentials);
      },
    }),
  ],
  callbacks: {
    ...authConfig.callbacks,
    jwt({ token, user }) {
      if (user) {
        token.userId = user.id;
        token.username = user.username ?? null;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id =
          (typeof token.userId === "string" ? token.userId : undefined) ??
          token.sub ??
          "";
        session.user.username =
          typeof token.username === "string" ? token.username : null;
      }
      return session;
    },
  },
});
