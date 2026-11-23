import { defineConfig, devices } from "@playwright/test";

/**
 * Security suite for imported files (pre-R4 security foundation).
 * Builds the app WITH the test-only harness page enabled and serves it on port 3010.
 *   main origin:   http://localhost:3010
 *   reader origin: http://127.0.0.1:3010   (a different origin: the isolation under test)
 * Run: npm run test:security
 */
export const PORT = 3010;

export default defineConfig({
  testDir: "tests/security",
  timeout: 90_000,
  workers: 1,
  fullyParallel: false,
  reporter: [["list"]],
  globalSetup: "./tests/security/global-setup.ts",
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
    // Separate build folder: the harness build must never replace the normal .next build.
    env: { NEXT_PUBLIC_XPLOR9_SECURITY_HARNESS: "1", XPLOR9_DIST_DIR: ".next-security" },
  },
});
