import { defineConfig, devices } from "@playwright/test";

/**
 * Two production builds, each in its own dist dir, so neither touches a real database:
 *
 * - "local" (port 3300): no Supabase configured → browser-only synthetic demo.
 * - "gated" (port 3301): Supabase "configured" with an unreachable placeholder URL,
 *   so auth gating, redirects and API refusals run for real without any project.
 *
 * Authenticated suites (sign-up, organisations, cross-tenant) need a disposable
 * Supabase test project and are enabled with E2E_SUPABASE_* (see docs/e2e-testing.md).
 */
const LOCAL = 3300;
const GATED = 3301;
const CI = Boolean(process.env.CI);

const server = (port: number, distDir: string, env: Record<string, string>) => ({
  command: `npx next build && npx next start -p ${port}`,
  url: `http://127.0.0.1:${port}/api/v1/health`,
  env: { NEXT_DIST_DIR: distDir, NEXT_TELEMETRY_DISABLED: "1", ...env },
  reuseExistingServer: !CI,
  timeout: 300_000,
  stdout: "ignore" as const,
});

const chromium = devices["Desktop Chrome"];

export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  forbidOnly: CI,
  retries: CI ? 2 : 0,
  workers: CI ? 2 : undefined,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: CI ? [["github"], ["html", { open: "never" }]] : [["list"], ["html", { open: "never" }]],
  use: {
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  webServer: [
    // Empty values override any developer .env.local, keeping this build in demo mode.
    server(LOCAL, ".next-e2e-local", { NEXT_PUBLIC_SUPABASE_URL: "", NEXT_PUBLIC_SUPABASE_ANON_KEY: "" }),
    server(GATED, ".next-e2e-gated", { NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:9", NEXT_PUBLIC_SUPABASE_ANON_KEY: "e2e-placeholder-anon-key" }),
  ],
  projects: [
    { name: "local", testIgnore: /security\//, use: { ...chromium, baseURL: `http://127.0.0.1:${LOCAL}` } },
    { name: "gated", testMatch: /security\/.*\.spec\.ts/, use: { ...chromium, baseURL: `http://127.0.0.1:${GATED}` } },
    // Secondary compatibility targets: E2E_ALL_BROWSERS=1 npm run test:e2e
    ...(process.env.E2E_ALL_BROWSERS
      ? [
          { name: "local-firefox", testIgnore: /security\//, use: { ...devices["Desktop Firefox"], baseURL: `http://127.0.0.1:${LOCAL}` } },
          { name: "local-webkit", testIgnore: /security\//, use: { ...devices["Desktop Safari"], baseURL: `http://127.0.0.1:${LOCAL}` } },
        ]
      : []),
  ],
});
