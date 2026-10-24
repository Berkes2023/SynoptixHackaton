import {
  cohensD,
  fisherExactTwoSided,
  holmAdjust,
  mannWhitneyU,
  mean,
  ratioInterval,
  summarise,
  wilsonInterval,
} from "./stats";
import type {
  AuditConfig,
  AuditFlag,
  AuditResult,
  DraftFinding,
  FindingExplanation,
  GroupMetric,
  ScoreComparison,
  ScreeningRecord,
  SelectionComparison,
} from "./types";

export const METHODOLOGY_VERSION = "dt-fairness-1.0.0";
export const ENGINE_VERSION = "0.1.0";

/** Audit categories the platform supports. Each organisation must additionally authorise them. */
export const SUPPORTED_AUDIT_ATTRIBUTES = ["gender", "age_band", "synthetic_group"] as const;

const POSITIVE_DECISIONS = new Set(["advance", "advanced", "shortlist", "shortlisted", "selected", "progress", "progressed", "pass", "passed"]);
const NEGATIVE_DECISIONS = new Set(["reject", "rejected", "decline", "declined", "not selected", "not_selected", "fail", "failed"]);
const MISSING_VALUES = new Set(["", "not disclosed", "prefer not to say", "unknown", "n/a", "na", "null", "undisclosed", "not provided"]);

export function normaliseDecision(decision: string | null): "selected" | "not_selected" | null {
  if (decision == null) return null;
  const d = decision.trim().toLowerCase();
  if (POSITIVE_DECISIONS.has(d)) return "selected";
  if (NEGATIVE_DECISIONS.has(d)) return "not_selected";
  return null;
}

/** Missing or withheld demographic values are never treated as a group. */
export function isMissingAttribute(value: string | null | undefined): boolean {
  return value == null || MISSING_VALUES.has(value.trim().toLowerCase());
}

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const fmtP = (p: number) => (p < 0.001 ? "< 0.001" : p.toFixed(3));
const fmtCi = (lo: number, hi: number, digits = 3) => `[${lo.toFixed(digits)}, ${hi.toFixed(digits)}]`;

const OBSERVATIONAL_LIMITATIONS = [
  "Observational data: a measured disparity does not establish why it occurred.",
  "Legitimate, job-related criteria (e.g. required qualifications) may explain some or all of the difference and must be examined.",
  "The adverse impact ratio threshold is a screening heuristic, not a legal test, and does not determine UK or other legal compliance.",
];

/**
 * Data minimisation: keep only records in scope and only the one sensitive
 * attribute being analysed. This is exactly what the client sends to the API.
 */
export function minimiseForAudit(records: ScreeningRecord[], config: Pick<AuditConfig, "jobRef" | "stage" | "groupingAttribute">): ScreeningRecord[] {
  const attr = config.groupingAttribute;
  return records
    .filter((r) => r.jobRef === config.jobRef && r.stage === config.stage)
    .map(({ importId: _importId, ...r }) => ({ ...r, sensitive: { [attr]: r.sensitive[attr] ?? null } }));
}

/**
 * Deterministic observational fairness audit. Pure function: the same records
 * and configuration always produce an identical result.
 */
