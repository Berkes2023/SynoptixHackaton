import { primaryAudit } from "./agents";
import type { WorkflowRun } from "./contracts";
import type { AuditRun, Finding, State } from "../state";

type Workspace = Pick<State, "records" | "audits" | "findings">;

/**
 * Publishes a completed workflow's primary audit into the Audit Lab exactly
 * once. Pure: returns the updated workspace sections and the linked run, or
 * null when there is nothing to link.
 */
export function linkRunIntoWorkspace<W extends Workspace>(ws: W, run: WorkflowRun, newId: (prefix: string) => string, now = new Date()): { ws: W; run: WorkflowRun } | null {
  if (run.state !== "COMPLETED" || run.linkedAuditId) return null;
  const result = primaryAudit(run);
  if (!result) return null;
  const auditId = newId("aud");
  const at = now.toISOString();
  const scoped = ws.records.filter((r) => r.jobRef === run.request.jobRef);
  const audit: AuditRun = {
    id: auditId,
    createdAt: at,
    createdBy: `${run.createdBy.name} via multi-agent workflow`,
    jobTitle: scoped[0]?.jobTitle ?? run.request.jobRef,
    datasetHash: run.datasetHash ?? "",
    importIds: [...new Set(scoped.filter((r) => r.stage === run.request.stage).map((r) => r.importId ?? "unknown"))],
    result,
  };
  const findings: Finding[] = result.findings.map((f) => ({ ...f, id: newId("fnd"), auditId, status: "open", createdAt: at }));
  return { ws: { ...ws, audits: [...ws.audits, audit], findings: [...ws.findings, ...findings] }, run: { ...run, linkedAuditId: auditId } };
}
