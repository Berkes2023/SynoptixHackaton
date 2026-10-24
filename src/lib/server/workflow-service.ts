import { AuditRequestSchema, type Actor, type WorkflowRun } from "../agents/contracts";
import { linkRunIntoWorkspace } from "../agents/link";
import { advance, createWorkflow, decide, requestCancel } from "../agents/orchestrator";
import type { OrgPolicy } from "../agents/policy";
import type { Role } from "../state";
import type { WorkspaceDoc } from "../workspace/doc";

/** Persistence used by the service; backed by Supabase in production and memory in tests. */
export interface WorkflowStore {
  loadWorkspace(): Promise<{ version: number; doc: WorkspaceDoc }>;
  /** Writes only if the stored version still equals `version`; false on a concurrent change. */
  saveWorkspace(version: number, doc: WorkspaceDoc): Promise<boolean>;
  getRun(id: string): Promise<WorkflowRun | null>;
  insertRun(run: WorkflowRun): Promise<void>;
  updateRun(run: WorkflowRun): Promise<void>;
  event(action: string, resource: string, details?: string): Promise<void>;
}

/** The signed-in user, resolved from the session on the server. Never taken from the request body. */
export interface Caller {
  id: string;
  name: string;
  role: Role;
  organisationId: string;
}

export class ServiceError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

const actor = (c: Caller): Actor => ({ kind: "human", id: c.id, name: c.name, role: c.role });
const policyOf = (c: Caller, doc: WorkspaceDoc): OrgPolicy => ({ organisationId: c.organisationId, ...doc.settings, retentionDays: 90 });
const RUNNERS: Role[] = ["Admin", "Auditor"];

async function load(store: WorkflowStore, c: Caller, id: string) {
  const run = await store.getRun(id);
  if (!run || run.organisationId !== c.organisationId) throw new ServiceError("Workflow not found", 404);
  return run;
}

/** On completion, publish the primary audit into the Audit Lab, retrying on concurrent workspace edits. */
async function link(store: WorkflowStore, run: WorkflowRun, newId: (p: string) => string): Promise<WorkflowRun> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const { version, doc } = await store.loadWorkspace();
    const out = linkRunIntoWorkspace(doc, run, newId);
    if (!out) return run;
    if (await store.saveWorkspace(version, out.ws)) {
      await store.updateRun(out.run);
      await store.event("workflow.linked_to_audit_lab", `workflow:${run.id}`, `audit ${out.run.linkedAuditId}`);
      return out.run;
    }
  }
  return run; // Left unlinked; the next advance links it.
}

async function drive(store: WorkflowStore, c: Caller, run: WorkflowRun, stepThrough: boolean, newId: (p: string) => string) {
  const { doc } = await store.loadWorkspace();
  const succeeded = (r: WorkflowRun) => r.tasks.filter((t) => t.status === "succeeded").length;
  const before = succeeded(run);
  let latest = before;
  const out = await advance(run, {
    records: doc.records,
    policy: policyOf(c, doc),
    persist: (r) => {
      latest = succeeded(r);
    },
    shouldStop: () => stepThrough && latest > before,
  });
  await store.updateRun(out);
  await store.event(`workflow.${out.state.toLowerCase()}`, `workflow:${out.id}`, out.failure ?? `${out.usage.tasksRun} tasks run`);
  return link(store, out, newId);
}

export async function startWorkflow(store: WorkflowStore, c: Caller, body: unknown, newId: (p: string) => string): Promise<WorkflowRun> {
  if (!RUNNERS.includes(c.role)) throw new ServiceError(`${c.role} may not start audits`, 403);
  const parsed = AuditRequestSchema.safeParse((body as { request?: unknown })?.request);
  if (!parsed.success) throw new ServiceError("Invalid audit request", 400);
  const run = createWorkflow({ id: newId("wf"), organisationId: c.organisationId, request: parsed.data, createdBy: actor(c) });
  await store.insertRun(run);
  await store.event("workflow.created", `workflow:${run.id}`, `${parsed.data.jobRef}/${parsed.data.stage}; ${parsed.data.attributes.join(", ")}`);
  return drive(store, c, run, Boolean((body as { stepThrough?: boolean }).stepThrough), newId);
}

export async function advanceWorkflow(store: WorkflowStore, c: Caller, id: string, stepThrough: boolean, newId: (p: string) => string) {
  if (!RUNNERS.includes(c.role)) throw new ServiceError(`${c.role} may not run audits`, 403);
  return drive(store, c, { ...(await load(store, c, id)), paused: false }, stepThrough, newId);
}

export async function decideWorkflow(store: WorkflowStore, c: Caller, id: string, decision: unknown, rationale: unknown, newId: (p: string) => string) {
  if (decision !== "approved" && decision !== "rejected") throw new ServiceError("Decision must be approved or rejected", 400);
  if (typeof rationale !== "string") throw new ServiceError("A rationale is required", 400);
  const run = await load(store, c, id);
  const gate = run.approvals.find((a) => a.status === "pending");
  if (!gate) throw new ServiceError("Nothing is awaiting review", 409);
  let decided: WorkflowRun;
  try {
    // Enforces: humans only, Admin/Reviewer only, never the initiator, rationale length.
    decided = decide(run, gate.id, actor(c), decision, rationale);
  } catch (e) {
    throw new ServiceError(e instanceof Error ? e.message : "Decision refused", 403);
  }
  await store.updateRun(decided);
  await store.event(`workflow.gate_${decision}`, `workflow:${id}`, rationale.slice(0, 200));
  // Reporting runs as part of the decision; the reviewer does not need Auditor rights for it.
  return decision === "approved" ? drive(store, c, decided, false, newId) : decided;
}

export async function cancelWorkflow(store: WorkflowStore, c: Caller, id: string) {
  const run = await load(store, c, id);
  if (!RUNNERS.includes(c.role) && run.createdBy.id !== c.id) throw new ServiceError(`${c.role} may not cancel audits`, 403);
  const out = requestCancel(run, actor(c));
  await store.updateRun(out);
  await store.event("workflow.cancel_requested", `workflow:${id}`);
  return out;
}
