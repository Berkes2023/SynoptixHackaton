import { describe, expect, it } from "vitest";
import { AGENTS, type AgentDefinition } from "@/lib/agents/agents";
import type { Actor, WorkflowRun } from "@/lib/agents/contracts";
import { runEvaluation, runMultiAgent, EVAL_POLICY } from "@/lib/agents/evaluation";
import { addTask, advance, createWorkflow, decide, requestCancel, transition, TransitionError, type OrchestratorContext } from "@/lib/agents/orchestrator";
import { DataBroker, PolicyViolation } from "@/lib/agents/policy";
import { runAudit } from "@/lib/fairness/audit";
import { demoRecords } from "@/lib/site/demo-data";
import { datasetToCsv, generateDataset, generatedJobRef } from "@/lib/data/generator";
import { parseCsv } from "@/lib/ingest/csv";
import { autoMap } from "@/lib/ingest/mapping";
import { validateAndMap } from "@/lib/ingest/validate";

const AUDITOR: Actor = { kind: "human", id: "u-sam", name: "Sam Patel", role: "Auditor" };
const REVIEWER: Actor = { kind: "human", id: "u-jordan", name: "Jordan Lee", role: "Reviewer" };
const POLICY = { ...EVAL_POLICY, organisationId: "org_a", authorisedAttributes: ["gender", "age_band"] };
const records = demoRecords().map((r) => ({ ...r, importId: "imp_demo" }));

const newRun = (over: Partial<Parameters<typeof createWorkflow>[0]["request"]> = {}, id = "wf1") =>
  createWorkflow({
    id,
    organisationId: "org_a",
    createdBy: AUDITOR,
    request: { objective: "Check initial screening for gender disparities.", jobRef: "REQ-1042", stage: "initial_screening", attributes: ["gender"], runExperiments: true, runMitigation: true, externalAts: false, externalModelProvider: false, ...over },
  });

function ctx(extra: Partial<OrchestratorContext> = {}): OrchestratorContext & { saved: WorkflowRun[] } {
  const saved: WorkflowRun[] = [];
  return { records, policy: POLICY, persist: (r) => void saved.push(r), saved, ...extra };
}

async function toCompletion(run: WorkflowRun, c = ctx()) {
  run = await advance(run, c);
  expect(run.state).toBe("AWAITING_REVIEW");
  run = decide(run, run.approvals[0].id, REVIEWER, "approved", "Findings reviewed and released.");
  return advance(run, c);
}

describe("orchestrator state machine", () => {
  it("runs the full lifecycle with validated, logged transitions", async () => {
    const run = await toCompletion(newRun());
    expect(run.state).toBe("COMPLETED");
    expect(run.transitions.map((t) => t.to)).toEqual(["VALIDATING", "PLANNING", "ANALYSING", "EXPERIMENTING", "VERIFYING", "AWAITING_REVIEW", "REPORTING", "COMPLETED"]);
    expect(run.tasks.every((t) => t.status === "succeeded")).toBe(true);
    expect(run.usage.modelCalls).toBe(0);
    expect(run.usage.estimatedCostUsd).toBe(0);
  });

  it("rejects illegal transitions", () => {
    const run = newRun();
    expect(() => transition(run, "COMPLETED", "skip", AUDITOR, new Date().toISOString())).toThrow(TransitionError);
  });

  it("skips experiment states when experiments are not requested", async () => {
    const run = await toCompletion(newRun({ runExperiments: false, runMitigation: false }));
    expect(run.transitions.map((t) => t.to)).not.toContain("EXPERIMENTING");
    expect(run.tasks.map((t) => t.agent)).not.toContain("counterfactual");
  });
});

