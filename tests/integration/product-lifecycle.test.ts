import "dotenv/config";

import { randomUUID } from "node:crypto";

import { ProductStatus } from "@prisma/client";
import type { Session } from "next-auth";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("../../src/auth", () => ({ auth: vi.fn() }));

import { auth } from "../../src/auth";
import { prisma } from "../../src/lib/db/client";
import { scanProduct } from "../../src/modules/scanning/server";
import {
  isWorkerScanError,
  SCAN_ERROR_CODES,
} from "../../src/modules/scanning/scan-errors";
import * as productionContextLock from "../../src/modules/worker-context/production-context-lock";
import {
  cancelProduct,
  completeProduct,
  finishProduct,
  restoreProduct,
  returnCompletedProductToProcess,
  trashProduct,
} from "../../src/modules/products/server";
import {
  isProductLifecycleError,
  PRODUCT_LIFECYCLE_ERROR_CODES,
} from "../../src/modules/products";
import { selectActiveProductionRole } from "../../src/modules/worker-context/server";

const suffix = `${Date.now()}-${randomUUID().slice(0, 8)}`;
const authMock = auth as unknown as {
  mockResolvedValue: (value: Session | null) => void;
  mockImplementation: (implementation: () => Promise<Session | null>) => void;
};

type Actor = {
  user: { id: string; username: string };
  membership: { id: string };
  employee: { id: string; displayName: string };
};

let organizationA: { id: string };
let organizationB: { id: string };
let locationA: { id: string };
let locationB: { id: string };
let roleA: { id: string };
let roleB: { id: string };
let workerA: Actor;
let workerB: Actor;
let noReopenWorker: Actor;
let manager: Actor;
const permissions = new Map<string, { id: string }>();

function sessionFor(actor: Actor): Session {
  return {
    user: {
      id: actor.user.id,
      username: actor.user.username,
      name: actor.user.username,
    },
    expires: new Date(Date.now() + 60_000).toISOString(),
  };
}

function setSession(actor: Actor) {
  authMock.mockResolvedValue(sessionFor(actor));
}

async function setWorkerARole(roleId: string) {
  await prisma.workerProductionContext.upsert({
    where: {
      organizationId_employeeId: {
        organizationId: organizationA.id,
        employeeId: workerA.employee.id,
      },
    },
    create: {
      organizationId: organizationA.id,
      employeeId: workerA.employee.id,
      activeProductionRoleId: roleId,
    },
    update: { activeProductionRoleId: roleId },
  });
}

async function createActor(
  name: string,
  permissionCodes: readonly string[],
  options: { organizationId?: string; displayName?: string } = {},
): Promise<Actor> {
  const organizationId = options.organizationId ?? organizationA.id;
  const user = await prisma.user.create({
    data: { username: `phase8-${name}-${suffix}` },
    select: { id: true, username: true },
  });
  const membership = await prisma.membership.create({
    data: { organizationId, userId: user.id, status: "ACTIVE" },
    select: { id: true },
  });
  const employee = await prisma.employeeProfile.create({
    data: {
      organizationId,
      membershipId: membership.id,
      displayName: options.displayName ?? `Phase 8 ${name}`,
    },
    select: { id: true, displayName: true },
  });
  if (!user.username) {
    throw new Error("Phase 8 fixture user must have a username");
  }
  const accessRole = await prisma.accessRole.create({
    data: {
      organizationId,
      code: `PHASE8_${name.toUpperCase()}_${suffix}`,
      name: `Phase 8 ${name}`,
    },
    select: { id: true },
  });
  const permissionLinks = permissionCodes.map((code) => {
    const permission = permissions.get(code);
    if (!permission) {
      throw new Error(`Missing Phase 8 permission ${code}`);
    }
    return { accessRoleId: accessRole.id, permissionId: permission.id };
  });
  await prisma.accessRolePermission.createMany({
    data: permissionLinks,
  });
  await prisma.membershipAccessRole.create({
    data: {
      organizationId,
      membershipId: membership.id,
      accessRoleId: accessRole.id,
    },
  });

  return {
    user: { id: user.id, username: user.username },
    membership,
    employee,
  };
}

