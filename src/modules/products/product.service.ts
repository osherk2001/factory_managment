import { createHash } from "node:crypto";

import { Prisma, ProductStatus } from "@prisma/client";
import { z } from "zod";

import { prisma } from "@/lib/db/client";
import { logger } from "@/lib/logging/logger";
import { tenantWhere } from "@/modules/authorization/tenant-scope";
import { requirePermission } from "@/modules/authorization/permission.service";
import type { TenantContext } from "@/modules/authorization/authorization.types";

import { BARCODE_GENERATION_ATTEMPTS, generateBarcodeValue } from "./barcode";
import {
  isProductCreationError,
  ProductCreationError,
  PRODUCT_ERROR_CODES,
} from "./product-errors";
import { allocateProductSerial } from "./serial-number";
import type { CreatedProductDto, CreateProductInput } from "./product-types";

const PRODUCT_CREATE_OPERATION = "products.create";

const createProductInputSchema = z
  .object({
    productionOrderId: z.string().uuid().nullable().optional(),
    productTypeId: z.string().uuid().nullable().optional(),
    isUrgent: z.boolean().default(false),
    targetAt: z.preprocess(
      (value) => (value === "" ? null : value),
      z.coerce.date().nullable().optional(),
    ),
    idempotencyKey: z.string().trim().min(1).max(255),
  })
  .strict();

type ParsedCreateProductInput = z.infer<typeof createProductInputSchema>;
type TransactionClient = Prisma.TransactionClient;
type ProductReadDatabase = Pick<typeof prisma, "product"> | TransactionClient;

function normalizeInput(input: ParsedCreateProductInput) {
  return {
    productionOrderId: input.productionOrderId ?? null,
    productTypeId: input.productTypeId ?? null,
    isUrgent: input.isUrgent,
    targetAt: input.targetAt?.toISOString() ?? null,
  };
}

export function hashCreateProductRequest(
  input: ParsedCreateProductInput,
): string {
  return createHash("sha256")
    .update(JSON.stringify(normalizeInput(input)))
    .digest("hex");
}

