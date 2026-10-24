import { z } from "zod";
import { RESUME_PACK, yearsOfExperience } from "../data/resumes";
import { isMissingAttribute, normaliseDecision, runAudit } from "../fairness/audit";
import { CUES, MOCK_ENGINE_VERSION, runCounterfactual, type CounterfactualCue, type MaskableField } from "../fairness/counterfactual";
import { fisherExactTwoSided, holmAdjust, mean, ratioInterval, sampleSd } from "../fairness/stats";
import type { AuditConfig, AuditResult } from "../fairness/types";
import {
  DataQualitySchema,
  DiscoverySchema,
  ExperimentsSchema,
  ExplanationSchema,
  MitigationSchema,
  PolicyDecisionSchema,
  ReportPackageSchema,
  VerificationSchema,
  type AgentTask,
  type AgentType,
  type Usage,
  type WorkflowRun,
} from "./contracts";
import { evaluateRequest, JOB_RELEVANT_FIELDS, type DataBroker, type OrgPolicy } from "./policy";

export interface AgentContext {
  task: AgentTask;
  run: Readonly<WorkflowRun>;
  broker: DataBroker;
  policy: OrgPolicy;
}

export interface AgentOutput {
  findings: unknown;
  /** Evidence to store, keyed by reference (prefixed with "ev:"). */
  evidence?: Record<string, unknown>;
  limitations: string[];
  usage?: Partial<Usage>;
}

export interface AgentDefinition {
  type: AgentType;
  name: string;
  version: string;
  /** Every agent in this release is a deterministic service; none calls a language model. */
  kind: "deterministic" | "llm";
  purpose: string;
  execute(ctx: AgentContext): Promise<AgentOutput>;
}

const datasetRef = (run: Readonly<WorkflowRun>) => `dataset:${run.request.jobRef}/${run.request.stage}`;
const cfg = (run: Readonly<WorkflowRun>, policy: OrgPolicy, attribute: string): AuditConfig => ({
  jobRef: run.request.jobRef,
  stage: run.request.stage,
  analysisType: "observational",
  groupingAttribute: attribute,
  metrics: ["selection_rate", "selection_rate_ratio", "score_distribution"],
  confidenceLevel: policy.confidenceLevel,
  minimumGroupSize: policy.minimumGroupSize,
  impactThreshold: policy.impactThreshold,
  alpha: policy.alpha,
});
const fmt = (x: number, d = 3) => x.toFixed(d);

/* 7 — Governance & Security (deterministic policy; it reports, it cannot override) */
const governance: AgentDefinition = {
  type: "governance",
  name: "Governance & Security Agent",
  version: "1.0.0",
  kind: "deterministic",
  purpose: "Checks authorisation, tenancy, sensitive-data scope and required human approvals using deterministic policy.",
  async execute({ task, run, broker, policy }) {
    broker.policyContext("governance", task.organisationId);
    if (task.operation === "review_mitigation") {
      const ev = broker.evidenceView("governance", task.organisationId);
      const mit = ev["ev:mitigation"] as z.infer<typeof MitigationSchema> | undefined;
      const warnings = (mit?.trials ?? [])
        .filter((t) => t.touchesJobRelevantField)
        .map((t) => `Mitigation "${t.strategy}" would hide ${t.maskedFields.join(", ")}, which policy treats as job-relevant. It must not be applied without human review.`);
      return {
        findings: { allowed: true, denials: [], warnings, approvalsRequired: ["release_findings", "apply_mitigation"], jobRelevantFields: JOB_RELEVANT_FIELDS },
        limitations: [],
        usage: { toolCalls: 1 },
      };
    }
    const decision = evaluateRequest(run.request, run.createdBy, policy);
    return {
      findings: { ...decision, approvalsRequired: ["release_findings"], jobRelevantFields: JOB_RELEVANT_FIELDS },
      evidence: { "ev:policy": decision },
      limitations: decision.allowed ? [] : decision.denials,
      usage: { toolCalls: 1 },
    };
  },
};

