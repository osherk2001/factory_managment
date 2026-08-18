import "dotenv/config";

import { randomBytes, randomUUID } from "node:crypto";

import argon2 from "argon2";
import { Prisma, PrismaClient } from "@prisma/client";
import { expect, test, type Page } from "@playwright/test";

const prisma = new PrismaClient();
const suffix = `${Date.now()}-${randomUUID().slice(0, 8)}`;
const password = `E2E-${randomBytes(18).toString("base64url")}`;
const managerUsername = `e2e-workflow-manager-${suffix}`;
const workerUsername = `e2e-workflow-worker-${suffix}`;
const workflowName = `E2E Standard Flow ${suffix}`;

let organizationId: string;
let managerUserId: string;
let workerUserId: string;
let managerAccessRoleId: string;
let workerAccessRoleId: string;
let workerEmployeeId: string;
let firstRoleId: string;
let secondRoleId: string;
let locationId: string;
let workflowTemplateId: string;
let productId: string;
let productBarcode: string;
let ambiguousProductId: string;
let ambiguousProductBarcode: string;
let ambiguousStage4Id: string;

async function login(page: Page, username: string) {
  await page.goto("/login");
  await page.locator("#username").fill(username);
  await page.locator("#password").fill(password);
  await page.locator('button[type="submit"]').click();
  await expect(page).toHaveURL(/\/app/);
}

async function getPermission(code: string) {
  try {
    return await prisma.permission.upsert({
      where: { code },
      update: {},
      create: { code, description: `E2E Phase 9 ${code}` },
      select: { id: true },
    });
  } catch (error) {
    if (
      !(error instanceof Prisma.PrismaClientKnownRequestError) ||
      error.code !== "P2002"
    ) {
      throw error;
    }
    return prisma.permission.findUniqueOrThrow({
      where: { code },
      select: { id: true },
    });
  }
}

