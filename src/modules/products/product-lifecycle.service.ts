import "server-only";

import { createHash } from "node:crypto";

import { Prisma, ProductStatus } from "@prisma/client";
import { z } from "zod";

import { prisma } from "@/lib/db/client";
import { hasPermission, requirePermission } from "@/modules/authorization";
import type { TenantContext } from "@/modules/authorization";
import { resolveEmployeeContext } from "@/modules/worker-context/employee-context.service";
import { resolveCurrentProductionHandlingContextInTransaction } from "@/modules/scanning/handling-context.service";
import { lockEmployeeForProductionMutation } from "@/modules/worker-context/production-context-lock";

import {
  isProductLifecycleError,
  PRODUCT_LIFECYCLE_ERROR_CODES,
  ProductLifecycleError,
} from "./product-lifecycle-errors";
import type {
  ProductLifecycleInput,
  ProductLifecycleLocationDto,
  ProductLifecycleOperation,
  ProductLifecycleResultDto,
  ProductLifecycleRoleDto,
  ProductLifecycleStatus,
  ProductLifecycleWorkerDto,
} from "./product-lifecycle-types";

const lifecycleInputSchema = z
  .object({
    productId: z.string().uuid(),
    expectedVersion: z.number().int().nonnegative(),
    idempotencyKey: z.string().trim().min(1).max(255),
  })
  .strict();

const lifecycleStatusSchema = z.enum([
  ProductStatus.CREATED,
  ProductStatus.IN_PROGRESS,
  ProductStatus.READY_FOR_HANDOFF,
  ProductStatus.COMPLETED,
  ProductStatus.CANCELLED,
  ProductStatus.TRASHED,
]);

const lifecycleWorkerSchema = z
  .object({ id: z.string().uuid(), displayName: z.string() })
  .nullable();
const lifecycleRoleSchema = z
  .object({ id: z.string().uuid(), code: z.string(), name: z.string() })
  .nullable();
const lifecycleLocationSchema = z
  .object({
    id: z.string().uuid(),
    code: z.string(),
    name: z.string(),
    departmentId: z.string().uuid().nullable(),
  })
  .nullable();

const storedLifecycleResultSchema = z
  .object({
    productId: z.string().uuid(),
    serialNumber: z.string().min(1),
    status: lifecycleStatusSchema,
    version: z.number().int().nonnegative(),
    currentWorker: lifecycleWorkerSchema,
    currentRole: lifecycleRoleSchema,
    currentLocation: lifecycleLocationSchema,
    completedAt: z.iso.datetime({ offset: true }).nullable(),
    cancelledAt: z.iso.datetime({ offset: true }).nullable(),
    trashedAt: z.iso.datetime({ offset: true }).nullable(),
  })
  .strict();

const lifecycleProductSelect = Prisma.validator<Prisma.ProductSelect>()({
  id: true,
  organizationId: true,
  serialNumber: true,
  status: true,
  version: true,
  currentWorkerId: true,
  currentRoleId: true,
  currentLocationId: true,
  currentStageId: true,
  completedAt: true,
  cancelledAt: true,
  trashedAt: true,
  currentWorker: { select: { id: true, displayName: true } },
  currentRole: { select: { id: true, code: true, name: true } },
  currentLocation: {
    select: { id: true, code: true, name: true, departmentId: true },
  },
});

type LifecycleProduct = Prisma.ProductGetPayload<{
  select: typeof lifecycleProductSelect;
}>;
type LifecycleDatabase = typeof prisma | Prisma.TransactionClient;

type LifecycleMutationContext = {
  tenant: TenantContext;
  input: ParsedLifecycleInput;
  operation: ProductLifecycleOperation;
  requestHash: string;
};

type ParsedLifecycleInput = z.infer<typeof lifecycleInputSchema>;
type LifecycleMutation = (
  database: Prisma.TransactionClient,
) => Promise<ProductLifecycleResultDto>;
type LifecyclePreparation = (
  database: Prisma.TransactionClient,
) => Promise<void>;

function parseLifecycleInput(
  input: ProductLifecycleInput,
): ParsedLifecycleInput {
  const parsed = lifecycleInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new ProductLifecycleError(
      PRODUCT_LIFECYCLE_ERROR_CODES.INVALID_LIFECYCLE_INPUT,
    );
  }

  return parsed.data;
}

