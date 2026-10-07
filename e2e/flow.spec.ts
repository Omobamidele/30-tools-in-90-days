import { test, expect } from "@playwright/test";
import { signIn } from "./helpers";

// The core loop a customer runs every day: a CSM triages a signal, the seller works it to won,
// and Results shows it. Uses the seeded demo (reset first: db:reset, db:migrate, db:seed).
test("CSM accepts a signal, the seller wins it, and Results counts it", async ({ page }) => {
  test.setTimeout(180_000);
  await signIn(page, "priya@fernway.test");
  await page.goto("/signals");
  await page.getByRole("link", { name: /Harbor Peak Foods/ }).first().click();
  await expect(page.getByText(/On pace to use .* committed documents/).first()).toBeVisible();

  // A handoff note is required.
  await page.getByRole("button", { name: "Accept and route" }).click();
  await expect(page.getByText(/Write a short handoff note/).first()).toBeVisible();
  await page.getByLabel(/Handoff note for the seller/).fill("Grace in AP asked about the next tier; volume doubled after their acquisition.");
  await page.getByRole("button", { name: "Accept and route" }).click();
  await expect(page).toHaveURL(/\/csqls\//);
  await expect(page.getByText("Routed to seller")).toBeVisible();
  const csqlUrl = page.url();

  // The seller (account owner) picks it up.
  await signIn(page, "aisha@fernway.test");
  await page.goto(csqlUrl);
  await expect(page.getByText(/Grace in AP asked about the next tier/)).toBeVisible();
  await page.getByRole("button", { name: "Accept and work it" }).click();
  await expect(page.getByText("Accepted by seller")).toBeVisible();
  await page.getByRole("tab", { name: "Opportunity", exact: true }).click();
  await page.getByLabel(/Amount, ARR/).fill("9000");
  await page.getByLabel(/CRM opportunity ID/).fill("OPP-E2E-1");
  await page.getByRole("button", { name: "Save opportunity" }).click();
  await expect(page.getByText("Opportunity in the CRM")).toBeVisible();
  await page.getByRole("tab", { name: "Won" }).click();
  await page.getByRole("button", { name: "Mark as won" }).click();
  await expect(page.getByText("Won", { exact: true }).first()).toBeVisible();

  // Leaders see it in Results; the CSM is notified.
  await signIn(page, "cslead@fernway.test");
  await page.goto("/results?period=90d");
  await expect(page.getByRole("heading", { name: /signals created .* of pipeline/ })).toBeVisible();
  await signIn(page, "priya@fernway.test");
  await page.goto("/notifications");
  await expect(page.getByText(/Won: Harbor Peak Foods/)).toBeVisible();
});

test("a seller can send a CSQL back, and the CSM sees why", async ({ page }) => {
  await signIn(page, "priya@fernway.test");
  await page.goto("/signals");
  await page.getByRole("link", { name: /Brightwater Logistics/ }).first().click();
  await page.getByLabel(/Handoff note for the seller/).fill("Seats are full; they are hiring two analysts.");
  await page.getByRole("button", { name: "Accept and route" }).click();
  await expect(page).toHaveURL(/\/csqls\//);
  const url = page.url();
  await signIn(page, "tomas@fernway.test");
  await page.goto(url);
  await page.getByRole("tab", { name: "Send back" }).click();
  await page.getByLabel("Reason").selectOption("Customer isn't ready to talk");
  await page.getByRole("button", { name: "Send back" }).click();
  await expect(page.getByText("Returned to customer success")).toBeVisible();
  await signIn(page, "priya@fernway.test");
  await page.goto(url);
  await expect(page.getByText("Customer isn't ready to talk", { exact: true })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Re-route" })).toBeVisible();
});

test("dismissing needs a reason and teaches the rule", async ({ page }) => {
  await signIn(page, "lena@fernway.test");
  await page.goto("/signals");
  await page.getByRole("link", { name: /Tallgrass Agritech/ }).first().click();
  await expect(page.getByText(/open support escalation: talk to support first/)).toBeVisible();
  await page.getByRole("tab", { name: "Dismiss" }).click();
  await page.getByRole("button", { name: "Dismiss signal" }).click();
  await expect(page.getByText("Some fields need attention.")).toBeVisible();
  await expect(page.locator("p", { hasText: "Choose a reason" })).toBeVisible();
  await page.getByLabel("Reason").selectOption("Customer is at risk; not the time to sell");
  await page.getByRole("button", { name: "Dismiss signal" }).click();
  await expect(page).toHaveURL(/\/signals$/);
});

test("RevOps previews a rule change before saving it", async ({ page }) => {
  await signIn(page, "revops@fernway.test");
  await page.goto("/rules");
  await page.getByRole("link", { name: "Analyst seats nearly full" }).click();
  await page.getByLabel("Active seats at least").fill("80");
  await page.getByRole("button", { name: "Preview" }).click();
  await expect(page.getByText(/would have a signal today/)).toBeVisible();
  // Saving without a note is refused.
  await page.getByRole("button", { name: "Save new version" }).click();
  await expect(page.getByText(/Add a short note/).first()).toBeVisible();
});

test("people only reach what their role allows", async ({ page }) => {
  await signIn(page, "tomas@fernway.test");
  await page.goto("/rules");
  await expect(page).toHaveURL(/\/$/);
  await page.goto("/settings");
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("link", { name: "Rules" })).toHaveCount(0);
});
