import "server-only";

import { createHash } from "node:crypto";

import { Prisma, ProductStatus } from "@prisma/client";
import { z } from "zod";

import { prisma } from "@/lib/db/client";
import { requirePermission, type TenantContext } from "@/modules/authorization";

import {
  resolveActiveProductionHandlingContextForTenant,
  revalidateHandlingContext,
  type ActiveProductionHandlingContext,
} from "./handling-context.service";
import {
  isWorkerScanError,
  SCAN_ERROR_CODES,
  WorkerScanError,
} from "./scan-errors";
import {
  normalizeBarcode,
  parseWorkerScanRequest,
  parseWorkerTakeoverRequest,
} from "./scan-input";
import type {
  ScanOutcome,
  WorkerScanRequest,
  WorkerScanResult,
  WorkerTakeoverRequest,
} from "./scan-types";

const RECEIVE_OPERATION = "scans.receive";
const TAKEOVER_OPERATION = "scans.takeover";

const scanProductSelect = Prisma.validator<Prisma.ProductSelect>()({
  id: true,
  organizationId: true,
  serialNumber: true,
  status: true,
  version: true,
  currentWorkerId: true,
  currentRoleId: true,
  currentLocationId: true,
  currentStageId: true,
  currentWorker: { select: { id: true, displayName: true } },
  currentRole: { select: { id: true, code: true, name: true } },
  currentLocation: {
    select: { id: true, code: true, name: true, departmentId: true },
  },
});

type ScannedProduct = Prisma.ProductGetPayload<{
  select: typeof scanProductSelect;
}>;
type ScanDatabase = typeof prisma | Prisma.TransactionClient;

const scanProductStatusSchema = z.enum([
  ProductStatus.CREATED,
  ProductStatus.IN_PROGRESS,
  ProductStatus.READY_FOR_HANDOFF,
  ProductStatus.COMPLETED,
  ProductStatus.CANCELLED,
  ProductStatus.TRASHED,
]);
const scanOutcomeSchema = z.enum([
  "RECEIVED",
  "FINISH_CONFIRMATION_REQUIRED",
  "TAKEOVER_CONFIRMATION_REQUIRED",
  "COMPLETED_SAME_DEPARTMENT",
  "COMPLETED_OTHER_DEPARTMENT",
  "COMPLETED_CONTEXT_UNKNOWN",
  "PRODUCT_NOT_RECEIVABLE",
]);
const storedScanResultSchema = z
  .object({
    productId: z.string().uuid(),
    barcode: z.string().min(1).max(255),
    serialNumber: z.string().min(1),
    status: scanProductStatusSchema,
    version: z.number().int().nonnegative(),
    scanOutcome: scanOutcomeSchema,
    currentWorker: z
      .object({ id: z.string().uuid(), displayName: z.string() })
      .nullable(),
    currentRole: z
      .object({
        id: z.string().uuid(),
        code: z.string(),
        name: z.string(),
      })
      .nullable(),
    currentLocation: z
      .object({
        id: z.string().uuid(),
        code: z.string(),
        name: z.string(),
        departmentId: z.string().uuid().nullable(),
      })
      .nullable(),
  })
  .strict();

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

function hashRequest(input: object): string {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}

function hashReceiveRequest(barcode: string): string {
  return hashRequest({ barcode, intent: "receive" });
}

function hashTakeoverRequest(barcode: string, expectedVersion: number): string {
  return hashRequest({ barcode, expectedVersion, intent: "takeover" });
}

function parseStoredScanResult(
  resultReference: string | null,
  resultData: Prisma.JsonValue | null,
): WorkerScanResult {
  const reference = z.string().uuid().safeParse(resultReference);
  const result = storedScanResultSchema.safeParse(resultData);

  if (
    !reference.success ||
    !result.success ||
    result.data.productId !== reference.data
  ) {
    throw new WorkerScanError(SCAN_ERROR_CODES.SCAN_FAILED);
  }

  return result.data;
}

