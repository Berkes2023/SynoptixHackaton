import { describe, expect, it } from "vitest";
import type { WorkflowRun } from "../src/lib/agents/contracts";
import { datasetToCsv, generateDataset, generatedJobRef } from "../src/lib/data/generator";
import { parseCsv } from "../src/lib/ingest/csv";
import { autoMap } from "../src/lib/ingest/mapping";
import { validateAndMap } from "../src/lib/ingest/validate";
import { advanceWorkflow, cancelWorkflow, decideWorkflow, startWorkflow, type Caller, type WorkflowStore } from "../src/lib/server/workflow-service";
import { initialState, type Investigation } from "../src/lib/state";
import { checkWrite, mergeDocs, toDoc, type WorkspaceDoc } from "../src/lib/workspace/doc";

const doc = (): WorkspaceDoc => toDoc(initialState());
const inv = (id: string, status: Investigation["status"] = "open"): Investigation => ({
  id,
  findingId: "f1",
  owner: "x",
  status,
  resolution: "",
  rationale: "",
  evidence: [],
  notes: [],
  createdAt: "2026-10-01",
  updatedAt: "2026-10-01",
});

describe("workspace write permissions (server-side)", () => {
  it("allows each role only its own sections", () => {
    const before = doc();
    expect(checkWrite("Reviewer", before, { ...before, settings: { ...before.settings, alpha: 0.01 } })).toMatch(/settings/);
    expect(checkWrite("Admin", before, { ...before, settings: { ...before.settings, alpha: 0.01 } })).toBeNull();
    expect(checkWrite("Reviewer", before, { ...before, investigations: [inv("i1")] })).toBeNull();
    expect(checkWrite("Read-only", before, { ...before, investigations: [inv("i1")] })).toMatch(/Read-only/);
    expect(checkWrite("Reviewer", before, { ...before, imports: [{ id: "x" } as never] })).toMatch(/imports/);
  });

  it("keeps deletion for Admins and closing investigations for Reviewers/Admins", () => {
    const withData = { ...doc(), imports: [{ id: "imp1" } as never], investigations: [inv("i1")] };
    expect(checkWrite("Auditor", withData, { ...withData, imports: [] })).toMatch(/delete/);
    expect(checkWrite("Admin", withData, { ...withData, imports: [] })).toBeNull();
    expect(checkWrite("Auditor", withData, { ...withData, investigations: [inv("i1", "resolved")] })).toMatch(/close/);
    expect(checkWrite("Reviewer", withData, { ...withData, investigations: [inv("i1", "resolved")] })).toBeNull();
  });
});

describe("three-way merge after a concurrent save", () => {
  it("keeps both people's changes item by item", () => {
    const base = { ...doc(), investigations: [inv("a"), inv("b")] };
    const mine = { ...base, investigations: [{ ...inv("a"), rationale: "mine" }, inv("b"), inv("new-mine")] };
    const theirs = { ...base, investigations: [inv("a"), { ...inv("b"), rationale: "theirs" }, inv("new-theirs")], settings: { ...base.settings, alpha: 0.01 } };
    const merged = mergeDocs(base, mine, theirs);
    const byId = Object.fromEntries(merged.investigations.map((i) => [i.id, i.rationale]));
    expect(byId).toEqual({ a: "mine", b: "theirs", "new-theirs": "", "new-mine": "" });
    expect(merged.settings.alpha).toBe(0.01);
  });

  it("applies local deletions and keys screening records by application and stage", () => {
    const r = (stage: string) => ({ applicationId: "APP-1", stage }) as never;
    const base = { ...doc(), records: [r("initial_screening"), r("assessment")] };
    const mine = { ...base, records: [r("initial_screening")] };
    expect(mergeDocs(base, mine, base).records).toHaveLength(1);
  });
});