function hashLifecycleRequest(
  operation: ProductLifecycleOperation,
  input: ParsedLifecycleInput,
): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        operation,
        productId: input.productId,
        expectedVersion: input.expectedVersion,
      }),
    )
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

function parseStoredLifecycleResult(
  resultReference: string | null,
  resultData: Prisma.JsonValue | null,
): ProductLifecycleResultDto {
  const reference = z.string().uuid().safeParse(resultReference);
  const result = storedLifecycleResultSchema.safeParse(resultData);

  if (
    !reference.success ||
    !result.success ||
    result.data.productId !== reference.data
  ) {
    throw new ProductLifecycleError(
      PRODUCT_LIFECYCLE_ERROR_CODES.LIFECYCLE_FAILED,
    );
  }

  return result.data;
}

async function findLifecycleReplay(
  context: TenantContext,
  input: ParsedLifecycleInput,
  operation: ProductLifecycleOperation,
  requestHash: string,
): Promise<ProductLifecycleResultDto | null> {
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
      resultData: true,
    },
  });

  if (!existing) {
    return null;
  }

  if (
    existing.operation !== operation ||
    existing.requestHash !== requestHash
  ) {
    throw new ProductLifecycleError(
      PRODUCT_LIFECYCLE_ERROR_CODES.IDEMPOTENCY_CONFLICT,
    );
  }

  return parseStoredLifecycleResult(
    existing.resultReference,
    existing.resultData,
  );
}

async function readProduct(
  database: LifecycleDatabase,
  organizationId: string,
  productId: string,
): Promise<LifecycleProduct> {
  const product = await database.product.findFirst({
    where: { id: productId, organizationId },
    select: lifecycleProductSelect,
  });

  if (!product) {
    throw new ProductLifecycleError(
      PRODUCT_LIFECYCLE_ERROR_CODES.PRODUCT_NOT_FOUND,
    );
  }

  return product;
}

function toWorkerDto(
  worker: LifecycleProduct["currentWorker"],
): ProductLifecycleWorkerDto | null {
  return worker ? { id: worker.id, displayName: worker.displayName } : null;
}

function toRoleDto(
  role: LifecycleProduct["currentRole"],
): ProductLifecycleRoleDto | null {
  return role ? { id: role.id, code: role.code, name: role.name } : null;
}

function toLocationDto(
  location: LifecycleProduct["currentLocation"],
): ProductLifecycleLocationDto | null {
  return location
    ? {
        id: location.id,
        code: location.code,
        name: location.name,
        departmentId: location.departmentId,
      }
    : null;
}

function toLifecycleResult(
  product: LifecycleProduct,
): ProductLifecycleResultDto {
  return {
    productId: product.id,
    serialNumber: product.serialNumber,
    status: product.status as ProductLifecycleStatus,
    version: product.version,
    currentWorker: toWorkerDto(product.currentWorker),
    currentRole: toRoleDto(product.currentRole),
    currentLocation: toLocationDto(product.currentLocation),
    completedAt: product.completedAt?.toISOString() ?? null,
    cancelledAt: product.cancelledAt?.toISOString() ?? null,
    trashedAt: product.trashedAt?.toISOString() ?? null,
  };
}

function lifecycleSnapshot(values: {
  status: ProductStatus;
  version: number;
  workerId: string | null;
  roleId: string | null;
  locationId: string | null;
  completedAt?: Date | null;
  cancelledAt?: Date | null;
  trashedAt?: Date | null;
}) {
  return {
    status: values.status,
    version: values.version,
    workerId: values.workerId,
    roleId: values.roleId,
    locationId: values.locationId,
    ...(values.completedAt !== undefined
      ? { completedAt: values.completedAt?.toISOString() ?? null }
      : {}),
    ...(values.cancelledAt !== undefined
      ? { cancelledAt: values.cancelledAt?.toISOString() ?? null }
      : {}),
    ...(values.trashedAt !== undefined
      ? { trashedAt: values.trashedAt?.toISOString() ?? null }
      : {}),
  };
}