/* 1 — Data Integrity */
const dataIntegrity: AgentDefinition = {
  type: "data_integrity",
  name: "Data Integrity Agent",
  version: "1.0.0",
  kind: "deterministic",
  purpose: "Decides whether the imported data is reliable enough for the requested audit.",
  async execute({ task, run, broker }) {
    const rows = broker.presenceOnlyRecords("data_integrity", task.organisationId, datasetRef(run), run.request.attributes);
    const checks: z.infer<typeof DataQualitySchema>["checks"] = [];
    const add = (id: string, label: string, status: "pass" | "warn" | "fail", detail: string) => checks.push({ id, label, status, detail });

    add("records", "Records in scope", rows.length >= 20 ? "pass" : rows.length > 0 ? "warn" : "fail", `${rows.length} decisions for ${run.request.jobRef} at "${run.request.stage}".`);
    const ids = new Set<string>();
    let dup = 0;
    for (const r of rows) {
      if (ids.has(r.applicationId)) dup++;
      ids.add(r.applicationId);
    }
    add("duplicates", "Duplicate applications", dup === 0 ? "pass" : "fail", `${dup} duplicate application IDs at this stage.`);
    const badDates = rows.filter((r) => Number.isNaN(Date.parse(r.decisionAt))).length;
    add("formats", "Decision timestamps", badDates === 0 ? "pass" : "fail", `${badDates} invalid timestamps.`);
    const undecided = rows.filter((r) => normaliseDecision(r.decision) == null).length;
    add("decisions", "Recognised decisions", undecided === 0 ? "pass" : undecided / Math.max(1, rows.length) > 0.1 ? "fail" : "warn", `${undecided} decisions not recognised as selected / not selected.`);
    const scores = rows.map((r) => r.score).filter((s): s is number => s != null);
    const missingScores = rows.length - scores.length;
    add("scores_missing", "Missing scores", missingScores === 0 ? "pass" : "warn", `${missingScores} records without an ATS score.`);
    if (scores.length >= 2) {
      const sd = sampleSd(scores);
      const atBound = scores.filter((s) => s === 0 || s === 100).length / scores.length;
      add("distribution", "Score distribution", sd === 0 || atBound > 0.2 ? "warn" : "pass", `SD ${fmt(sd, 1)}; ${(atBound * 100).toFixed(1)}% of scores at 0 or 100.`);
      const adv = rows.filter((r) => normaliseDecision(r.decision) === "selected" && r.score != null).map((r) => r.score!);
      const rej = rows.filter((r) => normaliseDecision(r.decision) === "not_selected" && r.score != null).map((r) => r.score!);
      if (adv.length && rej.length) {
        const consistent = mean(adv) > mean(rej);
        add("consistency", "Score–decision consistency", consistent ? "pass" : "warn", `Mean score ${fmt(mean(adv), 1)} (advanced) vs ${fmt(mean(rej), 1)} (rejected).`);
        const separable = Math.max(...rej) < Math.min(...adv);
        add(
          "leakage",
          "Possible leakage",
          separable ? "warn" : "pass",
          separable
            ? "Decisions are perfectly separated by score. Expected for a pure cut-off, but confirm the score was recorded before the decision."
            : "Scores and decisions overlap; no sign the score was derived from the decision.",
        );
      }
      const byGrade = new Map<string, number[]>();
      for (const r of rows) if (r.grade && r.score != null) byGrade.set(r.grade, [...(byGrade.get(r.grade) ?? []), r.score]);
      const order = [...byGrade.entries()].map(([g, s]) => [g, mean(s)] as const).sort((a, b) => a[0].localeCompare(b[0]));
      const monotonic = order.every((x, i) => i === 0 || x[1] <= order[i - 1][1]);
      if (order.length > 1) add("grades", "Grade–score consistency", monotonic ? "pass" : "warn", order.map(([g, m]) => `${g}: ${fmt(m, 1)}`).join(", "));
    } else add("distribution", "Score distribution", "warn", "Too few scores to assess.");

    const attributeCoverage = run.request.attributes.map((a) => {
      const present = rows.filter((r) => r.present[a]).length;
      return { attribute: a, present, missing: rows.length - present, missingRate: rows.length ? (rows.length - present) / rows.length : 0 };
    });
    for (const c of attributeCoverage)
      add(`coverage:${c.attribute}`, `Coverage: ${c.attribute.replace(/_/g, " ")}`, c.missingRate > 0.5 ? "fail" : c.missingRate > 0.05 ? "warn" : "pass", `${c.missing} of ${rows.length} missing (${(c.missingRate * 100).toFixed(1)}%).`);

    const prov = new Map<string, number>();
    for (const r of rows) prov.set(r.importId ?? "unknown", (prov.get(r.importId ?? "unknown") ?? 0) + 1);
    const provenance = [...prov.entries()].map(([importId, records]) => ({ importId, records }));
    add("provenance", "Provenance", provenance.every((p) => p.importId !== "unknown") ? "pass" : "warn", `${provenance.length} import batch(es).`);

    const usable = rows.length > 0 && !checks.some((c) => c.status === "fail" && !c.id.startsWith("coverage:")) && attributeCoverage.some((c) => c.missingRate <= 0.5);
    const findings = { usable, scopedRecords: rows.length, checks, attributeCoverage, provenance };
    return {
      findings,
      evidence: { "ev:data_quality": findings },
      limitations: checks.filter((c) => c.status !== "pass").map((c) => `${c.label}: ${c.detail}`),
      usage: { toolCalls: 1 },
    };
  },
};

