import { expect, test } from "@playwright/test";
import { actAs, importSampleDataset, workspace } from "../fixtures/workspace";

test("multi-agent workflow stops at the human gate; the initiator cannot approve, a Reviewer can", async ({ page }) => {
  await page.goto("/dashboard");
  await actAs(page, "Auditor");
  await importSampleDataset(page);

  await page.goto("/agents?job=REQ-1042&stage=initial_screening&attr=gender");
  await page.getByRole("button", { name: "Start workflow" }).click();
  await expect(page.getByText("Approve & generate report")).toBeVisible();
  let run = (await workspace(page)).workflows.at(-1);
  expect(run.state).toBe("AWAITING_REVIEW");
  expect(run.createdBy.role).toBe("Auditor");

  // The initiator (Auditor) is refused, and nothing is recorded.
  const rationale = page.getByPlaceholder(/What did you check/);
  await rationale.fill("Checked the verified statistics and limitations.");
  await page.getByRole("button", { name: "Approve & generate report" }).click();
  await expect(page.getByText(/Admin or Reviewer|cannot approve|may not/i).first()).toBeVisible();
  run = (await workspace(page)).workflows.at(-1);
  expect(run.approvals[0].status).toBe("pending");

  // A different person in the Reviewer role approves.
  await actAs(page, "Reviewer");
  await rationale.fill("Independent review: evidence and limitations checked.");
  await page.getByRole("button", { name: "Approve & generate report" }).click();
  await expect.poll(async () => (await workspace(page)).workflows.at(-1).state).toBe("COMPLETED");
  run = (await workspace(page)).workflows.at(-1);
  expect(run.approvals[0].reviewer.role).toBe("Reviewer");
  expect(run.approvals[0].reviewer.id).not.toBe(run.createdBy.id);
  expect(run.linkedAuditId).toBeTruthy();
});
