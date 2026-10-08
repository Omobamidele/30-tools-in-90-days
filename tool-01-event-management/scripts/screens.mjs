// Visual inspection helper: signs in and captures screenshots of the given paths.
// Usage: node scripts/screens.mjs [--mobile] [--as=email] overview events/abc sign-in ...
// ("overview" means "/"; routes are given without a leading slash because Git Bash
//  rewrites /paths into Windows paths.)
// Output: screenshots/<name>.png (gitignored)
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const args = process.argv.slice(2);
const mobile = args.includes("--mobile");
const asArg = args.find((a) => a.startsWith("--as="));
const email = asArg ? asArg.slice(5) : "ops@northbeam.test";
const paths = args
  .filter((a) => !a.startsWith("--"))
  .map((a) => (a === "overview" ? "/" : `/${a.replace(/^\/+/, "")}`));
const base = "http://localhost:3001";

mkdirSync("screenshots", { recursive: true });
const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 },
  deviceScaleFactor: 1,
});
const page = await context.newPage();

if (!paths.includes("/sign-in")) {
  const res = await page.request.post(`${base}/api/auth/sign-in/email`, {
    data: { email, password: "northbeam-demo-2026" },
    headers: { Origin: base },
  });
  if (!res.ok()) throw new Error(`Sign-in failed: ${res.status()}`);
}

for (const p of paths) {
  await page.goto(`${base}${p}`, { waitUntil: "networkidle" });
  const name = (p === "/" ? "overview" : p.slice(1).replace(/[/?=&]/g, "_").replace(/[0-9a-f]{8}-[0-9a-f-]{27}/g, "id")) + (mobile ? "-mobile" : "");
  await page.screenshot({ path: `screenshots/${name}.png`, fullPage: true });
  console.log(`screenshots/${name}.png  ${page.url()}`);
}
await browser.close();
