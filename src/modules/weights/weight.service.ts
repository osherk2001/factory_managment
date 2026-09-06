import "server-only";

import { createHash } from "node:crypto";

import { Prisma, WeightEventType } from "@prisma/client";
import { z } from "zod";

import { prisma } from "@/lib/db/client";
import { logger } from "@/lib/logging/logger";
import { requirePermission } from "@/modules/authorization";
import type { TenantContext } from "@/modules/authorization";

import { WeightError, WEIGHT_ERROR_CODES } from "./weight-errors";
import type {
  CorrectWeightInput,
  RecordWeightInput,
  WeightEventDto,
  WeightSummaryDto,
} from "./weight-types";

const decimalPattern = /^-?\d{1,7}(?:\.\d{1,3})?$/;
const baseInput = z.object({
  productId: z.string().uuid(),
  grams: z.string().trim().regex(decimalPattern),
  note: z.string().trim().max(5000).nullable().optional(),
  occurredAt: z.iso.datetime({ offset: true }).nullable().optional(),
  idempotencyKey: z.string().trim().min(1).max(255),
});
const recordSchema = baseInput.extend({
  type: z.enum(["EXPECTED", "ISSUED", "FINAL", "RETURNED", "APPROVED_LOSS"]),
});
const correctionSchema = baseInput.extend({
  correctsWeightEventId: z.string().uuid(),
  note: z.string().trim().min(1).max(5000),
});

const eventSelect = {
  id: true,
  productId: true,
  type: true,
  grams: true,
  note: true,
  occurredAt: true,
  createdAt: true,
  employeeId: true,
  productionRoleId: true,
  locationId: true,
  correctsWeightEventId: true,
  correctsWeightEvent: { select: { type: true } },
} satisfies Prisma.WeightEventSelect;

type WeightRecord = Prisma.WeightEventGetPayload<{ select: typeof eventSelect }>;

function hashInput(input: unknown): string {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}

function parseDecimal(value: string, allowNegative = false): Prisma.Decimal {
  const parsed = new Prisma.Decimal(value);
  if (!parsed.isFinite() || (allowNegative ? parsed.isZero() : parsed.lte(0))) {
    throw new WeightError(WEIGHT_ERROR_CODES.INVALID_INPUT);
  }
  return parsed;
}

function formatDecimal(value: Prisma.Decimal): string {
  return value.toFixed(3);
}

function toDto(event: WeightRecord): WeightEventDto {
  return {
    id: event.id,
    productId: event.productId,
    type: event.type,
    grams: event.grams.toFixed(3),
    note: event.note,
    occurredAt: event.occurredAt.toISOString(),
    createdAt: event.createdAt.toISOString(),
    employeeId: event.employeeId,
    productionRoleId: event.productionRoleId,
    locationId: event.locationId,
    correctsWeightEventId: event.correctsWeightEventId,
  };
}

function isUniqueError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

async function replayWeight(
  context: TenantContext,
  key: string,
  operation: string,
  requestHash: string,
): Promise<WeightEventDto | null> {
  const existing = await prisma.idempotencyKey.findUnique({
    where: { organizationId_userId_key: { organizationId: context.organizationId, userId: context.userId, key } },
    select: { operation: true, requestHash: true, resultReference: true, resultData: true },
  });
  if (!existing) return null;
  if (existing.operation !== operation || existing.requestHash !== requestHash) {
    throw new WeightError(WEIGHT_ERROR_CODES.IDEMPOTENCY_CONFLICT);
  }
  const result = z.object({ id: z.string().uuid() }).passthrough().safeParse(existing.resultData);
  if (!result.success || result.data.id !== existing.resultReference) {
    throw new WeightError(WEIGHT_ERROR_CODES.FAILED);
  }
  return result.data as WeightEventDto;
}

