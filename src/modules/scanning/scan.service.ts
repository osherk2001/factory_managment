import "server-only";

import { createHash } from "node:crypto";

import {
  Prisma,
  ProductStatus,
  ProductTransitionEventType,
} from "@prisma/client";
import { z } from "zod";

import { prisma } from "@/lib/db/client";
import { requirePermission, type TenantContext } from "@/modules/authorization";
import { lockEmployeeForProductionMutation } from "@/modules/worker-context/production-context-lock";
import {
  mergeWorkflowTransitionMetadata,
  resolveWorkflowStageForRole,
} from "@/modules/workflows/server";
import type {
  ResolvedWorkflowStage,
  WorkflowStageResolution,
} from "@/modules/workflows/server";

import {
  resolveActiveProductionHandlingContextForTenant,
  resolveCurrentProductionHandlingContextInTransaction,
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
  ScanWorkflowDto,
  ScanWorkflowStageDto,
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
  completedAt: true,
  currentWorker: { select: { id: true, displayName: true } },
  currentRole: { select: { id: true, code: true, name: true } },
  currentLocation: {
    select: { id: true, code: true, name: true, departmentId: true },
  },
  workflowSnapshot: {
    select: {
      id: true,
      sourceVersion: true,
      sourceTemplate: { select: { name: true } },
      stages: {
        orderBy: [{ position: "asc" }, { code: "asc" }],
        select: {
          id: true,
          code: true,
          name: true,
          position: true,
          productionRole: { select: { id: true, code: true, name: true } },
        },
      },
    },
  },
  transitions: {
    where: { eventType: ProductTransitionEventType.PRODUCT_COMPLETED },
    orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
    take: 1,
    select: {
      actorUser: { select: { username: true } },
      actorMembership: {
        select: {
          employeeProfile: { select: { displayName: true } },
        },
      },
    },
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
  "WORKFLOW_STAGE_SELECTION_REQUIRED",
  "FINISH_CONFIRMATION_REQUIRED",
  "TAKEOVER_CONFIRMATION_REQUIRED",
  "COMPLETED_SAME_DEPARTMENT",
  "COMPLETED_OTHER_DEPARTMENT",
  "COMPLETED_CONTEXT_UNKNOWN",
  "PRODUCT_NOT_RECEIVABLE",
]);
const scanWorkflowStageSchema = z.object({
  id: z.string().uuid(),
  code: z.string(),
  name: z.string(),
  position: z.number().int().positive(),
  productionRole: z
    .object({ id: z.string().uuid(), code: z.string(), name: z.string() })
    .nullable(),
});
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
    completedAt: z.iso
      .datetime({ offset: true })
      .nullable()
      .optional()
      .transform((value) => value ?? null),
    completedBy: z
      .object({ displayName: z.string() })
      .nullable()
      .optional()
      .transform((value) => value ?? null),
    workflow: z
      .object({
        snapshotId: z.string().uuid(),
        templateName: z.string().nullable(),
        sourceVersion: z.number().int().positive().nullable(),
        currentStage: scanWorkflowStageSchema.nullable(),
        expectedNextStage: scanWorkflowStageSchema.nullable(),
        actualStage: scanWorkflowStageSchema.nullable(),
        movement: z
          .enum(["INITIAL", "FORWARD", "BACKWARD", "REPEAT", "UNMAPPED"])
          .nullable(),
        deviation: z.boolean(),
        isRework: z.boolean(),
        selectionCandidates: z.array(scanWorkflowStageSchema),
        selectionAction: z.enum(["RECEIVE", "TAKEOVER"]).nullable(),
      })
      .strict()
      .nullable()
      .optional()
      .transform((value) => value ?? null),
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

function hashReceiveRequest(
  barcode: string,
  selectedWorkflowStageId?: string | null,
): string {
  return hashRequest({
    barcode,
    intent: "receive",
    ...(selectedWorkflowStageId ? { selectedWorkflowStageId } : {}),
  });
}

