import "server-only";

import { auth } from "@/auth";
import { prisma } from "@/lib/db/client";
import { logger } from "@/lib/logging/logger";

import { AUTH_ERROR_CODES, FactoryFlowAuthError } from "../auth/auth-errors";
import type { AuthenticatedUserContext } from "./authorization.types";

async function findUserContextById(
  userId: string,
): Promise<AuthenticatedUserContext | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      username: true,
      isActive: true,
      isSystemAdmin: true,
    },
  });

  if (!user || !user.isActive) {
    return null;
  }

  return {
    userId: user.id,
    username: user.username,
    isActive: true,
    isSystemAdmin: user.isSystemAdmin,
  };
}

export async function getCurrentUser(): Promise<AuthenticatedUserContext | null> {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    return null;
  }

  return findUserContextById(userId);
}

export async function getUserContextById(
  userId: string,
): Promise<AuthenticatedUserContext | null> {
  return findUserContextById(userId);
}

export async function requireAuthenticatedUser(): Promise<AuthenticatedUserContext> {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    logger.warn(
      { event: "authorization_denied", reason: "UNAUTHENTICATED" },
      "Authentication required",
    );
    throw new FactoryFlowAuthError(AUTH_ERROR_CODES.UNAUTHENTICATED);
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      username: true,
      isActive: true,
      isSystemAdmin: true,
    },
  });

  if (!user) {
    logger.warn(
      { event: "authorization_denied", reason: "UNAUTHENTICATED" },
      "Authenticated user no longer exists",
    );
    throw new FactoryFlowAuthError(AUTH_ERROR_CODES.UNAUTHENTICATED);
  }

  if (!user.isActive) {
    logger.warn(
      {
        event: "authorization_denied",
        reason: "USER_INACTIVE",
        userId: user.id,
      },
      "Inactive user rejected",
    );
    throw new FactoryFlowAuthError(AUTH_ERROR_CODES.USER_INACTIVE);
  }

  return {
    userId: user.id,
    username: user.username,
    isActive: true,
    isSystemAdmin: user.isSystemAdmin,
  };
}

export async function requireSystemAdmin(): Promise<AuthenticatedUserContext> {
  const user = await requireAuthenticatedUser();

  if (!user.isSystemAdmin) {
    logger.warn(
      {
        event: "authorization_denied",
        reason: "SYSTEM_ADMIN_REQUIRED",
        userId: user.userId,
      },
      "System Admin authorization denied",
    );
    throw new FactoryFlowAuthError(AUTH_ERROR_CODES.SYSTEM_ADMIN_REQUIRED);
  }

  return user;
}
