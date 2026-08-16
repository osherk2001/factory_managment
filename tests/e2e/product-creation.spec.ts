import "dotenv/config";

import { randomBytes, randomUUID } from "node:crypto";

import argon2 from "argon2";
import { PrismaClient } from "@prisma/client";
import { expect, test, type Page } from "@playwright/test";

const prisma = new PrismaClient();
const suffix = `${Date.now()}-${randomUUID().slice(0, 8)}`;
const allowedUsername = `e2e-product-allowed-${suffix}`;
const deniedUsername = `e2e-product-denied-${suffix}`;
const password = `E2E-${randomBytes(18).toString("base64url")}`;
const organizationName = `E2E Product Factory ${suffix}`;
const organizationSlug = `e2e-product-${suffix}`;

let organizationId: string;
let allowedUserId: string;
let deniedUserId: string;
let allowedMembershipId: string;
let deniedMembershipId: string;
let accessRoleId: string;
let permissionId: string;
let productTypeId: string;
let productionOrderId: string;

async function login(page: Page, username: string) {
  await page.goto("/login");
  await page.locator("#username").fill(username);
  await page.locator("#password").fill(password);
  await page.locator('button[type="submit"]').click();
  await expect(page).toHaveURL(/\/app/);
}

test.describe.serial("Phase 5 Product creation flow", () => {
  test.beforeAll(async () => {
    const passwordHash = await argon2.hash(password, {
      type: argon2.argon2id,
    });
    const organization = await prisma.organization.create({
      data: { name: organizationName, slug: organizationSlug },
    });
    organizationId = organization.id;

    const [allowedUser, deniedUser] = await Promise.all([
      prisma.user.create({
        data: { username: allowedUsername, passwordHash, isActive: true },
      }),
      prisma.user.create({
        data: { username: deniedUsername, passwordHash, isActive: true },
      }),
    ]);
    allowedUserId = allowedUser.id;
    deniedUserId = deniedUser.id;

    const [allowedMembership, deniedMembership] = await Promise.all([
      prisma.membership.create({
        data: {
          organizationId,
          userId: allowedUserId,
          status: "ACTIVE",
        },
      }),
      prisma.membership.create({
        data: {
          organizationId,
          userId: deniedUserId,
          status: "ACTIVE",
        },
      }),
    ]);
    allowedMembershipId = allowedMembership.id;
    deniedMembershipId = deniedMembership.id;

    const permission = await prisma.permission.upsert({
      where: { code: "products.create" },
      update: {},
      create: {
        code: "products.create",
        description: "Create products",
      },
    });
    permissionId = permission.id;

    const accessRole = await prisma.accessRole.create({
      data: {
        organizationId,
        code: `E2E_PRODUCT_CREATE_${suffix}`,
        name: "E2E Product Creator",
      },
    });
    accessRoleId = accessRole.id;
    await prisma.accessRolePermission.create({
      data: { accessRoleId, permissionId },
    });
    await prisma.membershipAccessRole.create({
      data: {
        organizationId,
        membershipId: allowedMembershipId,
        accessRoleId,
      },
    });

    const [productType, productionOrder] = await Promise.all([
      prisma.productType.create({
        data: {
          organizationId,
          code: `E2E-TYPE-${suffix}`,
          name: "E2E Product Type",
          isActive: true,
        },
      }),
      prisma.productionOrder.create({
        data: {
          organizationId,
          orderNumber: `E2E-ORDER-${suffix}`,
          status: "OPEN",
        },
      }),
    ]);
    productTypeId = productType.id;
    productionOrderId = productionOrder.id;
  });

  test.afterAll(async () => {
    const productIds = (
      await prisma.product.findMany({
        where: { organizationId },
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

    await prisma.productSerialCounter.deleteMany({
      where: { organizationId },
    });
    await prisma.membershipAccessRole.deleteMany({
      where: { accessRoleId },
    });
    await prisma.accessRolePermission.deleteMany({
      where: { accessRoleId },
    });
    await prisma.accessRole.deleteMany({ where: { id: accessRoleId } });
    await prisma.productionOrder.deleteMany({
      where: { id: productionOrderId },
    });
    await prisma.productType.deleteMany({ where: { id: productTypeId } });
    await prisma.membership.deleteMany({
      where: { id: { in: [allowedMembershipId, deniedMembershipId] } },
    });
    await prisma.user.deleteMany({
      where: { id: { in: [allowedUserId, deniedUserId] } },
    });
    await prisma.organization.delete({ where: { id: organizationId } });
    await prisma.$disconnect();
  });

  test("allows an authorized user to create and confirm a Product", async ({
    page,
  }) => {
    await login(page, allowedUsername);
    await page.goto("/app/products/new");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("#product-creation-form")).toBeVisible();
    await page.locator("#productionOrderId").selectOption(productionOrderId);
    await page.locator("#productTypeId").selectOption(productTypeId);
    const localTargetAt = "2026-09-01T10:00";
    const expectedTargetAt = new Date(localTargetAt).toISOString();
    await page.locator("#targetAt").fill(localTargetAt);
    await expect(page.locator("#targetAtUtc")).toHaveValue(expectedTargetAt);
    await page.locator("#create-product-submit").click();

    await expect(page.getByTestId("product-created")).toBeVisible();
    const serialNumber = await page.getByTestId("created-serial").textContent();
    expect(serialNumber).toMatch(/^PRD-\d{4}-\d{6}$/);
    if (!serialNumber) {
      throw new Error("Product creation did not return a serial number");
    }
    await expect(page.getByTestId("created-status")).toHaveText("CREATED");
    await expect(page.getByTestId("created-barcode")).toHaveText(
      /^ff_[A-Za-z0-9_-]+$/,
    );

    const persistedProduct = await prisma.product.findFirstOrThrow({
      where: { organizationId, serialNumber },
      select: { targetAt: true },
    });
    expect(persistedProduct.targetAt?.toISOString()).toBe(expectedTargetAt);
  });

  test("denies a signed-in user without products.create", async ({ page }) => {
    await page.goto("/app");
    await page.locator('form button[type="submit"]').click();
    await expect(page).toHaveURL(/\/login/);

    await login(page, deniedUsername);
    await page.goto("/app/products/new");
    await expect(page.locator("#product-creation-form")).toHaveCount(0);
  });
});
