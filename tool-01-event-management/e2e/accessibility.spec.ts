import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { signIn } from "./helpers";

// WCAG 2.1 AA automated checks on the screens people use every day. Automated rules catch
// roughly a third of issues; keyboard and screen-reader passes are still done by hand.
test("key screens have no WCAG A/AA violations", async ({ page }) => {
  test.setTimeout(420_000); // 19 routes; the dev server compiles each on first visit
  await signIn(page, "ops@northbeam.test");
  const eventHref = await page.getByRole("link", { name: "Kestrel Cardiology Advisory Board" }).first().getAttribute("href");
  const eventBase = eventHref!.replace(/\/exposure$/, "");
  await page.goto(eventBase + "/contracts");
  const contractHref = await page.locator('a[href^="/contracts/"]').first().getAttribute("href");

  const routes = [
    "/",
    "/events",
    eventBase,
    `${eventBase}/exposure`,
    `${eventBase}/deadlines`,
    `${eventBase}/changes/new`,
    contractHref!,
    "/deadlines?who=all",
    "/deadlines?layout=board&who=all",
    "/events?layout=calendar",
    `${eventBase}/discussion`,
    "/changes",
    "/clients",
    "/suppliers",
    "/reports",
    "/value",
    `${eventBase}/contracts/import`,
    "/account",
  ];
  const failures: string[] = [];
  // The dev server can force one full reload while it compiles a route for the first time,
  // which destroys the page mid-scan. Retry that case once; any other error still fails.
  const scan = async (route: string, retry = true): Promise<Awaited<ReturnType<AxeBuilder["analyze"]>>> => {
    await page.goto(route);
    await page.waitForLoadState("networkidle");
    try {
      return await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    } catch (e) {
      if (retry && String(e).includes("Execution context was destroyed")) return scan(route, false);
      throw e;
    }
  };
  for (const route of routes) {
    const result = await scan(route);
    for (const v of result.violations) {
      failures.push(`${route} · ${v.id} (${v.impact}): ${v.help}\n    ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join("\n    ")}`);
    }
  }
  // Settings is admin/MD only (ops is redirected), so scan it as the admin.
  await signIn(page, "admin@northbeam.test");
  for (const v of (await scan("/settings")).violations) {
    failures.push(`/settings · ${v.id} (${v.impact}): ${v.help}\n    ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join("\n    ")}`);
  }
  expect(page.url()).toContain("/settings");
  expect(failures, failures.join("\n")).toEqual([]);
});

test("sign-in and approval pages are accessible without an account", async ({ page }) => {
  await page.context().clearCookies();
  for (const route of ["/sign-in", "/approve/not-a-real-token"]) {
    await page.goto(route);
    const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
    expect(result.violations.map((v) => `${route} ${v.id}: ${v.help}`)).toEqual([]);
  }
});

test("a client link opens signed out, is accessible, and stops working when turned off", async ({ page }) => {
  test.setTimeout(180_000);
  await signIn(page, "ops@northbeam.test");
  await page.goto("/clients");
  await page.getByRole("link", { name: "Solvane Software" }).first().click();
  await page.getByRole("button", { name: "Create a link" }).click();
  const url = (await page.locator("code").filter({ hasText: "/share/" }).textContent())!.trim();
  expect(url).toMatch(/\/share\/[A-Za-z0-9_-]{40,}$/);

  await page.context().clearCookies();
  await page.goto(url);
  await expect(page.getByRole("heading", { name: "Your events with us" })).toBeVisible();
  await expect(page.getByText("Solvane Sales Kickoff 2027")).toBeVisible();
  await expect(page.getByText("Kestrel")).toHaveCount(0); // another client's event
  const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(result.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);

  await signIn(page, "ops@northbeam.test");
  await page.goto("/clients");
  await page.getByRole("link", { name: "Solvane Software" }).first().click();
  // Turn off every active link, including the one the seed printed, so reruns start clean.
  await expect(page.getByRole("button", { name: "Create a link" })).toBeVisible();
  while (await page.getByRole("button", { name: "Turn off" }).count()) {
    const n = await page.getByRole("button", { name: "Turn off" }).count();
    await page.getByRole("button", { name: "Turn off" }).first().click();
    await expect(page.getByRole("button", { name: "Turn off" })).toHaveCount(n - 1);
  }
  await page.context().clearCookies();
  await page.goto(url);
  await expect(page.getByRole("heading", { name: "This link was turned off" })).toBeVisible();
});
