import { test, expect } from "@playwright/test";

test.describe("Authentication", () => {
  test("should show login page", async ({ page }) => {
    await page.goto("/auth/login");
    await expect(page.getByRole("heading", { name: /iniciar sesión/i })).toBeVisible();
    await expect(page.getByLabel(/email/i)).toBeVisible();
    await expect(page.getByLabel(/contraseña/i)).toBeVisible();
  });

  test("should show validation errors for empty form", async ({ page }) => {
    await page.goto("/auth/login");
    await page.getByRole("button", { name: /iniciar sesión/i }).click();
    // Check for validation messages
    await expect(page.getByText(/email|requerido|inválido/i).first()).toBeVisible();
  });

  test("should redirect to login when accessing protected route", async ({ page }) => {
    await page.goto("/stock");
    await expect(page).toHaveURL(/\/auth\/login/);
  });

  test("should show register page", async ({ page }) => {
    await page.goto("/auth/register");
    await expect(
      page.getByRole("heading", { name: /registrarse|crear cuenta/i })
    ).toBeVisible();
  });
});
