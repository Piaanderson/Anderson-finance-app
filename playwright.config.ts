import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  use: {
    baseURL: "http://127.0.0.1:3100",
    trace: "on-first-retry"
  },
  webServer: {
    command: "npm run dev -- --port 3100",
    url: "http://127.0.0.1:3100/sign-in",
    reuseExistingServer: !process.env.CI,
    env: {
      AUTH_SECRET: "test-secret-that-is-not-used-in-production",
      AUTH_DEV_BYPASS: "true",
      DATABASE_URL:
        process.env.DATABASE_URL ??
        "postgresql://postgres:postgres@127.0.0.1:5432/currents"
    }
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } }
  ]
});