function hashTakeoverRequest(
  barcode: string,
  expectedVersion: number,
  selectedWorkflowStageId?: string | null,
): string {
  return hashRequest({
    barcode,
    expectedVersion,
    intent: "takeover",
    ...(selectedWorkflowStageId ? { selectedWorkflowStageId } : {}),
  });
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
  database: ScanDatabase = prisma,
): Promise<WorkerScanResult | null> {
  const existing = await database.idempotencyKey.findUnique({
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

function toCompletedBy(
  product: ScannedProduct,
): { displayName: string } | null {
  const completion = product.transitions[0];
  if (!completion) {
    return null;
  }

  const displayName =
    completion.actorMembership.employeeProfile?.displayName ??
    completion.actorUser.username;
  return displayName ? { displayName } : null;
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

function toScanWorkflowStage(
  stage: NonNullable<ScannedProduct["workflowSnapshot"]>["stages"][number],
): ScanWorkflowStageDto {
  if (stage.position === null || stage.position <= 0) {
    throw new WorkerScanError(SCAN_ERROR_CODES.SCAN_FAILED);
  }

  return {
    id: stage.id,
    code: stage.code,
    name: stage.name,
    position: stage.position,
    productionRole: stage.productionRole,
  };
}

function defaultScanWorkflow(product: ScannedProduct): ScanWorkflowDto | null {
  if (!product.workflowSnapshot) {
    return null;
  }

  const stages = product.workflowSnapshot.stages.map(toScanWorkflowStage);
  const currentStage =
    stages.find((stage) => stage.id === product.currentStageId) ?? null;
  const expectedNextStage = currentStage
    ? (stages.find((stage) => stage.position > currentStage.position) ?? null)
    : (stages[0] ?? null);

  return {
    snapshotId: product.workflowSnapshot.id,
    templateName: product.workflowSnapshot.sourceTemplate?.name ?? null,
    sourceVersion: product.workflowSnapshot.sourceVersion,
    currentStage,
    expectedNextStage,
    actualStage: null,
    movement: null,
    deviation: false,
    isRework: false,
    selectionCandidates: [],
    selectionAction: null,
  };
}

function scanWorkflowForResolution(
  product: ScannedProduct,
  resolution: WorkflowStageResolution | undefined,
  selectionAction: "RECEIVE" | "TAKEOVER" | null,
): ScanWorkflowDto | null {
  const workflow = defaultScanWorkflow(product);
  if (!workflow || !resolution || resolution.kind === "NO_WORKFLOW") {
    return workflow;
  }

  if (resolution.kind === "SELECTION_REQUIRED") {
    return {
      ...workflow,
      currentStage: resolution.selection.currentStage,
      expectedNextStage: resolution.selection.expectedNextStage,
      selectionCandidates: resolution.selection.candidates,
      selectionAction,
    };
  }

  return {
    ...workflow,
    actualStage: resolution.stage,
    movement: resolution.movement,
    deviation: resolution.metadata?.deviation ?? false,
    isRework: resolution.metadata?.isRework ?? false,
  };
}

function toScanResult(
  product: ScannedProduct,
  scanOutcome: ScanOutcome,
  barcode: string,
  workflowResolution?: WorkflowStageResolution,
  selectionAction: "RECEIVE" | "TAKEOVER" | null = null,
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
    completedAt: product.completedAt?.toISOString() ?? null,
    completedBy: toCompletedBy(product),
    workflow: scanWorkflowForResolution(
      product,
      workflowResolution,
      selectionAction,
    ),
  };
}

function productStateChangedError(): WorkerScanError {
  return new WorkerScanError(SCAN_ERROR_CODES.SCAN_CONFLICT);
}

function isSerializationConflict(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2034"
  );
}

async function receiveProductTransaction(
  context: ActiveProductionHandlingContext,
  barcode: string,
  expectedStatus: "CREATED" | "READY_FOR_HANDOFF",
  expectedVersion: number,
  idempotencyKey: string,
  requestHash: string,
  selectedWorkflowStageId?: string | null,
): Promise<WorkerScanResult> {
  return prisma.$transaction(
    async (database) => {
      await lockEmployeeForProductionMutation(
        database,
        context.tenant.organizationId,
        context.employee.employeeId,
      );

      const currentContext =
        await resolveCurrentProductionHandlingContextInTransaction(
          database,
          context.tenant,
        );

      const committedReplay = await findScanReplay(
        currentContext.tenant,
        idempotencyKey,
        RECEIVE_OPERATION,
        requestHash,
        database,
      );
      if (committedReplay) {
        return committedReplay;
      }

      const product = await findProductByBarcode(
        database,
        currentContext.tenant.organizationId,
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
          organizationId: currentContext.tenant.organizationId,
          productId: product.id,
          endedAt: null,
        },
        select: { id: true },
      });
      if (activeAssignment) {
        throw productStateChangedError();
      }

      const workflowResolution = await resolveWorkflowStageForRole({
        database,
        organizationId: currentContext.tenant.organizationId,
        productId: product.id,
        currentStageId: product.currentStageId,
        productionRoleId: currentContext.productionRole.id,
        selectedWorkflowStageId,
      });
      if (workflowResolution.kind === "SELECTION_REQUIRED") {
        return toScanResult(
          product,
          "WORKFLOW_STAGE_SELECTION_REQUIRED",
          barcode,
          workflowResolution,
          "RECEIVE",
        );
      }
      const resolvedWorkflow: ResolvedWorkflowStage = workflowResolution;
      const nextStageId = resolvedWorkflow.stage?.id ?? product.currentStageId;

      await database.idempotencyKey.create({
        data: {
          organizationId: currentContext.tenant.organizationId,
          userId: currentContext.tenant.userId,
          actorMembershipId: currentContext.tenant.membershipId,
          key: idempotencyKey,
          operation: RECEIVE_OPERATION,
          requestHash,
        },
      });

      const occurredAt = new Date();
      const updated = await database.product.updateMany({
        where: {
          id: product.id,
          organizationId: currentContext.tenant.organizationId,
          status: expectedStatus,
          version: expectedVersion,
          currentWorkerId: null,
          currentRoleId: null,
          ...(expectedLocationId === null ? { currentLocationId: null } : {}),
        },
        data: {
          status: ProductStatus.IN_PROGRESS,
          currentWorkerId: currentContext.employee.employeeId,
          currentRoleId: currentContext.productionRole.id,
          currentLocationId: currentContext.handlingLocation.id,
          currentStageId: nextStageId,
          version: { increment: 1 },
        },
      });

      if (updated.count !== 1) {
        throw productStateChangedError();
      }

      await database.productAssignment.create({
        data: {
          organizationId: currentContext.tenant.organizationId,
          productId: product.id,
          employeeId: currentContext.employee.employeeId,
          productionRoleId: currentContext.productionRole.id,
          locationId: currentContext.handlingLocation.id,
          workflowStageId: resolvedWorkflow.stage?.id ?? null,
          startedAt: occurredAt,
        },
      });

      await database.productTransition.create({
        data: {
          organizationId: currentContext.tenant.organizationId,
          productId: product.id,
          actorUserId: currentContext.tenant.userId,
          actorMembershipId: currentContext.tenant.membershipId,
          eventType: "PRODUCT_RECEIVED",
          fromStatus: expectedStatus,
          toStatus: ProductStatus.IN_PROGRESS,
          fromWorkerId: product.currentWorkerId,
          toWorkerId: currentContext.employee.employeeId,
          fromRoleId: product.currentRoleId,
          toRoleId: currentContext.productionRole.id,
          fromLocationId: product.currentLocationId,
          toLocationId: currentContext.handlingLocation.id,
          fromStageId: product.currentStageId,
          toStageId: nextStageId,
          metadata: mergeWorkflowTransitionMetadata(
            null,
            resolvedWorkflow.metadata,
          ),
          occurredAt,
        },
      });

      const resultProduct = await findProductByBarcode(
        database,
        currentContext.tenant.organizationId,
        barcode,
      );
      if (!resultProduct) {
        throw new WorkerScanError(SCAN_ERROR_CODES.SCAN_FAILED);
      }

      const result = toScanResult(
        resultProduct,
        "RECEIVED",
        barcode,
        resolvedWorkflow,
      );
      await database.idempotencyKey.updateMany({
        where: {
          organizationId: currentContext.tenant.organizationId,
          userId: currentContext.tenant.userId,
          key: idempotencyKey,
          operation: RECEIVE_OPERATION,
        },
        data: { resultReference: product.id, resultData: result },
      });

      return result;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
  );
}

async function receiveProduct(
  context: ActiveProductionHandlingContext,
  product: ScannedProduct,
  barcode: string,
  idempotencyKey: string,
  requestHash: string,
  selectedWorkflowStageId?: string | null,
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
      selectedWorkflowStageId,
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

    if (isSerializationConflict(error)) {
      throw productStateChangedError();
    }

    throw error;
  }
}