/* 2 — Bias Discovery: proposes hypotheses, never conclusions */
const biasDiscovery: AgentDefinition = {
  type: "bias_discovery",
  name: "Bias Discovery Agent",
  version: "1.0.0",
  kind: "deterministic",
  purpose: "Scans authorised categories for group disparities and proposes prioritised, evidence-linked hypotheses.",
  async execute({ task, run, broker, policy }) {
    const all = broker.minimisedRecords("bias_discovery", task.organisationId, datasetRef(run), run.request.attributes);
    // Categories missing for more than half the records are not scanned (reported by Data Integrity instead).
    const attrs = run.request.attributes.filter((a) => all.length > 0 && all.filter((r) => isMissingAttribute(r.sensitive[a])).length / all.length <= 0.5);
    const records = all;
    const hypotheses: z.infer<typeof DiscoverySchema>["hypotheses"] = [];
    const evidence: Record<string, unknown> = {};
    let comparisonsRun = 0;
    for (const a of attrs) {
      const audit = runAudit(records, cfg(run, policy, a));
      evidence[`ev:discovery_audit:${a}`] = audit;
      for (const c of audit.comparisons) {
        comparisonsRun++;
        // Discovery is deliberately liberal: anything below the heuristic or nominally p < 0.1 goes to verification.
        if (!(c.ratio != null && c.ratio < policy.impactThreshold) && !(c.pValue < 0.1)) continue;
        const g = audit.groups.find((x) => x.group === c.group)!;
        const r = audit.groups.find((x) => x.group === c.reference)!;
        hypotheses.push({
          id: `H-${a}-${c.group}`.replace(/\s+/g, "_"),
          kind: "selection_disparity",
          attribute: a,
          stage: run.request.stage,
          group: c.group,
          reference: c.reference,
          claim: { selected: g.selected!, n: g.n!, refSelected: r.selected!, refN: r.n!, ratio: c.ratio, pValue: c.pValue },
          priority: c.ratio != null && c.ratio < policy.impactThreshold ? (c.adjustedP < policy.alpha ? "high" : "medium") : "low",
          rationale: `${c.group} selected at ${c.ratio != null ? (c.ratio * 100).toFixed(0) : "?"}% of the ${c.reference} rate (nominal p = ${fmt(c.pValue)}). Proposed for verification; not a conclusion.`,
        });
      }
    }
    const findings = { hypotheses, comparisonsRun };
    return { findings, evidence: { ...evidence, "ev:discovery": findings }, limitations: ["Hypotheses are proposals for verification, not findings."], usage: { toolCalls: attrs.length } };
  },
};

/* 3 — Counterfactual Experiments (mock engine only) */
export const PRIMARY_CUES: CounterfactualCue[] = ["employmentGap", "postcodeRegion", "nationality", "nameSet", "pronouns", "cvFormat"];
export const EXPERIMENT_SEEDS = [11, 12, 13, 14, 15];
const BASES = RESUME_PACK.map((r) => ({ id: r.id, yearsExperience: yearsOfExperience(r) }));

function repeatedExperiment(cue: CounterfactualCue, mask: readonly MaskableField[] = []) {
  const runs = EXPERIMENT_SEEDS.map((seed) => runCounterfactual({ cue, pairCount: BASES.length, seed, threshold: 60, bases: BASES, mask }));
  const means = runs.map((r) => r.meanDelta);
  return {
    pairs: runs[0].pairs.length,
    meanDelta: mean(means),
    minDelta: Math.min(...means),
    maxDelta: Math.max(...means),
    flipRate: mean(runs.map((r) => r.flipRate)),
    signTestP: Math.max(...runs.map((r) => r.signTestP)),
  };
}