export function runAudit(records: ScreeningRecord[], config: AuditConfig): AuditResult {
  const attr = config.groupingAttribute;
  const wantSelection = config.metrics.includes("selection_rate") || config.metrics.includes("selection_rate_ratio");
  const wantRatio = config.metrics.includes("selection_rate_ratio");
  const wantScores = config.metrics.includes("score_distribution");

  const scoped = records
    .filter((r) => r.jobRef === config.jobRef && r.stage === config.stage)
    .sort((a, b) => a.applicationId.localeCompare(b.applicationId));

  let missingAttribute = 0;
  let missingDecision = 0;
  let missingScore = 0;
  const byGroup = new Map<string, { selected: number; total: number; scores: number[] }>();

  for (const r of scoped) {
    if (r.score == null) missingScore++;
    const value = r.sensitive[attr];
    if (isMissingAttribute(value)) {
      missingAttribute++;
      continue;
    }
    const decision = normaliseDecision(r.decision);
    if (decision == null) {
      missingDecision++;
      continue;
    }
    const key = value!.trim();
    const bucket = byGroup.get(key) ?? { selected: 0, total: 0, scores: [] };
    bucket.total++;
    if (decision === "selected") bucket.selected++;
    if (r.score != null) bucket.scores.push(r.score);
    byGroup.set(key, bucket);
  }

  const groupNames = [...byGroup.keys()].sort((a, b) => a.localeCompare(b));
  const analysed = groupNames.reduce((s, g) => s + byGroup.get(g)!.total, 0);

  const allScores = groupNames.flatMap((g) => byGroup.get(g)!.scores);
  let histogramEdges: number[] | null = null;
  if (wantScores && allScores.length > 0) {
    const lo = Math.floor(Math.min(...allScores) / 10) * 10;
    const hi = Math.max(lo + 10, Math.ceil(Math.max(...allScores) / 10) * 10);
    const step = (hi - lo) / Math.max(1, Math.round((hi - lo) / 10));
    histogramEdges = [];
    for (let e = lo; e <= hi + 1e-9; e += step) histogramEdges.push(Math.round(e * 100) / 100);
  }

  const groups: GroupMetric[] = groupNames.map((group) => {
    const g = byGroup.get(group)!;
    const suppressed = g.total < config.minimumGroupSize;
    if (suppressed) {
      return { group, suppressed, n: null, selected: null, selectionRate: null, ci: null, score: null, histogram: null };
    }
    let histogram: number[] | null = null;
    if (histogramEdges && g.scores.length > 0) {
      histogram = new Array(histogramEdges.length - 1).fill(0);
      for (const s of g.scores) {
        let idx = histogramEdges.findIndex((e, i) => i < histogramEdges!.length - 1 && s >= e && s < histogramEdges![i + 1]);
        if (idx === -1) idx = histogram.length - 1;
        histogram[idx]++;
      }
    }
    return {
      group,
      suppressed,
      n: g.total,
      selected: g.selected,
      selectionRate: g.selected / g.total,
      ci: wilsonInterval(g.selected, g.total, config.confidenceLevel),
      score: wantScores && g.scores.length >= 2 ? summarise(g.scores) : null,
      histogram,
    };
  });

  const eligible = groups.filter((g) => !g.suppressed);
  // Reference group: highest selection rate (ties broken alphabetically for determinism).
  const reference =
    eligible.length >= 2
      ? [...eligible].sort((a, b) => b.selectionRate! - a.selectionRate! || a.group.localeCompare(b.group))[0]
      : null;

  const comparisons: SelectionComparison[] = [];
  const scoreComparisons: ScoreComparison[] = [];
  if (reference) {
    for (const g of eligible) {
      if (g.group === reference.group) continue;
      if (wantSelection) {
        comparisons.push({
          group: g.group,
          reference: reference.group,
          ratio: reference.selectionRate! > 0 ? g.selectionRate! / reference.selectionRate! : null,
          ratioCi: ratioInterval(g.selected!, g.n!, reference.selected!, reference.n!, config.confidenceLevel),
          rateDifference: g.selectionRate! - reference.selectionRate!,
          test: "fisher_exact_two_sided",
          pValue: fisherExactTwoSided(g.selected!, g.n! - g.selected!, reference.selected!, reference.n! - reference.selected!),
          adjustedP: NaN,
          belowThreshold: false,
        });
      }
      if (wantScores) {
        const xs = byGroup.get(g.group)!.scores;
        const ys = byGroup.get(reference.group)!.scores;
        if (xs.length >= 2 && ys.length >= 2) {
          const mw = mannWhitneyU(xs, ys);
          scoreComparisons.push({
            group: g.group,
            reference: reference.group,
            meanDifference: mean(xs) - mean(ys),
            cohensD: cohensD(xs, ys),
            probabilityOfSuperiority: mw.probabilityOfSuperiority,
            test: "mann_whitney_u",
            pValue: mw.pValue,
            adjustedP: NaN,
          });
        }
      }
    }
  }

  // Holm correction across every hypothesis test in this audit.
  const adjusted = holmAdjust([...comparisons.map((c) => c.pValue), ...scoreComparisons.map((c) => c.pValue)]);
  comparisons.forEach((c, i) => {
    c.adjustedP = adjusted[i];
    c.belowThreshold = wantRatio && c.ratio != null && c.ratio < config.impactThreshold;
  });
  scoreComparisons.forEach((c, i) => (c.adjustedP = adjusted[comparisons.length + i]));

  const missingAttributeRate = scoped.length > 0 ? missingAttribute / scoped.length : 0;
  const findings = buildFindings({
    config,
    groups,
    reference,
    comparisons,
    scoreComparisons,
    scopedCount: scoped.length,
    missingAttribute,
    missingAttributeRate,
    missingScore,
  });

  const disparity = findings.some((f) => (f.category === "selection_disparity" || f.category === "score_disparity") && f.severity !== "info");
  const flag: AuditFlag = disparity ? "investigation_recommended" : reference == null ? "insufficient_data" : "no_flag";
  const conclusion =
    flag === "investigation_recommended"
      ? "An observed disparity requires further human review. No determination of unlawful discrimination is made."
      : flag === "insufficient_data"
        ? "There is not enough reportable data to compare groups for this stage. No conclusion about fairness can be drawn."
        : "No disparity met DeepTrace's flagging rules for this configuration. This does not certify the process as fair; no determination about discrimination is made.";

  const limitations = [
    ...OBSERVATIONAL_LIMITATIONS,
    `Groups with fewer than ${config.minimumGroupSize} analysed applications are suppressed and excluded from comparisons.`,
    `${missingAttribute} of ${scoped.length} records (${pct(missingAttributeRate)}) lack a self-reported value for "${attr}"; they are excluded, not imputed.`,
    "Demographic values are self-reported. DeepTrace never infers protected characteristics from names, photographs or CV text.",
    `Analysis is limited to job ${config.jobRef}, stage "${config.stage}". Results must not be generalised to other roles or stages.`,
  ];

  return {
    methodologyVersion: METHODOLOGY_VERSION,
    engineVersion: ENGINE_VERSION,
    config,
    sample: { scopedRecords: scoped.length, analysed, missingAttribute, missingAttributeRate, missingDecision, missingScore },
    groups,
    histogramEdges,
    referenceGroup: reference?.group ?? null,
    comparisons,
    scoreComparisons,
    findings,
    limitations,
    flag,
    conclusion,
  };
}