test.describe.serial("Phase 9 workflow management and worker flow", () => {
  test.beforeAll(async () => {
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    const organization = await prisma.organization.create({
      data: {
        name: `E2E Workflow Factory ${suffix}`,
        slug: `e2e-workflow-${suffix}`,
      },
      select: { id: true },
    });
    organizationId = organization.id;

    const [manager, worker] = await Promise.all([
      prisma.user.create({
        data: { username: managerUsername, passwordHash },
        select: { id: true },
      }),
      prisma.user.create({
        data: { username: workerUsername, passwordHash },
        select: { id: true },
      }),
    ]);
    managerUserId = manager.id;
    workerUserId = worker.id;
    const [managerMembership, workerMembership] = await Promise.all([
      prisma.membership.create({
        data: { organizationId, userId: manager.id, status: "ACTIVE" },
        select: { id: true },
      }),
      prisma.membership.create({
        data: { organizationId, userId: worker.id, status: "ACTIVE" },
        select: { id: true },
      }),
    ]);
    const employee = await prisma.employeeProfile.create({
      data: {
        organizationId,
        membershipId: workerMembership.id,
        displayName: `E2E Workflow Worker ${suffix}`,
      },
      select: { id: true },
    });
    workerEmployeeId = employee.id;

    const [firstRole, secondRole, location] = await Promise.all([
      prisma.productionRole.create({
        data: {
          organizationId,
          code: `E2E-WF-START-${suffix}`,
          name: "E2E Start Role",
        },
        select: { id: true },
      }),
      prisma.productionRole.create({
        data: {
          organizationId,
          code: `E2E-WF-NEXT-${suffix}`,
          name: "E2E Next Role",
        },
        select: { id: true },
      }),
      prisma.location.create({
        data: {
          organizationId,
          code: `E2E-WF-AREA-${suffix}`,
          name: "E2E Workflow Area",
          type: "WORK_AREA",
        },
        select: { id: true },
      }),
    ]);
    firstRoleId = firstRole.id;
    secondRoleId = secondRole.id;
    locationId = location.id;
    await prisma.employeeProductionRole.create({
      data: {
        organizationId,
        employeeId: employee.id,
        productionRoleId: firstRole.id,
        handlingLocationId: location.id,
      },
    });

    const [workflowsManage, productsCreate, productsRead, scansPerform] =
      await Promise.all([
        getPermission("workflows.manage"),
        getPermission("products.create"),
        getPermission("products.read"),
        getPermission("scans.perform"),
      ]);
    const [managerAccessRole, workerAccessRole] = await Promise.all([
      prisma.accessRole.create({
        data: {
          organizationId,
          code: `E2E-WF-MANAGER-${suffix}`,
          name: "E2E Workflow Manager",
        },
        select: { id: true },
      }),
      prisma.accessRole.create({
        data: {
          organizationId,
          code: `E2E-WF-WORKER-${suffix}`,
          name: "E2E Workflow Worker",
        },
        select: { id: true },
      }),
    ]);
    managerAccessRoleId = managerAccessRole.id;
    workerAccessRoleId = workerAccessRole.id;
    await prisma.accessRolePermission.createMany({
      data: [workflowsManage, productsCreate, productsRead].map((item) => ({
        accessRoleId: managerAccessRole.id,
        permissionId: item.id,
      })),
    });
    await prisma.accessRolePermission.createMany({
      data: [productsRead, scansPerform].map((item) => ({
        accessRoleId: workerAccessRole.id,
        permissionId: item.id,
      })),
    });
    await prisma.membershipAccessRole.createMany({
      data: [
        {
          organizationId,
          membershipId: managerMembership.id,
          accessRoleId: managerAccessRole.id,
        },
        {
          organizationId,
          membershipId: workerMembership.id,
          accessRoleId: workerAccessRole.id,
        },
      ],
    });

    const ambiguousFixture = await prisma.$transaction(async (database) => {
      const template = await database.workflowTemplate.create({
        data: {
          organizationId,
          name: `E2E Ambiguous Flow ${suffix}`,
          version: 1,
          isActive: true,
        },
        select: { id: true },
      });
      await database.workflowTemplateStage.createMany({
        data: [
          {
            organizationId,
            workflowTemplateId: template.id,
            productionRoleId: firstRole.id,
            code: "AMBIGUOUS_1",
            name: "Ambiguous Stage 1",
            position: 1,
          },
          {
            organizationId,
            workflowTemplateId: template.id,
            productionRoleId: firstRole.id,
            code: "AMBIGUOUS_4",
            name: "Ambiguous Stage 4",
            position: 4,
          },
        ],
      });
      const templateStages = await database.workflowTemplateStage.findMany({
        where: { workflowTemplateId: template.id },
        orderBy: { position: "asc" },
        select: {
          id: true,
          code: true,
          name: true,
          position: true,
          productionRoleId: true,
        },
      });
      const product = await database.product.create({
        data: {
          organizationId,
          serialNumber: `E2E-WF-AMB-${suffix}`,
          status: "CREATED",
        },
        select: { id: true },
      });
      const barcode = await database.barcode.create({
        data: {
          organizationId,
          productId: product.id,
          value: `e2e_workflow_ambiguous_${randomUUID()}`,
        },
        select: { value: true },
      });
      const snapshot = await database.workflowSnapshot.create({
        data: {
          organizationId,
          productId: product.id,
          sourceTemplateId: template.id,
          sourceVersion: 1,
        },
        select: { id: true },
      });
      await database.workflowSnapshotStage.createMany({
        data: templateStages.map((stage) => ({
          organizationId,
          workflowSnapshotId: snapshot.id,
          productId: product.id,
          productionRoleId: stage.productionRoleId,
          sourceStageId: stage.id,
          code: stage.code,
          name: stage.name,
          position: stage.position,
        })),
      });
      const stage4 = await database.workflowSnapshotStage.findFirstOrThrow({
        where: { workflowSnapshotId: snapshot.id, code: "AMBIGUOUS_4" },
        select: { id: true },
      });
      return {
        productId: product.id,
        barcode: barcode.value,
        stage4Id: stage4.id,
      };
    });
    ambiguousProductId = ambiguousFixture.productId;
    ambiguousProductBarcode = ambiguousFixture.barcode;
    ambiguousStage4Id = ambiguousFixture.stage4Id;
  });

  test.afterAll(async () => {
    await prisma.product.updateMany({
      where: { organizationId },
      data: { currentStageId: null },
    });
    await prisma.idempotencyKey.deleteMany({ where: { organizationId } });
    await prisma.auditLog.deleteMany({ where: { organizationId } });
    await prisma.productTransition.deleteMany({ where: { organizationId } });
    await prisma.productAssignment.deleteMany({ where: { organizationId } });
    await prisma.barcode.deleteMany({ where: { organizationId } });
    await prisma.workflowSnapshotStage.deleteMany({
      where: { organizationId },
    });
    await prisma.workflowSnapshot.deleteMany({ where: { organizationId } });
    await prisma.product.deleteMany({ where: { organizationId } });
    await prisma.productSerialCounter.deleteMany({ where: { organizationId } });
    await prisma.workflowTemplateStage.deleteMany({
      where: { organizationId },
    });
    await prisma.workflowTemplate.deleteMany({ where: { organizationId } });
    await prisma.workerProductionContext.deleteMany({
      where: { organizationId },
    });
    await prisma.employeeProductionRole.deleteMany({
      where: { organizationId },
    });
    await prisma.membershipAccessRole.deleteMany({ where: { organizationId } });
    await prisma.accessRolePermission.deleteMany({
      where: {
        accessRoleId: { in: [managerAccessRoleId, workerAccessRoleId] },
      },
    });
    await prisma.accessRole.deleteMany({ where: { organizationId } });
    await prisma.employeeProfile.deleteMany({ where: { organizationId } });
    await prisma.membership.deleteMany({ where: { organizationId } });
    await prisma.user.deleteMany({
      where: { id: { in: [managerUserId, workerUserId] } },
    });
    await prisma.location.delete({ where: { id: locationId } });
    await prisma.productionRole.deleteMany({
      where: { id: { in: [firstRoleId, secondRoleId] } },
    });
    await prisma.organization.delete({ where: { id: organizationId } });
    await prisma.$disconnect();
  });

  test("creates a workflow, assigns it to a Product, and shows the snapshot", async ({
    page,
  }) => {
    await login(page, managerUsername);
    await page.goto("/app/workflows");
    await page.waitForLoadState("networkidle");
    await page.locator("#workflow-name").fill(workflowName);
    const firstRow = page.getByTestId("workflow-stage-row").nth(0);
    await firstRow.locator("input").nth(0).fill("START");
    await firstRow.locator("input").nth(1).fill("Start work");
    await firstRow.locator("select").selectOption(firstRoleId);
    await page.getByTestId("add-workflow-stage").click();
    await expect(page.getByTestId("workflow-stage-row")).toHaveCount(2);
    const secondRow = page.getByTestId("workflow-stage-row").nth(1);
    await secondRow.locator("input").nth(0).fill("NEXT");
    await secondRow.locator("input").nth(1).fill("Next work");
    await secondRow.locator("select").selectOption(secondRoleId);
    await page.getByTestId("save-workflow").click();
    await expect(page.getByTestId("workflow-saved")).toBeVisible();

    const template = await prisma.workflowTemplate.findFirstOrThrow({
      where: { organizationId, name: workflowName, isActive: true },
      select: { id: true },
    });
    workflowTemplateId = template.id;

    await page.goto("/app/products/new");
    await page.locator("#workflowTemplateId").selectOption(workflowTemplateId);
    await page.locator("#create-product-submit").click();
    await expect(page.getByTestId("product-created")).toBeVisible();
    productBarcode =
      (await page.getByTestId("created-barcode").textContent()) ?? "";
    const product = await prisma.product.findFirstOrThrow({
      where: { organizationId, barcode: { value: productBarcode } },
      select: { id: true },
    });
    productId = product.id;
    await page.goto(`/app/products/${productId}`);
    await expect(page.getByTestId("product-workflow-name")).toContainText(
      workflowName,
    );
    await expect(page.getByTestId("product-workflow-stages")).toContainText(
      "Start work",
    );
    await expect(
      prisma.workflowSnapshot.findUniqueOrThrow({
        where: { productId },
        include: { stages: true },
      }),
    ).resolves.toMatchObject({ sourceTemplateId: workflowTemplateId });
  });

  test("receives the workflow Product and immediately shows current and expected stages", async ({
    page,
  }) => {
    await login(page, workerUsername);
    await page.goto("/app/worker/scan");
    await page.getByTestId("worker-scan-barcode").fill(productBarcode);
    await page.getByTestId("worker-scan-submit").click();
    await expect(page.getByTestId("scan-current-stage")).toHaveText(
      "Start work",
    );
    await expect(page.getByTestId("scan-expected-stage")).toHaveText(
      "Next work",
    );

    await page.goto("/app/worker");
    await expect(page.getByTestId("worker-current-stage")).toHaveText(
      "Start work",
    );
    await expect(page.getByTestId("worker-expected-stage")).toHaveText(
      "Next work",
    );
    await expect(
      prisma.product.findUniqueOrThrow({
        where: { id: productId },
        select: {
          status: true,
          currentWorkerId: true,
          currentStage: { select: { code: true } },
        },
      }),
    ).resolves.toEqual({
      status: "IN_PROGRESS",
      currentWorkerId: workerEmployeeId,
      currentStage: { code: "START" },
    });
  });

  test("keeps an ambiguous scan read-only until the worker selects a real stage", async ({
    page,
  }) => {
    await login(page, workerUsername);
    const idempotencyCountBefore = await prisma.idempotencyKey.count({
      where: {
        organizationId,
        userId: workerUserId,
        operation: "scans.receive",
      },
    });

    await page.goto("/app/worker/scan");
    await page.getByTestId("worker-scan-barcode").fill(ambiguousProductBarcode);
    await page.getByTestId("worker-scan-submit").click();
    await expect(page.getByTestId("workflow-stage-selection")).toBeVisible();
    await expect(page.getByTestId("workflow-stage-option")).toHaveCount(2);
    await expect(
      page.getByRole("button", { name: /Ambiguous Stage 1/ }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Ambiguous Stage 4/ }),
    ).toBeVisible();

    await expect(
      prisma.product.findUniqueOrThrow({
        where: { id: ambiguousProductId },
        select: {
          status: true,
          version: true,
          currentWorkerId: true,
          currentStageId: true,
        },
      }),
    ).resolves.toEqual({
      status: "CREATED",
      version: 0,
      currentWorkerId: null,
      currentStageId: null,
    });
    await expect(
      prisma.productAssignment.count({
        where: { productId: ambiguousProductId, endedAt: null },
      }),
    ).resolves.toBe(0);
    await expect(
      prisma.productTransition.count({
        where: {
          productId: ambiguousProductId,
          eventType: "PRODUCT_RECEIVED",
        },
      }),
    ).resolves.toBe(0);
    await expect(
      prisma.idempotencyKey.count({
        where: {
          organizationId,
          userId: workerUserId,
          operation: "scans.receive",
        },
      }),
    ).resolves.toBe(idempotencyCountBefore);

    await page.getByRole("button", { name: /Ambiguous Stage 4/ }).click();
    await expect(page.getByTestId("scan-current-stage")).toHaveText(
      "Ambiguous Stage 4",
    );
    await expect(
      prisma.product.findUniqueOrThrow({
        where: { id: ambiguousProductId },
        select: {
          status: true,
          version: true,
          currentWorkerId: true,
          currentRoleId: true,
          currentStageId: true,
        },
      }),
    ).resolves.toEqual({
      status: "IN_PROGRESS",
      version: 1,
      currentWorkerId: workerEmployeeId,
      currentRoleId: firstRoleId,
      currentStageId: ambiguousStage4Id,
    });
    await expect(
      prisma.productAssignment.findMany({
        where: { productId: ambiguousProductId, endedAt: null },
        select: { productionRoleId: true, workflowStageId: true },
      }),
    ).resolves.toEqual([
      { productionRoleId: firstRoleId, workflowStageId: ambiguousStage4Id },
    ]);
    await expect(
      prisma.productTransition.findMany({
        where: {
          productId: ambiguousProductId,
          eventType: "PRODUCT_RECEIVED",
        },
        select: { toRoleId: true, toStageId: true },
      }),
    ).resolves.toEqual([
      { toRoleId: firstRoleId, toStageId: ambiguousStage4Id },
    ]);
  });
});
