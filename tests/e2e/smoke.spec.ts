import { expect, test } from "@playwright/test";

test("renders the default Hebrew foundation page", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveTitle("FactoryFlow");
  await expect(page.locator("html")).toHaveAttribute("lang", "he");
  await expect(
    page.getByRole("heading", { name: "התשתית מוכנה" }),
  ).toBeVisible();
});