async function findScanReplay(
  context: TenantContext,
  key: string,
  operation: string,
  requestHash: string,
): Promise<WorkerScanResult | null> {
  const existing = await prisma.idempotencyKey.findUnique({
    where: {
      organizationId_userId_key: {
        organizationId: context.organizationId,
        userId: context.userId,
        key,
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
    throw new WorkerScanError(SCAN_ERROR_CODES.IDEMPOTENCY_CONFLICT);
  }

  return parseStoredScanResult(existing.resultReference, existing.resultData);
}

async function findProductByBarcode(
  database: ScanDatabase,
  organizationId: string,
  barcode: string,
): Promise<ScannedProduct | null> {
  const barcodeRecord = await database.barcode.findFirst({
    where: { organizationId, value: barcode },
    select: { product: { select: scanProductSelect } },
  });

  return barcodeRecord?.product ?? null;
}

function toWorkerDto(worker: { id: string; displayName: string } | null) {
  return worker ? { id: worker.id, displayName: worker.displayName } : null;
}

function toRoleDto(role: { id: string; code: string; name: string } | null) {
  return role ? { id: role.id, code: role.code, name: role.name } : null;
}

function toLocationDto(
  location: {
    id: string;
    code: string;
    name: string;
    departmentId: string | null;
  } | null,
) {
  return location
    ? {
        id: location.id,
        code: location.code,
        name: location.name,
        departmentId: location.departmentId,
      }
    : null;
}

function classifyCompleted(
  product: ScannedProduct,
  context: ActiveProductionHandlingContext,
): Extract<
  ScanOutcome,
  | "COMPLETED_SAME_DEPARTMENT"
  | "COMPLETED_OTHER_DEPARTMENT"
  | "COMPLETED_CONTEXT_UNKNOWN"
> {
  const previousDepartmentId = product.currentLocation?.departmentId ?? null;
  const nextDepartmentId = context.handlingLocation.departmentId;

  if (!previousDepartmentId || !nextDepartmentId) {
    return "COMPLETED_CONTEXT_UNKNOWN";
  }

  return previousDepartmentId === nextDepartmentId
    ? "COMPLETED_SAME_DEPARTMENT"
    : "COMPLETED_OTHER_DEPARTMENT";
}

function toScanResult(
  product: ScannedProduct,
  scanOutcome: ScanOutcome,
  barcode: string,
): WorkerScanResult {
  return {
    productId: product.id,
    barcode,
    serialNumber: product.serialNumber,
    status: product.status,
    version: product.version,
    scanOutcome,
    currentWorker: toWorkerDto(product.currentWorker),
    currentRole: toRoleDto(product.currentRole),
    currentLocation: toLocationDto(product.currentLocation),
  };
}

function productStateChangedError(): WorkerScanError {
  return new WorkerScanError(SCAN_ERROR_CODES.SCAN_CONFLICT);
}

async function revalidateHandlingContextInTransaction(
  database: ScanDatabase,
  context: ActiveProductionHandlingContext,
) {
  // The helper is also used outside transactions. Keeping the same query shape
  // makes the trusted role/location pair explicit at both boundaries.
  return revalidateHandlingContext(database, context);
}

async function receiveProductTransaction(
  context: ActiveProductionHandlingContext,
  barcode: string,
  expectedStatus: "CREATED" | "READY_FOR_HANDOFF",
  expectedVersion: number,
  idempotencyKey: string,
  requestHash: string,
): Promise<WorkerScanResult> {
  return prisma.$transaction(async (database) => {
    await database.idempotencyKey.create({
      data: {
        organizationId: context.tenant.organizationId,
        userId: context.tenant.userId,
        actorMembershipId: context.tenant.membershipId,
        key: idempotencyKey,
        operation: RECEIVE_OPERATION,
        requestHash,
      },
    });

    const product = await findProductByBarcode(
      database,
      context.tenant.organizationId,
      barcode,
    );

    if (!product) {
      throw new WorkerScanError(SCAN_ERROR_CODES.BARCODE_NOT_FOUND);
    }

    const expectedLocationId =
      expectedStatus === ProductStatus.CREATED ? null : undefined;
    if (
      product.status !== expectedStatus ||
      product.version !== expectedVersion ||
      product.currentWorkerId !== null ||
      product.currentRoleId !== null ||
      (expectedLocationId === null && product.currentLocationId !== null)
    ) {
      throw productStateChangedError();
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
      throw productStateChangedError();
    }

    const currentContext = await revalidateHandlingContextInTransaction(
      database,
      context,
    );
    const occurredAt = new Date();
    const updated = await database.product.updateMany({
      where: {
        id: product.id,
        organizationId: context.tenant.organizationId,
        status: expectedStatus,
        version: expectedVersion,
        currentWorkerId: null,
        currentRoleId: null,
        ...(expectedLocationId === null ? { currentLocationId: null } : {}),
      },
      data: {
        status: ProductStatus.IN_PROGRESS,
        currentWorkerId: context.employee.employeeId,
        currentRoleId: currentContext.productionRole.id,
        currentLocationId: currentContext.handlingLocation.id,
        version: { increment: 1 },
      },
    });

    if (updated.count !== 1) {
      throw productStateChangedError();
    }

    await database.productAssignment.create({
      data: {
        organizationId: context.tenant.organizationId,
        productId: product.id,
        employeeId: context.employee.employeeId,
        productionRoleId: currentContext.productionRole.id,
        locationId: currentContext.handlingLocation.id,
        workflowStageId: null,
        startedAt: occurredAt,
      },
    });

    await database.productTransition.create({
      data: {
        organizationId: context.tenant.organizationId,
        productId: product.id,
        actorUserId: context.tenant.userId,
        actorMembershipId: context.tenant.membershipId,
        eventType: "PRODUCT_RECEIVED",
        fromStatus: expectedStatus,
        toStatus: ProductStatus.IN_PROGRESS,
        fromWorkerId: product.currentWorkerId,
        toWorkerId: context.employee.employeeId,
        fromRoleId: product.currentRoleId,
        toRoleId: currentContext.productionRole.id,
        fromLocationId: product.currentLocationId,
        toLocationId: currentContext.handlingLocation.id,
        fromStageId: product.currentStageId,
        toStageId: product.currentStageId,
        occurredAt,
      },
    });

    const resultProduct = await findProductByBarcode(
      database,
      context.tenant.organizationId,
      barcode,
    );
    if (!resultProduct) {
      throw new WorkerScanError(SCAN_ERROR_CODES.SCAN_FAILED);
    }

    const result = toScanResult(resultProduct, "RECEIVED", barcode);
    await database.idempotencyKey.updateMany({
      where: {
        organizationId: context.tenant.organizationId,
        userId: context.tenant.userId,
        key: idempotencyKey,
        operation: RECEIVE_OPERATION,
      },
      data: { resultReference: product.id, resultData: result },
    });

    return result;
  });
}

async function receiveProduct(
  context: ActiveProductionHandlingContext,
  product: ScannedProduct,
  barcode: string,
  idempotencyKey: string,
  requestHash: string,
) {
  if (
    product.status !== ProductStatus.CREATED &&
    product.status !== ProductStatus.READY_FOR_HANDOFF
  ) {
    throw new WorkerScanError(SCAN_ERROR_CODES.PRODUCT_NOT_RECEIVABLE);
  }

  try {
    return await receiveProductTransaction(
      context,
      barcode,
      product.status,
      product.version,
      idempotencyKey,
      requestHash,
    );
  } catch (error) {
    if (hasUniqueTarget(error, ["organizationId", "userId", "key"])) {
      const replay = await findScanReplay(
        context.tenant,
        idempotencyKey,
        RECEIVE_OPERATION,
        requestHash,
      );
      if (replay) {
        return replay;
      }
    }

    throw error;
  }
}

export async function scanProduct(
  input: WorkerScanRequest,
): Promise<WorkerScanResult> {
  const parsed = parseWorkerScanRequest(input);
  const tenant = await requirePermission("scans.perform");
  const requestHash = hashReceiveRequest(parsed.barcode);
  const replay = await findScanReplay(
    tenant,
    parsed.idempotencyKey,
    RECEIVE_OPERATION,
    requestHash,
  );
  if (replay) {
    return replay;
  }

  const context = await resolveActiveProductionHandlingContextForTenant(tenant);
  const product = await findProductByBarcode(
    prisma,
    tenant.organizationId,
    parsed.barcode,
  );

  if (!product) {
    throw new WorkerScanError(SCAN_ERROR_CODES.BARCODE_NOT_FOUND);
  }

  switch (product.status) {
    case ProductStatus.CREATED:
    case ProductStatus.READY_FOR_HANDOFF:
      return receiveProduct(
        context,
        product,
        normalizeBarcode(parsed.barcode),
        parsed.idempotencyKey,
        requestHash,
      );
    case ProductStatus.IN_PROGRESS:
      if (!product.currentWorkerId) {
        throw productStateChangedError();
      }

      if (product.currentWorkerId === context.employee.employeeId) {
        return toScanResult(
          product,
          "FINISH_CONFIRMATION_REQUIRED",
          parsed.barcode,
        );
      }

      return toScanResult(
        product,
        "TAKEOVER_CONFIRMATION_REQUIRED",
        parsed.barcode,
      );
    case ProductStatus.COMPLETED:
      return toScanResult(
        product,
        classifyCompleted(product, context),
        parsed.barcode,
      );
    case ProductStatus.CANCELLED:
    case ProductStatus.TRASHED:
      return toScanResult(product, "PRODUCT_NOT_RECEIVABLE", parsed.barcode);
    default:
      return toScanResult(product, "PRODUCT_NOT_RECEIVABLE", parsed.barcode);
  }
}

async function takeOverProductTransaction(
  context: ActiveProductionHandlingContext,
  barcode: string,
  expectedVersion: number,
  idempotencyKey: string,
  requestHash: string,
): Promise<WorkerScanResult> {
  return prisma.$transaction(async (database) => {
    await database.idempotencyKey.create({
      data: {
        organizationId: context.tenant.organizationId,
        userId: context.tenant.userId,
        actorMembershipId: context.tenant.membershipId,
        key: idempotencyKey,
        operation: TAKEOVER_OPERATION,
        requestHash,
      },
    });

    const product = await findProductByBarcode(
      database,
      context.tenant.organizationId,
      barcode,
    );
    if (!product) {
      throw new WorkerScanError(SCAN_ERROR_CODES.BARCODE_NOT_FOUND);
    }

    if (
      product.status !== ProductStatus.IN_PROGRESS ||
      !product.currentWorkerId ||
      product.currentWorkerId === context.employee.employeeId ||
      product.version !== expectedVersion
    ) {
      throw new WorkerScanError(SCAN_ERROR_CODES.TAKEOVER_NOT_ALLOWED);
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
        locationId: true,
        workflowStageId: true,
      },
    });
    if (
      !activeAssignment ||
      activeAssignment.employeeId !== product.currentWorkerId
    ) {
      throw productStateChangedError();
    }

    const currentContext = await revalidateHandlingContextInTransaction(
      database,
      context,
    );
    const occurredAt = new Date();
    const updated = await database.product.updateMany({
      where: {
        id: product.id,
        organizationId: context.tenant.organizationId,
        status: ProductStatus.IN_PROGRESS,
        version: expectedVersion,
        currentWorkerId: product.currentWorkerId,
      },
      data: {
        currentWorkerId: context.employee.employeeId,
        currentRoleId: currentContext.productionRole.id,
        currentLocationId: currentContext.handlingLocation.id,
        version: { increment: 1 },
      },
    });
    if (updated.count !== 1) {
      throw productStateChangedError();
    }

    const ended = await database.productAssignment.updateMany({
      where: { id: activeAssignment.id, endedAt: null },
      data: { endedAt: occurredAt, endReason: "TAKEN_OVER" },
    });
    if (ended.count !== 1) {
      throw productStateChangedError();
    }

    await database.productAssignment.create({
      data: {
        organizationId: context.tenant.organizationId,
        productId: product.id,
        employeeId: context.employee.employeeId,
        productionRoleId: currentContext.productionRole.id,
        locationId: currentContext.handlingLocation.id,
        workflowStageId: null,
        startedAt: occurredAt,
      },
    });

    await database.productTransition.create({
      data: {
        organizationId: context.tenant.organizationId,
        productId: product.id,
        actorUserId: context.tenant.userId,
        actorMembershipId: context.tenant.membershipId,
        eventType: "RESPONSIBILITY_TAKEN_OVER",
        fromStatus: ProductStatus.IN_PROGRESS,
        toStatus: ProductStatus.IN_PROGRESS,
        fromWorkerId: product.currentWorkerId,
        toWorkerId: context.employee.employeeId,
        fromRoleId: product.currentRoleId,
        toRoleId: currentContext.productionRole.id,
        fromLocationId: product.currentLocationId,
        toLocationId: currentContext.handlingLocation.id,
        fromStageId: product.currentStageId,
        toStageId: product.currentStageId,
        reason: "Explicit worker takeover",
        occurredAt,
      },
    });

    await database.auditLog.create({
      data: {
        organizationId: context.tenant.organizationId,
        actorUserId: context.tenant.userId,
        actorMembershipId: context.tenant.membershipId,
        action: "product.responsibility_taken_over",
        targetType: "Product",
        targetId: product.id,
        beforeData: {
          serialNumber: product.serialNumber,
          status: product.status,
          version: product.version,
          workerId: product.currentWorkerId,
          roleId: product.currentRoleId,
          locationId: product.currentLocationId,
        },
        afterData: {
          serialNumber: product.serialNumber,
          status: ProductStatus.IN_PROGRESS,
          version: product.version + 1,
          workerId: context.employee.employeeId,
          roleId: currentContext.productionRole.id,
          locationId: currentContext.handlingLocation.id,
        },
      },
    });

    const resultProduct = await findProductByBarcode(
      database,
      context.tenant.organizationId,
      barcode,
    );
    if (!resultProduct) {
      throw new WorkerScanError(SCAN_ERROR_CODES.SCAN_FAILED);
    }

    const result = toScanResult(resultProduct, "RECEIVED", barcode);
    await database.idempotencyKey.updateMany({
      where: {
        organizationId: context.tenant.organizationId,
        userId: context.tenant.userId,
        key: idempotencyKey,
        operation: TAKEOVER_OPERATION,
      },
      data: { resultReference: product.id, resultData: result },
    });

    return result;
  });
}

export async function takeOverProduct(
  input: WorkerTakeoverRequest,
): Promise<WorkerScanResult> {
  const parsed = parseWorkerTakeoverRequest(input);
  const tenant = await requirePermission("scans.perform");
  await requirePermission("scans.takeover");
  const requestHash = hashTakeoverRequest(
    parsed.barcode,
    parsed.expectedVersion,
  );
  const replay = await findScanReplay(
    tenant,
    parsed.idempotencyKey,
    TAKEOVER_OPERATION,
    requestHash,
  );
  if (replay) {
    return replay;
  }

  const context = await resolveActiveProductionHandlingContextForTenant(tenant);
  try {
    return await takeOverProductTransaction(
      context,
      parsed.barcode,
      parsed.expectedVersion,
      parsed.idempotencyKey,
      requestHash,
    );
  } catch (error) {
    if (hasUniqueTarget(error, ["organizationId", "userId", "key"])) {
      const idempotentReplay = await findScanReplay(
        tenant,
        parsed.idempotencyKey,
        TAKEOVER_OPERATION,
        requestHash,
      );
      if (idempotentReplay) {
        return idempotentReplay;
      }
    }

    throw error;
  }
}

export { isWorkerScanError };
