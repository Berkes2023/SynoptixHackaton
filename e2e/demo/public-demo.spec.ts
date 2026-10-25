import { expect, test } from "@playwright/test";

test.describe("public synthetic demo (no login)", () => {
  test("health endpoint reports the build and demo mode", async ({ request }) => {
    const res = await request.get("/api/v1/health");
    expect(res.ok()).toBeTruthy();
    expect(await res.json()).toMatchObject({ status: "ok", service: "deeptrace-api" });
  });

  test("homepage and key public pages render", async ({ page }) => {
    for (const path of ["/", "/platform", "/methodology", "/security", "/technology/multi-agent-ai", "/demo"]) {
      const res = await page.goto(path);
      expect(res?.status(), path).toBe(200);
      await expect(page.locator("main h1").first()).toBeVisible();
    }
  });

  async function runGuidedDemo(page: import("@playwright/test").Page, category: RegExp) {
    await page.goto("/demo");
    for (let i = 0; i < 3; i++) await page.getByRole("button", { name: /^Next/ }).click();
    await page.getByRole("radio", { name: category }).check();
    await page.getByRole("button", { name: /^Next/ }).click();
    await page.getByRole("button", { name: "Run the audit" }).click();
    await page.getByRole("button", { name: /^Next/ }).click();
  }

  test("guided demo reproduces the gender fixture (Female 25/100 vs Male 40/100)", async ({ page }) => {
    await runGuidedDemo(page, /Gender/);
    await expect(page.getByText("Female: 25 of 100 advanced (25.0%)")).toBeVisible();
    await expect(page.getByText("Male: 40 of 100 advanced (40.0%)")).toBeVisible();
    await expect(page.getByText(/0\.63× the rate/)).toBeVisible();
  });

  test("guided demo audits self-reported nationality, kept separate from right to work", async ({ page }) => {
    await runGuidedDemo(page, /Nationality/);
    await expect(page.getByText("Non-UK national: 17 of 69 advanced (24.6%)")).toBeVisible();
    await expect(page.getByText("UK national: 45 of 120 advanced (37.5%)")).toBeVisible();
    await expect(page.getByText(/Non-UK national applicants were selected at 0\.66× the rate/)).toBeVisible();
  });
});
