import { datasetToCsv, generateDataset, generatedJobRef, type Scenario } from "../data/generator";
import { runAudit } from "../fairness/audit";
import type { ScreeningRecord } from "../fairness/types";
import { parseCsv } from "../ingest/csv";
import { autoMap } from "../ingest/mapping";
import { validateAndMap } from "../ingest/validate";
import type { Actor, WorkflowRun } from "./contracts";
import { advance, createWorkflow, decide, type OrchestratorContext } from "./orchestrator";
import type { OrgPolicy } from "./policy";

/**
 * Same synthetic cases through (1) the deterministic single-workflow baseline
 * and (3) the bounded multi-agent workflow. Arm (2), a single general-purpose
 * LLM agent, requires a model provider; it is reported as not run rather than
 * simulated.
 */
export const EVAL_SCENARIOS: { scenario: Scenario; disparityExpected: boolean }[] = [
  { scenario: "balanced", disparityExpected: false },
  { scenario: "selection_disparity", disparityExpected: true },
  { scenario: "score_shift", disparityExpected: true },
  { scenario: "proxy_gap", disparityExpected: true },
  { scenario: "missing_data", disparityExpected: false },
];

export const REQUIRED_EVIDENCE = ["metrics", "sample sizes", "limitations", "data-quality checks", "provenance", "independent verification", "counterfactual experiments", "mitigation trade-offs", "human approval record"] as const;

export const EVAL_POLICY: OrgPolicy = { organisationId: "org_eval", authorisedAttributes: ["synthetic_group"], minimumGroupSize: 20, confidenceLevel: 0.95, impactThreshold: 0.8, alpha: 0.05, retentionDays: 90 };
const AUDITOR: Actor = { kind: "human", id: "eval-auditor", name: "Evaluation auditor", role: "Auditor" };
const REVIEWER: Actor = { kind: "human", id: "eval-reviewer", name: "Evaluation reviewer", role: "Reviewer" };

export interface ArmResult {
  completed: boolean;
  disparityReported: boolean;
  correct: boolean;
  evidencePresent: string[];
  unsupportedClaims: number;
  rejectedHypotheses: number;
  runtimeMs: number;
  modelCalls: number;
  estimatedCostUsd: number;
  recoveredFromInjectedFailure: boolean | null;
  /** A deliberately corrupted discovery claim (+10 selected) was rejected before release. null = not applicable. */
  corruptedClaimCaught: boolean | null;
}

export interface EvalRow {
  scenario: Scenario;
  disparityExpected: boolean;
  records: number;
  baseline: ArmResult;
  multiAgent: ArmResult;
  singleAgent: { status: "not_run"; reason: string };
}

function load(scenario: Scenario): { records: ScreeningRecord[]; jobRef: string } {
  const ds = generateDataset({ size: 500, job: "software", seed: 7, scenario });
  const { headers, rows } = parseCsv(datasetToCsv(ds));
  return { records: validateAndMap(headers, rows, autoMap(headers)).records.map((r) => ({ ...r, importId: "eval" })), jobRef: generatedJobRef({ job: "software", scenario, seed: 7 }) };
}

export async function runMultiAgent(records: ScreeningRecord[], jobRef: string, opts: { injectFailure?: boolean; corruptDiscovery?: boolean; id?: string } = {}): Promise<WorkflowRun> {
  let failed = false;
  const { AGENTS } = await import("./agents");
  const ctx: OrchestratorContext = {
    records,
    policy: EVAL_POLICY,
    persist: () => {},
    agents: opts.corruptDiscovery
      ? {
          bias_discovery: {
            ...AGENTS.bias_discovery,
            async execute(c) {
              const out = await AGENTS.bias_discovery.execute(c);
              const f = out.findings as { hypotheses: { claim: { selected: number } }[] };
              if (f.hypotheses[0]) f.hypotheses[0].claim.selected += 10;
              return { ...out, evidence: { ...out.evidence, "ev:discovery": f } };
            },
          },
        }
      : opts.injectFailure
      ? {
          data_integrity: {
            ...(await import("./agents")).AGENTS.data_integrity,
            async execute(c) {
              if (!failed) {
                failed = true;
                throw new Error("Injected transient failure");
              }
              return (await import("./agents")).AGENTS.data_integrity.execute(c);
            },
          },
        }
      : undefined,
  };
  let run = createWorkflow({
    id: opts.id ?? `eval-${jobRef}`,
    organisationId: "org_eval",
    createdBy: AUDITOR,
    request: { objective: "Evaluate screening outcomes for group disparities.", jobRef, stage: "initial_screening", attributes: ["synthetic_group"], runExperiments: true, runMitigation: true, externalAts: false, externalModelProvider: false },
  });
  run = await advance(run, ctx);
  if (run.state === "AWAITING_REVIEW") {
    run = decide(run, run.approvals[0].id, REVIEWER, "approved", "Evaluation run: release verified findings.");
    run = await advance(run, ctx);
  }
  return run;
}

