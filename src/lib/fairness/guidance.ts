import type { MetricName, ScreeningRecord } from "./types";

/** Plain-English explanation of each audit setting, shown under its control. */
export const SETTING_HELP = {
  job: "Which vacancy to audit. Each job is analysed on its own, because different roles legitimately attract different applicant pools.",
  stage: "Which decision point to examine, e.g. the AI's initial screening or a later assessment. Disparities can appear at one stage and not another, so audit each separately.",
  category:
    "The self-reported characteristic to compare groups by. Only categories an Admin has authorised are available, and DeepTrace never infers them from names or CVs. Nationality is not citizenship, ethnicity or right to work.",
  analysis: "Observational: it measures whether outcomes differ between groups in the recorded data. It cannot prove why, and it is not a legal finding of discrimination.",
  confidence:
    "How wide the uncertainty ranges are. 95% means that if this process were repeated many times, about 95% of such ranges would contain the true value. Higher gives wider, more cautious ranges. It does not change the rates, the ratio, the p-value or the flag.",
  minGroup:
    "Groups smaller than this are hidden (suppressed). Very small groups give unstable percentages and can make individual applicants identifiable. 20 is a common minimum; go lower only with care.",
  metrics: {
    selection_rate: "Share of each group that advanced, with Wilson confidence ranges, plus Fisher's exact test of whether the gap is bigger than chance.",
    selection_rate_ratio: "Each group's selection rate divided by the highest group's. Below 0.8 (the 'four-fifths' rule of thumb) is a signal to investigate, not proof of bias.",
    score_distribution: "Compares the AI's scores between groups (Mann–Whitney test, effect size). Needs scores in the data.",
  } satisfies Record<MetricName, string>,
} as const;

export interface Guidance {
  level: "warning" | "info";
  setting: "confidence" | "minGroup" | "category" | "metrics" | "stage";
  message: string;
}

export interface GuidanceInput {
  records: ScreeningRecord[];
  jobRef: string;
  stage: string;
  attribute: string;
  confidence: number;
  alpha: number;
  minGroup: number;
  metrics: MetricName[];
}

const pct = (x: number) => `${Math.round(x * 100)}%`;
const missing = (v: string | null | undefined) => v == null || v.trim() === "";

/** The confidence level that matches a significance level: 1 − α. */
export const matchingConfidence = (alpha: number) => Math.round((1 - alpha) * 1000) / 1000;

/** Confidence ranges and the significance test should be judged at the same strictness. */
export function confidenceMismatch(confidence: number, alpha: number): string | null {
  const matching = matchingConfidence(alpha);
  if (Math.abs(confidence - matching) < 1e-9) return null;
  const looser = confidence < matching;
  return `Ranges use ${pct(confidence)} confidence but significance is judged at α = ${alpha} (equivalent to ${pct(matching)}). ${
    looser
      ? "The ranges are narrower than the test, so a range can exclude 'no difference' while the test does not flag."
      : "A range can include 'no difference' (ratio 1.0) while the test still flags the gap."
  } Choose ${pct(matching)} to keep them consistent, or ask an Admin to change α in Settings.`;
}

/** Live warnings for an audit configuration, computed from the records that would be analysed. */
export function auditGuidance(input: GuidanceInput): Guidance[] {
  const out: Guidance[] = [];
  const mismatch = confidenceMismatch(input.confidence, input.alpha);
  if (mismatch) out.push({ level: "warning", setting: "confidence", message: mismatch });

  const scoped = input.records.filter((r) => r.jobRef === input.jobRef && r.stage === input.stage);
  if (scoped.length === 0) return out;

  const counts = new Map<string, number>();
  let missingCount = 0;
  for (const r of scoped) {
    const v = r.sensitive[input.attribute];
    if (missing(v)) missingCount++;
    else counts.set(v!, (counts.get(v!) ?? 0) + 1);
  }

  const missingShare = missingCount / scoped.length;
  if (missingShare >= 0.2)
    out.push({
      level: "warning",
      setting: "category",
      message: `${pct(missingShare)} of applicants at this stage did not report this category. Results describe only the ${scoped.length - missingCount} who did, and may not represent everyone.`,
    });

  if (input.minGroup < 10)
    out.push({ level: "warning", setting: "minGroup", message: `A minimum of ${input.minGroup} can expose individuals in small groups and gives very unstable percentages. Use at least 10, ideally 20.` });

  const suppressed = [...counts].filter(([, n]) => n < input.minGroup);
  if (suppressed.length)
    out.push({
      level: "info",
      setting: "minGroup",
      message: `${suppressed.map(([g, n]) => `${g} (${n})`).join(", ")} ${suppressed.length === 1 ? "is" : "are"} below the minimum of ${input.minGroup} and will be hidden from the comparison.`,
    });

  const reportable = [...counts].filter(([, n]) => n >= input.minGroup);
  if (reportable.length < 2)
    out.push({ level: "warning", setting: "minGroup", message: "Fewer than two groups meet the minimum size, so no comparison can be made with these settings." });
  else if (reportable.some(([, n]) => n < 50))
    out.push({
      level: "info",
      setting: "stage",
      message: "At least one group has fewer than 50 applicants. Expect wide ranges: a real gap may not reach significance, so a 'no flag' result is weak evidence of fairness.",
    });

  if (!input.metrics.includes("selection_rate_ratio"))
    out.push({ level: "info", setting: "metrics", message: "Without the adverse impact ratio, the four-fifths check is not run and cannot trigger a flag." });

  if (input.metrics.includes("score_distribution") && !scoped.some((r) => r.score != null))
    out.push({ level: "warning", setting: "metrics", message: "No AI scores were recorded at this stage, so the score distribution analysis will be empty." });

  return out;
}
