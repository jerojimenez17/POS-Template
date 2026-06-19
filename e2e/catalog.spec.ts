import { test, expect } from "@playwright/test";

test.describe("Public Catalog", () => {
  test("should redirect to login for protected routes", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/auth\/login/);
  });

  test("should show public catalog without auth", async ({ page }) => {
    // Navigate to a business catalog page
    await page.goto("/demo-business/catalogo");
    // Should load without redirect
    await expect(page).not.toHaveURL(/\/auth\/login/);
  });
});
