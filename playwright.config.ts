import { defineConfig, devices } from "@playwright/test";

const port = process.env.PLAYWRIGHT_PORT ?? "3100";
const baseURL = `http://127.0.0.1:${port}`;
const passkeyOrigin = `http://localhost:${port}`;

export default defineConfig({
  testDir: "./tests/e2e",
  use: {
    baseURL,
    trace: "on-first-retry"
  },
  webServer: {
    command: `npm run dev -- --hostname 127.0.0.1 --port ${port}`,
    url: `${baseURL}/sign-in`,
    reuseExistingServer: !process.env.CI,
    env: {
      AUTH_SECRET: "test-secret-that-is-not-used-in-production",
      AUTH_DEV_BYPASS: "true",
      PASSKEY_ORIGIN: passkeyOrigin,
      PASSKEY_RP_ID: "localhost",
      PASSKEY_RP_NAME: "Currents",
      WATCHPACK_POLLING: "true",
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
