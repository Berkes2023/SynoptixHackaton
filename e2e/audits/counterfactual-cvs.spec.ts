import { expect, test } from "@playwright/test";

test("counterfactual experiment on the CV pack shows varied, realistic experience", async ({ page }) => {
  await page.goto("/fairness-lab");
  await page.getByRole("radio", { name: /Résumé pack \(200 CVs\)/ }).check();
  await page.getByRole("radio", { name: /Nationality statement/ }).check();
  await page.getByRole("button", { name: "Run experiment" }).click();
  await expect(page.getByText("Engine reacts to this cue")).toBeVisible();
  const years = await page.locator("tbody tr td:nth-child(2)").filter({ hasText: / yrs$/ }).allInnerTexts();
  expect(years.length).toBeGreaterThan(20);
  // Previously almost every row read "5.9 yrs"; now careers range from graduates to seniors.
  expect(new Set(years).size).toBeGreaterThan(years.length / 2);
  const values = years.map((y) => parseFloat(y));
  expect(Math.max(...values) - Math.min(...values)).toBeGreaterThan(8);
});