const counterfactual: AgentDefinition = {
  type: "counterfactual",
  name: "Counterfactual Experiment Agent",
  version: "1.0.0",
  kind: "deterministic",
  purpose: "Runs repeated matched-pair experiments, changing one controlled cue at a time, against the authorised mock engine.",
  async execute({ task, broker }) {
    broker.syntheticProfiles("counterfactual", task.organisationId);
    const cues: [CounterfactualCue, boolean][] = [...PRIMARY_CUES.map((c) => [c, true] as [CounterfactualCue, boolean]), ["pronounsXnationality", false]];
    const experiments = cues.map(([cue, primary]) => {
      const r = repeatedExperiment(cue);
      return { cue, label: CUES[cue].label, engineVersion: MOCK_ENGINE_VERSION, seeds: EXPERIMENT_SEEDS, ...r, reacts: r.signTestP < 0.05 && Math.abs(r.meanDelta) > 0, primary };
    });
    const findings = { experiments, target: "mock_engine" as const, authorised: true };
    return {
      findings,
      evidence: { "ev:experiments": findings },
      limitations: [
        "Experiments ran against DeepTrace's mock screening engine, not any live or vendor system.",
        "Fictional CVs and fictional name sets only; no real person's characteristics are inferred.",
      ],
      usage: { toolCalls: cues.length * EXPERIMENT_SEEDS.length },
    };
  },
};

/* 4 — Statistical Verification: independent recomputation from raw counts */
const verification: AgentDefinition = {
  type: "statistical_verification",
  name: "Statistical Verification Agent",
  version: "1.0.0",
  kind: "deterministic",
  purpose: "Independently recomputes every claimed figure from raw counts and rejects unsupported findings.",
  async execute({ task, run, broker, policy }) {
    const ev = broker.evidenceView("statistical_verification", task.organisationId);
    const disc = ev["ev:discovery"] as z.infer<typeof DiscoverySchema> | undefined;
    const hyps = disc?.hypotheses ?? [];
    const attrs = [...new Set(hyps.map((h) => h.attribute))];
    const records = attrs.length ? broker.minimisedRecords("statistical_verification", task.organisationId, datasetRef(run), attrs) : [];

    // Independent counting (does not reuse the discovery audit's numbers).
    const counts = (attr: string, group: string) => {
      let n = 0;
      let sel = 0;
      for (const r of records) {
        const v = r.sensitive[attr];
        if (isMissingAttribute(v) || v!.trim() !== group) continue;
        const d = normaliseDecision(r.decision);
        if (d == null) continue;
        n++;
        if (d === "selected") sel++;
      }
      return { n, sel };
    };
    const missingRate = (attr: string) => (records.length ? records.filter((r) => isMissingAttribute(r.sensitive[attr])).length / records.length : 0);

    const recomputed = hyps.map((h) => {
      const g = counts(h.attribute, h.group);
      const r = counts(h.attribute, h.reference);
      const ratio = r.n > 0 && g.n > 0 && r.sel > 0 ? g.sel / g.n / (r.sel / r.n) : null;
      const ci = ratioInterval(g.sel, g.n, r.sel, r.n, policy.confidenceLevel);
      const p = g.n > 0 && r.n > 0 ? fisherExactTwoSided(g.sel, g.n - g.sel, r.sel, r.n - r.sel) : 1;
      return { h, g, r, ratio, ci, p };
    });
    const adjusted = holmAdjust(recomputed.map((x) => x.p));
    const warnings: string[] = [];
    if (hyps.length > 1) warnings.push(`${hyps.length} hypotheses tested together; p-values are Holm-adjusted across the family.`);
    for (const a of attrs) if (missingRate(a) > 0.05) warnings.push(`${(missingRate(a) * 100).toFixed(1)}% of records lack "${a}"; comparisons may not be representative.`);
    warnings.push("Fisher's exact test assumes independent applications; repeat applicants would violate this.");

    const verdicts = recomputed.map((x, i) => {
      const reasons: string[] = [];
      let verdict: "verified" | "descriptive_only" | "rejected";
      const matches =
        x.g.n === x.h.claim.n && x.g.sel === x.h.claim.selected && x.r.n === x.h.claim.refN && x.r.sel === x.h.claim.refSelected && (x.ratio == null ? x.h.claim.ratio == null : x.h.claim.ratio != null && Math.abs(x.ratio - x.h.claim.ratio) < 1e-9);
      if (!matches) {
        verdict = "rejected";
        reasons.push("Claimed figures do not match independent recomputation from raw counts.");
      } else if (x.g.n < policy.minimumGroupSize || x.r.n < policy.minimumGroupSize) {
        verdict = "rejected";
        reasons.push(`A group has fewer than ${policy.minimumGroupSize} analysed applications.`);
      } else if (missingRate(x.h.attribute) > 0.5) {
        verdict = "rejected";
        reasons.push("More than half of records lack this category.");
      } else if (x.ratio != null && x.ratio < policy.impactThreshold && adjusted[i] < policy.alpha) {
        verdict = "verified";
        reasons.push(`Ratio ${fmt(x.ratio)} below ${policy.impactThreshold} and Holm-adjusted p ${fmt(adjusted[i])} < ${policy.alpha}.`);
      } else {
        verdict = "descriptive_only";
        reasons.push(
          x.ratio != null && x.ratio < policy.impactThreshold
            ? `Ratio ${fmt(x.ratio)} is below the heuristic, but Holm-adjusted p ${fmt(adjusted[i])} ≥ ${policy.alpha}: an observed disparity without sufficient statistical evidence.`
            : `Ratio ${x.ratio != null ? fmt(x.ratio) : "undefined"} is not below the heuristic.`,
        );
      }
      return {
        hypothesisId: x.h.id,
        verdict,
        reasons,
        recomputed: { selected: x.g.sel, n: x.g.n, refSelected: x.r.sel, refN: x.r.n, ratio: x.ratio, ratioLower: x.ci?.lower ?? null, ratioUpper: x.ci?.upper ?? null, pValue: x.p, adjustedP: adjusted[i] },
      };
    });
    const findings = { verdicts, warnings, familySize: hyps.length };
    return { findings, evidence: { "ev:verification": findings }, limitations: warnings, usage: { toolCalls: 1 } };
  },
};

