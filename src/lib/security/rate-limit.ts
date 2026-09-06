import "server-only";
import { createHash } from "node:crypto";
import { prisma } from "@/lib/db/client";
import { logger } from "@/lib/logging/logger";
import { ApplicationError } from "@/shared/errors";
export class RateLimitError extends ApplicationError {
  constructor() { super("RATE_LIMITED", "Request limit exceeded"); this.name = "RateLimitError"; }
}
export async function consumeRateLimit(scope: string, key: string, limit: number, windowMs: number, organizationId: string | null = null, now = new Date()): Promise<void> {
  const windowStartedAt = new Date(Math.floor(now.getTime() / windowMs) * windowMs);
  const expiresAt = new Date(windowStartedAt.getTime() + windowMs);
  const keyHash = createHash("sha256").update(key).digest("hex");
  const rows = await prisma.$queryRaw<{ count: number }[]>`
    INSERT INTO "RateLimitBucket" ("scope", "keyHash", "windowStartedAt", "count", "expiresAt", "organizationId")
    VALUES (${scope}, ${keyHash}, ${windowStartedAt}, 1, ${expiresAt}, ${organizationId}::uuid)
    ON CONFLICT ("scope", "keyHash", "windowStartedAt")
    DO UPDATE SET "count" = "RateLimitBucket"."count" + 1
    WHERE "RateLimitBucket"."count" < ${limit}
    RETURNING "count"`;
  if (!rows.length) {
    logger.warn({ event: "rate_limit_exceeded", scope, organizationId }, "Request rate exceeded");
    throw new RateLimitError();
  }
}
export async function limitProductionRequest(context: { organizationId: string; userId: string }) {
  await consumeRateLimit("production", context.organizationId + ":" + context.userId, 120, 60000, context.organizationId);
}

