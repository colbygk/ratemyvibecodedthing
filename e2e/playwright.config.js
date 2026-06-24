import { defineConfig } from "@playwright/test";

// The full stack (web-e2e + api + redis + redis-rest) is brought up by docker
// compose; this config just points the browser at it. E2E_BASE_URL / E2E_API_URL
// are injected by the compose `playwright` service.
export default defineConfig({
  testDir: "./tests",
  globalSetup: "./global-setup.js",
  timeout: 30_000,
  expect: { timeout: 10_000 },
  retries: 1,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL || "http://web-e2e:5173",
    headless: true,
    actionTimeout: 10_000,
    navigationTimeout: 20_000,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
});