export async function scanProduct(
  input: WorkerScanRequest,
): Promise<WorkerScanResult> {
  const parsed = parseWorkerScanRequest(input);
  const tenant = await requirePermission("scans.perform");
  const requestHash = hashReceiveRequest(
    parsed.barcode,
    parsed.selectedWorkflowStageId,
  );
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
        parsed.selectedWorkflowStageId,
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
  selectedWorkflowStageId?: string | null,
): Promise<WorkerScanResult> {
  return prisma.$transaction(
    async (database) => {
      await lockEmployeeForProductionMutation(
        database,
        context.tenant.organizationId,
        context.employee.employeeId,
      );

      const currentContext =
        await resolveCurrentProductionHandlingContextInTransaction(
          database,
          context.tenant,
        );

      const committedReplay = await findScanReplay(
        currentContext.tenant,
        idempotencyKey,
        TAKEOVER_OPERATION,
        requestHash,
        database,
      );
      if (committedReplay) {
        return committedReplay;
      }

      const product = await findProductByBarcode(
        database,
        currentContext.tenant.organizationId,
        barcode,
      );
      if (!product) {
        throw new WorkerScanError(SCAN_ERROR_CODES.BARCODE_NOT_FOUND);
      }

      if (
        product.status !== ProductStatus.IN_PROGRESS ||
        !product.currentWorkerId ||
        product.currentWorkerId === currentContext.employee.employeeId
      ) {
        throw new WorkerScanError(SCAN_ERROR_CODES.TAKEOVER_NOT_ALLOWED);
      }

      if (product.version !== expectedVersion) {
        throw productStateChangedError();
      }

      const activeAssignment = await database.productAssignment.findFirst({
        where: {
          organizationId: currentContext.tenant.organizationId,
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
      if (!activeAssignment) {
        throw new WorkerScanError(SCAN_ERROR_CODES.TAKEOVER_NOT_ALLOWED);
      }

      if (activeAssignment.employeeId !== product.currentWorkerId) {
        throw productStateChangedError();
      }

      const workflowResolution = await resolveWorkflowStageForRole({
        database,
        organizationId: currentContext.tenant.organizationId,
        productId: product.id,
        currentStageId: product.currentStageId,
        productionRoleId: currentContext.productionRole.id,
        selectedWorkflowStageId,
      });
      if (workflowResolution.kind === "SELECTION_REQUIRED") {
        return toScanResult(
          product,
          "WORKFLOW_STAGE_SELECTION_REQUIRED",
          barcode,
          workflowResolution,
          "TAKEOVER",
        );
      }
      const resolvedWorkflow: ResolvedWorkflowStage = workflowResolution;
      const nextStageId = resolvedWorkflow.stage?.id ?? product.currentStageId;

      await database.idempotencyKey.create({
        data: {
          organizationId: currentContext.tenant.organizationId,
          userId: currentContext.tenant.userId,
          actorMembershipId: currentContext.tenant.membershipId,
          key: idempotencyKey,
          operation: TAKEOVER_OPERATION,
          requestHash,
        },
      });

      const occurredAt = new Date();
      const updated = await database.product.updateMany({
        where: {
          id: product.id,
          organizationId: currentContext.tenant.organizationId,
          status: ProductStatus.IN_PROGRESS,
          version: expectedVersion,
          currentWorkerId: product.currentWorkerId,
        },
        data: {
          currentWorkerId: currentContext.employee.employeeId,
          currentRoleId: currentContext.productionRole.id,
          currentLocationId: currentContext.handlingLocation.id,
          currentStageId: nextStageId,
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
          organizationId: currentContext.tenant.organizationId,
          productId: product.id,
          employeeId: currentContext.employee.employeeId,
          productionRoleId: currentContext.productionRole.id,
          locationId: currentContext.handlingLocation.id,
          workflowStageId: resolvedWorkflow.stage?.id ?? null,
          startedAt: occurredAt,
        },
      });

      await database.productTransition.create({
        data: {
          organizationId: currentContext.tenant.organizationId,
          productId: product.id,
          actorUserId: currentContext.tenant.userId,
          actorMembershipId: currentContext.tenant.membershipId,
          eventType: "RESPONSIBILITY_TAKEN_OVER",
          fromStatus: ProductStatus.IN_PROGRESS,
          toStatus: ProductStatus.IN_PROGRESS,
          fromWorkerId: product.currentWorkerId,
          toWorkerId: currentContext.employee.employeeId,
          fromRoleId: product.currentRoleId,
          toRoleId: currentContext.productionRole.id,
          fromLocationId: product.currentLocationId,
          toLocationId: currentContext.handlingLocation.id,
          fromStageId: product.currentStageId,
          toStageId: nextStageId,
          reason: "Explicit worker takeover",
          metadata: mergeWorkflowTransitionMetadata(
            null,
            resolvedWorkflow.metadata,
          ),
          occurredAt,
        },
      });

      await database.auditLog.create({
        data: {
          organizationId: currentContext.tenant.organizationId,
          actorUserId: currentContext.tenant.userId,
          actorMembershipId: currentContext.tenant.membershipId,
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
            workflowStageId: activeAssignment.workflowStageId,
          },
          afterData: {
            serialNumber: product.serialNumber,
            status: ProductStatus.IN_PROGRESS,
            version: product.version + 1,
            workerId: currentContext.employee.employeeId,
            roleId: currentContext.productionRole.id,
            locationId: currentContext.handlingLocation.id,
            workflowStageId: resolvedWorkflow.stage?.id ?? null,
          },
        },
      });

      const resultProduct = await findProductByBarcode(
        database,
        currentContext.tenant.organizationId,
        barcode,
      );
      if (!resultProduct) {
        throw new WorkerScanError(SCAN_ERROR_CODES.SCAN_FAILED);
      }

      const result = toScanResult(
        resultProduct,
        "RECEIVED",
        barcode,
        resolvedWorkflow,
      );
      await database.idempotencyKey.updateMany({
        where: {
          organizationId: currentContext.tenant.organizationId,
          userId: currentContext.tenant.userId,
          key: idempotencyKey,
          operation: TAKEOVER_OPERATION,
        },
        data: { resultReference: product.id, resultData: result },
      });

      return result;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
  );
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
    parsed.selectedWorkflowStageId,
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
      parsed.selectedWorkflowStageId,
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

    if (isSerializationConflict(error)) {
      const idempotentReplay = await findScanReplay(
        tenant,
        parsed.idempotencyKey,
        TAKEOVER_OPERATION,
        requestHash,
      );
      if (idempotentReplay) {
        return idempotentReplay;
      }

      throw productStateChangedError();
    }

    throw error;
  }
}

export { isWorkerScanError };
