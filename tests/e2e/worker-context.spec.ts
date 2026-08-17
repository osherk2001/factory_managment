import "dotenv/config";

import { randomBytes, randomUUID } from "node:crypto";

import argon2 from "argon2";
import { PrismaClient } from "@prisma/client";
import { expect, test, type Page } from "@playwright/test";

const prisma = new PrismaClient();
const suffix = `${Date.now()}-${randomUUID().slice(0, 8)}`;
const singleUsername = `e2e-worker-single-${suffix}`;
const multiUsername = `e2e-worker-multi-${suffix}`;
const password = `E2E-${randomBytes(18).toString("base64url")}`;
const organizationName = `E2E Worker Factory ${suffix}`;
const organizationSlug = `e2e-worker-${suffix}`;

let organizationId: string;
let singleUserId: string;
let multiUserId: string;
let singleMembershipId: string;
let multiMembershipId: string;
let singleEmployeeId: string;
let multiEmployeeId: string;
let singleRoleId: string;
let multiRoleOneId: string;
let multiRoleTwoId: string;
let accessRoleId: string;
let productsReadPermissionId: string;
let scansPerformPermissionId: string;

async function login(page: Page, username: string) {
  await page.goto("/login");
  await page.locator("#username").fill(username);
  await page.locator("#password").fill(password);
  await page.locator('button[type="submit"]').click();
  await expect(page).toHaveURL(/\/app/);
}

