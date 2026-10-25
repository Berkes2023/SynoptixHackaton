import { expect, type Page } from "@playwright/test";

/** Every test gets a fresh browser context, so the local workspace starts empty. */

export type DemoRole = "Admin" | "Auditor" | "Reviewer" | "Read-only";

export async function actAs(page: Page, role: DemoRole) {
  await page.getByLabel("Demo role").selectOption(role);
  await expect(page.getByLabel("Demo role")).toHaveValue(role);
}

/** Imports the deterministic synthetic Workday-style export through the real Data Hub UI. */
export async function importSampleDataset(page: Page) {
  await page.goto("/imports");
  await page.getByRole("button", { name: "Use sample dataset" }).click();
  await page.getByRole("button", { name: "Validate & preview" }).click();
  const commit = page.getByRole("button", { name: /^Commit \d+ records$/ });
  await expect(commit).toBeEnabled();
  await commit.click();
  await expect(page.getByText(/Import committed — \d+ records stored/)).toBeVisible();
}

/** Reads the browser-only workspace (demo mode persists to localStorage). */
export async function workspace(page: Page) {
  return page.evaluate(() => JSON.parse(window.localStorage.getItem("deeptrace-demo-v1") ?? "{}"));
}