describe("numerical correctness and reproducibility", () => {
  it("verified figures equal the deterministic audit engine", async () => {
    const run = await toCompletion(newRun());
    const audit = runAudit(records, { jobRef: "REQ-1042", stage: "initial_screening", analysisType: "observational", groupingAttribute: "gender", metrics: ["selection_rate", "selection_rate_ratio"], confidenceLevel: 0.95, minimumGroupSize: 20, impactThreshold: 0.8, alpha: 0.05 });
    const v = (run.evidence["ev:verification"] as { verdicts: { recomputed: { ratio: number; selected: number; n: number } }[] }).verdicts[0];
    expect(v.recomputed.ratio).toBeCloseTo(audit.comparisons[0].ratio!, 12);
    expect([v.recomputed.selected, v.recomputed.n]).toEqual([25, 100]);
  });

  it("re-running the same workflow gives identical evidence", async () => {
    const a = await toCompletion(newRun({}, "wfA"));
    const b = await toCompletion(newRun({}, "wfA"));
    // Approval and transition timestamps legitimately differ; every computed result must not.
    const strip = (r: WorkflowRun) => JSON.stringify({ ...r.evidence, "ev:report": { ...(r.evidence["ev:report"] as object), appendix: null, approvals: null } });
    expect(strip(a)).toBe(strip(b));
    expect(a.datasetHash).toBe(b.datasetHash);
  });

  it("report numbers all come from verified records", async () => {
    const run = await toCompletion(newRun());
    const report = run.evidence["ev:report"] as { verifiedResults: { recomputed: unknown }[]; findings: { category: string; evidenceRefs: string[] }[] };
    const ver = run.evidence["ev:verification"] as { verdicts: { recomputed: unknown }[] };
    expect(report.verifiedResults.map((r) => r.recomputed)).toEqual(ver.verdicts.map((v) => v.recomputed));
    expect(report.findings.filter((f) => f.category === "supported_finding").every((f) => f.evidenceRefs.includes("ev:verification"))).toBe(true);
  });

  it("repeated counterfactual experiments are reproducible and detect injected cues only", async () => {
    const run = await toCompletion(newRun());
    const exps = (run.evidence["ev:experiments"] as { experiments: { cue: string; reacts: boolean; seeds: number[] }[] }).experiments;
    const reacts = Object.fromEntries(exps.map((e) => [e.cue, e.reacts]));
    expect(reacts).toMatchObject({ employmentGap: true, postcodeRegion: true, nationality: true, nameSet: true, pronouns: false, cvFormat: false });
    expect(exps[0].seeds.length).toBe(5);
  });
});

describe("verification rejects unsupported findings", () => {
  it("rejects a discovery claim whose numbers do not match the raw data", async () => {
    const liar: AgentDefinition = {
      ...AGENTS.bias_discovery,
      async execute(c) {
        const out = await AGENTS.bias_discovery.execute(c);
        const f = out.findings as { hypotheses: { claim: { selected: number } }[] };
        f.hypotheses[0].claim.selected += 10;
        return { ...out, evidence: { ...out.evidence, "ev:discovery": f } };
      },
    };
    const run = await advance(newRun(), ctx({ agents: { bias_discovery: liar } }));
    const v = (run.evidence["ev:verification"] as { verdicts: { verdict: string; reasons: string[] }[] }).verdicts[0];
    expect(v.verdict).toBe("rejected");
    expect(v.reasons[0]).toMatch(/do not match/);
    expect(run.conflicts.some((c) => c.precedence === "verified_statistics")).toBe(true);
  });

  it("records a policy conflict when mitigation would hide a job-relevant field", async () => {
    const run = await advance(newRun(), ctx());
    const c = run.conflicts.find((x) => x.agents.includes("governance"));
    expect(c?.precedence).toBe("policy_constraint");
  });
});

