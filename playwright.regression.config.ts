import { defineConfig, devices } from "@playwright/test";

/**
 * Regression suite against a NORMAL production build (no test harness), port 3011.
 * Checks existing Reading Room + Radio behaviour and that test-only pages don't exist.
 * Run: npm run test:regression
 */
const PORT = 3011;

export default defineConfig({
  testDir: "tests/regression",
  timeout: 90_000,
  workers: 1,
  reporter: [["list"]],
  use: { baseURL: `http://localhost:${PORT}`, trace: "off" },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],
  webServer: {
    command: `npm run build && npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    timeout: 400_000,
    reuseExistingServer: false,
    env: { NEXT_PUBLIC_XPLOR9_SECURITY_HARNESS: "" },
  },
});
