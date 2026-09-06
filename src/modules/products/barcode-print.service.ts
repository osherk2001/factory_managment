import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/client";
import { requirePermission } from "@/modules/authorization";
import { ApplicationError } from "@/shared/errors";

const schema = z.object({
  productId: z.string().uuid(),
  reprint: z.boolean(),
  idempotencyKey: z.string().min(1).max(255),
});
const resultSchema = z.object({
  barcode: z.string(),
  serialNumber: z.string(),
});
export async function prepareBarcodePrint(input: unknown) {
  const parsed = schema.safeParse(input);
  if (!parsed.success)
    throw new ApplicationError("INVALID_INPUT", "Invalid print request");
  const command = parsed.data;
  const operation = command.reprint ? "barcodes.reprint" : "barcodes.print";
  const context = await requirePermission(operation);
  const requestHash = createHash("sha256")
    .update(
      JSON.stringify({
        productId: command.productId,
        reprint: command.reprint,
      }),
    )
    .digest("hex");
  const key = {
    organizationId: context.organizationId,
    userId: context.userId,
    key: command.idempotencyKey,
  };
  const replay = async () => {
    const row = await prisma.idempotencyKey.findUnique({
      where: { organizationId_userId_key: key },
    });
    if (!row) return null;
    if (row.operation !== operation || row.requestHash !== requestHash)
      throw new ApplicationError("CONFLICT", "Idempotency conflict");
    return resultSchema.parse(row.resultData);
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
      await database.$queryRaw`SELECT "id" FROM "Barcode" WHERE "organizationId" = ${context.organizationId}::uuid AND "productId" = ${command.productId}::uuid FOR UPDATE`;
      const barcode = await database.barcode.findFirst({
        where: {
          organizationId: context.organizationId,
          productId: command.productId,
        },
        select: {
          id: true,
          value: true,
          lastPrintedAt: true,
          product: { select: { serialNumber: true } },
        },
      });
      if (!barcode)
        throw new ApplicationError("NOT_FOUND", "Barcode unavailable");
      if (Boolean(barcode.lastPrintedAt) !== command.reprint)
        throw new ApplicationError("CONFLICT", "Print state changed");
      const printedAt = new Date();
      await database.barcode.updateMany({
        where: { id: barcode.id, organizationId: context.organizationId },
        data: { lastPrintedAt: printedAt },
      });
      await database.auditLog.create({
        data: {
          organizationId: context.organizationId,
          actorUserId: context.userId,
          actorMembershipId: context.membershipId,
          action: command.reprint
            ? "barcode.reprint_requested"
            : "barcode.print_requested",
          targetType: "Barcode",
          targetId: barcode.id,
          afterData: {
            productId: command.productId,
            printedAt: printedAt.toISOString(),
            symbology: "QR_CODE",
          },
        },
      });
      const result = {
        barcode: barcode.value,
        serialNumber: barcode.product.serialNumber,
      };
      await database.idempotencyKey.update({
        where: { organizationId_userId_key: key },
        data: { resultData: result, resultReference: barcode.id },
      });
      return result;
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
