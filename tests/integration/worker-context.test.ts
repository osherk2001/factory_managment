import "dotenv/config";

import { randomUUID } from "node:crypto";

import { ProductStatus } from "@prisma/client";
import type { Session } from "next-auth";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("../../src/auth", () => ({ auth: vi.fn() }));

import { auth } from "../../src/auth";
import { prisma } from "../../src/lib/db/client";
import {
  getWorkerHomeData,
  listAvailableProductionRoles,
  listWorkerProducts,
  resolveEmployeeContext,
  resolveWorkerProductionRoleState,
  selectActiveProductionRole,
} from "../../src/modules/worker-context/server";
import { requireTenantContext } from "../../src/modules/authorization";

const suffix = `${Date.now()}-${randomUUID().slice(0, 8)}`;
const authMock = auth as unknown as {
  mockResolvedValue: (value: Session | null) => void;
};

let organizationA: { id: string; name: string };
let organizationB: { id: string };
let fullUser: { id: string; username: string };
let readOnlyUser: { id: string; username: string };
let noProfileUser: { id: string; username: string };
let inactiveEmployeeUser: { id: string; username: string };
let noRoleUser: { id: string; username: string };
let inactiveUser: { id: string; username: string };
let membershipA: { id: string };
let readOnlyMembership: { id: string };
let inactiveEmployeeMembership: { id: string };
let noRoleMembership: { id: string };
let employeeA: { id: string; displayName: string };
let readOnlyEmployee: { id: string };
let inactiveEmployee: { id: string };
let employeeB: { id: string };
let roleA1: { id: string };
let roleA2: { id: string };
let roleA3: { id: string };
let roleB: { id: string };
let fullAccessRole: { id: string };
let readOnlyAccessRole: { id: string };
let productsReadPermission: { id: string };
let scansPerformPermission: { id: string };

async function setMockSession(user: { id: string; username: string }) {
  authMock.mockResolvedValue({
    user: { id: user.id, username: user.username, name: user.username },
    expires: new Date(Date.now() + 60_000).toISOString(),
  });
}

async function createUser(username: string, isActive = true) {
  const user = await prisma.user.create({
    data: { username, isActive },
    select: { id: true, username: true },
  });

  if (!user.username) {
    throw new Error("Worker context fixture user must have a username");
  }

  return { id: user.id, username: user.username };
}

async function createPermission(code: string, description: string) {
  return prisma.permission.upsert({
    where: { code },
    update: {},
    create: { code, description },
    select: { id: true },
  });
}

