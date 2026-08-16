import "server-only";

import { z } from "zod";

import { prisma } from "@/lib/db/client";
import { logger } from "@/lib/logging/logger";

import { passwordSchema, verifyPassword } from "./password";

export const credentialsSchema = z.object({
  username: z.string().trim().min(1).max(100),
  password: passwordSchema,
});

export type AuthenticatedCredentialsUser = {
  id: string;
  username: string;
};

export async function authenticateCredentials(
  credentials: unknown,
): Promise<AuthenticatedCredentialsUser | null> {
  const parsedCredentials = credentialsSchema.safeParse(credentials);
  const username = parsedCredentials.success
    ? parsedCredentials.data.username
    : undefined;

  if (!parsedCredentials.success) {
    logger.warn({ event: "login_failed" }, "Login failed");
    return null;
  }

  const user = await prisma.user.findUnique({
    where: { username: parsedCredentials.data.username },
    select: {
      id: true,
      username: true,
      passwordHash: true,
      isActive: true,
    },
  });

  const passwordMatches = await verifyPassword(
    parsedCredentials.data.password,
    user?.passwordHash ?? null,
  );
  const valid =
    user?.username !== null &&
    user?.isActive === true &&
    user?.passwordHash !== null &&
    passwordMatches;

  if (!valid || !user?.username) {
    logger.warn({ event: "login_failed", username }, "Login failed");
    return null;
  }

  logger.info({ event: "login_succeeded", userId: user.id }, "Login succeeded");

  return { id: user.id, username: user.username };
}