const NOT_PROOF = "Whether unlawful discrimination occurred — that is a legal question statistics cannot settle.";

/** Plain-English explanation attached to every finding. Derived only from computed values. */
function explain(f: DraftFinding, input: Parameters<typeof buildFindings>[0]): FindingExplanation {
  const { config, groups, comparisons, scoreComparisons } = input;
  const attr = config.groupingAttribute.replace(/_/g, " ");
  const scope = `${input.scopedCount} recorded decisions for job ${config.jobRef} at the "${config.stage.replace(/_/g, " ")}" stage, grouped by self-reported ${attr}.`;
  if (f.category === "selection_disparity") {
    const c = comparisons.find((x) => `selection:${x.group}` === f.key)!;
    const g = groups.find((x) => x.group === c.group)!;
    const r = groups.find((x) => x.group === c.reference)!;
    return {
      measured: `The share of applicants in each group who were advanced (the "selection rate"), and how the ${c.group} rate compares with the highest-rate group.`,
      dataUsed: scope,
      groupsCompared: `${c.group} (${g.selected} of ${g.n} advanced) against ${c.reference} (${r.selected} of ${r.n}), the group with the highest selection rate.`,
      trigger: c.belowThreshold
        ? `${c.group} applicants were advanced at ${(c.ratio! * 100).toFixed(0)}% of the ${c.reference} rate, below the ${config.impactThreshold * 100}% screening rule of thumb.${c.adjustedP < config.alpha ? " The gap is also larger than chance would usually produce, even after allowing for the number of tests run." : " However, after allowing for the number of tests run, a gap this size could plausibly be chance."}`
        : `The gap is larger than chance would usually produce (adjusted p = ${fmtP(c.adjustedP)}), although the ratio is above the rule of thumb.`,
      cannotConclude: [
        "Why the difference exists — job-related requirements, applicant pools or the screening configuration could all contribute.",
        NOT_PROOF,
        "Anything about other jobs, stages or time periods.",
      ],
      nextSteps: f.recommendedActions,
    };
  }
  if (f.category === "score_disparity") {
    const s = scoreComparisons.find((x) => `score:${x.group}` === f.key)!;
    return {
      measured: "The ATS scores recorded for each group, compared as whole distributions rather than just averages.",
      dataUsed: `${scope} Records without a score are excluded.`,
      groupsCompared: `${s.group} against ${s.reference}.`,
      trigger: `${s.group} scores were ${Math.abs(s.meanDifference).toFixed(1)} points ${s.meanDifference < 0 ? "lower" : "higher"} on average, and the distributions differ by more than chance would usually explain.`,
      cannotConclude: ["Whether the scoring model treats otherwise-equal candidates differently — that needs a controlled counterfactual test.", NOT_PROOF],
      nextSteps: f.recommendedActions,
    };
  }
  if (f.key === "data:missing-attribute") {
    return {
      measured: `How many applicants did not provide a self-reported ${attr}.`,
      dataUsed: scope,
      groupsCompared: "Not applicable — this is a data-coverage check.",
      trigger: `${(input.missingAttributeRate * 100).toFixed(1)}% of records have no value, above DeepTrace's 5% coverage threshold.`,
      cannotConclude: ["How the missing applicants would have been grouped — DeepTrace never guesses or infers.", "Whether group comparisons for this stage are representative."],
      nextSteps: f.recommendedActions,
    };
  }
  if (f.key === "data:missing-score") {
    return {
      measured: "How many decisions were recorded without an ATS score.",
      dataUsed: scope,
      groupsCompared: "Not applicable — this is a data-coverage check.",
      trigger: `${input.missingScore} records lack a score.`,
      cannotConclude: ["Whether the missing scores would change the score analysis."],
      nextSteps: f.recommendedActions,
    };
  }
  return {
    measured: "Whether each group is large enough to report safely.",
    dataUsed: scope,
    groupsCompared: groups.filter((g) => g.suppressed).map((g) => g.group).join(", ") + " (suppressed).",
    trigger: `Fewer than ${config.minimumGroupSize} analysed applications in the group(s) listed.`,
    cannotConclude: ["Anything about the suppressed groups' outcomes in this audit."],
    nextSteps: f.recommendedActions,
  };
}