describe.sequential("Phase 6 worker production context", () => {
  beforeAll(async () => {
    organizationA = await prisma.organization.create({
      data: {
        name: `Phase 6 Factory A ${suffix}`,
        slug: `phase6-a-${suffix}`,
      },
      select: { id: true, name: true },
    });
    organizationB = await prisma.organization.create({
      data: {
        name: `Phase 6 Factory B ${suffix}`,
        slug: `phase6-b-${suffix}`,
      },
      select: { id: true },
    });

    [fullUser, readOnlyUser, noProfileUser, inactiveEmployeeUser, noRoleUser] =
      await Promise.all([
        createUser(`phase6-full-${suffix}`),
        createUser(`phase6-read-only-${suffix}`),
        createUser(`phase6-no-profile-${suffix}`),
        createUser(`phase6-inactive-employee-${suffix}`),
        createUser(`phase6-no-role-${suffix}`),
      ]);
    inactiveUser = await createUser(`phase6-inactive-user-${suffix}`, false);

    const memberships = await Promise.all(
      [
        fullUser,
        readOnlyUser,
        noProfileUser,
        inactiveEmployeeUser,
        noRoleUser,
        inactiveUser,
      ].map((user) =>
        prisma.membership.create({
          data: {
            organizationId: organizationA.id,
            userId: user.id,
            status: "ACTIVE",
          },
          select: { id: true },
        }),
      ),
    );
    [
      membershipA,
      readOnlyMembership,
      ,
      inactiveEmployeeMembership,
      noRoleMembership,
    ] = memberships;

    [employeeA, readOnlyEmployee, inactiveEmployee] = await Promise.all([
      prisma.employeeProfile.create({
        data: {
          organizationId: organizationA.id,
          membershipId: membershipA.id,
          displayName: `Phase 6 Full Worker ${suffix}`,
        },
        select: { id: true, displayName: true },
      }),
      prisma.employeeProfile.create({
        data: {
          organizationId: organizationA.id,
          membershipId: readOnlyMembership.id,
          displayName: `Phase 6 Read Only ${suffix}`,
        },
        select: { id: true },
      }),
      prisma.employeeProfile.create({
        data: {
          organizationId: organizationA.id,
          membershipId: inactiveEmployeeMembership.id,
          displayName: `Phase 6 Inactive ${suffix}`,
          isActive: false,
        },
        select: { id: true },
      }),
      prisma.employeeProfile.create({
        data: {
          organizationId: organizationA.id,
          membershipId: noRoleMembership.id,
          displayName: `Phase 6 No Role ${suffix}`,
        },
        select: { id: true },
      }),
    ]);
    const otherTenantUser = await createUser(`phase6-other-tenant-${suffix}`);
    const otherTenantMembership = await prisma.membership.create({
      data: {
        organizationId: organizationB.id,
        userId: otherTenantUser.id,
        status: "ACTIVE",
      },
      select: { id: true },
    });
    employeeB = await prisma.employeeProfile.create({
      data: {
        organizationId: organizationB.id,
        membershipId: otherTenantMembership.id,
        displayName: `Phase 6 Other Tenant ${suffix}`,
      },
      select: { id: true },
    });

    [roleA1, roleA2, roleA3] = await Promise.all(
      ["POLISHER", "STONE_SETTER", "QC"].map((code) =>
        prisma.productionRole.create({
          data: {
            organizationId: organizationA.id,
            code: `PHASE6-${code}-${suffix}`,
            name: `Phase 6 ${code}`,
          },
          select: { id: true },
        }),
      ),
    );
    roleB = await prisma.productionRole.create({
      data: {
        organizationId: organizationB.id,
        code: `PHASE6-OTHER-${suffix}`,
        name: "Phase 6 Other Tenant",
      },
      select: { id: true },
    });

    await prisma.employeeProductionRole.createMany({
      data: [
        {
          organizationId: organizationA.id,
          employeeId: employeeA.id,
          productionRoleId: roleA1.id,
        },
        {
          organizationId: organizationA.id,
          employeeId: employeeA.id,
          productionRoleId: roleA2.id,
        },
        {
          organizationId: organizationA.id,
          employeeId: employeeA.id,
          productionRoleId: roleA3.id,
        },
        {
          organizationId: organizationA.id,
          employeeId: readOnlyEmployee.id,
          productionRoleId: roleA1.id,
        },
        {
          organizationId: organizationA.id,
          employeeId: inactiveEmployee.id,
          productionRoleId: roleA1.id,
        },
        {
          organizationId: organizationB.id,
          employeeId: employeeB.id,
          productionRoleId: roleB.id,
        },
      ],
    });

    [productsReadPermission, scansPerformPermission] = await Promise.all([
      createPermission("products.read", "Read products"),
      createPermission("scans.perform", "Perform scans"),
    ]);
    [fullAccessRole, readOnlyAccessRole] = await Promise.all([
      prisma.accessRole.create({
        data: {
          organizationId: organizationA.id,
          code: `PHASE6-FULL-${suffix}`,
          name: "Phase 6 Full Worker",
        },
        select: { id: true },
      }),
      prisma.accessRole.create({
        data: {
          organizationId: organizationA.id,
          code: `PHASE6-READ-${suffix}`,
          name: "Phase 6 Read Only",
        },
        select: { id: true },
      }),
    ]);
    await prisma.accessRolePermission.createMany({
      data: [
        {
          accessRoleId: fullAccessRole.id,
          permissionId: productsReadPermission.id,
        },
        {
          accessRoleId: fullAccessRole.id,
          permissionId: scansPerformPermission.id,
        },
        {
          accessRoleId: readOnlyAccessRole.id,
          permissionId: productsReadPermission.id,
        },
      ],
    });
    await prisma.membershipAccessRole.createMany({
      data: [
        {
          organizationId: organizationA.id,
          membershipId: membershipA.id,
          accessRoleId: fullAccessRole.id,
        },
        {
          organizationId: organizationA.id,
          membershipId: readOnlyMembership.id,
          accessRoleId: readOnlyAccessRole.id,
        },
      ],
    });

    await prisma.product.createMany({
      data: [
        {
          organizationId: organizationA.id,
          serialNumber: `PHASE6-MINE-${suffix}`,
          status: ProductStatus.IN_PROGRESS,
          currentWorkerId: employeeA.id,
          currentRoleId: roleA1.id,
        },
        {
          organizationId: organizationA.id,
          serialNumber: `PHASE6-CREATED-${suffix}`,
          status: ProductStatus.CREATED,
          currentWorkerId: employeeA.id,
          currentRoleId: roleA1.id,
        },
        {
          organizationId: organizationA.id,
          serialNumber: `PHASE6-READ-${suffix}`,
          status: ProductStatus.IN_PROGRESS,
          currentWorkerId: readOnlyEmployee.id,
          currentRoleId: roleA1.id,
        },
        {
          organizationId: organizationB.id,
          serialNumber: `PHASE6-OTHER-${suffix}`,
          status: ProductStatus.IN_PROGRESS,
          currentWorkerId: employeeB.id,
          currentRoleId: roleB.id,
        },
      ],
    });
  });

  afterAll(async () => {
    const organizationIds = [organizationA?.id, organizationB?.id].filter(
      (id): id is string => Boolean(id),
    );

    await prisma.workerProductionContext.deleteMany({
      where: { organizationId: { in: organizationIds } },
    });
    await prisma.product.deleteMany({
      where: { organizationId: { in: organizationIds } },
    });
    await prisma.employeeProductionRole.deleteMany({
      where: { organizationId: { in: organizationIds } },
    });
    await prisma.membershipAccessRole.deleteMany({
      where: { organizationId: { in: organizationIds } },
    });
    await prisma.accessRolePermission.deleteMany({
      where: {
        accessRoleId: {
          in: [fullAccessRole?.id, readOnlyAccessRole?.id].filter(Boolean),
        },
      },
    });
    await prisma.accessRole.deleteMany({
      where: {
        id: {
          in: [fullAccessRole?.id, readOnlyAccessRole?.id].filter(Boolean),
        },
      },
    });
    await prisma.employeeProfile.deleteMany({
      where: { organizationId: { in: organizationIds } },
    });
    await prisma.membership.deleteMany({
      where: { organizationId: { in: organizationIds } },
    });
    await prisma.user.deleteMany({
      where: {
        username: { startsWith: "phase6-" },
      },
    });
    await prisma.productionRole.deleteMany({
      where: { organizationId: { in: organizationIds } },
    });
    await prisma.organization.deleteMany({
      where: { id: { in: organizationIds } },
    });
    await prisma.$disconnect();
  });

  it("resolves the authenticated tenant employee and safe available roles", async () => {
    await setMockSession(fullUser);
    const tenant = await requireTenantContext();
    const employee = await resolveEmployeeContext(tenant);
    expect(employee).toMatchObject({
      userId: fullUser.id,
      membershipId: membershipA.id,
      organizationId: organizationA.id,
      displayName: employeeA.displayName,
    });

    const roles = await listAvailableProductionRoles(employee);
    expect(roles.map((role) => role.id)).toEqual(
      expect.arrayContaining([roleA1.id, roleA2.id, roleA3.id]),
    );
    expect(roles).not.toEqual(expect.arrayContaining([{ id: roleB.id }]));
    expect(roles[0]).toEqual(
      expect.objectContaining({ code: expect.stringContaining("PHASE6-") }),
    );
  });

  it("requires an active EmployeeProfile and rejects inactive user or employee state", async () => {
    await setMockSession(noProfileUser);
    await expect(
      resolveEmployeeContext(await requireTenantContext()),
    ).rejects.toMatchObject({
      code: "EMPLOYEE_PROFILE_REQUIRED",
    });

    await setMockSession(inactiveEmployeeUser);
    await expect(
      resolveEmployeeContext(await requireTenantContext()),
    ).rejects.toMatchObject({
      code: "EMPLOYEE_INACTIVE",
    });

    await setMockSession(inactiveUser);
    await expect(requireTenantContext()).rejects.toMatchObject({
      code: "USER_INACTIVE",
    });
  });

  it("automatically resolves one role and requires explicit selection for multiple roles", async () => {
    await setMockSession(noRoleUser);
    const noRoleEmployeeContext = await resolveEmployeeContext(
      await requireTenantContext(),
    );
    await expect(
      resolveWorkerProductionRoleState(noRoleEmployeeContext),
    ).resolves.toMatchObject({
      kind: "NO_PRODUCTION_ROLES",
      activeProductionRole: null,
    });

    await setMockSession(readOnlyUser);
    const singleRoleData = await getWorkerHomeData();
    expect(singleRoleData.productionRoleState).toMatchObject({
      kind: "READY",
      activeProductionRole: { id: roleA1.id },
      activeProductionRoleSource: "automatic",
    });
    await expect(
      prisma.workerProductionContext.findUnique({
        where: {
          organizationId_employeeId: {
            organizationId: organizationA.id,
            employeeId: readOnlyEmployee.id,
          },
        },
      }),
    ).resolves.toBeNull();

    await setMockSession(fullUser);
    const multiRoleData = await getWorkerHomeData();
    expect(multiRoleData.productionRoleState).toMatchObject({
      kind: "ACTIVE_PRODUCTION_ROLE_REQUIRED",
      activeProductionRole: null,
    });
  });

  it("persists the selected role and revalidates stale assignments", async () => {
    await setMockSession(fullUser);
    await expect(selectActiveProductionRole(roleA2.id)).resolves.toMatchObject({
      kind: "READY",
      activeProductionRole: { id: roleA2.id },
      activeProductionRoleSource: "persisted",
    });

    await expect(
      prisma.workerProductionContext.findUniqueOrThrow({
        where: {
          organizationId_employeeId: {
            organizationId: organizationA.id,
            employeeId: employeeA.id,
          },
        },
        select: { activeProductionRoleId: true },
      }),
    ).resolves.toEqual({ activeProductionRoleId: roleA2.id });
    await expect(getWorkerHomeData()).resolves.toMatchObject({
      productionRoleState: {
        activeProductionRole: { id: roleA2.id },
        activeProductionRoleSource: "persisted",
      },
    });

    await prisma.employeeProductionRole.delete({
      where: {
        employeeId_productionRoleId: {
          employeeId: employeeA.id,
          productionRoleId: roleA2.id,
        },
      },
    });
    await expect(
      resolveWorkerProductionRoleState(
        await resolveEmployeeContext(await requireTenantContext()),
      ),
    ).resolves.toMatchObject({
      kind: "ACTIVE_PRODUCTION_ROLE_REQUIRED",
      activeProductionRole: null,
    });
  });

  it("keeps personal product reads tenant-scoped and permission-separated", async () => {
    await setMockSession(fullUser);
    const products = await listWorkerProducts();
    expect(products).toHaveLength(1);
    expect(products[0]).toMatchObject({
      serialNumber: `PHASE6-MINE-${suffix}`,
      status: "IN_PROGRESS",
    });
    expect(products).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ serialNumber: `PHASE6-OTHER-${suffix}` }),
      ]),
    );
    expect(products[0]).not.toHaveProperty("passwordHash");

    await setMockSession(readOnlyUser);
    await expect(listWorkerProducts()).resolves.toHaveLength(1);
    await expect(selectActiveProductionRole(roleA1.id)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});
