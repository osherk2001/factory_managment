import "dotenv/config";

import { randomUUID } from "node:crypto";

import { Prisma } from "@prisma/client";
import type { Session } from "next-auth";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("../../src/auth", () => ({ auth: vi.fn() }));

import { auth } from "../../src/auth";
import { prisma } from "../../src/lib/db/client";
import { createProduct } from "../../src/modules/products/server";

const suffix = `${Date.now()}-${randomUUID().slice(0, 8)}`;
const authMock = auth as unknown as {
  mockResolvedValue: (value: Session | null) => void;
};

let organizationA: { id: string };
let organizationB: { id: string };
let allowedUser: { id: string; username: string };
let organizationBUser: { id: string; username: string };
let noPermissionUser: { id: string; username: string };
let productionRoleOnlyUser: { id: string; username: string };
let inactiveMembershipUser: { id: string; username: string };
let inactiveUser: { id: string; username: string };
let allowedMembershipA: { id: string };
let allowedMembershipB: { id: string };
let noPermissionMembership: { id: string };
let productionRoleOnlyMembership: { id: string };
let inactiveMembership: { id: string };
let inactiveUserMembership: { id: string };
let accessRoleA: { id: string };
let accessRoleB: { id: string };
let permission: { id: string };
let productionRole: { id: string };
let employeeProfile: { id: string };
let orderA: { id: string };
let orderB: { id: string };
let productTypeA: { id: string };
let productTypeB: { id: string };
let inactiveProductTypeA: { id: string };

async function setMockSession(user: { id: string; username: string }) {
  authMock.mockResolvedValue({
    user: { id: user.id, username: user.username, name: user.username },
    expires: new Date(Date.now() + 60_000).toISOString(),
  });
}

function input(overrides: Record<string, unknown> = {}) {
  return {
    idempotencyKey: randomUUID(),
    ...overrides,
  } as {
    idempotencyKey: string;
    productionOrderId?: string;
    productTypeId?: string;
    isUrgent?: boolean;
    targetAt?: string;
  };
}