describe("validation, retries, timeouts, limits", () => {
  it("rejects agent output that fails its schema, then fails the workflow after retries", async () => {
    const bad: AgentDefinition = { ...AGENTS.data_integrity, execute: async () => ({ findings: { nonsense: true }, limitations: [] }) };
    const run = await advance(newRun(), ctx({ agents: { data_integrity: bad } }));
    expect(run.state).toBe("FAILED");
    const t = run.tasks.find((x) => x.agent === "data_integrity")!;
    expect(t.attempts).toBe(3);
    expect(t.errors[0]).toMatch(/failed validation/);
  });

  it("retries a transient failure and recovers", async () => {
    let calls = 0;
    const flaky: AgentDefinition = { ...AGENTS.data_integrity, execute: async (c) => (++calls === 1 ? Promise.reject(new Error("transient")) : AGENTS.data_integrity.execute(c)) };
    const run = await advance(newRun(), ctx({ agents: { data_integrity: flaky } }));
    expect(run.state).toBe("AWAITING_REVIEW");
    expect(run.tasks.find((x) => x.agent === "data_integrity")!.attempts).toBe(2);
  });

  it("times out a slow agent", async () => {
    const slow: AgentDefinition = { ...AGENTS.governance, execute: () => new Promise(() => {}) };
    const run = newRun();
    run.limits.taskTimeoutMs = 20;
    const out = await advance(run, ctx({ agents: { governance: slow } }));
    expect(out.state).toBe("FAILED");
    expect(out.tasks[0].errors.join(" ")).toMatch(/Timed out/);
  });

  it("refuses duplicate tasks and caps the number of tasks", () => {
    const run = newRun();
    run.limits.maxTasks = 2;
    const a = addTask(run, { agent: "governance", operation: "preflight", dependsOn: [], phase: "VALIDATING", required: true });
    expect(addTask(run, { agent: "governance", operation: "preflight", dependsOn: [], phase: "VALIDATING", required: true })).toBe(a);
    addTask(run, { agent: "data_integrity", operation: "assess", dependsOn: [a.taskId], phase: "VALIDATING", required: true });
    expect(() => addTask(run, { agent: "bias_discovery", operation: "scan", dependsOn: [], phase: "ANALYSING", required: true })).toThrow(/Task limit/);
  });

  it("enforces dependencies", async () => {
    const run = newRun();
    addTask(run, { agent: "governance", operation: "preflight", dependsOn: [], phase: "VALIDATING", required: true });
    expect(() => addTask(run, { agent: "data_integrity", operation: "assess", dependsOn: ["missing"], phase: "VALIDATING", required: true })).toThrow(/Unknown dependency/);
  });
});

describe("cancellation, pause and recovery", () => {
  it("cancels at the review gate and when requested mid-run", async () => {
    const paused = await advance(newRun(), ctx());
    expect(requestCancel(paused, AUDITOR).state).toBe("CANCELLED");
    let n = 0;
    const c = ctx({ shouldStop: () => ++n > 1 });
    const mid = await advance(newRun(), c);
    const cancelled = await advance({ ...requestCancel(mid, AUDITOR) }, ctx());
    expect(cancelled.state).toBe("CANCELLED");
  });

  it("resumes from a persisted mid-run state without re-running completed tasks", async () => {
    let n = 0;
    const c1 = ctx({ shouldStop: () => ++n === 2 });
    const stopped = await advance(newRun(), c1);
    expect(["VALIDATING", "PLANNING", "ANALYSING"]).toContain(stopped.state);
    const done = stopped.tasks.filter((t) => t.status === "succeeded").map((t) => [t.taskId, t.attempts]);
    const resumed = await advance(JSON.parse(JSON.stringify(c1.saved.at(-1))), ctx());
    expect(resumed.state).toBe("AWAITING_REVIEW");
    for (const [id, attempts] of done) expect(resumed.tasks.find((t) => t.taskId === id)!.attempts).toBe(attempts);
  });
});

