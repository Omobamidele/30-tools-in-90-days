import { test, expect } from "@playwright/test";
import { signIn } from "./helpers";

// Event team threads: post with an @mention; the mentioned colleague is notified.
// Mutates the demo: reseed afterwards (see playwright.config.ts).
test("posts in an event discussion and notifies the mentioned colleague", async ({ page }) => {
  test.setTimeout(240_000);
  const body = `@Jordan Mendes Lakeshore confirmed the room release (${Date.now()})`;

  await signIn(page, "sam@northbeam.test");
  await page.goto("/events?layout=list");
  await page.getByRole("link", { name: "Kestrel Cardiology Advisory Board" }).first().click();
  await page.getByRole("navigation", { name: "Sections" }).getByRole("link", { name: "Discussion" }).click();
  await page.getByLabel("Message", { exact: true }).fill(body);
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByText(body)).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "Notified Jordan Mendes" })).toBeVisible();

  await signIn(page, "ops@northbeam.test");
  await page.getByRole("button", { name: /^Notifications/ }).click();
  await expect(page.getByText("Sam Okafor mentioned you in Kestrel Cardiology Advisory Board").first()).toBeVisible();
});
