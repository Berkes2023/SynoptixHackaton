import type { AuditResult, DraftFinding, ScreeningRecord } from "./fairness/types";
import type { Mapping } from "./ingest/mapping";
import type { ValidationIssue } from "./ingest/validate";
import type { WorkflowRun } from "./agents/contracts";

/** Workspace types and pure helpers, shared by the browser store and the server. */
export type Role = "Admin" | "Auditor" | "Reviewer" | "Read-only";

export const USERS: { name: string; role: Role }[] = [
  { name: "Alex Morgan", role: "Admin" },
  { name: "Sam Patel", role: "Auditor" },
  { name: "Jordan Lee", role: "Reviewer" },
  { name: "Casey Kim", role: "Read-only" },
];

export const PERMISSIONS = {
  importData: ["Admin", "Auditor"],
  runAudit: ["Admin", "Auditor"],
  openInvestigation: ["Admin", "Auditor", "Reviewer"],
  resolveInvestigation: ["Admin", "Reviewer"],
  generateReport: ["Admin", "Auditor"],
  viewRawSensitive: ["Admin"],
  managePolicies: ["Admin"],
  deleteData: ["Admin"],
} satisfies Record<string, Role[]>;
export type Permission = keyof typeof PERMISSIONS;

export interface ImportBatch {
  id: string;
  fileName: string;
  fileHash: string;
  createdAt: string;
  createdBy: string;
  mapping: Mapping;
  totalRows: number;
  importedRows: number;
  excludedRows: number;
  skippedExisting: number;
  issues: ValidationIssue[];
  droppedColumns: string[];
  sourceSystems: string[];
  dataType: "synthetic" | "customer";
}

export interface AuditRun {
  id: string;
  createdAt: string;
  createdBy: string;
  jobTitle: string;
  datasetHash: string;
  importIds: string[];
  result: AuditResult;
}

export type FindingStatus = "open" | "investigating" | "resolved" | "inconclusive";
export interface Finding extends DraftFinding {
  id: string;
  auditId: string;
  status: FindingStatus;
  createdAt: string;
}

export type Resolution = "" | "explained_by_job_related_factors" | "remediation_required" | "data_quality_issue" | "no_action_required";
export type InvestigationStatus = "open" | "under_review" | "more_evidence_required" | "resolved" | "inconclusive";
export const INVESTIGATION_STATUS_LABEL: Record<InvestigationStatus, string> = {
  open: "Open",
  under_review: "Under review",
  more_evidence_required: "More evidence required",
  resolved: "Resolved",
  inconclusive: "Inconclusive",
};
export interface EvidenceRef {
  id: string;
  label: string;
  /** A document reference or https link. Files are not uploaded in the demo. */
  reference: string;
  addedBy: string;
  at: string;
}
export interface Investigation {
  id: string;
  findingId: string;
  owner: string;
  status: InvestigationStatus;
  resolution: Resolution;
  rationale: string;
  evidence: EvidenceRef[];
  notes: { author: string; text: string; at: string }[];
  closedBy?: string;
  closedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ExperimentRecord {
  id: string;
  at: string;
  by: string;
  cue: string;
  source: string;
  pairs: number;
  seed: number;
  meanDelta: number;
  flips: number;
  signTestP: number;
}

export interface Report {
  id: string;
  auditId: string;
  generatedAt: string;
  generatedBy: string;
  checksum: string;
  payload: Record<string, unknown>;
}

export interface AuditEvent {
  id: string;
  at: string;
  actor: string;
  action: string;
  resource: string;
  details?: string;
}

export interface Settings {
  minimumGroupSize: number;
  confidenceLevel: number;
  impactThreshold: number;
  alpha: number;
  authorisedAttributes: string[];
}

export interface State {
  schemaVersion: 1;
  organisation: { id: string; name: string };
  role: Role;
  records: ScreeningRecord[];
  imports: ImportBatch[];
  audits: AuditRun[];
  findings: Finding[];
  investigations: Investigation[];
  reports: Report[];
  events: AuditEvent[];
  experiments: ExperimentRecord[];
  /** Multi-agent audit workflows (persisted after every transition). */
  workflows: WorkflowRun[];
  onboardingDismissed: boolean;
  settings: Settings;
}

/** Bring workspaces saved by earlier versions up to the current shape. */
export function migrateState(raw: Partial<State>): State {
  const base = initialState();
  const s = { ...base, ...raw } as State;
  s.experiments = raw.experiments ?? [];
  s.workflows = raw.workflows ?? [];
  // The synthetic audit group is a test-only category with no real personal data behind it.
  if (!s.settings.authorisedAttributes.includes("synthetic_group")) s.settings = { ...s.settings, authorisedAttributes: [...s.settings.authorisedAttributes, "synthetic_group"] };
  s.onboardingDismissed = raw.onboardingDismissed ?? false;
  s.investigations = (raw.investigations ?? []).map((i) => ({
    ...i,
    status: ((i.status as string) === "in_review" ? "under_review" : i.status) as InvestigationStatus,
    rationale: i.rationale ?? "",
    evidence: i.evidence ?? [],
  }));
  return s;
}

export const initialState = (): State => ({
  schemaVersion: 1,
  organisation: { id: "org_northwind_demo", name: "Northwind Demo Ltd (fictional)" },
  role: "Auditor",
  records: [],
  imports: [],
  audits: [],
  findings: [],
  investigations: [],
  reports: [],
  events: [],
  experiments: [],
  workflows: [],
  onboardingDismissed: false,
  settings: { minimumGroupSize: 20, confidenceLevel: 0.95, impactThreshold: 0.8, alpha: 0.05, authorisedAttributes: ["gender", "age_band", "nationality", "synthetic_group"] },
});

export const newId = (prefix: string) => `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
