import { expect, test } from "@playwright/test";
import { actAs, importSampleDataset, workspace } from "../fixtures/workspace";

/**
 * Core journey in the browser-only demo workspace: import → map → validate →
 * commit → audit → metrics → investigation → report → download + checksum.
 * Figures come from the deterministic synthetic fixture (REQ-1042 initial
 * screening: Male 40/100, Female 25/100 → ratio 0.625).
 */
test("import, audit, investigate and report on the synthetic fixture", async ({ page }) => {
  await page.goto("/dashboard");
  await actAs(page, "Auditor");
  await importSampleDataset(page);

  // Audit
  await page.goto("/audits/new");
  await page.locator("#job").selectOption("REQ-1042");
  await page.locator("#stage").selectOption("initial_screening");
  await page.locator("#attr").selectOption("gender");
  await page.getByRole("button", { name: "Run audit" }).click();
  await expect(page).toHaveURL(/\/audits\/aud_/);
  await expect(page.getByRole("cell", { name: "0.625" })).toBeVisible();

  const ws = await workspace(page);
  const audit = ws.audits.at(-1);
  const female = audit.result.groups.find((g: { group: string }) => g.group === "Female");
  expect([female.selected, female.n]).toEqual([25, 100]);

  // Re-running reproduces the same result on the same dataset hash.
  await page.getByRole("button", { name: "Re-run & verify" }).click();
  await expect(page.getByText(/reproduc|identical|matches/i).first()).toBeVisible();

  // Investigation
  const auditUrl = page.url();
  await page.getByRole("button", { name: "Open investigation" }).first().click();
  await expect(page).toHaveURL(/\/investigations/);
  expect((await workspace(page)).investigations).toHaveLength(1);

  // Report: generate, verify checksum, download
  await page.goto(auditUrl);
  await page.getByRole("button", { name: "Generate report" }).click();
  await expect(page).toHaveURL(/\/reports\//);
  await page.getByRole("button", { name: "Verify checksum" }).click();
  await expect(page.getByText(/Checksum matches/)).toBeVisible();

  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download JSON" }).click()]);
  const body = JSON.parse(await (await download.createReadStream()).toArray().then((c) => Buffer.concat(c).toString("utf8")));
  expect(body.checksum_sha256).toMatch(/^[0-9a-f]{64}$/);
  // The downloaded report carries the same verified figures as the audit.
  const reportFemale = body.results.groups.find((g: { group: string }) => g.group === "Female");
  expect([reportFemale.selected, reportFemale.n]).toEqual([25, 100]);
  expect(body.results.reference_group).toBe("Male");
});

test("Read-only users cannot import data", async ({ page }) => {
  await page.goto("/imports");
  await actAs(page, "Read-only");
  await expect(page.getByRole("button", { name: "Use sample dataset" })).toHaveCount(0);
});
