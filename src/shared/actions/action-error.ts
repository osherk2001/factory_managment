import "server-only";
import { Prisma } from "@prisma/client";
import { logger } from "@/lib/logging/logger";
import { ApplicationError } from "@/shared/errors";
import type { ActionState } from "./action-state";

export function actionError(error: unknown): ActionState {
  if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2002", "P2034"].includes(error.code)) return { errorCode: "CONFLICT", success: false };
  if (error instanceof ApplicationError) return { errorCode: error.code, success: false };
  logger.error({ event: "action_failed", errorName: error instanceof Error ? error.name : "Unknown" }, "Unexpected action failure");
  return { errorCode: "UNEXPECTED", success: false };
}
