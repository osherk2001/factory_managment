import "dotenv/config";
import { randomBytes, randomUUID } from "node:crypto";
import argon2 from "argon2";
import QRCode from "qrcode";
import { expect, test, type Page } from "@playwright/test";
import { prisma } from "../../src/lib/db/client";
import { makeActor, makeFactory, cleanupFactory } from "../helpers/factory";
let factory: { id: string };
let actor: Awaited<ReturnType<typeof makeActor>>;
let product: { id: string; serialNumber: string };
let barcode: string;
const password = randomBytes(24).toString("base64url");
async function login(page: Page) {
  await page.goto("/login");
  await page.locator("#username").fill(actor.user.username!);
  await page.locator("#password").fill(password);
  await page.getByRole("button", { name: "כניסה", exact: true }).click();
  await expect(page).toHaveURL(/\/app$/);
}
test.describe.serial("MVP manager and camera journeys", () => {
  test.beforeAll(async () => {
    factory = await makeFactory("MVP browser factory");
    actor = await makeActor(factory.id);
    await prisma.user.update({
      where: { id: actor.user.id },
      data: { passwordHash: await argon2.hash(password) },
    });
    const employee = await prisma.employeeProfile.create({
      data: {
        organizationId: factory.id,
        membershipId: actor.membership.id,
        displayName: "Camera worker",
      },
    });
    const role = await prisma.productionRole.create({
      data: { organizationId: factory.id, code: "ASSEMBLY", name: "Assembly" },
    });
    const location = await prisma.location.create({
      data: {
        organizationId: factory.id,
        code: "WORK",
        name: "Work area",
        type: "WORK_AREA",
      },
    });
    await prisma.employeeProductionRole.create({
      data: {
        organizationId: factory.id,
        employeeId: employee.id,
        productionRoleId: role.id,
        handlingLocationId: location.id,
      },
    });
    product = await prisma.product.create({
      data: {
        organizationId: factory.id,
        serialNumber: "MVP-" + randomUUID().slice(0, 8),
        status: "CREATED",
      },
      select: { id: true, serialNumber: true },
    });
    barcode = "ff_" + randomBytes(24).toString("base64url");
    await prisma.barcode.create({
      data: {
        organizationId: factory.id,
        productId: product.id,
        value: barcode,
      },
    });
  });
  test.afterAll(async () => {
    if (factory) await cleanupFactory(factory.id);
    await prisma.$disconnect();
  });
  test("reports and resolves an issue, records and corrects weights, and exports a material report", async ({
    page,
  }) => {
    await login(page);
    await page.goto(`/app/products/${product.id}`);
    const issue = page.getByTestId("create-issue");
    await issue.locator('[name="type"]').fill("Surface inspection");
    await issue.locator('[name="description"]').fill("Needs review");
    await issue.getByRole("button", { name: "דיווח תקלה" }).click();
    await expect(page.getByTestId("issue")).toContainText(
      "Surface inspection",
      { ignoreCase: true },
    );
    await page
      .getByTestId("issue")
      .locator('[name="resolution"]')
      .fill("Reviewed");
    await page
      .getByTestId("issue")
      .getByRole("button", { name: "פתרון תקלה" })
      .click();
    await expect(page.getByTestId("issue")).toContainText("Reviewed");
    const weight = page.getByTestId("record-weight");
    await weight.locator('[name="type"]').selectOption("ISSUED");
    await weight.locator('[name="grams"]').fill("10.100");
    await weight.getByRole("button", { name: "רישום משקל" }).click();
    await expect(page.getByTestId("product-weights")).toContainText("10.100");
    await page.getByTestId("product-weights").locator("summary").click();
    const correction = page.getByTestId("correct-weight");
    await correction.locator('[name="grams"]').fill("-0.100");
    await correction.locator('[name="note"]').fill("Scale correction");
    await correction.getByRole("button", { name: "תיקון משקל" }).click();
    await expect(page.getByTestId("product-weights")).toContainText("10.000");
    const response = await page.request.get(
      "/app/reports/export?kind=material",
    );
    expect(response.ok()).toBe(true);
    expect(await response.text()).toContain('"10.000"');
    await page.goto("/app/products");
    await page.locator('[name="q"]').fill(product.serialNumber);
    await page.getByRole("button", { name: "סינון" }).click();
    await expect(page.getByTestId("product-results")).toContainText(
      product.serialNumber,
    );
  });
  test("prepares a printable QR label and changes the account language", async ({
    page,
  }) => {
    await login(page);
    await page.goto(`/app/products/${product.id}/print`);
    await page
      .getByRole("button", { name: "הדפסת ברקוד", exact: true })
      .click();
    await expect(page.locator("#barcode-label img")).toBeVisible();
    expect(
      await prisma.auditLog.count({
        where: {
          organizationId: factory.id,
          action: "barcode.print_requested",
        },
      }),
    ).toBe(1);
    // Verify exit button is in the top header
    await expect(page.locator("header form button")).toBeVisible();
    await page.goto("/app/settings");
    const language = page.locator('form:has(select[name="locale"])');
    await language.locator('select[name="locale"]').selectOption("en");
    await language.locator('button[type="submit"]').click();
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
    await expect(
      page.getByRole("heading", { name: "Factory setup" }),
    ).toBeVisible();
    const form = page.getByTestId("create-user");
    await form
      .locator('[name="username"]')
      .fill("browser-worker-" + randomUUID().slice(0, 8));
    await form.locator('[name="displayName"]').fill("Browser worker");
    await form
      .locator('[name="password"]')
      .fill(randomBytes(18).toString("base64url"));
    await form.locator('[name="accessRoleId"]').selectOption(actor.role.id);
    await form.getByRole("button", { name: "Create user" }).click();
    await expect(
      page.locator("summary").filter({ hasText: "Browser worker" }),
    ).toBeVisible();
    await language.locator('select[name="locale"]').selectOption("he");
    await language.getByRole("button").click();
    await expect(page.locator("html")).toHaveAttribute("lang", "he");
  });
  test("decodes a QR camera stream and receives the product exactly once on a phone viewport", async ({
    page,
  }) => {
    test.setTimeout(60000);
    await page.setViewportSize({ width: 390, height: 844 });
    const qr = await QRCode.toDataURL(barcode, { width: 400, margin: 4 });
    await page.addInitScript(
      ({ imageUrl }) => {
        Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
          value: async () => {
            const canvas = document.createElement("canvas");
            canvas.width = 640;
            canvas.height = 640;
            const context = canvas.getContext("2d")!;
            const image = new Image();
            image.src = imageUrl;
            await image.decode();
            const draw = () => {
              context.fillStyle = "white";
              context.fillRect(0, 0, 640, 640);
              context.drawImage(image, 120, 120, 400, 400);
            };
            draw();
            const stream = canvas.captureStream(10);
            const timer = setInterval(draw, 100);
            stream
              .getVideoTracks()[0]
              .addEventListener("ended", () => clearInterval(timer));
            return stream;
          },
        });
      },
      { imageUrl: qr },
    );
    await login(page);
    await page.goto("/app/worker/scan");
    await page.getByRole("button", { name: "סריקה במצלמה" }).click();
    await expect(page.getByTestId("scan-result")).toContainText(
      product.serialNumber,
      { timeout: 20000 },
    );
    expect(
      await prisma.productAssignment.count({
        where: {
          organizationId: factory.id,
          productId: product.id,
          endedAt: null,
        },
      }),
    ).toBe(1);
    expect(
      await prisma.productTransition.count({
        where: {
          organizationId: factory.id,
          productId: product.id,
          eventType: "PRODUCT_RECEIVED",
        },
      }),
    ).toBe(1);
    await expect(page.locator("video")).toBeHidden();
  });
});
