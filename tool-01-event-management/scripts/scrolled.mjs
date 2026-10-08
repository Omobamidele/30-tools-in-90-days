// Viewport screenshot after scrolling, to check fixed layers (wallpaper, rail) as a person sees them.
// Usage: node scripts/scrolled.mjs <route> <scrollY> [--mobile]
import { chromium } from "@playwright/test";
const [route, y, flag] = process.argv.slice(2);
const mobile = flag === "--mobile";
const base = "http://localhost:3001";
const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 } })).newPage();
await page.request.post(`${base}/api/auth/sign-in/email`, { data: { email: "ops@northbeam.test", password: "northbeam-demo-2026" }, headers: { Origin: base } });
await page.goto(`${base}/${route}`, { waitUntil: "networkidle" });
await page.evaluate((v) => window.scrollTo(0, v), Number(y));
await page.waitForTimeout(400);
const out = `screenshots/scrolled${mobile ? "-mobile" : ""}.png`;
await page.screenshot({ path: out });
console.log(out);
await browser.close();
