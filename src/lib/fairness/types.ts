/** DeepTrace standard screening-record schema (one row per application per stage). */
export interface ScreeningRecord {
  applicationId: string;
  candidateRef: string;
  jobRef: string;
  jobTitle: string;
  department: string | null;
  appliedAt: string | null;
  stage: string;
  score: number | null;
  grade: string | null;
  decision: string | null;
  decisionAt: string;
  sourceSystem: string;
  /** Version of the ATS scoring model that produced the score, when exported. */
  scoringVersion?: string | null;
  /** Self-reported audit categories only. Never inferred. Missing stays null. */
  sensitive: Record<string, string | null>;
  importId?: string;
}

export type Severity = "high" | "medium" | "low" | "info";

export type MetricName = "selection_rate" | "selection_rate_ratio" | "score_distribution";

export interface AuditConfig {
  jobRef: string;
  stage: string;
  analysisType: "observational";
  groupingAttribute: string;
  metrics: MetricName[];
  confidenceLevel: number;
  minimumGroupSize: number;
  /** Adverse-impact screening heuristic (commonly 0.8). Not a legal test. */
  impactThreshold: number;
  /** Family-wise significance level after Holm correction. */
  alpha: number;
}

export interface Interval {
  lower: number;
  upper: number;
}

export interface ScoreSummary {
  n: number;
  mean: number;
  sd: number;
  median: number;
  q1: number;
  q3: number;
}

export interface GroupMetric {
  group: string;
  suppressed: boolean;
  n: number | null;
  selected: number | null;
  selectionRate: number | null;
  ci: Interval | null;
  score: ScoreSummary | null;
  histogram: number[] | null;
}

export interface SelectionComparison {
  group: string;
  reference: string;
  ratio: number | null;
  ratioCi: Interval | null;
  rateDifference: number;
  test: "fisher_exact_two_sided";
  pValue: number;
  adjustedP: number;
  belowThreshold: boolean;
}

export interface ScoreComparison {
  group: string;
  reference: string;
  meanDifference: number;
  cohensD: number | null;
  probabilityOfSuperiority: number;
  test: "mann_whitney_u";
  pValue: number;
  adjustedP: number;
}

export type FindingCategory = "selection_disparity" | "score_disparity" | "data_quality" | "suppression";

/** Plain-English account of a finding for non-technical reviewers. */
export interface FindingExplanation {
  measured: string;
  dataUsed: string;
  groupsCompared: string;
  trigger: string;
  cannotConclude: string[];
  nextSteps: string[];
}

export interface DraftFinding {
  key: string;
  severity: Severity;
  category: FindingCategory;
  title: string;
  summary: string;
  evidence: string[];
  limitations: string[];
  recommendedActions: string[];
  /** Optional only for findings stored by earlier versions. */
  explanation?: FindingExplanation;
}

export type AuditFlag = "investigation_recommended" | "no_flag" | "insufficient_data";

export interface AuditResult {
  methodologyVersion: string;
  engineVersion: string;
  config: AuditConfig;
  sample: {
    scopedRecords: number;
    analysed: number;
    missingAttribute: number;
    missingAttributeRate: number;
    missingDecision: number;
    missingScore: number;
  };
  groups: GroupMetric[];
  histogramEdges: number[] | null;
  referenceGroup: string | null;
  comparisons: SelectionComparison[];
  scoreComparisons: ScoreComparison[];
  findings: DraftFinding[];
  limitations: string[];
  flag: AuditFlag;
  conclusion: string;
}