async function createProduct(
  name: string,
  options: {
    organizationId?: string;
    status?: ProductStatus;
    currentWorkerId?: string | null;
    currentRoleId?: string | null;
    currentLocationId?: string | null;
    version?: number;
    completedAt?: Date | null;
    cancelledAt?: Date | null;
  } = {},
) {
  const organizationId = options.organizationId ?? organizationA.id;
  const product = await prisma.product.create({
    data: {
      organizationId,
      serialNumber: `PRD-2026-${name}-${randomUUID().slice(0, 8)}`,
      status: options.status ?? ProductStatus.CREATED,
      currentWorkerId: options.currentWorkerId ?? null,
      currentRoleId: options.currentRoleId ?? null,
      currentLocationId: options.currentLocationId ?? null,
      version: options.version ?? 0,
      completedAt: options.completedAt ?? null,
      cancelledAt: options.cancelledAt ?? null,
    },
    select: { id: true, serialNumber: true, version: true },
  });
  const barcode = await prisma.barcode.create({
    data: {
      organizationId,
      productId: product.id,
      value: `phase8_${name}_${randomUUID()}`,
    },
    select: { value: true },
  });
  return { ...product, barcode: barcode.value };
}

async function createAssignment(
  productId: string,
  actor: Actor,
  roleId: string = roleA.id,
  locationId: string | null = locationA.id,
) {
  return prisma.productAssignment.create({
    data: {
      organizationId: organizationA.id,
      productId,
      employeeId: actor.employee.id,
      productionRoleId: roleId,
      locationId,
    },
  });
}

function lifecycleInput(
  productId: string,
  expectedVersion: number,
  idempotencyKey = randomUUID(),
) {
  return { productId, expectedVersion, idempotencyKey };
}

async function expectLifecycleError(operation: Promise<unknown>, code: string) {
  await expect(operation).rejects.toSatisfy((error: unknown) => {
    return isProductLifecycleError(error) && error.code === code;
  });
}

