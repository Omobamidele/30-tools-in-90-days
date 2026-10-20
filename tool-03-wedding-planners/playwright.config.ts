import { defineConfig } from "@playwright/test";
import { existsSync } from "node:fs";

// Browser tests run against a production build on the tool's fixed port (3003).
// Uses installed Chrome; set CHROME_PATH if it is somewhere else.
const chrome = [process.env.CHROME_PATH, "/usr/bin/google-chrome", "/usr/bin/chromium", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"].find((p) => p && existsSync(p));
export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:3003",
    viewport: { width: 1440, height: 900 },
    locale: "en-GB",
    timezoneId: "Europe/London",
    launchOptions: chrome ? { executablePath: chrome, args: ["--lang=en-GB"] } : {},
  },
  webServer: { command: "npm run build && npm run start", url: "http://localhost:3003/today", reuseExistingServer: true, timeout: 240_000 },
});