/* 5 — Mitigation: controlled masking experiments; never applied automatically */
const FIELD_FOR_CUE: Record<CounterfactualCue, MaskableField[]> = {
  employmentGap: ["employmentGap"],
  postcodeRegion: ["postcodeRegion"],
  cvFormat: ["cvFormat"],
  pronouns: ["pronouns"],
  nationality: ["nationality"],
  nameSet: ["nameSet"],
  pronounsXnationality: ["pronouns", "nationality"],
};

const mitigation: AgentDefinition = {
  type: "mitigation",
  name: "Bias Mitigation Agent",
  version: "1.0.0",
  kind: "deterministic",
  purpose: "Tests whether masking irrelevant cues reduces measured sensitivity, and documents the trade-offs for human review.",
  async execute({ task, broker }) {
    broker.syntheticProfiles("mitigation", task.organisationId);
    const ev = broker.evidenceView("mitigation", task.organisationId);
    const exps = (ev["ev:experiments"] as z.infer<typeof ExperimentsSchema> | undefined)?.experiments ?? [];
    const trials = exps
      .filter((e) => e.reacts)
      .map((e) => {
        const fields = FIELD_FOR_CUE[e.cue as CounterfactualCue];
        const after = repeatedExperiment(e.cue as CounterfactualCue, fields);
        const touches = fields.some((f) => JOB_RELEVANT_FIELDS.includes(f));
        const tradeOffs = touches
          ? [
              "Hides employment-history continuity, which policy treats as job-relevant information.",
              "Alternative for human review: a rubric that credits total experience without penalising gaps.",
            ]
          : ["Removes information the role does not need. Right-to-work status is unaffected and stays visible."];
        if (fields.includes("nameSet")) tradeOffs.push("Name redaction also hides a contact identifier; recruiters need a re-identification step after shortlisting.");
        return {
          cue: e.cue,
          strategy: `Mask ${fields.join(" + ")} before scoring`,
          maskedFields: fields,
          beforeMeanDelta: e.meanDelta,
          afterMeanDelta: after.meanDelta,
          beforeFlipRate: e.flipRate,
          afterFlipRate: after.flipRate,
          tradeOffs,
          touchesJobRelevantField: touches,
        };
      });
    const recommendations = trials.map(
      (t) =>
        `For human review: "${t.strategy}" changed mean score sensitivity from ${fmt(t.beforeMeanDelta, 2)} to ${fmt(t.afterMeanDelta, 2)} on the mock engine.${t.touchesJobRelevantField ? " Touches a job-relevant field — see conflict." : ""}`,
    );
    const findings = { trials, recommendations };
    return {
      findings,
      evidence: { "ev:mitigation": findings },
      limitations: [
        "Masking was tested on the mock engine only. Original records and imported ATS scores are unchanged.",
        "Reduced sensitivity to one cue does not show that a process is free of bias.",
      ],
      usage: { toolCalls: trials.length * EXPERIMENT_SEEDS.length },
    };
  },
};