describe("human approval and governance", () => {
  it("agents and the initiator cannot approve; rationale is required", async () => {
    const run = await advance(newRun(), ctx());
    const id = run.approvals[0].id;
    const agentActor: Actor = { kind: "agent", id: "reporting", name: "Reporting", role: "Reviewer" };
    expect(() => decide(run, id, agentActor, "approved", "looks fine to me")).toThrow(/Agents cannot approve/);
    expect(() => decide(run, id, { ...AUDITOR, role: "Admin" }, "approved", "approving my own audit")).toThrow(/Separation of duties/);
    expect(() => decide(run, id, REVIEWER, "approved", "ok")).toThrow(/rationale/);
    expect(() => decide(run, id, { ...REVIEWER, role: "Read-only" }, "approved", "approve this please")).toThrow(/may not approve/);
    const rejected = decide(run, id, REVIEWER, "rejected", "Need more evidence first.");
    expect(rejected.state).toBe("CANCELLED");
  });

  it("denies unauthorised categories, external ATS testing and wrong roles", async () => {
    expect((await advance(newRun({ attributes: ["ethnicity"] }), ctx())).failure).toMatch(/not authorised/);
    expect((await advance(newRun({ externalAts: true }), ctx())).failure).toMatch(/external ATS/);
    const ro = createWorkflow({ id: "wf-ro", organisationId: "org_a", createdBy: { ...AUDITOR, role: "Read-only" }, request: newRun().request });
    expect((await advance(ro, ctx())).state).toBe("FAILED");
  });

  it("blocks cross-tenant and out-of-capability data access", () => {
    const broker = new DataBroker("org_a", records, () => ({}));
    expect(() => broker.minimisedRecords("bias_discovery", "org_b", "dataset:REQ-1042/initial_screening", ["gender"])).toThrow(PolicyViolation);
    expect(() => broker.minimisedRecords("explainability", "org_a", "dataset:REQ-1042/initial_screening", ["gender"])).toThrow(/not permitted/);
    expect(() => broker.minimisedRecords("reporting", "org_a", "dataset:REQ-1042/initial_screening", ["gender"])).toThrow(/not permitted/);
    const view = broker.presenceOnlyRecords("data_integrity", "org_a", "dataset:REQ-1042/initial_screening", ["gender"]);
    expect(JSON.stringify(view)).not.toMatch(/"Female"|"Male"/);
    const min = broker.minimisedRecords("bias_discovery", "org_a", "dataset:REQ-1042/initial_screening", ["gender"]);
    expect(Object.keys(min[0].sensitive)).toEqual(["gender"]);
    min[0].sensitive.gender = "tampered";
    expect(records.find((r) => r.applicationId === min[0].applicationId && r.stage === min[0].stage)!.sensitive.gender).not.toBe("tampered");
  });
});

describe("evaluation suite", () => {
  it("compares baseline and multi-agent on identical synthetic cases", async () => {
    const rows = await runEvaluation();
    expect(rows).toHaveLength(5);
    for (const r of rows) {
      expect(r.multiAgent.completed).toBe(true);
      expect(r.multiAgent.unsupportedClaims).toBe(0);
      expect(r.multiAgent.recoveredFromInjectedFailure).toBe(true);
      expect(r.singleAgent.status).toBe("not_run");
      expect(r.multiAgent.correct).toBe(true);
      if (r.multiAgent.corruptedClaimCaught != null) expect(r.multiAgent.corruptedClaimCaught).toBe(true);
    }
    expect(rows.some((r) => r.multiAgent.corruptedClaimCaught === true)).toBe(true);
  }, 60_000);

  it("multi-agent run with an injected failure still completes", async () => {
    const ds = generateDataset({ size: 250, job: "software", seed: 3, scenario: "selection_disparity" });
    const { headers, rows } = parseCsv(datasetToCsv(ds));
    const recs = validateAndMap(headers, rows, autoMap(headers)).records.map((r) => ({ ...r, importId: "t" }));
    const run = await runMultiAgent(recs, generatedJobRef({ job: "software", scenario: "selection_disparity", seed: 3 }), { injectFailure: true });
    expect(run.state).toBe("COMPLETED");
  });
});
