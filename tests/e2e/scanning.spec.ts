import "dotenv/config";

import { randomBytes, randomUUID } from "node:crypto";

import argon2 from "argon2";
import { PrismaClient } from "@prisma/client";
import { expect, test, type Page } from "@playwright/test";

const prisma = new PrismaClient();
const suffix = `${Date.now()}-${randomUUID().slice(0, 8)}`;
const password = `E2E-${randomBytes(18).toString("base64url")}`;
const organizationName = `E2E Scanning Factory ${suffix}`;
const organizationSlug = `e2e-scanning-${suffix}`;
const workerAUsername = `e2e-scan-a-${suffix}`;
const workerBUsername = `e2e-scan-b-${suffix}`;

let organizationId: string;
let workerAUserId: string;
let workerBUserId: string;
let workerAEmployeeId: string;
let workerBEmployeeId: string;
let roleId: string;
let accessRoleId: string;
let createdProductId: string;
let createdBarcode: string;
let ownedProductId: string;
let ownedBarcode: string;
let finishProductId: string;
let finishBarcode: string;
let locationAId: string;
let locationBId: string;

async function login(page: Page, username: string) {
  await page.goto("/login");
  await page.locator("#username").fill(username);
  await page.locator("#password").fill(password);
  await page.locator('button[type="submit"]').click();
  await expect(page).toHaveURL(/\/app/);
}

async function createProduct(
  serialNumber: string,
  status: "CREATED" | "IN_PROGRESS",
  currentWorkerId: string | null = null,
  currentLocationId: string | null = null,
) {
  const product = await prisma.product.create({
    data: {
      organizationId,
      serialNumber,
      status,
      currentWorkerId,
      currentRoleId: currentWorkerId ? roleId : null,
      currentLocationId,
      version: currentWorkerId ? 3 : 0,
    },
    select: { id: true },
  });
  const barcode = await prisma.barcode.create({
    data: {
      organizationId,
      productId: product.id,
      value: `e2e_${serialNumber}_${randomUUID()}`,
    },
    select: { value: true },
  });
  if (currentWorkerId) {
    await prisma.productAssignment.create({
      data: {
        organizationId,
        productId: product.id,
        employeeId: currentWorkerId,
        productionRoleId: roleId,
        locationId: currentLocationId,
      },
    });
  }
  return { id: product.id, barcode: barcode.value };
}