function buildFindings(input: {
  config: AuditConfig;
  groups: GroupMetric[];
  reference: GroupMetric | null;
  comparisons: SelectionComparison[];
  scoreComparisons: ScoreComparison[];
  scopedCount: number;
  missingAttribute: number;
  missingAttributeRate: number;
  missingScore: number;
}): DraftFinding[] {
  const { config, groups, reference, comparisons, scoreComparisons } = input;
  const findings: DraftFinding[] = [];
  const conf = `${Math.round(config.confidenceLevel * 100)}%`;

  for (const c of comparisons) {
    const g = groups.find((x) => x.group === c.group)!;
    const r = groups.find((x) => x.group === c.reference)!;
    const significant = c.adjustedP < config.alpha;
    if (!c.belowThreshold && !significant) continue;
    const evidence = [
      `${c.group}: ${g.selected} of ${g.n} selected (${pct(g.selectionRate!)}, ${conf} CI ${fmtCi(g.ci!.lower, g.ci!.upper)}).`,
      `${c.reference} (reference): ${r.selected} of ${r.n} selected (${pct(r.selectionRate!)}, ${conf} CI ${fmtCi(r.ci!.lower, r.ci!.upper)}).`,
      c.ratio != null
        ? `Selection-rate ratio ${c.ratio.toFixed(3)}${c.ratioCi ? ` (${conf} CI ${fmtCi(c.ratioCi.lower, c.ratioCi.upper)})` : ""} vs heuristic threshold ${config.impactThreshold}.`
        : "Selection-rate ratio undefined (reference rate is zero).",
      `Fisher exact two-sided p = ${fmtP(c.pValue)}; Holm-adjusted p = ${fmtP(c.adjustedP)} (α = ${config.alpha}).`,
    ];
    const limitations = [...OBSERVATIONAL_LIMITATIONS];
    if (!significant) limitations.push("After multiple-testing correction the difference is not statistically significant; it may reflect sampling variation.");
    if (c.ratioCi && c.ratioCi.upper >= config.impactThreshold)
      limitations.push(`The ratio's confidence interval extends above ${config.impactThreshold}, so the true ratio may not fall below the heuristic.`);
    if (input.missingAttributeRate > 0.05) limitations.push(`${pct(input.missingAttributeRate)} of records lack this attribute, which could bias the comparison.`);

    findings.push({
      key: `selection:${c.group}`,
      severity: c.belowThreshold && significant ? "high" : "medium",
      category: "selection_disparity",
      title: c.belowThreshold ? `Selection-rate disparity: ${c.group} vs ${c.reference}` : `Statistically significant selection difference: ${c.group} vs ${c.reference}`,
      summary: c.belowThreshold
        ? `${c.group} applicants were selected at ${c.ratio!.toFixed(2)}× the rate of ${c.reference} applicants, below the ${config.impactThreshold} screening heuristic.${significant ? " The difference remains significant after multiple-testing correction." : " Statistical evidence is limited after correction."}`
        : `The selection-rate ratio (${c.ratio?.toFixed(2)}) is above the heuristic, but the difference is statistically significant.`,
      evidence,
      limitations,
      recommendedActions: [
        "Review the job-related criteria and ATS configuration applied at this stage.",
        "Check whether score thresholds or knockout questions affect groups differently.",
        "Compare against a later period or additional requisitions before drawing conclusions.",
        "Record the reviewer's assessment and any remediation in an investigation.",
      ],
    });
  }

  for (const s of scoreComparisons) {
    if (s.adjustedP >= config.alpha) continue;
    findings.push({
      key: `score:${s.group}`,
      severity: "medium",
      category: "score_disparity",
      title: `ATS score distribution difference: ${s.group} vs ${s.reference}`,
      summary: `Mean ATS score for ${s.group} differs from ${s.reference} by ${s.meanDifference.toFixed(1)} points.`,
      evidence: [
        `Mean difference ${s.meanDifference.toFixed(2)}${s.cohensD != null ? `; Cohen's d = ${s.cohensD.toFixed(2)}` : ""}.`,
        `Probability a random ${s.group} score exceeds a random ${s.reference} score: ${s.probabilityOfSuperiority.toFixed(3)}.`,
        `Mann–Whitney U p = ${fmtP(s.pValue)}; Holm-adjusted p = ${fmtP(s.adjustedP)}.`,
      ],
      limitations: [
        "Scores reflect the ATS's own scale; differences may stem from differences in applicant pools rather than the scoring model.",
        "Score comparisons are only meaningful within a single requisition and stage.",
        ...OBSERVATIONAL_LIMITATIONS.slice(0, 1),
      ],
      recommendedActions: [
        "Request scoring-model documentation and feature descriptions from the ATS vendor.",
        "Consider an authorised counterfactual test of the scoring system.",
      ],
    });
  }

  if (input.missingAttributeRate > 0.05) {
    findings.push({
      key: "data:missing-attribute",
      severity: input.missingAttributeRate > 0.2 ? "medium" : "low",
      category: "data_quality",
      title: `Missing demographic coverage (${pct(input.missingAttributeRate)})`,
      summary: `${input.missingAttribute} of ${input.scopedCount} records have no self-reported "${config.groupingAttribute}" value. Conclusions for this stage may be unreliable.`,
      evidence: [`${input.missingAttribute} records excluded from group comparisons; missing values are not treated as a group.`],
      limitations: ["Non-response may itself differ between groups and is not observable."],
      recommendedActions: ["Review how and when equal-opportunities data is collected.", "Assess whether non-response is concentrated in particular sources or stages."],
    });
  }

  const suppressed = groups.filter((g) => g.suppressed);
  if (suppressed.length > 0) {
    findings.push({
      key: "suppression",
      severity: reference == null ? "medium" : "info",
      category: reference == null ? "data_quality" : "suppression",
      title: reference == null ? "Insufficient group sizes for comparison" : `${suppressed.length} group(s) suppressed`,
      summary: `${suppressed.map((g) => g.group).join(", ")} had fewer than ${config.minimumGroupSize} analysed applications. Their figures are withheld to reduce re-identification risk.`,
      evidence: [`Suppression threshold: ${config.minimumGroupSize} (configurable; not a universal privacy guarantee).`],
      limitations: ["Disparities affecting small groups cannot be assessed with this dataset."],
      recommendedActions: ["Aggregate over a longer period (keeping the role and stage fixed) before re-auditing."],
    });
  }

  if (config.metrics.includes("score_distribution") && input.scopedCount > 0 && input.missingScore / input.scopedCount > 0.02) {
    findings.push({
      key: "data:missing-score",
      severity: "low",
      category: "data_quality",
      title: `Missing ATS scores (${input.missingScore} records)`,
      summary: "Some records have a decision but no ATS score; score analysis excludes them.",
      evidence: [`${input.missingScore} of ${input.scopedCount} records lack a score.`],
      limitations: ["If scores are missing non-randomly, score distributions may be biased."],
      recommendedActions: ["Confirm with the ATS administrator why scores are absent."],
    });
  }

  for (const f of findings) f.explanation = explain(f, input);

  const order = { high: 0, medium: 1, low: 2, info: 3 } as const;
  return findings.sort((a, b) => order[a.severity] - order[b.severity] || a.key.localeCompare(b.key));
}