describe.sequential("Phase 8 Product lifecycle actions", () => {
  beforeAll(async () => {
    [organizationA, organizationB] = await Promise.all([
      prisma.organization.create({
        data: {
          name: `Phase 8 Factory A ${suffix}`,
          slug: `phase8-a-${suffix}`,
        },
        select: { id: true },
      }),
      prisma.organization.create({
        data: {
          name: `Phase 8 Factory B ${suffix}`,
          slug: `phase8-b-${suffix}`,
        },
        select: { id: true },
      }),
    ]);

    const permissionCodes = [
      "products.read",
      "products.complete",
      "products.reopen",
      "products.cancel",
      "products.restore",
      "products.trash",
      "scans.perform",
    ];
    await Promise.all(
      permissionCodes.map(async (code) => {
        const permission = await prisma.permission.upsert({
          where: { code },
          update: {},
          create: { code, description: `Phase 8 ${code}` },
          select: { id: true },
        });
        permissions.set(code, permission);
      }),
    );

    const [departmentA, departmentB] = await Promise.all([
      prisma.department.create({
        data: {
          organizationId: organizationA.id,
          code: `PHASE8-A-${suffix}`,
          name: "Phase 8 Department A",
        },
        select: { id: true },
      }),
      prisma.department.create({
        data: {
          organizationId: organizationA.id,
          code: `PHASE8-B-${suffix}`,
          name: "Phase 8 Department B",
        },
        select: { id: true },
      }),
    ]);
    [locationA, locationB] = await Promise.all([
      prisma.location.create({
        data: {
          organizationId: organizationA.id,
          departmentId: departmentA.id,
          code: `PHASE8-A-${suffix}`,
          name: "Phase 8 Location A",
          type: "WORK_AREA",
        },
        select: { id: true },
      }),
      prisma.location.create({
        data: {
          organizationId: organizationA.id,
          departmentId: departmentB.id,
          code: `PHASE8-B-${suffix}`,
          name: "Phase 8 Location B",
          type: "WORK_AREA",
        },
        select: { id: true },
      }),
    ]);
    [roleA, roleB] = await Promise.all([
      prisma.productionRole.create({
        data: {
          organizationId: organizationA.id,
          code: `PHASE8-ROLE-A-${suffix}`,
          name: "Phase 8 Role A",
        },
        select: { id: true },
      }),
      prisma.productionRole.create({
        data: {
          organizationId: organizationA.id,
          code: `PHASE8-ROLE-B-${suffix}`,
          name: "Phase 8 Role B",
        },
        select: { id: true },
      }),
    ]);

    workerA = await createActor("worker-a", [
      "products.read",
      "scans.perform",
      "products.reopen",
    ]);
    workerB = await createActor("worker-b", ["products.read", "scans.perform"]);
    noReopenWorker = await createActor("no-reopen", [
      "products.read",
      "scans.perform",
    ]);
    manager = await createActor(
      "manager",
      [
        "products.read",
        "products.complete",
        "products.reopen",
        "products.cancel",
        "products.restore",
        "products.trash",
        "scans.perform",
      ],
      { displayName: "Phase 8 Manager" },
    );

    await prisma.employeeProductionRole.createMany({
      data: [
        {
          organizationId: organizationA.id,
          employeeId: workerA.employee.id,
          productionRoleId: roleA.id,
          handlingLocationId: locationA.id,
        },
        {
          organizationId: organizationA.id,
          employeeId: workerB.employee.id,
          productionRoleId: roleA.id,
          handlingLocationId: locationB.id,
        },
      ],
    });
  });

  afterAll(async () => {
    const organizationIds = [organizationA?.id, organizationB?.id].filter(
      (id): id is string => Boolean(id),
    );
    await prisma.idempotencyKey.deleteMany({
      where: { organizationId: { in: organizationIds } },
    });
    await prisma.auditLog.deleteMany({
      where: { organizationId: { in: organizationIds } },
    });
    await prisma.productTransition.deleteMany({
      where: { organizationId: { in: organizationIds } },
    });
    await prisma.productAssignment.deleteMany({
      where: { organizationId: { in: organizationIds } },
    });
    await prisma.barcode.deleteMany({
      where: { organizationId: { in: organizationIds } },
    });
    await prisma.product.deleteMany({
      where: { organizationId: { in: organizationIds } },
    });
    await prisma.workerProductionContext.deleteMany({
      where: { organizationId: organizationA.id },
    });
    await prisma.employeeProductionRole.deleteMany({
      where: { organizationId: organizationA.id },
    });
    const accessRoles = await prisma.accessRole.findMany({
      where: { organizationId: organizationA.id },
      select: { id: true },
    });
    await prisma.membershipAccessRole.deleteMany({
      where: { accessRoleId: { in: accessRoles.map((role) => role.id) } },
    });
    await prisma.accessRolePermission.deleteMany({
      where: { accessRoleId: { in: accessRoles.map((role) => role.id) } },
    });
    await prisma.accessRole.deleteMany({
      where: { id: { in: accessRoles.map((role) => role.id) } },
    });
    await prisma.employeeProfile.deleteMany({
      where: { organizationId: organizationA.id },
    });
    await prisma.membership.deleteMany({
      where: { organizationId: organizationA.id },
    });
    await prisma.user.deleteMany({ where: { username: { contains: suffix } } });
    await prisma.location.deleteMany({
      where: { organizationId: organizationA.id },
    });
    await prisma.department.deleteMany({
      where: { organizationId: organizationA.id },
    });
    await prisma.productionRole.deleteMany({
      where: { organizationId: { in: organizationIds } },
    });
    await prisma.organization.deleteMany({
      where: { id: { in: organizationIds } },
    });
    await prisma.$disconnect();
  });

  it("finishes valid work using the original assignment role", async () => {
    const product = await createProduct("finish", {
      status: ProductStatus.IN_PROGRESS,
      currentWorkerId: workerA.employee.id,
      currentRoleId: roleA.id,
      currentLocationId: locationA.id,
      version: 4,
    });
    await createAssignment(product.id, workerA, roleA.id, locationA.id);
    setSession(workerA);

    const result = await finishProduct(lifecycleInput(product.id, 4));
    expect(result).toMatchObject({
      productId: product.id,
      status: "READY_FOR_HANDOFF",
      version: 5,
      currentWorker: null,
      currentRole: null,
      currentLocation: { id: locationA.id },
    });
    await expect(
      prisma.productAssignment.findFirstOrThrow({
        where: { productId: product.id },
        select: { productionRoleId: true, endedAt: true, endReason: true },
      }),
    ).resolves.toMatchObject({
      productionRoleId: roleA.id,
      endReason: "FINISHED",
    });
    await expect(
      prisma.productTransition.findFirstOrThrow({
        where: { productId: product.id },
        select: {
          eventType: true,
          fromStatus: true,
          toStatus: true,
          fromWorkerId: true,
          toWorkerId: true,
          fromRoleId: true,
          toRoleId: true,
          fromLocationId: true,
          toLocationId: true,
        },
      }),
    ).resolves.toEqual({
      eventType: "WORK_FINISHED",
      fromStatus: "IN_PROGRESS",
      toStatus: "READY_FOR_HANDOFF",
      fromWorkerId: workerA.employee.id,
      toWorkerId: null,
      fromRoleId: roleA.id,
      toRoleId: null,
      fromLocationId: locationA.id,
      toLocationId: locationA.id,
    });
    await expect(
      prisma.productAssignment.count({
        where: { productId: product.id, endedAt: null },
      }),
    ).resolves.toBe(0);
  });

  it("rejects another worker and stale finish requests", async () => {
    const product = await createProduct("finish-guards", {
      status: ProductStatus.IN_PROGRESS,
      currentWorkerId: workerA.employee.id,
      currentRoleId: roleA.id,
      currentLocationId: locationA.id,
      version: 2,
    });
    await createAssignment(product.id, workerA);

    setSession(workerB);
    await expectLifecycleError(
      finishProduct(lifecycleInput(product.id, 2)),
      PRODUCT_LIFECYCLE_ERROR_CODES.PRODUCT_NOT_FINISHABLE,
    );
    setSession(workerA);
    await expectLifecycleError(
      finishProduct(lifecycleInput(product.id, 1)),
      PRODUCT_LIFECYCLE_ERROR_CODES.PRODUCT_STATE_CHANGED,
    );
    await expect(
      prisma.product.findUniqueOrThrow({
        where: { id: product.id },
        select: { status: true, version: true },
      }),
    ).resolves.toEqual({ status: ProductStatus.IN_PROGRESS, version: 2 });
  });

  it("does not rewrite Finish history when the worker changes active role", async () => {
    await prisma.employeeProductionRole.create({
      data: {
        organizationId: organizationA.id,
        employeeId: workerA.employee.id,
        productionRoleId: roleB.id,
        handlingLocationId: locationB.id,
      },
    });
    await prisma.workerProductionContext.upsert({
      where: {
        organizationId_employeeId: {
          organizationId: organizationA.id,
          employeeId: workerA.employee.id,
        },
      },
      create: {
        organizationId: organizationA.id,
        employeeId: workerA.employee.id,
        activeProductionRoleId: roleB.id,
      },
      update: { activeProductionRoleId: roleB.id },
    });
    const product = await createProduct("finish-original-role", {
      status: ProductStatus.IN_PROGRESS,
      currentWorkerId: workerA.employee.id,
      currentRoleId: roleA.id,
      currentLocationId: locationA.id,
      version: 1,
    });
    await createAssignment(product.id, workerA, roleA.id, locationA.id);
    setSession(workerA);

    await finishProduct(lifecycleInput(product.id, 1));
    await expect(
      prisma.productTransition.findFirstOrThrow({
        where: { productId: product.id },
        select: { fromRoleId: true, toRoleId: true },
      }),
    ).resolves.toEqual({ fromRoleId: roleA.id, toRoleId: null });
    await expect(
      prisma.productAssignment.findFirstOrThrow({
        where: { productId: product.id },
        select: { productionRoleId: true },
      }),
    ).resolves.toEqual({ productionRoleId: roleA.id });
  });

  it("is idempotent for duplicate Finish requests", async () => {
    const product = await createProduct("finish-idempotent", {
      status: ProductStatus.IN_PROGRESS,
      currentWorkerId: workerA.employee.id,
      currentRoleId: roleA.id,
      currentLocationId: locationA.id,
      version: 0,
    });
    await createAssignment(product.id, workerA);
    setSession(workerA);
    const request = lifecycleInput(product.id, 0);
    const results = await Promise.all([
      finishProduct(request),
      finishProduct(request),
    ]);
    expect(results[0]).toEqual(results[1]);
    await expect(
      prisma.productTransition.count({
        where: { productId: product.id, eventType: "WORK_FINISHED" },
      }),
    ).resolves.toBe(1);
    await prisma.product.update({
      where: { id: product.id },
      data: { version: 20 },
    });
    await expect(finishProduct(request)).resolves.toEqual(results[0]);
    await expect(
      finishProduct({ ...request, expectedVersion: 20 }),
    ).rejects.toMatchObject({
      code: PRODUCT_LIFECYCLE_ERROR_CODES.IDEMPOTENCY_CONFLICT,
    });
  });

  it("completes only READY_FOR_HANDOFF and records safe completion history", async () => {
    const product = await createProduct("complete", {
      status: ProductStatus.READY_FOR_HANDOFF,
      currentLocationId: locationA.id,
      version: 7,
    });
    setSession(manager);
    const result = await completeProduct(lifecycleInput(product.id, 7));
    expect(result).toMatchObject({
      status: "COMPLETED",
      version: 8,
      currentWorker: null,
      currentRole: null,
      currentLocation: { id: locationA.id },
    });
    expect(result.completedAt).toEqual(expect.any(String));
    await expect(
      prisma.auditLog.findFirstOrThrow({
        where: { targetId: product.id },
        select: { action: true, beforeData: true, afterData: true },
      }),
    ).resolves.toMatchObject({ action: "product.completed" });
    await expect(
      prisma.productTransition.findFirstOrThrow({
        where: { productId: product.id },
        select: { eventType: true, fromStatus: true, toStatus: true },
      }),
    ).resolves.toEqual({
      eventType: "PRODUCT_COMPLETED",
      fromStatus: "READY_FOR_HANDOFF",
      toStatus: "COMPLETED",
    });

    await setWorkerARole(roleA.id);
    setSession(workerA);
    await expect(
      scanProduct({ barcode: product.barcode, idempotencyKey: randomUUID() }),
    ).resolves.toMatchObject({
      scanOutcome: "COMPLETED_SAME_DEPARTMENT",
      completedBy: { displayName: manager.employee.displayName },
    });
  });

  it("requires products.complete and rejects invalid completion states", async () => {
    const product = await createProduct("complete-permission", {
      status: ProductStatus.READY_FOR_HANDOFF,
      version: 0,
    });
    setSession(workerA);
    await expect(
      completeProduct(lifecycleInput(product.id, 0)),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
    });

    setSession(manager);
    for (const status of [
      ProductStatus.CREATED,
      ProductStatus.IN_PROGRESS,
      ProductStatus.COMPLETED,
      ProductStatus.CANCELLED,
      ProductStatus.TRASHED,
    ]) {
      const invalid = await createProduct(`not-completable-${status}`, {
        status,
        version: 0,
      });
      await expectLifecycleError(
        completeProduct(lifecycleInput(invalid.id, 0)),
        PRODUCT_LIFECYCLE_ERROR_CODES.PRODUCT_NOT_COMPLETABLE,
      );
    }
  });

  it("returns a completed Product with both permissions and a new assignment", async () => {
    await setWorkerARole(roleA.id);
    const product = await createProduct("return", {
      status: ProductStatus.COMPLETED,
      currentLocationId: locationB.id,
      completedAt: new Date(),
      version: 3,
    });
    setSession(workerA);
    const result = await returnCompletedProductToProcess(
      lifecycleInput(product.id, 3),
    );
    expect(result).toMatchObject({
      status: "IN_PROGRESS",
      version: 4,
      currentWorker: { id: workerA.employee.id },
      currentRole: { id: roleA.id },
      currentLocation: { id: locationA.id },
      completedAt: null,
    });
    await expect(
      prisma.productAssignment.findFirstOrThrow({
        where: { productId: product.id, endedAt: null },
        select: {
          employeeId: true,
          productionRoleId: true,
          locationId: true,
          workflowStageId: true,
        },
      }),
    ).resolves.toEqual({
      employeeId: workerA.employee.id,
      productionRoleId: roleA.id,
      locationId: locationA.id,
      workflowStageId: null,
    });
    await expect(
      prisma.auditLog.findFirstOrThrow({
        where: { targetId: product.id },
        select: { action: true },
      }),
    ).resolves.toEqual({ action: "product.returned_to_process" });
  });

  it("requires both reopen and scan permissions for return-to-process", async () => {
    const product = await createProduct("return-permission", {
      status: ProductStatus.COMPLETED,
      version: 0,
    });
    setSession(noReopenWorker);
    await expect(
      returnCompletedProductToProcess(lifecycleInput(product.id, 0)),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("serializes Finish versus Cancel with one winning state transition", async () => {
    const product = await createProduct("finish-cancel-race", {
      status: ProductStatus.IN_PROGRESS,
      currentWorkerId: workerA.employee.id,
      currentRoleId: roleA.id,
      currentLocationId: locationA.id,
      version: 0,
    });
    await createAssignment(product.id, workerA);
    let authCall = 0;
    authMock.mockImplementation(async () => {
      const actor = authCall++ === 0 ? workerA : manager;
      return sessionFor(actor);
    });

    const results = await Promise.allSettled([
      finishProduct(lifecycleInput(product.id, 0)),
      cancelProduct(lifecycleInput(product.id, 0)),
    ]);
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      results.filter((result) => result.status === "rejected"),
    ).toHaveLength(1);
    const rejected = results.find((result) => result.status === "rejected");
    expect(rejected?.status).toBe("rejected");
    if (!rejected || rejected.status !== "rejected") {
      throw new Error(
        "The Finish versus Cancel race did not reject an operation.",
      );
    }
    expect(
      isProductLifecycleError(rejected.reason) &&
        rejected.reason.code ===
          PRODUCT_LIFECYCLE_ERROR_CODES.PRODUCT_STATE_CHANGED,
    ).toBe(true);
    const finalProduct = await prisma.product.findUniqueOrThrow({
      where: { id: product.id },
      select: {
        status: true,
        version: true,
        currentWorkerId: true,
        currentRoleId: true,
      },
    });
    expect([
      ProductStatus.READY_FOR_HANDOFF,
      ProductStatus.CANCELLED,
    ]).toContain(finalProduct.status);
    expect(finalProduct).toMatchObject({
      version: 1,
      currentWorkerId: null,
      currentRoleId: null,
    });
    await expect(
      prisma.productAssignment.count({
        where: { productId: product.id, endedAt: null },
      }),
    ).resolves.toBe(0);

    const transitions = await prisma.productTransition.findMany({
      where: { productId: product.id },
      select: { eventType: true },
    });
    expect(transitions).toHaveLength(1);
    const assignment = await prisma.productAssignment.findFirstOrThrow({
      where: { productId: product.id },
      select: { endReason: true },
    });
    if (finalProduct.status === ProductStatus.READY_FOR_HANDOFF) {
      expect(transitions).toEqual([{ eventType: "WORK_FINISHED" }]);
      expect(assignment.endReason).toBe("FINISHED");
    } else {
      expect(finalProduct.status).toBe(ProductStatus.CANCELLED);
      expect(transitions).toEqual([{ eventType: "PRODUCT_CANCELLED" }]);
      expect(assignment.endReason).toBe("CANCELLED");
    }
  });

  it("serializes receive versus Complete from READY_FOR_HANDOFF", async () => {
    const product = await createProduct("receive-complete-race", {
      status: ProductStatus.READY_FOR_HANDOFF,
      currentLocationId: locationA.id,
      version: 0,
    });
    await setWorkerARole(roleA.id);
    let authCall = 0;
    authMock.mockImplementation(async () => {
      const actor = authCall++ === 0 ? workerA : manager;
      return sessionFor(actor);
    });

    const [scanResult, completeResult] = await Promise.allSettled([
      scanProduct({ barcode: product.barcode, idempotencyKey: randomUUID() }),
      completeProduct(lifecycleInput(product.id, 0)),
    ]);
    const finalProduct = await prisma.product.findUniqueOrThrow({
      where: { id: product.id },
      select: {
        status: true,
        version: true,
        currentWorkerId: true,
        currentRoleId: true,
        currentLocationId: true,
        completedAt: true,
      },
    });
    expect(finalProduct.version).toBe(1);

    const [
      receivedTransitionCount,
      completedTransitionCount,
      completionAuditCount,
      activeAssignmentCount,
    ] = await Promise.all([
      prisma.productTransition.count({
        where: { productId: product.id, eventType: "PRODUCT_RECEIVED" },
      }),
      prisma.productTransition.count({
        where: { productId: product.id, eventType: "PRODUCT_COMPLETED" },
      }),
      prisma.auditLog.count({
        where: { targetId: product.id, action: "product.completed" },
      }),
      prisma.productAssignment.count({
        where: { productId: product.id, endedAt: null },
      }),
    ]);
    expect(receivedTransitionCount + completedTransitionCount).toBe(1);

    if (finalProduct.status === ProductStatus.IN_PROGRESS) {
      expect(scanResult.status).toBe("fulfilled");
      if (scanResult.status !== "fulfilled") {
        throw new Error("Receive won without a successful scan result.");
      }
      expect(scanResult.value).toMatchObject({
        scanOutcome: "RECEIVED",
        status: "IN_PROGRESS",
        version: 1,
      });
      expect(completeResult.status).toBe("rejected");
      if (completeResult.status !== "rejected") {
        throw new Error("Receive won without rejecting Complete.");
      }
      expect(isProductLifecycleError(completeResult.reason)).toBe(true);
      if (!isProductLifecycleError(completeResult.reason)) {
        throw new Error("Complete failed with an unexpected error type.");
      }
      expect(completeResult.reason.code).toBe(
        PRODUCT_LIFECYCLE_ERROR_CODES.PRODUCT_STATE_CHANGED,
      );
      expect(finalProduct).toMatchObject({
        currentWorkerId: workerA.employee.id,
        currentRoleId: roleA.id,
        currentLocationId: locationA.id,
        completedAt: null,
      });
      expect(activeAssignmentCount).toBe(1);
      expect(receivedTransitionCount).toBe(1);
      expect(completedTransitionCount).toBe(0);
      expect(completionAuditCount).toBe(0);
    } else {
      expect(finalProduct.status).toBe(ProductStatus.COMPLETED);
      expect(completeResult.status).toBe("fulfilled");
      if (completeResult.status !== "fulfilled") {
        throw new Error("Complete won without a successful lifecycle result.");
      }
      expect(completeResult.value).toMatchObject({
        status: "COMPLETED",
        version: 1,
      });
      if (scanResult.status === "fulfilled") {
        expect(scanResult.value.status).toBe("COMPLETED");
        expect(scanResult.value.scanOutcome).not.toBe("RECEIVED");
        expect([
          "COMPLETED_SAME_DEPARTMENT",
          "COMPLETED_OTHER_DEPARTMENT",
          "COMPLETED_CONTEXT_UNKNOWN",
        ]).toContain(scanResult.value.scanOutcome);
      } else {
        expect(isWorkerScanError(scanResult.reason)).toBe(true);
        if (!isWorkerScanError(scanResult.reason)) {
          throw new Error("Scan failed with an unexpected error type.");
        }
        expect(scanResult.reason.code).toBe(SCAN_ERROR_CODES.SCAN_CONFLICT);
      }
      expect(finalProduct).toMatchObject({
        currentWorkerId: null,
        currentRoleId: null,
        currentLocationId: locationA.id,
        completedAt: expect.any(Date),
      });
      expect(activeAssignmentCount).toBe(0);
      expect(receivedTransitionCount).toBe(0);
      expect(completedTransitionCount).toBe(1);
      expect(completionAuditCount).toBe(1);
    }
  });

  it("allows only one concurrent completion and one completion audit", async () => {
    const product = await createProduct("two-completes", {
      status: ProductStatus.READY_FOR_HANDOFF,
      version: 0,
    });
    setSession(manager);
    const results = await Promise.allSettled([
      completeProduct(lifecycleInput(product.id, 0)),
      completeProduct(lifecycleInput(product.id, 0)),
    ]);
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      results.filter((result) => result.status === "rejected"),
    ).toHaveLength(1);
    await expect(
      prisma.productTransition.count({
        where: { productId: product.id, eventType: "PRODUCT_COMPLETED" },
      }),
    ).resolves.toBe(1);
    await expect(
      prisma.auditLog.count({
        where: { targetId: product.id, action: "product.completed" },
      }),
    ).resolves.toBe(1);
  });

  it("allows only one concurrent return-to-process assignment", async () => {
    const product = await createProduct("two-returns", {
      status: ProductStatus.COMPLETED,
      completedAt: new Date(),
      version: 0,
    });
    await setWorkerARole(roleA.id);
    setSession(workerA);
    const results = await Promise.allSettled([
      returnCompletedProductToProcess(lifecycleInput(product.id, 0)),
      returnCompletedProductToProcess(lifecycleInput(product.id, 0)),
    ]);
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      results.filter((result) => result.status === "rejected"),
    ).toHaveLength(1);
    await expect(
      prisma.productAssignment.count({
        where: { productId: product.id, endedAt: null },
      }),
    ).resolves.toBe(1);
    await expect(
      prisma.productTransition.count({
        where: {
          productId: product.id,
          eventType: "PRODUCT_RETURNED_TO_PROCESS",
        },
      }),
    ).resolves.toBe(1);
  });

  it("uses the EmployeeProfile mutex for return-to-process role context", async () => {
    const product = await createProduct("return-lock", {
      status: ProductStatus.COMPLETED,
      version: 0,
    });
    await setWorkerARole(roleA.id);
    setSession(workerA);
    const lockAcquired = deferred();
    const selectionAttempted = deferred();
    const release = deferred();
    const originalLock =
      productionContextLock.lockEmployeeForProductionMutation;
    let lockCall = 0;
    const lockSpy = vi
      .spyOn(productionContextLock, "lockEmployeeForProductionMutation")
      .mockImplementation(async (database, organizationId, employeeId) => {
        const call = lockCall++;
        if (call === 0) {
          await originalLock(database, organizationId, employeeId);
          lockAcquired.resolve();
          await release.promise;
        } else {
          selectionAttempted.resolve();
          await originalLock(database, organizationId, employeeId);
        }
      });

    try {
      const returnPromise = returnCompletedProductToProcess(
        lifecycleInput(product.id, 0),
      );
      await lockAcquired.promise;
      const roleSelection = selectActiveProductionRole(roleB.id);
      await selectionAttempted.promise;
      release.resolve();
      const [result, selectedState] = await Promise.all([
        returnPromise,
        roleSelection,
      ]);
      expect(result.currentRole?.id).toBe(roleA.id);
      expect(selectedState.activeProductionRole?.id).toBe(roleB.id);
    } finally {
      release.resolve();
      lockSpy.mockRestore();
    }
  });

  it("cancels CREATED, IN_PROGRESS, and READY_FOR_HANDOFF safely", async () => {
    setSession(manager);
    const created = await createProduct("cancel-created", {
      status: ProductStatus.CREATED,
      version: 0,
    });
    const ready = await createProduct("cancel-ready", {
      status: ProductStatus.READY_FOR_HANDOFF,
      currentLocationId: locationA.id,
      version: 0,
    });
    const active = await createProduct("cancel-active", {
      status: ProductStatus.IN_PROGRESS,
      currentWorkerId: workerA.employee.id,
      currentRoleId: roleA.id,
      currentLocationId: locationA.id,
      version: 0,
    });
    await createAssignment(active.id, workerA);

    for (const product of [created, ready, active]) {
      const result = await cancelProduct(lifecycleInput(product.id, 0));
      expect(result).toMatchObject({
        status: "CANCELLED",
        version: 1,
        currentWorker: null,
        currentRole: null,
        cancelledAt: expect.any(String),
      });
      await expect(
        prisma.productTransition.findFirstOrThrow({
          where: { productId: product.id },
          select: { eventType: true },
        }),
      ).resolves.toEqual({ eventType: "PRODUCT_CANCELLED" });
    }
    await expect(
      prisma.productAssignment.findFirstOrThrow({
        where: { productId: active.id },
      }),
    ).resolves.toMatchObject({
      endReason: "CANCELLED",
      endedAt: expect.any(Date),
    });
  });

  it("rejects cancellation of completed products", async () => {
    const product = await createProduct("cancel-completed", {
      status: ProductStatus.COMPLETED,
      version: 0,
    });
    setSession(manager);
    await expectLifecycleError(
      cancelProduct(lifecycleInput(product.id, 0)),
      PRODUCT_LIFECYCLE_ERROR_CODES.PRODUCT_NOT_CANCELLABLE,
    );
  });

  it("restores cancelled Products without assigning them", async () => {
    const product = await createProduct("restore", {
      status: ProductStatus.CANCELLED,
      currentLocationId: locationA.id,
      cancelledAt: new Date(),
      version: 2,
    });
    setSession(manager);
    const result = await restoreProduct(lifecycleInput(product.id, 2));
    expect(result).toMatchObject({
      status: "READY_FOR_HANDOFF",
      version: 3,
      currentWorker: null,
      currentRole: null,
      currentLocation: { id: locationA.id },
      cancelledAt: null,
    });
    await expect(
      prisma.productAssignment.count({
        where: { productId: product.id, endedAt: null },
      }),
    ).resolves.toBe(0);
  });

  it("trashes only cancelled Products and never physically deletes them", async () => {
    const product = await createProduct("trash", {
      status: ProductStatus.CANCELLED,
      cancelledAt: new Date(),
      version: 0,
    });
    setSession(manager);
    const result = await trashProduct(lifecycleInput(product.id, 0));
    expect(result).toMatchObject({
      status: "TRASHED",
      version: 1,
      cancelledAt: null,
      trashedAt: expect.any(String),
    });
    await expect(
      prisma.product.findUnique({
        where: { id: product.id },
        select: { status: true },
      }),
    ).resolves.toEqual({ status: ProductStatus.TRASHED });
    const active = await createProduct("trash-reject", {
      status: ProductStatus.IN_PROGRESS,
      currentWorkerId: workerA.employee.id,
      currentRoleId: roleA.id,
      version: 0,
    });
    await expectLifecycleError(
      trashProduct(lifecycleInput(active.id, 0)),
      PRODUCT_LIFECYCLE_ERROR_CODES.PRODUCT_NOT_TRASHABLE,
    );
  });

  it("protects foreign Product IDs and restore-versus-trash races", async () => {
    const foreign = await createProduct("foreign", {
      organizationId: organizationB.id,
      status: ProductStatus.CANCELLED,
      version: 0,
    });
    setSession(manager);
    await expectLifecycleError(
      restoreProduct(lifecycleInput(foreign.id, 0)),
      PRODUCT_LIFECYCLE_ERROR_CODES.PRODUCT_NOT_FOUND,
    );

    const product = await createProduct("restore-trash-race", {
      status: ProductStatus.CANCELLED,
      version: 1,
    });
    const results = await Promise.allSettled([
      restoreProduct(lifecycleInput(product.id, 1)),
      trashProduct(lifecycleInput(product.id, 1)),
    ]);
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      results.filter((result) => result.status === "rejected"),
    ).toHaveLength(1);
    await expect(
      prisma.product.findUniqueOrThrow({
        where: { id: product.id },
        select: { version: true, status: true },
      }),
    ).resolves.toMatchObject({ version: 2 });
  });
});

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}