async function executeLifecycleMutation(
  context: LifecycleMutationContext,
  mutation: LifecycleMutation,
  prepare?: LifecyclePreparation,
): Promise<ProductLifecycleResultDto> {
  try {
    return await prisma.$transaction(async (database) => {
      if (prepare) {
        await prepare(database);
      }

      await database.idempotencyKey.create({
        data: {
          organizationId: context.tenant.organizationId,
          userId: context.tenant.userId,
          actorMembershipId: context.tenant.membershipId,
          key: context.input.idempotencyKey,
          operation: context.operation,
          requestHash: context.requestHash,
        },
      });

      const result = await mutation(database);
      await database.idempotencyKey.updateMany({
        where: {
          organizationId: context.tenant.organizationId,
          userId: context.tenant.userId,
          key: context.input.idempotencyKey,
          operation: context.operation,
        },
        data: { resultReference: result.productId, resultData: result },
      });

      return result;
    });
  } catch (error) {
    if (hasUniqueTarget(error, ["organizationId", "userId", "key"])) {
      const replay = await findLifecycleReplay(
        context.tenant,
        context.input,
        context.operation,
        context.requestHash,
      );
      if (replay) {
        return replay;
      }
    }

    throw error;
  }
}

async function startMutation(
  input: ProductLifecycleInput,
  operation: ProductLifecycleOperation,
  permission:
    | "scans.perform"
    | "products.complete"
    | "products.cancel"
    | "products.restore"
    | "products.trash",
) {
  const parsed = parseLifecycleInput(input);
  const tenant = await requirePermission(permission);
  const requestHash = hashLifecycleRequest(operation, parsed);
  const replay = await findLifecycleReplay(
    tenant,
    parsed,
    operation,
    requestHash,
  );

  return {
    context: { tenant, input: parsed, operation, requestHash },
    replay,
  };
}

export async function finishProduct(
  input: ProductLifecycleInput,
): Promise<ProductLifecycleResultDto> {
  const { context, replay } = await startMutation(
    input,
    "products.finish",
    "scans.perform",
  );
  if (replay) {
    return replay;
  }

  const employee = await resolveEmployeeContext(context.tenant);
  return executeLifecycleMutation(context, async (database) => {
    const product = await readProduct(
      database,
      context.tenant.organizationId,
      context.input.productId,
    );

    if (product.version !== context.input.expectedVersion) {
      throw new ProductLifecycleError(
        PRODUCT_LIFECYCLE_ERROR_CODES.PRODUCT_STATE_CHANGED,
      );
    }

    if (
      product.status !== ProductStatus.IN_PROGRESS ||
      product.currentWorkerId !== employee.employeeId ||
      !product.currentRoleId
    ) {
      throw new ProductLifecycleError(
        PRODUCT_LIFECYCLE_ERROR_CODES.PRODUCT_NOT_FINISHABLE,
      );
    }

    const activeAssignment = await database.productAssignment.findFirst({
      where: {
        organizationId: context.tenant.organizationId,
        productId: product.id,
        endedAt: null,
      },
      select: {
        id: true,
        employeeId: true,
        productionRoleId: true,
      },
    });

    if (!activeAssignment) {
      throw new ProductLifecycleError(
        PRODUCT_LIFECYCLE_ERROR_CODES.ACTIVE_ASSIGNMENT_REQUIRED,
      );
    }

    if (
      activeAssignment.employeeId !== product.currentWorkerId ||
      activeAssignment.employeeId !== employee.employeeId ||
      activeAssignment.productionRoleId !== product.currentRoleId
    ) {
      throw new ProductLifecycleError(
        PRODUCT_LIFECYCLE_ERROR_CODES.ACTIVE_ASSIGNMENT_CONFLICT,
      );
    }

    const occurredAt = new Date();
    const updated = await database.product.updateMany({
      where: {
        id: product.id,
        organizationId: context.tenant.organizationId,
        status: ProductStatus.IN_PROGRESS,
        version: context.input.expectedVersion,
        currentWorkerId: employee.employeeId,
        currentRoleId: product.currentRoleId,
      },
      data: {
        status: ProductStatus.READY_FOR_HANDOFF,
        currentWorkerId: null,
        currentRoleId: null,
        version: { increment: 1 },
      },
    });

    if (updated.count !== 1) {
      throw new ProductLifecycleError(
        PRODUCT_LIFECYCLE_ERROR_CODES.PRODUCT_STATE_CHANGED,
      );
    }

    const ended = await database.productAssignment.updateMany({
      where: { id: activeAssignment.id, endedAt: null },
      data: { endedAt: occurredAt, endReason: "FINISHED" },
    });
    if (ended.count !== 1) {
      throw new ProductLifecycleError(
        PRODUCT_LIFECYCLE_ERROR_CODES.ACTIVE_ASSIGNMENT_CONFLICT,
      );
    }

    await database.productTransition.create({
      data: {
        organizationId: context.tenant.organizationId,
        productId: product.id,
        actorUserId: context.tenant.userId,
        actorMembershipId: context.tenant.membershipId,
        eventType: "WORK_FINISHED",
        fromStatus: ProductStatus.IN_PROGRESS,
        toStatus: ProductStatus.READY_FOR_HANDOFF,
        fromWorkerId: product.currentWorkerId,
        toWorkerId: null,
        fromRoleId: product.currentRoleId,
        toRoleId: null,
        fromLocationId: product.currentLocationId,
        toLocationId: product.currentLocationId,
        fromStageId: product.currentStageId,
        toStageId: product.currentStageId,
        occurredAt,
      },
    });

    return toLifecycleResult(
      await readProduct(
        database,
        context.tenant.organizationId,
        context.input.productId,
      ),
    );
  });
}