/* 6 — Explainability: narrative only from verified, referenced evidence */
const explainability: AgentDefinition = {
  type: "explainability",
  name: "Explainability Agent",
  version: "1.0.0",
  kind: "deterministic",
  purpose: "Turns verified evidence into plain-English explanations, separating findings from hypotheses and open questions.",
  async execute({ task, broker }) {
    const ev = broker.evidenceView("explainability", task.organisationId);
    const disc = ev["ev:discovery"] as z.infer<typeof DiscoverySchema> | undefined;
    const ver = ev["ev:verification"] as z.infer<typeof VerificationSchema> | undefined;
    const exps = (ev["ev:experiments"] as z.infer<typeof ExperimentsSchema> | undefined)?.experiments ?? [];
    const mit = ev["ev:mitigation"] as z.infer<typeof MitigationSchema> | undefined;
    const sections: z.infer<typeof ExplanationSchema>["sections"] = [];
    for (const v of ver?.verdicts ?? []) {
      const h = disc?.hypotheses.find((x) => x.id === v.hypothesisId);
      if (!h || !v.recomputed) continue;
      const rc = v.recomputed;
      const line = `${h.group} applicants (${rc.selected} of ${rc.n}) were advanced at ${rc.ratio != null ? (rc.ratio * 100).toFixed(0) : "?"}% of the rate of ${h.reference} applicants (${rc.refSelected} of ${rc.refN}), compared by self-reported ${h.attribute.replace(/_/g, " ")}.`;
      if (v.verdict === "verified") sections.push({ category: "supported_finding", text: `${line} This disparity is supported by the evidence (Holm-adjusted p ${fmt(rc.adjustedP)}). It does not show why it occurred.`, evidenceRefs: ["ev:verification", `ev:discovery_audit:${h.attribute}`] });
      else if (v.verdict === "descriptive_only") sections.push({ category: "observed_disparity", text: `${line} The gap is observed, but the statistical evidence is not sufficient to treat it as established.`, evidenceRefs: ["ev:verification"] });
      if (v.verdict === "verified") sections.push({ category: "human_question", text: `Which job-related criteria, knock-out questions or score thresholds at the "${h.stage.replace(/_/g, " ")}" stage could explain the ${h.group} vs ${h.reference} difference?`, evidenceRefs: ["ev:verification"] });
    }
    for (const e of exps.filter((x) => x.reacts))
      sections.push({ category: "experimental_sensitivity", text: `On the mock engine, changing only "${e.label}" moved scores by ${fmt(e.meanDelta, 2)} points on average across ${e.seeds.length} repeated runs (range ${fmt(e.minDelta, 2)} to ${fmt(e.maxDelta, 2)}) and flipped ${(e.flipRate * 100).toFixed(1)}% of decisions.`, evidenceRefs: ["ev:experiments"] });
    if (exps.some((e) => e.cue === "employmentGap" && e.reacts))
      sections.push({ category: "mechanism_hypothesis", text: "Hypothesis, not a finding: sensitivity to career gaps could disadvantage groups more likely to have caring responsibilities. The observational data cannot confirm this mechanism.", evidenceRefs: ["ev:experiments"] });
    for (const t of mit?.trials ?? [])
      sections.push({ category: "experimental_sensitivity", text: `Masking (${t.maskedFields.join(", ")}) changed mean sensitivity from ${fmt(t.beforeMeanDelta, 2)} to ${fmt(t.afterMeanDelta, 2)} on the mock engine.`, evidenceRefs: ["ev:mitigation"] });
    sections.push({ category: "limitation", text: "No feature-level explanation of a proprietary ATS model is offered: DeepTrace has no access to it. Experimental results describe the mock engine only.", evidenceRefs: [] });
    return { findings: { sections }, evidence: { "ev:explanation": { sections } }, limitations: [], usage: { toolCalls: 1 } };
  },
};

