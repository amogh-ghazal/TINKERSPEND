import { defineConfig, devices } from "@playwright/test";
import process from "node:process";

export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  use: { baseURL: "http://localhost:8787", channel: process.env.TS_BROWSER_CHANNEL ?? "chromium", trace: "retain-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: { command: "pnpm --filter @tinkerspend/client run build && node scripts/e2e-server.mjs", url: "http://localhost:8787/api/v1/health", timeout: 180_000, reuseExistingServer: false },
});