export async function completeProduct(
  input: ProductLifecycleInput,
): Promise<ProductLifecycleResultDto> {
  const { context, replay } = await startMutation(
    input,
    "products.complete",
    "products.complete",
  );
  if (replay) {
    return replay;
  }

  return executeLifecycleMutation(context, async (database) => {
    const product = await readProduct(
      database,
      context.tenant.organizationId,
      context.input.productId,
    );
    if (product.version !== context.input.expectedVersion) {
      throw new ProductLifecycleError(
        PRODUCT_LIFECYCLE_ERROR_CODES.PRODUCT_STATE_CHANGED,
      );
    }

    if (
      product.status !== ProductStatus.READY_FOR_HANDOFF ||
      product.currentWorkerId !== null ||
      product.currentRoleId !== null
    ) {
      throw new ProductLifecycleError(
        PRODUCT_LIFECYCLE_ERROR_CODES.PRODUCT_NOT_COMPLETABLE,
      );
    }

    const activeAssignment = await database.productAssignment.findFirst({
      where: {
        organizationId: context.tenant.organizationId,
        productId: product.id,
        endedAt: null,
      },
      select: { id: true },
    });
    if (activeAssignment) {
      throw new ProductLifecycleError(
        PRODUCT_LIFECYCLE_ERROR_CODES.ACTIVE_ASSIGNMENT_CONFLICT,
      );
    }

    const occurredAt = new Date();
    const updated = await database.product.updateMany({
      where: {
        id: product.id,
        organizationId: context.tenant.organizationId,
        status: ProductStatus.READY_FOR_HANDOFF,
        version: context.input.expectedVersion,
        currentWorkerId: null,
        currentRoleId: null,
      },
      data: {
        status: ProductStatus.COMPLETED,
        completedAt: occurredAt,
        version: { increment: 1 },
      },
    });
    if (updated.count !== 1) {
      throw new ProductLifecycleError(
        PRODUCT_LIFECYCLE_ERROR_CODES.PRODUCT_STATE_CHANGED,
      );
    }

    await database.productTransition.create({
      data: {
        organizationId: context.tenant.organizationId,
        productId: product.id,
        actorUserId: context.tenant.userId,
        actorMembershipId: context.tenant.membershipId,
        eventType: "PRODUCT_COMPLETED",
        fromStatus: ProductStatus.READY_FOR_HANDOFF,
        toStatus: ProductStatus.COMPLETED,
        fromWorkerId: null,
        toWorkerId: null,
        fromRoleId: null,
        toRoleId: null,
        fromLocationId: product.currentLocationId,
        toLocationId: product.currentLocationId,
        fromStageId: product.currentStageId,
        toStageId: product.currentStageId,
        occurredAt,
      },
    });

    await database.auditLog.create({
      data: {
        organizationId: context.tenant.organizationId,
        actorUserId: context.tenant.userId,
        actorMembershipId: context.tenant.membershipId,
        action: "product.completed",
        targetType: "Product",
        targetId: product.id,
        beforeData: lifecycleSnapshot({
          status: product.status,
          version: product.version,
          workerId: product.currentWorkerId,
          roleId: product.currentRoleId,
          locationId: product.currentLocationId,
          completedAt: product.completedAt,
        }),
        afterData: lifecycleSnapshot({
          status: ProductStatus.COMPLETED,
          version: product.version + 1,
          workerId: null,
          roleId: null,
          locationId: product.currentLocationId,
          completedAt: occurredAt,
        }),
      },
    });

    return toLifecycleResult(
      await readProduct(
        database,
        context.tenant.organizationId,
        context.input.productId,
      ),
    );
  });
}

