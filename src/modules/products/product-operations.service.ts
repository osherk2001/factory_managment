import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/client";
import { requirePermission } from "@/modules/authorization";
import { ApplicationError } from "@/shared/errors";
const base = {
  productId: z.string().uuid(),
  expectedVersion: z.number().int().min(0),
  idempotencyKey: z.string().min(1).max(255),
};
const schema = z.discriminatedUnion("operation", [
  z.object({
    ...base,
    operation: z.literal("update"),
    isUrgent: z.boolean(),
    targetAt: z.iso.datetime({ offset: true }).nullable(),
  }),
  z.object({
    ...base,
    operation: z.literal("transfer"),
    locationId: z.string().uuid(),
    reason: z.string().trim().min(1).max(5000),
  }),
]);
export async function updateProductOperations(input: unknown) {
  const parsed = schema.safeParse(input);
  if (!parsed.success)
    throw new ApplicationError("INVALID_INPUT", "Invalid product operation");
  const command = parsed.data;
  const context = await requirePermission(
    command.operation === "transfer" ? "locations.transfer" : "products.update",
  );
  const { idempotencyKey, ...payload } = command;
  const requestHash = createHash("sha256")
    .update(JSON.stringify(payload))
    .digest("hex");
  const operation = "products.operations." + command.operation;
  const key = {
    organizationId: context.organizationId,
    userId: context.userId,
    key: idempotencyKey,
  };
  const replay = async () => {
    const existing = await prisma.idempotencyKey.findUnique({
      where: { organizationId_userId_key: key },
      select: { operation: true, requestHash: true, resultReference: true },
    });
    if (!existing) return null;
    if (
      existing.operation !== operation ||
      existing.requestHash !== requestHash
    )
      throw new ApplicationError("CONFLICT", "Idempotency conflict");
    return { productId: existing.resultReference! };
  };
  const previous = await replay();
  if (previous) return previous;
  try {
    return await prisma.$transaction(async (database) => {
      await database.idempotencyKey.create({
        data: {
          ...key,
          actorMembershipId: context.membershipId,
          operation,
          requestHash,
        },
      });
      const product = await database.product.findFirst({
        where: {
          id: command.productId,
          organizationId: context.organizationId,
        },
        select: {
          id: true,
          version: true,
          status: true,
          isUrgent: true,
          targetAt: true,
          currentWorkerId: true,
          currentRoleId: true,
          currentLocationId: true,
          currentStageId: true,
        },
      });
      if (!product)
        throw new ApplicationError("NOT_FOUND", "Product unavailable");
      if (
        product.version !== command.expectedVersion ||
        product.status === "TRASHED"
      )
        throw new ApplicationError("CONFLICT", "Product changed");
      if (command.operation === "transfer") {
        if (
          !["CREATED", "READY_FOR_HANDOFF"].includes(product.status) ||
          product.currentWorkerId ||
          product.currentRoleId
        )
          throw new ApplicationError(
            "CONFLICT",
            "Finish work before moving to a location",
          );
        const location = await database.location.findFirst({
          where: {
            id: command.locationId,
            organizationId: context.organizationId,
            isActive: true,
          },
          select: { id: true },
        });
        if (!location)
          throw new ApplicationError("NOT_FOUND", "Location unavailable");
      }
      const changed = await database.product.updateMany({
        where: {
          id: product.id,
          organizationId: context.organizationId,
          version: command.expectedVersion,
        },
        data: {
          version: { increment: 1 },
          ...(command.operation === "update"
            ? {
                isUrgent: command.isUrgent,
                targetAt: command.targetAt ? new Date(command.targetAt) : null,
              }
            : { currentLocationId: command.locationId }),
        },
      });
      if (changed.count !== 1)
        throw new ApplicationError("CONFLICT", "Product changed");
      if (command.operation === "transfer") {
        if (
          await database.productAssignment.count({
            where: {
              organizationId: context.organizationId,
              productId: product.id,
              endedAt: null,
            },
          })
        )
          throw new ApplicationError("CONFLICT", "Active assignment exists");
        await database.productTransition.create({
          data: {
            organizationId: context.organizationId,
            productId: product.id,
            actorUserId: context.userId,
            actorMembershipId: context.membershipId,
            eventType: "MANUAL_TRANSFER",
            fromStatus: product.status,
            toStatus: product.status,
            fromLocationId: product.currentLocationId,
            toLocationId: command.locationId,
            fromStageId: product.currentStageId,
            toStageId: product.currentStageId,
            reason: command.reason,
          },
        });
      }
      await database.auditLog.create({
        data: {
          organizationId: context.organizationId,
          actorUserId: context.userId,
          actorMembershipId: context.membershipId,
          action:
            command.operation === "update"
              ? "product.updated"
              : "product.location_transferred",
          targetType: "Product",
          targetId: product.id,
          beforeData: {
            isUrgent: product.isUrgent,
            targetAt: product.targetAt?.toISOString() ?? null,
            locationId: product.currentLocationId,
          },
          afterData: payload,
        },
      });
      await database.idempotencyKey.update({
        where: { organizationId_userId_key: key },
        data: {
          resultReference: product.id,
          resultData: { productId: product.id },
        },
      });
      return { productId: product.id };
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const result = await replay();
      if (result) return result;
    }
    throw error;
  }
}
