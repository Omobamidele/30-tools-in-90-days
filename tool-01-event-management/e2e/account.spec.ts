import { test, expect, type Page } from "@playwright/test";
import { PASSWORD, signIn } from "./helpers";

async function change(page: Page, current: string, next: string, confirm = next) {
  await page.goto("/account");
  await page.getByLabel("Current password").fill(current);
  await page.getByLabel("New password", { exact: true }).fill(next);
  await page.getByLabel("Confirm new password").fill(confirm);
  await page.getByRole("button", { name: "Change password" }).click();
}

test("a user changes their own password", async ({ page }) => {
  const email = "priya@northbeam.test";
  const temp = "temporary-pass-2026";
  await signIn(page, email);

  await change(page, PASSWORD, "short");
  await expect(page.getByText("Use at least 10 characters")).toBeVisible();

  await change(page, PASSWORD, temp, "something-else-2026");
  await expect(page.getByText("Passwords don't match")).toBeVisible();

  await change(page, "wrong-password-123", temp);
  await expect(page.getByText("That isn't your current password")).toBeVisible();

  await change(page, PASSWORD, temp);
  await expect(page.getByRole("status").filter({ hasText: "Password changed." })).toBeVisible();

  // The new password works; then restore the demo password so the workspace stays usable.
  await page.context().clearCookies();
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(temp);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
  await change(page, temp, PASSWORD);
  await expect(page.getByRole("status").filter({ hasText: "Password changed." })).toBeVisible();
});
