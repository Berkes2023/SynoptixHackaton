import { expect, test } from "@playwright/test";

/**
 * Runs against the "gated" build: Supabase is configured (with an unreachable
 * placeholder), so every check here exercises the real middleware and route
 * handlers with no session. Direct HTTP requests are used, not hidden buttons.
 */
const WORKSPACE_ROUTES = ["/dashboard", "/imports", "/audits", "/investigations", "/reports", "/settings", "/agents", "/drift"];

test.describe("signed-out access", () => {
  for (const path of WORKSPACE_ROUTES) {
    test(`${path} redirects to login`, async ({ request }) => {
      const res = await request.get(path, { maxRedirects: 0 });
      expect(res.status()).toBe(307);
      expect(res.headers().location).toContain(`/login?next=${encodeURIComponent(path)}`);
    });
  }

  test("private APIs refuse requests without a session", async ({ request }) => {
    const calls = [
      request.get("/api/v1/workspace"),
      request.put("/api/v1/workspace", { data: { baseVersion: 1, doc: {} } }),
      request.get("/api/v1/workflows"),
      request.post("/api/v1/workflows", { data: { request: {} } }),
      request.get("/api/v1/members"),
      request.post("/api/v1/members", { data: { email: "x@example.test", role: "Admin" } }),
      request.post("/api/v1/events", { data: { action: "x", resource: "y" } }),
    ];
    for (const res of await Promise.all(calls)) expect(res.status(), res.url()).toBe(401);
  });

  test("a forged approval with a spoofed reviewer is refused", async ({ request }) => {
    const res = await request.post("/api/v1/workflows/wf_any", {
      data: { action: "decide", decision: "approved", rationale: "forged approval attempt", reviewer: { kind: "human", id: "someone-else", role: "Reviewer" } },
    });
    expect(res.status()).toBe(401);
  });

  test("session endpoint reports accounts enabled but no user", async ({ request }) => {
    expect(await (await request.get("/api/v1/session")).json()).toEqual({ configured: true, user: null });
  });
});

test.describe("auth flow safety", () => {
  test("login page shows sign-in and the local-demo escape hatch", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login\?next=%2Fdashboard/);
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Use the local demo" })).toBeVisible();
  });

  test("auth service outage is reported honestly, not as a wrong password", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Work email").fill("someone@example.test");
    await page.getByLabel("Password").fill("not-a-real-password-123");
    await page.getByRole("button", { name: "Sign in" }).last().click();
    await expect(page.getByRole("alert").filter({ hasText: /\S/ })).toHaveText(/sign-in service is unavailable/i);
  });

  test("invalid confirmation links fail closed and never redirect off-site", async ({ request }) => {
    for (const next of ["//evil.example", "https://evil.example", "/\\evil.example"]) {
      const res = await request.get(`/auth/callback?code=invalid&next=${encodeURIComponent(next)}`, { maxRedirects: 0 });
      expect(res.status()).toBe(307);
      const location = new URL(res.headers().location, res.url());
      // Same server (next start may canonicalise 127.0.0.1 to localhost), never the attacker's host.
      expect(["127.0.0.1", "localhost"]).toContain(location.hostname);
      expect(location.port).toBe(new URL(res.url()).port);
      expect(location.pathname).toBe("/login");
      expect(location.search).toContain("error=link");
    }
  });

  test("choosing the local demo grants only the browser-only workspace", async ({ page, request }) => {
    await page.goto("/login");
    await page.getByRole("button", { name: "Use the local demo" }).click();
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByLabel("Demo role")).toBeVisible();
    // The demo cookie does not unlock any server data.
    const res = await page.request.get("/api/v1/workspace");
    expect(res.status()).toBe(401);
    void request;
  });
});