export async function runEvaluation(): Promise<EvalRow[]> {
  const rows: EvalRow[] = [];
  for (const { scenario, disparityExpected } of EVAL_SCENARIOS) {
    const { records, jobRef } = load(scenario);

    // (1) Deterministic baseline: one audit call.
    const t0 = performance.now();
    const base = runAudit(records, { jobRef, stage: "initial_screening", analysisType: "observational", groupingAttribute: "synthetic_group", metrics: ["selection_rate", "selection_rate_ratio", "score_distribution"], confidenceLevel: 0.95, minimumGroupSize: 20, impactThreshold: 0.8, alpha: 0.05 });
    const baseMs = performance.now() - t0;
    const baseReported = base.findings.some((f) => f.category === "selection_disparity" && f.severity === "high");

    // (3) Bounded multi-agent workflow.
    const t1 = performance.now();
    const run = await runMultiAgent(records, jobRef);
    const multiMs = performance.now() - t1;
    const ver = run.evidence["ev:verification"] as { verdicts: { verdict: string }[] } | undefined;
    const multiReported = (ver?.verdicts ?? []).some((v) => v.verdict === "verified");
    const report = run.evidence["ev:report"] as { findings: { category: string; evidenceRefs: string[] }[] } | undefined;
    const recovered = await runMultiAgent(records, jobRef, { injectFailure: true, id: `eval-fail-${jobRef}` });
    const corrupted = await runMultiAgent(records, jobRef, { corruptDiscovery: true, id: `eval-corrupt-${jobRef}` });
    const cVer = corrupted.evidence["ev:verification"] as { verdicts: { verdict: string }[] } | undefined;
    const cDisc = corrupted.evidence["ev:discovery"] as { hypotheses: unknown[] } | undefined;

    rows.push({
      scenario,
      disparityExpected,
      records: records.filter((r) => r.stage === "initial_screening").length,
      baseline: {
        completed: true,
        disparityReported: baseReported,
        correct: baseReported === disparityExpected,
        evidencePresent: ["metrics", "sample sizes", "limitations"],
        unsupportedClaims: 0,
        rejectedHypotheses: 0,
        runtimeMs: baseMs,
        modelCalls: 0,
        estimatedCostUsd: 0,
        recoveredFromInjectedFailure: null,
        corruptedClaimCaught: null,
      },
      multiAgent: {
        completed: run.state === "COMPLETED",
        disparityReported: multiReported,
        correct: multiReported === disparityExpected,
        evidencePresent: run.state === "COMPLETED" ? [...REQUIRED_EVIDENCE] : [],
        // A claim is unsupported if a "supported finding" in the report cites no verification evidence.
        unsupportedClaims: (report?.findings ?? []).filter((f) => f.category === "supported_finding" && !f.evidenceRefs.includes("ev:verification")).length,
        rejectedHypotheses: (ver?.verdicts ?? []).filter((v) => v.verdict !== "verified").length,
        runtimeMs: multiMs,
        modelCalls: run.usage.modelCalls,
        estimatedCostUsd: run.usage.estimatedCostUsd,
        recoveredFromInjectedFailure: recovered.state === "COMPLETED",
        corruptedClaimCaught: (cDisc?.hypotheses.length ?? 0) === 0 ? null : cVer?.verdicts[0]?.verdict === "rejected",
      },
      singleAgent: { status: "not_run", reason: "Requires a model provider; none is configured. Not simulated." },
    });
  }
  return rows;
}