/* 8 — Audit Reporting: assembles verified records only */
const reporting: AgentDefinition = {
  type: "reporting",
  name: "Audit Reporting Agent",
  version: "1.0.0",
  kind: "deterministic",
  purpose: "Assembles the evidence package from verified, structured records. It computes no new numbers.",
  async execute({ task, run, broker }) {
    const ev = broker.evidenceView("reporting", task.organisationId);
    const ver = ev["ev:verification"] as z.infer<typeof VerificationSchema> | undefined;
    const disc = ev["ev:discovery"] as z.infer<typeof DiscoverySchema> | undefined;
    const dq = ev["ev:data_quality"] as z.infer<typeof DataQualitySchema> | undefined;
    const exps = (ev["ev:experiments"] as z.infer<typeof ExperimentsSchema> | undefined)?.experiments ?? [];
    const mit = ev["ev:mitigation"] as z.infer<typeof MitigationSchema> | undefined;
    const expl = ev["ev:explanation"] as z.infer<typeof ExplanationSchema> | undefined;
    const verified = (ver?.verdicts ?? []).filter((v) => v.verdict === "verified");
    const pkg = {
      title: `Multi-agent fairness audit — ${run.request.jobRef} · ${run.request.stage.replace(/_/g, " ")}`,
      executiveSummary: [
        `${verified.length} disparity finding(s) verified by independent recomputation; ${(ver?.verdicts ?? []).filter((v) => v.verdict === "descriptive_only").length} observed but not statistically established; ${(ver?.verdicts ?? []).filter((v) => v.verdict === "rejected").length} rejected.`,
        `${exps.filter((e) => e.reacts).length} of ${exps.length} controlled cues changed mock-engine scores.`,
        `${run.conflicts.length} agent conflict(s) recorded and resolved by precedence rules.`,
        "No determination of unlawful discrimination is made.",
      ],
      scope: { objective: run.request.objective, jobRef: run.request.jobRef, stage: run.request.stage, attributes: run.request.attributes },
      dataset: { datasetHash: run.datasetHash, scopedRecords: dq?.scopedRecords ?? 0, provenance: dq?.provenance ?? [], checks: dq?.checks ?? [] },
      verifiedResults: (ver?.verdicts ?? []).map((v) => ({ ...v, hypothesis: disc?.hypotheses.find((h) => h.id === v.hypothesisId) ?? null })),
      experiments: exps,
      mitigation: mit?.trials ?? [],
      findings: expl?.sections ?? [],
      conflicts: run.conflicts,
      approvals: run.approvals,
      limitations: [
        ...(ver?.warnings ?? []),
        "Observational data: a disparity does not establish its cause.",
        "Counterfactual and mitigation results describe DeepTrace's mock engine, not any vendor system.",
      ],
      appendix: {
        workflowId: run.id,
        tasks: run.tasks.map((t) => ({ taskId: t.taskId, agent: t.agent, operation: t.operation, status: t.status, attempts: t.attempts, agentVersion: t.result?.agentVersion ?? null })),
        transitions: run.transitions,
      },
    };
    return { findings: pkg, evidence: { "ev:report": pkg }, limitations: [], usage: { toolCalls: 1 } };
  },
};

export const AGENTS: Record<AgentType, AgentDefinition> = {
  governance,
  data_integrity: dataIntegrity,
  bias_discovery: biasDiscovery,
  counterfactual,
  statistical_verification: verification,
  mitigation,
  explainability,
  reporting,
};

/** Primary attribute audit (for linking into the Audit Lab). */
export function primaryAudit(run: Readonly<WorkflowRun>): AuditResult | null {
  return (run.evidence[`ev:discovery_audit:${run.request.attributes[0]}`] as AuditResult | undefined) ?? null;
}

export { PolicyDecisionSchema, ReportPackageSchema };