export async function returnCompletedProductToProcess(
  input: ProductLifecycleInput,
): Promise<ProductLifecycleResultDto> {
  const parsed = parseLifecycleInput(input);
  const tenant = await requirePermission("products.reopen");
  await requirePermission("scans.perform");
  const requestHash = hashLifecycleRequest(
    "products.return_to_process",
    parsed,
  );
  const replay = await findLifecycleReplay(
    tenant,
    parsed,
    "products.return_to_process",
    requestHash,
  );
  if (replay) {
    return replay;
  }

  const employee = await resolveEmployeeContext(tenant);
  const context: LifecycleMutationContext = {
    tenant,
    input: parsed,
    operation: "products.return_to_process",
    requestHash,
  };

  return executeLifecycleMutation(
    context,
    async (database) => {
      const currentContext =
        await resolveCurrentProductionHandlingContextInTransaction(
          database,
          tenant,
        );
      const product = await readProduct(
        database,
        tenant.organizationId,
        parsed.productId,
      );
      if (product.version !== parsed.expectedVersion) {
        throw new ProductLifecycleError(
          PRODUCT_LIFECYCLE_ERROR_CODES.PRODUCT_STATE_CHANGED,
        );
      }

      if (
        product.status !== ProductStatus.COMPLETED ||
        product.currentWorkerId !== null ||
        product.currentRoleId !== null
      ) {
        throw new ProductLifecycleError(
          PRODUCT_LIFECYCLE_ERROR_CODES.PRODUCT_NOT_REOPENABLE,
        );
      }

      const activeAssignment = await database.productAssignment.findFirst({
        where: {
          organizationId: tenant.organizationId,
          productId: product.id,
          endedAt: null,
        },
        select: { id: true },
      });
      if (activeAssignment) {
        throw new ProductLifecycleError(
          PRODUCT_LIFECYCLE_ERROR_CODES.ACTIVE_ASSIGNMENT_CONFLICT,
        );
      }

      const occurredAt = new Date();
      const updated = await database.product.updateMany({
        where: {
          id: product.id,
          organizationId: tenant.organizationId,
          status: ProductStatus.COMPLETED,
          version: parsed.expectedVersion,
          currentWorkerId: null,
          currentRoleId: null,
        },
        data: {
          status: ProductStatus.IN_PROGRESS,
          currentWorkerId: currentContext.employee.employeeId,
          currentRoleId: currentContext.productionRole.id,
          currentLocationId: currentContext.handlingLocation.id,
          completedAt: null,
          version: { increment: 1 },
        },
      });
      if (updated.count !== 1) {
        throw new ProductLifecycleError(
          PRODUCT_LIFECYCLE_ERROR_CODES.PRODUCT_STATE_CHANGED,
        );
      }

      await database.productAssignment.create({
        data: {
          organizationId: tenant.organizationId,
          productId: product.id,
          employeeId: currentContext.employee.employeeId,
          productionRoleId: currentContext.productionRole.id,
          locationId: currentContext.handlingLocation.id,
          workflowStageId: null,
          startedAt: occurredAt,
        },
      });

      await database.productTransition.create({
        data: {
          organizationId: tenant.organizationId,
          productId: product.id,
          actorUserId: tenant.userId,
          actorMembershipId: tenant.membershipId,
          eventType: "PRODUCT_RETURNED_TO_PROCESS",
          fromStatus: ProductStatus.COMPLETED,
          toStatus: ProductStatus.IN_PROGRESS,
          fromWorkerId: null,
          toWorkerId: currentContext.employee.employeeId,
          fromRoleId: null,
          toRoleId: currentContext.productionRole.id,
          fromLocationId: product.currentLocationId,
          toLocationId: currentContext.handlingLocation.id,
          fromStageId: product.currentStageId,
          toStageId: product.currentStageId,
          occurredAt,
        },
      });

      await database.auditLog.create({
        data: {
          organizationId: tenant.organizationId,
          actorUserId: tenant.userId,
          actorMembershipId: tenant.membershipId,
          action: "product.returned_to_process",
          targetType: "Product",
          targetId: product.id,
          beforeData: lifecycleSnapshot({
            status: product.status,
            version: product.version,
            workerId: product.currentWorkerId,
            roleId: product.currentRoleId,
            locationId: product.currentLocationId,
            completedAt: product.completedAt,
          }),
          afterData: lifecycleSnapshot({
            status: ProductStatus.IN_PROGRESS,
            version: product.version + 1,
            workerId: currentContext.employee.employeeId,
            roleId: currentContext.productionRole.id,
            locationId: currentContext.handlingLocation.id,
            completedAt: null,
          }),
        },
      });

      return toLifecycleResult(
        await readProduct(database, tenant.organizationId, parsed.productId),
      );
    },
    async (database) => {
      await lockEmployeeForProductionMutation(
        database,
        employee.organizationId,
        employee.employeeId,
      );
    },
  );
}

