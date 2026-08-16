import "dotenv/config";

import { randomBytes, randomUUID } from "node:crypto";

import argon2 from "argon2";
import { PrismaClient } from "@prisma/client";
import { expect, test } from "@playwright/test";

const prisma = new PrismaClient();
const suffix = `${Date.now()}-${randomUUID().slice(0, 8)}`;
const username = `e2e-user-${suffix}`;
const password = `E2E-${randomBytes(18).toString("base64url")}`;
const organizationName = `E2E Factory ${suffix}`;
const organizationSlug = `e2e-${suffix}`;

let userId: string;
let organizationId: string;

test.describe.serial("Phase 4 authentication flow", () => {
  test.beforeAll(async () => {
    const passwordHash = await argon2.hash(password, {
      type: argon2.argon2id,
    });
    const organization = await prisma.organization.create({
      data: { name: organizationName, slug: organizationSlug },
    });
    organizationId = organization.id;

    const user = await prisma.user.create({
      data: {
        username,
        passwordHash,
        isActive: true,
      },
    });
    userId = user.id;

    await prisma.membership.create({
      data: {
        organizationId,
        userId,
        status: "ACTIVE",
      },
    });
  });

  test.afterAll(async () => {
    if (userId) {
      await prisma.membership.deleteMany({ where: { userId } });
      await prisma.user.delete({ where: { id: userId } });
    }
    if (organizationId) {
      await prisma.organization.delete({ where: { id: organizationId } });
    }
    await prisma.$disconnect();
  });

  test("redirects unauthenticated users, signs in, and signs out", async ({
    page,
  }) => {
    await page.goto("/app");
    await expect(page).toHaveURL(/\/login/);

    await page.locator("#username").fill(username);
    await page.locator("#password").fill(password);
    await page.getByRole("button", { name: "כניסה" }).click();

    await expect(page).toHaveURL(/\/app/);
    await expect(page.getByText(username)).toBeVisible();
    await expect(page.getByText(organizationName)).toBeVisible();

    await page.getByRole("button", { name: "יציאה" }).click();
    await expect(page).toHaveURL(/\/login/);
  });

  test("shows one generic error for invalid credentials", async ({ page }) => {
    await page.goto("/login");
    await page.locator("#username").fill(username);
    await page.locator("#password").fill("wrong-password-123");
    await page.getByRole("button", { name: "כניסה" }).click();

    await expect(page.getByRole("alert")).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });
});
