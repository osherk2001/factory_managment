import "dotenv/config";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  DEVELOPMENT_ORGANIZATION,
  DEVELOPMENT_EMPLOYEE_PROFILE_IDS,
  DEVELOPMENT_USER_IDS,
  PERMISSION_CODES,
  seedDevelopmentFixtures,
} from "../../prisma/seed";
import { prisma } from "../../src/lib/db/client";

const expectedPermissionCodes = [...PERMISSION_CODES].sort();

describe.sequential("Phase 3 development fixtures", () => {
  beforeAll(async () => {
    await seedDevelopmentFixtures(prisma);
    await seedDevelopmentFixtures(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("creates exactly one development organization", async () => {
    const organizations = await prisma.organization.findMany({
      where: { slug: DEVELOPMENT_ORGANIZATION.slug },
    });

    expect(organizations).toHaveLength(1);
    expect(organizations[0]?.name).toBe(DEVELOPMENT_ORGANIZATION.name);
  });

  it("does not duplicate users or configuration on a second seed", async () => {
    const organization = await prisma.organization.findUniqueOrThrow({
      where: { slug: DEVELOPMENT_ORGANIZATION.slug },
    });

    await expect(
      prisma.user.count({
        where: {
          id: { in: DEVELOPMENT_USER_IDS },
          memberships: { some: { organizationId: organization.id } },
        },
      }),
    ).resolves.toBe(6);
    const users = await prisma.user.findMany({
      where: {
        id: { in: DEVELOPMENT_USER_IDS },
        memberships: { some: { organizationId: organization.id } },
      },
      select: { passwordHash: true, isSystemAdmin: true },
    });
    expect(users.every((user) => user.passwordHash === null)).toBe(true);
    expect(users.every((user) => user.isSystemAdmin === false)).toBe(true);
    await expect(
      prisma.membership.count({
        where: {
          organizationId: organization.id,
          userId: { in: DEVELOPMENT_USER_IDS },
        },
      }),
    ).resolves.toBe(6);
    await expect(
      prisma.accessRole.count({ where: { organizationId: organization.id } }),
    ).resolves.toBe(5);
    await expect(
      prisma.productionRole.count({
        where: { organizationId: organization.id },
      }),
    ).resolves.toBe(4);
    await expect(
      prisma.department.count({ where: { organizationId: organization.id } }),
    ).resolves.toBe(4);
    await expect(
      prisma.location.count({ where: { organizationId: organization.id } }),
    ).resolves.toBe(6);
    await expect(
      prisma.employeeProductionRole.count({
        where: {
          organizationId: organization.id,
          employeeId: { in: DEVELOPMENT_EMPLOYEE_PROFILE_IDS },
        },
      }),
    ).resolves.toBe(4);
    await expect(
      prisma.workflowTemplate.count({
        where: {
          organizationId: organization.id,
          name: "Standard Production Flow",
          version: 1,
        },
      }),
    ).resolves.toBe(1);
    await expect(
      prisma.workflowTemplate.count({
        where: {
          organizationId: organization.id,
          name: "Standard Production Flow",
          isActive: true,
        },
      }),
    ).resolves.toBe(1);
    await expect(
      prisma.workflowTemplateStage.count({
        where: {
          organizationId: organization.id,
          workflowTemplate: { name: "Standard Production Flow", version: 1 },
        },
      }),
    ).resolves.toBe(4);
  });

  it("assigns the expected AccessRole to the Factory Admin and workers", async () => {
    const organization = await prisma.organization.findUniqueOrThrow({
      where: { slug: DEVELOPMENT_ORGANIZATION.slug },
    });
    const memberships = await prisma.membership.findMany({
      where: {
        organizationId: organization.id,
        userId: { in: DEVELOPMENT_USER_IDS },
      },
      include: {
        user: true,
        accessRoleLinks: { include: { accessRole: true } },
      },
    });

    const roleFor = (email: string) =>
      memberships
        .find((membership) => membership.user.email === email)
        ?.accessRoleLinks.map((link) => link.accessRole.code)
        .sort();

    expect(roleFor("admin@factoryflow.example.test")).toEqual([
      "FACTORY_ADMIN",
    ]);
    expect(roleFor("worker1@factoryflow.example.test")).toEqual(["WORKER"]);
    expect(roleFor("worker2@factoryflow.example.test")).toEqual(["WORKER"]);
  });

  it("keeps AccessRole and ProductionRole separate and gives Worker 2 two production roles", async () => {
    const organization = await prisma.organization.findUniqueOrThrow({
      where: { slug: DEVELOPMENT_ORGANIZATION.slug },
    });
    const accessRoleCodes = (
      await prisma.accessRole.findMany({
        where: { organizationId: organization.id },
        select: { code: true },
      })
    ).map((role) => role.code);
    const productionRoleCodes = (
      await prisma.productionRole.findMany({
        where: { organizationId: organization.id },
        select: { code: true },
      })
    ).map((role) => role.code);

    expect(accessRoleCodes).not.toContain("SYSTEM_ADMIN");
    expect(
      productionRoleCodes.some((code) => accessRoleCodes.includes(code)),
    ).toBe(false);

    const workerTwo = await prisma.employeeProfile.findFirstOrThrow({
      where: {
        organizationId: organization.id,
        membership: {
          user: {
            id: DEVELOPMENT_USER_IDS[3],
            email: "worker2@factoryflow.example.test",
          },
        },
      },
      include: { productionRoleLinks: { include: { productionRole: true } } },
    });

    expect(
      workerTwo.productionRoleLinks
        .map((link) => link.productionRole.code)
        .sort(),
    ).toEqual(["POLISHER", "STONE_SETTER"]);
  });

  it("keeps departments and locations in the development organization", async () => {
    const organization = await prisma.organization.findUniqueOrThrow({
      where: { slug: DEVELOPMENT_ORGANIZATION.slug },
    });
    const locations = await prisma.location.findMany({
      where: { organizationId: organization.id },
      include: { department: true },
    });

    expect(
      locations
        .filter((location) => location.department !== null)
        .map((location) => [location.code, location.department?.code])
        .sort(),
    ).toEqual([
      ["CLEANING_WORK_AREA", "CLEANING"],
      ["POLISHING_WORK_AREA", "POLISHING"],
      ["QUALITY_CONTROL_WORK_AREA", "QUALITY_CONTROL"],
      ["STONE_SETTING_WORK_AREA", "STONE_SETTING"],
    ]);
    expect(
      locations
        .filter((location) => location.department === null)
        .map((location) => [location.code, location.type])
        .sort(),
    ).toEqual([
      ["MAIN_SAFE", "SAFE"],
      ["WAITING_AREA", "WAITING"],
    ]);
    expect(
      locations.every(
        (location) => location.organizationId === organization.id,
      ),
    ).toBe(true);
  });

  it("grants Factory Admin the complete seeded permission set", async () => {
    const organization = await prisma.organization.findUniqueOrThrow({
      where: { slug: DEVELOPMENT_ORGANIZATION.slug },
    });
    const factoryAdmin = await prisma.membership.findFirstOrThrow({
      where: {
        organizationId: organization.id,
        user: {
          id: DEVELOPMENT_USER_IDS[0],
          email: "admin@factoryflow.example.test",
        },
      },
      include: {
        accessRoleLinks: {
          where: { accessRole: { code: "FACTORY_ADMIN" } },
          include: {
            accessRole: {
              include: {
                permissionLinks: { include: { permission: true } },
              },
            },
          },
        },
      },
    });
    const permissionCodes =
      factoryAdmin.accessRoleLinks[0]?.accessRole.permissionLinks
        .map((link) => link.permission.code)
        .sort() ?? [];

    expect(permissionCodes).toEqual(expectedPermissionCodes);
  });

  it("does not create operational Product or workflow snapshot records", async () => {
    const organization = await prisma.organization.findUniqueOrThrow({
      where: { slug: DEVELOPMENT_ORGANIZATION.slug },
    });
    const [
      products,
      barcodes,
      orders,
      assignments,
      transitions,
      snapshots,
      weights,
      issues,
    ] = await Promise.all([
      prisma.product.count({ where: { organizationId: organization.id } }),
      prisma.barcode.count({ where: { organizationId: organization.id } }),
      prisma.productionOrder.count({
        where: { organizationId: organization.id },
      }),
      prisma.productAssignment.count({
        where: { organizationId: organization.id },
      }),
      prisma.productTransition.count({
        where: { organizationId: organization.id },
      }),
      prisma.workflowSnapshot.count({
        where: { organizationId: organization.id },
      }),
      prisma.weightEvent.count({ where: { organizationId: organization.id } }),
      prisma.issue.count({ where: { organizationId: organization.id } }),
    ]);

    expect({
      products,
      barcodes,
      orders,
      assignments,
      transitions,
      snapshots,
      weights,
      issues,
    }).toEqual({
      products: 0,
      barcodes: 0,
      orders: 0,
      assignments: 0,
      transitions: 0,
      snapshots: 0,
      weights: 0,
      issues: 0,
    });
  });
});