export async function cancelProduct(
  input: ProductLifecycleInput,
): Promise<ProductLifecycleResultDto> {
  const { context, replay } = await startMutation(
    input,
    "products.cancel",
    "products.cancel",
  );
  if (replay) {
    return replay;
  }

  return executeLifecycleMutation(context, async (database) => {
    const product = await readProduct(
      database,
      context.tenant.organizationId,
      context.input.productId,
    );
    if (product.version !== context.input.expectedVersion) {
      throw new ProductLifecycleError(
        PRODUCT_LIFECYCLE_ERROR_CODES.PRODUCT_STATE_CHANGED,
      );
    }

    if (
      product.status !== ProductStatus.CREATED &&
      product.status !== ProductStatus.IN_PROGRESS &&
      product.status !== ProductStatus.READY_FOR_HANDOFF
    ) {
      throw new ProductLifecycleError(
        PRODUCT_LIFECYCLE_ERROR_CODES.PRODUCT_NOT_CANCELLABLE,
      );
    }

    const activeAssignment = await database.productAssignment.findFirst({
      where: {
        organizationId: context.tenant.organizationId,
        productId: product.id,
        endedAt: null,
      },
      select: {
        id: true,
        employeeId: true,
        productionRoleId: true,
      },
    });

    if (product.status === ProductStatus.IN_PROGRESS) {
      if (!product.currentWorkerId || !product.currentRoleId) {
        throw new ProductLifecycleError(
          PRODUCT_LIFECYCLE_ERROR_CODES.PRODUCT_NOT_CANCELLABLE,
        );
      }
      if (!activeAssignment) {
        throw new ProductLifecycleError(
          PRODUCT_LIFECYCLE_ERROR_CODES.ACTIVE_ASSIGNMENT_REQUIRED,
        );
      }
      if (
        activeAssignment.employeeId !== product.currentWorkerId ||
        activeAssignment.productionRoleId !== product.currentRoleId
      ) {
        throw new ProductLifecycleError(
          PRODUCT_LIFECYCLE_ERROR_CODES.ACTIVE_ASSIGNMENT_CONFLICT,
        );
      }
    } else if (
      product.currentWorkerId !== null ||
      product.currentRoleId !== null ||
      activeAssignment
    ) {
      throw new ProductLifecycleError(
        PRODUCT_LIFECYCLE_ERROR_CODES.ACTIVE_ASSIGNMENT_CONFLICT,
      );
    }

    const occurredAt = new Date();
    if (activeAssignment) {
      const ended = await database.productAssignment.updateMany({
        where: { id: activeAssignment.id, endedAt: null },
        data: { endedAt: occurredAt, endReason: "CANCELLED" },
      });
      if (ended.count !== 1) {
        throw new ProductLifecycleError(
          PRODUCT_LIFECYCLE_ERROR_CODES.ACTIVE_ASSIGNMENT_CONFLICT,
        );
      }
    }

    const updated = await database.product.updateMany({
      where: {
        id: product.id,
        organizationId: context.tenant.organizationId,
        status: product.status,
        version: context.input.expectedVersion,
        currentWorkerId: product.currentWorkerId,
        currentRoleId: product.currentRoleId,
      },
      data: {
        status: ProductStatus.CANCELLED,
        currentWorkerId: null,
        currentRoleId: null,
        cancelledAt: occurredAt,
        version: { increment: 1 },
      },
    });
    if (updated.count !== 1) {
      throw new ProductLifecycleError(
        PRODUCT_LIFECYCLE_ERROR_CODES.PRODUCT_STATE_CHANGED,
      );
    }

    await database.productTransition.create({
      data: {
        organizationId: context.tenant.organizationId,
        productId: product.id,
        actorUserId: context.tenant.userId,
        actorMembershipId: context.tenant.membershipId,
        eventType: "PRODUCT_CANCELLED",
        fromStatus: product.status,
        toStatus: ProductStatus.CANCELLED,
        fromWorkerId: product.currentWorkerId,
        toWorkerId: null,
        fromRoleId: product.currentRoleId,
        toRoleId: null,
        fromLocationId: product.currentLocationId,
        toLocationId: product.currentLocationId,
        fromStageId: product.currentStageId,
        toStageId: product.currentStageId,
        occurredAt,
      },
    });

    await database.auditLog.create({
      data: {
        organizationId: context.tenant.organizationId,
        actorUserId: context.tenant.userId,
        actorMembershipId: context.tenant.membershipId,
        action: "product.cancelled",
        targetType: "Product",
        targetId: product.id,
        beforeData: lifecycleSnapshot({
          status: product.status,
          version: product.version,
          workerId: product.currentWorkerId,
          roleId: product.currentRoleId,
          locationId: product.currentLocationId,
          cancelledAt: product.cancelledAt,
        }),
        afterData: lifecycleSnapshot({
          status: ProductStatus.CANCELLED,
          version: product.version + 1,
          workerId: null,
          roleId: null,
          locationId: product.currentLocationId,
          cancelledAt: occurredAt,
        }),
      },
    });

    return toLifecycleResult(
      await readProduct(
        database,
        context.tenant.organizationId,
        context.input.productId,
      ),
    );
  });
}

