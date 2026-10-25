import { expect, test } from "@playwright/test";
import { actAs, importSampleDataset } from "../fixtures/workspace";

test("audit settings explain themselves and warn about risky choices", async ({ page }) => {
  await page.goto("/dashboard");
  await actAs(page, "Auditor");
  await importSampleDataset(page);
  await page.goto("/audits/new");
  await page.locator("#job").selectOption("REQ-1042");

  // Every setting carries an explanation.
  await expect(page.getByText(/How wide the uncertainty ranges are/)).toBeVisible();
  await expect(page.getByText(/Groups smaller than this are hidden/)).toBeVisible();
  await expect(page.getByText(/Below 0\.8 \(the 'four-fifths' rule of thumb\)/)).toBeVisible();
  await expect(page.locator("#conf option:checked")).toHaveText(/95% — matches α = 0\.05 \(recommended\)/);

  // Default settings on this fixture raise no warnings.
  await expect(page.getByTestId("guidance-confidence")).toHaveCount(0);

  // 99% confidence with α = 0.05 is flagged, live.
  await page.locator("#conf").selectOption("0.99");
  await expect(page.getByTestId("guidance-confidence")).toContainText("Choose 95% to keep them consistent");

  // …and the warning carries through to the audit result.
  await page.getByRole("button", { name: "Run audit" }).click();
  await expect(page).toHaveURL(/\/audits\/aud_/);
  await expect(page.getByTestId("confidence-mismatch")).toContainText("include 'no difference'");
});

test("low self-reporting and small groups are called out", async ({ page }) => {
  await page.goto("/dashboard");
  await actAs(page, "Auditor");
  await importSampleDataset(page);
  await page.goto("/audits/new");
  await page.locator("#job").selectOption("REQ-1077");
  await expect(page.getByTestId("guidance-category")).toContainText("did not report this category");
  await expect(page.getByTestId("guidance-minGroup").first()).toBeVisible();
});
