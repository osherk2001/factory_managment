import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface User {
    username?: string | null;
    sessionVersion?: number;
  }

  interface Session {
    user: {
      id: string;
      username: string | null;
      sessionVersion?: number;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    sessionVersion?: number;
    userId?: string;
    username?: string | null;
  }
}
