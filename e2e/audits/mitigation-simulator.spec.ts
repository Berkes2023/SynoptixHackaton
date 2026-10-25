import { expect, test } from "@playwright/test";

test.describe("mitigation simulator (before vs after removing a biased cue)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/fairness-lab");
    await expect(page.getByRole("heading", { name: /Mitigation simulator/ })).toBeVisible();
  });

  const summary = (page: import("@playwright/test").Page) => page.getByTestId("mitigation-summary");

  test("hiding the nationality statement equalises shortlisting for identical qualifications", async ({ page }) => {
    await expect(summary(page)).toContainText("Ratio 0.818 → 1.000 for Non-UK national vs UK national");
    await expect(page.getByTestId("ratio-before")).toHaveText("0.818");
    await expect(page.getByTestId("ratio-after")).toHaveText("1.000");
    // The four-fifths caveat appears because 0.818 "passes" despite a biased screener.
    await expect(page.getByText(/Passing four-fifths is not proof of fairness/)).toBeVisible();
    // Chart renders both phases for both groups.
    await expect(page.locator('[aria-label*="before and after mitigation"] .recharts-bar-rectangle')).toHaveCount(4);
  });

  test("employment gap shows the improvement and the job-relevance warning", async ({ page }) => {
    await page.getByLabel("Cue to remove").selectOption("employmentGap");
    await expect(summary(page)).toContainText("Ratio 0.690 → 1.000");
    await expect(page.getByText(/a trade-off a person must decide on/)).toBeVisible();
  });

  test("removing all four penalised cues shows the compounded effect and the score gap closing", async ({ page }) => {
    await page.getByLabel("Cue to remove").selectOption("allBiased");
    await expect(summary(page)).toContainText("Ratio 0.319 → 1.000");
    await expect(page.getByTestId("gap-before")).toHaveText("-16.0 pts");
    await expect(page.getByTestId("gap-after")).toHaveText("0.0 pts");
  });

  test("a control cue the screener never used shows no change", async ({ page }) => {
    await page.getByLabel("Cue to remove").selectOption("cvFormat");
    await expect(summary(page)).toContainText("No change.");
    await expect(page.getByTestId("ratio-before")).toHaveText("1.000");
  });

  test("the simulation can be recorded in the audit log", async ({ page }) => {
    await page.getByRole("button", { name: "Record this simulation in the audit log" }).click();
    const events = await page.evaluate(() => JSON.parse(localStorage.getItem("deeptrace-demo-v1") ?? "{}").events ?? []);
    expect(events.at(-1)).toMatchObject({ action: "mitigation.simulated", resource: "cue:nationality" });
    expect(events.at(-1).details).toContain("0.818 → 1.000");
  });
});
