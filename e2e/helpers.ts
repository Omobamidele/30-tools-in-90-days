import { expect, type Page } from "@playwright/test";

export const PASSWORD = "northbeam-demo-2026";

export async function signIn(page: Page, email: string) {
  await page.context().clearCookies();
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
}

/** Latest approval link emailed to a recipient, read from the local Mailpit inbox. */
export async function latestApprovalLink(to: string): Promise<string> {
  const list = await (await fetch(`http://localhost:4001/api/v1/search?query=${encodeURIComponent(`to:${to}`)}&limit=1`)).json();
  const id = list.messages?.[0]?.ID;
  if (!id) throw new Error(`No email found for ${to}`);
  const msg = await (await fetch(`http://localhost:4001/api/v1/message/${id}`)).json();
  const match = String(msg.Text).match(/http:\/\/localhost:3001\/approve\/[A-Za-z0-9_-]+/);
  if (!match) throw new Error("No approval link in the email");
  return match[0];
}