test.describe.serial("Phase 6 worker production context", () => {
  test.beforeAll(async () => {
    const passwordHash = await argon2.hash(password, {
      type: argon2.argon2id,
    });
    const organization = await prisma.organization.create({
      data: { name: organizationName, slug: organizationSlug },
    });
    organizationId = organization.id;

    const [singleUser, multiUser] = await Promise.all([
      prisma.user.create({
        data: { username: singleUsername, passwordHash, isActive: true },
      }),
      prisma.user.create({
        data: { username: multiUsername, passwordHash, isActive: true },
      }),
    ]);
    singleUserId = singleUser.id;
    multiUserId = multiUser.id;

    const [singleMembership, multiMembership] = await Promise.all([
      prisma.membership.create({
        data: {
          organizationId,
          userId: singleUserId,
          status: "ACTIVE",
        },
      }),
      prisma.membership.create({
        data: {
          organizationId,
          userId: multiUserId,
          status: "ACTIVE",
        },
      }),
    ]);
    singleMembershipId = singleMembership.id;
    multiMembershipId = multiMembership.id;

    const [singleEmployee, multiEmployee] = await Promise.all([
      prisma.employeeProfile.create({
        data: {
          organizationId,
          membershipId: singleMembershipId,
          displayName: `E2E Single Worker ${suffix}`,
        },
      }),
      prisma.employeeProfile.create({
        data: {
          organizationId,
          membershipId: multiMembershipId,
          displayName: `E2E Multi Worker ${suffix}`,
        },
      }),
    ]);
    singleEmployeeId = singleEmployee.id;
    multiEmployeeId = multiEmployee.id;

    const [singleRole, multiRoleOne, multiRoleTwo] = await Promise.all([
      prisma.productionRole.create({
        data: {
          organizationId,
          code: `E2E-SINGLE-${suffix}`,
          name: `E2E Single Role ${suffix}`,
        },
      }),
      prisma.productionRole.create({
        data: {
          organizationId,
          code: `E2E-MULTI-ONE-${suffix}`,
          name: `E2E Multi Role One ${suffix}`,
        },
      }),
      prisma.productionRole.create({
        data: {
          organizationId,
          code: `E2E-MULTI-TWO-${suffix}`,
          name: `E2E Multi Role Two ${suffix}`,
        },
      }),
    ]);
    singleRoleId = singleRole.id;
    multiRoleOneId = multiRoleOne.id;
    multiRoleTwoId = multiRoleTwo.id;

    await prisma.employeeProductionRole.createMany({
      data: [
        {
          organizationId,
          employeeId: singleEmployeeId,
          productionRoleId: singleRoleId,
        },
        {
          organizationId,
          employeeId: multiEmployeeId,
          productionRoleId: multiRoleOneId,
        },
        {
          organizationId,
          employeeId: multiEmployeeId,
          productionRoleId: multiRoleTwoId,
        },
      ],
    });

    const [productsReadPermission, scansPerformPermission] = await Promise.all([
      prisma.permission.upsert({
        where: { code: "products.read" },
        update: {},
        create: {
          code: "products.read",
          description: "Read products",
        },
      }),
      prisma.permission.upsert({
        where: { code: "scans.perform" },
        update: {},
        create: {
          code: "scans.perform",
          description: "Perform scans",
        },
      }),
    ]);
    productsReadPermissionId = productsReadPermission.id;
    scansPerformPermissionId = scansPerformPermission.id;

    const accessRole = await prisma.accessRole.create({
      data: {
        organizationId,
        code: `E2E-WORKER-${suffix}`,
        name: "E2E Worker",
      },
    });
    accessRoleId = accessRole.id;
    await prisma.accessRolePermission.createMany({
      data: [
        { accessRoleId, permissionId: productsReadPermissionId },
        { accessRoleId, permissionId: scansPerformPermissionId },
      ],
    });
    await prisma.membershipAccessRole.createMany({
      data: [
        { organizationId, membershipId: singleMembershipId, accessRoleId },
        { organizationId, membershipId: multiMembershipId, accessRoleId },
      ],
    });

    await prisma.product.createMany({
      data: [
        {
          organizationId,
          serialNumber: `E2E-WORKER-MINE-${suffix}`,
          status: "IN_PROGRESS",
          currentWorkerId: singleEmployeeId,
          currentRoleId: singleRoleId,
        },
        {
          organizationId,
          serialNumber: `E2E-WORKER-OTHER-${suffix}`,
          status: "IN_PROGRESS",
          currentWorkerId: multiEmployeeId,
          currentRoleId: multiRoleOneId,
        },
      ],
    });
  });

  test.afterAll(async () => {
    await prisma.workerProductionContext.deleteMany({
      where: { organizationId },
    });
    await prisma.product.deleteMany({ where: { organizationId } });
    await prisma.employeeProductionRole.deleteMany({
      where: { organizationId },
    });
    await prisma.membershipAccessRole.deleteMany({
      where: { accessRoleId },
    });
    await prisma.accessRolePermission.deleteMany({
      where: { accessRoleId },
    });
    await prisma.accessRole.delete({ where: { id: accessRoleId } });
    await prisma.employeeProfile.deleteMany({ where: { organizationId } });
    await prisma.membership.deleteMany({ where: { organizationId } });
    await prisma.user.deleteMany({
      where: { id: { in: [singleUserId, multiUserId] } },
    });
    await prisma.productionRole.deleteMany({ where: { organizationId } });
    await prisma.organization.delete({ where: { id: organizationId } });
    await prisma.$disconnect();
  });

  test("shows a single-role worker's context and only personal Products", async ({
    page,
  }) => {
    await login(page, singleUsername);
    await page.goto("/app/worker");

    await expect(page.getByTestId("worker-home")).toBeVisible();
    await expect(page.getByTestId("worker-display-name")).toHaveText(
      `E2E Single Worker ${suffix}`,
    );
    await expect(page.getByTestId("worker-organization")).toHaveText(
      organizationName,
    );
    await expect(page.getByTestId("active-production-role")).toHaveText(
      `E2E Single Role ${suffix}`,
    );
    await expect(page.getByTestId("worker-product-serial")).toHaveText(
      `E2E-WORKER-MINE-${suffix}`,
    );
    await expect(page.getByText(`E2E-WORKER-OTHER-${suffix}`)).toHaveCount(0);
  });

  test("requires and persists an explicit multi-role selection", async ({
    page,
  }) => {
    await login(page, multiUsername);
    await page.goto("/app/worker");

    await expect(page.getByTestId("role-selection-required")).toBeVisible();
    await expect(page.getByTestId("active-production-role")).toHaveCount(0);

    await page
      .getByRole("button", { name: new RegExp(`E2E Multi Role One ${suffix}`) })
      .click();
    await expect(page.getByTestId("active-production-role")).toHaveText(
      `E2E Multi Role One ${suffix}`,
    );

    await page.reload();
    await expect(page.getByTestId("active-production-role")).toHaveText(
      `E2E Multi Role One ${suffix}`,
    );

    await page
      .getByRole("button", { name: new RegExp(`E2E Multi Role Two ${suffix}`) })
      .click();
    await expect(page.getByTestId("active-production-role")).toHaveText(
      `E2E Multi Role Two ${suffix}`,
    );
    await page.reload();
    await expect(page.getByTestId("active-production-role")).toHaveText(
      `E2E Multi Role Two ${suffix}`,
    );

    await expect(
      prisma.workerProductionContext.findUniqueOrThrow({
        where: {
          organizationId_employeeId: {
            organizationId,
            employeeId: multiEmployeeId,
          },
        },
        select: { activeProductionRoleId: true },
      }),
    ).resolves.toEqual({ activeProductionRoleId: multiRoleTwoId });
  });
});
