import "dotenv/config";

import { randomUUID } from "node:crypto";

import { ProductStatus } from "@prisma/client";
import type { Session } from "next-auth";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("../../src/auth", () => ({ auth: vi.fn() }));

import { auth } from "../../src/auth";
import { prisma } from "../../src/lib/db/client";
import * as handlingContextService from "../../src/modules/scanning/handling-context.service";
import * as productionContextLock from "../../src/modules/worker-context/production-context-lock";
import { isFactoryFlowAuthError } from "../../src/modules/auth/auth-errors";
import {
  listAvailableProductionRoles,
  resolveEmployeeContext,
  resolveWorkerProductionRoleState,
  selectActiveProductionRole,
} from "../../src/modules/worker-context/server";
import {
  resolveActiveProductionHandlingContextForTenant,
  scanProduct,
  takeOverProduct,
} from "../../src/modules/scanning/server";
import {
  isWorkerScanError,
  SCAN_ERROR_CODES,
} from "../../src/modules/scanning/scan-errors";

const suffix = `${Date.now()}-${randomUUID().slice(0, 8)}`;
const authMock = auth as unknown as {
  mockResolvedValue: (value: Session | null) => void;
  mockImplementation: (implementation: () => Promise<Session | null>) => void;
};

type WorkerFixture = {
  user: { id: string; username: string };
  membership: { id: string };
  employee: { id: string; displayName: string };
};

let organizationA: { id: string };
let organizationB: { id: string };
let departmentA: { id: string };
let departmentB: { id: string };
let locationA: { id: string };
let locationA2: { id: string };
let locationB: { id: string };
let inactiveLocation: { id: string };
let roleA: { id: string };
let inactiveRole: { id: string };
let roleB: { id: string };
let workerA: WorkerFixture;
let workerB: WorkerFixture;
let limitedWorker: WorkerFixture;
let noRoleWorker: WorkerFixture;
let inactiveMembershipWorker: WorkerFixture;
let noLocationWorker: WorkerFixture;
let inactiveLocationWorker: WorkerFixture;
let scansPerformPermission: { id: string };
let scansTakeoverPermission: { id: string };
let productsReadPermission: { id: string };

function sessionFor(worker: WorkerFixture): Session {
  return {
    user: {
      id: worker.user.id,
      username: worker.user.username,
      name: worker.user.username,
    },
    expires: new Date(Date.now() + 60_000).toISOString(),
  };
}

function setWorkerSession(worker: WorkerFixture) {
  authMock.mockResolvedValue(sessionFor(worker));
}

async function createWorker(
  name: string,
  options: { permissions: string[]; membershipStatus?: string } = {
    permissions: ["scans.perform", "scans.takeover"],
  },
): Promise<WorkerFixture> {
  const user = await prisma.user.create({
    data: { username: `phase7-${name}-${suffix}` },
    select: { id: true, username: true },
  });
  if (!user.username) {
    throw new Error("Scanning fixture user must have a username");
  }

  const membership = await prisma.membership.create({
    data: {
      organizationId: organizationA.id,
      userId: user.id,
      status: options.membershipStatus ?? "ACTIVE",
    },
    select: { id: true },
  });
  const employee = await prisma.employeeProfile.create({
    data: {
      organizationId: organizationA.id,
      membershipId: membership.id,
      displayName: `Phase 7 ${name}`,
    },
    select: { id: true, displayName: true },
  });
  const accessRole = await prisma.accessRole.create({
    data: {
      organizationId: organizationA.id,
      code: `PHASE7_${name.toUpperCase()}_${suffix}`,
      name: `Phase 7 ${name}`,
    },
    select: { id: true },
  });
  await prisma.accessRolePermission.createMany({
    data: options.permissions.map((code) => ({
      accessRoleId: accessRole.id,
      permissionId:
        code === "scans.perform"
          ? scansPerformPermission.id
          : code === "scans.takeover"
            ? scansTakeoverPermission.id
            : productsReadPermission.id,
    })),
  });
  await prisma.membershipAccessRole.create({
    data: {
      organizationId: organizationA.id,
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
    currentStageId?: string | null;
    version?: number;
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
      currentStageId: options.currentStageId ?? null,
      version: options.version ?? 0,
    },
    select: { id: true, serialNumber: true, status: true, version: true },
  });
  const barcode = await prisma.barcode.create({
    data: {
      organizationId,
      productId: product.id,
      value: `phase7_${name}_${randomUUID()}`,
    },
    select: { value: true },
  });
  return { ...product, barcode: barcode.value };
}

async function createActiveAssignment(
  productId: string,
  worker: WorkerFixture,
  locationId: string,
  endedAt: Date | null = null,
) {
  return prisma.productAssignment.create({
    data: {
      organizationId: organizationA.id,
      productId,
      employeeId: worker.employee.id,
      productionRoleId: roleA.id,
      locationId,
      endedAt,
      endReason: endedAt ? "FINISHED" : null,
    },
    select: { id: true },
  });
}

