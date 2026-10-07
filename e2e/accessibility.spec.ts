import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { signIn } from "./helpers";

// WCAG 2.1 A/AA automated checks (axe) on every screen, as the role that uses it.
// Automated rules catch roughly a third of issues; keyboard and screen-reader passes are manual.

async function scan(page: Page, route: string) {
  await page.goto(route);
  await page.waitForLoadState("load");
  const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  return r.violations.map((v) => `${route} · ${v.id} (${v.impact}): ${v.help}\n    ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join("\n    ")}`);
}

async function first(page: Page, list: string, selector: string) {
  await page.goto(list);
  return (await page.locator(selector).first().getAttribute("href"))!;
}

test("signed-in screens have no WCAG A/AA violations", async ({ page }) => {
  test.setTimeout(420_000);
  const failures: string[] = [];
  await signIn(page, "priya@fernway.test");
  const signal = await first(page, "/signals", 'a[href^="/signals/"]');
  const account = await first(page, "/accounts", 'a[href^="/accounts/"]');
  for (const r of ["/", "/signals", "/signals?layout=list", signal, "/accounts", account, "/csqls", "/results", "/notifications", "/account", "/search?q=bright"]) failures.push(...(await scan(page, r)));
  await signIn(page, "aisha@fernway.test");
  const csql = await first(page, "/csqls", 'a[href^="/csqls/"]');
  for (const r of ["/", csql, "/csqls?layout=list"]) failures.push(...(await scan(page, r)));
  await signIn(page, "revops@fernway.test");
  const rule = await first(page, "/rules", 'a[href^="/rules/"]');
  for (const r of ["/rules", rule, "/settings", "/settings/data", "/settings/crm", "/settings/imports", "/settings/routing", "/settings/users"]) failures.push(...(await scan(page, r)));
  expect(failures, failures.join("\n")).toEqual([]);
});

test("the sign-in page is accessible", async ({ page }) => {
  await page.context().clearCookies();
  await page.goto("/sign-in");
  const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  expect(r.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
});