async function getCreatePermission() {
  const existing = await prisma.permission.findUnique({
    where: { code: "products.create" },
  });
  if (existing) {
    return existing;
  }

  try {
    return await prisma.permission.create({
      data: {
        code: "products.create",
        description: "Create products",
      },
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const permission = await prisma.permission.findUniqueOrThrow({
        where: { code: "products.create" },
      });
      return permission;
    }
    throw error;
  }
}

describe.sequential("Phase 5 Product creation", () => {
  beforeAll(async () => {
    organizationA = await prisma.organization.create({
      data: { name: `Phase 5 Factory A ${suffix}`, slug: `phase5-a-${suffix}` },
    });
    organizationB = await prisma.organization.create({
      data: { name: `Phase 5 Factory B ${suffix}`, slug: `phase5-b-${suffix}` },
    });

    const users = await Promise.all(
      [
        ["allowed", true],
        ["organization-b", true],
        ["no-permission", true],
        ["production-role-only", true],
        ["inactive-membership", true],
        ["inactive-user", false],
      ].map(async ([name, isActive]) => {
        const user = await prisma.user.create({
          data: {
            username: `phase5-${name}-${suffix}`,
            isActive: Boolean(isActive),
          },
        });
        return { id: user.id, username: user.username as string };
      }),
    );
    [
      allowedUser,
      organizationBUser,
      noPermissionUser,
      productionRoleOnlyUser,
      inactiveMembershipUser,
      inactiveUser,
    ] = users;

    [
      allowedMembershipA,
      allowedMembershipB,
      noPermissionMembership,
      productionRoleOnlyMembership,
      inactiveMembership,
      inactiveUserMembership,
    ] = await Promise.all([
      prisma.membership.create({
        data: {
          organizationId: organizationA.id,
          userId: allowedUser.id,
          status: "ACTIVE",
        },
      }),
      prisma.membership.create({
        data: {
          organizationId: organizationB.id,
          userId: organizationBUser.id,
          status: "ACTIVE",
        },
      }),
      prisma.membership.create({
        data: {
          organizationId: organizationA.id,
          userId: noPermissionUser.id,
          status: "ACTIVE",
        },
      }),
      prisma.membership.create({
        data: {
          organizationId: organizationA.id,
          userId: productionRoleOnlyUser.id,
          status: "ACTIVE",
        },
      }),
      prisma.membership.create({
        data: {
          organizationId: organizationA.id,
          userId: inactiveMembershipUser.id,
          status: "INACTIVE",
        },
      }),
      prisma.membership.create({
        data: {
          organizationId: organizationA.id,
          userId: inactiveUser.id,
          status: "ACTIVE",
        },
      }),
    ]);

    permission = await getCreatePermission();
    [accessRoleA, accessRoleB] = await Promise.all([
      prisma.accessRole.create({
        data: {
          organizationId: organizationA.id,
          code: `PHASE5_CREATE_A_${suffix}`,
          name: "Phase 5 Create A",
        },
      }),
      prisma.accessRole.create({
        data: {
          organizationId: organizationB.id,
          code: `PHASE5_CREATE_B_${suffix}`,
          name: "Phase 5 Create B",
        },
      }),
    ]);
    await prisma.accessRolePermission.createMany({
      data: [
        { accessRoleId: accessRoleA.id, permissionId: permission.id },
        { accessRoleId: accessRoleB.id, permissionId: permission.id },
      ],
    });
    await prisma.membershipAccessRole.createMany({
      data: [
        {
          organizationId: organizationA.id,
          membershipId: allowedMembershipA.id,
          accessRoleId: accessRoleA.id,
        },
        {
          organizationId: organizationB.id,
          membershipId: allowedMembershipB.id,
          accessRoleId: accessRoleB.id,
        },
      ],
    });

    productionRole = await prisma.productionRole.create({
      data: {
        organizationId: organizationA.id,
        code: `PHASE5_ROLE_${suffix}`,
        name: "Phase 5 Production Role",
      },
    });
    employeeProfile = await prisma.employeeProfile.create({
      data: {
        organizationId: organizationA.id,
        membershipId: productionRoleOnlyMembership.id,
        displayName: "Phase 5 Production Role User",
      },
    });
    await prisma.employeeProductionRole.create({
      data: {
        organizationId: organizationA.id,
        employeeId: employeeProfile.id,
        productionRoleId: productionRole.id,
      },
    });

    [orderA, orderB] = await Promise.all([
      prisma.productionOrder.create({
        data: {
          organizationId: organizationA.id,
          orderNumber: `PHASE5-ORDER-A-${suffix}`,
          status: "OPEN",
        },
      }),
      prisma.productionOrder.create({
        data: {
          organizationId: organizationB.id,
          orderNumber: `PHASE5-ORDER-B-${suffix}`,
          status: "OPEN",
        },
      }),
    ]);
    [productTypeA, productTypeB, inactiveProductTypeA] = await Promise.all([
      prisma.productType.create({
        data: {
          organizationId: organizationA.id,
          code: `PHASE5-A-${suffix}`,
          name: "Phase 5 Type A",
          isActive: true,
        },
      }),
      prisma.productType.create({
        data: {
          organizationId: organizationB.id,
          code: `PHASE5-B-${suffix}`,
          name: "Phase 5 Type B",
          isActive: true,
        },
      }),
      prisma.productType.create({
        data: {
          organizationId: organizationA.id,
          code: `PHASE5-INACTIVE-${suffix}`,
          name: "Phase 5 Inactive Type",
          isActive: false,
        },
      }),
    ]);
  });

  afterAll(async () => {
    const organizationIds = [organizationA?.id, organizationB?.id].filter(
      (id): id is string => Boolean(id),
    );
    if (organizationIds.length === 0) {
      await prisma.$disconnect();
      return;
    }

    const accessRoleIds = [accessRoleA?.id, accessRoleB?.id].filter(
      (id): id is string => Boolean(id),
    );
    const membershipIds = [
      allowedMembershipA?.id,
      allowedMembershipB?.id,
      noPermissionMembership?.id,
      productionRoleOnlyMembership?.id,
      inactiveMembership?.id,
      inactiveUserMembership?.id,
    ].filter((id): id is string => Boolean(id));
    const userIds = [
      allowedUser?.id,
      organizationBUser?.id,
      noPermissionUser?.id,
      productionRoleOnlyUser?.id,
      inactiveMembershipUser?.id,
      inactiveUser?.id,
    ].filter((id): id is string => Boolean(id));
    const orderIds = [orderA?.id, orderB?.id].filter((id): id is string =>
      Boolean(id),
    );
    const productTypeIds = [
      productTypeA?.id,
      productTypeB?.id,
      inactiveProductTypeA?.id,
    ].filter((id): id is string => Boolean(id));

    const productIds = (
      await prisma.product.findMany({
        where: { organizationId: { in: organizationIds } },
        select: { id: true },
      })
    ).map((product) => product.id);

    if (productIds.length > 0) {
      await prisma.auditLog.deleteMany({
        where: { targetType: "Product", targetId: { in: productIds } },
      });
      await prisma.productTransition.deleteMany({
        where: { productId: { in: productIds } },
      });
      await prisma.barcode.deleteMany({
        where: { productId: { in: productIds } },
      });
      await prisma.idempotencyKey.deleteMany({
        where: { resultReference: { in: productIds } },
      });
      await prisma.product.deleteMany({ where: { id: { in: productIds } } });
    }

    if (employeeProfile?.id) {
      await prisma.employeeProductionRole.deleteMany({
        where: { employeeId: employeeProfile.id },
      });
      await prisma.employeeProfile.deleteMany({
        where: { id: employeeProfile.id },
      });
    }
    if (accessRoleIds.length > 0) {
      await prisma.membershipAccessRole.deleteMany({
        where: { accessRoleId: { in: accessRoleIds } },
      });
      await prisma.accessRolePermission.deleteMany({
        where: { accessRoleId: { in: accessRoleIds } },
      });
      await prisma.accessRole.deleteMany({
        where: { id: { in: accessRoleIds } },
      });
    }
    if (productionRole?.id) {
      await prisma.productionRole.deleteMany({
        where: { id: productionRole.id },
      });
    }
    if (orderIds.length > 0) {
      await prisma.productionOrder.deleteMany({
        where: { id: { in: orderIds } },
      });
    }
    if (productTypeIds.length > 0) {
      await prisma.productType.deleteMany({
        where: { id: { in: productTypeIds } },
      });
    }
    await prisma.productSerialCounter.deleteMany({
      where: { organizationId: { in: organizationIds } },
    });
    if (membershipIds.length > 0) {
      await prisma.membership.deleteMany({
        where: { id: { in: membershipIds } },
      });
    }
    if (userIds.length > 0) {
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    }
    await prisma.organization.deleteMany({
      where: { id: { in: organizationIds } },
    });
    await prisma.$disconnect();
  });

  it("creates a CREATED Product with serial, barcode, history, and audit", async () => {
    await setMockSession(allowedUser);
    const created = await createProduct(
      input({
        productionOrderId: orderA.id,
        productTypeId: productTypeA.id,
        isUrgent: true,
        targetAt: "2026-09-01T10:00:00.000Z",
      }),
    );

    expect(created.serialNumber).toMatch(/^PRD-\d{4}-\d{6}$/);
    expect(created.status).toBe("CREATED");
    expect(created.barcode).toMatch(/^ff_[A-Za-z0-9_-]+$/);
    expect(created.barcode).not.toBe(created.id);
    expect(created.barcode).not.toBe(created.serialNumber);

    const product = await prisma.product.findFirst({
      where: { id: created.id, organizationId: organizationA.id },
    });
    expect(product).toMatchObject({
      status: "CREATED",
      currentWorkerId: null,
      currentRoleId: null,
      currentLocationId: null,
      currentStageId: null,
      completedAt: null,
      cancelledAt: null,
      trashedAt: null,
      version: 0,
      isUrgent: true,
    });
    await expect(
      prisma.productAssignment.count({ where: { productId: created.id } }),
    ).resolves.toBe(0);
    await expect(
      prisma.barcode.count({ where: { productId: created.id } }),
    ).resolves.toBe(1);
    await expect(
      prisma.productTransition.findFirst({
        where: { productId: created.id },
        select: { eventType: true, fromStatus: true, toStatus: true },
      }),
    ).resolves.toEqual({
      eventType: "PRODUCT_CREATED",
      fromStatus: null,
      toStatus: "CREATED",
    });
    await expect(
      prisma.auditLog.findFirst({
        where: { targetType: "Product", targetId: created.id },
        select: {
          action: true,
          organizationId: true,
          actorUserId: true,
          actorMembershipId: true,
        },
      }),
    ).resolves.toEqual({
      action: "product.created",
      organizationId: organizationA.id,
      actorUserId: allowedUser.id,
      actorMembershipId: allowedMembershipA.id,
    });
  });

  it("allocates sequential tenant/year serials and isolates tenants", async () => {
    await setMockSession(allowedUser);
    const first = await createProduct(input());
    const second = await createProduct(input());

    expect(Number(first.serialNumber.slice(-6)) + 1).toBe(
      Number(second.serialNumber.slice(-6)),
    );

    await setMockSession(organizationBUser);
    const tenantB = await createProduct(
      input({
        productionOrderId: orderB.id,
        productTypeId: productTypeB.id,
      }),
    );
    expect(tenantB.serialNumber).toMatch(
      new RegExp(`^PRD-${new Date().getUTCFullYear()}-000001$`),
    );
  });

  it("allocates unique serials under concurrent creation", async () => {
    await setMockSession(allowedUser);
    const created = await Promise.all(
      Array.from({ length: 8 }, () => createProduct(input())),
    );
    const serials = created.map((product) => product.serialNumber);

    expect(new Set(serials).size).toBe(serials.length);
    expect(new Set(created.map((product) => product.barcode)).size).toBe(
      created.length,
    );
  });

  it("returns one result for concurrent reuse of the same idempotency key", async () => {
    await setMockSession(allowedUser);
    const before = await prisma.product.count({
      where: { organizationId: organizationA.id },
    });
    const request = input({ isUrgent: true });
    const results = await Promise.all(
      Array.from({ length: 5 }, () => createProduct(request)),
    );
    const first = results[0];

    if (!first) {
      throw new Error("Concurrent Product creation returned no result");
    }
    expect(new Set(results.map((product) => product.id)).size).toBe(1);
    await expect(
      prisma.product.count({ where: { organizationId: organizationA.id } }),
    ).resolves.toBe(before + 1);
    await expect(
      prisma.productTransition.count({ where: { productId: first.id } }),
    ).resolves.toBe(1);
    await expect(
      prisma.idempotencyKey.count({
        where: {
          organizationId: organizationA.id,
          userId: allowedUser.id,
          key: request.idempotencyKey,
        },
      }),
    ).resolves.toBe(1);
  });

  it("replays exact idempotent requests and rejects changed payloads", async () => {
    await setMockSession(allowedUser);
    const request = input({ isUrgent: false });
    const first = await createProduct(request);
    const replay = await createProduct(request);

    expect(replay).toEqual(first);
    await expect(
      prisma.product.count({ where: { id: first.id } }),
    ).resolves.toBe(1);
    await expect(
      prisma.barcode.count({ where: { productId: first.id } }),
    ).resolves.toBe(1);
    await expect(
      prisma.productTransition.count({ where: { productId: first.id } }),
    ).resolves.toBe(1);

    await expect(
      createProduct({ ...request, isUrgent: true }),
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });

    const differentKey = await createProduct(input({ isUrgent: false }));
    expect(differentKey.id).not.toBe(first.id);

    await setMockSession(organizationBUser);
    const sameKeyOtherTenant = await createProduct({
      ...request,
      productionOrderId: orderB.id,
      productTypeId: productTypeB.id,
    });
    expect(sameKeyOtherTenant.id).not.toBe(first.id);
  });

  it("replays the immutable creation snapshot after Product state changes", async () => {
    await setMockSession(allowedUser);
    const request = input({ isUrgent: true });
    const first = await createProduct(request);
    const storedBefore = await prisma.idempotencyKey.findUniqueOrThrow({
      where: {
        organizationId_userId_key: {
          organizationId: organizationA.id,
          userId: allowedUser.id,
          key: request.idempotencyKey,
        },
      },
      select: { resultData: true },
    });

    expect(storedBefore.resultData).toEqual(first);
    await prisma.product.update({
      where: { id: first.id },
      data: { status: "IN_PROGRESS" },
    });

    const replay = await createProduct(request);
    const storedAfter = await prisma.idempotencyKey.findUniqueOrThrow({
      where: {
        organizationId_userId_key: {
          organizationId: organizationA.id,
          userId: allowedUser.id,
          key: request.idempotencyKey,
        },
      },
      select: { resultData: true },
    });

    expect(replay).toEqual(first);
    expect(storedAfter.resultData).toEqual(storedBefore.resultData);
    await expect(
      prisma.product.findUniqueOrThrow({
        where: { id: first.id },
        select: { status: true },
      }),
    ).resolves.toEqual({ status: "IN_PROGRESS" });
  });

  it("rejects corrupt stored creation snapshots safely", async () => {
    await setMockSession(allowedUser);
    const request = input();
    const created = await createProduct(request);

    await prisma.idempotencyKey.update({
      where: {
        organizationId_userId_key: {
          organizationId: organizationA.id,
          userId: allowedUser.id,
          key: request.idempotencyKey,
        },
      },
      data: { resultData: { id: created.id, status: "IN_PROGRESS" } },
    });

    await expect(createProduct(request)).rejects.toMatchObject({
      code: "PRODUCT_CREATION_FAILED",
    });
  });

  it("normalizes explicit target offsets and rejects timezone-less input", async () => {
    await setMockSession(allowedUser);
    const request = input({ targetAt: "2026-09-01T10:00:00+03:00" });
    const created = await createProduct(request);

    expect(created.targetAt).toBe("2026-09-01T07:00:00.000Z");
    await expect(
      createProduct({ ...request, targetAt: "2026-09-01T07:00:00.000Z" }),
    ).resolves.toEqual(created);
    await expect(
      createProduct(input({ targetAt: "2026-09-01T10:00" })),
    ).rejects.toMatchObject({ code: "INVALID_PRODUCT_INPUT" });
  });

  it("rejects cross-tenant and inactive Product references atomically", async () => {
    await setMockSession(allowedUser);
    const before = await prisma.product.count({
      where: { organizationId: organizationA.id },
    });

    await expect(
      createProduct(input({ productionOrderId: orderB.id })),
    ).rejects.toMatchObject({ code: "PRODUCT_ORDER_NOT_FOUND" });
    await expect(
      createProduct(input({ productTypeId: productTypeB.id })),
    ).rejects.toMatchObject({ code: "PRODUCT_TYPE_NOT_FOUND" });
    await expect(
      createProduct(input({ productTypeId: inactiveProductTypeA.id })),
    ).rejects.toMatchObject({ code: "PRODUCT_TYPE_INACTIVE" });

    await expect(
      prisma.product.count({ where: { organizationId: organizationA.id } }),
    ).resolves.toBe(before);
  });

  it("enforces Products.create through current User and Membership state", async () => {
    await setMockSession(noPermissionUser);
    await expect(createProduct(input())).rejects.toMatchObject({
      code: "FORBIDDEN",
    });

    await setMockSession(productionRoleOnlyUser);
    await expect(createProduct(input())).rejects.toMatchObject({
      code: "FORBIDDEN",
    });

    await setMockSession(inactiveMembershipUser);
    await expect(createProduct(input())).rejects.toMatchObject({
      code: "MEMBERSHIP_INACTIVE",
    });

    await setMockSession(inactiveUser);
    await expect(createProduct(input())).rejects.toMatchObject({
      code: "USER_INACTIVE",
    });
  });

  it("rolls back the idempotency reservation when creation validation fails", async () => {
    await setMockSession(allowedUser);
    const idempotencyKey = randomUUID();
    const before = await prisma.idempotencyKey.count({
      where: {
        organizationId: organizationA.id,
        userId: allowedUser.id,
        key: idempotencyKey,
      },
    });

    await expect(
      createProduct({ idempotencyKey, productTypeId: inactiveProductTypeA.id }),
    ).rejects.toMatchObject({ code: "PRODUCT_TYPE_INACTIVE" });
    await expect(
      prisma.idempotencyKey.count({
        where: {
          organizationId: organizationA.id,
          userId: allowedUser.id,
          key: idempotencyKey,
        },
      }),
    ).resolves.toBe(before);
  });
});