async function expectScanError(operation: Promise<unknown>, code: string) {
  await expect(operation).rejects.toSatisfy((error: unknown) => {
    return isWorkerScanError(error) && error.code === code;
  });
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

describe.sequential("Phase 7 barcode scanning and responsibility", () => {
  beforeAll(async () => {
    organizationA = await prisma.organization.create({
      data: {
        name: `Phase 7 Factory A ${suffix}`,
        slug: `phase7-a-${suffix}`,
      },
      select: { id: true },
    });
    organizationB = await prisma.organization.create({
      data: {
        name: `Phase 7 Factory B ${suffix}`,
        slug: `phase7-b-${suffix}`,
      },
      select: { id: true },
    });
    [scansPerformPermission, scansTakeoverPermission, productsReadPermission] =
      await Promise.all(
        ["scans.perform", "scans.takeover", "products.read"].map((code) =>
          prisma.permission.upsert({
            where: { code },
            update: {},
            create: { code, description: `Phase 7 ${code}` },
            select: { id: true },
          }),
        ),
      );

    [departmentA, departmentB] = await Promise.all([
      prisma.department.create({
        data: {
          organizationId: organizationA.id,
          code: `PHASE7-A-${suffix}`,
          name: "Phase 7 Department A",
        },
        select: { id: true },
      }),
      prisma.department.create({
        data: {
          organizationId: organizationA.id,
          code: `PHASE7-B-${suffix}`,
          name: "Phase 7 Department B",
        },
        select: { id: true },
      }),
    ]);
    [locationA, locationA2, locationB, inactiveLocation] = await Promise.all([
      prisma.location.create({
        data: {
          organizationId: organizationA.id,
          departmentId: departmentA.id,
          code: `PHASE7-A1-${suffix}`,
          name: "Phase 7 Work Area A1",
          type: "WORK_AREA",
        },
        select: { id: true },
      }),
      prisma.location.create({
        data: {
          organizationId: organizationA.id,
          departmentId: departmentA.id,
          code: `PHASE7-A2-${suffix}`,
          name: "Phase 7 Work Area A2",
          type: "WORK_AREA",
        },
        select: { id: true },
      }),
      prisma.location.create({
        data: {
          organizationId: organizationA.id,
          departmentId: departmentB.id,
          code: `PHASE7-B1-${suffix}`,
          name: "Phase 7 Work Area B1",
          type: "WORK_AREA",
        },
        select: { id: true },
      }),
      prisma.location.create({
        data: {
          organizationId: organizationA.id,
          departmentId: departmentA.id,
          code: `PHASE7-INACTIVE-${suffix}`,
          name: "Phase 7 Inactive Work Area",
          type: "WORK_AREA",
          isActive: false,
        },
        select: { id: true },
      }),
    ]);
    [roleA, inactiveRole] = await Promise.all([
      prisma.productionRole.create({
        data: {
          organizationId: organizationA.id,
          code: `PHASE7-ROLE-A-${suffix}`,
          name: "Phase 7 Role A",
        },
        select: { id: true },
      }),
      prisma.productionRole.create({
        data: {
          organizationId: organizationA.id,
          code: `PHASE7-ROLE-INACTIVE-${suffix}`,
          name: "Phase 7 Inactive Role",
          isActive: false,
        },
        select: { id: true },
      }),
    ]);
    roleB = await prisma.productionRole.create({
      data: {
        organizationId: organizationB.id,
        code: `PHASE7-ROLE-B-${suffix}`,
        name: "Phase 7 Foreign Role",
      },
      select: { id: true },
    });

    [
      workerA,
      workerB,
      limitedWorker,
      noRoleWorker,
      inactiveMembershipWorker,
      noLocationWorker,
      inactiveLocationWorker,
    ] = await Promise.all([
      createWorker("worker-a"),
      createWorker("worker-b"),
      createWorker("limited", { permissions: ["scans.perform"] }),
      createWorker("no-role", {
        permissions: ["products.read", "scans.perform"],
      }),
      createWorker("inactive-membership", {
        permissions: ["scans.perform", "scans.takeover"],
        membershipStatus: "INACTIVE",
      }),
      createWorker("no-location"),
      createWorker("inactive-location"),
    ]);

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
          employeeId: workerA.employee.id,
          productionRoleId: inactiveRole.id,
          handlingLocationId: locationA.id,
        },
        {
          organizationId: organizationA.id,
          employeeId: workerB.employee.id,
          productionRoleId: roleA.id,
          handlingLocationId: locationA2.id,
        },
        {
          organizationId: organizationA.id,
          employeeId: limitedWorker.employee.id,
          productionRoleId: roleA.id,
          handlingLocationId: locationA2.id,
        },
        {
          organizationId: organizationA.id,
          employeeId: inactiveMembershipWorker.employee.id,
          productionRoleId: roleA.id,
          handlingLocationId: locationA.id,
        },
        {
          organizationId: organizationA.id,
          employeeId: noLocationWorker.employee.id,
          productionRoleId: roleA.id,
          handlingLocationId: null,
        },
        {
          organizationId: organizationA.id,
          employeeId: inactiveLocationWorker.employee.id,
          productionRoleId: roleA.id,
          handlingLocationId: inactiveLocation.id,
        },
      ],
    });
  });

  afterAll(async () => {
    await prisma.idempotencyKey.deleteMany({
      where: { organizationId: { in: [organizationA.id, organizationB.id] } },
    });
    await prisma.auditLog.deleteMany({
      where: { organizationId: { in: [organizationA.id, organizationB.id] } },
    });
    await prisma.productTransition.deleteMany({
      where: { organizationId: { in: [organizationA.id, organizationB.id] } },
    });
    await prisma.productAssignment.deleteMany({
      where: { organizationId: { in: [organizationA.id, organizationB.id] } },
    });
    await prisma.barcode.deleteMany({
      where: { organizationId: { in: [organizationA.id, organizationB.id] } },
    });
    await prisma.product.deleteMany({
      where: { organizationId: { in: [organizationA.id, organizationB.id] } },
    });
    await prisma.workerProductionContext.deleteMany({
      where: { organizationId: organizationA.id },
    });
    await prisma.employeeProductionRole.deleteMany({
      where: { organizationId: organizationA.id },
    });
    await prisma.membershipAccessRole.deleteMany({
      where: { organizationId: organizationA.id },
    });
    const accessRoles = await prisma.accessRole.findMany({
      where: { organizationId: organizationA.id },
      select: { id: true },
    });
    await prisma.accessRolePermission.deleteMany({
      where: { accessRoleId: { in: accessRoles.map((role) => role.id) } },
    });
    await prisma.accessRole.deleteMany({
      where: { organizationId: organizationA.id },
    });
    await prisma.employeeProfile.deleteMany({
      where: { organizationId: organizationA.id },
    });
    await prisma.membership.deleteMany({
      where: { organizationId: organizationA.id },
    });
    await prisma.user.deleteMany({
      where: { username: { contains: suffix } },
    });
    await prisma.location.deleteMany({
      where: { organizationId: organizationA.id },
    });
    await prisma.department.deleteMany({
      where: { organizationId: organizationA.id },
    });
    await prisma.productionRole.deleteMany({
      where: { organizationId: { in: [organizationA.id, organizationB.id] } },
    });
    await prisma.organization.deleteMany({
      where: { id: { in: [organizationA.id, organizationB.id] } },
    });
  });

  it("receives CREATED products with one assignment, transition, and immutable replay", async () => {
    setWorkerSession(workerA);
    const product = await createProduct("created");
    const key = randomUUID();
    const result = await scanProduct({
      barcode: product.barcode,
      idempotencyKey: key,
    });

    expect(result).toMatchObject({
      productId: product.id,
      serialNumber: product.serialNumber,
      status: "IN_PROGRESS",
      version: 1,
      scanOutcome: "RECEIVED",
      currentWorker: { id: workerA.employee.id },
      currentRole: { id: roleA.id },
      currentLocation: { id: locationA.id },
    });
    await expect(
      prisma.productAssignment.count({ where: { productId: product.id } }),
    ).resolves.toBe(1);
    await expect(
      prisma.productTransition.count({ where: { productId: product.id } }),
    ).resolves.toBe(1);

    await expect(
      scanProduct({ barcode: product.barcode, idempotencyKey: key }),
    ).resolves.toEqual(result);
    await expect(
      scanProduct({ barcode: "different-barcode", idempotencyKey: key }),
    ).rejects.toMatchObject({ code: SCAN_ERROR_CODES.IDEMPOTENCY_CONFLICT });

    await prisma.product.update({
      where: { id: product.id },
      data: { version: 99 },
    });
    await expect(
      scanProduct({ barcode: product.barcode, idempotencyKey: key }),
    ).resolves.toEqual(result);
  });

  it("receives READY_FOR_HANDOFF products at the new worker location", async () => {
    setWorkerSession(workerB);
    const product = await createProduct("ready", {
      status: ProductStatus.READY_FOR_HANDOFF,
      currentLocationId: locationA.id,
    });
    await createActiveAssignment(product.id, workerA, locationA.id, new Date());

    const result = await scanProduct({
      barcode: product.barcode,
      idempotencyKey: randomUUID(),
    });
    expect(result).toMatchObject({
      status: "IN_PROGRESS",
      version: 1,
      currentWorker: { id: workerB.employee.id },
      currentLocation: { id: locationA2.id },
      scanOutcome: "RECEIVED",
    });
    await expect(
      prisma.productAssignment.count({
        where: { productId: product.id, endedAt: null },
      }),
    ).resolves.toBe(1);
  });

  it("allows only one concurrent READY_FOR_HANDOFF receive", async () => {
    const product = await createProduct("concurrent-ready", {
      status: ProductStatus.READY_FOR_HANDOFF,
      currentLocationId: locationA.id,
    });
    let sessionIndex = 0;
    const sessions = [sessionFor(workerA), sessionFor(workerB)];
    authMock.mockImplementation(
      async () => sessions[sessionIndex++] ?? sessions[0] ?? null,
    );

    const results = await Promise.allSettled([
      scanProduct({ barcode: product.barcode, idempotencyKey: randomUUID() }),
      scanProduct({ barcode: product.barcode, idempotencyKey: randomUUID() }),
    ]);
    const successes = results.filter((result) => result.status === "fulfilled");
    const failures = results.filter((result) => result.status === "rejected");
    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(1);
    expect(
      failures[0]?.status === "rejected" &&
        (failures[0].reason as { code?: string }).code,
    ).toBe(SCAN_ERROR_CODES.SCAN_CONFLICT);

    const persisted = await prisma.product.findUniqueOrThrow({
      where: { id: product.id },
      select: {
        status: true,
        version: true,
        currentWorkerId: true,
        currentRoleId: true,
        currentLocationId: true,
      },
    });
    expect(persisted).toMatchObject({
      status: ProductStatus.IN_PROGRESS,
      version: 1,
      currentLocationId: expect.any(String),
    });
    expect([workerA.employee.id, workerB.employee.id]).toContain(
      persisted.currentWorkerId,
    );
    expect(persisted.currentRoleId).toBe(roleA.id);
    await expect(
      prisma.productAssignment.count({ where: { productId: product.id } }),
    ).resolves.toBe(1);
    await expect(
      prisma.productAssignment.count({
        where: { productId: product.id, endedAt: null },
      }),
    ).resolves.toBe(1);
    await expect(
      prisma.productTransition.count({
        where: { productId: product.id, eventType: "PRODUCT_RECEIVED" },
      }),
    ).resolves.toBe(1);
  });

  it("does not expose unknown or cross-tenant barcodes and blocks terminal products", async () => {
    setWorkerSession(workerA);
    await expectScanError(
      scanProduct({ barcode: "missing", idempotencyKey: randomUUID() }),
      SCAN_ERROR_CODES.BARCODE_NOT_FOUND,
    );
    await expectScanError(
      scanProduct({ barcode: "   ", idempotencyKey: randomUUID() }),
      SCAN_ERROR_CODES.BARCODE_REQUIRED,
    );

    const foreign = await createProduct("foreign", {
      organizationId: organizationB.id,
    });
    await expectScanError(
      scanProduct({ barcode: foreign.barcode, idempotencyKey: randomUUID() }),
      SCAN_ERROR_CODES.BARCODE_NOT_FOUND,
    );

    for (const status of [ProductStatus.CANCELLED, ProductStatus.TRASHED]) {
      const product = await createProduct(status.toLowerCase(), { status });
      const before = await prisma.product.findUniqueOrThrow({
        where: { id: product.id },
        select: { version: true, status: true },
      });
      const result = await scanProduct({
        barcode: product.barcode,
        idempotencyKey: randomUUID(),
      });
      expect(result.scanOutcome).toBe("PRODUCT_NOT_RECEIVABLE");
      await expect(
        prisma.product.findUniqueOrThrow({
          where: { id: product.id },
          select: { version: true, status: true },
        }),
      ).resolves.toEqual(before);
    }
  });

  it("classifies completed products without mutating them", async () => {
    setWorkerSession(workerA);
    const same = await createProduct("completed-same", {
      status: ProductStatus.COMPLETED,
      currentLocationId: locationA.id,
      version: 3,
    });
    const other = await createProduct("completed-other", {
      status: ProductStatus.COMPLETED,
      currentLocationId: locationB.id,
      version: 4,
    });
    const unknown = await createProduct("completed-unknown", {
      status: ProductStatus.COMPLETED,
      version: 5,
    });

    await expect(
      scanProduct({ barcode: same.barcode, idempotencyKey: randomUUID() }),
    ).resolves.toMatchObject({
      scanOutcome: "COMPLETED_SAME_DEPARTMENT",
      version: 3,
    });
    await expect(
      scanProduct({ barcode: other.barcode, idempotencyKey: randomUUID() }),
    ).resolves.toMatchObject({
      scanOutcome: "COMPLETED_OTHER_DEPARTMENT",
      version: 4,
    });
    await expect(
      scanProduct({ barcode: unknown.barcode, idempotencyKey: randomUUID() }),
    ).resolves.toMatchObject({
      scanOutcome: "COMPLETED_CONTEXT_UNKNOWN",
      version: 5,
    });
    await expect(
      prisma.productAssignment.count({
        where: { productId: { in: [same.id, other.id, unknown.id] } },
      }),
    ).resolves.toBe(0);
  });

  it("requires an active membership, active role, and active handling location", async () => {
    setWorkerSession(inactiveMembershipWorker);
    await expect(
      scanProduct({ barcode: "not-used", idempotencyKey: randomUUID() }),
    ).rejects.toSatisfy(
      (error: unknown) =>
        isFactoryFlowAuthError(error) && error.code === "MEMBERSHIP_INACTIVE",
    );

    setWorkerSession(noLocationWorker);
    await expectScanError(
      scanProduct({ barcode: "not-used", idempotencyKey: randomUUID() }),
      SCAN_ERROR_CODES.WORK_LOCATION_REQUIRED,
    );

    setWorkerSession(inactiveLocationWorker);
    await expectScanError(
      scanProduct({ barcode: "not-used", idempotencyKey: randomUUID() }),
      SCAN_ERROR_CODES.WORK_LOCATION_INACTIVE,
    );
  });

  it("does not list, select, or use inactive or foreign production roles", async () => {
    setWorkerSession(workerA);
    const employee = await resolveEmployeeContext({
      userId: workerA.user.id,
      membershipId: workerA.membership.id,
      organizationId: organizationA.id,
      organizationName: "Phase 7 Factory A",
      organizationSlug: "phase7-a",
    });
    const roles = await listAvailableProductionRoles(employee);
    expect(roles.map((role) => role.id)).toEqual([roleA.id]);

    await expect(
      selectActiveProductionRole(inactiveRole.id),
    ).rejects.toMatchObject({
      code: "PRODUCTION_ROLE_NOT_AVAILABLE",
    });
    await expect(selectActiveProductionRole(roleB.id)).rejects.toMatchObject({
      code: "PRODUCTION_ROLE_NOT_AVAILABLE",
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
        activeProductionRoleId: inactiveRole.id,
      },
      update: { activeProductionRoleId: inactiveRole.id },
    });
    const state = await resolveWorkerProductionRoleState(employee);
    expect(state.activeProductionRole?.id).toBe(roleA.id);
    expect(state.activeProductionRole?.id).not.toBe(inactiveRole.id);
  });

  it("proves AccessRole permission does not create production capability", async () => {
    setWorkerSession(noRoleWorker);
    const employee = await resolveEmployeeContext({
      userId: noRoleWorker.user.id,
      membershipId: noRoleWorker.membership.id,
      organizationId: organizationA.id,
      organizationName: "Phase 7 Factory A",
      organizationSlug: "phase7-a",
    });
    await expect(listAvailableProductionRoles(employee)).resolves.toEqual([]);
    await expect(selectActiveProductionRole(roleA.id)).rejects.toMatchObject({
      code: "PRODUCTION_ROLE_NOT_AVAILABLE",
    });
    await expect(
      scanProduct({ barcode: "not-used", idempotencyKey: randomUUID() }),
    ).rejects.toMatchObject({ code: "NO_PRODUCTION_ROLES" });
  });

  it("returns a same-worker finish confirmation without changing state", async () => {
    setWorkerSession(workerA);
    const product = await createProduct("same-worker", {
      status: ProductStatus.IN_PROGRESS,
      currentWorkerId: workerA.employee.id,
      currentRoleId: roleA.id,
      currentLocationId: locationA.id,
      version: 7,
    });
    await createActiveAssignment(product.id, workerA, locationA.id);
    const before = await prisma.product.findUniqueOrThrow({
      where: { id: product.id },
    });
    const beforeAssignments = await prisma.productAssignment.count({
      where: { productId: product.id },
    });
    const beforeTransitions = await prisma.productTransition.count({
      where: { productId: product.id },
    });
    const result = await scanProduct({
      barcode: product.barcode,
      idempotencyKey: randomUUID(),
    });

    expect(result.scanOutcome).toBe("FINISH_CONFIRMATION_REQUIRED");
    await expect(
      prisma.product.findUniqueOrThrow({ where: { id: product.id } }),
    ).resolves.toEqual(before);
    await expect(
      prisma.productAssignment.count({ where: { productId: product.id } }),
    ).resolves.toBe(beforeAssignments);
    await expect(
      prisma.productTransition.count({ where: { productId: product.id } }),
    ).resolves.toBe(beforeTransitions);
  });

  it("warns before takeover and requires scans.takeover", async () => {
    const product = await createProduct("takeover-warning", {
      status: ProductStatus.IN_PROGRESS,
      currentWorkerId: workerA.employee.id,
      currentRoleId: roleA.id,
      currentLocationId: locationA.id,
      version: 2,
    });
    await createActiveAssignment(product.id, workerA, locationA.id);

    setWorkerSession(workerB);
    await expect(
      scanProduct({ barcode: product.barcode, idempotencyKey: randomUUID() }),
    ).resolves.toMatchObject({
      scanOutcome: "TAKEOVER_CONFIRMATION_REQUIRED",
      currentWorker: { id: workerA.employee.id },
      version: 2,
    });

    setWorkerSession(limitedWorker);
    await expect(
      takeOverProduct({
        barcode: product.barcode,
        expectedVersion: 2,
        idempotencyKey: randomUUID(),
      }),
    ).rejects.toSatisfy(
      (error: unknown) =>
        isFactoryFlowAuthError(error) && error.code === "FORBIDDEN",
    );
  });

  it("takes over responsibility atomically and replays the original result", async () => {
    const product = await createProduct("takeover", {
      status: ProductStatus.IN_PROGRESS,
      currentWorkerId: workerA.employee.id,
      currentRoleId: roleA.id,
      currentLocationId: locationA.id,
      currentStageId: null,
      version: 10,
    });
    await createActiveAssignment(product.id, workerA, locationA.id);

    setWorkerSession(workerB);
    const key = randomUUID();
    const result = await takeOverProduct({
      barcode: product.barcode,
      expectedVersion: 10,
      idempotencyKey: key,
    });
    expect(result).toMatchObject({
      status: "IN_PROGRESS",
      version: 11,
      scanOutcome: "RECEIVED",
      currentWorker: { id: workerB.employee.id },
      currentLocation: { id: locationA2.id },
    });
    await expect(
      prisma.productAssignment.count({
        where: { productId: product.id, endedAt: null },
      }),
    ).resolves.toBe(1);
    await expect(
      prisma.productAssignment.findMany({
        where: { productId: product.id },
        orderBy: { startedAt: "asc" },
      }),
    ).resolves.toHaveLength(2);
    await expect(
      prisma.productTransition.findFirst({
        where: { productId: product.id },
        orderBy: { occurredAt: "desc" },
      }),
    ).resolves.toMatchObject({ eventType: "RESPONSIBILITY_TAKEN_OVER" });
    await expect(
      prisma.auditLog.findFirst({
        where: {
          targetId: product.id,
          action: "product.responsibility_taken_over",
        },
      }),
    ).resolves.not.toBeNull();

    await expect(
      takeOverProduct({
        barcode: product.barcode,
        expectedVersion: 10,
        idempotencyKey: key,
      }),
    ).resolves.toEqual(result);
    await expect(
      takeOverProduct({
        barcode: product.barcode,
        expectedVersion: 11,
        idempotencyKey: key,
      }),
    ).rejects.toMatchObject({ code: SCAN_ERROR_CODES.IDEMPOTENCY_CONFLICT });
    await prisma.product.update({
      where: { id: product.id },
      data: { version: 20 },
    });
    await expect(
      takeOverProduct({
        barcode: product.barcode,
        expectedVersion: 10,
        idempotencyKey: key,
      }),
    ).resolves.toEqual(result);
  });

  it("rejects stale and cross-tenant takeover requests safely", async () => {
    const product = await createProduct("stale-takeover", {
      status: ProductStatus.IN_PROGRESS,
      currentWorkerId: workerA.employee.id,
      currentRoleId: roleA.id,
      currentLocationId: locationA.id,
      version: 6,
    });
    await createActiveAssignment(product.id, workerA, locationA.id);
    setWorkerSession(workerB);
    await expect(
      takeOverProduct({
        barcode: product.barcode,
        expectedVersion: 5,
        idempotencyKey: randomUUID(),
      }),
    ).rejects.toMatchObject({ code: SCAN_ERROR_CODES.SCAN_CONFLICT });

    const foreign = await createProduct("foreign-takeover", {
      organizationId: organizationB.id,
      status: ProductStatus.IN_PROGRESS,
      version: 1,
    });
    await expect(
      takeOverProduct({
        barcode: foreign.barcode,
        expectedVersion: 1,
        idempotencyKey: randomUUID(),
      }),
    ).rejects.toMatchObject({ code: SCAN_ERROR_CODES.BARCODE_NOT_FOUND });
  });

  it("allows only one concurrent takeover of a responsibility", async () => {
    const workerC = await createWorker("takeover-c");
    await prisma.employeeProductionRole.create({
      data: {
        organizationId: organizationA.id,
        employeeId: workerC.employee.id,
        productionRoleId: roleA.id,
        handlingLocationId: locationB.id,
      },
    });

    const product = await createProduct("concurrent-takeover", {
      status: ProductStatus.IN_PROGRESS,
      currentWorkerId: workerA.employee.id,
      currentRoleId: roleA.id,
      currentLocationId: locationA.id,
      version: 12,
    });
    await createActiveAssignment(product.id, workerA, locationA.id);

    const firstAuthCallsReady = deferred();
    let authCall = 0;
    let firstAuthCallCount = 0;
    authMock.mockImplementation(async () => {
      const call = authCall++;
      if (call < 2) {
        firstAuthCallCount += 1;
        if (firstAuthCallCount === 2) {
          firstAuthCallsReady.resolve();
        }
        await firstAuthCallsReady.promise;
        return sessionFor(call === 0 ? workerB : workerC);
      }

      return sessionFor(call === 2 ? workerB : workerC);
    });

    const results = await Promise.allSettled([
      takeOverProduct({
        barcode: product.barcode,
        expectedVersion: 12,
        idempotencyKey: randomUUID(),
      }),
      takeOverProduct({
        barcode: product.barcode,
        expectedVersion: 12,
        idempotencyKey: randomUUID(),
      }),
    ]);
    const successes = results.filter((result) => result.status === "fulfilled");
    const failures = results.filter((result) => result.status === "rejected");
    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(1);
    expect(
      failures[0]?.status === "rejected" &&
        (failures[0].reason as { code?: string }).code,
    ).toBe(SCAN_ERROR_CODES.SCAN_CONFLICT);

    const persisted = await prisma.product.findUniqueOrThrow({
      where: { id: product.id },
      select: { version: true, currentWorkerId: true, currentRoleId: true },
    });
    expect(persisted.version).toBe(13);
    expect([workerB.employee.id, workerC.employee.id]).toContain(
      persisted.currentWorkerId,
    );
    expect(persisted.currentRoleId).toBe(roleA.id);
    await expect(
      prisma.productAssignment.count({ where: { productId: product.id } }),
    ).resolves.toBe(2);
    await expect(
      prisma.productAssignment.count({
        where: { productId: product.id, endedAt: null },
      }),
    ).resolves.toBe(1);
    await expect(
      prisma.productAssignment.count({
        where: {
          productId: product.id,
          employeeId: workerA.employee.id,
          endedAt: { not: null },
          endReason: "TAKEN_OVER",
        },
      }),
    ).resolves.toBe(1);
    await expect(
      prisma.productTransition.count({
        where: {
          productId: product.id,
          eventType: "RESPONSIBILITY_TAKEN_OVER",
        },
      }),
    ).resolves.toBe(1);
    await expect(
      prisma.auditLog.count({
        where: {
          targetId: product.id,
          action: "product.responsibility_taken_over",
        },
      }),
    ).resolves.toBe(1);
  });

  it("uses the current effective role when persisted role context changes", async () => {
    const secondRole = await prisma.productionRole.create({
      data: {
        organizationId: organizationA.id,
        code: `PHASE7-ROLE-RACE-${suffix}`,
        name: "Phase 7 Role Race",
      },
      select: { id: true },
    });
    await prisma.employeeProductionRole.create({
      data: {
        organizationId: organizationA.id,
        employeeId: workerA.employee.id,
        productionRoleId: secondRole.id,
        handlingLocationId: locationA2.id,
      },
    });

    setWorkerSession(workerA);
    await expect(selectActiveProductionRole(roleA.id)).resolves.toMatchObject({
      activeProductionRole: { id: roleA.id },
    });
    const tenant = {
      userId: workerA.user.id,
      membershipId: workerA.membership.id,
      organizationId: organizationA.id,
      organizationName: "Phase 7 Factory A",
      organizationSlug: "phase7-a",
    };
    await expect(
      resolveActiveProductionHandlingContextForTenant(tenant),
    ).resolves.toMatchObject({
      productionRole: { id: roleA.id },
      handlingLocation: { id: locationA.id },
    });

    await expect(selectActiveProductionRole(roleA.id)).resolves.toMatchObject({
      activeProductionRole: { id: roleA.id },
    });

    const product = await createProduct("active-role-race");
    const originalResolver =
      handlingContextService.resolveActiveProductionHandlingContextForTenant;
    let roleChangedAfterPreTransactionResolution = false;
    const resolverSpy = vi
      .spyOn(
        handlingContextService,
        "resolveActiveProductionHandlingContextForTenant",
      )
      .mockImplementation(async (currentTenant) => {
        const preTransactionContext = await originalResolver(currentTenant);
        if (!roleChangedAfterPreTransactionResolution) {
          roleChangedAfterPreTransactionResolution = true;
          await prisma.workerProductionContext.update({
            where: {
              organizationId_employeeId: {
                organizationId: organizationA.id,
                employeeId: workerA.employee.id,
              },
            },
            data: { activeProductionRoleId: secondRole.id },
          });
        }
        return preTransactionContext;
      });

    let result: Awaited<ReturnType<typeof scanProduct>> | undefined;
    try {
      result = await scanProduct({
        barcode: product.barcode,
        idempotencyKey: randomUUID(),
      });
    } finally {
      resolverSpy.mockRestore();
    }

    expect(roleChangedAfterPreTransactionResolution).toBe(true);
    expect(result).toMatchObject({
      currentWorker: { id: workerA.employee.id },
      currentRole: { id: secondRole.id },
      currentLocation: { id: locationA2.id },
    });
    await expect(
      prisma.productAssignment.findFirstOrThrow({
        where: { productId: product.id, endedAt: null },
        select: { productionRoleId: true, locationId: true },
      }),
    ).resolves.toEqual({
      productionRoleId: secondRole.id,
      locationId: locationA2.id,
    });
    await expect(
      prisma.productTransition.findFirstOrThrow({
        where: { productId: product.id },
        select: { toRoleId: true, toLocationId: true },
      }),
    ).resolves.toEqual({
      toRoleId: secondRole.id,
      toLocationId: locationA2.id,
    });
  });

  it("holds the EmployeeProfile lock while a scan finishes before role selection", async () => {
    const nextRole = await prisma.productionRole.create({
      data: {
        organizationId: organizationA.id,
        code: `PHASE7-ROLE-SCAN-FIRST-${suffix}`,
        name: "Phase 7 Scan First Role",
      },
      select: { id: true },
    });
    await prisma.employeeProductionRole.create({
      data: {
        organizationId: organizationA.id,
        employeeId: workerA.employee.id,
        productionRoleId: nextRole.id,
        handlingLocationId: locationA2.id,
      },
    });

    setWorkerSession(workerA);
    await selectActiveProductionRole(roleA.id);
    const product = await createProduct("scan-lock-first");
    const scanLockAcquired = deferred();
    const roleLockAttempted = deferred();
    const releaseScan = deferred();
    const originalLock =
      productionContextLock.lockEmployeeForProductionMutation;
    let lockCall = 0;
    const lockSpy = vi
      .spyOn(productionContextLock, "lockEmployeeForProductionMutation")
      .mockImplementation(async (database, organizationId, employeeId) => {
        const call = lockCall++;
        if (call === 0) {
          await originalLock(database, organizationId, employeeId);
          scanLockAcquired.resolve();
          await releaseScan.promise;
        } else {
          roleLockAttempted.resolve();
          await originalLock(database, organizationId, employeeId);
        }
      });

    try {
      const scanPromise = scanProduct({
        barcode: product.barcode,
        idempotencyKey: randomUUID(),
      });
      await scanLockAcquired.promise;

      let roleSelectionCompleted = false;
      const roleSelectionPromise = selectActiveProductionRole(nextRole.id).then(
        (state) => {
          roleSelectionCompleted = true;
          return state;
        },
      );
      await roleLockAttempted.promise;
      expect(roleSelectionCompleted).toBe(false);

      releaseScan.resolve();
      const [scanResult, roleState] = await Promise.all([
        scanPromise,
        roleSelectionPromise,
      ]);
      expect(scanResult).toMatchObject({
        currentRole: { id: roleA.id },
        currentLocation: { id: locationA.id },
      });
      expect(roleState.activeProductionRole?.id).toBe(nextRole.id);
      await expect(
        prisma.workerProductionContext.findUniqueOrThrow({
          where: {
            organizationId_employeeId: {
              organizationId: organizationA.id,
              employeeId: workerA.employee.id,
            },
          },
          select: { activeProductionRoleId: true },
        }),
      ).resolves.toEqual({ activeProductionRoleId: nextRole.id });
      await expect(
        prisma.productTransition.findFirstOrThrow({
          where: { productId: product.id },
          select: { toRoleId: true, toLocationId: true },
        }),
      ).resolves.toEqual({
        toRoleId: roleA.id,
        toLocationId: locationA.id,
      });
    } finally {
      releaseScan.resolve();
      lockSpy.mockRestore();
    }
  });

  it("waits for role selection before scanning and then uses the new role", async () => {
    const nextRole = await prisma.productionRole.create({
      data: {
        organizationId: organizationA.id,
        code: `PHASE7-ROLE-ROLE-FIRST-${suffix}`,
        name: "Phase 7 Role First Role",
      },
      select: { id: true },
    });
    await prisma.employeeProductionRole.create({
      data: {
        organizationId: organizationA.id,
        employeeId: workerA.employee.id,
        productionRoleId: nextRole.id,
        handlingLocationId: locationA2.id,
      },
    });

    setWorkerSession(workerA);
    await selectActiveProductionRole(roleA.id);
    const product = await createProduct("role-lock-first");
    const roleLockAcquired = deferred();
    const scanLockAttempted = deferred();
    const releaseRoleSelection = deferred();
    const originalLock =
      productionContextLock.lockEmployeeForProductionMutation;
    let lockCall = 0;
    const lockSpy = vi
      .spyOn(productionContextLock, "lockEmployeeForProductionMutation")
      .mockImplementation(async (database, organizationId, employeeId) => {
        const call = lockCall++;
        if (call === 0) {
          await originalLock(database, organizationId, employeeId);
          roleLockAcquired.resolve();
          await releaseRoleSelection.promise;
          return;
        }

        scanLockAttempted.resolve();
        await originalLock(database, organizationId, employeeId);
      });

    try {
      const roleSelectionPromise = selectActiveProductionRole(nextRole.id);
      await roleLockAcquired.promise;

      let scanCompleted = false;
      const scanPromise = scanProduct({
        barcode: product.barcode,
        idempotencyKey: randomUUID(),
      }).then((result) => {
        scanCompleted = true;
        return result;
      });
      await scanLockAttempted.promise;
      expect(scanCompleted).toBe(false);

      releaseRoleSelection.resolve();
      const [roleState, scanResult] = await Promise.all([
        roleSelectionPromise,
        scanPromise,
      ]);
      expect(roleState.activeProductionRole?.id).toBe(nextRole.id);
      expect(scanResult).toMatchObject({
        currentRole: { id: nextRole.id },
        currentLocation: { id: locationA2.id },
      });
      await expect(
        prisma.productAssignment.findFirstOrThrow({
          where: { productId: product.id, endedAt: null },
          select: { productionRoleId: true, locationId: true },
        }),
      ).resolves.toEqual({
        productionRoleId: nextRole.id,
        locationId: locationA2.id,
      });
    } finally {
      releaseRoleSelection.resolve();
      lockSpy.mockRestore();
    }
  });

  it("serializes concurrent role selections for one employee", async () => {
    const firstRole = await prisma.productionRole.create({
      data: {
        organizationId: organizationA.id,
        code: `PHASE7-ROLE-CONCURRENT-A-${suffix}`,
        name: "Phase 7 Concurrent Role A",
      },
      select: { id: true },
    });
    const secondRole = await prisma.productionRole.create({
      data: {
        organizationId: organizationA.id,
        code: `PHASE7-ROLE-CONCURRENT-B-${suffix}`,
        name: "Phase 7 Concurrent Role B",
      },
      select: { id: true },
    });
    await prisma.employeeProductionRole.createMany({
      data: [
        {
          organizationId: organizationA.id,
          employeeId: workerA.employee.id,
          productionRoleId: firstRole.id,
          handlingLocationId: locationA.id,
        },
        {
          organizationId: organizationA.id,
          employeeId: workerA.employee.id,
          productionRoleId: secondRole.id,
          handlingLocationId: locationA2.id,
        },
      ],
    });

    setWorkerSession(workerA);
    const states = await Promise.all([
      selectActiveProductionRole(firstRole.id),
      selectActiveProductionRole(secondRole.id),
    ]);
    expect(states).toHaveLength(2);
    const contextRows = await prisma.workerProductionContext.findMany({
      where: {
        organizationId: organizationA.id,
        employeeId: workerA.employee.id,
      },
      select: { activeProductionRoleId: true },
    });
    expect(contextRows).toHaveLength(1);
    expect([firstRole.id, secondRole.id]).toContain(
      contextRows[0]?.activeProductionRoleId,
    );
  });

  it("allows only one concurrent receive and preserves the one-active-assignment invariant", async () => {
    const product = await createProduct("concurrent", {
      status: ProductStatus.CREATED,
    });
    let sessionIndex = 0;
    const sessions = [sessionFor(workerA), sessionFor(workerB)];
    authMock.mockImplementation(
      async () => sessions[sessionIndex++] ?? sessions[0] ?? null,
    );

    const results = await Promise.allSettled([
      scanProduct({ barcode: product.barcode, idempotencyKey: randomUUID() }),
      scanProduct({ barcode: product.barcode, idempotencyKey: randomUUID() }),
    ]);
    const successes = results.filter((result) => result.status === "fulfilled");
    const failures = results.filter((result) => result.status === "rejected");
    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(1);
    expect(
      failures[0]?.status === "rejected" &&
        (failures[0].reason as { code?: string }).code,
    ).toBe(SCAN_ERROR_CODES.SCAN_CONFLICT);
    await expect(
      prisma.productAssignment.count({
        where: { productId: product.id, endedAt: null },
      }),
    ).resolves.toBe(1);
    await expect(
      prisma.product.findUniqueOrThrow({
        where: { id: product.id },
        select: { version: true },
      }),
    ).resolves.toEqual({ version: 1 });
  });

  it("returns equal results for concurrent same-key requests", async () => {
    setWorkerSession(workerA);
    const product = await createProduct("concurrent-same-key");
    const key = randomUUID();
    const results = await Promise.all([
      scanProduct({ barcode: product.barcode, idempotencyKey: key }),
      scanProduct({ barcode: product.barcode, idempotencyKey: key }),
    ]);
    expect(results[0]).toEqual(results[1]);
    await expect(
      prisma.productAssignment.count({ where: { productId: product.id } }),
    ).resolves.toBe(1);
  });
});