async function restoreOrTrashProduct(
  input: ProductLifecycleInput,
  operation: "products.restore" | "products.trash",
): Promise<ProductLifecycleResultDto> {
  const permission =
    operation === "products.restore" ? "products.restore" : "products.trash";
  const { context, replay } = await startMutation(input, operation, permission);
  if (replay) {
    return replay;
  }

  return executeLifecycleMutation(context, async (database) => {
    const product = await readProduct(
      database,
      context.tenant.organizationId,
      context.input.productId,
    );
    if (product.version !== context.input.expectedVersion) {
      throw new ProductLifecycleError(
        PRODUCT_LIFECYCLE_ERROR_CODES.PRODUCT_STATE_CHANGED,
      );
    }

    if (
      product.status !== ProductStatus.CANCELLED ||
      product.currentWorkerId !== null ||
      product.currentRoleId !== null
    ) {
      throw new ProductLifecycleError(
        operation === "products.restore"
          ? PRODUCT_LIFECYCLE_ERROR_CODES.PRODUCT_NOT_RESTORABLE
          : PRODUCT_LIFECYCLE_ERROR_CODES.PRODUCT_NOT_TRASHABLE,
      );
    }

    const activeAssignment = await database.productAssignment.findFirst({
      where: {
        organizationId: context.tenant.organizationId,
        productId: product.id,
        endedAt: null,
      },
      select: { id: true },
    });
    if (activeAssignment) {
      throw new ProductLifecycleError(
        PRODUCT_LIFECYCLE_ERROR_CODES.ACTIVE_ASSIGNMENT_CONFLICT,
      );
    }

    const occurredAt = new Date();
    const nextStatus =
      operation === "products.restore"
        ? ProductStatus.READY_FOR_HANDOFF
        : ProductStatus.TRASHED;
    const updated = await database.product.updateMany({
      where: {
        id: product.id,
        organizationId: context.tenant.organizationId,
        status: ProductStatus.CANCELLED,
        version: context.input.expectedVersion,
        currentWorkerId: null,
        currentRoleId: null,
      },
      data:
        operation === "products.restore"
          ? {
              status: nextStatus,
              cancelledAt: null,
              version: { increment: 1 },
            }
          : {
              status: nextStatus,
              cancelledAt: null,
              trashedAt: occurredAt,
              version: { increment: 1 },
            },
    });
    if (updated.count !== 1) {
      throw new ProductLifecycleError(
        PRODUCT_LIFECYCLE_ERROR_CODES.PRODUCT_STATE_CHANGED,
      );
    }

    const eventType =
      operation === "products.restore" ? "PRODUCT_RESTORED" : "PRODUCT_TRASHED";
    await database.productTransition.create({
      data: {
        organizationId: context.tenant.organizationId,
        productId: product.id,
        actorUserId: context.tenant.userId,
        actorMembershipId: context.tenant.membershipId,
        eventType,
        fromStatus: ProductStatus.CANCELLED,
        toStatus: nextStatus,
        fromWorkerId: null,
        toWorkerId: null,
        fromRoleId: null,
        toRoleId: null,
        fromLocationId: product.currentLocationId,
        toLocationId: product.currentLocationId,
        fromStageId: product.currentStageId,
        toStageId: product.currentStageId,
        occurredAt,
      },
    });

    await database.auditLog.create({
      data: {
        organizationId: context.tenant.organizationId,
        actorUserId: context.tenant.userId,
        actorMembershipId: context.tenant.membershipId,
        action:
          operation === "products.restore"
            ? "product.restored"
            : "product.trashed",
        targetType: "Product",
        targetId: product.id,
        beforeData: lifecycleSnapshot({
          status: ProductStatus.CANCELLED,
          version: product.version,
          workerId: null,
          roleId: null,
          locationId: product.currentLocationId,
          cancelledAt: product.cancelledAt,
          trashedAt: product.trashedAt,
        }),
        afterData: lifecycleSnapshot({
          status: nextStatus,
          version: product.version + 1,
          workerId: null,
          roleId: null,
          locationId: product.currentLocationId,
          cancelledAt: null,
          trashedAt:
            operation === "products.restore" ? product.trashedAt : occurredAt,
        }),
      },
    });

    return toLifecycleResult(
      await readProduct(
        database,
        context.tenant.organizationId,
        context.input.productId,
      ),
    );
  });
}

