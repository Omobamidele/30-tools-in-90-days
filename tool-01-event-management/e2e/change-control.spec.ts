import { expect, test } from "@playwright/test";
import { latestApprovalLink, signIn } from "./helpers";

// The full change-control loop on the demo workspace: raise → price → internal approval →
// client approval by email link → applied (forecast updated, supplier tasks created).
test("headcount reduction goes from draft to applied", async ({ page, browser }) => {
  const approver = `approver+${Date.now()}@solvane.example`;

  // Event manager raises the change on their event.
  await signIn(page, "priya@northbeam.test");
  await page.goto("/events");
  await page.getByRole("link", { name: "Solvane Sales Kickoff 2027" }).click();
  await page.getByRole("navigation", { name: "Sections" }).getByRole("link", { name: "Change requests" }).click();
  await page.getByRole("link", { name: /Raise change request/i }).click();

  await page.getByLabel("Title").fill("Headcount reduction");
  await page.getByLabel("Attendance change").fill("-60");
  await page.getByLabel("Reason").fill("Client budget cut for the second day");
  await page.getByLabel("Line 1 description").fill("Lunch covers −60 × 3 days");
  await page.getByLabel("Line 1 contract").selectOption({ label: "Hotel Alvorada Lisboa: Group agreement" });
  await page.getByLabel("Line 1 category").selectOption("Food & beverage");
  await page.getByPlaceholder("-10,800.00").fill("-17,100.00");

  // Live impact: price from the 15% markup, margin below the 14% floor → internal approval.
  await expect(page.getByText("Needs internal approval: margin below the 14% floor.")).toBeVisible();
  await expect(page.getByText(/Exposure on existing contracts/)).toBeVisible();
  await page.getByRole("button", { name: "Create draft" }).click();

  await expect(page.getByRole("heading", { name: /CR-\d+ Headcount reduction/ })).toBeVisible();
  await page.getByLabel("Client approver's email").fill(approver);
  await page.getByRole("button", { name: "Submit for approval" }).click();
  await expect(page.getByText("Internal review").first()).toBeVisible();
  const changeUrl = page.url();

  // Managing director approves internally; the client link is emailed.
  const md = await browser.newPage();
  await signIn(md, "md@northbeam.test");
  await md.goto(changeUrl);
  await md.getByLabel("Note").fill("Accepting a lower margin to protect the account");
  await md.getByRole("button", { name: "Approve and send to client" }).click();
  await expect(md.getByText("Approval link emailed to the client.")).toBeVisible();

  // Client approves from the emailed link, without an account.
  const link = await latestApprovalLink(approver);
  const client = await browser.newPage();
  await client.goto(link);
  await expect(client.getByRole("heading", { name: "Headcount reduction" })).toBeVisible();
  await expect(client.getByText("Price change")).toBeVisible();
  await client.getByLabel("Your name").fill("Dana Whitfield");
  await client.getByRole("button", { name: "Approve change" }).click();
  await expect(client.getByText("Change approved. Northbeam Events has been notified.")).toBeVisible();

  // The link can't be used again.
  await client.goto(link);
  await expect(client.getByText(/Approved by Dana Whitfield/)).toBeVisible();

  // Applied: forecast updated and supplier update task created.
  await page.goto(changeUrl);
  await expect(page.getByText("Applied").first()).toBeVisible();
  await expect(page.getByText(/Confirm CR-\d+ with Hotel Alvorada Lisboa/)).toBeVisible();
  await page.goto("/events");
  await page.getByRole("link", { name: "Solvane Sales Kickoff 2027" }).click();
  await expect(page.getByText("360 attendees forecast")).toBeVisible();
});