async function createWeightEvent(
  context: TenantContext,
  input: {
    productId: string;
    type: WeightEventType;
    grams: Prisma.Decimal;
    note: string | null;
    occurredAt: Date;
    correctsWeightEventId: string | null;
    idempotencyKey: string;
    operation: string;
    requestHash: string;
  },
): Promise<WeightEventDto> {
  const replay = await replayWeight(context, input.idempotencyKey, input.operation, input.requestHash);
  if (replay) return replay;

  try {
    return await prisma.$transaction(async (database) => {
      await database.idempotencyKey.create({
        data: {
          organizationId: context.organizationId,
          userId: context.userId,
          actorMembershipId: context.membershipId,
          key: input.idempotencyKey,
          operation: input.operation,
          requestHash: input.requestHash,
        },
      });

      await database.$queryRaw`SELECT "id" FROM "Product" WHERE "organizationId" = ${context.organizationId}::uuid AND "id" = ${input.productId}::uuid FOR UPDATE`;
      const product = await database.product.findFirst({
        where: { id: input.productId, organizationId: context.organizationId },
        select: { id: true, currentWorkerId: true, currentRoleId: true, currentLocationId: true },
      });
      if (!product) throw new WeightError(WEIGHT_ERROR_CODES.PRODUCT_NOT_FOUND);
      let attribution = { employeeId: product.currentWorkerId, productionRoleId: product.currentRoleId, locationId: product.currentLocationId };

      if (input.correctsWeightEventId) {
        const target = await database.weightEvent.findFirst({
          where: {
            id: input.correctsWeightEventId,
            organizationId: context.organizationId,
            productId: input.productId,
            type: { not: WeightEventType.CORRECTION },
          },
          select: { id: true, employeeId: true, productionRoleId: true, locationId: true },
        });
        if (!target) throw new WeightError(WEIGHT_ERROR_CODES.CORRECTION_TARGET_INVALID);
        attribution = { employeeId: target.employeeId, productionRoleId: target.productionRoleId, locationId: target.locationId };
      }

      const event = await database.weightEvent.create({
        data: {
          organizationId: context.organizationId,
          productId: product.id,
          recordedByUserId: context.userId,
          recordedByMembershipId: context.membershipId,
          ...attribution,
          type: input.type,
          grams: input.grams,
          note: input.note,
          occurredAt: input.occurredAt,
          correctsWeightEventId: input.correctsWeightEventId,
        },
        select: eventSelect,
      });
      const result = toDto(event);

      await database.auditLog.create({
        data: {
          organizationId: context.organizationId,
          actorUserId: context.userId,
          actorMembershipId: context.membershipId,
          action: input.type === WeightEventType.CORRECTION ? "weight.corrected" : "weight.recorded",
          targetType: "WeightEvent",
          targetId: event.id,
          afterData: {
            productId: event.productId,
            type: event.type,
            grams: event.grams.toFixed(3),
            correctsWeightEventId: event.correctsWeightEventId,
          },
        },
      });
      await database.idempotencyKey.updateMany({
        where: { organizationId: context.organizationId, userId: context.userId, key: input.idempotencyKey },
        data: { resultReference: event.id, resultData: result },
      });
      return result;
    });
  } catch (error) {
    if (isUniqueError(error)) {
      const replay = await replayWeight(context, input.idempotencyKey, input.operation, input.requestHash);
      if (replay) return replay;
    }
    if (error instanceof WeightError) throw error;
    logger.error({ event: "weight_write_failed", organizationId: context.organizationId, productId: input.productId }, "Weight operation failed");
    throw new WeightError(WEIGHT_ERROR_CODES.FAILED);
  }
}

export async function recordWeightEvent(input: RecordWeightInput): Promise<WeightEventDto> {
  const parsed = recordSchema.safeParse(input);
  if (!parsed.success) throw new WeightError(WEIGHT_ERROR_CODES.INVALID_INPUT);
  const context = await requirePermission("weights.create");
  const grams = parseDecimal(parsed.data.grams);
  const normalized = {
    productId: parsed.data.productId,
    type: parsed.data.type,
    grams: grams.toFixed(3),
    note: parsed.data.note?.trim() || null,
    occurredAt: parsed.data.occurredAt ?? null,
  };
  return createWeightEvent(context, {
    productId: normalized.productId,
    type: normalized.type,
    grams,
    note: normalized.note,
    occurredAt: normalized.occurredAt ? new Date(normalized.occurredAt) : new Date(),
    correctsWeightEventId: null,
    idempotencyKey: parsed.data.idempotencyKey,
    operation: "weights.create",
    requestHash: hashInput(normalized),
  });
}