export function restoreProduct(
  input: ProductLifecycleInput,
): Promise<ProductLifecycleResultDto> {
  return restoreOrTrashProduct(input, "products.restore");
}

export function trashProduct(
  input: ProductLifecycleInput,
): Promise<ProductLifecycleResultDto> {
  return restoreOrTrashProduct(input, "products.trash");
}

export type ProductLifecyclePageData = {
  product: ProductLifecycleResultDto;
  canComplete: boolean;
  canCancel: boolean;
  canRestore: boolean;
  canTrash: boolean;
};

export async function getProductLifecyclePageData(
  productId: string,
): Promise<ProductLifecyclePageData> {
  const tenant = await requirePermission("products.read");
  const parsedProductId = z.string().uuid().safeParse(productId);
  if (!parsedProductId.success) {
    throw new ProductLifecycleError(
      PRODUCT_LIFECYCLE_ERROR_CODES.PRODUCT_NOT_FOUND,
    );
  }

  const [product, canComplete, canCancel, canRestore, canTrash] =
    await Promise.all([
      readProduct(prisma, tenant.organizationId, parsedProductId.data),
      hasPermission("products.complete", tenant),
      hasPermission("products.cancel", tenant),
      hasPermission("products.restore", tenant),
      hasPermission("products.trash", tenant),
    ]);

  return {
    product: toLifecycleResult(product),
    canComplete,
    canCancel,
    canRestore,
    canTrash,
  };
}

export { isProductLifecycleError };