test.describe.serial("Phase 7 worker scanning", () => {
  test.beforeAll(async () => {
    const passwordHash = await argon2.hash(password, {
      type: argon2.argon2id,
    });
    const organization = await prisma.organization.create({
      data: { name: organizationName, slug: organizationSlug },
      select: { id: true },
    });
    organizationId = organization.id;

    const [workerA, workerB] = await Promise.all([
      prisma.user.create({
        data: { username: workerAUsername, passwordHash },
        select: { id: true },
      }),
      prisma.user.create({
        data: { username: workerBUsername, passwordHash },
        select: { id: true },
      }),
    ]);
    workerAUserId = workerA.id;
    workerBUserId = workerB.id;
    const [membershipA, membershipB] = await Promise.all([
      prisma.membership.create({
        data: { organizationId, userId: workerAUserId, status: "ACTIVE" },
        select: { id: true },
      }),
      prisma.membership.create({
        data: { organizationId, userId: workerBUserId, status: "ACTIVE" },
        select: { id: true },
      }),
    ]);
    const [employeeA, employeeB] = await Promise.all([
      prisma.employeeProfile.create({
        data: {
          organizationId,
          membershipId: membershipA.id,
          displayName: `E2E Scan Worker A ${suffix}`,
        },
        select: { id: true },
      }),
      prisma.employeeProfile.create({
        data: {
          organizationId,
          membershipId: membershipB.id,
          displayName: `E2E Scan Worker B ${suffix}`,
        },
        select: { id: true },
      }),
    ]);
    workerAEmployeeId = employeeA.id;
    workerBEmployeeId = employeeB.id;

    const [departmentA, departmentB] = await Promise.all([
      prisma.department.create({
        data: {
          organizationId,
          code: `E2E-SCAN-A-${suffix}`,
          name: "E2E Scan Department A",
        },
        select: { id: true },
      }),
      prisma.department.create({
        data: {
          organizationId,
          code: `E2E-SCAN-B-${suffix}`,
          name: "E2E Scan Department B",
        },
        select: { id: true },
      }),
    ]);
    const [locationA, locationB] = await Promise.all([
      prisma.location.create({
        data: {
          organizationId,
          departmentId: departmentA.id,
          code: `E2E-SCAN-AREA-A-${suffix}`,
          name: `E2E Scan Area A ${suffix}`,
          type: "WORK_AREA",
        },
        select: { id: true },
      }),
      prisma.location.create({
        data: {
          organizationId,
          departmentId: departmentB.id,
          code: `E2E-SCAN-AREA-B-${suffix}`,
          name: `E2E Scan Area B ${suffix}`,
          type: "WORK_AREA",
        },
        select: { id: true },
      }),
    ]);
    locationAId = locationA.id;
    locationBId = locationB.id;
    const role = await prisma.productionRole.create({
      data: {
        organizationId,
        code: `E2E-SCAN-ROLE-${suffix}`,
        name: `E2E Scan Role ${suffix}`,
      },
      select: { id: true },
    });
    roleId = role.id;
    await prisma.employeeProductionRole.createMany({
      data: [
        {
          organizationId,
          employeeId: workerAEmployeeId,
          productionRoleId: roleId,
          handlingLocationId: locationAId,
        },
        {
          organizationId,
          employeeId: workerBEmployeeId,
          productionRoleId: roleId,
          handlingLocationId: locationBId,
        },
      ],
    });

    const [productsRead, scansPerform, scansTakeover] = await Promise.all([
      prisma.permission.upsert({
        where: { code: "products.read" },
        update: {},
        create: { code: "products.read", description: "Read products" },
        select: { id: true },
      }),
      prisma.permission.upsert({
        where: { code: "scans.perform" },
        update: {},
        create: { code: "scans.perform", description: "Perform scans" },
        select: { id: true },
      }),
      prisma.permission.upsert({
        where: { code: "scans.takeover" },
        update: {},
        create: { code: "scans.takeover", description: "Take over scans" },
        select: { id: true },
      }),
    ]);
    const accessRole = await prisma.accessRole.create({
      data: {
        organizationId,
        code: `E2E-SCAN-ACCESS-${suffix}`,
        name: "E2E Scan Worker",
      },
      select: { id: true },
    });
    accessRoleId = accessRole.id;
    await prisma.accessRolePermission.createMany({
      data: [productsRead, scansPerform, scansTakeover].map((permission) => ({
        accessRoleId,
        permissionId: permission.id,
      })),
    });
    await prisma.membershipAccessRole.createMany({
      data: [membershipA, membershipB].map((membership) => ({
        organizationId,
        membershipId: membership.id,
        accessRoleId,
      })),
    });

    const created = await createProduct(
      `E2E-SCAN-CREATED-${suffix}`,
      "CREATED",
    );
    createdProductId = created.id;
    createdBarcode = created.barcode;
    const owned = await createProduct(
      `E2E-SCAN-OWNED-${suffix}`,
      "IN_PROGRESS",
      workerAEmployeeId,
      locationAId,
    );
    ownedProductId = owned.id;
    ownedBarcode = owned.barcode;
    const finish = await createProduct(
      `E2E-SCAN-FINISH-${suffix}`,
      "IN_PROGRESS",
      workerAEmployeeId,
      locationAId,
    );
    finishProductId = finish.id;
    finishBarcode = finish.barcode;
  });

  test.afterAll(async () => {
    await prisma.idempotencyKey.deleteMany({ where: { organizationId } });
    await prisma.auditLog.deleteMany({ where: { organizationId } });
    await prisma.productTransition.deleteMany({ where: { organizationId } });
    await prisma.productAssignment.deleteMany({ where: { organizationId } });
    await prisma.barcode.deleteMany({ where: { organizationId } });
    await prisma.product.deleteMany({ where: { organizationId } });
    await prisma.employeeProductionRole.deleteMany({
      where: { organizationId },
    });
    await prisma.membershipAccessRole.deleteMany({ where: { accessRoleId } });
    await prisma.accessRolePermission.deleteMany({ where: { accessRoleId } });
    await prisma.accessRole.delete({ where: { id: accessRoleId } });
    await prisma.employeeProfile.deleteMany({ where: { organizationId } });
    await prisma.membership.deleteMany({ where: { organizationId } });
    await prisma.user.deleteMany({
      where: { id: { in: [workerAUserId, workerBUserId] } },
    });
    await prisma.location.deleteMany({ where: { organizationId } });
    await prisma.department.deleteMany({ where: { organizationId } });
    await prisma.productionRole.deleteMany({ where: { organizationId } });
    await prisma.organization.delete({ where: { id: organizationId } });
    await prisma.$disconnect();
  });

  test("receives a CREATED Product from the mobile scan page", async ({
    page,
  }) => {
    await login(page, workerAUsername);
    await page.goto("/app/worker/scan");
    await expect(page.getByTestId("scan-active-role")).toHaveText(
      `E2E Scan Role ${suffix}`,
    );
    await expect(page.getByTestId("scan-handling-location")).toHaveText(
      `E2E Scan Area A ${suffix}`,
    );
    await page.getByTestId("worker-scan-barcode").fill(createdBarcode);
    await page.getByTestId("worker-scan-submit").click();
    await expect(page.getByTestId("scan-result")).toBeVisible();
    await expect(page.getByTestId("scan-result")).toContainText(
      `E2E-SCAN-CREATED-${suffix}`,
    );
    await expect(page.getByTestId("scan-result")).toContainText(
      `E2E Scan Role ${suffix}`,
    );

    await page.goto("/app/worker");
    await expect(
      page.getByRole("heading", {
        name: `E2E-SCAN-CREATED-${suffix}`,
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      prisma.product.findUniqueOrThrow({
        where: { id: createdProductId },
        select: { currentWorkerId: true, status: true, version: true },
      }),
    ).resolves.toEqual({
      currentWorkerId: workerAEmployeeId,
      status: "IN_PROGRESS",
      version: 1,
    });
  });

  test("shows same-worker confirmation without a takeover action", async ({
    page,
  }) => {
    await login(page, workerAUsername);
    await page.goto("/app/worker/scan");
    await page.getByTestId("worker-scan-barcode").fill(ownedBarcode);
    await page.getByTestId("worker-scan-submit").click();
    await expect(page.getByTestId("scan-result")).toBeVisible();
    await expect(page.getByTestId("takeover-confirm")).toHaveCount(0);
  });

  test("finishes same-worker work through explicit scan confirmation", async ({
    page,
  }) => {
    await login(page, workerAUsername);
    await page.goto("/app/worker/scan");
    await page.getByTestId("worker-scan-barcode").fill(finishBarcode);
    await page.getByTestId("worker-scan-submit").click();
    await expect(page.getByTestId("finish-confirm")).toBeVisible();
    await expect(page.getByTestId("takeover-confirm")).toHaveCount(0);
    await page.getByTestId("finish-confirm").click();
    await expect(page.getByTestId("lifecycle-result")).toContainText(
      `E2E-SCAN-FINISH-${suffix}`,
    );
    await expect(
      prisma.product.findUniqueOrThrow({
        where: { id: finishProductId },
        select: { status: true, currentWorkerId: true, version: true },
      }),
    ).resolves.toEqual({
      status: "READY_FOR_HANDOFF",
      currentWorkerId: null,
      version: 4,
    });
    await expect(
      prisma.productAssignment.findFirstOrThrow({
        where: { productId: finishProductId },
        select: { endReason: true, endedAt: true },
      }),
    ).resolves.toMatchObject({
      endReason: "FINISHED",
      endedAt: expect.any(Date),
    });
  });

  test("warns and then explicitly takes over another worker's Product", async ({
    page,
  }) => {
    await login(page, workerBUsername);
    await page.goto("/app/worker/scan");
    await page.getByTestId("worker-scan-barcode").fill(ownedBarcode);
    await page.getByTestId("worker-scan-submit").click();
    await expect(page.getByTestId("takeover-confirm")).toBeVisible();
    await expect(page.getByTestId("scan-result")).toContainText(
      `E2E Scan Worker A ${suffix}`,
    );
    await page.getByTestId("takeover-confirm").click();
    await expect(page.getByTestId("scan-result")).toContainText(
      `E2E Scan Worker B ${suffix}`,
    );
    await expect(
      prisma.product.findUniqueOrThrow({
        where: { id: ownedProductId },
        select: { currentWorkerId: true, version: true },
      }),
    ).resolves.toEqual({ currentWorkerId: workerBEmployeeId, version: 4 });
  });

  test("returns a safe result for an invalid barcode", async ({ page }) => {
    await login(page, workerAUsername);
    await page.goto("/app/worker/scan");
    await page.getByTestId("worker-scan-barcode").fill("not-a-real-barcode");
    await page.getByTestId("worker-scan-submit").click();
    await expect(page.getByTestId("scan-error")).toBeVisible();
    await expect(page.getByTestId("scan-result")).toHaveCount(0);
  });
});