export async function correctWeightEvent(input: CorrectWeightInput): Promise<WeightEventDto> {
  const parsed = correctionSchema.safeParse(input);
  if (!parsed.success) throw new WeightError(WEIGHT_ERROR_CODES.INVALID_INPUT);
  const context = await requirePermission("weights.correct");
  const grams = parseDecimal(parsed.data.grams, true);
  const normalized = {
    productId: parsed.data.productId,
    correctsWeightEventId: parsed.data.correctsWeightEventId,
    grams: grams.toFixed(3),
    note: parsed.data.note.trim(),
    occurredAt: parsed.data.occurredAt ?? null,
  };
  return createWeightEvent(context, {
    productId: normalized.productId,
    type: WeightEventType.CORRECTION,
    grams,
    note: normalized.note,
    occurredAt: normalized.occurredAt ? new Date(normalized.occurredAt) : new Date(),
    correctsWeightEventId: normalized.correctsWeightEventId,
    idempotencyKey: parsed.data.idempotencyKey,
    operation: "weights.correct",
    requestHash: hashInput(normalized),
  });
}

export async function listProductWeightEvents(productId: string): Promise<WeightEventDto[]> {
  const context = await requirePermission("weights.read");
  const parsed = z.string().uuid().safeParse(productId);
  if (!parsed.success) throw new WeightError(WEIGHT_ERROR_CODES.PRODUCT_NOT_FOUND);
  const events = await prisma.weightEvent.findMany({
    where: { organizationId: context.organizationId, productId: parsed.data },
    orderBy: [{ occurredAt: "asc" }, { createdAt: "asc" }],
    select: eventSelect,
  });
  return events.map(toDto);
}

export function summarizeWeightEvents(events: readonly WeightEventDto[]): WeightSummaryDto {
  const totals: Record<Exclude<WeightEventType, "CORRECTION">, Prisma.Decimal> = {
    EXPECTED: new Prisma.Decimal(0),
    ISSUED: new Prisma.Decimal(0),
    FINAL: new Prisma.Decimal(0),
    RETURNED: new Prisma.Decimal(0),
    APPROVED_LOSS: new Prisma.Decimal(0),
  };
  const byId = new Map(events.map((event) => [event.id, event]));
  let correction = new Prisma.Decimal(0);
  for (const event of events) {
    const amount = new Prisma.Decimal(event.grams);
    if (event.type === WeightEventType.CORRECTION) {
      correction = correction.plus(amount);
      const target = event.correctsWeightEventId ? byId.get(event.correctsWeightEventId) : null;
      if (target && target.type !== WeightEventType.CORRECTION) totals[target.type] = totals[target.type].plus(amount);
    } else {
      totals[event.type] = totals[event.type].plus(amount);
    }
  }
  const expectedVariance = totals.ISSUED.minus(totals.EXPECTED);
  const materialVariance = totals.ISSUED.minus(totals.RETURNED).minus(totals.FINAL).minus(totals.APPROVED_LOSS);
  return {
    expected: formatDecimal(totals.EXPECTED),
    issued: formatDecimal(totals.ISSUED),
    final: formatDecimal(totals.FINAL),
    returned: formatDecimal(totals.RETURNED),
    approvedLoss: formatDecimal(totals.APPROVED_LOSS),
    correction: formatDecimal(correction),
    expectedVariance: formatDecimal(expectedVariance),
    materialVariance: formatDecimal(materialVariance),
  };
}

export async function getProductWeightHistory(productId: string): Promise<{ events: WeightEventDto[]; summary: WeightSummaryDto }> {
  const events = await listProductWeightEvents(productId);
  return { events, summary: summarizeWeightEvents(events) };
}

export async function getProductWeightHistoryForTenant(
  context: TenantContext,
  productId: string,
): Promise<{ events: WeightEventDto[]; summary: WeightSummaryDto }> {
  const parsed = z.string().uuid().safeParse(productId);
  if (!parsed.success) throw new WeightError(WEIGHT_ERROR_CODES.PRODUCT_NOT_FOUND);
  const events = await prisma.weightEvent.findMany({
    where: { organizationId: context.organizationId, productId: parsed.data },
    orderBy: [{ occurredAt: "asc" }, { createdAt: "asc" }],
    select: eventSelect,
  });
  const dto = events.map(toDto);
  return { events: dto, summary: summarizeWeightEvents(dto) };
}