function isUniqueConstraintError(
  error: unknown,
): error is Prisma.PrismaClientKnownRequestError {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

function hasUniqueTarget(error: unknown, expected: readonly string[]): boolean {
  if (!isUniqueConstraintError(error)) {
    return false;
  }

  const target = error.meta?.target;
  const fields = Array.isArray(target)
    ? target.map(String)
    : typeof target === "string"
      ? [target]
      : [];

  return expected.every((field) =>
    fields.some((targetField) => targetField.includes(field)),
  );
}

function productCreationFailure(
  error: unknown,
  context: { userId: string; organizationId: string },
): ProductCreationError {
  if (isProductCreationError(error)) {
    logger.warn(
      {
        event: "product_creation_failed",
        code: error.code,
        userId: context.userId,
        organizationId: context.organizationId,
      },
      "Product creation failed",
    );
    return error;
  }

  logger.error(
    {
      event: "product_creation_failed",
      code: PRODUCT_ERROR_CODES.PRODUCT_CREATION_FAILED,
      userId: context.userId,
      organizationId: context.organizationId,
    },
    "Product creation failed",
  );
  return new ProductCreationError(PRODUCT_ERROR_CODES.PRODUCT_CREATION_FAILED);
}

async function readProductDto(
  database: ProductReadDatabase,
  context: TenantContext,
  productId: string,
): Promise<CreatedProductDto> {
  const product = await database.product.findFirst({
    where: tenantWhere(context, { id: productId }),
    select: {
      id: true,
      serialNumber: true,
      status: true,
      barcode: { select: { value: true } },
      productionOrderId: true,
      productTypeId: true,
      isUrgent: true,
      targetAt: true,
      createdAt: true,
    },
  });

  if (
    !product ||
    product.status !== ProductStatus.CREATED ||
    !product.barcode
  ) {
    throw new ProductCreationError(PRODUCT_ERROR_CODES.PRODUCT_CREATION_FAILED);
  }

  return {
    id: product.id,
    serialNumber: product.serialNumber,
    status: ProductStatus.CREATED,
    barcode: product.barcode.value,
    productionOrderId: product.productionOrderId,
    productTypeId: product.productTypeId,
    isUrgent: product.isUrgent,
    targetAt: product.targetAt?.toISOString() ?? null,
    createdAt: product.createdAt.toISOString(),
  };
}

async function findReplay(
  context: TenantContext,
  input: ParsedCreateProductInput,
  requestHash: string,
): Promise<CreatedProductDto | null> {
  const existing = await prisma.idempotencyKey.findUnique({
    where: {
      organizationId_userId_key: {
        organizationId: context.organizationId,
        userId: context.userId,
        key: input.idempotencyKey,
      },
    },
    select: {
      operation: true,
      requestHash: true,
      resultReference: true,
    },
  });

  if (!existing) {
    return null;
  }

  if (
    existing.operation !== PRODUCT_CREATE_OPERATION ||
    existing.requestHash !== requestHash
  ) {
    throw new ProductCreationError(PRODUCT_ERROR_CODES.IDEMPOTENCY_CONFLICT);
  }

  if (!existing.resultReference) {
    throw new ProductCreationError(PRODUCT_ERROR_CODES.PRODUCT_CREATION_FAILED);
  }

  logger.info(
    {
      event: "idempotency_replay",
      userId: context.userId,
      organizationId: context.organizationId,
      productId: existing.resultReference,
    },
    "Returning idempotent Product creation result",
  );

  return readProductDto(prisma, context, existing.resultReference);
}

async function createProductTransaction(
  context: TenantContext,
  input: ParsedCreateProductInput,
  requestHash: string,
): Promise<CreatedProductDto> {
  return prisma.$transaction(async (database) => {
    await database.idempotencyKey.create({
      data: {
        organizationId: context.organizationId,
        userId: context.userId,
        actorMembershipId: context.membershipId,
        key: input.idempotencyKey,
        operation: PRODUCT_CREATE_OPERATION,
        requestHash,
      },
    });

    if (input.productionOrderId) {
      const order = await database.productionOrder.findFirst({
        where: {
          id: input.productionOrderId,
          organizationId: context.organizationId,
        },
        select: { id: true },
      });

      if (!order) {
        throw new ProductCreationError(
          PRODUCT_ERROR_CODES.PRODUCT_ORDER_NOT_FOUND,
        );
      }
    }

    if (input.productTypeId) {
      const productType = await database.productType.findFirst({
        where: {
          id: input.productTypeId,
          organizationId: context.organizationId,
        },
        select: { id: true, isActive: true },
      });

      if (!productType) {
        throw new ProductCreationError(
          PRODUCT_ERROR_CODES.PRODUCT_TYPE_NOT_FOUND,
        );
      }

      if (!productType.isActive) {
        throw new ProductCreationError(
          PRODUCT_ERROR_CODES.PRODUCT_TYPE_INACTIVE,
        );
      }
    }

    const serial = await allocateProductSerial(
      database,
      context.organizationId,
    );
    const product = await database.product.create({
      data: {
        organizationId: context.organizationId,
        productionOrderId: input.productionOrderId ?? null,
        productTypeId: input.productTypeId ?? null,
        serialNumber: serial.serialNumber,
        status: ProductStatus.CREATED,
        currentWorkerId: null,
        currentRoleId: null,
        currentLocationId: null,
        currentStageId: null,
        isUrgent: input.isUrgent,
        targetAt: input.targetAt ?? null,
        completedAt: null,
        cancelledAt: null,
        trashedAt: null,
        version: 0,
      },
      select: { id: true, createdAt: true },
    });

    const barcodeValue = generateBarcodeValue();
    await database.barcode.create({
      data: {
        organizationId: context.organizationId,
        productId: product.id,
        value: barcodeValue,
      },
    });

    await database.productTransition.create({
      data: {
        organizationId: context.organizationId,
        productId: product.id,
        actorUserId: context.userId,
        actorMembershipId: context.membershipId,
        eventType: "PRODUCT_CREATED",
        fromStatus: null,
        toStatus: ProductStatus.CREATED,
        fromWorkerId: null,
        toWorkerId: null,
        fromRoleId: null,
        toRoleId: null,
        fromLocationId: null,
        toLocationId: null,
        fromStageId: null,
        toStageId: null,
        occurredAt: product.createdAt,
      },
    });

    await database.auditLog.create({
      data: {
        organizationId: context.organizationId,
        actorUserId: context.userId,
        actorMembershipId: context.membershipId,
        action: "product.created",
        targetType: "Product",
        targetId: product.id,
        afterData: {
          serialNumber: serial.serialNumber,
          status: ProductStatus.CREATED,
          barcode: barcodeValue,
          productionOrderId: input.productionOrderId ?? null,
          productTypeId: input.productTypeId ?? null,
          isUrgent: input.isUrgent,
          targetAt: input.targetAt?.toISOString() ?? null,
        },
      },
    });

    const result = await readProductDto(database, context, product.id);
    await database.idempotencyKey.updateMany({
      where: {
        organizationId: context.organizationId,
        userId: context.userId,
        key: input.idempotencyKey,
        operation: PRODUCT_CREATE_OPERATION,
      },
      data: { resultReference: product.id },
    });

    return result;
  });
}

export async function createProduct(
  input: CreateProductInput,
): Promise<CreatedProductDto> {
  const context = await requirePermission("products.create");
  const parsed = createProductInputSchema.safeParse(input);

  if (!parsed.success) {
    throw new ProductCreationError(PRODUCT_ERROR_CODES.INVALID_PRODUCT_INPUT);
  }

  const requestHash = hashCreateProductRequest(parsed.data);
  logger.info(
    {
      event: "product_creation_started",
      userId: context.userId,
      organizationId: context.organizationId,
    },
    "Product creation started",
  );

  for (let attempt = 0; attempt < BARCODE_GENERATION_ATTEMPTS; attempt += 1) {
    try {
      const result = await createProductTransaction(
        context,
        parsed.data,
        requestHash,
      );
      logger.info(
        {
          event: "product_created",
          userId: context.userId,
          organizationId: context.organizationId,
          productId: result.id,
        },
        "Product created",
      );
      return result;
    } catch (error) {
      if (hasUniqueTarget(error, ["organizationId", "userId", "key"])) {
        const replay = await findReplay(context, parsed.data, requestHash);
        if (replay) {
          return replay;
        }
        continue;
      }

      if (hasUniqueTarget(error, ["value"])) {
        if (attempt + 1 < BARCODE_GENERATION_ATTEMPTS) {
          continue;
        }

        throw productCreationFailure(
          new ProductCreationError(
            PRODUCT_ERROR_CODES.BARCODE_GENERATION_FAILED,
          ),
          context,
        );
      }

      throw productCreationFailure(error, context);
    }
  }

  throw productCreationFailure(
    new ProductCreationError(PRODUCT_ERROR_CODES.PRODUCT_CREATION_FAILED),
    context,
  );
}