function memoryStore(records: WorkspaceDoc["records"]) {
  let version = 1;
  let ws: WorkspaceDoc = { ...doc(), records };
  const runs = new Map<string, WorkflowRun>();
  const events: string[] = [];
  const store: WorkflowStore = {
    loadWorkspace: async () => ({ version, doc: structuredClone(ws) }),
    saveWorkspace: async (v, d) => {
      if (v !== version) return false;
      ws = d;
      version++;
      return true;
    },
    getRun: async (id) => structuredClone(runs.get(id) ?? null),
    insertRun: async (run) => void runs.set(run.id, structuredClone(run)),
    updateRun: async (run) => void runs.set(run.id, structuredClone(run)),
    event: async (a) => void events.push(a),
  };
  return { store, events, ws: () => ws, runs };
}

describe("server-side workflow service", () => {
  const ds = generateDataset({ size: 250, job: "software", seed: 3, scenario: "selection_disparity" });
  const { headers, rows } = parseCsv(datasetToCsv(ds));
  const records = validateAndMap(headers, rows, autoMap(headers)).records.map((r) => ({ ...r, importId: "imp" }));
  const jobRef = generatedJobRef({ job: "software", scenario: "selection_disparity", seed: 3 });
  const auditor: Caller = { id: "u-auditor", name: "Bo", role: "Auditor", organisationId: "org1" };
  const reviewer: Caller = { id: "u-reviewer", name: "Rita", role: "Reviewer", organisationId: "org1" };
  const request = { objective: "Check initial screening for group disparities.", jobRef, stage: "initial_screening", attributes: ["synthetic_group"], runExperiments: false, runMitigation: false };
  let n = 0;
  const id = (p: string) => `${p}_${++n}`;

  it("runs to the review gate, refuses self-approval, and completes after a Reviewer approves", async () => {
    const m = memoryStore(records);
    const run = await startWorkflow(m.store, auditor, { request }, id);
    expect(run.state).toBe("AWAITING_REVIEW");
    expect(run.createdBy.id).toBe("u-auditor");
    await expect(decideWorkflow(m.store, auditor, run.id, "approved", "Approving my own audit.", id)).rejects.toMatchObject({ status: 403 });
    const done = await decideWorkflow(m.store, reviewer, run.id, "approved", "Evidence reviewed and verified.", id);
    expect(done.state).toBe("COMPLETED");
    expect(done.approvals[0].reviewer?.id).toBe("u-reviewer");
    // Linked into the Audit Lab exactly once, in the stored workspace.
    expect(done.linkedAuditId).toBeTruthy();
    expect(m.ws().audits.map((a) => a.id)).toEqual([done.linkedAuditId]);
    expect(m.events).toContain("workflow.linked_to_audit_lab");
  });

  it("enforces roles and tenancy from the session, not the request", async () => {
    const m = memoryStore(records);
    await expect(startWorkflow(m.store, reviewer, { request }, id)).rejects.toMatchObject({ status: 403 });
    await expect(startWorkflow(m.store, auditor, { request: { ...request, objective: "short" } }, id)).rejects.toMatchObject({ status: 400 });
    const run = await startWorkflow(m.store, auditor, { request, createdBy: { id: "spoofed" } }, id);
    expect(run.createdBy.id).toBe("u-auditor");
    const outsider: Caller = { ...auditor, organisationId: "org2" };
    await expect(advanceWorkflow(m.store, outsider, run.id, false, id)).rejects.toMatchObject({ status: 404 });
    await expect(cancelWorkflow(m.store, { ...reviewer, role: "Read-only" }, run.id)).rejects.toMatchObject({ status: 403 });
  });

  it("supports step-through on the server", async () => {
    const m = memoryStore(records);
    const first = await startWorkflow(m.store, auditor, { request, stepThrough: true }, id);
    const done1 = first.tasks.filter((t) => t.status === "succeeded").length;
    expect(first.state).not.toBe("AWAITING_REVIEW");
    const second = await advanceWorkflow(m.store, auditor, first.id, true, id);
    expect(second.tasks.filter((t) => t.status === "succeeded").length).toBeGreaterThan(done1);
  });
});
