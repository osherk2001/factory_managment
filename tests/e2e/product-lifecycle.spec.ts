import "dotenv/config";

import { randomBytes, randomUUID } from "node:crypto";

import argon2 from "argon2";
import { PrismaClient } from "@prisma/client";
import { expect, test, type Page } from "@playwright/test";

const prisma = new PrismaClient();
const suffix = `${Date.now()}-${randomUUID().slice(0, 8)}`;
const password = `E2E-${randomBytes(18).toString("base64url")}`;
const username = `e2e-lifecycle-manager-${suffix}`;
const organizationName = `E2E Lifecycle Factory ${suffix}`;
const organizationSlug = `e2e-lifecycle-${suffix}`;

let organizationId: string;
let userId: string;
let membershipId: string;
let accessRoleId: string;
let readyProductId: string;
let cancelledProductId: string;
let trashProductId: string;

async function login(page: Page) {
  await page.goto("/login");
  await page.locator("#username").fill(username);
  await page.locator("#password").fill(password);
  await page.locator('button[type="submit"]').click();
  await expect(page).toHaveURL(/\/app/);
}

test.describe.serial("Phase 8 product lifecycle management", () => {
  test.beforeAll(async () => {
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    const organization = await prisma.organization.create({
      data: { name: organizationName, slug: organizationSlug },
      select: { id: true },
    });
    organizationId = organization.id;

    const user = await prisma.user.create({
      data: { username, passwordHash, isActive: true },
      select: { id: true },
    });
    userId = user.id;
    const membership = await prisma.membership.create({
      data: { organizationId, userId, status: "ACTIVE" },
      select: { id: true },
    });
    membershipId = membership.id;

    const permissionCodes = [
      "products.read",
      "products.complete",
      "products.cancel",
      "products.restore",
      "products.trash",
    ];
    const permissions = await Promise.all(
      permissionCodes.map((code) =>
        prisma.permission.upsert({
          where: { code },
          update: {},
          create: { code, description: `E2E ${code}` },
          select: { id: true },
        }),
      ),
    );
    const accessRole = await prisma.accessRole.create({
      data: {
        organizationId,
        code: `E2E-LIFECYCLE-${suffix}`,
        name: "E2E Lifecycle Manager",
      },
      select: { id: true },
    });
    accessRoleId = accessRole.id;
    await prisma.accessRolePermission.createMany({
      data: permissions.map((permission) => ({
        accessRoleId,
        permissionId: permission.id,
      })),
    });
    await prisma.membershipAccessRole.create({
      data: { organizationId, membershipId, accessRoleId },
    });

    const [readyProduct, cancelledProduct, trashProduct] = await Promise.all([
      prisma.product.create({
        data: {
          organizationId,
          serialNumber: `E2E-LIFECYCLE-READY-${suffix}`,
          status: "READY_FOR_HANDOFF",
          version: 0,
        },
        select: { id: true },
      }),
      prisma.product.create({
        data: {
          organizationId,
          serialNumber: `E2E-LIFECYCLE-CANCELLED-${suffix}`,
          status: "CANCELLED",
          cancelledAt: new Date(),
          version: 0,
        },
        select: { id: true },
      }),
      prisma.product.create({
        data: {
          organizationId,
          serialNumber: `E2E-LIFECYCLE-TRASH-${suffix}`,
          status: "CANCELLED",
          cancelledAt: new Date(),
          version: 0,
        },
        select: { id: true },
      }),
    ]);
    readyProductId = readyProduct.id;
    cancelledProductId = cancelledProduct.id;
    trashProductId = trashProduct.id;
  });

  test.afterAll(async () => {
    await prisma.idempotencyKey.deleteMany({ where: { organizationId } });
    await prisma.auditLog.deleteMany({ where: { organizationId } });
    await prisma.productTransition.deleteMany({ where: { organizationId } });
    await prisma.product.deleteMany({ where: { organizationId } });
    await prisma.membershipAccessRole.deleteMany({ where: { accessRoleId } });
    await prisma.accessRolePermission.deleteMany({ where: { accessRoleId } });
    await prisma.accessRole.delete({ where: { id: accessRoleId } });
    await prisma.membership.delete({ where: { id: membershipId } });
    await prisma.user.delete({ where: { id: userId } });
    await prisma.organization.delete({ where: { id: organizationId } });
    await prisma.$disconnect();
  });

  test("shows contextual completion controls and completes a READY Product", async ({
    page,
  }) => {
    await login(page);
    await page.goto(`/app/products/${readyProductId}`);
    await expect(page.getByTestId("product-detail-status")).toBeVisible();
    await expect(page.getByTestId("complete-product")).toBeVisible();
    await expect(page.getByTestId("cancel-product")).toBeVisible();
    await page.getByTestId("complete-product").click();
    await expect(page.getByTestId("lifecycle-success")).toBeVisible();
    await expect(page.getByTestId("product-detail-version")).toHaveText("1");
    await expect(page.getByTestId("complete-product")).toHaveCount(0);
    await expect(
      prisma.product.findUniqueOrThrow({
        where: { id: readyProductId },
        select: { status: true, completedAt: true, version: true },
      }),
    ).resolves.toMatchObject({
      status: "COMPLETED",
      completedAt: expect.any(Date),
      version: 1,
    });
  });

  test("restores a CANCELLED Product without assigning it", async ({
    page,
  }) => {
    await login(page);
    await page.goto(`/app/products/${cancelledProductId}`);
    await expect(page.getByTestId("restore-product")).toBeVisible();
    await expect(page.getByTestId("trash-product")).toBeVisible();
    await page.getByTestId("restore-product").click();
    await expect(page.getByTestId("lifecycle-success")).toBeVisible();
    await expect(page.getByTestId("restore-product")).toHaveCount(0);
    await expect(
      prisma.product.findUniqueOrThrow({
        where: { id: cancelledProductId },
        select: { status: true, cancelledAt: true, currentWorkerId: true },
      }),
    ).resolves.toEqual({
      status: "READY_FOR_HANDOFF",
      cancelledAt: null,
      currentWorkerId: null,
    });
  });

  test("moves a CANCELLED Product to logical trash", async ({ page }) => {
    await login(page);
    await page.goto(`/app/products/${trashProductId}`);
    await page.getByTestId("trash-product").click();
    await expect(page.getByTestId("lifecycle-success")).toBeVisible();
    await expect(
      prisma.product.findUniqueOrThrow({
        where: { id: trashProductId },
        select: { status: true, cancelledAt: true, trashedAt: true },
      }),
    ).resolves.toMatchObject({
      status: "TRASHED",
      cancelledAt: null,
      trashedAt: expect.any(Date),
    });
  });
});
